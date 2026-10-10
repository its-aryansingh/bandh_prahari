"""The judge path: a real Step Functions run whose roster is the phones drawn on the page.

POST /demo/runs   starts a P1 (or the sign the judge taps) on demo clocks, channel "screen".
POST /demo/answer taps a button on a drawn phone: the same answer code a WhatsApp tap uses.

Nothing here can reach a real phone: the channel is fixed to "screen", and the answer route
only accepts waits that belong to a screen run. One demo runs at a time (DEMO#LOCK, which
the run frees when it closes and which expires by itself), at most DEMO_DAILY_CAP a day, and
the HTTP API throttles both routes.
"""

from __future__ import annotations

import re

from botocore.exceptions import ClientError

from common import clock, config, db, http
from incident import answer, start
from rules import priority as rules

LOCK = {"PK": "DEMO#LOCK", "SK": "META"}
LOCK_S = 15 * 60  # longer than the longest demo run; a stuck lock frees itself
WAIT_ID = re.compile(r"^[2-9a-z]{6,12}$")
DEMO_KM = 14


def _conditional_failed(e: ClientError) -> bool:
    return e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


def take_lock(now: int) -> str | None:
    """Take the one demo slot. Returns None if taken, else "" (the incident is filled in after)."""
    try:
        db.table().put_item(
            Item={**LOCK, "incident": "", "expires": now + LOCK_S, "ttl": now + LOCK_S},
            ConditionExpression="attribute_not_exists(PK) OR expires < :now",
            ExpressionAttributeValues={":now": now},
        )
        return ""
    except ClientError as e:
        if _conditional_failed(e):
            return None
        raise


def current_run() -> str:
    item = db.table().get_item(Key=LOCK).get("Item") or {}
    return str(item.get("incident", "")) if int(item.get("expires", 0)) >= clock.epoch() else ""


def count_today(now: int) -> bool:
    """Add one to today's demo count; False once the cap is reached."""
    day = clock.now().strftime("%Y-%m-%d")
    try:
        db.table().update_item(
            Key={"PK": f"DEMO#COUNT#{day}", "SK": "META"},
            UpdateExpression="ADD n :one SET #t = if_not_exists(#t, :ttl)",
            ConditionExpression="attribute_not_exists(n) OR n < :cap",
            ExpressionAttributeNames={"#t": "ttl"},
            ExpressionAttributeValues={":one": 1, ":cap": config.DEMO_DAILY_CAP, ":ttl": now + 3 * 86400},
        )
        return True
    except ClientError as e:
        if _conditional_failed(e):
            return False
        raise


def release(incident_id: str = "") -> None:
    try:
        if incident_id:
            db.table().delete_item(Key=LOCK, ConditionExpression="incident = :i", ExpressionAttributeValues={":i": incident_id})
        else:
            db.table().delete_item(Key=LOCK, ConditionExpression="incident = :e", ExpressionAttributeValues={":e": ""})
    except ClientError as e:
        if not _conditional_failed(e):
            raise


def start_run(req: dict) -> dict:
    sign = req.get("sign") or "boil_soil"
    if sign not in rules.BASE:
        return http.respond(400, {"error": "unknown_sign"})
    now = clock.epoch()
    if take_lock(now) is None:
        # someone else's demo is running: the page attaches to it instead
        return http.respond(409, {"error": "busy", "incident": current_run()})
    if not count_today(now):
        release()
        return http.respond(429, {"error": "daily_cap"})
    try:
        inc = start.start(DEMO_KM, sign, channel="screen", source="screen", demo=True)
    except Exception:
        release()
        raise
    db.table().update_item(Key=LOCK, UpdateExpression="SET incident = :i", ExpressionAttributeValues={":i": inc["id"]})
    return http.respond(201, {"incident": inc["id"], "priority": inc["priority"], "km": inc["km"], "sign": inc["sign"]})


def tap(req: dict) -> dict:
    wait_id, action = str(req.get("wait", "")), str(req.get("action", ""))
    if not WAIT_ID.match(wait_id):
        return http.respond(400, {"error": "bad_wait"})
    res = answer.answer(wait_id, action, req.get("role") or None, only_channel="screen", demo_only=True, by="demo")
    if res.get("ok"):
        return http.respond(200, res)
    return http.respond(409 if res.get("reason") in ("gone", "late") else 400, res)


def handler(event: dict, _ctx=None) -> dict:
    r = http.route(event)
    if r == "POST /demo/runs":
        return start_run(http.body(event))
    if r == "POST /demo/answer":
        return tap(http.body(event))
    if r == "GET /demo/runs/current":
        return http.respond(200, {"incident": current_run()})
    return http.respond(404, {"error": "no_route"})
