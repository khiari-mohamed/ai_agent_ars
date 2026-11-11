"""
LLM access layer: Claude primary, OpenAI fallback, one neutral message format.

Messages use Anthropic-style content blocks (str | list of text / tool_use /
tool_result blocks); they are converted for OpenAI. Per-provider circuit breakers
decide when to fall back. SDK-level retries (429/5xx/network) are configured on the
clients, so there is no extra retry wrapper here.

Streaming: text deltas are yielded as they arrive, then a final LLMResponse. Fallback
is only possible before the first event; a failure mid-stream raises LLMError.
"""
from __future__ import annotations

import json
import time
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import anthropic
import openai

from app.core.circuit_breaker import CircuitBreaker
from app.core.config import settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.core.metrics import llm_errors, llm_request_duration, llm_tokens_used

logger = get_logger(__name__)

# Our own malformed requests: never count against the provider, never fall back.
_CLIENT_ERRORS: tuple[type[Exception], ...] = (
    anthropic.BadRequestError,
    anthropic.UnprocessableEntityError,
    openai.BadRequestError,
    openai.UnprocessableEntityError,
)

_OPENAI_STOP = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens"}


# ── Data types ───────────────────────────────────────────────────────────────
@dataclass(frozen=True, slots=True)
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass(frozen=True, slots=True)
class LLMResponse:
    provider: str
    model: str
    text: str
    tool_calls: tuple[ToolCall, ...]
    stop_reason: str
    input_tokens: int
    output_tokens: int
    duration_ms: int

    @property
    def assistant_blocks(self) -> list[dict[str, Any]]:
        """This turn as content blocks, ready to append to the history."""
        blocks: list[dict[str, Any]] = []
        if self.text:
            blocks.append({"type": "text", "text": self.text})
        blocks.extend(
            {"type": "tool_use", "id": c.id, "name": c.name, "input": c.input}
            for c in self.tool_calls
        )
        return blocks


@dataclass(frozen=True, slots=True)
class TextDelta:
    text: str


StreamEvent = TextDelta | LLMResponse


def tool_results_message(
    results: Sequence[tuple[str, Any, bool]],
) -> dict[str, Any]:
    """Build the user message answering tool calls. Items: (tool_call_id, output, is_error)."""
    return {
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": call_id,
                "content": json.dumps(output, ensure_ascii=False, default=str),
                "is_error": is_error,
            }
            for call_id, output, is_error in results
        ],
    }


def _observe(response: LLMResponse) -> None:
    llm_request_duration.labels(provider=response.provider, model=response.model).observe(
        response.duration_ms / 1000
    )
    llm_tokens_used.labels(provider=response.provider, type="input").inc(response.input_tokens)
    llm_tokens_used.labels(provider=response.provider, type="output").inc(
        response.output_tokens
    )


# ── Claude ───────────────────────────────────────────────────────────────────
class _ClaudeProvider:
    name = "claude"

    def __init__(self) -> None:
        self._client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )

    def model_for(self, fast: bool) -> str:
        return (
            settings.LLM_MODEL_CLAUDE_FAST
            if fast and settings.LLM_MODEL_CLAUDE_FAST
            else settings.LLM_MODEL_CLAUDE
        )

    @staticmethod
    def _kwargs(
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": model,
            "system": system,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = tools
        return kwargs

    def _parse(self, resp: Any, model: str, started: float) -> LLMResponse:
        result = LLMResponse(
            provider=self.name,
            model=model,
            text="".join(b.text for b in resp.content if b.type == "text"),
            tool_calls=tuple(
                ToolCall(id=b.id, name=b.name, input=dict(b.input))
                for b in resp.content
                if b.type == "tool_use"
            ),
            stop_reason=resp.stop_reason or "",
            input_tokens=resp.usage.input_tokens,
            output_tokens=resp.usage.output_tokens,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        _observe(result)
        return result

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        started = time.monotonic()
        resp = await self._client.messages.create(
            **self._kwargs(model, system, messages, tools, temperature, max_tokens)
        )
        return self._parse(resp, model, started)

    async def stream(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[StreamEvent]:
        started = time.monotonic()
        async with self._client.messages.stream(
            **self._kwargs(model, system, messages, tools, temperature, max_tokens)
        ) as stream:
            async for text in stream.text_stream:
                yield TextDelta(text)
            final = await stream.get_final_message()
        yield self._parse(final, model, started)

    async def close(self) -> None:
        await self._client.close()


# ── OpenAI ───────────────────────────────────────────────────────────────────
def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["input_schema"],
            },
        }
        for t in tools
    ]


