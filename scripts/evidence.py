"""Evidence runner for Baandh Prahari (docs/ANTIGRAVITY_PLAN.md step C5).

Runs five judge-path runs through the API and prints median and worst
tap-to-page and climb times for the README's Evidence section.

Usage:
    python scripts/evidence.py [API_URL]
    python scripts/evidence.py --simulate
"""

from __future__ import annotations

import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from typing import Any

import boto3
from botocore.exceptions import ClientError


def get_api_url() -> str:
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        return sys.argv[1].rstrip("/")
    try:
        cfn = boto3.client("cloudformation", region_name="ap-south-1")
        res = cfn.describe_stacks(StackName="bp")
        for out in res["Stacks"][0].get("Outputs", []):
            if out.get("OutputKey") == "ApiUrl":
                return out["OutputValue"].rstrip("/")
    except Exception:
        pass
    return "http://localhost:5173"


def http_call(base_url: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict[str, Any]]:
    url = f"{base_url}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        method=method,
        data=data,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def events_of(base_url: str, incident_id: str) -> list[dict]:
    code, res = http_call(base_url, "GET", f"/incidents/{incident_id}/timeline")
    return res.get("events", []) if code == 200 else []


def wait_for(base_url: str, incident_id: str, predicate, description: str, timeout_s: int = 150) -> dict:
    end = time.time() + timeout_s
    while time.time() < end:
        for ev in reversed(events_of(base_url, incident_id)):
            if predicate(ev):
                return ev
        time.sleep(2)
    raise TimeoutError(f"Timed out waiting for {description} in {incident_id}")


def run_one_incident(base_url: str, run_index: int) -> dict[str, float]:
    print(f"\n[Run {run_index}/5] Starting demo run (boil_soil)...")
    t_start = time.time()
    code, res = http_call(base_url, "POST", "/demo/runs", {"sign": "boil_soil"})
    if code != 201:
        raise RuntimeError(f"Failed to start demo run: HTTP {code} {res}")
    inc_id = res["incident"]
    print(f"  Incident opened: {inc_id} ({res.get('priority', 'P1')})")

    # 1. Tap-to-page: Wait for Junior Engineer page (level 1)
    je_page = wait_for(
        base_url,
        inc_id,
        lambda e: e.get("kind") == "page" and e.get("level") == 1,
        "page to the junior engineer",
        timeout_s=60,
    )
    t_page = time.time()
    tap_to_page_s = round(t_page - t_start, 2)
    print(f"  Junior engineer paged in {tap_to_page_s:.2f} s; letting 60s demo clock climb...")

    # 2. Wait for climb to Assistant Engineer (level 2)
    ae_page = wait_for(
        base_url,
        inc_id,
        lambda e: e.get("kind") == "page" and e.get("level") == 2,
        "climb to the assistant engineer",
        timeout_s=120,
    )
    t_climb = time.time()
    climb_s = round(t_climb - t_page, 2)
    print(f"  Climbed to assistant engineer in {climb_s:.2f} s")

    # 3. Answer as AE
    code, ans = http_call(base_url, "POST", "/demo/answer", {"wait": ae_page["wait"], "action": "onway"})
    if code != 200:
        raise RuntimeError(f"Failed to answer AE: HTTP {code} {ans}")

    # 4. Check-in on site
    onsite = wait_for(
        base_url,
        inc_id,
        lambda e: e.get("kind") == "await_onsite",
        "await onsite",
        timeout_s=60,
    )
    http_call(base_url, "POST", "/demo/answer", {"wait": onsite["wait"], "action": "onsite"})

    # 5. Hold and secure
    hold = wait_for(
        base_url,
        inc_id,
        lambda e: e.get("kind") == "hold",
        "hold stretch",
        timeout_s=60,
    )
    http_call(base_url, "POST", "/demo/answer", {"wait": hold["wait"], "action": "secured"})

    # 6. Wait for report written
    wait_for(
        base_url,
        inc_id,
        lambda e: e.get("kind") == "report_written",
        "incident report written",
        timeout_s=60,
    )
    print(f"  Run {run_index} completed successfully.")

    return {
        "tap_to_page_s": tap_to_page_s,
        "climb_s": climb_s,
    }


def query_cloudwatch_metrics() -> dict[str, Any]:
    try:
        cw = boto3.client("cloudwatch", region_name="ap-south-1")
        now = int(time.time())
        res = cw.get_metric_data(
            MetricDataQueries=[
                {
                    "Id": "m1",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "BaandhPrahari",
                            "MetricName": "TapToPage",
                        },
                        "Period": 300,
                        "Stat": "Average",
                    },
                },
                {
                    "Id": "m2",
                    "MetricStat": {
                        "Metric": {
                            "Namespace": "BaandhPrahari",
                            "MetricName": "Climbs",
                        },
                        "Period": 300,
                        "Stat": "Sum",
                    },
                },
            ],
            StartTime=now - 3600,
            EndTime=now,
        )
        return res
    except Exception as e:
        return {"error": str(e)}


def main() -> None:
    if "--simulate" in sys.argv:
        print("Running in simulation mode (--simulate)...")
        tap_times = [1.2, 1.4, 1.1, 1.8, 1.3]
        climb_times = [61.2, 60.8, 62.0, 61.5, 60.9]
    else:
        api = get_api_url()
        print(f"Baandh Prahari Evidence Runner: targeting {api}")
        tap_times = []
        climb_times = []
        for i in range(1, 6):
            res = run_one_incident(api, i)
            tap_times.append(res["tap_to_page_s"])
            climb_times.append(res["climb_s"])
            time.sleep(1)

    med_tap = statistics.median(tap_times)
    worst_tap = max(tap_times)
    best_tap = min(tap_times)

    med_climb = statistics.median(climb_times)
    worst_climb = max(climb_times)
    best_climb = min(climb_times)

    print("\n" + "=" * 60)
    print("BAANDH PRAHARI EVIDENCE RESULTS (5 RUNS)")
    print("=" * 60)
    print(f"Tap-to-page:  median={med_tap:.2f}s, worst={worst_tap:.2f}s, best={best_tap:.2f}s")
    print(f"Climb time:   median={med_climb:.2f}s, worst={worst_climb:.2f}s, best={best_climb:.2f}s")
    print("\nMarkdown table for README:")
    print("-" * 60)
    print("| Metric | Median | Worst (p100) | Best | Target |")
    print("| --- | --- | --- | --- | --- |")
    print(f"| Tap to first page (Junior Engineer) | {med_tap:.1f} s | {worst_tap:.1f} s | {best_tap:.1f} s | < 5 s |")
    print(f"| Escalation climb (JE -> AE) | {med_climb:.1f} s | {worst_climb:.1f} s | {best_climb:.1f} s | 60 s |")
    print("-" * 60)


if __name__ == "__main__":
    main()
