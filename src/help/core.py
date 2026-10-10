"""Shared pieces of the help run (docs/SPEC.md, "The help run"): teams, distances, camps, clocks.

No names or phone numbers anywhere in HELP#, TEAM# or the API. A team's phone is an SSM
parameter (/bp/teams/<id>); a WhatsApp family's number is kept only under REPLY#<help id>
for a day, so the progress messages can reach them, and never shown.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import boto3

from common import clock, db

HERE = Path(__file__).resolve().parent
TEAMS = json.loads((HERE / "teams.json").read_text(encoding="utf-8"))["teams"]
STRETCH = json.loads((HERE.parent / "gov" / "stretch.json").read_text(encoding="utf-8"))
BBOX = (85.000, 25.905, 85.110, 25.995)  # west, south, east, north (the live map's grid)
TRACKER = "bp-teams"
COLLECTION = "bp-help"
NEEDS = {"boat", "medical", "food", "animals"}
ROUTE_FACTOR = 1.3  # straight line to a route over water and dry ground, roughly

REAL_CLOCKS = {"ask": 10 * 60, "onsite": 20 * 60, "safe": 6 * 3600}
DEMO_CLOCKS = {"ask": 60, "onsite": 120, "safe": 600}
LIMITS = {"asks": 4, "next": 3}

_loc = None


def location():
    global _loc
    if _loc is None:
        _loc = boto3.client("location")
    return _loc


def km_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine, kilometres, between (lat, lon) points."""
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def in_bbox(lat: float, lon: float) -> bool:
    w, s, e, n = BBOX
    return s <= lat <= n and w <= lon <= e


def nearest_village(lat: float, lon: float) -> dict:
    vs = [v for v in STRETCH["villages"] if v.get("lat") is not None]
    return min(vs, key=lambda v: km_between((lat, lon), (v["lat"], v["lon"])))


def camp_for(lat: float, lon: float) -> dict:
    v = nearest_village(lat, lon)
    km = km_between((lat, lon), (v["lat"], v["lon"])) * ROUTE_FACTOR
    return {"village": v["name"], "camp_hi": v.get("relief_camp_hi") or "पंचायत भवन (नमूना)", "camp_en": v.get("relief_camp_en") or "Panchayat bhawan (sample)", "km": round(km, 1), "walk_min": max(5, round(km / 4 * 60))}


def team_rows() -> dict[str, dict]:
    """TEAM#<id> rows (status, help_id, ssm), with the bundled sample's fields underneath."""
    out = {}
    for t in TEAMS:
        row = db.table().get_item(Key={"PK": f"TEAM#{t['id']}", "SK": "META"}).get("Item") or {}
        out[t["id"]] = {**t, "status": "free", "help_id": None, **db.plain(row)}
    return out


def positions() -> dict[str, dict]:
    """The tracker's latest position per team (ListDevicePositions), or {} when it has none."""
    out: dict[str, dict] = {}
    try:
        pages = location().get_paginator("list_device_positions").paginate(TrackerName=TRACKER)
        for page in pages:
            for e in page.get("Entries", []):
                out[e["DeviceId"]] = {"lon": e["Position"][0], "lat": e["Position"][1], "at": clock.iso(e["SampleTime"]) if hasattr(e["SampleTime"], "astimezone") else str(e["SampleTime"])}
    except Exception as err:  # noqa: BLE001  (no tracker yet, or throttled: fall back to the bases)
        print({"tracker": "no positions", "error": repr(err)})
    return out


def where(team: dict, pos: dict[str, dict]) -> tuple[float, float]:
    p = pos.get(team["id"])
    return (p["lat"], p["lon"]) if p else tuple(team["base"])


def minutes_to(team: dict, lat: float, lon: float, pos: dict[str, dict]) -> int:
    km = km_between(where(team, pos), (lat, lon)) * ROUTE_FACTOR
    return max(1, round(km / max(team.get("speed_kmh", 8), 1) * 60))


def nearest_free(lat: float, lon: float, tried: list[str]) -> dict | None:
    rows, pos = team_rows(), positions()
    free = [t for t in rows.values() if t["id"] not in tried and t.get("status", "free") == "free"]
    if not free:
        free = [t for t in rows.values() if t["id"] not in tried]
    if not free:
        return None
    best = min(free, key=lambda t: minutes_to(t, lat, lon, pos))
    return {**best, "minutes": minutes_to(best, lat, lon, pos)}


def set_team(team_id: str, **fields) -> None:
    names = {f"#{k}": k for k in fields}
    db.table().update_item(
        Key={"PK": f"TEAM#{team_id}", "SK": "META"},
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in fields),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues={f":{k}": v for k, v in db.clean(fields).items()},
    )


def reply_to(help_id: str) -> str:
    item = db.table().get_item(Key={"PK": f"REPLY#{help_id}", "SK": "META"}).get("Item")
    return str(item["phone"]) if item else ""
