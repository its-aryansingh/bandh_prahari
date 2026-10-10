"""The HTTP routes: the judge path's limits, the control-room token, and the public reads."""

from __future__ import annotations

import json

import pytest

from api import control, demo, public
from asl_runner import FakeStepFunctions
from common import db, http
from incident import answer, start


def ev(route, body=None, headers=None, path=None):
    return {"routeKey": route, "body": json.dumps(body or {}), "headers": headers or {}, "pathParameters": path or {}}


@pytest.fixture
def sfn(aws, monkeypatch):
    fake = FakeStepFunctions()
    monkeypatch.setattr(start, "_sfn", fake)
    monkeypatch.setattr(answer, "_sfn", fake)
    return fake


def test_judge_starts_a_screen_run_on_demo_clocks(sfn):
    r = demo.handler(ev("POST /demo/runs", {"sign": "boil_soil"}))
    assert r["statusCode"] == 201
    body = json.loads(r["body"])
    run = sfn.started[-1]["input"]
    assert run["incident"]["channel"] == "screen" and run["incident"]["demo"] is True
    assert run["clocks"]["page"] == 60 and body["priority"] == "P1"
    assert demo.current_run() == body["incident"]


def test_one_demo_at_a_time_and_the_second_judge_watches_the_first(sfn):
    first = json.loads(demo.handler(ev("POST /demo/runs", {}))["body"])["incident"]
    r = demo.handler(ev("POST /demo/runs", {}))
    assert r["statusCode"] == 409 and json.loads(r["body"])["incident"] == first
    assert len(sfn.started) == 1


def test_closing_the_run_frees_the_slot(sfn):
    from incident import close

    first = json.loads(demo.handler(ev("POST /demo/runs", {}))["body"])["incident"]
    close.release_demo_lock(first)
    assert demo.handler(ev("POST /demo/runs", {}))["statusCode"] == 201


def test_daily_cap(sfn, monkeypatch):
    monkeypatch.setattr(demo.config, "DEMO_DAILY_CAP", 1)
    first = json.loads(demo.handler(ev("POST /demo/runs", {}))["body"])["incident"]
    demo.release(first)
    r = demo.handler(ev("POST /demo/runs", {}))
    assert r["statusCode"] == 429
    assert demo.current_run() == ""  # the refused request left no lock behind


def test_unknown_sign_is_refused(sfn):
    assert demo.handler(ev("POST /demo/runs", {"sign": "tsunami"}))["statusCode"] == 400


