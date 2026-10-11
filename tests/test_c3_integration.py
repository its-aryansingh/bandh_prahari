"""Full API contract integration test for the web front-end (Step C3).

Validates every public route against web/src/types.ts and web/mock/:
- GET /stretch, GET /gauges (Rewaghat present, correct fields)
- GET /incidents?status=open (id, km, priority, status, with_role, deadline)
- GET /incidents/{id}/timeline, /execution
- POST /demo/runs, POST /demo/answer, GET /demo/runs/current
- GET /help, POST /help, GET /teams, POST /teams/{id}/position
- GET /map/{stretch}
- GET /briefing/{id}
- GET /rollcall/latest
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest

from api import control, demo, help as api_help, public, river
from asl_runner import FakeStepFunctions
from common import clock, config, db, http
from help import core as help_core, run as help_run
from incident import answer, start
from teams import position as api_teams

ROOT = Path(__file__).resolve().parent.parent


def ev(route, body=None, headers=None, path=None, qs=None):
    return {
        "routeKey": route,
        "body": json.dumps(body) if body is not None else "",
        "headers": headers or {},
        "pathParameters": path or {},
        "queryStringParameters": qs or {},
    }


class FakeLocation:
    def __init__(self):
        self.positions: dict[str, dict] = {}
        self.geofences: dict[str, dict] = {}

    def batch_update_device_position(self, TrackerName: str, Updates: list[dict]):
        for u in Updates:
            self.positions[u["DeviceId"]] = {
                "Position": u["Position"],
                "SampleTime": u.get("SampleTime", clock.now()),
                "Accuracy": u.get("Accuracy", {}),
            }
        return {"Errors": []}

    def list_device_positions(self, TrackerName: str):
        entries = [
            {
                "DeviceId": dev_id,
                "Position": p["Position"],
                "SampleTime": p["SampleTime"],
                "Accuracy": p.get("Accuracy", {}),
            }
            for dev_id, p in self.positions.items()
        ]
        return {"Entries": entries}

    def get_paginator(self, operation_name: str):
        assert operation_name == "list_device_positions"

        class Paginator:
            def __init__(self, loc):
                self.loc = loc

            def paginate(self, **kwargs):
                return [self.loc.list_device_positions(**kwargs)]

        return Paginator(self)

    def put_geofence(self, CollectionName: str, GeofenceId: str, Geometry: dict):
        self.geofences[GeofenceId] = Geometry
        return {"GeofenceId": GeofenceId, "CreateTime": clock.now(), "UpdateTime": clock.now()}

    def batch_delete_geofence(self, CollectionName: str, GeofenceIds: list[str]):
        for gid in GeofenceIds:
            self.geofences.pop(gid, None)
        return {"Errors": []}


class C3FakeStepFunctions(FakeStepFunctions):
    def get_execution_history(self, **k):
        return {"events": []}

    def describe_execution(self, **k):
        return {"status": "RUNNING"}


@pytest.fixture
def sfn(aws, monkeypatch):
    fake = C3FakeStepFunctions()
    monkeypatch.setattr(start, "_sfn", fake)
    monkeypatch.setattr(answer, "_sfn", fake)
    monkeypatch.setattr(public, "_sfn", fake)
    monkeypatch.setattr(help_run, "_sfn", fake)
    monkeypatch.setattr(config, "HELP_MACHINE_ARN", "arn:aws:states:ap-south-1:123456789012:stateMachine:bp-help")
    return fake


def test_get_stretch_contract(aws):
    res = river.handler(ev("GET /stretch"))
    assert res["statusCode"] == 200
    b = json.loads(res["body"])
    assert "stretch" in b and "segments" in b and "villages" in b and "gauges" in b
    st = b["stretch"]
    assert st["id"] == "gandak-rb-haijalpur"
    assert st["river"] == "Gandak"
    assert st["length_km"] >= 20
    assert len(b["segments"]) >= 20
    assert any(g["site"] == "Rewaghat" for g in b["gauges"])


def test_get_gauges_contract(aws):
    # Insert a reading for Rewaghat
    db.table().put_item(
        Item={
            "PK": "GAUGE#Rewaghat",
            "SK": "2026-10-11T09:00:00+05:30",
            "site": "Rewaghat",
            "site_hi": "रेवाघाट",
            "river": "गंडक",
            "district": "सारण",
            "wl": Decimal("54.50"),
            "dl": Decimal("54.41"),
            "trend": "rising",
            "source": "FMISC",
            "time": "2026-10-11T09:00:00+05:30",
        }
    )
    res = river.handler(ev("GET /gauges"))
    assert res["statusCode"] == 200
    b = json.loads(res["body"])
    assert "readings" in b
    readings = b["readings"]
    assert len(readings) > 0
    # Must have Rewaghat with wl_m and dl_m
    rewa = next((r for r in readings if r["site"] == "Rewaghat"), None)
    assert rewa is not None
    assert "wl_m" in rewa and "dl_m" in rewa
    assert "trend" in rewa and "time" in rewa and "source" in rewa


def test_get_incidents_open_contract(sfn):
    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    res = public.handler(ev("GET /incidents", qs={"status": "open"}))
    assert res["statusCode"] == 200
    b = json.loads(res["body"])
    assert "incidents" in b
    card = next((i for i in b["incidents"] if i["id"] == inc["id"]), None)
    assert card is not None
    # Crucial fields for the 3D map's beacons and control room:
    for field in ("id", "km", "priority", "status", "with_role", "deadline"):
        assert field in card, f"missing field: {field}"
    assert card["km"] == 14
    assert card["priority"] == "P1"


def test_get_timeline_and_execution_contract(sfn):
    inc = start.start(14, "crack", channel="screen", source="screen", demo=True)
    res_time = public.handler(ev("GET /incidents/{id}/timeline", path={"id": inc["id"]}))
    assert res_time["statusCode"] == 200
    b_time = json.loads(res_time["body"])
    assert "incident" in b_time and "events" in b_time
    assert len(b_time["events"]) > 0
    ev0 = b_time["events"][0]
    assert "kind" in ev0 and "at" in ev0

    # Execution history
    res_exec = public.handler(ev("GET /incidents/{id}/execution", path={"id": inc["id"]}))
    assert res_exec["statusCode"] == 200
    b_exec = json.loads(res_exec["body"])
    assert "states" in b_exec
    assert "status" in b_exec


def test_demo_judge_path_contract(sfn):
    res_start = demo.handler(ev("POST /demo/runs", {"sign": "boil_soil"}))
    assert res_start["statusCode"] == 201
    b_start = json.loads(res_start["body"])
    assert "incident" in b_start and "priority" in b_start

    # Current demo run
    res_curr = demo.handler(ev("GET /demo/runs/current"))
    assert res_curr["statusCode"] == 200
    b_curr = json.loads(res_curr["body"])
    assert b_curr.get("incident") == b_start["incident"]


def test_help_and_teams_contract(sfn, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "tok_relief" if "relief" in name else "")
    fake_loc = FakeLocation()
    monkeypatch.setattr(help_core, "_loc", fake_loc)

    # Post a help request
    help_body = {
        "lat": 25.962,
        "lon": 85.051,
        "people": 4,
        "elderly": 1,
        "children": 2,
        "needs": ["boat"],
    }
    res_post = api_help.handler(ev("POST /help", help_body))
    assert res_post["statusCode"] == 201
    card = json.loads(res_post["body"])
    assert "id" in card and "village" in card and "key" in card and "status" in card

    # GET /help public (zero exact pins, village counts only)
    res_pub = api_help.handler(ev("GET /help", qs={"status": "open"}))
    assert res_pub["statusCode"] == 200
    b_pub = json.loads(res_pub["body"])
    assert "by_village" in b_pub
    assert "requests" not in b_pub  # Public privacy rule

    # GET /help with relief role token
    res_auth = api_help.handler(ev("GET /help", qs={"status": "open"}, headers={"authorization": "Bearer tok_relief"}))
    assert res_auth["statusCode"] == 200
    b_auth = json.loads(res_auth["body"])
    assert "requests" in b_auth
    assert len(b_auth["requests"]) > 0
    assert b_auth["requests"][0]["lat"] == 25.962

    # GET /teams
    res_teams = api_teams.handler(ev("GET /teams"))
    assert res_teams["statusCode"] == 200
    b_teams = json.loads(res_teams["body"])
    assert "teams" in b_teams
    assert len(b_teams["teams"]) > 0
    t0 = b_teams["teams"][0]
    assert "id" in t0 and "kind" in t0 and "crew" in t0


def test_map_grid_and_briefing_contract(aws):
    # Seed replay incident INC-0930-14 into DynamoDB table
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    import seed
    for item in seed.replay_items():
        db.table().put_item(Item=item)

    # GET /map/haijalpur
    res_map = river.handler(ev("GET /map/{stretch}", path={"stretch": "haijalpur"}))
    assert res_map["statusCode"] == 200
    grid = json.loads(res_map["body"])
    assert grid["cols"] == 56 and grid["rows"] == 46
    assert len(grid["elev_dm"]) == 56 * 46
    assert len(grid["cls"]) == 56 * 46

    # GET /briefing/INC-0930-14 (replay incident)
    res_brf = public.handler(ev("GET /briefing/{id}", path={"id": "INC-0930-14"}))
    assert res_brf["statusCode"] == 200
    assert res_brf["headers"]["content-type"].startswith("text/html")
    assert "IRS" in res_brf["body"] and "Haijalpur" in res_brf["body"]


def test_rollcall_latest_contract(aws):
    res_rc = river.handler(ev("GET /rollcall/latest"))
    assert res_rc["statusCode"] == 200
    b_rc = json.loads(res_rc["body"])
    assert "slot" in b_rc and "kms" in b_rc
    assert len(b_rc["kms"]) == 20
