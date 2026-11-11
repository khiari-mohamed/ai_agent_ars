from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal

Language = Literal["fr", "tn"]
_ARABIC = re.compile(r"[\u0600-\u06FF]")


@dataclass(frozen=True, slots=True)
class Reply:
    language: Language
    display_text: str  # shown to the user (fr: French; tn: Arabizi)
    tts_text: str      # spoken (fr: French; tn: Arabic script)
    degraded: bool = False  # True when the model broke the output contract


def parse_reply(raw: str, fallback_language: Language = "fr") -> Reply:
    """Parses the model's JSON reply. Never raises: a contract violation yields a
    degraded Reply (display text kept, tts_text = best available) and is logged by
    the caller."""
    text = (raw or "").strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            display = str(data.get("display_text") or "").strip()
            tts = str(data.get("tts_text") or "").strip()
            lang = data.get("language")
            language: Language = lang if lang in ("fr", "tn") else fallback_language
            if display:
                if language == "tn" and not _ARABIC.search(tts):
                    return Reply(language, display, tts or display, degraded=True)
                return Reply(language, display, tts or display)
    return Reply(fallback_language, text, text, degraded=True)