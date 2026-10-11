"""Every wait in the run: page a level, await the engineer on site, hold the stretch.

Step Functions invokes this with ``.waitForTaskToken``. It stores the task token under a
short wait ID (WAIT#<id>, removed by TTL), sends the message whose buttons carry only that
short ID, writes the timeline, and returns. The run then waits, for TimeoutSecondsPath
seconds, until src/incident/answer.py calls SendTaskSuccess or SendTaskFailure.
"""

from __future__ import annotations

from channels import send_buttons, send_text
from channels import whatsapp
from common import clock, db, ids, metrics, roster, words
from incident import delivery

CLIMB_REASON = {
    "States.Timeout": ("कोई जवाब नहीं आया", "No answer in time"),
    "Declined": ("'मेरा क्षेत्र नहीं' कहा", "They said it isn't their stretch"),
    "Undelivered": ("संदेश फ़ोन तक नहीं पहुँचा", "The message never reached the phone"),
    "NoRoster": ("इस स्तर पर रोस्टर में कोई नहीं", "Nobody is on the roster at that level"),
}


class NoRoster(Exception):
    """Raised inside a wait: the run catches it (States.ALL) and climbs, like a timeout."""


def _wait(inc: dict, kind: str, token: str, timeout_s: int, **extra) -> str:
    wait_id = ids.short_id()
    db.put_wait(
        wait_id,
        {
            "token": token,
            "incident": inc["id"],
            "kind": kind,
            "channel": inc.get("channel", "screen"),
            "demo": bool(inc.get("demo")),
            "created": clock.iso(),
            "timeout_s": timeout_s,
            **extra,
        },
        ttl_epoch=clock.epoch() + timeout_s + 24 * 3600,
    )
    return wait_id


def _buttons(wait_id: str, actions: list[str]) -> list[dict]:
    return [{"id": f"a:{wait_id}:{a}", "hi": words.BUTTONS[a][0], "en": words.BUTTONS[a][1]} for a in actions]


def page(event: dict) -> dict:
    inc = event["incident"]
    level = int(event["level"])
    timeout_s = int(event["timeout"])
    channel = inc.get("channel", "screen")
    people = roster.people(inc["km"], level, channel, inc)
    if not people:
        db.event(
            inc["id"],
            "no_roster",
            f"किमी {inc['km']}: स्तर {level} पर रोस्टर में कोई नहीं, बात आगे",
            f"Km {inc['km']}: nobody on the roster at level {level}; it climbs",
            actor="clock",
            level=level,
        )
        raise NoRoster(f"level {level} at km {inc['km']}")
    roles = [p["role"] for p in people]
    wait_id = _wait(inc, "page", event["taskToken"], timeout_s, level=level, roles=roles)

    prev = event.get("previous") or {}
    if level > 1:
        why = CLIMB_REASON.get(prev.get("Error", "States.Timeout"), CLIMB_REASON["States.Timeout"])
        db.event(
            inc["id"],
            "climb",
            f"{why[0]}: बात {', '.join(roster.role_hi(r) for r in roles)} तक",
            f"{why[1]}: it climbs to the {' and '.join(roster.role_en(r).lower() for r in roles)}",
            actor="clock",
            reason=prev.get("Error", "States.Timeout"),
            level=level,
        )
        try:
            metrics.emit("Climbs", 1.0, unit="Count", dimensions={"Level": str(level), "Priority": inc.get("priority", "P1")})
        except Exception:
            pass
    elif level == 1 and inc.get("opened"):
        try:
            sec = max(0.0, (clock.now() - clock.from_iso(inc["opened"])).total_seconds())
            metrics.emit("TapToPage", sec, unit="Seconds", dimensions={"Priority": inc.get("priority", "P1")})
        except Exception:
            pass
    mins = max(1, round(timeout_s / 60))
    deadline = clock.after(timeout_s)
    db.event(
        inc["id"],
        "page",
        f"{', '.join(roster.role_hi(r) for r in roles)} को पेज, {mins} मिनट में जवाब",
        f"{' and '.join(roster.role_en(r) for r in roles)} paged, {mins} minutes to answer",
        actor="system",
        to=roles[0],
        roles=roles,
        level=level,
        deadline=deadline,
        deadline_s=timeout_s,
        wait=wait_id,
    )
    db.update_incident(inc["id"], status="paged", with_role=roles[0], level=level, deadline=deadline)

    nxt = roster.LEVELS.get(level + 1)
    nxt_hi = roster.role_hi(nxt[0]) if nxt else "केंद्रीय कक्ष"
    nxt_en = roster.role_en(nxt[0]).lower() if nxt else "the central control room"
    villages = ", ".join(inc.get("villages", [])) or "-"
    msg = {
        "hi": f"{inc['priority']}, किमी {inc['km']}: {words.sign_hi(inc['sign'])}। पीछे के गाँव: {villages}।\n"
        f"{mins} मिनट में जवाब दें, वरना बात {nxt_hi} तक जाएगी।",
        "en": f"{inc['priority']}, km {inc['km']}: {words.sign_en(inc['sign']).lower()}. Villages behind: {villages}.\n"
        f"Answer within {mins} minutes, or it climbs to the {nxt_en}.",
    }
    for p in people:
        send_buttons(channel, p, msg, _buttons(wait_id, ["onway", "notmine"]), incident_id=inc["id"])
    if channel != "screen":
        delivery.schedule(wait_id, inc["id"])
    # the levels below stay copied, so nobody can say they didn't know
    if level > 1:
        cc = {"hi": f"कॉपी: किमी {inc['km']} की बात अब {roster.role_hi(roles[0])} के पास है।", "en": f"Copy: km {inc['km']} is now with the {roster.role_en(roles[0]).lower()}."}
        for lower in range(1, level):
            for p in roster.people(inc["km"], lower, channel, inc):
                send_text(channel, p, cc, incident_id=inc["id"])
    return {"wait": wait_id}