def test_the_demo_answer_button_never_touches_a_real_run(sfn):
    db.put_wait("abcd2345", {"token": "t-real", "incident": "INC-x", "kind": "page", "channel": "whatsapp", "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    r = demo.handler(ev("POST /demo/answer", {"wait": "abcd2345", "action": "onway"}))
    assert r["statusCode"] == 400 and json.loads(r["body"])["reason"] == "not_allowed"
    assert sfn.outcomes == {} and db.get_wait("abcd2345")


def test_bad_wait_ids_are_refused(sfn):
    assert demo.handler(ev("POST /demo/answer", {"wait": "../../x", "action": "onway"}))["statusCode"] == 400


def test_control_room_form_needs_the_token(sfn, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "s3cret" if name == control.TOKEN else "")
    body = {"km": 12, "sign": "slip", "village": "Haijalpur", "caller": "helpline 1070, 9876543210", "note": "call back on +91 98765 43210"}
    assert control.handler(ev("POST /incidents", body))["statusCode"] == 401
    assert control.handler(ev("POST /incidents", body, {"authorization": "Bearer wrong"}))["statusCode"] == 401
    r = control.handler(ev("POST /incidents", body, {"authorization": "Bearer s3cret"}))
    assert r["statusCode"] == 201
    card = json.loads(r["body"])
    assert card["channel"] == "helpline" and card["priority"] == "P2"
    stored = db.get_incident(card["id"])
    assert "9876543210" not in json.dumps(stored) and "98765 43210" not in json.dumps(stored)


def test_unset_token_lets_nobody_in(sfn, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "")
    assert control.handler(ev("POST /incidents", {"km": 1, "sign": "slip"}, {"authorization": "Bearer "}))["statusCode"] == 401


def test_public_timeline_and_open_incidents(sfn):
    inc = start.start(14, "crack", channel="screen", source="screen", demo=True)
    t = json.loads(public.handler(ev("GET /incidents/{id}/timeline", path={"id": inc["id"]}))["body"])
    assert t["incident"]["demo"] is True and t["events"][0]["kind"] == "report"
    lst = json.loads(public.handler(ev("GET /incidents"))["body"])
    assert [i["id"] for i in lst["incidents"]] == [inc["id"]]
    assert public.handler(ev("GET /incidents/{id}/timeline", path={"id": "nope"}))["statusCode"] == 404


def test_execution_states_never_carry_the_task_token():
    # Event shapes from botocore's GetExecutionHistory model. Not a captured response:
    # tests/fixtures/sfn_history.json replaces this once a real run exists (docs/DEPLOY.md).
    events = [
        {"type": "TaskStateEntered", "timestamp": "t1", "stateEnteredEventDetails": {"name": "PageJuniorEngineer", "input": '{"x":1}'}},
        {"type": "TaskScheduled", "timestamp": "t1", "taskScheduledEventDetails": {"parameters": '{"Payload":{"taskToken":"SECRET"}}'}},
        {"type": "TaskTimedOut", "timestamp": "t2", "taskTimedOutEventDetails": {"error": "States.Timeout"}},
        {"type": "TaskStateExited", "timestamp": "t2", "stateExitedEventDetails": {"name": "PageJuniorEngineer"}},
        {"type": "TaskStateEntered", "timestamp": "t2", "stateEnteredEventDetails": {"name": "PageAssistantEngineer"}},
        {"type": "TaskSucceeded", "timestamp": "t3", "taskSucceededEventDetails": {"output": '{"action":"onway"}'}},
        {"type": "TaskStateExited", "timestamp": "t3", "stateExitedEventDetails": {"name": "PageAssistantEngineer"}},
        {"type": "ChoiceStateEntered", "timestamp": "t3", "stateEnteredEventDetails": {"name": "IsItP1"}},
    ]
    states = public.history_to_states(events)
    assert "SECRET" not in json.dumps(states)
    assert [(s["name"], s["status"]) for s in states] == [("PageJuniorEngineer", "timed_out"), ("PageAssistantEngineer", "succeeded")]
    assert states[1]["detail"] == "SendTaskSuccess: onway"


def test_real_history_fixture_if_captured():
    from pathlib import Path

    f = Path(__file__).parent / "fixtures" / "sfn_history.json"
    if not f.exists():
        pytest.skip("capture a real GetExecutionHistory response first (docs/DEPLOY.md)")
    states = public.history_to_states(json.loads(f.read_text(encoding="utf-8"))["events"])
    assert states and states[0]["name"] == "OpenIncident"
    assert states[0]["status"] == "succeeded"
    assert "taskToken" not in json.dumps(states)
    names = [s["name"] for s in states]
    assert names == ["OpenIncident", "WarnVillagesGetReady", "PageJuniorEngineer", "PageAssistantEngineer", "DispatchRepairTeam"]
    je = next(s for s in states if s["name"] == "PageJuniorEngineer")
    assert je["status"] == "timed_out"
    ae = next(s for s in states if s["name"] == "PageAssistantEngineer")
    assert ae["status"] == "succeeded"
    assert ae["detail"] == "SendTaskSuccess: onway"
    assert all(s["entered"] and s["exited"] for s in states)


def test_the_judge_route_cannot_answer_a_real_run_even_on_the_screen_channel(sfn):
    # a control-room incident while the stack's Channel is still "screen"
    db.put_wait("abcd2346", {"token": "t-real", "incident": "INC-1010-0600-12-xyz", "kind": "page", "channel": "screen", "demo": False, "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    r = demo.handler(ev("POST /demo/answer", {"wait": "abcd2346", "action": "onway"}))
    assert r["statusCode"] == 400 and json.loads(r["body"])["reason"] == "not_allowed"
    assert sfn.outcomes == {}


def test_real_timelines_hide_wait_ids_button_ids_and_names(sfn):
    inc = start.start(14, "crack", channel="screen", source="helpline")
    db.event(inc["id"], "page", "x", "x", wait="abcd2347", to="junior_engineer")
    db.event(inc["id"], "message", "x", "x", name="Real Name", buttons=[{"id": "a:abcd2347:onway", "hi": "h", "en": "e"}])
    t = json.loads(public.handler(ev("GET /incidents/{id}/timeline", path={"id": inc["id"]}))["body"])
    text = json.dumps(t, ensure_ascii=False)
    assert "abcd2347" not in text and "Real Name" not in text


@pytest.mark.parametrize("number", ["9876543210", "+91 98765 43210", "98765.43210", "98765/43210", "(987) 654-3210", "098-7654-3210"])
def test_phone_numbers_in_any_format_are_scrubbed(number):
    assert not any(ch.isdigit() for ch in control.scrub(f"caller {number} called"))


def test_the_form_accepts_only_known_villages(sfn, monkeypatch):
    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "s3cret")
    r = control.handler(ev("POST /incidents", {"km": 12, "sign": "slip", "village": "call 9876543210"}, {"authorization": "Bearer s3cret"}))
    assert r["statusCode"] == 400


def test_execution_view_hides_the_account_id(sfn, monkeypatch):
    inc = start.start(14, "crack", channel="screen", source="screen", demo=True)

    class X:
        def get_execution_history(self, **k):
            return {"events": []}

        def describe_execution(self, **k):
            return {"status": "RUNNING"}

    monkeypatch.setattr(public, "_sfn", X())
    x = json.loads(public.handler(ev("GET /incidents/{id}/execution", path={"id": inc["id"]}))["body"])
    assert "123456789012" not in x["executionArn"]


def test_replay_seeded_run_timeline_and_execution(aws):
    from pathlib import Path
    import sys
    scripts_dir = str(Path(__file__).resolve().parent.parent / "scripts")
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)
    import seed

    for item in seed.replay_items():
        db.table().put_item(Item=db.clean(item))

    res_tl = public.handler(ev("GET /incidents/{id}/timeline", path={"id": "INC-0930-14"}))
    assert res_tl["statusCode"] == 200
    tl = json.loads(res_tl["body"])
    assert tl["incident"]["id"] == "INC-0930-14"
    assert tl["incident"]["reenactment"] is True
    assert len(tl["events"]) > 20

    res_ex = public.handler(ev("GET /incidents/{id}/execution", path={"id": "INC-0930-14"}))
    assert res_ex["statusCode"] == 200
    ex = json.loads(res_ex["body"])
    assert ex["sample"] is True
    assert any(s["name"] == "OpenIncident" for s in ex["states"])
    assert any(s["name"] == "PageJuniorEngineer" and s["status"] == "timed_out" for s in ex["states"])

