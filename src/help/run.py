"""The help run's steps (statemachine/help.asl.json), and how a call for help starts one.

Same answer clock as the incident run: every wait stores its task token under a short wait ID,
the team's buttons carry only that ID, and every step is written to HELP#<id>/EV#.
"""

from __future__ import annotations

import json

import boto3

from channels import send_buttons, send_text
from common import clock, config, db, ids
from help import core
from incident import page as incident_page

_sfn = None


def sfn():
    global _sfn
    if _sfn is None:
        _sfn = boto3.client("stepfunctions")
    return _sfn


def _team_to(team: dict, channel: str) -> dict:
    return {"role": team["id"], "name": team["name_en"], "ssm": f"/bp/teams/{team['id']}"}


def _family(h: dict, msg: dict) -> None:
    """Progress to a WhatsApp family: a reply to the person who asked, not a warning."""
    phone = core.reply_to(h["id"])
    if phone:
        send_text("whatsapp" if config.CHANNEL == "screen" else config.CHANNEL, {"role": "family", "phone": phone}, msg)


# ---------------- starting ----------------


class BadHelp(ValueError):
    pass


def create(lat: float, lon: float, people: int, *, elderly: int = 0, children: int = 0, needs: list[str] | None = None, channel: str = "web", phone: str = "") -> dict:
    """A family's call for help: HELP#<id> (no name, no number), then the help run."""
    lat, lon, people = float(lat), float(lon), int(people)
    if not core.in_bbox(lat, lon):
        raise BadHelp("outside the stretch")
    if not 1 <= people <= 50:
        raise BadHelp("people")
    needs = sorted(set(needs or []) & core.NEEDS)
    v = core.nearest_village(lat, lon)
    hid = ids.incident_id(0, "HELP").replace("-0-", "-")
    h = {
        "id": hid,
        "village": v["name"],
        "lat": round(lat, 5),
        "lon": round(lon, 5),
        "people": people,
        "elderly": max(0, min(int(elderly), people)),
        "children": max(0, min(int(children), people)),
        "needs": needs,
        "channel": channel if channel in ("whatsapp", "helpline", "web") else "web",
        "status": "open",
        "team": None,
        "teams": [],
        "tried": [],
        "raised": clock.iso(),
        "climbs": 0,
        "key": ids.short_id(12),  # lets the family's own page follow its request
        "ttl": clock.epoch() + 120 * 86400,  # cleared after the season
    }
    if phone:
        h["phone_hash"] = ids.phone_hash(phone)
        db.table().put_item(Item={"PK": f"REPLY#{hid}", "SK": "META", "phone": ids.digits(phone), "ttl": clock.epoch() + 86400})
    db.put_incident(h)
    db.event(hid, "raised", f"मदद की पुकार: {v['name_hi']} के पास, {people} लोग", f"Call for help near {v['name']}: {people} people", actor=h["channel"], people=people, needs=needs)
    clocks = core.DEMO_CLOCKS if config.HELP_CLOCKS == "demo" else core.REAL_CLOCKS
    res = sfn().start_execution(
        stateMachineArn=config.HELP_MACHINE_ARN,
        name=hid,
        input=json.dumps({"help": {"id": hid, "lat": h["lat"], "lon": h["lon"]}, "clocks": clocks, "limits": core.LIMITS, "counts": {"asks": 0, "next": 0}}),
    )
    db.update_incident(hid, execution_arn=res["executionArn"])
    return h


# ---------------- the steps ----------------


def open_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    camp = core.camp_for(h["lat"], h["lon"])
    try:
        core.location().put_geofence(
            CollectionName=core.COLLECTION,
            GeofenceId=h["id"],
            Geometry={"Circle": {"Center": [h["lon"], h["lat"]], "Radius": 200.0}},
        )
        fence = True
    except Exception as e:  # noqa: BLE001  (the team's button still ends the wait)
        print({"geofence": "not set", "error": repr(e)})
        fence = False
    db.update_incident(h["id"], camp=camp)
    db.event(h["id"], "opened", f"नज़दीकी शिविर: {camp['camp_hi']}, लगभग {camp['km']} किमी" + (", 200 मी. का घेरा लगा" if fence else ""), f"Nearest camp: {camp['camp_en']}, about {camp['km']} km" + (", 200 m geofence set" if fence else ""), actor="system")
    _family(h, {"hi": f"मदद की माँग मिली। नज़दीकी शिविर: {camp['camp_hi']}, लगभग {camp['km']} किमी (पैदल {camp['walk_min']} मिनट, अनुमान)। पानी में न उतरें, ऊँची जगह पर रहें। सूखा रास्ता सजीव नक़्शे पर है।", "en": f"Your call for help is in. Nearest camp: {camp['camp_en']}, about {camp['km']} km ({camp['walk_min']} min on foot, an estimate). Don't walk into water; stay on high ground. The dry route is on the live map."})
    return {"camp": camp}


