"""Tests for the Help run, teams, and live map API (docs/SPEC.md, "Help", "The help run", "The public API").

SPEC requirements tested:
1. Public GET /help returns by_village counts only and zero pins.
2. Authorized GET /help with relief or district token returns requests with exact pins.
3. Family tracking with ?mine=<id>&key=<k> returns only that family's request with pin.
4. Phone numbers are stored only as SHA256 hashes (never plaintext in HELP#).
5. GET /teams returns teams joined with tracker positions / base coordinates.
6. POST /teams/{id}/position updates tracker with role token.
7. A help request on demo clocks with a late team climbs to the next team and closes as rescued.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import channels
from api import help as help_api
from asl_runner import FakeStepFunctions, Run
from common import clock, db, http
from help import core, run as help_run
from incident import answer
from teams import position as teams_pos

HELP_ASL = json.loads((Path(__file__).resolve().parent.parent / "statemachine" / "help.asl.json").read_text(encoding="utf-8"))


def ev(route, body=None, headers=None, path=None, query=None):
    return {
        "routeKey": route,
        "body": json.dumps(body or {}),
        "headers": headers or {},
        "pathParameters": path or {},
        "queryStringParameters": query or {},
    }


class FakeLocation:
    """In-memory mock for Amazon Location Service tracker and geofence collection."""

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


@pytest.fixture
def fake_loc(monkeypatch):
    loc = FakeLocation()
    monkeypatch.setattr(core, "_loc", loc)
    return loc


@pytest.fixture
def sfn(aws, monkeypatch):
    fake = FakeStepFunctions()
    monkeypatch.setattr(help_run, "_sfn", fake)
    monkeypatch.setattr(answer, "_sfn", fake)

    real_module = channels._module

    def screen_only(channel):
        assert channel == "screen", f"a test tried {channel}"
        return real_module(channel)

    monkeypatch.setattr(channels, "_module", screen_only)
    return fake


# ---------------- API Tests ----------------


def test_public_get_help_returns_by_village_counts_and_zero_pins(aws, sfn, fake_loc):
    # Create two help requests in Haijalpur
    h1 = help_run.create(25.9568, 85.0501, 4, elderly=1, children=1, needs=["boat"])
    h2 = help_run.create(25.9510, 85.0521, 3, elderly=0, children=2, needs=["food"])

    # Anonymous request
    res = help_api.handler(ev("GET /help"))
    assert res["statusCode"] == 200
    body = json.loads(res["body"])

    assert "by_village" in body
    assert body["sample"] is False
    assert body["answer_min"] == 20

    # Counts exist
    by_v = {c["village"]: c for c in body["by_village"]}
    assert by_v["Haijalpur"]["open"] == 2

    # CRITICAL PRIVACY RULE: No requests list and zero pins for public
    assert "requests" not in body


def test_authorized_get_help_with_relief_token_returns_pins(aws, sfn, fake_loc, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "relief_secret" if name == help_api.RELIEF else "")

    h = help_run.create(25.9568, 85.0501, 5, elderly=1, children=2, needs=["boat", "medical"])

    headers = {"authorization": "Bearer relief_secret"}
    res = help_api.handler(ev("GET /help", headers=headers))
    assert res["statusCode"] == 200
    body = json.loads(res["body"])

    assert "requests" in body
    reqs = body["requests"]
    assert len(reqs) >= 1
    req = next(r for r in reqs if r["id"] == h["id"])
    assert req["lat"] == 25.9568
    assert req["lon"] == 85.0501
    assert req["people"] == 5
    assert req["needs"] == ["boat", "medical"]


def test_family_tracking_with_mine_and_key_returns_own_pin(aws, sfn, fake_loc):
    h = help_run.create(25.9568, 85.0501, 4, elderly=1, children=1, needs=["boat"])

    # Wrong key
    res_bad = help_api.handler(ev("GET /help", query={"mine": h["id"], "key": "wrong_key"}))
    body_bad = json.loads(res_bad["body"])
    assert "requests" not in body_bad

    # Valid key returns that family's request only
    res_good = help_api.handler(ev("GET /help", query={"mine": h["id"], "key": h["key"]}))
    assert res_good["statusCode"] == 200
    body_good = json.loads(res_good["body"])
    assert "requests" in body_good
    assert len(body_good["requests"]) == 1
    assert body_good["requests"][0]["id"] == h["id"]
    assert body_good["requests"][0]["lat"] == 25.9568


def test_phone_numbers_are_stored_only_as_sha256_hashes(aws, sfn, fake_loc):
    phone = "+91 98765 43210"
    h = help_run.create(25.9568, 85.0501, 3, phone=phone)

    # In HELP# row: no raw phone number, only phone_hash
    stored_help = db.get_incident(h["id"])
    raw_help_json = json.dumps(stored_help)
    assert "9876543210" not in raw_help_json
    assert "phone_hash" in stored_help

    # In REPLY# row: phone is digits for reply purposes, but never exposed in GET /help
    reply_item = db.table().get_item(Key={"PK": f"REPLY#{h['id']}", "SK": "META"}).get("Item")
    assert reply_item is not None

    res = help_api.handler(ev("GET /help"))
    assert "9876543210" not in res["body"]


def test_post_help_validations_and_limits(aws, sfn, fake_loc):
    # Outside bounding box
    res_out = help_api.handler(ev("POST /help", {"lat": 10.0, "lon": 70.0, "people": 2}))
    assert res_out["statusCode"] == 400

    # Invalid people count
    res_people = help_api.handler(ev("POST /help", {"lat": 25.9568, "lon": 85.0501, "people": 0}))
    assert res_people["statusCode"] == 400

    # Missing lat/lon
    res_missing = help_api.handler(ev("POST /help", {"people": 3}))
    assert res_missing["statusCode"] == 400

    # Successful creation
    res_ok = help_api.handler(ev("POST /help", {"lat": 25.9568, "lon": 85.0501, "people": 4, "elderly": 1, "needs": ["boat"]}))
    assert res_ok["statusCode"] == 201
    created = json.loads(res_ok["body"])
    assert created["id"].startswith("HELP-")
    assert created["key"]
    assert len(sfn.started) == 1
    assert sfn.started[0]["input"]["help"]["id"] == created["id"]


def test_get_teams_and_post_position(aws, fake_loc, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "relief_token" if name == teams_pos.RELIEF else "")

    # Initial GET /teams: returns 3 teams with base positions
    res = teams_pos.handler(ev("GET /teams"))
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["tracker"] == "bp-teams"
    assert len(body["teams"]) == 3
    boat = next(t for t in body["teams"] if t["id"] == "T-BOAT-1")
    assert boat["kind"] == "boat"
    assert boat["status"] == "free"
    assert boat["lat"] == 25.9529 and boat["lon"] == 85.0599

    # POST position without token -> 401
    res_unauth = teams_pos.handler(ev("POST /teams/{id}/position", {"lat": 25.9550, "lon": 85.0550}, path={"id": "T-BOAT-1"}))
    assert res_unauth["statusCode"] == 401

    # POST position with token for unknown team -> 404
    headers = {"authorization": "Bearer relief_token"}
    res_unknown = teams_pos.handler(ev("POST /teams/{id}/position", {"lat": 25.9550, "lon": 85.0550}, headers=headers, path={"id": "T-UNKNOWN"}))
    assert res_unknown["statusCode"] == 404

    # POST position with token -> 200
    res_pos = teams_pos.handler(ev("POST /teams/{id}/position", {"lat": 25.9555, "lon": 85.0555, "accuracy_m": 5.0}, headers=headers, path={"id": "T-BOAT-1"}))
    assert res_pos["statusCode"] == 200
    pos_data = json.loads(res_pos["body"])
    assert pos_data["ok"] is True
    assert pos_data["team"] == "T-BOAT-1"
    assert pos_data["position"]["lat"] == 25.9555

    # Check updated position in GET /teams
    res_updated = teams_pos.handler(ev("GET /teams"))
    body_updated = json.loads(res_updated["body"])
    boat_updated = next(t for t in body_updated["teams"] if t["id"] == "T-BOAT-1")
    assert boat_updated["lat"] == 25.9555 and boat_updated["lon"] == 85.0555


def test_claim_and_rescued_routes(aws, sfn, fake_loc, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "relief_token" if name == help_api.RELIEF else "")
    headers = {"authorization": "Bearer relief_token"}

    # Create help request
    h = help_run.create(25.9568, 85.0501, 3, needs=["boat"])
    help_run.open_step({"help": {"id": h["id"]}})
    wait_res = help_run.ask_step({"help": {"id": h["id"]}, "timeout": 60, "taskToken": "token-1"})

    # Claim via POST /help/{id}/claim
    res_claim = help_api.handler(ev("POST /help/{id}/claim", {"team": "T-BOAT-1"}, headers=headers, path={"id": h["id"]}))
    assert res_claim["statusCode"] == 200
    assert sfn.outcomes["token-1"][0] == "success"

    # Simulate onsite step
    wait_onsite = help_run.onsite_step({"help": {"id": h["id"]}, "timeout": 120, "taskToken": "token-2", "claim": {"role": "T-BOAT-1"}})

    # Rescue via POST /help/{id}/rescued
    res_rescued = help_api.handler(ev("POST /help/{id}/rescued", {"team": "T-BOAT-1"}, headers=headers, path={"id": h["id"]}))
    assert res_rescued["statusCode"] == 200
    assert sfn.outcomes["token-2"][0] == "success"


# ---------------- Full Help Run on Demo Clocks ----------------


def test_full_help_run_late_team_climbs_and_rescues(aws, sfn, fake_loc):
    """SPEC test: A help request on demo clocks with a late team climbs to the next team and still closes as rescued."""
    h = help_run.create(25.9568, 85.0501, 4, elderly=1, children=1, needs=["boat"])

    # Plan:
    # 1. AskNearestTeam (1st time): timeout (late team)
    # 2. AlertDistrictControlRoom: notified
    # 3. CountAsks -> AskAgain -> AskNearestTeam (2nd team): answers with "claim"
    # 4. AwaitTeamOnSite: answers with "arrived"
    # 5. AwaitFamilySafe: answers with "rescued"
    # 6. CloseHelpRequest -> Done

    def responder(state, payload, res, run):
        if state == "AskNearestTeam":
            if run.waits and len(run.waits) == 1:
                # First team does not answer in time (timeout)
                return
            # Second team claims
            out = answer.answer(res["wait"], "claim", role=payload.get("roles", ["T-BOAT-1"])[0], only_channel="screen")
            assert out["ok"], out
        elif state == "AwaitTeamOnSite":
            # Team arrives on site
            out = answer.answer(res["wait"], "arrived", only_channel="screen")
            assert out["ok"], out
        elif state == "AwaitFamilySafe":
            # Family safe
            out = answer.answer(res["wait"], "rescued", only_channel="screen")
            assert out["ok"], out

    functions = {
        "HelpFunctionArn": help_run.handler,
    }

    run = Run(functions, responder, sfn, name=h["id"], asl=HELP_ASL)
    final = run.start(sfn.started[0]["input"])

    # Verify states traversed
    assert "OpenHelpRequest" in run.entered
    assert "AlertDistrictControlRoom" in run.entered  # late team climbed to district
    assert "AwaitTeamOnSite" in run.entered
    assert "CloseHelpRequest" in run.entered
    assert "Done" in run.entered

    # Final result in DB
    updated_h = db.get_incident(h["id"])
    assert updated_h["status"] == "rescued"
    assert updated_h["rescued"] is not None
    assert updated_h["climbs"] >= 1

    # Teams freed
    teams = core.team_rows()
    for t in teams.values():
        assert t["status"] == "free"

    # Geofence was removed
    assert h["id"] not in fake_loc.geofences
