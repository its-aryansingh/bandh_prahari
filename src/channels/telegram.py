"""Telegram, the fallback channel with the same interface (docs/SPEC.md, decision gate Fri 6 PM).

Switch with the template parameter Channel=telegram. The bot token lives in SSM
(/bp/telegram/token); in the roster's SSM parameters, a Telegram chat ID takes the place of
the phone number. Buttons become an inline keyboard whose callback_data is the same short
ID ("a:<wait>:<action>", well under Telegram's 64 bytes). Inbound updates arrive on
POST /telegram/hook (src/intake/telegram_hook.py) and go to the same worker.
"""

from __future__ import annotations

import json
import urllib.request

from common import config, db, http, ids, roster
from channels.whatsapp import NotAllowed, both

API = "https://api.telegram.org/bot{token}/{method}"


def call(method: str, payload: dict) -> dict:
    token = http.secret(config.TELEGRAM_TOKEN_PARAM)
    if not token:
        raise NotAllowed("no Telegram token in SSM")
    req = urllib.request.Request(API.format(token=token, method=method), data=json.dumps(payload).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:  # noqa: S310 (fixed https host)
        return json.loads(r.read())


def chat_of(to: dict) -> str:
    return str(to.get("phone") or (http.secret(to["ssm"]) if to.get("ssm") else ""))


def _send(to: dict, payload: dict, incident_id: str | None) -> dict:
    chat = chat_of(to)
    if not chat:
        raise NotAllowed(f"no chat for {to.get('role')}")
    if incident_id and not roster.allowed(ids.phone_hash(chat)):
        raise NotAllowed(f"{to.get('role')} is not on the demo roster")
    res = call("sendMessage", {"chat_id": chat, **payload})
    mid = (res.get("result") or {}).get("message_id")
    if incident_id:
        db.event(incident_id, "sent", f"{roster.role_hi(to.get('role', ''))} को भेजा (Telegram)", f"Sent to the {roster.role_en(to.get('role', '')).lower()} (Telegram)", to=to.get("role"), channel="telegram", message_id=mid)
    return {"message_id": mid}


def send_text(to: dict, msg: dict, *, incident_id: str | None = None) -> dict:
    return _send(to, {"text": both(msg, 4096)}, incident_id)


def send_buttons(to: dict, msg: dict, buttons: list[dict], *, incident_id: str | None = None) -> dict:
    kb = [[{"text": b["hi"], "callback_data": b["id"][:64]}] for b in buttons]
    return _send(to, {"text": both(msg, 4096), "reply_markup": {"inline_keyboard": kb}}, incident_id)


def send_list(to: dict, msg: dict, button: dict, rows: list[dict], *, incident_id: str | None = None) -> dict:
    kb = [[{"text": r["hi"], "callback_data": r["id"][:64]}] for r in rows]
    return _send(to, {"text": both(msg, 4096), "reply_markup": {"inline_keyboard": kb}}, incident_id)


def send_audio(to: dict, s3_key: str, *, incident_id: str | None = None, caption: dict | None = None) -> dict:
    # TODO(slice 5): sendVoice with the Polly clip; Telegram has no S3 source, so it needs an upload
    return send_text(to, caption or {"hi": "आवाज़ वाला संदेश WhatsApp पर", "en": "Voice note on WhatsApp"}, incident_id=incident_id)
