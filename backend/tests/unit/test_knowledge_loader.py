import json

import pytest

from app.services.knowledge_loader import (
    RecordParseError,
    load_records,
    parse_record,
)


def raw(**overrides):
    base = {
        "id": "ARS_0001_fr",
        "row_no": 1,
        "lang": "FR",
        "type": "remboursement",
        "title": "Remboursement en retard",
        "complaint": "Je n'ai pas reçu mon remboursement",
        "response_title": "Délais",
        "response": "Le délai est de 15 jours.",
        "text": "Remboursement en retard\nJe n'ai pas reçu mon remboursement",
        "content_hash": "abc",
        "has_audio": True,
        "n_clips": 2,
    }
    base.update(overrides)
    return base


def test_parse_french_record():
    rec = parse_record(raw())
    assert rec.language == "fr"
    assert rec.intent == "remboursement"
    assert rec.answer == "Le délai est de 15 jours."
    assert rec.no_response is False
    assert rec.metadata == {"n_clips": 2}


@pytest.mark.parametrize("lang", ["TN", "tn", "ar", "Darija", "ar-TN"])
def test_tunisian_aliases(lang):
    assert parse_record(raw(lang=lang)).language == "tn"


def test_blank_response_flags_no_response():
    rec = parse_record(raw(response="  ", response_title=None))
    assert rec.no_response is True
    assert rec.answer == ""


def test_unknown_language_is_fatal():
    with pytest.raises(RecordParseError):
        parse_record(raw(lang="en"))


def test_missing_id_is_fatal():
    with pytest.raises(RecordParseError):
        parse_record(raw(id=""))


def test_embed_text_falls_back_to_title_and_complaint():
    rec = parse_record(raw(text=""))
    assert rec.embed_text == "Remboursement en retard\nJe n'ai pas reçu mon remboursement"


def test_fingerprint_changes_with_content_and_model():
    rec = parse_record(raw())
    changed = parse_record(raw(response="Autre réponse"))
    assert rec.fingerprint("m") == parse_record(raw()).fingerprint("m")
    assert rec.fingerprint("m") != changed.fingerprint("m")
    assert rec.fingerprint("m") != rec.fingerprint("other-model")


def test_load_records_skips_empty_and_rejects_duplicates(tmp_path):
    ok = raw()
    empty = raw(id="ARS_0002_fr", text="", title="", complaint="")
    path = tmp_path / "kb.jsonl"
    path.write_text("\n".join(json.dumps(r) for r in (ok, empty)), encoding="utf-8")
    records, skipped = load_records(path)
    assert [r.external_id for r in records] == ["ARS_0001_fr"]
    assert len(skipped) == 1

    dup = tmp_path / "dup.jsonl"
    dup.write_text("\n".join(json.dumps(r) for r in (ok, ok)), encoding="utf-8")
    with pytest.raises(RecordParseError, match="dupliqué"):
        load_records(dup)


def test_invalid_json_line_is_fatal(tmp_path):
    path = tmp_path / "bad.jsonl"
    path.write_text("{not json}\n", encoding="utf-8")
    with pytest.raises(RecordParseError, match="ligne 1"):
        load_records(path)