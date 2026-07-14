from __future__ import annotations

import hashlib
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.knowledge_repo import KnowledgeRepository
from app.db.session import get_db
from app.routers.dependencies import get_current_user
from app.models.db.user import User
from app.services.rag_service import RAGService
from app.core.logging import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/admin/knowledge", tags=["admin-knowledge"])

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("")
async def list_documents(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[dict]:  # type: ignore[type-arg]
    repo = KnowledgeRepository(db)
    docs = await repo.list_docs()
    return [
        {
            "id": str(d.id),
            "title": d.title,
            "sourceUrl": d.source_url,
            "status": d.status,
            "chunkCount": d.chunk_count,
            "uploadedAt": d.uploaded_at.isoformat(),
        }
        for d in docs
    ]


@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict[str, str]:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"message": "Format non supporté. Utilisez PDF ou DOCX."},
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"message": "Fichier trop volumineux (max 10 Mo)"},
        )

    file_hash = hashlib.sha256(content).hexdigest()
    repo = KnowledgeRepository(db)

    # Check for duplicates
    existing = await repo.list_docs()
    for doc in existing:
        if doc.file_hash == file_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"message": "Ce document a déjà été indexé"},
            )

    doc = await repo.create_doc(title=file.filename or "Document sans titre", file_hash=file_hash)
    doc_id = str(doc.id)
    await db.commit()

    # Background indexing task
    import asyncio
    asyncio.create_task(_index_document(doc_id, content, file.content_type or "", file.filename or ""))

    return {"doc_id": doc_id, "status": "INDEXING"}


async def _index_document(doc_id: str, content: bytes, content_type: str, filename: str) -> None:
    """Background task: extract text, embed, store chunks."""
    from app.db.session import AsyncSessionLocal
    try:
        # Extract text
        text = ""
        if "pdf" in content_type:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(p.extract_text() or "" for p in reader.pages)
        else:
            import docx as python_docx
            doc = python_docx.Document(io.BytesIO(content))
            text = "\n".join(p.text for p in doc.paragraphs)

        if not text.strip():
            raise ValueError("Empty document")

        rag = RAGService()
        chunks = await rag.index_document(doc_id, text, filename)

        async with AsyncSessionLocal() as db:
            repo = KnowledgeRepository(db)
            await repo.add_chunks(uuid.UUID(doc_id), chunks)
            await db.commit()

        logger.info("document_indexed", doc_id=doc_id, chunks=len(chunks))
    except Exception as exc:
        logger.error("document_indexing_failed", doc_id=doc_id, error=str(exc))
        from sqlalchemy import update
        from app.models.db.knowledge_doc import KnowledgeDoc
        async with AsyncSessionLocal() as db:
            await db.execute(update(KnowledgeDoc).where(KnowledgeDoc.id == uuid.UUID(doc_id)).values(status="FAILED"))
            await db.commit()


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    repo = KnowledgeRepository(db)
    await repo.delete_doc(doc_id)