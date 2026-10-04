"""Ingestion pipeline: parse PDF/DOCX/TXT -> chunk -> metadata."""
from __future__ import annotations

import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

from config import get_settings

settings = get_settings()


@dataclass
class IngestedChunk:
    id: str
    text: str
    file_name: str
    page_number: int | None
    creation_date: str
    chunk_index: int


def _read_pdf(path: Path) -> list[tuple[int, str]]:
    reader = PdfReader(str(path))
    pages: list[tuple[int, str]] = []
    meta_date = ""
    try:
        meta = reader.metadata
        if meta and meta.creation_date:
            meta_date = str(meta.creation_date)
    except Exception:
        meta_date = ""
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            pages.append((i, text))
    if not pages:
        pages = [(1, f"[No extractable text in {path.name}]")]
    return pages


def _read_docx(path: Path) -> list[tuple[int, str]]:
    from docx import Document

    doc = Document(str(path))
    full = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    core = doc.core_properties
    _ = core.created.isoformat() if core.created else ""
    return [(1, full or f"[Empty DOCX {path.name}]")]


def _read_txt(path: Path) -> list[tuple[int, str]]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    return [(1, text)]


def parse_file(path: Path) -> tuple[list[tuple[int, str]], dict]:
    ext = path.suffix.lower()
    stat = path.stat()
    creation_date = datetime.fromtimestamp(stat.st_ctime).isoformat()
    if ext == ".pdf":
        pages = _read_pdf(path)
    elif ext == ".docx":
        pages = _read_docx(path)
    elif ext == ".txt":
        pages = _read_txt(path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
    file_meta = {
        "file_name": path.name,
        "creation_date": creation_date,
        "size_bytes": stat.st_size,
    }
    return pages, file_meta


def chunk_pages(
    pages: list[tuple[int, str]],
    file_meta: dict,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[IngestedChunk]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size or settings.chunk_size,
        chunk_overlap=chunk_overlap or settings.chunk_overlap,
        separators=["\n\n", "\n", " ", ""],
    )
    chunks: list[IngestedChunk] = []
    idx = 0
    for page_no, page_text in pages:
        for piece in splitter.split_text(page_text):
            chunks.append(
                IngestedChunk(
                    id=str(uuid.uuid4()),
                    text=piece,
                    file_name=file_meta["file_name"],
                    page_number=page_no,
                    creation_date=file_meta["creation_date"],
                    chunk_index=idx,
                )
            )
            idx += 1
    return chunks


def ingest_file(saved_path: str) -> tuple[list[dict], dict]:
    """Full pipeline for one saved file. Returns (chunk_dicts, doc_record)."""
    path = Path(saved_path)
    pages, file_meta = parse_file(path)
    chunks = chunk_pages(pages, file_meta)
    doc_record = {
        "id": str(uuid.uuid4()),
        "file_name": file_meta["file_name"],
        "pages": max((p for p, _ in pages), default=1),
        "chunks": len(chunks),
        "size_bytes": file_meta["size_bytes"],
        "creation_date": file_meta["creation_date"],
        "indexed_at": datetime.utcnow().isoformat(),
        "category": _categorize(file_meta["file_name"]),
    }
    return [asdict(c) for c in chunks], doc_record


def _categorize(file_name: str) -> str:
    n = file_name.lower()
    if any(k in n for k in ("finance", "invoice", "budget", "report")):
        return "Finance"
    if any(k in n for k in ("legal", "contract", "policy", "terms")):
        return "Legal"
    if any(k in n for k in ("medical", "health", "clinical")):
        return "Medical"
    if any(k in n for k in ("tech", "manual", "api", "spec", "research")):
        return "Technical"
    return "General"


def ensure_upload_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p
