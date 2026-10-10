"""make fast-incident: drive a P1 on demo clocks through the deployed API and check the story.

    python scripts/fast_incident.py https://<api-id>.execute-api.ap-south-1.amazonaws.com

It starts a judge-path run (screen channel: no real phone), lets the junior engineer's
one-minute clock run out, answers as the assistant engineer, checks in on site, marks the
stretch secured, and asserts the timeline holds: report, page, climb, answer, warning,
on site, close. Takes about two minutes. Uses only the standard library.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else ""


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def events(inc: str) -> list[dict]:
    return call("GET", f"/incidents/{inc}/timeline")[1].get("events", [])


def wait_for(inc: str, pred, what: str, limit_s: int = 150) -> dict:
    end = time.time() + limit_s
    while time.time() < end:
        for e in reversed(events(inc)):
            if pred(e):
                return e
        time.sleep(3)
    raise SystemExit(f"FAIL: no {what} within {limit_s} s")


def tap(wait: str, action: str) -> None:
    code, res = call("POST", "/demo/answer", {"wait": wait, "action": action})
    if code != 200:
        raise SystemExit(f"FAIL: tap {action} answered {code} {res}")


def main() -> None:
    if not BASE:
        raise SystemExit(__doc__)
    t0 = time.time()
    code, res = call("POST", "/demo/runs", {"sign": "boil_soil"})
    if code != 201:
        raise SystemExit(f"FAIL: could not start a demo run ({code} {res}); another may be running")
    inc = res["incident"]
    print(f"run {inc}: {res['priority']}")
    wait_for(inc, lambda e: e["kind"] == "page" and e.get("level") == 1, "page to the junior engineer", 60)
    print("  paged the junior engineer; letting the clock run out")
    ae = wait_for(inc, lambda e: e["kind"] == "page" and e.get("level") == 2, "climb to the assistant engineer", 120)
    tap(ae["wait"], "onway")
    print("  climbed; the assistant engineer answered")
    on = wait_for(inc, lambda e: e["kind"] == "await_onsite", "on-site wait", 60)
    tap(on["wait"], "onsite")
    hold = wait_for(inc, lambda e: e["kind"] == "hold", "hold", 60)
    tap(hold["wait"], "secured")
    wait_for(inc, lambda e: e["kind"] == "report_written", "the incident report", 60)
    kinds = [e["kind"] for e in events(inc)]
    for k in ("report", "open", "priority", "warning", "page", "climb", "answer", "dispatch", "await_onsite", "hold", "close", "report_written"):
        assert k in kinds, f"FAIL: no {k} in the timeline"
    x = call("GET", f"/incidents/{inc}/execution")[1]
    names = [s["name"] for s in x.get("states", [])]
    assert "PageAssistantEngineer" in names and any(s["status"] == "timed_out" for s in x["states"]), names
    print(f"PASS in {time.time() - t0:.0f} s: report, page, timeout, climb, answer, warning, on site, close")


if __name__ == "__main__":
    main()
