from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import structlog

from app.core.security import sign_audit_event

logger = structlog.get_logger(__name__)


class AuditLogger:
    """
    Write audit events. This class is intentionally synchronous-first
    and is called from async context via the repo.
    All events are HMAC-signed before insertion.
    """

    @staticmethod
    def build_event(
        event_type: str,
        actor_type: str,
        actor_id: str,
        action: str,
        resource: str,
        result: str,
        ip_address: str,
        conversation_id: str | UUID | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        import uuid as _uuid

        event_id = str(_uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        details_str = json.dumps(details or {}, default=str)

        signature = sign_audit_event(event_id, timestamp, event_type, details_str)

        return {
            "id": event_id,
            "timestamp": timestamp,
            "event_type": event_type,
            "actor_type": actor_type,
            "actor_id": str(actor_id),
            "conversation_id": str(conversation_id) if conversation_id else None,
            "action": action,
            "resource": resource,
            "result": result,
            "ip_address": ip_address,
            "details": details or {},
            "hmac_signature": signature,
        }


# Singleton instance
audit = AuditLogger()