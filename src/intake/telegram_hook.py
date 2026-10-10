"""POST /telegram/hook: Telegram's webhook, turned into the same message shape as WhatsApp's.

Telegram sends the secret we set with setWebhook in the X-Telegram-Bot-Api-Secret-Token
header; it is compared with SSM /bp/telegram/hook-secret. An unset secret lets nothing in.
"""

from __future__ import annotations

import hmac
import json

from common import config, http
from intake import handler as intake

SECRET = "/bp/telegram/hook-secret"


def to_message(update: dict) -> dict | None:
    if update.get("callback_query"):
        q = update["callback_query"]
        return {"kind": "message", "id": f"tg-{q['id']}", "from": str(q["from"]["id"]), "type": "button", "reply_id": q.get("data", ""), "channel": "telegram"}
    m = update.get("message") or {}
    if not m:
        return None
    out = {"kind": "message", "id": f"tg-{update.get('update_id')}", "from": str(m["chat"]["id"]), "channel": "telegram", "type": "other"}
    if "text" in m:
        out.update(type="text", text=m["text"])
    elif "location" in m:
        out.update(type="location", lat=m["location"]["latitude"], lon=m["location"]["longitude"])
    elif "voice" in m:
        out.update(type="audio", media_id=m["voice"]["file_id"], mime=m["voice"].get("mime_type", ""))
    return out


def handler(event: dict, _ctx=None) -> dict:
    expected = http.secret(SECRET)
    given = (event.get("headers") or {}).get("x-telegram-bot-api-secret-token", "")
    if not expected or not hmac.compare_digest(given.encode(), expected.encode()):
        return http.respond(401, {"error": "secret"})
    m = to_message(http.body(event))
    if m and intake.first_time(m["id"]):
        intake.lam().invoke(FunctionName=config.WORKER_FUNCTION, InvocationType="Event", Payload=json.dumps(m).encode())
    return http.respond(200, {"ok": True})
