from __future__ import annotations

import asyncio
import time
from enum import Enum
from typing import Any, Callable, TypeVar
from functools import wraps

from app.core.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    CLOSED   = "CLOSED"    # Normal operation
    OPEN     = "OPEN"      # Failing — reject requests
    HALF_OPEN = "HALF_OPEN"  # Testing if service recovered


class CircuitBreaker:
    """
    Thread-safe async circuit breaker.
    Tracks consecutive failures and opens the circuit after threshold is reached.
    After reset_timeout seconds, moves to HALF_OPEN to probe the service.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        reset_timeout: float = 30.0,
        success_threshold: int = 2,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.success_threshold = success_threshold

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float | None = None
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def is_open(self) -> bool:
        return self._state == CircuitState.OPEN

    async def _check_state(self) -> None:
        async with self._lock:
            if self._state == CircuitState.OPEN:
                if self._last_failure_time and (
                    time.monotonic() - self._last_failure_time >= self.reset_timeout
                ):
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info("circuit_breaker_half_open", service=self.name)
                else:
                    from app.core.exceptions import DigiHealthCircuitOpenError
                    raise DigiHealthCircuitOpenError()

    async def _on_success(self) -> None:
        async with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info("circuit_breaker_closed", service=self.name)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.monotonic()
            if self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.error(
                    "circuit_breaker_opened",
                    service=self.name,
                    failures=self._failure_count,
                    error=str(exc),
                )

    async def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        await self._check_state()
        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as exc:
            await self._on_failure(exc)
            raise


# Registry of circuit breakers
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(
    name: str,
    failure_threshold: int = 3,
    reset_timeout: float = 30.0,
) -> CircuitBreaker:
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            reset_timeout=reset_timeout,
        )
    return _breakers[name]