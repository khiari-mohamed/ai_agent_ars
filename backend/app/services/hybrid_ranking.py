from __future__ import annotations

import uuid
from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class Candidate:
    """A chunk retrieved by the dense and/or lexical search, with both raw scores."""

    chunk_id: uuid.UUID
    doc_id: uuid.UUID
    external_id: str | None
    row_no: int | None
    content: str
    title: str | None
    question: str
    response_title: str | None
    answer: str
    intent: str | None
    language: str | None
    content_hash: str | None
    no_response: bool
    dense_score: float
    lexical_score: float
    score: float = 0.0


def _clamp01(value: float) -> float:
    return min(max(value, 0.0), 1.0)


def fuse_scores(
    dense: float, lexical: float, *, dense_weight: float, lexical_weight: float
) -> float:
    """Weighted sum of the dense cosine similarity and the lexical trigram similarity,
    both clamped to [0, 1] so the result stays in [0, dense_weight + lexical_weight]."""
    return dense_weight * _clamp01(dense) + lexical_weight * _clamp01(lexical)


def rank_candidates(
    candidates: list[Candidate],
    *,
    dense_weight: float,
    lexical_weight: float,
    top_k: int,
    min_score: float | None = None,
) -> list[Candidate]:
    """Fuse, sort (best first, deterministic ties), drop results below `min_score` and
    keep one result per (language, content_hash) — rows with identical content would
    otherwise crowd out the top-k."""
    scored = [
        replace(
            c,
            score=fuse_scores(
                c.dense_score,
                c.lexical_score,
                dense_weight=dense_weight,
                lexical_weight=lexical_weight,
            ),
        )
        for c in candidates
    ]
    scored.sort(key=lambda c: (-c.score, -c.dense_score, str(c.chunk_id)))

    seen: set[tuple[str | None, str]] = set()
    ranked: list[Candidate] = []
    for c in scored:
        if min_score is not None and c.score < min_score:
            break  # sorted descending: everything after is lower
        key = (c.language, c.content_hash or str(c.doc_id))
        if key in seen:
            continue
        seen.add(key)
        ranked.append(c)
        if len(ranked) >= top_k:
            break
    return ranked