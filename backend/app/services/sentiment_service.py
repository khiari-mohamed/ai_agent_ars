from __future__ import annotations

from typing import Any

from app.core.logging import get_logger
from app.services.llm_service import llm_chat

logger = get_logger(__name__)

_SENTIMENT_PROMPT = """Analyze the sentiment of this message from an insurance customer.
Return ONLY a JSON object: {"score": float, "label": "SATISFAIT"|"NEUTRE"|"INSATISFAIT"}
Score: -1.0 (very negative) to 1.0 (very positive).
Message: """


async def analyze_sentiment(text: str) -> dict[str, Any]:
    """Lightweight sentiment analysis using LLM."""
    if not text.strip():
        return {"score": 0.0, "label": "NEUTRE"}
    try:
        result = await llm_chat(
            messages=[{"role": "user", "content": _SENTIMENT_PROMPT + text}],
            temperature=0.1,
            tools=False,
        )
        from app.services.llm_service import extract_text_from_response
        import json, re
        raw = extract_text_from_response(result)
        # Extract JSON from response
        match = re.search(r'\{.*\}', raw, re.DOTALL)
        if match:
            data: dict[str, Any] = json.loads(match.group())
            score = max(-1.0, min(1.0, float(data.get("score", 0.0))))
            label = data.get("label", "NEUTRE")
            if label not in ("SATISFAIT", "NEUTRE", "INSATISFAIT"):
                label = "NEUTRE"
            return {"score": score, "label": label}
    except Exception as exc:
        logger.warning("sentiment_analysis_failed", error=str(exc))
    return {"score": 0.0, "label": "NEUTRE"}