def _wait(h: dict, kind: str, token: str, timeout_s: int, roles: list[str]) -> str:
    wait_id = ids.short_id()
    db.put_wait(wait_id, {"token": token, "incident": h["id"], "kind": kind, "channel": config.CHANNEL, "roles": roles, "created": clock.iso(), "demo": False}, ttl_epoch=clock.epoch() + timeout_s + 86400)
    db.update_incident(h["id"], wait=wait_id, wait_kind=kind)
    return wait_id


def ask_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    timeout_s = int(event["timeout"])
    team = core.nearest_free(h["lat"], h["lon"], h.get("tried", []))
    if not team:
        raise incident_page.NoRoster("no relief team left to ask")
    wait_id = _wait(h, "help_ask", event["taskToken"], timeout_s, [team["id"]])
    db.update_incident(h["id"], status="paged", tried=h.get("tried", []) + [team["id"]], paged_team=team["id"])
    mins = max(1, round(timeout_s / 60))
    db.event(h["id"], "paged", f"{team['name_hi']} से पूछा (लगभग {team['minutes']} मिनट दूर), {mins} मिनट में जवाब", f"Asked the {team['name_en']} (about {team['minutes']} min away), {mins} min to answer", actor="clock", team=team["id"], wait=wait_id, deadline_s=timeout_s)
    msg = {
        "hi": f"मदद: {h['village']} के पास {h['people']} लोग" + (f", {h['elderly']} बुज़ुर्ग" if h.get("elderly") else "") + (f", {h['children']} बच्चे" if h.get("children") else "") + f"। लगभग {team['minutes']} मिनट दूर। जा सकते हैं?",
        "en": f"Help: {h['people']} people near {h['village']}. About {team['minutes']} min away. Can you go?",
    }
    send_buttons(config.CHANNEL, _team_to(team, config.CHANNEL), msg, [{"id": f"a:{wait_id}:claim", "hi": "मैं जा रहा हूँ", "en": "I'm going"}], incident_id=h["id"])
    return {"wait": wait_id}


def onsite_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    timeout_s = int(event["timeout"])
    claim = event.get("claim") or {}
    teams = list(dict.fromkeys((h.get("teams") or []) + ([claim["role"]] if claim.get("role") else [])))
    wait_id = _wait(h, "help_onsite", event["taskToken"], timeout_s, teams)
    first = not h.get("claimed")
    fields = {"teams": teams, "team": h.get("team") or (teams[0] if teams else None), "deadline": clock.after(timeout_s)}
    if first:
        fields.update(status="claimed", claimed=clock.iso())
        for t in teams:
            core.set_team(t, status="on_the_way", help_id=h["id"])
    db.update_incident(h["id"], **fields)
    mins = max(1, round(timeout_s / 60))
    db.event(h["id"], "await_onsite", f"{mins} मिनट में पहुँचना है (200 मी. के घेरे में)", f"{mins} minutes to reach the family (inside the 200 m geofence)", actor="clock", teams=teams, wait=wait_id, deadline_s=timeout_s)
    rows = core.team_rows()
    for t in teams:
        send_buttons(config.CHANNEL, _team_to(rows[t], config.CHANNEL), {"hi": f"{h['village']}: पहुँचें तो बताएँ ({mins} मिनट)।", "en": f"{h['village']}: tell us when you're there ({mins} min)."}, [{"id": f"a:{wait_id}:arrived", "hi": "पहुँच गए", "en": "We're here"}, {"id": f"a:{wait_id}:rescued", "hi": "सुरक्षित", "en": "Safe"}], incident_id=h["id"])
    if first and teams:
        eta = core.minutes_to(rows[teams[0]], h["lat"], h["lon"], core.positions())
        _family(h, {"hi": f"{rows[teams[0]]['name_hi']} आ रही है, लगभग {eta} मिनट में।", "en": f"The {rows[teams[0]]['name_en']} is coming, in about {eta} minutes."})
    return {"wait": wait_id}


