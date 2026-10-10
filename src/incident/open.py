"""OpenIncident: write the incident and the rules' verdict to the timeline.

The priority was set before the run started, by src/rules/priority.py, from the tapped sign,
the official gauge and the stretch's record. This step records it; it never changes it.
"""

from __future__ import annotations

from common import clock, db, words


def handler(event: dict, _ctx=None) -> dict:
    inc = dict(event["incident"])
    inc.setdefault("opened", clock.iso())
    inc["status"] = "open"
    if event.get("execution"):
        inc["execution_arn"] = event["execution"]
    if not inc.get("villages"):
        seg = db.get_segment(inc["km"]) or {}
        inc["villages"] = [v["name"] if isinstance(v, dict) else v for v in seg.get("villages", [])]
    db.put_incident(inc)
    km, p, sign = inc["km"], inc["priority"], inc["sign"]
    db.event(
        inc["id"],
        "open",
        f"घटना खुली: किमी {km}, {words.sign_hi(sign)}",
        f"Incident opened: km {km}, {words.sign_en(sign).lower()}",
        actor="system",
        km=km,
        sign=sign,
    )
    why = inc.get("why") or []
    db.event(
        inc["id"],
        "priority",
        f"नियम: {words.sign_hi(sign)} = {p}",
        f"Rules: {words.sign_en(sign).lower()} = {p}" + (f" ({'; '.join(why)})" if why else ""),
        actor="rules",
        priority=p,
    )
    return inc
