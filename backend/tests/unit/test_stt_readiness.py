from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import Response

from app.routers import health


class _FakeResult:
    def __init__(self, *, rows: list[tuple[str, ...]] | None = None, value: int = 0) -> None:
        self._rows = rows or []
        self._value = value

    def __iter__(self):
        return iter(self._rows)

    def scalar_one(self) -> int:
        return self._value


class _FakeConnection:
    async def __aenter__(self) -> _FakeConnection:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def execute(self, statement: object) -> _FakeResult:
        if "pg_extension" in str(statement):
            return _FakeResult(rows=[("vector",), ("pg_trgm",)])
        return _FakeResult(value=1)


class _FakeEngine:
    def connect(self) -> _FakeConnection:
        return _FakeConnection()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("stt_preload", "expected_state", "expected_ready", "expected_status"),
    [
        (True, "loading", False, 503),
        (False, "lazy", True, 200),
    ],
)
async def test_readiness_reports_stt_model_state(
    monkeypatch: pytest.MonkeyPatch,
    stt_preload: bool,
    expected_state: str,
    expected_ready: bool,
    expected_status: int,
) -> None:
    monkeypatch.setattr(health, "engine", _FakeEngine())
    monkeypatch.setattr(health, "_redis_ok", AsyncMock(return_value=True))
    monkeypatch.setattr(health, "get_embedding_service", lambda: SimpleNamespace(is_loaded=True))
    monkeypatch.setattr(health, "get_stt_service", lambda: SimpleNamespace(is_loaded=False))
    monkeypatch.setattr(
        health,
        "settings",
        SimpleNamespace(EMBEDDING_PRELOAD=True, STT_PRELOAD=stt_preload),
    )

    response = Response()
    result = await health.readiness(response)

    assert result.checks["stt_model"] == expected_state
    assert result.ready is expected_ready
    assert response.status_code == expected_status
