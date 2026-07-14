from __future__ import annotations

from fastapi import APIRouter, Response

from app.core.metrics import REGISTRY, generate_latest, CONTENT_TYPE_LATEST

router = APIRouter(tags=["observability"])


@router.get("/metrics", include_in_schema=False)
async def prometheus_metrics() -> Response:
    """Prometheus scrape endpoint — restrict access in production via network rules."""
    data = generate_latest(REGISTRY)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)