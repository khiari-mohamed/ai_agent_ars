from __future__ import annotations

import asyncio
import copy
import os
import uuid
from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

# Settings are validated at import time → set the environment BEFORE importing app.*.
# Tests never touch the dev DB: DB tests need TEST_DATABASE_URL (a database ending in "_test").
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "")
os.environ["DATABASE_URL"] = (
    TEST_DATABASE_URL or "postgresql+asyncpg://postgres:postgres@localhost:5433/ars_agent_test"
)
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-not-for-production-000000")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-key-not-for-production-0000000000")
os.environ["EMBEDDING_PRELOAD"] = "false"

from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.db.base import Base  # noqa: E402
from app.models.db.audit_event import AuditEvent  # noqa: E402, F401
from app.models.db.conversation import Conversation, Message  # noqa: E402, F401
from app.models.db.knowledge_doc import KnowledgeChunk, KnowledgeDoc  # noqa: E402, F401
from app.models.db.ticket import Ticket  # noqa: E402, F401
from app.models.db.user import User  # noqa: E402, F401


async def _reset_schema() -> None:
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


@pytest.fixture(scope="session")
def _schema() -> None:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL non défini (Postgres pgvector requis)")
    if not TEST_DATABASE_URL.rsplit("/", 1)[-1].endswith("_test"):
        pytest.exit("TEST_DATABASE_URL doit pointer vers une base dont le nom finit par _test")
    asyncio.run(_reset_schema())


@pytest_asyncio.fixture
async def db(_schema: None) -> AsyncGenerator[AsyncSession, None]:
    """Each test runs in a transaction that is rolled back (commits become savepoints)."""
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
    async with engine.connect() as conn:
        outer = await conn.begin()
        session = AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        yield session
        await session.close()
        await outer.rollback()
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def memory_sessions(monkeypatch: pytest.MonkeyPatch) -> dict[str, dict[str, Any]]:
    """In-memory replacement of the Redis session store used by the orchestrator."""
    store: dict[str, dict[str, Any]] = {}

    async def get_session(sid: str) -> dict[str, Any] | None:
        return copy.deepcopy(store.get(sid))

    async def set_session(sid: str, data: dict[str, Any], ttl: int | None = None) -> None:
        store[sid] = copy.deepcopy(data)

    async def delete_session(sid: str) -> None:
        store.pop(sid, None)

    @asynccontextmanager
    async def session_lock(sid: str, *args: Any, **kwargs: Any):  # type: ignore[no-untyped-def]
        yield

    target = "app.services.orchestrator"
    monkeypatch.setattr(f"{target}.get_session", get_session)
    monkeypatch.setattr(f"{target}.set_session", set_session)
    monkeypatch.setattr(f"{target}.delete_session", delete_session)
    monkeypatch.setattr(f"{target}.session_lock", session_lock)
    monkeypatch.setattr(f"{target}.extend_session_ttl", AsyncMock())
    return store


@pytest.fixture
def valid_admin_token() -> str:
    from app.core.security import create_access_token

    return create_access_token(subject=str(uuid.uuid4()), role="ADMIN")


@pytest.fixture
def auth_headers(valid_admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {valid_admin_token}"}