from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.core.logging import get_logger
from app.services.llm_service import extract_text_from_response, llm_chat

logger = get_logger(__name__)

SUMMARY_PROMPT = """Tu es un assistant administratif de l'ARS Tunisie.
Génère un résumé structuré de cette conversation de support et un brouillon d'email professionnel.

RETOURNE UNIQUEMENT un JSON valide avec cette structure exacte:
{
  "summary": {
    "assure_identifiant": "string",
    "canal": "CHAT_WEB|VOIP",
    "motif_principal": "string",
    "motifs_secondaires": [],
    "actions_effectuees": [],
    "resultat": "RESOLU|ESCALADE|ABANDONNE",
    "ticket_reference": "string|null",
    "points_attention": [],
    "sentiment_final": "SATISFAIT|NEUTRE|INSATISFAIT"
  },
  "email": {
    "subject": "string",
    "to": ["service-reclamations@ars.tn"],
    "cc": [],
    "body": "string (email professionnel en français)",
    "actions_requises": []
  }
}"""


async def generate_summary_and_email(
    conversation_id: str,
    session: dict[str, Any],
    result: str,
) -> dict[str, Any]:
    """Generate structured summary and email draft, then persist to DB."""
    from app.db.session import AsyncSessionLocal
    from app.db.repositories.conversation_repo import ConversationRepository
    import re, uuid

    # Build transcript
    transcript = "\n".join(
        f"[{m['role'].upper()}]: {m['content']}"
        for m in session.get("messages", [])
        if m["role"] in ("user", "assistant")
    )

    assure = session.get("assure", {})
    context = f"""
Conversation ID: {conversation_id}
Assuré: {assure.get('prenom', '')} {assure.get('nom', '')} (CIN: {assure.get('cin', '')})
Canal: {session.get('channel', 'CHAT_WEB')}
Résultat: {result}
Ticket créé: {session.get('ticket_id', 'Non')}
---
TRANSCRIPT:
{transcript}
"""

    try:
        llm_result = await llm_chat(
            messages=[{"role": "user", "content": context}],
            temperature=0.2,
            tools=False,
        )
        raw = extract_text_from_response(llm_result)

        # Extract JSON
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if not match:
            raise ValueError("No JSON in LLM summary response")

        data: dict[str, Any] = json.loads(match.group())
        summary = data.get("summary", {})
        email = data.get("email", {})

        # Add metadata
        summary["date_heure"] = datetime.now(timezone.utc).isoformat()
        email["generated_at"] = datetime.now(timezone.utc).isoformat()
        email["validated"] = False

        # Persist to DB
        async with AsyncSessionLocal() as db:
            repo = ConversationRepository(db)
            try:
                await repo.close(
                    conv_id=uuid.UUID(conversation_id),
                    status="ESCALATED" if result == "ESCALADE" else "RESOLVED",
                    escalation_reason=session.get("escalation_reason"),
                    summary=summary,
                    email_draft=email,
                    ticket_id=session.get("ticket_id"),
                )
                await db.commit()
            except Exception as exc:
                logger.error("summary_db_persist_failed", error=str(exc))
                await db.rollback()

        logger.info("summary_generated", conversation_id=conversation_id)
        return {"summary": summary, "email": email}

    except Exception as exc:
        logger.error("summary_generation_failed", error=str(exc), conversation_id=conversation_id)
        return {}