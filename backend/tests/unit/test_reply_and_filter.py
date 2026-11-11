from __future__ import annotations

import pytest

from app.services.reply import parse_reply
from app.services.utterance_filter import UtteranceKind, classify_utterance, matches_human_request


def test_parse_valid_darija_reply() -> None:
    raw = '{"language":"tn","display_text":"Behi","tts_text":"باهي"}'
    reply = parse_reply(raw)
    assert (reply.language, reply.tts_text, reply.degraded) == ("tn", "باهي", False)


def test_parse_tolerates_code_fences() -> None:
    raw = '```json\n{"language":"fr","display_text":"Bonjour","tts_text":"Bonjour"}\n```'
    assert not parse_reply(raw).degraded


def test_darija_without_arabic_tts_is_degraded() -> None:
    raw = '{"language":"tn","display_text":"Behi","tts_text":"Behi"}'
    assert parse_reply(raw).degraded


def test_plain_text_falls_back_degraded() -> None:
    reply = parse_reply("Bonjour", "fr")
    assert reply.degraded and reply.display_text == "Bonjour"


@pytest.mark.parametrize("text", ["Bonjour", "3aslema", "merci beaucoup", "oui", "عسلامة", "yaatik essa7a"])
def test_social(text: str) -> None:
    assert classify_utterance(text) is UtteranceKind.SOCIAL


@pytest.mark.parametrize("text", ["", "...", "Nul", "test", "hmm"])
def test_unclear(text: str) -> None:
    assert classify_utterance(text) is UtteranceKind.UNCLEAR


@pytest.mark.parametrize("text", ["remboursement couronne", "win el remboursement mta3i", "Bonjour j'ai un problème de remboursement"])
def test_content(text: str) -> None:
    assert classify_utterance(text) is UtteranceKind.CONTENT


@pytest.mark.parametrize("text", ["je veux parler à un conseiller", "passez-moi un responsable", "nheb nahki m3a wahed", "نحب مسؤول"])
def test_human_request(text: str) -> None:
    assert matches_human_request(text)


@pytest.mark.parametrize("text", ["personne ne m'a répondu", "agent IA", "mon remboursement"])
def test_not_human_request(text: str) -> None:
    assert not matches_human_request(text)