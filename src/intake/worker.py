"""What a message on the Baandh Prahari number does (docs/SPEC.md, "How a message moves").

Called asynchronously by the intake with one parsed message. Anyone can get "Nadi ka haal"
for a village, subscribe to its warnings, or the help menu. Only numbers on the demo roster
(ALLOW#) can report, answer a page, or send TEST. Every reply carries its source, "a student
project, not an official warning" and the helplines 1070 / 1800 345 6145.
"""

from __future__ import annotations

import math
import re

from channels import send_buttons, send_list, send_text
from common import clock, db, ids, roster, words
from incident import answer, start
from river import nadi
from rules import priority as rules

KM = re.compile(r"(?:km|k\.m\.|किमी|कि\.मी\.)\s*(\d{1,2})", re.I)
TEST = {"test", "टेस्ट"}
SIX = ["seepage_clear", "boil_soil", "crack", "slip", "overtopping", "rathole"]
CONSENT_HI = "आपका नंबर सिर्फ़ इस मौसम की बाढ़ चेतावनियों के लिए रखा जाएगा।"
CONSENT_EN = "Your number is used only for flood warnings this season."


def footer(msg: dict, source_hi: str = "", source_en: str = "") -> dict:
    f_hi, f_en = words.footer(source_hi, source_en)
    return {"hi": f"{msg['hi']}\n\n{f_hi}", "en": f"{msg['en']}\n\n{f_en}"}


def help_menu(channel: str, to: dict) -> None:
    send_text(
        channel,
        to,
        footer(
            {
                "hi": "बाँध प्रहरी। अपने गाँव का नाम भेजें (जैसे \"हैजलपुर\"), आज की नदी का हाल मिलेगा। या अपनी लोकेशन भेजें।",
                "en": "Baandh Prahari. Send your village's name (for example \"Haijalpur\") for today's river status, or share your location.",
            }
        ),
    )


def nearest_village(lat: float, lon: float) -> str | None:
    best, name = 1e9, None
    for v in nadi.STRETCH["villages"]:
        if v.get("lat") is None:
            continue
        d = math.hypot(v["lat"] - lat, (v["lon"] - lon) * math.cos(math.radians(lat)))
        if d < best:
            best, name = d, v["name"]
    return name if best < 0.2 else None  # about 20 km


def river_status(channel: str, to: dict, text: str) -> bool:
    r = nadi.reply(text)
    if not r:
        return False
    send_text(channel, to, {"hi": r["hi"], "en": r["en"]})
    send_buttons(
        channel,
        to,
        {"hi": f"{r['village']}: ख़तरा हो तो बताएँ?\n{CONSENT_HI}", "en": f"{r['village']}: tell you if there is danger?\n{CONSENT_EN}"},
        [{"id": f"sub:{r['village']}"[:256], "hi": "ख़तरा हो तो बताएँ", "en": "Tell me if danger"}],
    )
    use(to["phone"], r["village"])
    return True


def use(phone: str, village: str) -> None:
    """USE#<date>/<sha256(phone)>: unique people, villages and repeat use, without identities."""
    day = clock.now().strftime("%Y-%m-%d")
    db.table().update_item(
        Key={"PK": f"USE#{day}", "SK": ids.phone_hash(phone)},
        UpdateExpression="SET village = :v, #t = :ttl ADD n :one",
        ExpressionAttributeNames={"#t": "ttl"},
        ExpressionAttributeValues={":v": village, ":one": 1, ":ttl": clock.epoch() + 120 * 86400},
    )


def ask_sign(channel: str, to: dict, km: int, test: bool = False) -> None:
    db.table().put_item(Item={"PK": f"CONV#{ids.digits(to['phone'])}", "SK": "STATE", "km": km, "test": test, "ttl": clock.epoch() + 30 * 60})
    rows = [{"id": f"s:{s}", "hi": words.sign_hi(s), "en": words.sign_en(s)} for s in SIX]
    msg = {"hi": f"किमी {km}: क्या दिख रहा है? एक चुनें।", "en": f"Km {km}: what do you see? Pick one."}
    send_list(channel, to, msg, {"hi": "संकेत चुनें", "en": "Pick the sign"}, rows)


