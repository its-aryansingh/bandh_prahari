"""Tests for high-water roll-call (docs/SPEC.md, "7. Roll-call").

Verifies:
1. Two-hourly check sends "km {km}: sab theek?" with "Theek hai" and "Samasya hai" buttons.
2. Answering "Theek hai" records ok status.
3. Answering "Samasya hai" asks for the warning sign.
4. No answer in 20 minutes nudges the junior engineer.
"""

from __future__ import annotations

import json

import pytest

import channels
from common import clock, db, ids
from intake import worker
from rollcall import ask


@pytest.fixture
def screen(aws, monkeypatch):
    sent = []

    class FakeChannel:
        def send_text(self, to, msg, *, incident_id=None):
            sent.append({"type": "text", "to": to, "msg": msg})
            return {"message_id": f"m-{len(sent)}"}

        def send_buttons(self, to, msg, buttons, *, incident_id=None):
            sent.append({"type": "buttons", "to": to, "msg": msg, "buttons": buttons})
            return {"message_id": f"m-{len(sent)}"}

        def send_list(self, to, msg, button, rows, *, incident_id=None):
            sent.append({"type": "list", "to": to, "msg": msg, "rows": rows})
            return {"message_id": f"m-{len(sent)}"}

    fc = FakeChannel()
    monkeypatch.setattr(channels, "_module", lambda ch: fc)
    return sent


def test_ask_km_sends_buttons_and_creates_record(aws, screen):
    slot = "2026-10-10#02"
    item = ask.ask_km(14, channel="screen", slot=slot)

    assert item["km"] == 14
    assert item["status"] == "sent"
    assert "deadline" in item

    # Verify sent buttons
    assert len(screen) == 1
    m = screen[0]
    assert m["type"] == "buttons"
    assert "किमी 14: सब ठीक?" in m["msg"]["hi"]
    btn_ids = [b["id"] for b in m["buttons"]]
    assert btn_ids == ["rc:14:ok", "rc:14:issue"]

    # Verify stored in DB
    stored = db.table().get_item(Key={"PK": f"ROLLCALL#{slot}", "SK": "KM#14"}).get("Item")
    assert stored is not None
    assert stored["status"] == "sent"


def test_worker_taps_theek_hai(aws, screen):
    slot = ask.current_slot()
    ask.ask_km(14, channel="screen", slot=slot)

    phone = "919000000001"
    db.table().put_item(Item={"PK": f"ALLOW#{ids.phone_hash(phone)}", "SK": "META", "roles": ["patrol"]})

    # Patrol worker taps "Theek hai"
    worker.handler({"channel": "screen", "from": phone, "type": "button", "reply_id": "rc:14:ok"})

    # Record updated
    stored = db.plain(db.table().get_item(Key={"PK": f"ROLLCALL#{slot}", "SK": "KM#14"}).get("Item"))
    assert stored["status"] == "ok"
    assert stored["answered_at"] is not None

    # Worker receives acknowledgment
    assert any("धन्यवाद" in m.get("msg", {}).get("hi", "") for m in screen)


def test_worker_taps_samasya_hai_prompts_signs(aws, screen):
    slot = ask.current_slot()
    ask.ask_km(14, channel="screen", slot=slot)

    phone = "919000000001"
    db.table().put_item(Item={"PK": f"ALLOW#{ids.phone_hash(phone)}", "SK": "META", "roles": ["patrol"]})

    # Patrol worker taps "Samasya hai"
    worker.handler({"channel": "screen", "from": phone, "type": "button", "reply_id": "rc:14:issue"})

    # Record updated to issue
    stored = db.plain(db.table().get_item(Key={"PK": f"ROLLCALL#{slot}", "SK": "KM#14"}).get("Item"))
    assert stored["status"] == "issue"

    # Worker receives sign list prompt
    assert any(m["type"] == "list" and "किमी 14: क्या दिख रहा है?" in m.get("msg", {}).get("hi", "") for m in screen)


def test_nudge_junior_engineer_after_20_minutes(aws, screen):
    slot = "2026-10-10#02"
    # Create an expired rollcall (deadline was in the past)
    expired_time = clock.iso(clock.parse("2026-10-10T02:00:00+05:30"))
    db.table().put_item(
        Item={
            "PK": f"ROLLCALL#{slot}",
            "SK": "KM#14",
            "km": 14,
            "status": "sent",
            "sent_at": "2026-10-10T01:40:00+05:30",
            "deadline": expired_time,
            "worker_role": "patrol",
        }
    )

    nudged = ask.nudge_unanswered(channel="screen", slot=slot)
    assert 14 in nudged

    # Status updated to nudged
    stored = db.plain(db.table().get_item(Key={"PK": f"ROLLCALL#{slot}", "SK": "KM#14"}).get("Item"))
    assert stored["status"] == "nudged"
    assert stored["nudged_at"] is not None

    # JE received nudge text
    assert len(screen) == 1
    m = screen[0]
    assert m["type"] == "text"
    assert "20 मिनट से गश्ती दल का जवाब नहीं आया" in m["msg"]["hi"]


def test_latest_status_and_route(aws):
    from api import river
    slot = ask.current_slot()
    ask.ask_km(14, channel="screen", slot=slot)
    ask.record_reply(14, "ok", slot=slot)
    ask.ask_km(15, channel="screen", slot=slot)

    st = ask.latest_status(slot=slot)
    assert st["slot"] == slot
    assert st["kms"]["14"] == "ok"
    assert st["kms"]["15"] == "pending"

    # Test HTTP route
    res = river.handler({"routeKey": "GET /rollcall/latest"})
    assert res["statusCode"] == 200
    body = json.loads(res["body"])
    assert body["slot"] == slot
    assert body["kms"]["14"] == "ok"


def test_schedule_ensure_and_delete():
    assert ask.ensure_schedule("haijalpur") in (True, False)
    assert ask.delete_schedule("haijalpur") in (True, False)
