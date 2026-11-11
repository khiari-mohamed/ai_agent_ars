import uuid

import pytest

from app.services.hybrid_ranking import Candidate, fuse_scores, rank_candidates


def make(dense, lexical, *, content_hash=None, language="fr", key=None):
    return Candidate(
        chunk_id=uuid.uuid4(),
        doc_id=uuid.uuid4(),
        external_id=key,
        row_no=None,
        content="c",
        title=None,
        question="q",
        response_title=None,
        answer="a",
        intent=None,
        language=language,
        content_hash=content_hash,
        no_response=False,
        dense_score=dense,
        lexical_score=lexical,
    )


def test_fuse_scores_weights_and_clamping():
    assert fuse_scores(0.8, 0.5, dense_weight=0.7, lexical_weight=0.3) == pytest.approx(0.71)
    assert fuse_scores(1.4, -0.2, dense_weight=0.7, lexical_weight=0.3) == pytest.approx(0.7)


def test_lexical_signal_can_rescue_a_weak_dense_match():
    dense_only = make(0.55, 0.0)
    both = make(0.50, 0.9)
    ranked = rank_candidates(
        [dense_only, both], dense_weight=0.7, lexical_weight=0.3, top_k=2
    )
    assert ranked[0].chunk_id == both.chunk_id


def test_dedupes_identical_content_within_a_language():
    a = make(0.9, 0.9, content_hash="h1")
    b = make(0.8, 0.8, content_hash="h1")
    c = make(0.7, 0.7, content_hash="h2")
    ranked = rank_candidates([b, a, c], dense_weight=0.7, lexical_weight=0.3, top_k=5)
    assert [r.chunk_id for r in ranked] == [a.chunk_id, c.chunk_id]


def test_same_hash_in_other_language_is_kept():
    fr = make(0.9, 0.9, content_hash="h1", language="fr")
    tn = make(0.8, 0.8, content_hash="h1", language="tn")
    assert len(rank_candidates([fr, tn], dense_weight=0.7, lexical_weight=0.3, top_k=5)) == 2


def test_min_score_and_top_k():
    items = [make(0.9, 0.9), make(0.6, 0.2), make(0.2, 0.0)]
    ranked = rank_candidates(
        items, dense_weight=0.7, lexical_weight=0.3, top_k=2, min_score=0.4
    )
    assert len(ranked) == 2
    assert all(r.score >= 0.4 for r in ranked)
    assert ranked[0].score >= ranked[1].score