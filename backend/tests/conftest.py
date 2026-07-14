from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models.db.base import Base

# Use SQLite in-memory for tests (override in CI to use PostgreSQL for pgvector tests)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():  # type: ignore[no-untyped-def]
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(test_engine) -> AsyncGenerator[AsyncSession, None]:  # type: ignore[no-untyped-def]
    TestSession = async_sessionmaker(test_engine, expire_on_commit=False)
    async with TestSession() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        yield db

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def mock_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock Redis calls in tests."""
    monkeypatch.setattr("app.core.cache.get_redis", AsyncMock(return_value=AsyncMock()))
    monkeypatch.setattr("app.core.cache.get_session", AsyncMock(return_value=None))
    monkeypatch.setattr("app.core.cache.set_session", AsyncMock())
    monkeypatch.setattr("app.core.cache.store_otp", AsyncMock())
    monkeypatch.setattr("app.core.cache.verify_and_consume_otp", AsyncMock(return_value=True))


@pytest.fixture
def valid_admin_token() -> str:
    from app.core.security import create_access_token
    return create_access_token(subject=str(uuid.uuid4()), role="ADMIN")


@pytest.fixture
def auth_headers(valid_admin_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {valid_admin_token}"}