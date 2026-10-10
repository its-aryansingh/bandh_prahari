"""WriteIncidentReport: close the incident, write the report, and lock the record.

The timeline is copied to the Object Lock bucket (governance mode), so nobody can quietly
change who knew what, and when. The report is written from the timeline by plain code; the
agent's richer Hindi and English report is added in the voice slice and never changes the facts.
"""

from __future__ import annotations

import json

import boto3

from common import clock, config, db

OUTCOME = {
    "secured": ("बाँध सुरक्षित", "secured"),
    "breached": ("बाँध टूटा, ज़िले को सौंपा", "breached, handed to the district"),
    "unanswered": ("किसी ने जवाब नहीं दिया", "nobody answered"),
    "district": ("ज़िले के पास", "with the district"),
}


def summary(events: list[dict]) -> dict:
    """Minutes from the first page to the first answer, and how many times the clock climbed."""
    first_page = next((e["at"] for e in events if e.get("kind") == "page"), None)
    first_answer = next((e["at"] for e in events if e.get("kind") == "answer" and e.get("action") == "onway"), None)
    mins = None
    if first_page and first_answer:
        mins = round((clock.parse(first_answer) - clock.parse(first_page)).total_seconds() / 60, 1)
    return {
        "minutes_to_answer": mins,
        "climbs": sum(1 for e in events if e.get("kind") == "climb"),
        "warnings": [e.get("level") for e in events if e.get("kind") == "warning"],
        "events": len(events),
    }


def handler(event: dict, _ctx=None) -> dict:
    inc = event["incident"]
    outcome = event.get("outcome", "secured")
    hi, en = OUTCOME.get(outcome, (outcome, outcome))
    db.update_incident(inc["id"], status=f"closed_{outcome}", closed=clock.iso())
    events = db.timeline(inc["id"])
    s = summary(events)
    ans = f"{s['minutes_to_answer']} मिनट" if s["minutes_to_answer"] is not None else "कोई जवाब नहीं"
    ans_en = f"{s['minutes_to_answer']} min" if s["minutes_to_answer"] is not None else "no answer"
    db.event(
        inc["id"],
        "close",
        f"घटना बंद: {hi}",
        f"Incident closed: {en}",
        actor="system",
        outcome=outcome,
    )
    report = db.event(
        inc["id"],
        "report_written",
        f"रिपोर्ट: पहले जवाब तक {ans}, घड़ी {s['climbs']} बार आगे बढ़ी",
        f"Report: {ans_en} to the first answer; the clock climbed {s['climbs']} times",
        actor="system",
        **s,
    )
    key = None
    if config.BUCKET_NAME:
        key = f"timelines/{inc['id']}.json"
        record = {k: v for k, v in (db.get_incident(inc["id"]) or {}).items() if k != "test_to"}
        body = json.dumps({"incident": record, "events": db.timeline(inc["id"]), "summary": s}, ensure_ascii=False, indent=1)
        # The bucket's default retention (governance mode) applies to this new object version.
        try:
            # Object Lock buckets refuse uploads without a checksum (Content-MD5 or x-amz-checksum-*)
            boto3.client("s3").put_object(Bucket=config.BUCKET_NAME, Key=key, Body=body.encode(), ContentType="application/json; charset=utf-8", ChecksumAlgorithm="SHA256")
        finally:
            if inc.get("demo"):
                release_demo_lock(inc["id"])
    elif inc.get("demo"):
        release_demo_lock(inc["id"])
    return {"outcome": outcome, "record": key, "report": report["text_en"]}


def release_demo_lock(incident_id: str) -> None:
    """The judge path runs one demo at a time; a closed demo frees the slot."""
    try:
        db.table().delete_item(
            Key={"PK": "DEMO#LOCK", "SK": "META"},
            ConditionExpression="incident = :i",
            ExpressionAttributeValues={":i": incident_id},
        )
    except Exception:  # someone else's lock, or already gone
        pass
