"""Central configuration for DocuMind AI backend.

Environment is loaded from backend/.env (resolved relative to THIS file,
so the server works no matter which directory you start it from).
Real secrets live only in .env — never in code.
"""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings

_BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    app_name: str = "DocuMind AI"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # LLM credentials — GROQ_API_KEY is the primary key for provider "groq".
    # OPENAI_API_KEY is kept for provider "openai" users.
    groq_api_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://api.groq.com/openai/v1"
    llm_model: str = "openai/gpt-oss-20b"
    embedding_model: str = "text-embedding-3-small"
    llm_provider: str = "groq"  # groq | openai | ollama

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Paths are relative to the backend/ directory (the required CWD).
    chroma_persist_dir: str = "./chroma_db"
    collection_name: str = "documind"

    chunk_size: int = 1000
    chunk_overlap: int = 200
    top_k: int = 5
    upload_dir: str = "./uploads"

    class Config:
        env_file = str(_BACKEND_DIR / ".env")
        extra = "ignore"

    @property
    def effective_api_key(self) -> str:
        """The API key for the active provider (never log this value)."""
        if self.llm_provider == "openai":
            return self.openai_api_key
        return self.groq_api_key or self.openai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()
