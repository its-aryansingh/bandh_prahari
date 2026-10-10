"""The WhatsApp channel and intake.

Fixtures (tests/fixtures/README.md): the SNS wrapper is a real, redacted capture published in
aws-samples (a text message); the inner Meta webhook entries for buttons, lists, audio,
location and statuses are the pywa project's test data. Replace both with your own captures
(CAPTURE=on, docs/DEPLOY.md) once the number is linked.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import channels
from asl_runner import FakeStepFunctions, Run
from channels import whatsapp
from common import db, ids, roster
from incident import answer, delivery, start
from intake import handler as intake
from intake import parse, telegram_hook, worker

FIX = Path(__file__).parent / "fixtures" / "whatsapp"
META = {n: json.loads((FIX / "meta" / f"{n}.json").read_text()) for n in ("message", "message_status", "callback_button", "callback_selection")}
ORIG_CONTEXT = {"MetaPhoneNumberIds": [{"metaPhoneNumberId": "1122334455667", "arn": "arn:aws:social-messaging:ap-south-1:000000000000:phone-number-id/abc123"}]}
ROSTER_PHONE = "919000000001"
STRANGER = "919000000999"


def entry(sample: dict) -> dict:
    return sample["entry"][0]


# ---------------- parsing ----------------


def test_real_sns_wrapper_text_message():
    raw = (FIX / "aws_sample_text.sns_message.json").read_text()
    [m] = parse.sns_message(raw)
    assert m["kind"] == "message" and m["type"] == "text" and m["text"] == "BB"
    assert m["id"].startswith("wamid.") and m["origination"].startswith("phone-number-id-")


def test_sns_record_wrapping():
    raw = (FIX / "aws_sample_text.sns_message.json").read_text()
    assert len(parse.sns_event({"Records": [{"Sns": {"Message": raw}}, {"Sns": {"Message": raw}}]})) == 2


def test_button_and_list_replies():
    [b] = parse.entry(entry(META["callback_button"]["button"]), ORIG_CONTEXT)
    assert b["type"] == "button" and b["reply_id"] == "callback_data"
    assert b["origination"] == "phone-number-id-abc123"
    [l] = parse.entry(entry(META["callback_selection"]["callback"]), ORIG_CONTEXT)
    assert l["type"] == "list" and l["reply_id"] == "callback_data"


def test_voice_note_and_location():
    [a] = parse.entry(entry(META["message"]["voice"]))
    assert a["type"] == "audio" and a["mime"].startswith("audio/ogg") and a["media_id"]
    [loc] = parse.entry(entry(META["message"]["current_location"]))
    assert loc["type"] == "location" and loc["lat"] == 12.25089


def test_statuses_with_callback_and_errors():
    [s] = parse.entry(entry(META["message_status"]["with_tracker"]))
    assert s["kind"] == "status" and s["status"] == "sent" and s["callback"] == "some data"
    [f] = parse.entry(entry(META["message_status"]["failed"]))
    assert f["status"] == "failed" and f["error"]["code"] == 130472


# ---------------- sending ----------------


class FakeSocial:
    def __init__(self):
        self.sent = []

    def send_whatsapp_message(self, originationPhoneNumberId, metaApiVersion, message):
        self.sent.append({"from": originationPhoneNumberId, "v": metaApiVersion, "msg": json.loads(message.decode())})
        return {"messageId": f"wamid.out{len(self.sent)}"}


@pytest.fixture
def wa(aws, monkeypatch):
    fake = FakeSocial()
    monkeypatch.setattr(whatsapp, "_client", fake)
    monkeypatch.setattr(channels.config, "OUTBOUND", "on")
    monkeypatch.setattr(whatsapp.config, "WA_ORIGINATION_ID", "phone-number-id-abc123")
    db.table().put_item(Item={"PK": f"ALLOW#{ids.phone_hash(ROSTER_PHONE)}", "SK": "META", "roles": ["junior_engineer", "patrol"]})
    return fake


def test_buttons_carry_the_short_wait_id_and_hindi_titles(wa):
    channels.send_buttons("whatsapp", {"role": "junior_engineer", "phone": ROSTER_PHONE}, {"hi": "पेज", "en": "Page"}, [{"id": "a:abcd2345:onway", "hi": "मैं जा रहा हूँ", "en": "On my way"}], incident_id="INC-1")
    m = wa.sent[0]["msg"]
    assert m["to"] == "+" + ROSTER_PHONE and m["type"] == "interactive"
    btn = m["interactive"]["action"]["buttons"][0]["reply"]
    assert btn == {"id": "a:abcd2345:onway", "title": "मैं जा रहा हूँ"}
    assert m["biz_opaque_callback_data"] == "INC-1|abcd2345|junior_engineer"
    assert wa.sent[0]["v"] == "v20.0"


def test_nothing_tied_to_an_incident_reaches_a_number_off_the_roster(wa):
    out = channels.send_text("whatsapp", {"role": "family", "phone": STRANGER}, {"hi": "निकल चलो", "en": "Move now"}, incident_id="INC-1")
    assert out["failed"] == "NotAllowed" and wa.sent == []
    assert [e["kind"] for e in db.timeline("INC-1")] == ["send_failed"]


def test_outbound_off_holds_every_real_message(wa, monkeypatch):
    monkeypatch.setattr(channels.config, "OUTBOUND", "off")
    channels.send_text("whatsapp", {"role": "junior_engineer", "phone": ROSTER_PHONE}, {"hi": "x", "en": "x"}, incident_id="INC-2")
    assert wa.sent == [] and db.timeline("INC-2")[0]["kind"] == "held"


def test_list_rows_fit_whatsapps_limits(wa):
    rows = [{"id": f"s:{s}", "hi": "क" * 40, "en": "x"} for s in range(10)]
    channels.send_list("whatsapp", {"phone": STRANGER}, {"hi": "क" * 2000, "en": ""}, {"hi": "संकेत चुनें", "en": "Pick"}, rows)
    i = wa.sent[0]["msg"]["interactive"]
    assert len(i["body"]["text"]) <= 1024 and all(len(r["title"]) <= 24 for r in i["action"]["sections"][0]["rows"])


# ---------------- intake ----------------


class FakeLambda:
    def __init__(self):
        self.invoked = []

    def invoke(self, FunctionName, InvocationType, Payload):
        self.invoked.append((InvocationType, json.loads(Payload)))
        return {"StatusCode": 202}


def test_intake_hands_off_async_and_dedupes(aws, monkeypatch):
    fake = FakeLambda()
    monkeypatch.setattr(intake, "_lambda", fake)
    raw = (FIX / "aws_sample_text.sns_message.json").read_text()
    ev = {"Records": [{"Sns": {"Message": raw}}]}
    assert intake.handler(ev)["handed"] == 1
    assert intake.handler(ev) == {"handed": 0, "statuses": 0, "duplicates": 1}
    assert fake.invoked[0][0] == "Event" and fake.invoked[0][1]["text"] == "BB"


# ---------------- the worker ----------------


def msg(**kw):
    return {"kind": "message", "id": "wamid.in", "from": kw.pop("frm", STRANGER), "channel": "whatsapp", **kw}


def test_a_village_name_gets_the_river_reply_with_footer_and_subscribe(wa):
    worker.handler(msg(type="text", text="हैजलपुर"))
    texts = [s["msg"] for s in wa.sent]
    body = texts[0]["text"]["body"]
    assert "छात्र परियोजना" in body and "1070" in body and "1800 345 6145" in body
    assert texts[1]["interactive"]["action"]["buttons"][0]["reply"]["id"] == "sub:Haijalpur"


def test_subscribing_stores_consent(wa):
    worker.handler(msg(type="button", reply_id="sub:Haijalpur"))
    item = db.table().get_item(Key={"PK": "SUB#Haijalpur", "SK": STRANGER})["Item"]
    assert item["consent"] and "flood warnings" in item["note"]


def test_strangers_cannot_test_report_or_answer(wa):
    worker.handler(msg(type="text", text="TEST"))
    assert "डेमो रोस्टर" in wa.sent[-1]["msg"]["text"]["body"]
    worker.handler(msg(type="text", text="km 14 par paani"))
    assert not db.table().get_item(Key={"PK": f"CONV#{STRANGER}", "SK": "STATE"}).get("Item")
    db.put_wait("abcd2345", {"token": "t", "incident": "INC-x", "kind": "page", "channel": "whatsapp", "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    worker.handler(msg(type="button", reply_id="a:abcd2345:onway"))
    assert db.get_wait("abcd2345")  # untouched


def test_every_reply_has_the_footer(wa):
    worker.handler(msg(type="text", text="namaste"))
    worker.handler(msg(type="text", text="TEST"))
    for s in wa.sent:
        body = s["msg"].get("text", {}).get("body") or s["msg"].get("interactive", {}).get("body", {}).get("text", "")
        if s["msg"]["type"] == "text":
            assert "1070" in body and "सरकारी चेतावनी नहीं" in body


def test_test_path_runs_the_whole_clock_on_the_senders_phone(wa, monkeypatch):
    sfn = FakeStepFunctions()
    monkeypatch.setattr(start, "_sfn", sfn)
    monkeypatch.setattr(answer, "_sfn", sfn)
    monkeypatch.setattr(delivery.config, "DELIVERY_FUNCTION_ARN", "")  # no scheduler in tests
    worker.handler(msg(frm=ROSTER_PHONE, type="text", text="TEST"))
    assert wa.sent[-1]["msg"]["interactive"]["type"] == "list"
    worker.handler(msg(frm=ROSTER_PHONE, type="list", reply_id="s:boil_soil"))
    run_input = sfn.started[-1]["input"]
    inc = run_input["incident"]
    assert inc["id"].startswith("TEST-") and inc["test_to"] == ROSTER_PHONE and run_input["clocks"]["page"] == 60
    from test_incident_run import FUNCTIONS

    def responder(state, payload, res, run):
        # the sender taps on their own phone, through the worker
        if state == "PageJuniorEngineer":
            worker.handler(msg(frm=ROSTER_PHONE, type="button", reply_id=f"a:{res['wait']}:onway"))
        if state == "AwaitEngineerOnSite":
            worker.handler(msg(frm=ROSTER_PHONE, type="location", lat=25.95, lon=85.05))
        if state == "HoldTheStretch":
            worker.handler(msg(frm=ROSTER_PHONE, type="button", reply_id=f"a:{res['wait']}:secured"))

    Run(FUNCTIONS, responder, sfn, name=inc["id"]).start(run_input)
    assert db.get_incident(inc["id"])["status"] == "closed_secured"
    assert all(s["msg"]["to"] == "+" + ROSTER_PHONE for s in wa.sent)
    # the TEST number never lands in the public timeline
    from api import public

    t = public.timeline(inc["id"])
    assert ROSTER_PHONE not in json.dumps(t)


# ---------------- delivery ----------------


def test_no_receipt_in_two_minutes_climbs(aws, monkeypatch):
    sfn = FakeStepFunctions()
    monkeypatch.setattr(delivery, "_sfn", sfn)
    db.put_wait("abcd2348", {"token": "tok", "incident": "INC-3", "kind": "page", "channel": "whatsapp", "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    assert delivery.handler({"wait": "abcd2348"})["result"] == "undelivered"
    assert sfn.outcomes["tok"] == ("failure", {"Error": "Undelivered", "Cause": "No delivery receipt within two minutes: it climbs"})


def test_a_receipt_keeps_the_clock_running(aws, monkeypatch):
    sfn = FakeStepFunctions()
    monkeypatch.setattr(delivery, "_sfn", sfn)
    db.put_wait("abcd2349", {"token": "tok", "incident": "INC-4", "kind": "page", "channel": "whatsapp", "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    delivery.on_status({"status": "delivered", "callback": "INC-4|abcd2349|junior_engineer", "id": "wamid.x"})
    assert delivery.handler({"wait": "abcd2349"})["result"] == "delivered" and sfn.outcomes == {}
    assert [e["kind"] for e in db.timeline("INC-4")] == ["delivered"]


def test_a_failed_status_climbs_at_once(aws, monkeypatch):
    sfn = FakeStepFunctions()
    monkeypatch.setattr(delivery, "_sfn", sfn)
    db.put_wait("abcd2350", {"token": "tok2", "incident": "INC-5", "kind": "page", "channel": "whatsapp", "roles": ["junior_engineer"]}, ttl_epoch=9999999999)
    delivery.on_status({"status": "failed", "callback": "INC-5|abcd2350|junior_engineer", "id": "wamid.y", "error": {"code": 131026}})
    assert sfn.outcomes["tok2"][1]["Error"] == "Undelivered"


def test_delivery_schedule_is_one_off_and_deletes_itself(aws, monkeypatch):
    calls = []

    class S:
        def create_schedule(self, **kw):
            calls.append(kw)

    monkeypatch.setattr(delivery, "_scheduler", S())
    monkeypatch.setattr(delivery.config, "DELIVERY_FUNCTION_ARN", "arn:aws:lambda:ap-south-1:000000000000:function:bp-delivery")
    monkeypatch.setattr(delivery.config, "SCHEDULER_ROLE_ARN", "arn:aws:iam::000000000000:role/x")
    delivery.schedule("abcd2351", "INC-6")
    c = calls[0]
    assert c["Name"] == "bp-delivery-abcd2351" and c["ScheduleExpression"].startswith("at(") and c["ActionAfterCompletion"] == "DELETE"


# ---------------- Telegram ----------------


def test_telegram_hook_needs_its_secret(aws, monkeypatch):
    from common import http

    monkeypatch.setattr(http, "secret", lambda name, ttl_s=300: "hooksecret")
    fake = FakeLambda()
    monkeypatch.setattr(intake, "_lambda", fake)
    ev = {"headers": {"x-telegram-bot-api-secret-token": "nope"}, "body": json.dumps({"update_id": 1, "message": {"chat": {"id": 5}, "text": "Haijalpur"}})}
    assert telegram_hook.handler(ev)["statusCode"] == 401
    ev["headers"]["x-telegram-bot-api-secret-token"] = "hooksecret"
    assert telegram_hook.handler(ev)["statusCode"] == 200
    assert fake.invoked[0][1] == {"kind": "message", "id": "tg-1", "from": "5", "channel": "telegram", "type": "text", "text": "Haijalpur"}


def test_channel_switch_reaches_telegram(aws, monkeypatch):
    from channels import telegram

    sent = []
    monkeypatch.setattr(telegram, "call", lambda method, payload: sent.append((method, payload)) or {"result": {"message_id": 7}})
    monkeypatch.setattr(channels.config, "OUTBOUND", "on")
    channels.send_buttons("telegram", {"role": "x", "phone": "5"}, {"hi": "क", "en": "k"}, [{"id": "a:abcd2345:onway", "hi": "मैं जा रहा हूँ", "en": "On my way"}])
    assert sent[0][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "a:abcd2345:onway"
