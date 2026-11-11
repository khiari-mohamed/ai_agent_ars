from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.core.config import settings
from app.core.exceptions import CRMError
from app.core.logging import get_logger
from app.integrations.crm.client import CRMClient
from app.services.rag_service import RAGService

logger = get_logger(__name__)

_CIN_RE = re.compile(r"^\d{8}$")  # Tunisian CIN: 8 digits
_PHONE_RE = re.compile(r"^\+?\d{8,15}$")
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_CATEGORIES = ["RECLAMATION", "INFORMATION", "ELIGIBILITE", "TECHNIQUE", "AUTRE"]
_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "search_knowledge_base",
        "description": "Cherche dans la base de connaissances ARS (cas de réclamations et réponses officielles). À utiliser pour une nouvelle question ou un sujet différent de celui du CONTEXTE.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "Question reformulée en une phrase"}},
            "required": ["query"],
        },
    },
    {
        "name": "prepare_ticket",
        "description": "Prépare un ticket de réclamation et renvoie les valeurs à relire à l'assuré. Ne crée RIEN: il faut ensuite la confirmation explicite de l'assuré.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nom_complet": {"type": "string"},
                "cin": {"type": "string", "description": "8 chiffres"},
                "category": {"type": "string", "enum": _CATEGORIES},
                "priority": {"type": "string", "enum": _PRIORITIES},
                "subject": {"type": "string", "description": "Titre court (≤ 200 caractères)"},
                "description": {"type": "string", "description": "Motif détaillé, en français"},
                "phone": {"type": "string", "description": "Téléphone de rappel (optionnel)"},
            },
            "required": ["nom_complet", "cin", "category", "priority", "subject", "description"],
        },
    },
    {
        "name": "submit_ticket",
        "description": "Crée le ticket préparé. À appeler UNIQUEMENT après que l'assuré a confirmé la lecture du nom et du CIN dans un message ultérieur.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "request_human_agent",
        "description": "Transfère la conversation à un conseiller humain.",
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    },
]


@dataclass(slots=True)
class ToolContext:
    session: dict[str, Any]
    conversation_id: str
    rag: RAGService
    crm: CRMClient


def spell_digits(value: str) -> str:
    return " ".join(value)


def _clean_cin(raw: str) -> str:
    return re.sub(r"[\s.\-]", "", raw.translate(_ARABIC_DIGITS))


async def _search(inputs: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    query = str(inputs.get("query", "")).strip()
    if not query:
        return {"error": "query vide"}
    lang = ctx.session.get("language")
    response = await ctx.rag.search(
        query,
        top_k=3,
        min_score=settings.RAG_MIN_SCORE,
        language=lang if lang in ("fr", "tn") else None,
    )
    return {
        "found": bool(response.results),
        "results": [
            {
                "type": r.intent,
                "reclamation": r.question,
                "reponse_officielle": None if r.no_response else r.answer,
                "pertinence": r.score,
            }
            for r in response.results
        ],
    }


async def _prepare_ticket(inputs: dict[str, Any], ctx: ToolContext) -> dict[str, Any]:
    session = ctx.session
    name = " ".join(str(inputs.get("nom_complet", "")).split())
    cin = _clean_cin(str(inputs.get("cin", "")))
    phone = re.sub(r"[\s.\-]", "", str(inputs.get("phone", "") or ""))

    if len(name) < 5 or len(name.split()) < 2:
        return {"error": "nom_complet invalide: prénom et nom requis", "field": "nom_complet"}
    if not _CIN_RE.match(cin):
        return {"error": "cin invalide: 8 chiffres requis, redemander à l'assuré", "field": "cin"}
    if phone and not _PHONE_RE.match(phone):
        return {"error": "téléphone invalide", "field": "phone"}
    if inputs.get("category") not in _CATEGORIES or inputs.get("priority") not in _PRIORITIES:
        return {"error": "category ou priority invalide"}
    if session.get("ticket_id"):
        return {"error": "un ticket a déjà été créé dans cette conversation", "ticket_id": session["ticket_id"]}

    session["ticket_draft"] = {
        "assure_nom_complet": name,
        "assure_cin": cin,
        "assure_phone": phone or None,
        "category": inputs["category"],
        "priority": inputs["priority"],
        "subject": str(inputs.get("subject", "")).strip()[:200] or "Réclamation",
        "description": str(inputs.get("description", "")).strip()[:2000],
        "prepared_at_turn": session["user_turns"],
    }
    return {
        "status": "awaiting_confirmation",
        "read_back": {"nom_complet": name, "cin_chiffre_par_chiffre": spell_digits(cin)},
        "instruction": "Lis ces valeurs à l'assuré et attends sa confirmation avant submit_ticket.",
    }


async def _submit_ticket(ctx: ToolContext) -> dict[str, Any]:
    session = ctx.session
    draft = session.get("ticket_draft")
    if not draft:
        return {"error": "aucun ticket préparé: appelle prepare_ticket d'abord"}
    if draft["prepared_at_turn"] >= session["user_turns"]:
        return {"error": "confirmation requise: attends la réponse de l'assuré avant de créer le ticket"}

    payload = {
        "source": "AGENT_IA",
        "channel": session.get("channel", "CHAT_WEB"),
        "conversation_id": ctx.conversation_id,
        "language": session.get("language") or "fr",
        "identity_verified": False,  # declared by the caller, not verified
        **{k: v for k, v in draft.items() if k != "prepared_at_turn"},
    }
    try:
        created = await ctx.crm.create_ticket(payload)
    except CRMError as exc:
        logger.error("ticket_creation_failed", error=str(exc))
        return {"error": "CRM indisponible", "action": "propose un conseiller (request_human_agent)"}

    session["ticket_id"] = str(created.get("id"))
    session["ticket_draft"] = None
    return {"success": True, "reference": session["ticket_id"]}


async def execute_tool(
    name: str, inputs: dict[str, Any], ctx: ToolContext
) -> tuple[dict[str, Any], bool]:
    """Returns (output, is_error). Never raises: the model gets the error and adapts."""
    logger.info("tool_call", tool=name, conversation_id=ctx.conversation_id)
    try:
        if name == "search_knowledge_base":
            output = await _search(inputs, ctx)
        elif name == "prepare_ticket":
            output = await _prepare_ticket(inputs, ctx)
        elif name == "submit_ticket":
            output = await _submit_ticket(ctx)
        elif name == "request_human_agent":
            ctx.session["escalation_requested"] = str(inputs.get("reason", "AGENT_REQUESTED"))[:200]
            output = {"status": "transfer_initiated"}
        else:
            output = {"error": f"outil inconnu: {name}"}
    except Exception as exc:
        logger.error("tool_execution_error", tool=name, error=str(exc), exc_info=True)
        return {"error": "erreur interne de l'outil"}, True
    return output, "error" in output