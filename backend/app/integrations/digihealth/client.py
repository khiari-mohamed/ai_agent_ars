from __future__ import annotations

import time
from typing import Any

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.cache import cache_get, cache_set
from app.core.circuit_breaker import get_breaker
from app.core.config import settings
from app.core.exceptions import DigiHealthError, DigiHealthCircuitOpenError
from app.core.logging import get_logger
from app.core.metrics import digihealth_request_duration, digihealth_errors
from app.integrations.digihealth.models import (
    AssureDigiHealth, EligibiliteDigiHealth,
    ReclamationDigiHealth, RemboursementDigiHealth,
)

logger = get_logger(__name__)

_token_cache: dict[str, Any] = {}


class DigiHealthClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=settings.DIGIHEALTH_BASE_URL,
            timeout=settings.DIGIHEALTH_TIMEOUT_SECONDS,
            headers={"User-Agent": "ARS-Agent-IA/1.0", "Accept": "application/json"},
        )
        self._breaker = get_breaker(
            "digihealth",
            failure_threshold=settings.DIGIHEALTH_CIRCUIT_BREAKER_THRESHOLD,
            reset_timeout=30.0,
        )

    async def _get_access_token(self) -> str:
        """OAuth2 client credentials token with in-memory cache."""
        global _token_cache
        now = time.time()
        if _token_cache.get("expires_at", 0) > now + 60:
            return str(_token_cache["access_token"])

        resp = await self._http.post(
            "/oauth/token",
            data={
                "grant_type": "client_credentials",
                "client_id": settings.DIGIHEALTH_CLIENT_ID,
                "client_secret": settings.DIGIHEALTH_CLIENT_SECRET,
            },
        )
        resp.raise_for_status()
        data: dict[str, Any] = resp.json()
        _token_cache = {
            "access_token": data["access_token"],
            "expires_at": now + data.get("expires_in", 3600),
        }
        return str(data["access_token"])

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        token = await self._get_access_token()
        headers = {"Authorization": f"Bearer {token}"}
        start = time.monotonic()
        try:
            resp = await self._http.request(method, path, headers=headers, **kwargs)
            resp.raise_for_status()
            result: dict[str, Any] = resp.json()
            digihealth_request_duration.labels(endpoint=path).observe(time.monotonic() - start)
            return result
        except httpx.HTTPStatusError as exc:
            digihealth_errors.labels(status_code=str(exc.response.status_code)).inc()
            logger.error("digihealth_http_error", path=path, status=exc.response.status_code)
            raise DigiHealthError(f"DigiHealth {exc.response.status_code}: {path}") from exc
        except httpx.TimeoutException as exc:
            digihealth_errors.labels(status_code="timeout").inc()
            logger.error("digihealth_timeout", path=path)
            raise DigiHealthError("DigiHealth timeout") from exc

    @retry(
        retry=retry_if_exception_type(DigiHealthError),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def _request_with_retry(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        return await self._breaker.call(self._request, method, path, **kwargs)

    async def get_assure(self, cin: str) -> AssureDigiHealth:
        cache_key = f"assure:{cin}"
        cached = await cache_get(cache_key)
        if cached:
            return AssureDigiHealth.model_validate(cached)

        data = await self._request_with_retry("GET", f"/assures/{cin}")
        assure = AssureDigiHealth.model_validate(data)
        await cache_set(cache_key, data, ttl=settings.REDIS_CACHE_TTL_SECONDS)
        return assure

    async def get_reclamations(self, assure_id: str, page: int = 1, limit: int = 10) -> list[ReclamationDigiHealth]:
        data = await self._request_with_retry(
            "GET", f"/assures/{assure_id}/reclamations",
            params={"page": page, "limit": limit},
        )
        items: list[Any] = data.get("items", data) if isinstance(data, dict) else data
        return [ReclamationDigiHealth.model_validate(i) for i in items]

    async def get_remboursements(self, assure_id: str, page: int = 1, limit: int = 10) -> list[RemboursementDigiHealth]:
        data = await self._request_with_retry(
            "GET", f"/assures/{assure_id}/remboursements",
            params={"page": page, "limit": limit},
        )
        items: list[Any] = data.get("items", data) if isinstance(data, dict) else data
        return [RemboursementDigiHealth.model_validate(i) for i in items]

    async def get_eligibilite(self, assure_id: str, type_prestation: str) -> EligibiliteDigiHealth:
        cache_key = f"eligibilite:{assure_id}:{type_prestation}"
        cached = await cache_get(cache_key)
        if cached:
            return EligibiliteDigiHealth.model_validate(cached)

        data = await self._request_with_retry(
            "GET", f"/assures/{assure_id}/eligibilite",
            params={"type_prestation": type_prestation},
        )
        elig = EligibiliteDigiHealth.model_validate(data)
        await cache_set(cache_key, data, ttl=settings.REDIS_CACHE_TTL_SECONDS * 3)
        return elig

    async def create_reclamation(self, assure_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._request_with_retry("POST", "/reclamations", json={**payload, "assure_id": assure_id})

    async def aclose(self) -> None:
        await self._http.aclose()


# Mock client for development (when DigiHealth credentials are not available)
class DigiHealthMockClient(DigiHealthClient):
    async def _get_access_token(self) -> str:
        return "mock-token"

    async def _request_with_retry(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        import uuid, random
        logger.info("digihealth_mock_request", method=method, path=path)

        if "/reclamations" in path and method == "GET":
            return {"items": [
                {"id": str(uuid.uuid4()), "date": "2026-01-15", "motif": "Remboursement refusé", "statut": "EN_COURS", "montant": 120.0},
            ]}
        if "/remboursements" in path:
            return {"items": [
                {"id": str(uuid.uuid4()), "date": "2026-03-10", "montant": 85.5, "statut": "REMBOURSE", "prestataire": "Clinique El Manar"},
            ]}
        if "/eligibilite" in path:
            return {"eligible": True, "plafond": 5000.0, "exclusions": [], "validite": "2026-12-31"}
        if "/reclamations" in path and method == "POST":
            return {"id": str(uuid.uuid4()), "reference": f"REC-{random.randint(10000,99999)}", "statut": "ENREGISTREE"}
        # Default: assure lookup
        cin = path.split("/")[-1]
        return {
            "id": str(uuid.uuid4()), "cin": cin, "numero_assure": f"AS{cin}",
            "nom": "Ben Ali", "prenom": "Fatma",
            "date_naissance": "1985-03-12",
            "email": "fatma.benali@example.tn", "telephone": "+21698000000",
            "statut_couverture": "ACTIF", "caisse": "CNSS",
        }


def get_digihealth_client() -> DigiHealthClient:
    if settings.DIGIHEALTH_CLIENT_ID:
        return DigiHealthClient()
    return DigiHealthMockClient()