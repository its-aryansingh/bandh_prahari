"""Notices the clock sends without waiting: an engineer not on site in time, a missed check-in.

The next level up and the district hear about it at once, and the timeline says so.
"""

from __future__ import annotations

from channels import send_text
from common import db, roster

WHAT = {
    "not_on_site": ("मौक़े पर नहीं पहुँचे", "has not reached the site"),
    "missed_checkin": ("हाज़िरी नहीं दी", "missed the check-in"),
}


def handler(event: dict, _ctx=None) -> dict:
    inc = event["incident"]
    what = event["what"]
    ans = event.get("answer") or {}
    role = ans.get("role", "junior_engineer")
    level = int(ans.get("level", 1))
    channel = inc.get("channel", "screen")
    hi, en = WHAT[what]
    db.event(
        inc["id"],
        what,
        f"{roster.role_hi(role)} {hi}: ऊपर और ज़िले को ख़बर",
        f"The {roster.role_en(role).lower()} {en}: the next level and the district are told",
        actor="clock",
        to=role,
    )
    msg = {"hi": f"किमी {inc['km']}: {roster.role_hi(role)} {hi}।", "en": f"Km {inc['km']}: the {roster.role_en(role).lower()} {en}."}
    told = 0
    for lvl in sorted({min(level + 1, 3), 4}):
        for p in roster.people(inc["km"], lvl, channel):
            send_text(channel, p, msg, incident_id=inc["id"])
            told += 1
    return {"told": told}
