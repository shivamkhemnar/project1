"""Vector store engine: ChromaDB + OpenAI/HF embeddings with BM25 hybrid."""
from __future__ import annotations

import time
from typing import Any

from rank_bm25 import BM25Okapi

from config import get_settings

settings = get_settings()

_client = None
_collection = None
_chroma_ok: bool | None = None  # None = untested, False = unavailable (BM25-only mode)
_bm25_corpus: list[str] = []
_bm25_meta: list[dict] = []
_bm25 = None


def _get_embeddings():
    if settings.openai_api_key and settings.llm_provider == "openai":
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(
            model=settings.embedding_model, openai_api_key=settings.openai_api_key
        )
    # Local fallback: HuggingFace MiniLM
    from langchain_community.embeddings import HuggingFaceEmbeddings

    return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def get_collection():
    """Return the Chroma collection, or None if Chroma isn't installed.

    Returning None (instead of raising) keeps the API bootable in
    BM25-only mode — hybrid_search() degrades gracefully to keyword search.
    """
    global _client, _collection, _chroma_ok
    if _collection is not None:
        return _collection
    if _chroma_ok is False:
        return None
    try:
        import chromadb
    except ImportError:
        _chroma_ok = False
        return None
    _client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
    _collection = _client.get_or_create_collection(
        name=settings.collection_name,
        metadata={"hnsw:space": "cosine"},
    )
    _chroma_ok = True
    return _collection


def add_chunks(chunks: list[dict]) -> int:
    """Add chunk dicts {id,text,file_name,page_number,...} to Chroma + BM25."""
    global _bm25
    if not chunks:
        return 0
    col = get_collection()
    # Chroma needs unique ids; embeddings computed server-side via EF default.
    # To support OpenAI embeddings explicitly, store vectors when key exists.
    ids = [c["id"] for c in chunks]
    docs = [c["text"] for c in chunks]
    metas = [
        {
            "file_name": c["file_name"],
            "page_number": c.get("page_number") or 0,
            "creation_date": c.get("creation_date", ""),
            "chunk_index": c.get("chunk_index", 0),
        }
        for c in chunks
    ]
    try:
        if col is not None and settings.llm_provider == "openai" and settings.openai_api_key:
            emb = _get_embeddings()
            vectors = emb.embed_documents(docs)
            col.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=vectors)
        elif col is not None:
            col.upsert(ids=ids, documents=docs, metadatas=metas)
        # col is None -> BM25-only mode, corpus updated below
    except Exception:
        # Fallback without explicit vectors (Chroma default EF)
        try:
            if col is not None:
                col.upsert(ids=ids, documents=docs, metadatas=metas)
        except Exception:
            pass

    _bm25_corpus.extend(docs)
    _bm25_meta.extend(metas)
    _bm25 = None  # invalidate
    return len(chunks)


def _get_bm25():
    global _bm25
    if _bm25 is None and _bm25_corpus:
        tokenized = [d.lower().split() for d in _bm25_corpus]
        _bm25 = BM25Okapi(tokenized)
    return _bm25


def hybrid_search(query: str, k: int = 5) -> list[dict[str, Any]]:
    """Combine vector similarity + BM25 keyword scores (weighted RRF-ish)."""
    t0 = time.perf_counter()
    col = get_collection()
    results: list[dict] = []

    # 1) Vector search (skipped in BM25-only mode when Chroma is unavailable)
    vec_hits: list[dict] = []
    try:
        if col is None:
            raise RuntimeError("chroma-unavailable")
        if settings.llm_provider == "openai" and settings.openai_api_key:
            qvec = _get_embeddings().embed_query(query)
            res = col.query(
                query_embeddings=[qvec], n_results=k, include=["documents", "metadatas", "distances"]
            )
        else:
            res = col.query(
                query_texts=[query], n_results=k, include=["documents", "metadatas", "distances"]
            )
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        for doc, meta, dist in zip(docs, metas, dists):
            score = 1.0 / (1.0 + float(dist))
            vec_hits.append({"text": doc, "metadata": meta, "vector_score": score})
    except Exception:
        vec_hits = []

    # 2) BM25 keyword search
    bm25_hits: list[dict] = []
    bm25 = _get_bm25()
    if bm25 is not None:
        scores = bm25.get_scores(query.lower().split())
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)[:k]
        mx = max(scores) if max(scores) > 0 else 1.0
        for idx, s in ranked:
            if s <= 0:
                continue
            bm25_hits.append(
                {
                    "text": _bm25_corpus[idx],
                    "metadata": _bm25_meta[idx],
                    "bm25_score": float(s / mx),
                }
            )

    # 3) Fuse: weighted sum, dedupe by text prefix
    fused: dict[str, dict] = {}
    for h in vec_hits:
        key = h["text"][:120]
        fused[key] = {**h, "score": 0.7 * h.get("vector_score", 0)}
    for h in bm25_hits:
        key = h["text"][:120]
        if key in fused:
            fused[key]["score"] += 0.3 * h.get("bm25_score", 0)
            fused[key]["bm25_score"] = h.get("bm25_score")
        else:
            fused[key] = {**h, "score": 0.3 * h.get("bm25_score", 0)}

    results = sorted(fused.values(), key=lambda x: x["score"], reverse=True)[:k]
    # Attach citation-friendly fields
    for r in results:
        md = r.get("metadata", {})
        r["file_name"] = md.get("file_name", "unknown")
        r["page_number"] = md.get("page_number", 0)
        r["excerpt"] = r["text"][:500]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    for r in results:
        r["latency_ms"] = round(elapsed_ms, 1)
    return results


def collection_count() -> int:
    try:
        return get_collection().count()
    except Exception:
        return 0
