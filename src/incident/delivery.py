"""Did the page reach a phone? (docs/SPEC.md, flow 4)

After every page on a real channel, a one-off EventBridge Scheduler schedule runs this two
minutes later. If no delivery receipt came back for that wait (the status handler marks
WAIT#<id> delivered), it calls SendTaskFailure with "Undelivered" and the run climbs at once,
without waiting out the clock. A "failed" status does the same straight away.
"""

from __future__ import annotations

import json
from datetime import timedelta, timezone

import boto3
from botocore.exceptions import ClientError

from common import clock, config, db

_scheduler = None
_sfn = None


def scheduler():
    global _scheduler
    if _scheduler is None:
        _scheduler = boto3.client("scheduler")
    return _scheduler


def sfn():
    global _sfn
    if _sfn is None:
        _sfn = boto3.client("stepfunctions")
    return _sfn


def schedule(wait_id: str, incident_id: str) -> None:
    """A one-off schedule, deleted after it runs (ActionAfterCompletion)."""
    if not (config.DELIVERY_FUNCTION_ARN and config.SCHEDULER_ROLE_ARN):
        return
    when = (clock.now().astimezone(timezone.utc) + timedelta(seconds=config.DELIVERY_CHECK_S)).strftime("%Y-%m-%dT%H:%M:%S")
    scheduler().create_schedule(
        Name=f"bp-delivery-{wait_id}",
        ScheduleExpression=f"at({when})",
        ScheduleExpressionTimezone="UTC",
        FlexibleTimeWindow={"Mode": "OFF"},
        ActionAfterCompletion="DELETE",
        Target={
            "Arn": config.DELIVERY_FUNCTION_ARN,
            "RoleArn": config.SCHEDULER_ROLE_ARN,
            "Input": json.dumps({"wait": wait_id, "incident": incident_id}),
            "RetryPolicy": {"MaximumRetryAttempts": 2},
        },
    )


def fail_undelivered(wait_id: str, why_hi: str, why_en: str) -> bool:
    """Climb now: the page never reached anyone."""
    w = db.take_wait(wait_id)
    if not w:
        return False
    try:
        sfn().send_task_failure(taskToken=w["token"], error="Undelivered", cause=why_en[:200])
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("TaskTimedOut", "TaskDoesNotExist", "InvalidToken"):
            return False
        raise
    db.event(w["incident"], "undelivered", why_hi, why_en, actor="clock", wait=wait_id)
    return True


def handler(event: dict, _ctx=None) -> dict:
    wait_id = event.get("wait", "")
    w = db.get_wait(wait_id)
    if not w:
        return {"checked": wait_id, "result": "answered or closed"}
    if w.get("delivered"):
        return {"checked": wait_id, "result": "delivered"}
    climbed = fail_undelivered(wait_id, "दो मिनट में डिलीवरी की रसीद नहीं आई: बात आगे", "No delivery receipt within two minutes: it climbs")
    return {"checked": wait_id, "result": "undelivered" if climbed else "gone"}


def on_status(s: dict) -> None:
    """A status event for one of our messages: into the timeline; a receipt marks the wait."""
    parts = (s.get("callback") or "").split("|")
    if len(parts) != 3 or not parts[0]:
        return
    incident_id, wait_id, role = parts
    st = s.get("status", "")
    words = {
        "delivered": ("पहुँचा", "delivered"),
        "read": ("पढ़ा गया", "read"),
        "failed": ("नहीं पहुँचा", "failed"),
        "sent": ("भेजा गया", "sent"),
    }.get(st)
    if not words or st == "sent":
        return
    db.event(incident_id, st, f"{role}: संदेश {words[0]}", f"{role}: message {words[1]}", actor="whatsapp", to=role, wait=wait_id, error=(s.get("error") or {}).get("code"))
    if wait_id and st in ("delivered", "read"):
        try:
            db.table().update_item(
                Key={"PK": f"WAIT#{wait_id}", "SK": "META"},
                UpdateExpression="SET delivered = :t",
                ConditionExpression="attribute_exists(PK)",
                ExpressionAttributeValues={":t": True},
            )
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") != "ConditionalCheckFailedException":
                raise
    if wait_id and st == "failed":
        w = db.get_wait(wait_id) or {}
        # with two people on one wait, one failure is not the end: the other may still answer
        if len(w.get("roles") or [1]) <= 1 and not w.get("delivered"):
            fail_undelivered(wait_id, f"{role} तक संदेश नहीं पहुँचा: बात आगे", f"The message to the {role} failed: it climbs")
