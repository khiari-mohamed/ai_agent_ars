from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import LLMError
from app.services.llm_service import LLMResponse
from app.services.orchestrator import ConvState, Orchestrator

FR_REPLY = '{"language":"fr","display_text":"Bonjour, je vous écoute.","tts_text":"Bonjour, je vous écoute."}'
TN_REPLY = '{"language":"tn","display_text":"Behi, chnowa el mochkla ?","tts_text":"باهي، شنوّة المشكلة؟"}'


class FakeLLM:
    def __init__(self, *replies: str | Exception) -> None:
        self._replies = list(replies)
        self.calls: list[dict] = []

    async def complete(self, messages, *, system, **kwargs) -> LLMResponse:
        self.calls.append({"messages": messages, "system": system})
        item = self._replies.pop(0)
        if isinstance(item, Exception):
            raise item
        return LLMResponse("fake", "fake", item, (), "end_turn", 0, 0, 0)


@pytest.fixture
def build(monkeypatch: pytest.MonkeyPatch, memory_sessions):
    monkeypatch.setattr(
        "app.services.orchestrator.analyze_sentiment",
        AsyncMock(return_value={"score": 0.0, "label": "NEUTRE"}),
    )
    monkeypatch.setattr("app.services.orchestrator.generate_summary_and_email", AsyncMock())

    def _build(*replies: str | Exception, context: str = "") -> tuple[Orchestrator, FakeLLM]:
        orch = Orchestrator(session_id="s1", conversation_id="00000000-0000-0000-0000-000000000001")
        llm = FakeLLM(*replies)
        orch._llm = llm  # type: ignore[assignment]
        orch._rag = SimpleNamespace(build_context_for_llm=AsyncMock(return_value=context))  # type: ignore[assignment]
        orch._crm = AsyncMock()
        return orch, llm

    return _build


async def test_greeting_is_static_and_recorded(build, memory_sessions) -> None:
    orch, llm = build()
    result = await orch.greeting()
    assert "ARS" in result["text"] and result["tts_text"]
    assert result["state"] == ConvState.INIT.value
    assert llm.calls == []
    assert memory_sessions["s1"]["transcript"][0]["role"] == "assistant"


async def test_social_utterance_skips_retrieval(build) -> None:
    orch, llm = build(FR_REPLY)
    result = await orch.process("Bonjour")
    orch._rag.build_context_for_llm.assert_not_awaited()  # type: ignore[attr-defined]
    assert result["state"] == ConvState.ACTIVE.value
    assert result["language"] == "fr"


async def test_content_utterance_injects_kb_context(build) -> None:
    orch, llm = build(TN_REPLY, context="Réponse officielle: 15 jours")
    result = await orch.process("win remboursement mta3i")
    orch._rag.build_context_for_llm.assert_awaited_once()  # type: ignore[attr-defined]
    assert "Réponse officielle: 15 jours" in llm.calls[0]["system"]
    assert result["language"] == "tn"
    assert result["tts_text"].startswith("باهي")


async def test_human_request_escalates_without_llm(build) -> None:
    orch, llm = build()
    result = await orch.process("je veux parler à un conseiller")
    assert result["should_escalate"] and result["escalation_reason"] == "USER_REQUESTED"
    assert llm.calls == []
    follow_up = await orch.process("allo ?")
    assert follow_up["state"] == ConvState.ESCALATED.value
    assert llm.calls == []


async def test_bare_word_agent_does_not_escalate(build) -> None:
    orch, _ = build(FR_REPLY)
    result = await orch.process("personne ne m'a répondu pour mon remboursement")
    assert not result["should_escalate"]


async def test_llm_outage_escalates_with_technical_message(build) -> None:
    orch, _ = build(LLMError())
    result = await orch.process("Où en est ma réclamation ?")
    assert result["should_escalate"] and result["escalation_reason"] == "LLM_UNAVAILABLE"


async def test_contract_violation_is_flagged_not_fatal(build) -> None:
    orch, _ = build("Bonjour, voici ma réponse en texte libre")
    result = await orch.process("Quels documents pour un remboursement ?")
    assert result["degraded"] is True
    assert result["text"].startswith("Bonjour")