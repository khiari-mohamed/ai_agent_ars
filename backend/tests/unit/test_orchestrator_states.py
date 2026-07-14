from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.orchestrator import Orchestrator, ConvState


@pytest.fixture
def session_id() -> str:
    return "test-session-001"


@pytest.fixture
def conversation_id() -> str:
    import uuid
    return str(uuid.uuid4())


@pytest.mark.asyncio
async def test_init_state_returns_greeting(session_id: str, conversation_id: str) -> None:
    with (
        patch("app.services.orchestrator.get_session", AsyncMock(return_value=None)),
        patch("app.services.orchestrator.set_session", AsyncMock()),
        patch("app.services.orchestrator.extend_session_ttl", AsyncMock()),
    ):
        orch = Orchestrator(session_id=session_id, conversation_id=conversation_id)
        result = await orch.process("__INIT__")
        assert result["state"] == ConvState.PENDING_CIN.value
        assert "CIN" in result["text"]


@pytest.mark.asyncio
async def test_invalid_cin_increments_attempts(session_id: str, conversation_id: str) -> None:
    base_session = {
        "state": ConvState.PENDING_CIN,
        "messages": [{"role": "user", "content": "__INIT__"}],
        "assure": None,
        "auth_attempts": 0,
        "pending_cin": None,
    }

    mock_dh = AsyncMock()
    mock_dh.get_assure.side_effect = Exception("Not found")

    with (
        patch("app.services.orchestrator.get_session", AsyncMock(return_value=base_session)),
        patch("app.services.orchestrator.set_session", AsyncMock()),
        patch("app.services.orchestrator.extend_session_ttl", AsyncMock()),
        patch("app.services.orchestrator.get_digihealth_client", return_value=mock_dh),
        patch("app.services.orchestrator.get_crm_client", return_value=AsyncMock()),
        patch("app.services.orchestrator.get_sms_client", return_value=AsyncMock()),
    ):
        orch = Orchestrator(session_id=session_id, conversation_id=conversation_id)
        result = await orch.process("00000000")
        assert "introuvable" in result["text"].lower() or "invalid" in result["text"].lower()