"""The whole answer clock, on demo clocks and fake AWS: report, page, timeout, climb, answer,
warning, on site, hold, close (docs/SPEC.md, Tests, "Whole run")."""

from __future__ import annotations

import json

import boto3
import pytest

import channels
from asl_runner import FakeStepFunctions, Run
from common import db
from incident import answer, close, dispatch, handoff, notify, page, start, warn
from incident import open as open_step

FUNCTIONS = {
    "OpenFunctionArn": open_step.handler,
    "WarnFunctionArn": warn.handler,
    "PageFunctionArn": page.handler,
    "DispatchFunctionArn": dispatch.handler,
    "NotifyFunctionArn": notify.handler,
    "HandoffFunctionArn": handoff.handler,
    "CloseFunctionArn": close.handler,
}


@pytest.fixture
def sfn(aws, monkeypatch):
    fake = FakeStepFunctions()
    monkeypatch.setattr(answer, "_sfn", fake)
    monkeypatch.setattr(start, "_sfn", fake)
    real_module = channels._module

    def screen_only(channel):
        assert channel == "screen", f"a demo run tried the {channel} channel"
        return real_module(channel)

    monkeypatch.setattr(channels, "_module", screen_only)
    return fake


def script(plan: dict):
    """plan: state name -> list of actions, one per visit (None = let the clock run out)."""
    visits: dict[str, int] = {}

    def responder(state, payload, res, run):
        i = visits.get(state, 0)
        visits[state] = i + 1
        actions = plan.get(state, [])
        action = actions[i] if i < len(actions) else None
        if action:
            out = answer.answer(res["wait"], action, only_channel="screen", by="test")
            assert out["ok"], out

    return responder


def run_demo(sfn, sign: str, plan: dict):
    inc = start.start(14, sign, channel="screen", source="screen", demo=True)
    run = Run(FUNCTIONS, script(plan), sfn, name=inc["id"])
    final = run.start(sfn.started[-1]["input"])
    return inc, run, final, db.timeline(inc["id"])


def kinds(events):
    return [e["kind"] for e in events]


def test_p1_climbs_then_is_answered_held_and_secured(sfn):
    inc, run, final, events = run_demo(
        sfn,
        "boil_soil",
        {
            "PageAssistantEngineer": ["onway"],
            "AwaitEngineerOnSite": [None, "onsite"],
            "HoldTheStretch": ["holding", None, "secured"],
        },
    )
    assert inc["priority"] == "P1" and inc["demo"] is True
    assert run.entered[:4] == ["OpenIncident", "IsItP1", "WarnVillagesGetReady", "PageJuniorEngineer"]
    k = kinds(events)
    # the story, in order
    for x in ["report", "open", "priority", "warning", "page", "climb", "answer", "dispatch", "await_onsite", "not_on_site", "hold", "missed_checkin", "close", "report_written"]:
        assert x in k, x
    assert k.index("report") < k.index("open") < k.index("warning") < k.index("climb") < k.index("answer") < k.index("dispatch") < k.index("close")
    # "get ready" went out before anybody answered
    assert k.index("warning") < k.index("answer")
    climb = next(e for e in events if e["kind"] == "climb")
    assert climb["reason"] == "States.Timeout" and climb["level"] == 2
    ans = [e for e in events if e["kind"] == "answer"]
    assert [a["action"] for a in ans] == ["onway", "onsite", "holding", "secured"]
    assert ans[0]["actor"] == "assistant_engineer"
    levels = [e.get("level") for e in events if e["kind"] == "warning"]
    assert levels == ["taiyaar", "khatra_tala"]
    assert db.get_incident(inc["id"])["status"] == "closed_secured"
    assert final["end"]["outcome"] == "secured"
    # demo clocks, read from the input by TimeoutSecondsPath
    assert {w["timeout"] for w in run.waits} <= {60, 90}
    # the timeline was copied to the locked bucket
    body = boto3.client("s3").get_object(Bucket="bp-test-bucket", Key=f"timelines/{inc['id']}.json")["Body"].read()
    assert json.loads(body)["incident"]["id"] == inc["id"]


def test_messages_on_the_judge_path_go_only_to_drawn_phones(sfn):
    inc, run, final, events = run_demo(sfn, "boil_soil", {"PageJuniorEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"], "HoldTheStretch": ["secured"]})
    msgs = [e for e in events if e["kind"] == "message"]
    assert msgs and all(m["channel"] == "screen" for m in msgs)
    assert not any("phone" in m or "ssm" in m for m in msgs)
    # page buttons carry the short wait ID, never the task token
    page_btns = [b for m in msgs for b in m.get("buttons", [])]
    assert page_btns and all(b["id"].startswith(("a:", "r:")) and "token" not in b["id"] for b in page_btns)
    assert all(len(b["hi"]) <= 20 and len(b["en"]) <= 20 for b in page_btns)


