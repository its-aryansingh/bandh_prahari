"""The screen channel: messages to the phones drawn on the public page.

Nothing is sent anywhere. Each message becomes an incident timeline event ("message"),
which the page reads back from GET /incidents/{id}/timeline and draws on a phone, with its
buttons. This is how the judge path runs a real Step Functions clock without a real phone.
"""

from __future__ import annotations

from common import db


def _write(to: dict, msg: dict, incident_id: str | None, **extra) -> dict:
    if not incident_id:
        return {"event": None}
    ev = db.event(
        incident_id,
        "message",
        msg["hi"],
        msg["en"],
        actor="system",
        to=to.get("role"),
        name=to.get("name"),
        channel="screen",
        **extra,
    )
    return {"event": ev["at"]}


def send_text(to: dict, msg: dict, *, incident_id: str | None = None) -> dict:
    return _write(to, msg, incident_id)


def send_buttons(to: dict, msg: dict, buttons: list[dict], *, incident_id: str | None = None) -> dict:
    return _write(to, msg, incident_id, buttons=[{"id": b["id"], "hi": b["hi"][:20], "en": b["en"][:20]} for b in buttons])


def send_list(to: dict, msg: dict, button: dict, rows: list[dict], *, incident_id: str | None = None) -> dict:
    return _write(to, msg, incident_id, rows=rows, list_button=button)


def send_audio(to: dict, s3_key: str, *, incident_id: str | None = None, caption: dict | None = None) -> dict:
    msg = caption or {"hi": "आवाज़ वाला संदेश", "en": "Voice note"}
    return _write(to, msg, incident_id, audio=s3_key)
