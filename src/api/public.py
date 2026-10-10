"""Read-only routes for the public page and the control room.

GET /incidents?status=open, GET /incidents/{id}/timeline, GET /incidents/{id}/execution.
Shapes match web/src/types.ts (Incidents, Timeline, Execution).
"""

from __future__ import annotations

import json
import re
import time

from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from common import clock, db, http

_sfn = None

SHOWN = {
    # the states the page draws, in the order the run reaches them (SPEC names)
    "OpenIncident",
    "WarnVillagesGetReady",
    "PageJuniorEngineer",
    "PageAssistantEngineer",
    "PageExecutiveEngineer",
    "PageForceAndDistrict",
    "AlertCentralFloodControlRoom",
    "DispatchRepairTeam",
    "AwaitEngineerOnSite",
    "HoldTheStretch",
    "WarnVillagesMoveNow",
    "AllClear",
    "HandToDistrict",
    "WriteIncidentReport",
}


def sfn():
    global _sfn
    if _sfn is None:
        _sfn = boto3.client("stepfunctions")
    return _sfn


def incident_card(i: dict) -> dict:
    return {
        "id": i["id"],
        "km": i.get("km"),
        "sign": i.get("sign"),
        "priority": i.get("priority"),
        "status": i.get("status"),
        "with_role": i.get("with_role", ""),
        "opened": i.get("opened"),
        "deadline": i.get("deadline", i.get("opened")),
        "villages": i.get("villages", []),
        "channel": "helpline" if i.get("source") == "helpline" else "whatsapp",
        "summary_hi": i.get("summary_hi", ""),
        "summary_en": i.get("summary_en", ""),
        "demo": bool(i.get("demo")),
    }


def history_to_states(events: list[dict]) -> list[dict]:
    """GetExecutionHistory events -> [{name, entered, exited, status, detail}] for the states the page shows."""
    out: list[dict] = []
    current: dict | None = None
    for e in events:
        t = e.get("type", "")
        ts = e.get("timestamp")
        at = clock.iso(ts) if hasattr(ts, "astimezone") else str(ts)
        if t.endswith("StateEntered"):
            name = e["stateEnteredEventDetails"]["name"]
            current = {"name": name, "entered": at, "exited": None, "status": "running", "detail": None}
            out.append(current)
        elif t.endswith("StateExited"):
            name = e["stateExitedEventDetails"]["name"]
            for s in reversed(out):
                if s["name"] == name and s["exited"] is None:
                    s["exited"] = at
                    if s["status"] == "running":
                        s["status"] = "succeeded"
                    break
        elif t == "TaskTimedOut" and current:
            current["status"] = "timed_out"
            current["detail"] = "States.Timeout: the clock climbs"
        elif t in ("LambdaFunctionFailed", "LambdaFunctionTimedOut") and current:
            d = e.get("lambdaFunctionFailedEventDetails") or e.get("lambdaFunctionTimedOutEventDetails") or {}
            current["status"] = "failed"
            current["detail"] = d.get("error") or t
        elif t == "TaskFailed" and current:
            d = e.get("taskFailedEventDetails", {})
            current["status"] = "timed_out" if d.get("error") in ("Declined", "Undelivered") else "failed"
            current["detail"] = f"{d.get('error', '')}: the clock climbs" if d.get("error") in ("Declined", "Undelivered") else d.get("error")
        elif t == "TaskSucceeded" and current:
            out_json = e.get("taskSucceededEventDetails", {}).get("output") or ""
            if '"action"' in out_json:
                try:
                    current["detail"] = f"SendTaskSuccess: {json.loads(out_json).get('action')}"
                except ValueError:
                    pass
    return [s for s in out if s["name"] in SHOWN]


# Every open judge tab polls the same run: answer from a few seconds' cache so the page never
# drains Step Functions' GetExecutionHistory quota. On throttling, serve the last good copy.
_cache: dict[str, tuple[float, dict]] = {}
CACHE_S = 3.0


def execution(incident_id: str) -> dict | None:
    inc = db.get_incident(incident_id)
    if not inc or not inc.get("execution_arn"):
        return None
    if inc.get("sample") or inc.get("execution_arn") == "sample" or incident_id == "INC-0930-14":
        if inc.get("execution"):
            return inc["execution"]
        p = Path(__file__).parent / "replay_execution.json"
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    hit = _cache.get(incident_id)
    if hit and time.time() - hit[0] < CACHE_S:
        return hit[1]
    try:
        out = _execution(inc["execution_arn"])
    except ClientError as e:
        if hit and e.response.get("Error", {}).get("Code") == "ThrottlingException":
            return hit[1]
        raise
    _cache[incident_id] = (time.time(), out)
    if len(_cache) > 200:
        _cache.pop(next(iter(_cache)))
    return out


def _execution(arn: str) -> dict:
    events: list[dict] = []
    kwargs = {"executionArn": arn, "maxResults": 1000, "includeExecutionData": True}
    while True:
        res = sfn().get_execution_history(**kwargs)
        events.extend(res.get("events", []))
        if not res.get("nextToken"):
            break
        kwargs["nextToken"] = res["nextToken"]
    desc = sfn().describe_execution(executionArn=arn)
    # the account ID stays off the public page
    shown = re.sub(r":\d{12}:", ":…:", arn)
    return {"executionArn": shown, "type": "STANDARD", "sample": False, "status": desc.get("status"), "states": history_to_states(events)}


def timeline(incident_id: str) -> dict | None:
    inc = db.get_incident(incident_id)
    if not inc:
        return None
    events = db.timeline(incident_id)
    return {
        "incident": {
            "id": inc["id"],
            "km": inc.get("km"),
            "sign": inc.get("sign"),
            "priority": inc.get("priority"),
            "status": inc.get("status"),
            "villages": inc.get("villages", []),
            "reenactment": bool(inc.get("reenactment", False)),
            "demo": bool(inc.get("demo")),
            "note_hi": inc.get("note_hi") or ("डेमो: स्क्रीन पर बने फ़ोन, कोई असली फ़ोन नहीं।" if inc.get("demo") else ""),
            "note_en": inc.get("note_en") or ("Demo: the phones drawn on screen, no real phone." if inc.get("demo") else ""),
        },
        "events": events if inc.get("demo") else [_redact(e) for e in events],
    }


def _redact(e: dict) -> dict:
    """Real runs: no wait IDs, no button IDs, no names on the public timeline."""
    e = {k: v for k, v in e.items() if k not in ("wait", "name", "by")}
    if "buttons" in e:
        e["buttons"] = [{"hi": b.get("hi"), "en": b.get("en")} for b in e["buttons"]]
    return e


def handler(event: dict, _ctx=None) -> dict:
    r = http.route(event)
    if r == "GET /incidents":
        items = [incident_card(i) for i in db.open_incidents()]
        return http.respond(200, {"as_of": clock.iso(), "sample": False, "incidents": items})
    if r == "GET /incidents/{id}/timeline":
        t = timeline(http.path(event, "id"))
        return http.respond(200, t) if t else http.respond(404, {"error": "not_found"})
    if r == "GET /incidents/{id}/execution":
        x = execution(http.path(event, "id"))
        return http.respond(200, x) if x else http.respond(404, {"error": "not_found"})
    if r == "GET /briefing/{id}":
        from api import briefing
        html_doc = briefing.render(http.path(event, "id"))
        if not html_doc:
            return http.respond(404, {"error": "not_found"})
        return {
            "statusCode": 200,
            "headers": {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
            },
            "body": html_doc,
        }
    return http.respond(404, {"error": "no_route"})
