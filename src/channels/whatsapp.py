"""WhatsApp through AWS End User Messaging Social (boto3 client "socialmessaging").

send_whatsapp_message(originationPhoneNumberId, metaApiVersion, message=<Meta Cloud API JSON
as bytes>); the recipient goes inside the JSON as "to". Numbers come from SSM at send time
(the roster names a parameter, never a number). Anything tied to an incident (a page, a
warning, a copy) goes only to numbers on the demo roster (ALLOW#<sha256>): a real user of
"Nadi ka haal" can never get one. Status events (sent, delivered, read, failed) come back
on SNS with the callback data set here, "<incident>|<wait>|<role>".
"""

from __future__ import annotations

import json

import boto3

from common import config, db, http, ids, roster

_client = None
TEXT_MAX, BODY_MAX, TITLE_MAX, ROW_MAX, ROW_DESC_MAX = 4096, 1024, 20, 24, 72


class NotAllowed(Exception):
    """A message tied to an incident, to a number that isn't on the demo roster."""


def client():
    global _client
    if _client is None:
        _client = boto3.client("socialmessaging")
    return _client


def phone_of(to: dict) -> str:
    if to.get("phone"):
        return str(to["phone"])
    if to.get("ssm"):
        return http.secret(to["ssm"])
    return ""


def both(msg: dict, limit: int) -> str:
    """Hindi first, then English, cut to WhatsApp's limit."""
    text = msg["hi"] if not msg.get("en") or msg["en"] == msg["hi"] else f"{msg['hi']}\n\n{msg['en']}"
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _send(to: dict, payload: dict, incident_id: str | None, wait: str = "") -> dict:
    phone = phone_of(to)
    if not phone:
        raise NotAllowed(f"no number for {to.get('role')}")
    digits = "".join(c for c in phone if c.isdigit())
    if incident_id and not roster.allowed(ids.phone_hash(digits)):
        raise NotAllowed(f"{to.get('role')} is not on the demo roster")
    body = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": "+" + digits, **payload}
    if incident_id:
        body["biz_opaque_callback_data"] = f"{incident_id}|{wait}|{to.get('role', '')}"[:512]
    res = client().send_whatsapp_message(
        originationPhoneNumberId=config.WA_ORIGINATION_ID,
        metaApiVersion=config.META_API_VERSION,
        message=json.dumps(body, ensure_ascii=False).encode("utf-8"),
    )
    if incident_id:
        db.event(incident_id, "sent", f"{roster.role_hi(to.get('role', ''))} को भेजा", f"Sent to the {roster.role_en(to.get('role', '')).lower()}", actor="system", to=to.get("role"), channel="whatsapp", message_id=res.get("messageId"), wait=wait)
    return {"message_id": res.get("messageId")}


def _wait_of(buttons: list[dict]) -> str:
    for b in buttons:
        parts = b["id"].split(":")
        if parts[0] == "a" and len(parts) == 3:
            return parts[1]
    return ""


def send_text(to: dict, msg: dict, *, incident_id: str | None = None) -> dict:
    return _send(to, {"type": "text", "text": {"preview_url": False, "body": both(msg, TEXT_MAX)}}, incident_id)


def send_buttons(to: dict, msg: dict, buttons: list[dict], *, incident_id: str | None = None) -> dict:
    action = {"buttons": [{"type": "reply", "reply": {"id": b["id"][:256], "title": b["hi"][:TITLE_MAX]}} for b in buttons[:3]]}
    payload = {"type": "interactive", "interactive": {"type": "button", "body": {"text": both(msg, BODY_MAX)}, "action": action}}
    return _send(to, payload, incident_id, _wait_of(buttons))


def send_list(to: dict, msg: dict, button: dict, rows: list[dict], *, incident_id: str | None = None) -> dict:
    section = {
        "title": button.get("section", button["hi"])[:24],
        "rows": [
            {"id": r["id"][:200], "title": r["hi"][:ROW_MAX], **({"description": (r.get("desc_hi") or r.get("en", ""))[:ROW_DESC_MAX]} if (r.get("desc_hi") or r.get("en")) else {})}
            for r in rows[:10]
        ],
    }
    payload = {"type": "interactive", "interactive": {"type": "list", "body": {"text": both(msg, BODY_MAX)}, "action": {"button": button["hi"][:TITLE_MAX], "sections": [section]}}}
    return _send(to, payload, incident_id)


def send_audio(to: dict, s3_key: str, *, incident_id: str | None = None, caption: dict | None = None) -> dict:
    """Uploads the MP3 from the bucket, then sends it by media ID (slice 5 makes the clips)."""
    media = client().post_whatsapp_message_media(
        originationPhoneNumberId=config.WA_ORIGINATION_ID,
        sourceS3File={"bucketName": config.BUCKET_NAME, "key": s3_key},
    )
    out = _send(to, {"type": "audio", "audio": {"id": media["mediaId"]}}, incident_id)
    if caption:
        send_text(to, caption, incident_id=incident_id)
    return out
