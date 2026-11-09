from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


def initialize_database() -> None:
    if engine.dialect.name == "postgresql":
        # The vector extension is used by semantic retrieval in the Compose deployment.
        with engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        user_columns = {column["name"] for column in inspect(connection).get_columns("users")}
        if "recovery_code_hash" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN recovery_code_hash VARCHAR(64) NULL"))
        columns = {column["name"] for column in inspect(connection).get_columns("documents")}
        if "owner_id" not in columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN owner_id UUID NULL"))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_documents_owner_id ON documents (owner_id)"
        ))
        connection.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_documents_sha256 ON documents (sha256)"
        ))
    if engine.dialect.name == "postgresql":
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE documents ADD COLUMN IF NOT EXISTS index_status VARCHAR(20) NOT NULL DEFAULT 'pending'"
            ))
            connection.execute(text(
                "ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(768)"
            ))
