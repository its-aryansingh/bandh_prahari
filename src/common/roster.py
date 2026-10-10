"""Who is asked at each level of the answer clock.

The real roster lives in DynamoDB (SEG#<km> / ROSTER#<n>, loaded by scripts/seed.py from
data/roster.json) and holds names and SSM parameter names, never phone numbers: the
channel reads the number from SSM at send time. The demo roster is the phones drawn on
the public page: fictional names, no numbers, channel "screen".
"""

from __future__ import annotations

from boto3.dynamodb.conditions import Key

from common import db

# level -> roles paged at that level (level 4 pages two)
LEVELS: dict[int, list[str]] = {
    0: ["patrol"],
    1: ["junior_engineer"],
    2: ["assistant_engineer"],
    3: ["executive_engineer"],
    4: ["flood_fighting_force", "district_control_room"],
    5: ["central_flood_control_room"],
}

ROLE_NAMES: dict[str, tuple[str, str]] = {
    "junior_engineer": ("जेई", "Junior engineer"),
    "assistant_engineer": ("एई", "Assistant engineer"),
    "executive_engineer": ("ईई", "Executive engineer"),
    "flood_fighting_force": ("बाढ़ बल", "Flood-fighting force"),
    "district_control_room": ("ज़िला नियंत्रण कक्ष", "District control room"),
    "central_flood_control_room": ("केंद्रीय बाढ़ नियंत्रण कक्ष", "Central Flood Control Room"),
    "mukhiya": ("मुखिया", "Mukhiya"),
    "ward_member": ("वार्ड सदस्य", "Ward member"),
    "patrol": ("प्रहरी", "Patrol worker"),
}

# The phones drawn on the page. No numbers: these people exist only on screen.
DEMO = {
    "junior_engineer": {"name": "JE (demo)"},
    "assistant_engineer": {"name": "AE (demo)"},
    "executive_engineer": {"name": "EE (demo)"},
    "flood_fighting_force": {"name": "Zone flood-fighting force (demo)"},
    "district_control_room": {"name": "District control room (demo)"},
    "central_flood_control_room": {"name": "Central Flood Control Room (demo)"},
    "mukhiya": {"name": "Mukhiya, Haijalpur (demo)"},
    "ward_member": {"name": "Ward 7 member, Haijalpur (demo)"},
    "patrol": {"name": "Patrol worker (demo)"},
}


def role_hi(role: str) -> str:
    return ROLE_NAMES.get(role, (role, role))[0]


def role_en(role: str) -> str:
    return ROLE_NAMES.get(role, (role, role))[1]


def people(km: int, level: int, channel: str, inc: dict | None = None) -> list[dict]:
    """The people to ask at a level: [{role, name, ssm?}]. A TEST run asks its sender at every level."""
    roles = LEVELS[level]
    if inc and inc.get("test_to"):
        return [{"role": r, "name": f"{role_en(r)} (TEST)", "phone": inc["test_to"]} for r in roles]
    if channel == "screen":
        return [{"role": r, "name": DEMO[r]["name"]} for r in roles]
    res = db.table().query(KeyConditionExpression=Key("PK").eq(f"SEG#{int(km)}") & Key("SK").begins_with("ROSTER#"))
    found = [db.plain(i) for i in res.get("Items", [])]
    return [{"role": i["role"], "name": i.get("name", role_en(i["role"])), "ssm": i.get("ssm")} for i in found if i.get("role") in roles]


def person(km: int, role: str, level: int, channel: str, inc: dict | None = None) -> dict:
    """The one person who answered (by role), for the messages that follow their answer."""
    for p in people(km, level, channel, inc):
        if p["role"] == role:
            return p
    return {"role": role, "name": DEMO.get(role, {}).get("name", "") if channel == "screen" else role_en(role)}


def village_contacts(villages: list[str], channel: str, inc: dict | None = None) -> list[dict]:
    """Mukhiya and ward members behind the stretch. Demo: the drawn phones. TEST: the sender."""
    if inc and inc.get("test_to"):
        return [{"role": "mukhiya", "name": "Mukhiya (TEST)", "phone": inc["test_to"]}]
    if channel == "screen":
        return [{"role": "mukhiya", "name": DEMO["mukhiya"]["name"]}, {"role": "ward_member", "name": DEMO["ward_member"]["name"]}]
    out: list[dict] = []
    for v in villages:
        # SUB#<village> / ROLE#<role>: the mukhiya and ward members, by SSM parameter name
        res = db.table().query(KeyConditionExpression=Key("PK").eq(f"SUB#{v}") & Key("SK").begins_with("ROLE#"))
        out.extend({"role": i.get("role", "mukhiya"), "name": i.get("name", ""), "ssm": i.get("ssm"), "village": v} for i in map(db.plain, res.get("Items", [])))
    return out


def allowed(phone_hash: str) -> bool:
    """Only numbers on the demo roster ever get a warning or a page this weekend (ALLOW#<sha256>)."""
    return "Item" in db.table().get_item(Key={"PK": f"ALLOW#{phone_hash}", "SK": "META"})


def roles_of(phone_hash: str) -> list[str]:
    """The roles a demo-roster number plays (scripts/seed.py writes them); [] if not on the roster."""
    item = db.table().get_item(Key={"PK": f"ALLOW#{phone_hash}", "SK": "META"}).get("Item")
    return list(item.get("roles", [])) if item else []
