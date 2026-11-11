from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TUNIS_TZ_NAME = "Africa/Tunis"
TUNIS = ZoneInfo(TUNIS_TZ_NAME)


def start_of_tunis_day_utc(now: datetime | None = None) -> datetime:
    """Midnight in Tunis (today), expressed in UTC. Tunisia has no DST (UTC+1)."""
    local = (now or datetime.now(timezone.utc)).astimezone(TUNIS)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)