def _to_openai_messages(system: str, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for message in messages:
        role, content = message["role"], message["content"]
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue

        text = "".join(b["text"] for b in content if b["type"] == "text")
        if role == "assistant":
            calls = [
                {
                    "id": b["id"],
                    "type": "function",
                    "function": {
                        "name": b["name"],
                        "arguments": json.dumps(b["input"], ensure_ascii=False),
                    },
                }
                for b in content
                if b["type"] == "tool_use"
            ]
            entry: dict[str, Any] = {"role": "assistant", "content": text or None}
            if calls:
                entry["tool_calls"] = calls
            out.append(entry)
        else:
            # tool results must directly follow the assistant tool_calls message
            for b in content:
                if b["type"] == "tool_result":
                    out.append(
                        {
                            "role": "tool",
                            "tool_call_id": b["tool_use_id"],
                            "content": b["content"],
                        }
                    )
            if text:
                out.append({"role": "user", "content": text})
    return out


def _loads_arguments(raw: str, tool: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("llm_tool_arguments_invalid", tool=tool)
        return {}  # the tool executor validates required fields and reports back
    return value if isinstance(value, dict) else {}


class _OpenAIProvider:
    name = "openai"

    def __init__(self) -> None:
        self._client = openai.AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=settings.LLM_TIMEOUT_SECONDS,
            max_retries=settings.LLM_MAX_RETRIES,
        )

    def model_for(self, fast: bool) -> str:
        return (
            settings.LLM_MODEL_OPENAI_FAST
            if fast and settings.LLM_MODEL_OPENAI_FAST
            else settings.LLM_MODEL_OPENAI
        )

    @staticmethod
    def _kwargs(
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": _to_openai_messages(system, messages),
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = _to_openai_tools(tools)
        return kwargs

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> LLMResponse:
        started = time.monotonic()
        resp = await self._client.chat.completions.create(
            **self._kwargs(model, system, messages, tools, temperature, max_tokens)
        )
        choice = resp.choices[0]
        result = LLMResponse(
            provider=self.name,
            model=model,
            text=choice.message.content or "",
            tool_calls=tuple(
                ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    input=_loads_arguments(tc.function.arguments, tc.function.name),
                )
                for tc in (choice.message.tool_calls or [])
            ),
            stop_reason=_OPENAI_STOP.get(choice.finish_reason or "", choice.finish_reason or ""),
            input_tokens=resp.usage.prompt_tokens if resp.usage else 0,
            output_tokens=resp.usage.completion_tokens if resp.usage else 0,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        _observe(result)
        return result

    async def stream(
        self,
        *,
        model: str,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
        temperature: float,
        max_tokens: int,
    ) -> AsyncIterator[StreamEvent]:
        started = time.monotonic()
        stream = await self._client.chat.completions.create(
            **self._kwargs(model, system, messages, tools, temperature, max_tokens),
            stream=True,
            stream_options={"include_usage": True},
        )
        text_parts: list[str] = []
        slots: dict[int, dict[str, str]] = {}
        finish = ""
        input_tokens = output_tokens = 0

        async for chunk in stream:
            if chunk.usage:
                input_tokens = chunk.usage.prompt_tokens
                output_tokens = chunk.usage.completion_tokens
            if not chunk.choices:
                continue
            choice = chunk.choices[0]
            delta = choice.delta
            if delta.content:
                text_parts.append(delta.content)
                yield TextDelta(delta.content)
            for tc in delta.tool_calls or []:
                slot = slots.setdefault(tc.index, {"id": "", "name": "", "args": ""})
                if tc.id:
                    slot["id"] = tc.id
                if tc.function:
                    if tc.function.name:
                        slot["name"] = tc.function.name
                    if tc.function.arguments:
                        slot["args"] += tc.function.arguments
            if choice.finish_reason:
                finish = choice.finish_reason

        result = LLMResponse(
            provider=self.name,
            model=model,
            text="".join(text_parts),
            tool_calls=tuple(
                ToolCall(id=s["id"], name=s["name"], input=_loads_arguments(s["args"], s["name"]))
                for _, s in sorted(slots.items())
            ),
            stop_reason=_OPENAI_STOP.get(finish, finish),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        _observe(result)
        yield result

    async def close(self) -> None:
        await self._client.close()


# ── Service ──────────────────────────────────────────────────────────────────
class LLMService:
    def __init__(self) -> None:
        self._providers_by_name: dict[str, _ClaudeProvider | _OpenAIProvider] = {}
        self._breakers: dict[str, CircuitBreaker] = {}

    def _build(self, name: str) -> _ClaudeProvider | _OpenAIProvider | None:
        if name in self._providers_by_name:
            return self._providers_by_name[name]
        provider: _ClaudeProvider | _OpenAIProvider
        if name == "claude" and settings.ANTHROPIC_API_KEY:
            provider = _ClaudeProvider()
        elif name == "openai" and settings.OPENAI_API_KEY:
            provider = _OpenAIProvider()
        else:
            return None
        self._providers_by_name[name] = provider
        self._breakers[name] = CircuitBreaker(
            f"llm:{name}",
            failure_threshold=3,
            reset_timeout=30.0,
            ignored_exceptions=_CLIENT_ERRORS,
        )
        return provider

    def _providers(self) -> list[_ClaudeProvider | _OpenAIProvider]:
        names = [settings.LLM_PRIMARY]
        if settings.LLM_FALLBACK not in ("none", settings.LLM_PRIMARY):
            names.append(settings.LLM_FALLBACK)
        providers = [p for n in names if (p := self._build(n)) is not None]
        if not providers:
            raise LLMError("Aucun fournisseur LLM configuré (clé API manquante)")
        return providers

    @staticmethod
    def _on_error(provider_name: str, exc: Exception) -> None:
        llm_errors.labels(provider=provider_name, error_type=type(exc).__name__).inc()
        logger.warning("llm_provider_failed", provider=provider_name, error=str(exc))

    async def complete(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        system: str,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        fast: bool = False,
    ) -> LLMResponse:
        temp = settings.LLM_TEMPERATURE_RESPONSE if temperature is None else temperature
        limit = max_tokens or settings.LLM_MAX_TOKENS
        last_error: Exception | None = None

        for provider in self._providers():
            try:
                return await self._breakers[provider.name].call(
                    provider.complete,
                    model=provider.model_for(fast),
                    system=system,
                    messages=list(messages),
                    tools=tools,
                    temperature=temp,
                    max_tokens=limit,
                )
            except _CLIENT_ERRORS as exc:
                self._on_error(provider.name, exc)
                raise LLMError("Requête LLM invalide") from exc
            except Exception as exc:
                self._on_error(provider.name, exc)
                last_error = exc
        raise LLMError("Aucun fournisseur LLM disponible") from last_error

    async def stream(
        self,
        messages: Sequence[dict[str, Any]],
        *,
        system: str,
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        fast: bool = False,
    ) -> AsyncIterator[StreamEvent]:
        """Yields TextDelta events then one final LLMResponse (text + tool calls).
        Falls back to the next provider only if nothing was emitted yet."""
        temp = settings.LLM_TEMPERATURE_RESPONSE if temperature is None else temperature
        limit = max_tokens or settings.LLM_MAX_TOKENS
        last_error: Exception | None = None

        async def first_event(agen: AsyncIterator[StreamEvent]) -> StreamEvent:
            try:
                return await anext(agen)
            except StopAsyncIteration as exc:
                raise LLMError("Flux LLM vide") from exc

        for provider in self._providers():
            agen = provider.stream(
                model=provider.model_for(fast),
                system=system,
                messages=list(messages),
                tools=tools,
                temperature=temp,
                max_tokens=limit,
            )
            try:
                first = await self._breakers[provider.name].call(first_event, agen)
            except _CLIENT_ERRORS as exc:
                await agen.aclose()
                self._on_error(provider.name, exc)
                raise LLMError("Requête LLM invalide") from exc
            except Exception as exc:
                await agen.aclose()
                self._on_error(provider.name, exc)
                last_error = exc
                continue

            try:
                yield first
                async for event in agen:
                    yield event
            except Exception as exc:
                self._on_error(provider.name, exc)
                raise LLMError("Flux LLM interrompu") from exc
            finally:
                await agen.aclose()
            return
        raise LLMError("Aucun fournisseur LLM disponible") from last_error

    async def close(self) -> None:
        for provider in self._providers_by_name.values():
            await provider.close()
        self._providers_by_name.clear()
        self._breakers.clear()


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    return LLMService()