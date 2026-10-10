"""The river and the government plumbing, read only.

GET /stretch      segments, villages and gauges for the map (web/src/types.ts Stretch)
GET /gauges       the latest official readings, active CWC alerts and the GloFAS series (Gauges)
GET /cap/rss.xml  our CAP drafts, in the shape of SACHET's feeds (all status Exercise)
GET /cap/{id}.xml one draft
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import clock, config, db, http
from gov import cap
from river import poll

STRETCH = json.loads((Path(__file__).resolve().parent.parent / "gov" / "stretch.json").read_text(encoding="utf-8"))
CAP_ID = re.compile(r"^BP-[A-Za-z0-9-]{4,80}$")


def stretch() -> dict:
    out = {k: v for k, v in json.loads(json.dumps(STRETCH)).items() if not k.startswith("_")}
    for s in out["segments"]:
        seg = db.get_segment(s["km"])
        if seg:
            s["villages"] = seg.get("villages", s["villages"])
            s["breach_last_5y"] = bool(seg.get("breach_last_5y"))
            s["vulnerable"] = bool(seg.get("vulnerable"))
    return out


def gauges() -> dict:
    readings, alerts = [], []
    for g in STRETCH["gauges"]:
        rows = db.latest_readings(g["site"], 1)
        if rows:
            r = rows[0]
            readings.append(
                {
                    "site": g["site"],
                    "site_hi": g["site_hi"],
                    "river": g["river"],
                    "district": g["district"],
                    "wl_m": r["wl"],
                    "dl_m": r["dl"],
                    **({"hfl_m": r["hfl"]} if r.get("hfl") is not None else {}),
                    **({"hfl_date": r["hfl_date"]} if r.get("hfl_date") else {}),
                    "trend": r.get("trend", "steady"),
                    "time": r["time"],
                    "source": r.get("source", ""),
                    "source_url": r.get("source_url", ""),
                    "sample": False,
                }
            )
        for ptr in db.active_alerts(g["site"]):
            a = db.table().get_item(Key={"PK": f"ALERT#{ptr['SK'][6:]}", "SK": "META"}).get("Item")
            if a:
                a = db.plain(a)
                alerts.append({k: a.get(k, "") for k in ("identifier", "sender", "event", "severity", "urgency", "headline", "description", "area", "effective", "expires")} | {"sample": False})
    res = db.table().query(KeyConditionExpression=Key("PK").eq(f"GLOFAS#{poll.CELL}"), ScanIndexForward=False, Limit=45)
    series = sorted(({"date": i["SK"], "q": db.plain(i["q"]), "forecast": bool(i.get("forecast"))} for i in res.get("Items", [])), key=lambda x: x["date"])
    return {
        "as_of": clock.iso(),
        "readings": readings,
        "alerts": alerts,
        "glofas": {
            "cell": poll.CELL,
            "source": "Open-Meteo Flood API (GloFAS)",
            "unit": "m3/s",
            "note": "Model estimate, not an official reading.",
            "series": series,
        },
    }


def _xml(status: int, body: str) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/xml; charset=utf-8", "cache-control": "max-age=60"}, "body": body}


def cap_feed(base: str) -> dict:
    res = db.table().query(KeyConditionExpression=Key("PK").eq("CAP#ALL"), ScanIndexForward=False, Limit=50)
    return _xml(200, cap.rss([db.plain(i) for i in res.get("Items", [])], base))


def cap_one(identifier: str) -> dict:
    if not CAP_ID.match(identifier):
        return _xml(404, "<error>not found</error>")
    item = db.table().get_item(Key={"PK": f"CAP#{identifier}", "SK": "META"}).get("Item")
    if not item:
        return _xml(404, "<error>not found</error>")
    obj = boto3.client("s3").get_object(Bucket=config.BUCKET_NAME, Key=item["s3_key"])
    return _xml(200, obj["Body"].read().decode("utf-8"))


def map_grid(stretch_id: str) -> dict | None:
    if config.BUCKET_NAME:
        try:
            obj = boto3.client("s3").get_object(Bucket=config.BUCKET_NAME, Key=f"map/{stretch_id}/latest.json")
            return json.loads(obj["Body"].read().decode("utf-8"))
        except ClientError:
            pass
    p = Path(__file__).resolve().parent.parent / "gov" / f"map.{stretch_id}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


def handler(event: dict, _ctx=None) -> dict:
    r = http.route(event)
    if r == "GET /stretch":
        return http.respond(200, stretch())
    if r == "GET /gauges":
        return http.respond(200, gauges())
    if r == "GET /cap/rss.xml":
        host = (event.get("requestContext") or {}).get("domainName", "")
        return cap_feed(f"https://{host}" if host else "")
    if r == "GET /cap/{file}":
        f = http.path(event, "file")
        return cap_one(f[:-4] if f.endswith(".xml") else f)
    if r == "GET /map/{stretch}":
        st = http.path(event, "stretch")
        g = map_grid(st)
        return http.respond(200, g) if g else http.respond(404, {"error": "not_found"})
    return http.respond(404, {"error": "no_route"})