def onsite(event: dict) -> dict:
    inc = event["incident"]
    timeout_s = int(event["timeout"])
    ans = event.get("answer") or {}
    channel = inc.get("channel", "screen")
    role = ans.get("role", "junior_engineer")
    wait_id = _wait(inc, "onsite", event["taskToken"], timeout_s, role=role, level=ans.get("level", 1))
    mins = max(1, round(timeout_s / 60))
    db.event(
        inc["id"],
        "await_onsite",
        f"{roster.role_hi(role)} को {mins} मिनट में किमी {inc['km']} पहुँचना है (200 मी. के अंदर)",
        f"The {roster.role_en(role).lower()} has {mins} minutes to reach km {inc['km']} (within 200 m)",
        actor="clock",
        to=role,
        deadline_s=timeout_s,
        wait=wait_id,
    )
    msg = {
        "hi": f"किमी {inc['km']} पहुँचकर लोकेशन पिन और एक फ़ोटो भेजें। {mins} मिनट हैं।",
        "en": f"When you reach km {inc['km']}, send a location pin and a photo. You have {mins} minutes.",
    }
    to = roster.person(inc["km"], role, int(ans.get("level", 1)), channel, inc)
    if channel == "screen":
        # on screen the button stands in for the pin; a real check-in needs a pin within 200 m
        send_buttons(channel, to, msg, _buttons(wait_id, ["onsite"]), incident_id=inc["id"])
    else:
        send_text(channel, to, msg, incident_id=inc["id"])
        # the location pin from this phone answers the on-site wait (intake/worker.py)
        phone = whatsapp.phone_of(to)
        if phone:
            db.table().put_item(
                Item={"PK": f"CONV#{ids.digits(phone)}", "SK": "ONSITE", "wait": wait_id, "incident": inc["id"], "km": inc["km"], "ttl": clock.epoch() + timeout_s + 3600}
            )
    return {"wait": wait_id}


def hold(event: dict) -> dict:
    inc = event["incident"]
    timeout_s = int(event["timeout"])
    ans = event.get("answer") or {}
    channel = inc.get("channel", "screen")
    role = ans.get("role", "junior_engineer")
    wait_id = _wait(inc, "hold", event["taskToken"], timeout_s, role=role, level=ans.get("level", 1))
    mins = max(1, round(timeout_s / 60))
    db.event(
        inc["id"],
        "hold",
        f"हाज़िरी: हर {mins} मिनट पर किमी {inc['km']} का हाल",
        f"Check-in: the state of km {inc['km']} every {mins} minutes",
        actor="clock",
        to=role,
        deadline_s=timeout_s,
        wait=wait_id,
    )
    msg = {
        "hi": f"किमी {inc['km']}: अभी क्या हाल है? हर {mins} मिनट पर बताएँ।",
        "en": f"Km {inc['km']}: how does it stand now? Tell us every {mins} minutes.",
    }
    to = roster.person(inc["km"], role, int(ans.get("level", 1)), channel, inc)
    send_buttons(channel, to, msg, _buttons(wait_id, ["holding", "secured", "breached"]), incident_id=inc["id"])
    return {"wait": wait_id}


def handler(event: dict, _ctx=None) -> dict:
    kind = event.get("kind", "page")
    return {"page": page, "onsite": onsite, "hold": hold}[kind](event)
