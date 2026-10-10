"""Relief teams and their positions on the live map (docs/SPEC.md, "Positions" and "The public API").

GET  /teams                relief teams and their latest positions from the Location tracker
POST /teams/{id}/position  a team's phone reports where it is; calls BatchUpdateDevicePosition
"""

from __future__ import annotations

import json
from typing import Any

from botocore.exceptions import ClientError

from common import clock, db, http
from help import core

RELIEF = "/bp/tokens/relief"
DISTRICT = "/bp/tokens/district"


def role(event: dict) -> str:
    if http.has_token(event, RELIEF):
        return "relief"
    if http.has_token(event, DISTRICT):
        return "district"
    return ""


def listing(_event: dict) -> dict:
    """GET /teams: joins TEAM# rows with Amazon Location Service's latest device positions."""
    rows = core.team_rows()
    pos = core.positions()
    team_list: list[dict[str, Any]] = []

    for t in rows.values():
        lat, lon = core.where(t, pos)
        p = pos.get(t["id"])
        at = p["at"] if p else clock.iso()
        team_list.append(
            {
                "id": t["id"],
                "kind": t["kind"],
                "name_hi": t["name_hi"],
                "name_en": t["name_en"],
                "crew": t["crew"],
                "lat": lat,
                "lon": lon,
                "at": at,
                "status": t.get("status", "free"),
                "help_id": t.get("help_id"),
                "speed_kmh": t.get("speed_kmh", 8),
                "sample": False,
            }
        )

    return {
        "as_of": clock.iso(),
        "sample": False,
        "tracker": core.TRACKER,
        "teams": team_list,
    }


def update_position(event: dict) -> dict:
    """POST /teams/{id}/position: update a team's position on the tracker (role token required)."""
    who = role(event)
    if not who:
        return http.respond(401, {"error": "token"})

    team_id = http.path(event, "id")
    valid_ids = {t["id"] for t in core.TEAMS}
    if team_id not in valid_ids:
        return http.respond(404, {"error": "unknown_team"})

    b = http.body(event)
    try:
        lat = float(b["lat"])
        lon = float(b["lon"])
    except (KeyError, TypeError, ValueError):
        return http.respond(400, {"error": "lat, lon"})

    accuracy_m = float(b.get("accuracy_m", 10.0))
    at_str = b.get("at")
    try:
        sample_time = clock.parse(at_str) if at_str else clock.now()
    except Exception:
        sample_time = clock.now()

    try:
        core.location().batch_update_device_position(
            TrackerName=core.TRACKER,
            Updates=[
                {
                    "DeviceId": team_id,
                    "Position": [lon, lat],
                    "SampleTime": sample_time,
                    "Accuracy": {"Horizontal": accuracy_m},
                }
            ],
        )
    except ClientError as e:
        return http.respond(500, {"error": "tracker_error", "detail": str(e)})

    return http.respond(
        200,
        {
            "ok": True,
            "team": team_id,
            "position": {
                "lat": lat,
                "lon": lon,
                "accuracy_m": accuracy_m,
                "at": clock.iso(sample_time),
            },
        },
    )


def handler(event: dict, _ctx=None) -> dict:
    r = http.route(event)
    if r == "GET /teams":
        return http.respond(200, listing(event))
    if r == "POST /teams/{id}/position":
        return update_position(event)
    return http.respond(404, {"error": "no_route"})
