"""Tests for small rules from SPEC (C10):

1. "Nikal chalo" after two P1 reports from different phones within 300 m and 30 min.
2. Mukhiya cancels a false alarm with one tap; village gets "Khatra tala", CAP Update with AllClear.
3. Roster CSV ingestion with SSM parameters only.
"""

from __future__ import annotations

import pytest
from asl_runner import FakeStepFunctions
from common import clock, db, ids
from common import roster_ingest
from incident import answer, start, warn
from intake import worker


@pytest.fixture
def sfn(aws, monkeypatch):
    fake = FakeStepFunctions()
    monkeypatch.setattr(start, "_sfn", fake)
    monkeypatch.setattr(answer, "_sfn", fake)
    return fake


def test_dual_p1_evacuation_from_different_phones(sfn):
    # First P1 report from phone 1
    inc1 = start.start(14, "boil_soil", channel="screen", source="screen", reporter="+919876543210", demo=True)
    assert inc1["priority"] == "P1"
    ev1 = db.timeline(inc1["id"])
    assert not any(e["kind"] == "dual_p1_evacuate" for e in ev1)

    # Second P1 report from phone 2 within 300m (same km 14)
    inc2 = start.start(14, "overtopping", channel="screen", source="screen", reporter="+919876543211", demo=True)
    assert inc2["priority"] == "P1"
    ev2 = db.timeline(inc2["id"])
    assert any(e["kind"] == "dual_p1_evacuate" for e in ev2)
    assert any(e["kind"] == "warning" and e.get("level") == "nikal_chalo" for e in ev2)


def test_dual_p1_ignored_if_same_reporter(sfn):
    phone = "+919876543299"
    inc1 = start.start(12, "boil_soil", channel="screen", source="screen", reporter=phone, demo=True)
    inc2 = start.start(12, "boil_soil", channel="screen", source="screen", reporter=phone, demo=True)
    ev2 = db.timeline(inc2["id"])
    assert not any(e["kind"] == "dual_p1_evacuate" for e in ev2)


def test_mukhiya_cancels_false_alarm(sfn):
    inc = start.start(15, "boil_soil", channel="screen", source="screen", reporter="+919876543201", demo=True)
    # Trigger Taiyaar warning
    warn.handler({"incident": inc, "level": "taiyaar"})

    # Mukhiya taps r:<inc_id>:cfa
    mukhiya_phone = "+919876543200"
    to = {"role": "mukhiya", "phone": mukhiya_phone}
    worker.tap("screen", to, f"r:{inc['id']}:cfa", ["mukhiya"])

    # Verify timeline and status
    events = db.timeline(inc["id"])
    assert any(e["kind"] == "false_alarm_cancelled" and e.get("actor") == "mukhiya" for e in events)
    assert any(e["kind"] == "warning" and e.get("level") == "khatra_tala" for e in events)

    updated_inc = db.get_incident(inc["id"])
    assert updated_inc["status"] == "cancelled"


def test_roster_csv_ingestion(aws):
    csv_text = """stretch, km_from, km_to, je_name, je_ssm, ae_name, ae_ssm, ee_name, ee_ssm, force_name, force_ssm, district_name, district_ssm
Haijalpur, 1, 5, Test JE, /bp/roster/test_je, Test AE, /bp/roster/test_ae, Test EE, /bp/roster/test_ee, Test Force, /bp/roster/test_force, Test Dist, /bp/roster/test_dist
"""
    count = roster_ingest.ingest_csv(csv_text)
    assert count == 5 * 5  # 5 km * 5 roles = 25 items

    # Check DynamoDB SEG#3 ROSTER#1
    tbl = db.table()
    res = tbl.get_item(Key={"PK": "SEG#3", "SK": "ROSTER#1"})
    assert "Item" in res
    assert res["Item"]["name"] == "Test JE"
    assert res["Item"]["ssm"] == "/bp/roster/test_je"


def test_roster_csv_rejects_raw_phone_numbers():
    bad_csv = """stretch, km_from, km_to, je_name, je_ssm, ae_name, ae_ssm, ee_name, ee_ssm, force_name, force_ssm, district_name, district_ssm
Haijalpur, 1, 5, Test JE, +919876543210, Test AE, /bp/roster/test_ae, Test EE, /bp/roster/test_ee, Test Force, /bp/roster/test_force, Test Dist, /bp/roster/test_dist
"""
    with pytest.raises(ValueError, match="SSM parameter path"):
        roster_ingest.ingest_csv(bad_csv)
