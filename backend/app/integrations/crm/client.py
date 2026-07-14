from __future__ import annotations

import time
from typing import Any
from uuid import UUID

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings
from app.core.exceptions import CRMError
from app.core.logging import get_logger

logger = get_logger(__name__)


class CRMClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=settings.CRM_BASE_URL,
            timeout=settings.CRM_TIMEOUT_SECONDS,
            headers={
                "Authorization": f"Bearer {settings.CRM_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "ARS-Agent-IA/1.0",
            },
        )

    @retry(
        retry=retry_if_exception_type(CRMError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def create_ticket(self, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = await self._http.post("/tickets", json=payload)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            logger.info("crm_ticket_created", crm_id=data.get("id"))
            return data
        except httpx.HTTPStatusError as exc:
            logger.error("crm_error", status=exc.response.status_code, body=exc.response.text[:200])
            raise CRMError(f"CRM {exc.response.status_code}") from exc
        except httpx.TimeoutException as exc:
            raise CRMError("CRM timeout") from exc

    async def update_ticket(self, crm_id: str, data: dict[str, Any]) -> dict[str, Any]:
        try:
            resp = await self._http.patch(f"/tickets/{crm_id}", json=data)
            resp.raise_for_status()
            result: dict[str, Any] = resp.json()
            return result
        except httpx.HTTPStatusError as exc:
            raise CRMError(f"CRM update {exc.response.status_code}") from exc

    async def aclose(self) -> None:
        await self._http.aclose()


class CRMMockClient(CRMClient):
    async def create_ticket(self, payload: dict[str, Any]) -> dict[str, Any]:
        import random
        crm_id = f"TKT-{random.randint(100000, 999999)}"
        logger.info("crm_mock_ticket_created", crm_id=crm_id)
        return {"id": crm_id, "status": "NOUVEAU", **payload}

    async def update_ticket(self, crm_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return {"id": crm_id, **data}


def get_crm_client() -> CRMClient:
    if settings.CRM_API_KEY:
        return CRMClient()
    return CRMMockClient()