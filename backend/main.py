"""DocuMind AI — FastAPI entry point."""
from __future__ import annotations

import shutil
import time
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import get_settings
from services.ingestion import ensure_upload_dir, ingest_file
from services import vector_store as vs
from services.rag_chain import LLMError, generate_answer

settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # Explicit origins only. Never use ["*"] together with
    # allow_credentials=True — browsers reject that combination.
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory analytics (swap for Redis/Postgres in prod)
DOCS: list[dict] = []
QUERY_LOG: list[dict] = []
TOTAL_TOKENS = {"prompt": 0, "completion": 0, "total": 0}
FEEDBACK: list[dict] = []
STARTED_AT = datetime.utcnow()

ALLOWED_EXT = {".pdf", ".docx", ".txt"}


class QueryRequest(BaseModel):
    query: str
    top_k: int | None = 5
    history: list[dict] | None = []


class FeedbackRequest(BaseModel):
    message_id: str
    rating: str  # up | down
    query: str = ""


@app.get("/health")
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "provider": settings.llm_provider,
        "model": settings.llm_model,
        "llm_configured": bool(settings.effective_api_key) or settings.llm_provider == "ollama",
        "chroma_mode": "chromadb" if vs.get_collection() is not None else "bm25-only",
        "docs_indexed": len(DOCS),
        "chunks": vs.collection_count(),
        "uptime_sec": round((datetime.utcnow() - STARTED_AT).total_seconds(), 1),
    }


@app.post("/upload")
async def upload(files: list[UploadFile] = File(...)):
    upload_dir = ensure_upload_dir()
    results = []
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in ALLOWED_EXT:
            results.append({"file_name": f.filename, "status": "rejected", "error": f"Unsupported type {ext}"})
            continue
        dest = upload_dir / f"{int(time.time()*1000)}_{f.filename}"
        with dest.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        try:
            chunks, doc = ingest_file(str(dest))
            added = vs.add_chunks(chunks)
            DOCS.append(doc)
            results.append(
                {"file_name": doc["file_name"], "status": "indexed", "pages": doc["pages"], "chunks": added, "doc_id": doc["id"]}
            )
        except Exception as e:
            results.append({"file_name": f.filename, "status": "error", "error": str(e)})
    return {"results": results, "total_docs": len(DOCS)}


@app.post("/query")
def query(req: QueryRequest):
    if not req.query.strip():
        raise HTTPException(400, "Query must not be empty")
    try:
        out = generate_answer(req.query, history=req.history or [], k=req.top_k or 5)
    except LLMError as e:
        # 502 = our server is fine, the LLM provider call failed (or key missing).
        raise HTTPException(502, str(e))
    QUERY_LOG.append(
        {"ts": datetime.utcnow().isoformat(), "query": req.query, "latency_ms": out["latency_ms"], "tokens": out["tokens"]}
    )
    for k in TOTAL_TOKENS:
        TOTAL_TOKENS[k] += out["tokens"].get(k, 0)
    return out


@app.post("/query/stream")
def query_stream(req: QueryRequest):
    """SSE streaming of the final answer (token-chunked)."""
    try:
        out = generate_answer(req.query, history=req.history or [], k=req.top_k or 5)
    except LLMError as e:
        raise HTTPException(502, str(e))
    QUERY_LOG.append(
        {"ts": datetime.utcnow().isoformat(), "query": req.query, "latency_ms": out["latency_ms"], "tokens": out["tokens"]}
    )

    def gen():
        import json

        text = out["answer"]
        # naive token streaming by words
        buf = ""
        for word in text.split(" "):
            buf += word + " "
            yield f"data: {json.dumps({'delta': word + ' '})}\n\n"
        yield f"data: {json.dumps({'done': True, 'sources': out['sources'], 'latency_ms': out['latency_ms'], 'model': out['model']})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.get("/analytics")
def analytics():
    latencies = [q["latency_ms"] for q in QUERY_LOG] or [0]
    avg_lat = round(sum(latencies) / len(latencies), 1)
    # Daily query frequency (last 14 days)
    days: dict[str, int] = defaultdict(int)
    for i in range(13, -1, -1):
        d = (datetime.utcnow() - timedelta(days=i)).date().isoformat()
        days[d] = 0
    for q in QUERY_LOG:
        try:
            d = datetime.fromisoformat(q["ts"]).date().isoformat()
            if d in days:
                days[d] += 1
        except Exception:
            pass
    cats = Counter(d.get("category", "General") for d in DOCS)
    return {
        "total_documents": len(DOCS),
        "total_chunks": vs.collection_count(),
        "total_queries": len(QUERY_LOG),
        "avg_latency_ms": avg_lat,
        "p95_latency_ms": round(sorted(latencies)[max(0, int(len(latencies) * 0.95) - 1)], 1),
        "tokens": TOTAL_TOKENS,
        "queries_per_day": [{"date": k, "queries": v} for k, v in days.items()],
        "doc_categories": [{"name": k, "value": v} for k, v in cats.items()] or [{"name": "General", "value": 0}],
        "recent_queries": QUERY_LOG[-10:][::-1],
        "documents": DOCS[-20:][::-1],
    }


@app.post("/feedback")
def feedback(req: FeedbackRequest):
    FEEDBACK.append({**req.model_dump(), "ts": datetime.utcnow().isoformat()})
    return {"ok": True, "total": len(FEEDBACK)}


@app.get("/documents")
def list_documents():
    return {"documents": DOCS[::-1], "count": len(DOCS)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
