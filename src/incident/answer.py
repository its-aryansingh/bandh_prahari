"""A tap on a button: look up the task token behind the short wait ID and tell Step Functions.

Called by the public API (the judge path's on-screen phones) and by the WhatsApp intake.
A wait is used once: the second tap on the same button finds nothing. "Not my stretch" fails
the task with the error "Declined", which the run catches and climbs, like a timeout.
"""

from __future__ import annotations

import json

import boto3
from botocore.exceptions import ClientError

from common import clock, db, roster, words

ACTIONS = {
    "page": {"onway", "notmine"},
    "onsite": {"onsite"},
    "hold": {"holding", "secured", "breached"},
}

_sfn = None


def sfn():
    global _sfn
    if _sfn is None:
        _sfn = boto3.client("stepfunctions")
    return _sfn


def answer(wait_id: str, action: str, role: str | None = None, *, only_channel: str | None = None, demo_only: bool = False, by: str = "") -> dict:
    """demo_only: the public judge route. It may answer only waits of demo runs on the screen."""
    w = db.get_wait(wait_id)
    if not w:
        return {"ok": False, "reason": "gone"}
    if only_channel and w.get("channel") != only_channel:
        return {"ok": False, "reason": "not_allowed"}
    if demo_only and not (w.get("demo") is True and str(w.get("incident", "")).startswith("DEMO-")):
        return {"ok": False, "reason": "not_allowed"}
    if action not in ACTIONS.get(w.get("kind", ""), set()):
        return {"ok": False, "reason": "bad_action"}
    roles = w.get("roles") or [w.get("role", "junior_engineer")]
    who = role if role in roles else roles[0]
    if action == "notmine" and len(roles) > 1:
        declined = db.decline_wait(wait_id, who)
        if declined is None:
            return {"ok": False, "reason": "gone"}
        if not set(roles) <= declined:
            hi, en = words.BUTTONS[action]
            db.event(w["incident"], "declined", f"{roster.role_hi(who)}: {hi}", f"{roster.role_en(who)}: {en}", actor=who, action=action, by=by)
            return {"ok": True, "action": action, "role": who, "waiting_for": sorted(set(roles) - declined), "incident": w["incident"]}
    w = db.take_wait(wait_id)
    if not w:
        return {"ok": False, "reason": "gone"}
    out = {"action": action, "role": who, "level": w.get("level", 1), "wait": wait_id, "at": clock.iso()}
    try:
        if action == "notmine":
            sfn().send_task_failure(taskToken=w["token"], error="Declined", cause=f"{who} said it is not their stretch")
        else:
            sfn().send_task_success(taskToken=w["token"], output=json.dumps(out))
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("TaskTimedOut", "TaskDoesNotExist", "InvalidToken"):
            return {"ok": False, "reason": "late"}
        raise
    hi, en = words.BUTTONS[action]
    try:
        db.event(
            w["incident"],
            "answer",
            f"{roster.role_hi(who)}: {hi}",
            f"{roster.role_en(who)}: {en}",
            actor=who,
            action=action,
            wait=wait_id,
            by=by,
        )
    except ClientError as e:  # the run already has the answer; the log line keeps it
        print({"answer_event_failed": repr(e), "incident": w["incident"], "action": action, "role": who})
    return {"ok": True, **out, "incident": w["incident"]}
