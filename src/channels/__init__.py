"""Every outbound message goes through here, so the channel can change without touching the rest.

- "screen": the phones drawn on the public page. The message becomes a timeline event the
  page draws; nothing leaves AWS. The judge path and the replay use only this.
- "whatsapp": AWS End User Messaging Social (src/channels/whatsapp.py).
- "telegram": the fallback with the same interface (src/channels/telegram.py).

A message is {"hi": ..., "en": ...}. A recipient is {"role", "name", and "ssm" or "phone"}.
OUTBOUND=off stops every message to a real phone in one switch; the screen still works.
"""

from __future__ import annotations

import importlib
from typing import Any

from common import config, db


def _module(channel: str):
    if channel == "screen":
        return importlib.import_module("channels.screen")
    if config.OUTBOUND != "on":
        return None
    if channel in ("whatsapp", "telegram"):
        return importlib.import_module(f"channels.{channel}")
    raise ValueError(f"unknown channel {channel!r}")


def _held(channel: str, to: dict, incident_id: str | None, what: str) -> dict:
    if incident_id:
        db.event(
            incident_id,
            "held",
            f"{to.get('role')} को संदेश रोका गया (आउटबाउंड बंद)",
            f"Message to the {to.get('role')} held (outbound off)",
            to=to.get("role"),
            channel=channel,
            what=what,
        )
    return {"held": True}


def _call(channel: str, to: dict, incident_id: str | None, what: str, fn, *args) -> dict:
    """Send through the channel. A send that fails is written down and never stops the run:
    a page nobody received is caught by the delivery check, which makes the clock climb."""
    mod = _module(channel)
    if not mod:
        return _held(channel, to, incident_id, what)
    try:
        return getattr(mod, fn)(to, *args, incident_id=incident_id)
    except Exception as e:  # noqa: BLE001  (NotAllowed, a missing number, the service refusing)
        if channel == "screen":
            raise
        if incident_id:
            db.event(
                incident_id,
                "send_failed",
                f"{to.get('role')} को संदेश नहीं गया",
                f"The message to the {to.get('role')} did not go out",
                to=to.get("role"),
                channel=channel,
                error=type(e).__name__,
            )
        print({"send_failed": type(e).__name__, "detail": str(e)[:200], "role": to.get("role"), "channel": channel})
        return {"failed": type(e).__name__}


def send_text(channel: str, to: dict, msg: dict, *, incident_id: str | None = None) -> dict:
    return _call(channel, to, incident_id, "text", "send_text", msg)


def send_buttons(channel: str, to: dict, msg: dict, buttons: list[dict], *, incident_id: str | None = None) -> dict:
    """buttons: [{"id", "hi", "en"}], at most 3; titles are cut to 20 characters by the channel."""
    if len(buttons) > 3:
        raise ValueError("WhatsApp allows at most three reply buttons")
    return _call(channel, to, incident_id, "buttons", "send_buttons", msg, buttons)


def send_list(channel: str, to: dict, msg: dict, button: dict, rows: list[dict], *, incident_id: str | None = None) -> dict:
    """rows: [{"id", "hi", "en", "desc_hi"?, "desc_en"?}], at most 10."""
    if len(rows) > 10:
        raise ValueError("WhatsApp lists hold at most ten rows")
    return _call(channel, to, incident_id, "list", "send_list", msg, button, rows)


def send_audio(channel: str, to: dict, s3_key: str, *, incident_id: str | None = None, caption: dict | None = None) -> dict:
    mod = _module(channel)
    if not mod:
        return _held(channel, to, incident_id, "audio")
    try:
        return mod.send_audio(to, s3_key, incident_id=incident_id, caption=caption)
    except Exception as e:  # noqa: BLE001
        if channel == "screen":
            raise
        print({"send_failed": type(e).__name__, "detail": str(e)[:200], "role": to.get("role")})
        return {"failed": type(e).__name__}


def describe(result: Any) -> str:
    return str(result.get("message_id") or result.get("event") or "") if isinstance(result, dict) else ""