def report(channel: str, to: dict, sign: str) -> None:
    conv = db.table().get_item(Key={"PK": f"CONV#{ids.digits(to['phone'])}", "SK": "STATE"}).get("Item")
    if not conv or sign not in rules.BASE:
        send_text(channel, to, footer({"hi": "पहले किलोमीटर भेजें, जैसे \"किमी 14\"।", "en": "Send the kilometre first, for example \"km 14\"."}))
        return
    km = int(conv["km"])
    test = bool(conv.get("test"))
    inc = start.start(km, sign, channel=channel, source="whatsapp", reporter="patrol", test_to=to["phone"] if test else "")
    db.table().delete_item(Key={"PK": f"CONV#{ids.digits(to['phone'])}", "SK": "STATE"})
    mins = rules.answer_minutes(inc["priority"]) if not test else 1
    send_text(
        channel,
        to,
        footer(
            {
                "hi": f"दर्ज: किमी {km}, {words.sign_hi(sign)}। नियम: {inc['priority']}। जेई को {mins} मिनट में जवाब देना है।" + (" (TEST: हर स्तर आप ही हैं)" if test else ""),
                "en": f"Logged: km {km}, {words.sign_en(sign).lower()}. Rules: {inc['priority']}. The junior engineer has {mins} min to answer." + (" (TEST: you are every level)" if test else ""),
            }
        ),
    )


def tap(channel: str, to: dict, reply_id: str, roles: list[str]) -> None:
    parts = reply_id.split(":")
    if parts[0] == "a" and len(parts) == 3 and roles:
        _, wait_id, action = parts
        w = db.get_wait(wait_id) or {}
        inc = db.get_incident(w.get("incident", "")) or {}
        mine = inc.get("test_to") == ids.digits(to["phone"]) or bool(set(roles) & set(w.get("roles") or [w.get("role")]))
        if not mine:
            send_text(channel, to, footer({"hi": "यह बटन आपके लिए नहीं है।", "en": "This button isn't for you."}))
            return
        role = next((r for r in (w.get("roles") or [w.get("role")]) if r in roles), None)
        res = answer.answer(wait_id, action, role, by=ids.phone_hash(to["phone"]))
        if not res.get("ok"):
            send_text(channel, to, footer({"hi": "देर हो गई: बात आगे बढ़ चुकी है।", "en": "Too late: it has already climbed."}))
        return
    if parts[0] == "r" and len(parts) == 3:
        incident_id, action_or_level = parts[1], parts[2]
        if action_or_level == "cfa":
            cancel_false_alarm(channel, to, incident_id)
            return
        db.table().put_item(Item={"PK": f"READY#{incident_id}", "SK": f"{action_or_level}#{ids.phone_hash(to['phone'])}", "at": clock.iso()})
        send_text(channel, to, footer({"hi": "धन्यवाद, दर्ज हो गया।", "en": "Thank you, noted."}))
        return
    if parts[0] == "s" and len(parts) == 2 and roles:
        report(channel, to, parts[1])
        return
    if parts[0] == "sub" and len(parts) == 2:
        village = parts[1]
        if village in {v["name"] for v in nadi.STRETCH["villages"]}:
            db.table().put_item(Item={"PK": f"SUB#{village}", "SK": ids.digits(to["phone"]), "consent": clock.iso(), "note": CONSENT_EN})
            send_text(channel, to, footer({"hi": f"{village} की चेतावनियाँ आपको मिलेंगी। {CONSENT_HI}", "en": f"You will get {village}'s warnings. {CONSENT_EN}"}))
        return
    if parts[0] == "rc" and len(parts) == 3:
        km_str, action = parts[1], parts[2]
        try:
            km_num = int(km_str)
            from rollcall import ask as rollcall_ask
            rollcall_ask.record_reply(km_num, action, by=ids.phone_hash(to["phone"]))
            if action == "ok":
                send_text(channel, to, footer({"hi": f"किमी {km_num}: धन्यवाद, सब ठीक दर्ज हुआ।", "en": f"Km {km_num}: thank you, all-well recorded."}))
            else:
                send_text(channel, to, footer({"hi": f"किमी {km_num}: समस्या दर्ज हुई। कृपया संकेत चुनें।", "en": f"Km {km_num}: problem noted. Please pick the sign."}))
                ask_sign(channel, to, km_num)
        except Exception as e:
            print({"rollcall_reply_error": repr(e)})
        return
    if parts[0] == "cfa" and len(parts) == 2:
        inc_id = parts[1]
        cancel_false_alarm(channel, to, inc_id)
        return
    help_menu(channel, to)


