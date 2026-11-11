from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.knowledge_repo import KnowledgeRepository
from app.db.session import get_db
from app.models.schemas.knowledge import (
    KnowledgeDocCreate,
    KnowledgeDocOut,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    Language,
)
from app.routers.dependencies import require_role
from app.services.rag_service import RAGService

router = APIRouter(prefix="/admin/knowledge", tags=["admin-knowledge"])


@router.get(
    "",
    response_model=list[KnowledgeDocOut],
    dependencies=[Depends(require_role("ADMIN", "SUPERVISEUR", "AGENT"))],
)
async def list_knowledge_docs(
    intent: str | None = None,
    language: Language | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[KnowledgeDocOut]:
    docs = await KnowledgeRepository(db).list_docs(
        intent=intent, language=language, limit=limit, offset=offset
    )
    return [KnowledgeDocOut.model_validate(d) for d in docs]


@router.post(
    "",
    response_model=KnowledgeDocOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role("ADMIN", "SUPERVISEUR"))],
)
async def create_knowledge_doc(
    payload: KnowledgeDocCreate,
    db: AsyncSession = Depends(get_db),
) -> KnowledgeDocOut:
    """Adds (or, with an existing external_id, updates) a doc on the fly, e.g. a manual
    correction by an ARS agent. Bulk loads go through scripts/ingest_rag_data.py."""
    doc_id = await RAGService(db).ingest_document(
        question=payload.question,
        answer=payload.answer,
        source=payload.source,
        intent=payload.intent,
        language=payload.language,
        external_id=payload.external_id,
        title=payload.title,
        metadata=payload.metadata,
    )
    await db.commit()
    doc = await KnowledgeRepository(db).get_doc(uuid.UUID(doc_id))
    if doc is None:  # pragma: no cover - committed one line above
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Document non persisté")
    return KnowledgeDocOut.model_validate(doc)


@router.delete(
    "/{doc_id}",
    response_class=Response,
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role("ADMIN"))],
)
async def delete_knowledge_doc(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> Response:
    repo = KnowledgeRepository(db)
    if await repo.get_doc(doc_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document introuvable")
    await repo.delete_doc(doc_id)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/search",
    response_model=KnowledgeSearchResponse,
    dependencies=[Depends(require_role("ADMIN", "SUPERVISEUR", "AGENT"))],
)
async def search_knowledge(
    payload: KnowledgeSearchRequest,
    db: AsyncSession = Depends(get_db),
) -> KnowledgeSearchResponse:
    """Debug/QA endpoint: returns dense, lexical and fused scores for every hit. With
    no `min_score`, nothing is filtered, so it can be used to calibrate RAG_MIN_SCORE."""
    return await RAGService(db).search(
        payload.query,
        top_k=payload.top_k,
        intent_filter=payload.intent_filter,
        min_score=payload.min_score,
        language=payload.language,
        answerable_only=payload.answerable_only,
    )