"""Start an incident run: the rules set the priority, then the clock starts.

Every way in (the WhatsApp two-tap flow, the control-room form, the judge path on the page)
comes through here, so the priority is always set by src/rules/priority.py and the run
always gets the same input shape. The clocks are in the input (TimeoutSecondsPath), so one
state machine serves real and demo clocks.
"""

from __future__ import annotations

import json

import boto3
from common import clock, config, db, ids, roster, words
from rules import priority as rules

# Real clocks, seconds (docs/SPEC.md, "The incident run"). The page clock follows the priority.
REAL_CLOCKS = {"central": 600, "onsite": 45 * 60, "hold": 30 * 60}
# How many times a loop goes round before the district takes over.
REAL_LIMITS = {"central": 18, "onsite": 3, "missed": 3, "rounds": 96}
DEMO_CLOCKS = {"page": config.DEMO_PAGE_S, "central": config.DEMO_PAGE_S, "onsite": 90, "hold": 90}
DEMO_LIMITS = {"central": 2, "onsite": 2, "missed": 2, "rounds": 3}

_sfn = None


def sfn():
    global _sfn
    if _sfn is None:
        _sfn = boto3.client("stepfunctions")
    return _sfn


def river_now(seg: dict) -> rules.River:
    """The nearest official gauge's last two readings (GAUGE#<site>), as the rules need them."""
    site = seg.get("gauge")
    rows = db.latest_readings(site, 2) if site else []
    if not rows or rows[0].get("wl") is None or rows[0].get("dl") is None:
        return rules.River()
    last = rows[0]
    rising = last.get("trend") == "rising" or (len(rows) > 1 and rows[1].get("wl") is not None and last["wl"] > rows[1]["wl"])
    return rules.River(above_danger=last["wl"] > last["dl"], rising=bool(rising))


def run_input(inc: dict, demo: bool) -> dict:
    if demo:
        clocks, limits = dict(DEMO_CLOCKS), dict(DEMO_LIMITS)
    else:
        clocks = {"page": rules.answer_minutes(inc["priority"]) * 60, **REAL_CLOCKS}
        limits = dict(REAL_LIMITS)
    return {
        "incident": inc,
        "clocks": clocks,
        "limits": limits,
        "counts": {k: 0 for k in ("central", "onsite", "missed", "rounds")},
        # the first page has no "previous" (the error that made the clock climb)
        "previous": None,
    }


def start(
    km: int,
    sign: str,
    *,
    channel: str,
    source: str,
    seen: rules.Observed = rules.Observed(),
    demo: bool = False,
    villages: list[str] | None = None,
    note: str = "",
    reporter: str = "",
    test_to: str = "",
) -> dict:
    """test_to: the TEST path. The sender is every level of the roster, on one-minute clocks."""
    """Score the report with the rules, write it, and start the run. Returns the incident."""
    seg = db.get_segment(km) or {}
    stretch = rules.Stretch(breach_last_5y=bool(seg.get("breach_last_5y")), vulnerable=bool(seg.get("vulnerable")))
    decision = rules.priority(sign, river_now(seg), stretch, seen)
    inc = {
        "id": ids.incident_id(km, "DEMO" if demo else "TEST" if test_to else "INC"),
        "km": int(km),
        "sign": sign,
        "priority": decision.priority,
        "why": list(decision.reasons),
        "channel": channel,
        "source": source,
        "demo": demo,
        "opened": clock.iso(),
        "status": "opening",
        "villages": villages or [v["name"] if isinstance(v, dict) else v for v in seg.get("villages", [])],
        "note": note[:500],
    }
    if test_to:
        inc["test_to"] = ids.digits(test_to)
    db.put_incident(inc)
    who = {"helpline": ("नियंत्रण कक्ष (हेल्पलाइन कॉल)", "Control room (helpline call)"), "screen": ("प्रहरी (डेमो फ़ोन)", "Patrol worker (demo phone)")}
    w_hi, w_en = who.get(source, (roster.role_hi("patrol"), roster.role_en("patrol")))
    db.event(
        inc["id"],
        "report",
        f"{w_hi}: किमी {km}, {words.sign_hi(sign)}",
        f"{w_en}: km {km}, {words.sign_en(sign).lower()}",
        actor=reporter or source,
        km=int(km),
        sign=sign,
    )
    try:
        res = sfn().start_execution(
            stateMachineArn=config.STATE_MACHINE_ARN,
            name=inc["id"],
            input=json.dumps(run_input(inc, demo or bool(test_to)), ensure_ascii=False),
        )
    except Exception:
        db.update_incident(inc["id"], status="closed_failed_to_start")
        raise
    db.update_incident(inc["id"], execution_arn=res["executionArn"])
    inc["execution_arn"] = res["executionArn"]
    return inc


def public(inc: dict) -> dict:
    """The incident without the TEST sender's number."""
    return {k: v for k, v in inc.items() if k != "test_to"}