def test_not_my_stretch_climbs_at_once(sfn):
    inc, run, final, events = run_demo(sfn, "boil_soil", {"PageJuniorEngineer": ["notmine"], "PageAssistantEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"], "HoldTheStretch": ["secured"]})
    climb = next(e for e in events if e["kind"] == "climb")
    assert climb["reason"] == "Declined"


def test_nobody_answers_climbs_to_the_central_room_then_the_district(sfn):
    inc, run, final, events = run_demo(sfn, "boil_soil", {})
    pages = [w["state"] for w in run.waits]
    assert pages == [
        "PageJuniorEngineer",
        "PageAssistantEngineer",
        "PageExecutiveEngineer",
        "PageForceAndDistrict",
        "AlertCentralFloodControlRoom",
        "AlertCentralFloodControlRoom",
    ]
    assert "HandToDistrict" in run.entered
    assert db.get_incident(inc["id"])["status"] == "closed_unanswered"
    # level 4 pages both the flood-fighting force and the district control room
    lvl4 = next(e for e in events if e["kind"] == "page" and e["level"] == 4)
    assert lvl4["roles"] == ["flood_fighting_force", "district_control_room"]


def test_breach_warns_move_now_and_hands_to_district(sfn):
    inc, run, final, events = run_demo(sfn, "boil_soil", {"PageJuniorEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"], "HoldTheStretch": ["breached"]})
    assert [e["level"] for e in events if e["kind"] == "warning"] == ["taiyaar", "nikal_chalo"]
    assert "handoff" in kinds(events)
    assert db.get_incident(inc["id"])["status"] == "closed_breached"


def test_p2_warns_only_when_the_page_reaches_the_executive_engineer(sfn):
    inc, run, final, events = run_demo(sfn, "crack", {"PageExecutiveEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"], "HoldTheStretch": ["secured"]})
    assert inc["priority"] == "P2"
    assert "WarnVillagesGetReady" not in run.entered
    assert run.entered.index("WarnVillagesOnClimb") < run.entered.index("PageExecutiveEngineer")


def test_missed_check_ins_in_a_row_go_to_the_district(sfn):
    inc, run, final, events = run_demo(sfn, "boil_soil", {"PageJuniorEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"]})
    assert kinds(events).count("missed_checkin") == 2
    assert final["end"] == {"reason": "no_checkin", "outcome": "district"}


def test_a_late_tap_is_refused(sfn):
    seen = {}

    def responder(state, payload, res, run):
        if state == "PageJuniorEngineer":
            seen["wait"] = res["wait"]
        if state == "PageAssistantEngineer":
            # the junior engineer taps after the clock ran out: the token is dead
            out = answer.answer(seen["wait"], "onway", only_channel="screen")
            assert out == {"ok": False, "reason": "late"}
            assert answer.answer(res["wait"], "onway", only_channel="screen")["ok"]
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite", only_channel="screen")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured", only_channel="screen")

    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    Run(FUNCTIONS, responder, sfn, name=inc["id"]).start(sfn.started[-1]["input"])


def test_a_button_works_once(sfn):
    def responder(state, payload, res, run):
        if state == "PageJuniorEngineer":
            assert answer.answer(res["wait"], "onway", only_channel="screen")["ok"]
            assert answer.answer(res["wait"], "onway", only_channel="screen") == {"ok": False, "reason": "gone"}
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite", only_channel="screen")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured", only_channel="screen")

    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    Run(FUNCTIONS, responder, sfn, name=inc["id"]).start(sfn.started[-1]["input"])


def test_a_wrong_action_for_the_wait_is_refused(sfn):
    def responder(state, payload, res, run):
        if state == "PageJuniorEngineer":
            assert answer.answer(res["wait"], "secured", only_channel="screen") == {"ok": False, "reason": "bad_action"}
            assert answer.answer(res["wait"], "onway", only_channel="screen")["ok"]
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite", only_channel="screen")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured", only_channel="screen")

    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    Run(FUNCTIONS, responder, sfn, name=inc["id"]).start(sfn.started[-1]["input"])


def test_real_clocks_follow_the_priority(aws):
    p1 = start.run_input({"priority": "P1"}, demo=False)
    p2 = start.run_input({"priority": "P2"}, demo=False)
    assert p1["clocks"]["page"] == 600 and p2["clocks"]["page"] == 1800
    assert p1["clocks"]["onsite"] == 2700 and p1["clocks"]["hold"] == 1800
    demo = start.run_input({"priority": "P1"}, demo=True)
    assert all(60 <= v <= 90 for v in demo["clocks"].values())
    assert demo["previous"] is None and set(demo["counts"]) == {"central", "onsite", "missed", "rounds"}


