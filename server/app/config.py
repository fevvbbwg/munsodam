import os
from pathlib import Path
from urllib.parse import urlsplit


def local_ollama_url() -> str:
    value = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    parsed = urlsplit(value)
    allowed_hosts = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
    if (
        parsed.scheme not in {"http", "https"}
        or parsed.hostname not in allowed_hosts
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError(
            "OLLAMA_BASE_URL은 로컬 Ollama 주소만 사용할 수 있습니다 "
            "(localhost, 127.0.0.1, ::1, host.docker.internal)."
        )
    return value


class Settings:
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://knowledge:knowledge@localhost:5432/knowledge",
    )
    ollama_base_url = local_ollama_url()
    chat_model = os.getenv("OLLAMA_CHAT_MODEL", "qwen3:4b-instruct")
    embedding_model = os.getenv("OLLAMA_EMBEDDING_MODEL", "embeddinggemma")
    storage_dir = Path(os.getenv("STORAGE_DIR", "./data/uploads"))
    max_upload_bytes = 20 * 1024 * 1024
    chunk_chars = int(os.getenv("CHUNK_CHARS", "1000"))
    chunk_overlap = int(os.getenv("CHUNK_OVERLAP", "150"))
    max_cosine_distance = float(os.getenv("MAX_COSINE_DISTANCE", "0.68"))
    auth_cookie_secure = os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"
    app_origin = os.getenv("APP_ORIGIN", "http://localhost:5173").rstrip("/")
    kakao_client_id = os.getenv("KAKAO_CLIENT_ID", "")
    kakao_client_secret = os.getenv("KAKAO_CLIENT_SECRET", "")
    kakao_redirect_uri = os.getenv("KAKAO_REDIRECT_URI") or f"{app_origin}/api/auth/kakao/callback"
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", "")


settings = Settings()
