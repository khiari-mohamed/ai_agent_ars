from __future__ import annotations

import re
from enum import Enum

from app.services.text_normalization import normalize_for_search


class UtteranceKind(str, Enum):
    CONTENT = "CONTENT"  # a real question/complaint → retrieve from the KB
    SOCIAL = "SOCIAL"    # greeting / thanks / goodbye / yes-no → no retrieval
    UNCLEAR = "UNCLEAR"  # empty / noise / ASR junk → no retrieval, ask to rephrase


# Normalised forms (see normalize_for_search): no accents, Arabic hamza/diacritics stripped.
_SOCIAL = {
    # FR
    "bonjour", "bonsoir", "salut", "coucou", "hello", "allo", "alo", "cc", "merci",
    "mercii", "beaucoup", "au", "revoir", "bye", "bonne", "journee", "soiree", "oui",
    "non", "ok", "okay", "d", "accord", "ca", "va", "bien", "tres", "super", "parfait",
    "a", "bientot", "pas", "de", "quoi",
    # Darija (arabizi)
    "salam", "salem", "aslema", "aslama", "asslema", "3aslema", "3asslema", "ahla",
    "ahlan", "marhba", "mar7ba", "labes", "lebes", "bik", "chokran", "shokran", "barcha",
    "ya3tik", "yaatik", "essa7a", "essaha", "3aychek", "aychek", "besslema", "bslema",
    "behi", "we", "wé", "eh", "e", "la", "le", "el", "yaaychek",
    # Darija (arabic script)
    "سلام", "عسلامة", "اهلا", "مرحبا", "لاباس", "شكرا", "بارشا", "يعطيك", "الصحة",
    "عيشك", "بسلامة", "باهي", "اي", "ايه", "لا",
}
_NOISE = {"test", "nul", "hein", "euh", "heu", "hmm", "hm", "ah", "oh", "aaa", "blabla", "mmm"}

_HUMAN_REQUEST = re.compile(
    r"\b(conseiller|conseillere|humain|superviseur|responsable|operateur|operatrice|standardiste)\b"
    r"|\b(parler|passer|passez|mettez|transferer|transferez)\b.{0,20}\b(agent|personne|quelqu un|reel|vrai)\b"
    r"|\b(nheb|n7eb|nhebb)\b.{0,25}\b(nahki|nehki|nkalem|nkallem|n7ki|nekalem)\b.{0,25}\b(m3a|ma3a)\b"
    r"|مسول|موظف|مستشار|مدير|بشري"
)


def classify_utterance(text: str) -> UtteranceKind:
    tokens = normalize_for_search(text).split()
    if not tokens or sum(len(t) for t in tokens) < 3:
        return UtteranceKind.UNCLEAR
    if all(t in _NOISE for t in tokens):
        return UtteranceKind.UNCLEAR
    if all(t in _SOCIAL for t in tokens):
        return UtteranceKind.SOCIAL
    return UtteranceKind.CONTENT


def matches_human_request(text: str) -> bool:
    """Explicit request for a human. Phrase-level on purpose: a bare 'agent' or
    'personne' must NOT trigger it ('personne ne m'a répondu', 'agent IA')."""
    return _HUMAN_REQUEST.search(normalize_for_search(text)) is not None