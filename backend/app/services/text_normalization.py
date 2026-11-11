from __future__ import annotations

import re
import unicodedata

_NON_WORD = re.compile(r"[\W_]+", re.UNICODE)
_TATWEEL = "\u0640"


def normalize_for_search(text: str) -> str:
    """Normalisation for the lexical side of the hybrid search.

    Applied identically to indexed text (at ingestion) and to queries, so pg_trgm
    compares like with like: casefold, strip Latin accents and Arabic diacritics,
    drop tatweel, replace punctuation with spaces, collapse whitespace. Digits are
    kept — they carry meaning in Arabizi (3, 7, 9, 5, 2, 8) and in amounts/numbers.
    """
    decomposed = unicodedata.normalize("NFKD", text).casefold()
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    stripped = stripped.replace(_TATWEEL, "")
    return " ".join(_NON_WORD.sub(" ", stripped).split())