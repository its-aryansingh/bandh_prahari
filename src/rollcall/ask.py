"""High-water roll-call: 'km 14: sab theek?' and the 20-minute nudge to the JE.

docs/SPEC.md: "7. Roll-call. When an official reading is above danger level, or SACHET
carries a CWC flood alert for a gauge, a two-hourly night schedule starts for the stretches
near it. Each worker gets 'km 14: sab theek?' with 'Theek hai' and 'Samasya hai'. No answer
in 20 minutes nudges the junior engineer."
"""

from __future__ import annotations

from typing import Any

from boto3.dynamodb.conditions import Key

from channels import send_buttons, send_text
from common import clock, config, db, roster


def current_slot() -> str:
    """e.g. '2026-10-10#02' for the 2 AM slot."""
    return clock.now().strftime("%Y-%m-%d#%H")


def ask_km(km: int, channel: str | None = None, slot: str | None = None) -> dict[str, Any]:
    ch = channel or config.CHANNEL
    sl = slot or current_slot()
    pk = f"ROLLCALL#{sl}"
    sk = f"KM#{km}"

    workers = roster.people(km, 0, ch)  # patrol workers
    if not workers:
        workers = roster.people(km, 1, ch)  # fall back to JE

    worker = workers[0] if workers else {"role": "patrol", "phone": ""}

    deadline_iso = clock.after(20 * 60)
    item = {
        "PK": pk,
        "SK": sk,
        "km": km,
        "status": "sent",
        "sent_at": clock.iso(),
        "deadline": deadline_iso,
        "worker_role": worker.get("role", "patrol"),
        "ttl": clock.epoch() + 7 * 86400,
    }
    db.table().put_item(Item=db.clean(item))

    msg = {
        "hi": f"किमी {km}: सब ठीक?",
        "en": f"Km {km}: all well?",
    }
    buttons = [
        {"id": f"rc:{km}:ok", "hi": "ठीक है", "en": "All well"},
        {"id": f"rc:{km}:issue", "hi": "समस्या है", "en": "Problem"},
    ]
    send_buttons(ch, worker, msg, buttons)
    return item


def ask_all(channel: str | None = None, kms: list[int] | None = None, slot: str | None = None) -> list[dict]:
    targets = kms or list(range(1, 21))
    return [ask_km(km, channel=channel, slot=slot) for km in targets]


def record_reply(km: int, action: str, by: str = "", slot: str | None = None) -> dict:
    sl = slot or current_slot()
    pk = f"ROLLCALL#{sl}"
    sk = f"KM#{km}"

    status = "ok" if action == "ok" else "issue"
    db.table().update_item(
        Key={"PK": pk, "SK": sk},
        UpdateExpression="SET #st = :st, answered_at = :at, answered_by = :by",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":st": status, ":at": clock.iso(), ":by": by},
    )
    return {"km": km, "status": status, "action": action}


def nudge_unanswered(channel: str | None = None, slot: str | None = None) -> list[int]:
    """Finds roll-calls with status 'sent' whose 20-min deadline expired, and nudges JE."""
    ch = channel or config.CHANNEL
    sl = slot or current_slot()
    pk = f"ROLLCALL#{sl}"

    res = db.table().query(KeyConditionExpression=Key("PK").eq(pk))
    items = [db.plain(i) for i in res.get("Items", [])]
    now_iso = clock.iso()

    nudged = []
    for item in items:
        if item.get("status") == "sent" and item.get("deadline", "") <= now_iso:
            km = int(item["km"])
            jes = roster.people(km, 1, ch)
            if jes:
                je = jes[0]
                msg = {
                    "hi": f"किमी {km}: 20 मिनट से गश्ती दल का जवाब नहीं आया। कृपया स्थिति जाँचें।",
                    "en": f"Km {km}: no answer from patrol worker in 20 minutes. Please verify status.",
                }
                send_text(ch, je, msg)

            db.table().update_item(
                Key={"PK": pk, "SK": f"KM#{km}"},
                UpdateExpression="SET #st = :st, nudged_at = :at",
                ExpressionAttributeNames={"#st": "status"},
                ExpressionAttributeValues={":st": "nudged", ":at": now_iso},
            )
            nudged.append(km)

    return nudged


def latest_status(slot: str | None = None) -> dict[str, Any]:
    """Latest status of high-water rollcall across km 1..20."""
    sl = slot or current_slot()
    pk = f"ROLLCALL#{sl}"
    res = db.table().query(KeyConditionExpression=Key("PK").eq(pk))
    items = {int(i["km"]): db.plain(i) for i in res.get("Items", []) if "km" in i}
    now_iso = clock.iso()

    kms_status = {}
    for km in range(1, 21):
        if km in items:
            item = items[km]
            st = item.get("status", "sent")
            if st == "ok":
                kms_status[str(km)] = "ok"
            elif st == "issue":
                kms_status[str(km)] = "issue"
            elif st == "nudged" or (st == "sent" and item.get("deadline", "") <= now_iso):
                kms_status[str(km)] = "unmonitored"
            else:
                kms_status[str(km)] = "pending"
        else:
            kms_status[str(km)] = "pending"

    return {
        "slot": sl,
        "kms": kms_status,
    }


def ensure_schedule(stretch: str = "haijalpur") -> bool:
    """Create EventBridge Scheduler schedule (every 2 hours, 22:00-06:00 IST) for stretches."""
    try:
        import boto3
        scheduler = boto3.client("scheduler")
        scheduler.create_schedule(
            Name=f"bp-rollcall-{stretch}",
            ScheduleExpression="cron(0 22,0,2,4,6 * * ? *)",
            ScheduleExpressionTimezone="Asia/Kolkata",
            FlexibleTimeWindow={"Mode": "OFF"},
            Target={
                "Arn": getattr(config, "WORKER_FUNCTION_ARN", ""),
                "RoleArn": getattr(config, "SCHEDULER_ROLE_ARN", ""),
            },
        )
        return True
    except Exception as e:
        return False


def delete_schedule(stretch: str = "haijalpur") -> bool:
    """Delete EventBridge Scheduler schedule when river level falls."""
    try:
        import boto3
        scheduler = boto3.client("scheduler")
        scheduler.delete_schedule(Name=f"bp-rollcall-{stretch}")
        return True
    except Exception:
        return False
