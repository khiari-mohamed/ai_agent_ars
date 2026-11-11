from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.core.exceptions import CRMError
from app.services.agent_tools import ToolContext, execute_tool

VALID = {
    "nom_complet": "Ahmed Ben Salah",
    "cin": "12 345 678",
    "category": "RECLAMATION",
    "priority": "MEDIUM",
    "subject": "Remboursement non reçu",
    "description": "Couronne dentaire facturée 400 dinars, aucun remboursement.",
}


@pytest.fixture
def ctx() -> ToolContext:
    crm = AsyncMock()
    crm.create_ticket.return_value = {"id": "TKT-1"}
    session = {"user_turns": 1, "language": "fr", "channel": "CHAT_WEB", "ticket_id": None, "ticket_draft": None}
    return ToolContext(session=session, conversation_id="c1", rag=AsyncMock(), crm=crm)


async def test_prepare_normalises_cin_and_reads_back_digits(ctx: ToolContext) -> None:
    out, err = await execute_tool("prepare_ticket", VALID, ctx)
    assert not err
    assert out["read_back"]["cin_chiffre_par_chiffre"] == "1 2 3 4 5 6 7 8"
    assert ctx.session["ticket_draft"]["assure_cin"] == "12345678"


@pytest.mark.parametrize("cin", ["1234567", "123456789", "abcdefgh", ""])
async def test_invalid_cin_rejected(ctx: ToolContext, cin: str) -> None:
    out, err = await execute_tool("prepare_ticket", {**VALID, "cin": cin}, ctx)
    assert err and out["field"] == "cin" and ctx.session["ticket_draft"] is None


async def test_arabic_indic_digits_accepted(ctx: ToolContext) -> None:
    out, err = await execute_tool("prepare_ticket", {**VALID, "cin": "١٢٣٤٥٦٧٨"}, ctx)
    assert not err and ctx.session["ticket_draft"]["assure_cin"] == "12345678"


async def test_submit_refused_in_same_turn_as_prepare(ctx: ToolContext) -> None:
    await execute_tool("prepare_ticket", VALID, ctx)
    out, err = await execute_tool("submit_ticket", {}, ctx)
    assert err and "confirmation" in out["error"]
    ctx.crm.create_ticket.assert_not_awaited()


async def test_submit_after_confirmation_turn_creates_unverified_ticket(ctx: ToolContext) -> None:
    await execute_tool("prepare_ticket", VALID, ctx)
    ctx.session["user_turns"] += 1  # the user confirmed in a later message
    out, err = await execute_tool("submit_ticket", {}, ctx)
    assert not err and out["reference"] == "TKT-1"
    payload = ctx.crm.create_ticket.await_args.args[0]
    assert payload["identity_verified"] is False and payload["assure_cin"] == "12345678"
    assert ctx.session["ticket_draft"] is None and ctx.session["ticket_id"] == "TKT-1"


async def test_submit_without_draft(ctx: ToolContext) -> None:
    _, err = await execute_tool("submit_ticket", {}, ctx)
    assert err


async def test_crm_failure_is_reported_not_raised(ctx: ToolContext) -> None:
    await execute_tool("prepare_ticket", VALID, ctx)
    ctx.session["user_turns"] += 1
    ctx.crm.create_ticket.side_effect = CRMError("down")
    out, err = await execute_tool("submit_ticket", {}, ctx)
    assert err and "CRM" in out["error"] and ctx.session["ticket_id"] is None


async def test_request_human_agent_flags_session(ctx: ToolContext) -> None:
    out, _ = await execute_tool("request_human_agent", {"reason": "colère"}, ctx)
    assert out["status"] == "transfer_initiated" and ctx.session["escalation_requested"] == "colère"