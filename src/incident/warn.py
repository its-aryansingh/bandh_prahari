"""WarnVillagesGetReady / WarnVillagesMoveNow / AllClear: tell the villages behind the stretch.

The steps are cheap things families will actually do (docs/SPEC.md, flow 6). Recipients are
the mukhiya, the ward members and subscribed families. This weekend only numbers on the demo
roster (ALLOW#) ever get a warning; real users of "Nadi ka haal" never do.
"""

from __future__ import annotations

from boto3.dynamodb.conditions import Key

from channels import send_buttons, send_text
from common import db, ids, roster, words
from gov import cap

LOUDSPEAKER = {"hi": "गाँव के लाउडस्पीकर पर चलाएँ।", "en": "Play it on the village loudspeaker."}


def subscribers(village: str) -> list[dict]:
    """Families who tapped "Khatra ho to batayein", filtered to the demo roster."""
    res = db.table().query(KeyConditionExpression=Key("PK").eq(f"SUB#{village}"))
    out = []
    for item in map(db.plain, res.get("Items", [])):
        sk = str(item.get("SK", ""))
        if sk.startswith("ROLE#"):
            continue
        if roster.allowed(ids.phone_hash(sk)):
            out.append({"role": "family", "name": "", "phone": sk, "village": village})
    return out


def handler(event: dict, _ctx=None) -> dict:
    inc = event["incident"]
    level = event["level"]
    channel = inc.get("channel", "screen")
    villages = inc.get("villages", [])
    seg = db.get_segment(inc["km"]) or {}
    camp_hi, camp_en = seg.get("camp_hi", "पंचायत भवन (नमूना)"), seg.get("camp_en", "Panchayat bhawan (sample)")
    hi, en = words.level_message(level, inc["km"], camp_hi, camp_en)
    msg = {"hi": hi, "en": en}
    people = roster.village_contacts(villages, channel, inc)
    if channel != "screen" and not inc.get("test_to"):
        for v in villages:
            people.extend(subscribers(v))
    button = [{"id": f"r:{inc['id']}:{level}", "hi": words.BUTTONS["ready"][0], "en": words.BUTTONS["ready"][1]}]
    mukhiya_buttons = [
        {"id": f"r:{inc['id']}:{level}", "hi": words.BUTTONS["ready"][0], "en": words.BUTTONS["ready"][1]},
        {"id": f"r:{inc['id']}:cfa", "hi": "गलत अलार्म रद्द करें", "en": "Cancel false alarm"},
    ]
    sent = 0
    for p in people:
        if level == "khatra_tala":
            send_text(channel, p, msg, incident_id=inc["id"])
        elif p.get("role") == "mukhiya":
            send_buttons(channel, p, msg, mukhiya_buttons, incident_id=inc["id"])
            send_text(channel, p, LOUDSPEAKER, incident_id=inc["id"])
        else:
            send_buttons(channel, p, msg, button, incident_id=inc["id"])
        sent += 1
    L = words.LEVELS[level]
    n_v = len(villages)
    db.event(
        inc["id"],
        "warning",
        f"{L['hi']}: {n_v} गाँवों के मुखिया, वार्ड सदस्य और परिवार ({sent} फ़ोन)",
        f"{L['en']}: mukhiyas, ward members and families in {n_v} villages ({sent} phones)",
        actor="system",
        level=level,
        villages=villages,
        recipients=sent,
        cap_response=L["cap"],
    )
    db.update_incident(inc["id"], **{f"warned_{level}": True})
    # The CAP 1.2 draft (status Exercise), published only on our own feed. A failed draft never
    # stops a warning.
    try:
        row = cap.save(inc, level, camp_hi, camp_en)
        if row:
            db.event(inc["id"], "cap_draft", f"CAP ड्राफ़्ट (Exercise): {row['identifier']}", f"CAP draft (Exercise): {row['identifier']}", actor="system", cap=row["identifier"], level=level)
    except Exception as e:  # noqa: BLE001
        print({"cap_draft_failed": repr(e), "incident": inc["id"], "level": level})
    return {"level": level, "recipients": sent}
