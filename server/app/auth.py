import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from .models import Document, User, UserSession

SESSION_COOKIE = "munsodam_session"
SESSION_DAYS = 14
PASSWORD_ITERATIONS = 310_000


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    try:
        scheme, rounds, salt, expected = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_recovery_code() -> str:
    raw = secrets.token_hex(16).upper()
    return "-".join(raw[index:index + 8] for index in range(0, len(raw), 8))


def recovery_code_hash(code: str) -> str:
    normalized = "".join(character for character in code.upper() if character in "0123456789ABCDEF")
    return hashlib.sha256(normalized.encode("ascii")).hexdigest()


def verify_recovery_code(code: str, encoded: str | None) -> bool:
    if not encoded:
        return False
    normalized = "".join(character for character in code.upper() if character in "0123456789ABCDEF")
    return len(normalized) == 32 and hmac.compare_digest(hashlib.sha256(normalized.encode("ascii")).hexdigest(), encoded)


def user_payload(user: User) -> dict:
    return {
        "id": str(user.id), "email": user.email, "display_name": user.display_name,
        "auth_method": "kakao" if user.kakao_id else "email",
    }


def issue_session(response: Response, db: Session, user: User) -> None:
    raw_token = secrets.token_urlsafe(32)
    session_id = hashlib.sha256(raw_token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    db.query(UserSession).filter(UserSession.expires_at <= now).delete(synchronize_session=False)
    expires_at = now + timedelta(days=SESSION_DAYS)
    db.add(UserSession(id=session_id, user_id=user.id, expires_at=expires_at))
    db.commit()
    response.set_cookie(
        SESSION_COOKIE, raw_token, max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True, secure=settings.auth_cookie_secure, samesite="lax", path="/",
    )


def clear_session(response: Response, db: Session, token: str | None) -> None:
    if token:
        session_id = hashlib.sha256(token.encode()).hexdigest()
        db.query(UserSession).filter(UserSession.id == session_id).delete(synchronize_session=False)
        db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, secure=settings.auth_cookie_secure, samesite="lax")


def get_current_user(request: Request, munsodam_session: str | None = Cookie(default=None)) -> User:
    if not munsodam_session or len(munsodam_session) > 128:
        raise HTTPException(401, "로그인이 필요합니다.")
    session_id = hashlib.sha256(munsodam_session.encode()).hexdigest()
    with SessionLocal() as db:
        row = db.execute(
            select(UserSession, User)
            .join(User, User.id == UserSession.user_id)
            .where(UserSession.id == session_id, UserSession.expires_at > datetime.now(timezone.utc))
        ).first()
        if row is None:
            raise HTTPException(401, "로그인 시간이 만료되었습니다. 다시 로그인해 주세요.")
        return row[1]


def claim_legacy_documents(db: Session, user: User) -> None:
    """The first account adopts the existing local library, preserving current files."""
    if db.query(User).count() == 1:
        db.execute(update(Document).where(Document.owner_id.is_(None)).values(owner_id=user.id))


def require_same_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in {
        settings.app_origin, "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5175", "http://127.0.0.1:5175",
    }:
        raise HTTPException(403, "요청 출처를 확인할 수 없습니다.")