def cancel_false_alarm(channel: str, to: dict, incident_id: str) -> None:
    inc = db.get_incident(incident_id)
    if not inc:
        return
    phone_h = ids.phone_hash(to.get("phone", ""))
    db.event(
        incident_id,
        "false_alarm_cancelled",
        "मुखिया द्वारा गलत अलार्म रद्द किया गया; स्थिति सामान्य",
        "False alarm cancelled by mukhiya; normal status restored",
        actor="mukhiya",
        by=phone_h,
    )
    from incident import warn
    warn.handler({"incident": inc, "level": "khatra_tala"})
    db.update_incident(incident_id, status="cancelled", cancelled_reason="false_alarm_cancelled_by_mukhiya")
    send_text(
        channel,
        to,
        footer({
            "hi": f"घटना {incident_id}: गलत अलार्म रद्द किया गया। गाँवों को 'खतरा टला' सूचना भेज दी गई है।",
            "en": f"Incident {incident_id}: false alarm cancelled. All-clear notification sent to villages.",
        }),
    )


def handler(m: dict, _ctx=None) -> dict:
    channel = m.get("channel", "whatsapp")
    to = {"role": "sender", "phone": m["from"]}
    roles = roster.roles_of(ids.phone_hash(m["from"]))
    kind, text = m.get("type"), (m.get("text") or "").strip()

    if kind in ("button", "list"):
        tap(channel, to, m.get("reply_id", ""), roles)
        return {"did": "tap"}
    if kind == "location" and m.get("lat") is not None:
        onsite = db.table().get_item(Key={"PK": f"CONV#{ids.digits(m['from'])}", "SK": "ONSITE"}).get("Item")
        if roles and onsite:
            # TODO(slice 6): the 200 m distance check before this counts as on site
            answer.answer(onsite["wait"], "onsite", by=ids.phone_hash(m["from"]))
            return {"did": "onsite"}
        v = nearest_village(float(m["lat"]), float(m["lon"]))
        if v and river_status(channel, to, v):
            return {"did": "nadi"}
        help_menu(channel, to)
        return {"did": "help"}
    if kind == "text":
        if text.lower() in TEST:
            if not roles:
                send_text(channel, to, footer({"hi": "TEST सिर्फ़ डेमो रोस्टर के फ़ोन के लिए है। अपने गाँव का नाम भेजें।", "en": "TEST is only for the demo roster's phones. Send your village's name."}))
                return {"did": "refused_test"}
            ask_sign(channel, to, 14, test=True)
            return {"did": "test"}
        km = KM.search(text)
        if roles and km and 1 <= int(km.group(1)) <= 20:
            ask_sign(channel, to, int(km.group(1)))
            return {"did": "ask_sign"}
        if river_status(channel, to, text):
            return {"did": "nadi"}
    if kind == "audio" and roles:
        # TODO(slice 5): Transcribe hi-IN and the drafter; until then the six-sign list
        send_text(channel, to, footer({"hi": "आवाज़ मिली। किमी भेजें, जैसे \"किमी 14\"।", "en": "Voice note received. Send the kilometre, for example \"km 14\"."}))
        return {"did": "audio"}
    help_menu(channel, to)
    return {"did": "help"}
