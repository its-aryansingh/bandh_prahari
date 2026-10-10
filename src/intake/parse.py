"""WhatsApp events from AWS End User Messaging Social, as they arrive on SNS.

Records[].Sns.Message is JSON: {"context": {"MetaPhoneNumberIds": [...]}, "whatsAppWebhookEntry":
"<a Meta webhook entry, itself a JSON string>", "aws_account_id", "message_timestamp"}. One entry can
hold several messages or statuses. Everything becomes a small channel-neutral shape:

  message: {"kind": "message", "id", "from", "ts", "type": text|button|list|location|audio|image|other,
            "text"?, "reply_id"?, "lat"?, "lon"?, "media_id"?, "mime"?, "origination"}
  status:  {"kind": "status", "id", "status", "to", "ts", "callback"?, "error"?}

"origination" is the phone-number-id to answer from (the ARN's last part, as "phone-number-id-<hex>").
"""

from __future__ import annotations

import json


def origination(context: dict, meta_phone_id: str) -> str:
    for p in context.get("MetaPhoneNumberIds", []):
        if p.get("metaPhoneNumberId") == meta_phone_id or len(context.get("MetaPhoneNumberIds", [])) == 1:
            arn = p.get("arn", "")
            return "phone-number-id-" + arn.rsplit("/", 1)[-1] if "/" in arn else ""
    return ""


def message(m: dict, orig: str) -> dict:
    out = {"kind": "message", "id": m.get("id", ""), "from": m.get("from", ""), "ts": m.get("timestamp", ""), "origination": orig, "type": "other"}
    t = m.get("type")
    if t == "text":
        out.update(type="text", text=(m.get("text") or {}).get("body", ""))
    elif t == "interactive":
        i = m.get("interactive") or {}
        if i.get("type") == "button_reply":
            out.update(type="button", reply_id=i["button_reply"].get("id", ""), text=i["button_reply"].get("title", ""))
        elif i.get("type") == "list_reply":
            out.update(type="list", reply_id=i["list_reply"].get("id", ""), text=i["list_reply"].get("title", ""))
    elif t == "button":  # a template's quick-reply button
        b = m.get("button") or {}
        out.update(type="button", reply_id=b.get("payload", ""), text=b.get("text", ""))
    elif t == "location":
        loc = m.get("location") or {}
        out.update(type="location", lat=loc.get("latitude"), lon=loc.get("longitude"), text=loc.get("name", ""))
    elif t in ("audio", "voice", "image"):
        media = m.get(t) or {}
        out.update(type="image" if t == "image" else "audio", media_id=media.get("id", ""), mime=media.get("mime_type", ""), text=media.get("caption", ""))
    return out


def status(s: dict) -> dict:
    err = (s.get("errors") or [{}])[0]
    out = {"kind": "status", "id": s.get("id", ""), "status": s.get("status", ""), "to": s.get("recipient_id", ""), "ts": s.get("timestamp", "")}
    if s.get("biz_opaque_callback_data"):
        out["callback"] = s["biz_opaque_callback_data"]
    if err:
        out["error"] = {"code": err.get("code"), "title": err.get("title", "")}
    return out


def entry(e: dict, context: dict | None = None) -> list[dict]:
    """One Meta webhook entry -> messages and statuses."""
    out: list[dict] = []
    for ch in e.get("changes", []):
        v = ch.get("value") or {}
        orig = origination(context or {}, (v.get("metadata") or {}).get("phone_number_id", ""))
        out.extend(message(m, orig) for m in v.get("messages", []))
        out.extend(status(s) for s in v.get("statuses", []))
    return out


def sns_message(body: str | dict) -> list[dict]:
    """One SNS notification's Message (the End User Messaging Social wrapper)."""
    d = json.loads(body) if isinstance(body, str) else body
    e = d.get("whatsAppWebhookEntry")
    if isinstance(e, str):
        e = json.loads(e)
    return entry(e or {}, d.get("context") or {})


def sns_event(event: dict) -> list[dict]:
    out: list[dict] = []
    for r in event.get("Records", []):
        out.extend(sns_message((r.get("Sns") or {}).get("Message", "{}")))
    return out
