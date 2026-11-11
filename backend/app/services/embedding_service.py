from __future__ import annotations

import asyncio
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from app.core.config import settings
from app.core.exceptions import EmbeddingError, ValidationError
from app.core.logging import get_logger
from app.core.metrics import embedding_duration
from app.models.db.knowledge_doc import EMBEDDING_DIM as SCHEMA_EMBEDDING_DIM

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = get_logger(__name__)


class EmbeddingService:
    """Local dense embeddings (BGE-M3 → 1024-d, L2-normalised, so dot == cosine).

    - The model is loaded once (lazily or via `load()` at startup) in a worker thread.
    - Inference runs on a single dedicated thread: calls are serialised, the event loop
      is never blocked, and the model is never used concurrently.
    - BGE-M3 needs no query/passage prefixes.
    """

    def __init__(
        self,
        *,
        model_name: str,
        dimension: int,
        device: str,
        batch_size: int,
        max_seq_length: int,
        cache_dir: str | None = None,
    ) -> None:
        self._model_name = model_name
        self._dimension = dimension
        self._device = device
        self._batch_size = batch_size
        self._max_seq_length = max_seq_length
        self._cache_dir = cache_dir or None

        self._model: SentenceTransformer | None = None
        self._load_lock = asyncio.Lock()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="embedding")

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Loading ──────────────────────────────────────────────────────────────
    def _resolve_device(self, torch_module: Any) -> str:
        if self._device == "auto":
            return "cuda" if torch_module.cuda.is_available() else "cpu"
        if self._device == "cuda" and not torch_module.cuda.is_available():
            raise EmbeddingError("EMBEDDING_DEVICE=cuda mais aucun GPU CUDA n'est disponible")
        return self._device

    def _load_sync(self) -> SentenceTransformer:
        if self._dimension != SCHEMA_EMBEDDING_DIM:
            raise EmbeddingError(
                f"EMBEDDING_DIM={self._dimension} ≠ dimension du schéma ({SCHEMA_EMBEDDING_DIM}); "
                "une migration + ré-ingestion est nécessaire pour changer de dimension"
            )
        try:
            import torch
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise EmbeddingError(
                "torch / sentence-transformers ne sont pas installés"
            ) from exc

        device = self._resolve_device(torch)
        started = time.perf_counter()
        model = SentenceTransformer(
            self._model_name, device=device, cache_folder=self._cache_dir
        )
        model.max_seq_length = self._max_seq_length
        if device == "cuda":
            model.half()

        actual_dim = model.get_sentence_embedding_dimension()
        if actual_dim != self._dimension:
            raise EmbeddingError(
                f"Le modèle {self._model_name} produit {actual_dim} dimensions, "
                f"{self._dimension} attendues"
            )
        logger.info(
            "embedding_model_loaded",
            model=self._model_name,
            device=device,
            dim=actual_dim,
            seconds=round(time.perf_counter() - started, 1),
        )
        return model

    async def load(self) -> None:
        """Idempotent. Call at startup to avoid paying the load on the first request."""
        if self._model is not None:
            return
        async with self._load_lock:
            if self._model is None:
                loop = asyncio.get_running_loop()
                try:
                    self._model = await loop.run_in_executor(self._executor, self._load_sync)
                except EmbeddingError:
                    raise
                except Exception as exc:
                    logger.error("embedding_model_load_failed", error=str(exc), exc_info=True)
                    raise EmbeddingError(
                        f"Impossible de charger le modèle {self._model_name}"
                    ) from exc

    # ── Inference ────────────────────────────────────────────────────────────
    def _encode_sync(self, texts: list[str]) -> list[list[float]]:
        assert self._model is not None
        vectors = self._model.encode(
            texts,
            batch_size=self._batch_size,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )
        return vectors.astype("float32").tolist()  # type: ignore[no-any-return]

    async def _encode(self, texts: list[str], kind: str) -> list[list[float]]:
        await self.load()
        started = time.perf_counter()
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(self._executor, self._encode_sync, texts)
        except EmbeddingError:
            raise
        except Exception as exc:
            logger.error("embedding_failed", kind=kind, error=str(exc), exc_info=True)
            raise EmbeddingError("Échec du calcul des embeddings") from exc
        finally:
            embedding_duration.labels(kind=kind).observe(time.perf_counter() - started)

    async def embed_query(self, text: str) -> list[float]:
        if not text or not text.strip():
            raise ValidationError("Le texte à encoder est vide")
        return (await self._encode([text.strip()], "query"))[0]

    async def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        cleaned = [t.strip() if t else "" for t in texts]
        if any(not t for t in cleaned):
            raise ValidationError("Un des documents à encoder est vide")
        return await self._encode(cleaned, "documents")

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


@lru_cache(maxsize=1)
def get_embedding_service() -> EmbeddingService:
    return EmbeddingService(
        model_name=settings.EMBEDDING_MODEL,
        dimension=settings.EMBEDDING_DIM,
        device=settings.EMBEDDING_DEVICE,
        batch_size=settings.EMBEDDING_BATCH_SIZE,
        max_seq_length=settings.EMBEDDING_MAX_SEQ_LENGTH,
        cache_dir=settings.EMBEDDING_CACHE_DIR,
    )