def test_the_rules_read_the_official_gauge(aws):
    db.table().put_item(Item={"PK": "SEG#14", "SK": "META", "gauge": "rewaghat"})
    db.table().put_item(Item={"PK": "GAUGE#rewaghat", "SK": "2026-10-10T06:00:00+05:30", "wl": db.clean(55.0), "dl": db.clean(54.41)})
    db.table().put_item(Item={"PK": "GAUGE#rewaghat", "SK": "2026-10-10T03:00:00+05:30", "wl": db.clean(54.9), "dl": db.clean(54.41)})
    river = start.river_now(db.get_segment(14))
    assert river.above_danger and river.rising


def test_one_role_declining_at_level_four_leaves_the_other_role(sfn):
    def responder(state, payload, res, run):
        if state == "PageForceAndDistrict":
            out = answer.answer(res["wait"], "notmine", "district_control_room", only_channel="screen")
            assert out["ok"] and out["waiting_for"] == ["flood_fighting_force"]
            assert answer.answer(res["wait"], "onway", "flood_fighting_force", only_channel="screen")["ok"]
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite", only_channel="screen")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured", only_channel="screen")

    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    run = Run(FUNCTIONS, responder, sfn, name=inc["id"])
    run.start(sfn.started[-1]["input"])
    assert "AlertCentralFloodControlRoom" not in run.entered
    ev = db.timeline(inc["id"])
    assert [e["actor"] for e in ev if e["kind"] == "answer"][0] == "flood_fighting_force"
    assert any(e["kind"] == "declined" for e in ev)


def test_both_roles_declining_climbs(sfn):
    def responder(state, payload, res, run):
        if state == "PageForceAndDistrict":
            answer.answer(res["wait"], "notmine", "district_control_room", only_channel="screen")
            answer.answer(res["wait"], "notmine", "flood_fighting_force", only_channel="screen")
        if state == "AlertCentralFloodControlRoom":
            answer.answer(res["wait"], "onway", only_channel="screen")
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite", only_channel="screen")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured", only_channel="screen")

    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    run = Run(FUNCTIONS, responder, sfn, name=inc["id"])
    run.start(sfn.started[-1]["input"])
    climbs = [e for e in db.timeline(inc["id"]) if e["kind"] == "climb"]
    assert climbs[-1]["reason"] == "Declined" and climbs[-1]["level"] == 5


def test_a_level_with_nobody_on_the_roster_climbs_at_once(aws, monkeypatch):
    fake = FakeStepFunctions()
    monkeypatch.setattr(answer, "_sfn", fake)
    monkeypatch.setattr(start, "_sfn", fake)
    sent = []
    monkeypatch.setattr(channels, "_module", lambda ch: type("M", (), {"send_buttons": staticmethod(lambda *a, **k: sent.append(a)), "send_text": staticmethod(lambda *a, **k: sent.append(a))}))
    # a real-channel run on a stretch whose roster has only the assistant engineer
    db.table().put_item(Item={"PK": "SEG#7", "SK": "META", "km": 7, "villages": []})
    db.table().put_item(Item={"PK": "SEG#7", "SK": "ROSTER#2", "level": 2, "role": "assistant_engineer", "name": "AE", "ssm": "/bp/roster/ae"})

    def responder(state, payload, res, run):
        if state == "PageAssistantEngineer":
            answer.answer(res["wait"], "onway")
        if state == "AwaitEngineerOnSite":
            answer.answer(res["wait"], "onsite")
        if state == "HoldTheStretch":
            answer.answer(res["wait"], "secured")

    inc = start.start(7, "boil_soil", channel="whatsapp", source="whatsapp")
    run = Run(FUNCTIONS, responder, fake, name=inc["id"])
    run.start(fake.started[-1]["input"])
    ev = db.timeline(inc["id"])
    assert [e["kind"] for e in ev].count("no_roster") == 1
    assert next(e for e in ev if e["kind"] == "climb")["reason"] == "NoRoster"
    assert not any(e["kind"] == "page" and e.get("level") == 1 for e in ev)


def test_a_failed_get_ready_is_sent_again_when_the_page_reaches_the_executive_engineer(sfn, monkeypatch):
    calls = {"n": 0}
    real = warn.handler

    def flaky(event, ctx):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("channel down")
        return real(event, ctx)

    from asl_runner import StepFailed

    def wrapped(event, ctx):
        try:
            return flaky(event, ctx)
        except RuntimeError as e:
            raise StepFailed("RuntimeError", str(e))

    fns = {**FUNCTIONS, "WarnFunctionArn": wrapped}
    inc = start.start(14, "boil_soil", channel="screen", source="screen", demo=True)
    run = Run(fns, script({"PageExecutiveEngineer": ["onway"], "AwaitEngineerOnSite": ["onsite"], "HoldTheStretch": ["secured"]}), sfn, name=inc["id"])
    run.start(sfn.started[-1]["input"])
    assert "WarnVillagesOnClimb" in run.entered
    assert [e["level"] for e in db.timeline(inc["id"]) if e["kind"] == "warning"][0] == "taiyaar"
