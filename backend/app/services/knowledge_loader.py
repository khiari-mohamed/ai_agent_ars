from __future__ import annotations

import json
import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from pydantic import ValidationError as PydanticValidationError

from app.models.schemas.knowledge import KnowledgeIngestRecord

DEFAULT_SOURCE = "ars_excel"

LANGUAGE_ALIASES: dict[str, str] = {
    "fr": "fr",
    "french": "fr",
    "francais": "fr",
    "français": "fr",
    "tn": "tn",
    "ar": "tn",
    "ar-tn": "tn",
    "ar_tn": "tn",
    "darija": "tn",
    "tunisian": "tn",
}


class RecordParseError(ValueError):
    """The record is malformed — the ingestion must stop."""


class EmptyRecordError(RecordParseError):
    """The record has nothing to embed — it is skipped, not fatal."""


def _clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def _to_int(value: object) -> int | None:
    text = _clean(value)
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError as exc:
        raise RecordParseError(f"row_no invalide: {value!r}") from exc


def parse_record(raw: dict[str, Any], *, source: str = DEFAULT_SOURCE) -> KnowledgeIngestRecord:
    """Map one line of rag_knowledge_base.jsonl to a KnowledgeIngestRecord.

    Fields used: id, row_no, lang, type, title, complaint, response_title, response,
    text, content_hash, has_audio, no_response, n_clips, spoken_examples, audio.
    """
    external_id = _clean(raw.get("id"))
    if not external_id:
        raise RecordParseError("champ 'id' manquant")

    raw_lang = _clean(raw.get("lang")).lower()
    language = LANGUAGE_ALIASES.get(raw_lang)
    if language is None:
        raise RecordParseError(
            f"{external_id}: langue inconnue {raw.get('lang')!r} "
            f"(attendu: {sorted(set(LANGUAGE_ALIASES))})"
        )

    title = _clean(raw.get("title"))
    complaint = _clean(raw.get("complaint"))
    response = _clean(raw.get("response"))
    embed_text = _clean(raw.get("text")) or "\n".join(p for p in (title, complaint) if p)
    question = complaint or title or embed_text
    if not embed_text:
        raise EmptyRecordError(f"{external_id}: aucun texte à indexer")

    metadata: dict[str, Any] = {}
    for key in ("n_clips", "spoken_examples", "audio"):
        value = raw.get(key)
        if value not in (None, "", [], {}):
            metadata[key] = value

    try:
        return KnowledgeIngestRecord(
            external_id=external_id,
            row_no=_to_int(raw.get("row_no")),
            source=source,
            language=language,
            intent=_clean(raw.get("type")) or None,
            title=title or None,
            question=question,
            response_title=_clean(raw.get("response_title")) or None,
            answer=response,
            embed_text=embed_text,
            content_hash=_clean(raw.get("content_hash")) or None,
            has_audio=bool(raw.get("has_audio")),
            no_response=bool(raw.get("no_response")) or not response,
            metadata=metadata or None,
        )
    except PydanticValidationError as exc:
        details = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise RecordParseError(f"{external_id}: {details}") from exc


def iter_jsonl(path: Path) -> Iterator[tuple[int, dict[str, Any]]]:
    with path.open(encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                value = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise RecordParseError(f"ligne {line_no}: JSON invalide ({exc})") from exc
            if not isinstance(value, dict):
                raise RecordParseError(f"ligne {line_no}: un objet JSON est attendu")
            yield line_no, value


def load_records(
    path: Path, *, source: str = DEFAULT_SOURCE
) -> tuple[list[KnowledgeIngestRecord], list[str]]:
    """Returns (records, skipped_reasons). Any malformed record or duplicate id raises
    RecordParseError — a partial/ambiguous load must never reach the database."""
    records: list[KnowledgeIngestRecord] = []
    skipped: list[str] = []
    seen_ids: set[str] = set()

    for line_no, raw in iter_jsonl(path):
        try:
            record = parse_record(raw, source=source)
        except EmptyRecordError as exc:
            skipped.append(f"ligne {line_no}: {exc}")
            continue
        except RecordParseError as exc:
            raise RecordParseError(f"ligne {line_no}: {exc}") from exc

        assert record.external_id is not None
        if record.external_id in seen_ids:
            raise RecordParseError(f"ligne {line_no}: id dupliqué {record.external_id!r}")
        seen_ids.add(record.external_id)
        records.append(record)

    return records, skipped