def safe_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    timeout_s = int(event["timeout"])
    wait_id = _wait(h, "help_safe", event["taskToken"], timeout_s, h.get("teams") or [])
    db.update_incident(h["id"], status="arrived", arrived=clock.iso())
    for t in h.get("teams") or []:
        core.set_team(t, status="on_site", help_id=h["id"])
    db.event(h["id"], "arrived", "टीम पहुँची", "The team is there", actor=(event.get("arrival") or {}).get("role", "team"), wait=wait_id)
    rows = core.team_rows()
    for t in h.get("teams") or []:
        send_buttons(config.CHANNEL, _team_to(rows[t], config.CHANNEL), {"hi": "परिवार सुरक्षित हो जाए तो बताएँ।", "en": "Tell us when the family is safe."}, [{"id": f"a:{wait_id}:rescued", "hi": "सुरक्षित", "en": "Safe"}], incident_id=h["id"])
    return {"wait": wait_id}


def district_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    db.update_incident(h["id"], climbs=int(h.get("climbs", 0)) + 1)
    db.event(h["id"], "climb", "किसी टीम ने जवाब नहीं दिया: ज़िला नियंत्रण कक्ष को ख़बर, अगली टीम से पूछ रहे हैं", "No team answered: the district control room is told, and the next team is asked", actor="clock", reason=(event.get("previous") or {}).get("Error", "States.Timeout"))
    send_text(config.CHANNEL, {"role": "district_control_room", "name": "District control room", "ssm": "/bp/roster/district"}, {"hi": f"मदद {h['id']} ({h['village']}, {h['people']} लोग): कोई टीम नहीं मिली।", "en": f"Help {h['id']} ({h['village']}, {h['people']} people): no team has answered."}, incident_id=h["id"])
    return {}


def next_step(event: dict) -> dict:
    """The team is late: ask the next nearest team too. The late team keeps going; whoever arrives first counts."""
    h = db.get_incident(event["help"]["id"])
    team = core.nearest_free(h["lat"], h["lon"], (h.get("tried") or []) + (h.get("teams") or []))
    db.update_incident(h["id"], climbs=int(h.get("climbs", 0)) + 1)
    if not team:
        db.event(h["id"], "climb", "टीम देर से; और कोई टीम नहीं बची, ज़िले को ख़बर", "The team is late; no other team is left, the district is told", actor="clock")
        return {"team": None}
    db.update_incident(h["id"], teams=(h.get("teams") or []) + [team["id"]], tried=(h.get("tried") or []) + [team["id"]])
    core.set_team(team["id"], status="on_the_way", help_id=h["id"])
    db.event(h["id"], "climb", f"टीम देर से: {team['name_hi']} भी भेजी (लगभग {team['minutes']} मिनट), ज़िले को ख़बर", f"The team is late: the {team['name_en']} is sent too (about {team['minutes']} min); the district is told", actor="clock", team=team["id"])
    send_text(config.CHANNEL, _team_to(team, config.CHANNEL), {"hi": f"मदद: {h['village']} के पास {h['people']} लोग। पहली टीम देर से है, आप भी जाएँ।", "en": f"Help: {h['people']} people near {h['village']}. The first team is late; please go too."}, incident_id=h["id"])
    return {"team": team["id"]}


def close_step(event: dict) -> dict:
    h = db.get_incident(event["help"]["id"])
    outcome = event.get("outcome", "rescued")
    status = "rescued" if outcome == "rescued" else f"closed_{outcome}"
    db.update_incident(h["id"], status=status, rescued=clock.iso() if outcome == "rescued" else None)
    for t in h.get("teams") or []:
        core.set_team(t, status="free", help_id=None)
    try:
        core.location().batch_delete_geofence(CollectionName=core.COLLECTION, GeofenceIds=[h["id"]])
    except Exception as e:  # noqa: BLE001
        print({"geofence": "not removed", "error": repr(e)})
    if outcome == "rescued":
        db.event(h["id"], "rescued", "परिवार सुरक्षित", "The family is safe", actor="team")
        _family(h, {"hi": "आप सुरक्षित हैं। शिविर में खाना और पानी मिलेगा।", "en": "You are safe. The camp has food and water."})
    else:
        db.event(h["id"], "closed", "ज़िले के पास", "With the district", actor="system", outcome=outcome)
    return {"status": status}


STEPS = {"open": open_step, "ask": ask_step, "onsite": onsite_step, "safe": safe_step, "district": district_step, "next": next_step, "close": close_step}


def handler(event: dict, _ctx=None) -> dict:
    return STEPS[event["step"]](event)
