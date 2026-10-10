"""Time in IST, the only time zone the people on the bank read."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def now() -> datetime:
    return datetime.now(IST)


def iso(dt: datetime | None = None) -> str:
    return (dt or now()).astimezone(IST).isoformat(timespec="seconds")


def epoch(dt: datetime | None = None) -> int:
    return int((dt or now()).timestamp())


def parse(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(IST)


def after(seconds: float) -> str:
    """The IST time this many seconds from now, as ISO text."""
    return iso(now() + timedelta(seconds=seconds))
