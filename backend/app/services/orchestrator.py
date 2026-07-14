from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.core.cache import (
    delete_session, extend_session_ttl, get_session,
    set_session, store_otp, verify_and_consume_otp,
)
from app.core.config import settings
from app.core.exceptions import DigiHealthCircuitOpenError
from app.core.logging import get_logger
from app.core.metrics import (
    conversations_active, conversations_escalated, conversations_resolved,
)
from app.integrations.crm.client import get_crm_client
from app.integrations.digihealth.client import get_digihealth_client
from app.integrations.sms.client import get_sms_client
from app.services.llm_service import (
    extract_text_from_response, extract_tool_calls, llm_chat,
)
from app.services.rag_service import RAGService
from app.services.sentiment_service import analyze_sentiment
from app.services.summarizer import generate_summary_and_email

logger = get_logger(__name__)


class ConvState(str, Enum):
    INIT = "INIT"
    PENDING_CIN = "PENDING_CIN"
    PENDING_OTP = "PENDING_OTP"
    AUTHENTICATED = "AUTHENTICATED"
    LOCKED = "LOCKED"
    ESCALATED = "ESCALATED"
    CLOSED = "CLOSED"


class Orchestrator:
    """
    Stateless orchestrator — all state lives in Redis.
    A new instance is created per WebSocket message.
    """

    def __init__(self, session_id: str, conversation_id: str, ip_address: str = "0.0.0.0") -> None:
        self.session_id = session_id
        self.conversation_id = conversation_id
        self.ip = ip_address
        self._dh = get_digihealth_client()
        self._crm = get_crm_client()
        self._sms = get_sms_client()
        self._rag = RAGService()

    # ── Session helpers ───────────────────────────────────────────────────────

    async def _load(self) -> dict[str, Any]:
        session = await get_session(self.session_id)
        if session is None:
            session = {
                "state": ConvState.INIT,
                "messages": [],
                "assure": None,
                "auth_attempts": 0,
                "pending_cin": None,
            }
            await set_session(self.session_id, session)
        return session

    async def _save(self, session: dict[str, Any]) -> None:
        await set_session(self.session_id, session)
        await extend_session_ttl(self.session_id)

    # ── Public entry point ────────────────────────────────────────────────────

    async def process(self, user_text: str) -> dict[str, Any]:
        """
        Process one user message. Returns:
        {
            "text": str,               # Agent response text
            "state": str,              # Current conversation state
            "tool_calls": list,        # Executed tool calls (for logging)
            "sentiment": dict,         # Updated sentiment
            "should_escalate": bool,
            "escalation_reason": str | None,
        }
        """
        session = await self._load()
        state = ConvState(session["state"])

        # Append user message to history
        session["messages"].append({"role": "user", "content": user_text})

        # Sentinel: init message (first contact)
        if state == ConvState.INIT:
            session["state"] = ConvState.PENDING_CIN
            response_text = (
                "Bonjour et bienvenue à l'ARS Tunisie ! Je suis votre assistant virtuel.\n"
                "Pour accéder à votre dossier, veuillez me communiquer votre numéro de CIN."
            )
            session["messages"].append({"role": "assistant", "content": response_text})
            await self._save(session)
            return self._result(response_text, ConvState.PENDING_CIN, session)

        # Auth flow
        if state == ConvState.PENDING_CIN:
            return await self._handle_cin(user_text, session)
        if state == ConvState.PENDING_OTP:
            return await self._handle_otp(user_text, session)
        if state in (ConvState.LOCKED, ConvState.CLOSED):
            return self._result(
                "Cette session est terminée. Veuillez ouvrir une nouvelle conversation.",
                state,
                session,
            )

        # Authenticated — full LLM pipeline
        if state == ConvState.AUTHENTICATED:
            return await self._handle_authenticated(user_text, session)

        return self._result("Une erreur inattendue est survenue.", state, session)

    # ── Authentication handlers ───────────────────────────────────────────────

    async def _handle_cin(self, cin: str, session: dict[str, Any]) -> dict[str, Any]:
        cin = cin.strip().replace(" ", "")
        if not cin or len(cin) < 7:
            response_text = "Veuillez entrer un numéro de CIN valide (minimum 7 chiffres)."
            session["messages"].append({"role": "assistant", "content": response_text})
            await self._save(session)
            return self._result(response_text, ConvState.PENDING_CIN, session)

        session["pending_cin"] = cin

        # Verify CIN exists in DigiHealth
        try:
            assure = await self._dh.get_assure(cin)
        except DigiHealthCircuitOpenError:
            response_text = "Le service est temporairement indisponible. Un conseiller vous rappellera sous peu."
            return await self._escalate(session, response_text, "DIGIHEALTH_UNAVAILABLE")
        except Exception:
            session["auth_attempts"] = session.get("auth_attempts", 0) + 1
            if session["auth_attempts"] >= settings.AUTH_MAX_ATTEMPTS:
                return await self._lockout(session)
            response_text = f"Ce numéro de CIN est introuvable. Tentative {session['auth_attempts']}/{settings.AUTH_MAX_ATTEMPTS}."
            session["messages"].append({"role": "assistant", "content": response_text})
            await self._save(session)
            return self._result(response_text, ConvState.PENDING_CIN, session)

        # CIN found — send OTP
        otp = __import__("app.core.security", fromlist=["generate_otp"]).generate_otp()
        await store_otp(self.session_id, otp)

        phone = assure.telephone or ""
        if phone:
            await self._sms.send_otp(phone, otp)
        else:
            # Dev fallback: log OTP (never in production)
            logger.info("otp_dev_fallback", otp=otp, session=self.session_id)

        session["state"] = ConvState.PENDING_OTP
        session["assure"] = assure.model_dump()
        response_text = (
            f"Merci, {assure.prenom}. Un code à 6 chiffres vient d'être envoyé "
            f"sur votre téléphone enregistré. Veuillez le saisir ci-dessous."
        )
        session["messages"].append({"role": "assistant", "content": response_text})
        await self._save(session)
        return self._result(response_text, ConvState.PENDING_OTP, session, assure=assure.model_dump())

    async def _handle_otp(self, otp: str, session: dict[str, Any]) -> dict[str, Any]:
        otp = otp.strip().replace(" ", "")

        valid = await verify_and_consume_otp(self.session_id, otp)
        if not valid:
            session["auth_attempts"] = session.get("auth_attempts", 0) + 1
            if session["auth_attempts"] >= settings.AUTH_MAX_ATTEMPTS:
                return await self._lockout(session)
            remaining = settings.AUTH_MAX_ATTEMPTS - session["auth_attempts"]
            response_text = f"Code incorrect. Il vous reste {remaining} tentative(s)."
            session["messages"].append({"role": "assistant", "content": response_text})
            await self._save(session)
            return self._result(response_text, ConvState.PENDING_OTP, session)

        assure = session["assure"]
        session["state"] = ConvState.AUTHENTICATED
        session["auth_attempts"] = 0
        conversations_active.inc()

        response_text = (
            f"Parfait, votre identité est vérifiée. Bonjour {assure['prenom']} {assure['nom']} !\n"
            "Comment puis-je vous aider aujourd'hui ?"
        )
        session["messages"].append({"role": "assistant", "content": response_text})
        await self._save(session)
        return self._result(response_text, ConvState.AUTHENTICATED, session, assure=assure)

    async def _lockout(self, session: dict[str, Any]) -> dict[str, Any]:
        session["state"] = ConvState.LOCKED
        response_text = (
            "Trop de tentatives incorrectes. Votre session est temporairement bloquée. "
            "Veuillez contacter l'ARS au 71 000 000 ou réessayer dans 15 minutes."
        )
        session["messages"].append({"role": "assistant", "content": response_text})
        await self._save(session)
        return self._result(response_text, ConvState.LOCKED, session)

    # ── Authenticated LLM pipeline ────────────────────────────────────────────

    async def _handle_authenticated(self, user_text: str, session: dict[str, Any]) -> dict[str, Any]:
        # Sentiment analysis
        sentiment = await analyze_sentiment(user_text)

        # Escalation check before LLM
        should_escalate, escalation_reason = self._check_escalation_rules(
            session, user_text, sentiment
        )
        if should_escalate:
            return await self._escalate(session, None, escalation_reason)

        # Build LLM messages (limit history to last 20 turns for context window management)
        llm_messages = session["messages"][-20:]

        # Inject assure context into system (via first user message metadata trick)
        assure = session.get("assure", {})
        context_injection = {
            "role": "user",
            "content": f"[CONTEXTE ASSURÉ AUTHENTIFIÉ: {assure.get('prenom', '')} {assure.get('nom', '')} (ID: {assure.get('id', '')}, CIN: {assure.get('cin', '')}, Couverture: {assure.get('statut_couverture', '')})]",
        }

        full_messages = [context_injection] + llm_messages

        tool_results = []
        max_tool_rounds = 5  # Prevent infinite loops

        for _round in range(max_tool_rounds):
            result = await llm_chat(full_messages)
            tool_calls = extract_tool_calls(result)

            if not tool_calls:
                # Final text response
                text = extract_text_from_response(result)
                session["messages"].append({"role": "assistant", "content": text})

                # Update sentiment
                if sentiment:
                    session["sentiment_score"] = sentiment.get("score", 0.0)
                    session["sentiment_label"] = sentiment.get("label", "NEUTRE")

                await self._save(session)
                return self._result(text, ConvState.AUTHENTICATED, session, sentiment=sentiment, tool_calls=tool_results)

            # Execute tool calls
            tool_result_messages = []
            for tc in tool_calls:
                tool_output = await self._execute_tool(tc["name"], tc["input"], session)
                tool_results.append({"name": tc["name"], "output": tool_output})
                tool_result_messages.append({
                    "role": "tool",
                    "name": tc["name"],
                    "content": json.dumps(tool_output, default=str),
                })
                # Update session if tool modified state
                if tc["name"] == "create_crm_ticket" and "ticket_id" in tool_output:
                    session["ticket_id"] = tool_output["ticket_id"]

            full_messages = full_messages + [
                {"role": "assistant", "content": json.dumps([{"type": "tool_use", **tc} for tc in tool_calls], default=str)},
                *tool_result_messages,
            ]

        # Fallback if max tool rounds reached
        text = "Je suis désolé, je n'ai pas pu traiter votre demande complètement. Voulez-vous être mis en relation avec un conseiller ?"
        session["messages"].append({"role": "assistant", "content": text})
        await self._save(session)
        return self._result(text, ConvState.AUTHENTICATED, session)

    # ── Tool executor ─────────────────────────────────────────────────────────

    async def _execute_tool(self, name: str, inputs: dict[str, Any], session: dict[str, Any]) -> dict[str, Any]:
        logger.info("tool_call", tool=name, session=self.session_id)
        assure = session.get("assure", {})
        assure_id = assure.get("id", "")
        assure_cin = assure.get("cin", "")
        assure_nom = f"{assure.get('prenom', '')} {assure.get('nom', '')}".strip()

        try:
            if name == "query_digihealth_dossier":
                data = await self._dh.get_assure(inputs.get("assure_id", assure_cin))
                return data.model_dump()

            if name == "query_digihealth_reclamations":
                recs = await self._dh.get_reclamations(inputs.get("assure_id", assure_id))
                return {"reclamations": [r.model_dump() for r in recs]}

            if name == "query_digihealth_remboursements":
                rembs = await self._dh.get_remboursements(inputs.get("assure_id", assure_id))
                return {"remboursements": [r.model_dump() for r in rembs]}

            if name == "query_digihealth_eligibilite":
                elig = await self._dh.get_eligibilite(
                    inputs.get("assure_id", assure_id),
                    inputs.get("type_prestation", "general"),
                )
                return elig.model_dump()

            if name == "create_crm_ticket":
                crm_payload = {
                    "source": "AGENT_IA",
                    "channel": session.get("channel", "CHAT_WEB"),
                    "assure_cin": inputs.get("assure_cin", assure_cin),
                    "assure_nom_complet": inputs.get("assure_nom_complet", assure_nom),
                    "category": inputs["category"],
                    "priority": inputs["priority"],
                    "subject": inputs["subject"],
                    "description": inputs["description"],
                    "conversation_id": self.conversation_id,
                }
                crm_resp = await self._crm.create_ticket(crm_payload)
                return {"success": True, "ticket_id": crm_resp.get("id"), "reference": crm_resp.get("id")}

            if name == "query_knowledge_base":
                chunks = await self._rag.query(inputs["query"])
                return {"results": chunks}

            if name == "generate_conversation_summary":
                return {
                    "summary_requested": True,
                    "motif": inputs.get("motif_principal"),
                    "resultat": inputs.get("resultat"),
                }

            return {"error": f"Outil inconnu: {name}"}

        except DigiHealthCircuitOpenError:
            return {"error": "Service DigiHealth temporairement indisponible", "retry_later": True}
        except Exception as exc:
            logger.error("tool_execution_error", tool=name, error=str(exc))
            return {"error": str(exc)}

    # ── Escalation ────────────────────────────────────────────────────────────

    def _check_escalation_rules(
        self, session: dict[str, Any], user_text: str, sentiment: dict[str, Any]
    ) -> tuple[bool, str | None]:
        # Rule 1: Explicit request
        human_keywords = ["agent", "conseiller", "humain", "personne", "responsable", "directeur"]
        if any(kw in user_text.lower() for kw in human_keywords):
            return True, "USER_REQUESTED"

        # Rule 2: Negative sentiment threshold
        score = sentiment.get("score", 0.0)
        if score < -0.6:
            msg_count = len([m for m in session["messages"] if m["role"] == "user"])
            if msg_count >= 2:
                return True, "NEGATIVE_SENTIMENT"

        # Rule 3: Too many unresolved turns
        user_msg_count = len([m for m in session["messages"] if m["role"] == "user"])
        if user_msg_count >= settings.SMS_OTP_MAX_ATTEMPTS * 4:  # configurable
            return True, "MAX_TURNS_REACHED"

        return False, None

    async def _escalate(
        self,
        session: dict[str, Any],
        pre_message: str | None,
        reason: str,
    ) -> dict[str, Any]:
        session["state"] = ConvState.ESCALATED
        conversations_escalated.labels(reason=reason).inc()
        conversations_active.dec()

        escalate_text = pre_message or (
            "Je vous transfère vers un conseiller ARS disponible qui prendra en charge votre demande. "
            "Votre dossier et l'historique de notre conversation lui seront transmis. "
            "Ne raccrochez pas / restez connecté."
        )
        session["messages"].append({"role": "assistant", "content": escalate_text})
        session["escalation_reason"] = reason
        await self._save(session)

        # Trigger async post-processing
        await self._post_process(session, "ESCALADE")

        return self._result(
            escalate_text,
            ConvState.ESCALATED,
            session,
            should_escalate=True,
            escalation_reason=reason,
        )

    # ── Post-processing (summary + email + ticket) ────────────────────────────

    async def _post_process(self, session: dict[str, Any], result: str) -> None:
        """Run asynchronously — generates summary, email, updates DB."""
        try:
            await generate_summary_and_email(
                conversation_id=self.conversation_id,
                session=session,
                result=result,
            )
        except Exception as exc:
            logger.error("post_process_error", error=str(exc), conversation_id=self.conversation_id)

    async def close(self) -> dict[str, Any]:
        """Explicitly close a conversation."""
        session = await self._load()
        session["state"] = ConvState.CLOSED
        await self._post_process(session, "RESOLU")
        conversations_resolved.inc()
        conversations_active.dec()
        close_text = "Merci d'avoir contacté l'ARS Tunisie. Bonne journée !"
        session["messages"].append({"role": "assistant", "content": close_text})
        await self._save(session)
        await delete_session(self.session_id)
        return self._result(close_text, ConvState.CLOSED, session)

    # ── Result builder ────────────────────────────────────────────────────────

    @staticmethod
    def _result(
        text: str,
        state: ConvState,
        session: dict[str, Any],
        sentiment: dict[str, Any] | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        should_escalate: bool = False,
        escalation_reason: str | None = None,
        assure: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "text": text,
            "state": state.value,
            "sentiment": sentiment or {"score": session.get("sentiment_score", 0.0), "label": session.get("sentiment_label", "NEUTRE")},
            "tool_calls": tool_calls or [],
            "should_escalate": should_escalate,
            "escalation_reason": escalation_reason,
            "assure": assure,
        }