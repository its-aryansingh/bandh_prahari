"""POST /incidents: the control-room form for helpline calls (docs/SPEC.md, flow 8).

The call goes through the same rules into the same run. The caller is described in words
("helpline 1070"), never by phone number. Needs the control-room token (SSM).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from api.public import incident_card
from common import config, http
from incident import start
from rules import priority as rules

TOKEN = "/bp/tokens/control"
KM_RANGE = range(1, 21)
NUMBER = re.compile(r"\+?\(?\d(?:[\s\-./()]{0,3}\d){7,}")
VILLAGES = {v["name"] for v in json.loads((Path(__file__).resolve().parent.parent / "gov" / "stretch.json").read_text(encoding="utf-8"))["villages"]}


def scrub(text: str) -> str:
    """Phone numbers typed into the form never reach the table."""
    return NUMBER.sub("[number removed]", text)


def handler(event: dict, _ctx=None) -> dict:
    if http.route(event) != "POST /incidents":
        return http.respond(404, {"error": "no_route"})
    if not http.has_token(event, TOKEN):
        return http.respond(401, {"error": "token"})
    req = http.body(event)
    try:
        km = int(req.get("km"))
    except (TypeError, ValueError):
        return http.respond(400, {"error": "km"})
    sign = str(req.get("sign", ""))
    if km not in KM_RANGE:
        return http.respond(400, {"error": "km"})
    if sign not in rules.BASE:
        return http.respond(400, {"error": "unknown_sign"})
    village = str(req.get("village", ""))
    if village and village not in VILLAGES:
        return http.respond(400, {"error": "village"})
    note = scrub(" ".join(x for x in (str(req.get("caller", ""))[:80], str(req.get("note", ""))[:400]) if x))
    inc = start.start(km, sign, channel=config.CHANNEL, source="helpline", villages=[village] if village else None, note=note)
    return http.respond(201, incident_card(inc))
