from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from enum import Enum
from typing import Any

from app.core.exceptions import CircuitOpenError
from app.core.logging import get_logger

logger = get_logger(__name__)


class CircuitState(str, Enum):
    CLOSED = "CLOSED"        # Normal operation
    OPEN = "OPEN"            # Failing — reject calls
    HALF_OPEN = "HALF_OPEN"  # Probing whether the service recovered


class CircuitBreaker:
    """
    Async circuit breaker.

    - CLOSED: calls pass; `failure_threshold` consecutive failures open the circuit.
    - OPEN: calls are rejected with `CircuitOpenError` until `reset_timeout` elapsed.
    - HALF_OPEN: ONE probe call at a time is allowed; `success_threshold` consecutive
      successful probes close the circuit, any failed probe re-opens it immediately.

    Exceptions listed in `ignored_exceptions` (e.g. client-side 4xx errors) neither
    count as failures nor as successes.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        reset_timeout: float = 30.0,
        success_threshold: int = 2,
        ignored_exceptions: tuple[type[BaseException], ...] = (),
        open_error: Callable[[], Exception] | None = None,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.success_threshold = success_threshold
        self.ignored_exceptions = ignored_exceptions
        self._open_error = open_error or (lambda: CircuitOpenError(self.name))

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float | None = None
        self._probe_in_flight = False
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    @property
    def is_open(self) -> bool:
        return self._state == CircuitState.OPEN

    async def _before_call(self) -> bool:
        """Returns True when this call is a half-open probe."""
        async with self._lock:
            if self._state == CircuitState.OPEN:
                elapsed_ok = (
                    self._last_failure_time is not None
                    and time.monotonic() - self._last_failure_time >= self.reset_timeout
                )
                if not elapsed_ok:
                    raise self._open_error()
                self._state = CircuitState.HALF_OPEN
                self._success_count = 0
                self._probe_in_flight = False
                logger.info("circuit_breaker_half_open", service=self.name)

            if self._state == CircuitState.HALF_OPEN:
                if self._probe_in_flight:
                    raise self._open_error()
                self._probe_in_flight = True
                return True
            return False

    async def _on_success(self, was_probe: bool) -> None:
        async with self._lock:
            if was_probe:
                self._probe_in_flight = False
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info("circuit_breaker_closed", service=self.name)
            elif self._state == CircuitState.CLOSED:
                self._failure_count = 0

    async def _on_failure(self, exc: BaseException, was_probe: bool) -> None:
        async with self._lock:
            self._last_failure_time = time.monotonic()
            if was_probe:
                self._probe_in_flight = False
                self._state = CircuitState.OPEN
                logger.error(
                    "circuit_breaker_reopened", service=self.name, error=str(exc)
                )
                return
            self._failure_count += 1
            if (
                self._state == CircuitState.CLOSED
                and self._failure_count >= self.failure_threshold
            ):
                self._state = CircuitState.OPEN
                logger.error(
                    "circuit_breaker_opened",
                    service=self.name,
                    failures=self._failure_count,
                    error=str(exc),
                )

    async def _release_probe(self) -> None:
        async with self._lock:
            self._probe_in_flight = False

    async def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        was_probe = await self._before_call()
        settled = False
        try:
            result = await func(*args, **kwargs)
        except self.ignored_exceptions:
            await self._release_probe()
            settled = True
            raise
        except Exception as exc:
            await self._on_failure(exc, was_probe)
            settled = True
            raise
        else:
            await self._on_success(was_probe)
            settled = True
            return result
        finally:
            # Cancellation (BaseException) must not leave a probe slot occupied.
            if was_probe and not settled:
                await self._release_probe()


# Registry of circuit breakers
_breakers: dict[str, CircuitBreaker] = {}


def get_breaker(
    name: str,
    failure_threshold: int = 3,
    reset_timeout: float = 30.0,
    success_threshold: int = 2,
) -> CircuitBreaker:
    if name not in _breakers:
        _breakers[name] = CircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            reset_timeout=reset_timeout,
            success_threshold=success_threshold,
        )
    return _breakers[name]