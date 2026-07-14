from __future__ import annotations

import pytest
from unittest.mock import AsyncMock

from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.core.exceptions import DigiHealthCircuitOpenError


@pytest.mark.asyncio
async def test_circuit_starts_closed() -> None:
    cb = CircuitBreaker("test", failure_threshold=3)
    assert cb.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_circuit_opens_after_threshold() -> None:
    cb = CircuitBreaker("test", failure_threshold=3)

    async def failing() -> None:
        raise ValueError("fail")

    for _ in range(3):
        with pytest.raises(ValueError):
            await cb.call(failing)

    assert cb.state == CircuitState.OPEN


@pytest.mark.asyncio
async def test_open_circuit_rejects_immediately() -> None:
    cb = CircuitBreaker("test", failure_threshold=1, reset_timeout=9999.0)

    async def failing() -> None:
        raise ValueError("fail")

    with pytest.raises(ValueError):
        await cb.call(failing)

    with pytest.raises(DigiHealthCircuitOpenError):
        await cb.call(AsyncMock())


@pytest.mark.asyncio
async def test_circuit_closes_after_success() -> None:
    cb = CircuitBreaker("test", failure_threshold=1, reset_timeout=0.0, success_threshold=1)

    async def failing() -> None:
        raise ValueError("fail")

    with pytest.raises(ValueError):
        await cb.call(failing)

    assert cb.state == CircuitState.OPEN

    # After reset_timeout (0.0), it should move to HALF_OPEN on next call
    import asyncio
    await asyncio.sleep(0.01)

    success_called = False
    async def success() -> str:
        nonlocal success_called
        success_called = True
        return "ok"

    result = await cb.call(success)
    assert result == "ok"
    assert success_called
    assert cb.state == CircuitState.CLOSED