"""Help (मदद) on the live map (docs/SPEC.md, "The public API" and "Privacy").

GET  /help?status=open         public: counts per village only. With a relief or district role
                               token: also the requests with their exact pins. With ?mine=<id>&key=<k>,
                               the family's own request.
POST /help                     a call for help from the family view or the control room
POST /help/{id}/claim          "मैं जा रहा हूँ": a team takes it; the 20-minute clock starts (role token)
POST /help/{id}/rescued        "सुरक्षित": the family is safe; the run closes (role token)
"""

from __future__ import annotations

import hmac

from botocore.exceptions import ClientError

from common import clock, db, http
from help import core, run
from incident import answer

RELIEF, DISTRICT = "/bp/tokens/relief", "/bp/tokens/district"
PUBLIC_FIELDS = ("id", "village", "people", "elderly", "children", "needs", "channel", "status", "team", "raised", "claimed", "deadline", "arrived", "rescued", "climbs")
DAILY_CAP = 300


def role(event: dict) -> str:
    if http.has_token(event, RELIEF):
        return "relief"
    if http.has_token(event, DISTRICT):
        return "district"
    return ""


def card(h: dict, pins: bool) -> dict:
    out = {k: h.get(k) for k in PUBLIC_FIELDS}
    if pins:
        out.update(lat=h.get("lat"), lon=h.get("lon"))
    out["sample"] = False
    return out


def ready_counts() -> dict[str, int]:
    """READY#: households that tapped "हो गया" (by village) are counted in slice 6's roll-call; 0 until then."""
    return {}


def listing(event: dict) -> dict:
    items = db.open_incidents(200, "HELPSTATUS#open")
    # the last day's rescued requests stay on the map a while, as "safe"
    items += [h for h in db.open_incidents(200, "HELPSTATUS#closed") if h.get("rescued") and clock.now() - clock.parse(h["rescued"]) < __import__("datetime").timedelta(hours=6)]
    by: dict[str, dict] = {}
    households = {v["name"]: sum(w["households"] for w in v.get("wards", [])) for v in core.STRETCH["villages"]}
    for v in core.STRETCH["villages"]:
        by[v["name"]] = {"village": v["name"], "open": 0, "on_the_way": 0, "safe": 0, "ready": 0, "households": households.get(v["name"], 0)}
    for h in items:
        c = by.setdefault(h["village"], {"village": h["village"], "open": 0, "on_the_way": 0, "safe": 0, "ready": 0, "households": 0})
        st = h.get("status")
        c["safe" if st == "rescued" else "on_the_way" if st in ("claimed", "arrived") else "open"] += 1
    out = {"as_of": clock.iso(), "sample": False, "answer_min": core.REAL_CLOCKS["onsite"] // 60, "by_village": list(by.values())}
    who = role(event)
    if who:
        out["requests"] = [card(h, True) for h in items]
    else:
        mine, key = http.query(event, "mine"), http.query(event, "key")
        if mine and key:
            h = db.get_incident(mine) if mine.startswith("HELP-") else None
            if h and hmac.compare_digest(str(h.get("key", "")), key):
                out["requests"] = [card(h, True)]
    return out


def under_cap() -> bool:
    day = clock.now().strftime("%Y-%m-%d")
    try:
        db.table().update_item(
            Key={"PK": f"HELP#COUNT#{day}", "SK": "META"},
            UpdateExpression="ADD n :one SET #t = if_not_exists(#t, :ttl)",
            ConditionExpression="attribute_not_exists(n) OR n < :cap",
            ExpressionAttributeNames={"#t": "ttl"},
            ExpressionAttributeValues={":one": 1, ":cap": DAILY_CAP, ":ttl": clock.epoch() + 3 * 86400},
        )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def raise_help(event: dict) -> dict:
    b = http.body(event)
    channel = "helpline" if b.get("channel") == "helpline" and role(event) else "web"
    try:
        lat, lon, people = float(b["lat"]), float(b["lon"]), int(b.get("people", 1))
    except (KeyError, TypeError, ValueError):
        return http.respond(400, {"error": "lat, lon, people"})
    if not under_cap():
        return http.respond(429, {"error": "daily_cap"})
    try:
        h = run.create(lat, lon, people, elderly=int(b.get("elderly") or 0), children=int(b.get("children") or 0), needs=list(b.get("needs") or []), channel=channel)
    except run.BadHelp as e:
        return http.respond(400, {"error": str(e)})
    return http.respond(201, {**card(h, True), "key": h["key"]})


def act(event: dict, kind_actions: dict[str, str]) -> dict:
    who = role(event)
    if not who:
        return http.respond(401, {"error": "token"})
    hid = http.path(event, "id")
    h = db.get_incident(hid) if hid.startswith("HELP-") else None
    if not h:
        return http.respond(404, {"error": "not_found"})
    action = kind_actions.get(h.get("wait_kind", ""))
    if not action or not h.get("wait"):
        return http.respond(409, {"error": "not_now", "status": h.get("status")})
    team = str(http.body(event).get("team", ""))
    w = db.get_wait(h["wait"]) or {}
    roles = w.get("roles") or []
    # the district may act for any team; a relief caller names their team
    as_role = team if team in roles else (roles[0] if roles else None)
    if who == "relief" and team and team not in roles and action != "claim":
        return http.respond(403, {"error": "not_your_request"})
    if action == "claim" and team and team in {t["id"] for t in core.TEAMS} and team not in roles:
        db.table().update_item(Key={"PK": f"WAIT#{h['wait']}", "SK": "META"}, UpdateExpression="SET #r = list_append(#r, :t)", ExpressionAttributeNames={"#r": "roles"}, ExpressionAttributeValues={":t": [team]})
        as_role = team
    res = answer.answer(h["wait"], action, as_role, by=who)
    if not res.get("ok"):
        return http.respond(409, res)
    return http.respond(200, card(db.get_incident(hid), True))


def handler(event: dict, _ctx=None) -> dict:
    r = http.route(event)
    if r == "GET /help":
        return http.respond(200, listing(event))
    if r == "POST /help":
        return raise_help(event)
    if r == "POST /help/{id}/claim":
        return act(event, {"help_ask": "claim"})
    if r == "POST /help/{id}/rescued":
        return act(event, {"help_onsite": "rescued", "help_safe": "rescued"})
    return http.respond(404, {"error": "no_route"})
