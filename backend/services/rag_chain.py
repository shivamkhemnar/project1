"""RAG chain: hybrid retrieval + Groq / OpenAI / Ollama generation.

There is NO silent mock mode here. If the LLM is misconfigured or the API
call fails, a clear LLMError is raised so the API returns an honest error
instead of a fake-looking answer.
"""
from __future__ import annotations

import time
from config import get_settings
from services import vector_store as vs

settings = get_settings()

SYSTEM_PROMPT = (
    "You are DocuMind AI, an enterprise document intelligence assistant. "
    "Answer ONLY from the provided context. Cite every factual claim as [Page N] "
    "using the page_number metadata. If the context is insufficient, say so. "
    "Format in Markdown with headings, bullets, and code blocks where helpful."
)


class LLMError(RuntimeError):
    """Raised when the language model cannot produce an answer."""


def _build_context(hits: list[dict]) -> str:
    blocks = []
    for i, h in enumerate(hits, 1):
        blocks.append(
            f"[Source {i} | {h.get('file_name')} | Page {h.get('page_number')}]\n{h['text']}"
        )
    return "\n\n".join(blocks)


def _require_api_key() -> str:
    key = settings.effective_api_key
    if not key:
        if settings.llm_provider == "ollama":
            return ""
        raise LLMError(
            "LLM API key is missing. Add GROQ_API_KEY to backend/.env "
            "(get a free key at https://console.groq.com) and restart the server."
        )
    return key


def generate_answer(
    query: str,
    history: list[dict] | None = None,
    k: int | None = None,
) -> dict:
    t0 = time.perf_counter()
    top_k = k or settings.top_k
    hits = vs.hybrid_search(query, k=top_k)

    if not hits:
        return {
            "answer": "I couldn't find relevant context in your indexed documents. "
            "Try uploading more files or rephrasing the query.",
            "sources": [],
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
            "tokens": {"prompt": 0, "completion": 0, "total": 0},
            "model": "no-context",
        }

    api_key = _require_api_key()

    context = _build_context(hits)
    convo = "\n".join(
        f"{m.get('role', 'user')}: {m.get('content', '')}" for m in (history or [])[-6:]
    )
    user_prompt = (
        f"Conversation so far:\n{convo}\n\nContext:\n{context}\n\nQuestion: {query}\n"
        "Answer with Markdown and cite pages like [Page 4]."
    )

    try:
        if settings.llm_provider == "ollama":
            import httpx

            r = httpx.post(
                f"{settings.ollama_base_url}/api/generate",
                json={"model": settings.ollama_model, "prompt": f"{SYSTEM_PROMPT}\n{user_prompt}", "stream": False},
                timeout=60,
            )
            r.raise_for_status()
            text = r.json().get("response", "")
            model = f"ollama/{settings.ollama_model}"
            tokens = {"prompt": len(user_prompt.split()), "completion": len(text.split()), "total": len(user_prompt.split()) + len(text.split())}
        else:
            from openai import OpenAI

            client = OpenAI(api_key=api_key, base_url=(settings.openai_base_url or "").strip() or None)
            resp = client.chat.completions.create(
                model=settings.llm_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_tokens=800,
            )
            text = resp.choices[0].message.content or ""
            usage = resp.usage
            tokens = {
                "prompt": usage.prompt_tokens if usage else 0,
                "completion": usage.completion_tokens if usage else 0,
                "total": usage.total_tokens if usage else 0,
            }
            model = settings.llm_model
    except LLMError:
        raise
    except Exception as e:
        # Never return a fake answer — surface the real failure.
        raise LLMError(
            f"LLM call failed (provider={settings.llm_provider}, model={settings.llm_model}): {e}"
        ) from e

    return {
        "answer": text,
        "sources": [
            {
                "file_name": h.get("file_name"),
                "page_number": h.get("page_number"),
                "excerpt": h.get("excerpt"),
                "score": round(h.get("score", 0), 3),
            }
            for h in hits
        ],
        "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        "tokens": tokens,
        "model": model,
    }
