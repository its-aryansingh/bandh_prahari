"""Identifiers. A wait ID is short enough to ride on a WhatsApp button; a task token never is."""

from __future__ import annotations

import hashlib
import secrets

from common.clock import now

# No 0/o, 1/l/i: people may read a wait ID aloud over the helpline.
_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"


def short_id(n: int = 8) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(n))


def incident_id(km: int, prefix: str = "INC") -> str:
    """INC-1010-0941-14-x7k: date, IST time, kilometre, and a short random tail."""
    t = now()
    return f"{prefix}-{t:%m%d-%H%M}-{int(km)}-{short_id(3)}"


def digits(phone: str) -> str:
    return "".join(c for c in str(phone) if c.isdigit())


def phone_hash(phone: str) -> str:
    """Counts and "Ho gaya" taps are keyed by this, never by the number."""
    digits = "".join(c for c in str(phone) if c.isdigit())
    return hashlib.sha256(digits.encode()).hexdigest()
