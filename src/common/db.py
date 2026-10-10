"""The one DynamoDB table, "bp", and the keys in docs/SPEC.md.

Every write that tells the story of an incident goes through ``event()``, which writes
INC#<id> / EV#<time>#<kind>. The page and the replay read those rows back in order.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from common import clock, config

_table = None


def table():
    global _table
    if _table is None:
        _table = boto3.resource("dynamodb").Table(config.TABLE_NAME)
    return _table


def set_table(t) -> None:
    """Tests hand in a fake table."""
    global _table
    _table = t


def clean(v: Any) -> Any:
    """Floats become Decimals on the way in; DynamoDB refuses floats."""
    return json.loads(json.dumps(v), parse_float=Decimal)


def plain(v: Any) -> Any:
    """Decimals become ints or floats on the way out, for JSON."""
    if isinstance(v, list):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    return v


# ---------------- incidents ----------------


def inc_pk(incident_id: str) -> str:
    """INC#<id> for an incident; HELP#<id> for a family's call for help, which has the same META/EV# shape."""
    return f"HELP#{incident_id}" if incident_id.startswith("HELP-") else f"INC#{incident_id}"


def _status_key(record_id: str, status: str) -> str:
    """gsi1: STATUS#open|closed for incidents (the control room), HELPSTATUS#open|closed for help."""
    closed = str(status).startswith("closed") or status == "rescued"
    return f"{'HELPSTATUS' if record_id.startswith('HELP-') else 'STATUS'}#{'closed' if closed else 'open'}"


def get_incident(incident_id: str) -> dict | None:
    item = table().get_item(Key={"PK": inc_pk(incident_id), "SK": "META"}).get("Item")
    return plain(item) if item else None


def put_incident(inc: dict) -> None:
    item = {
        "PK": inc_pk(inc["id"]),
        "SK": "META",
        **inc,
        # The control room's index: open incidents by priority, oldest first.
        "gsi1pk": _status_key(inc["id"], inc.get("status", "open")),
        "gsi1sk": f"{inc.get('priority', 'P3')}#{inc.get('opened', clock.iso())}",
    }
    table().put_item(Item=clean(item))


def update_incident(incident_id: str, **fields: Any) -> None:
    if not fields:
        return
    if "status" in fields:
        fields["gsi1pk"] = _status_key(incident_id, fields["status"])
    names = {f"#{k}": k for k in fields}
    values = {f":{k}": v for k, v in clean(fields).items()}
    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
    table().update_item(
        Key={"PK": inc_pk(incident_id), "SK": "META"},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def event(incident_id: str, kind: str, text_hi: str, text_en: str, actor: str = "system", **fields: Any) -> dict:
    """One line of the incident's timeline. Returns the event as written."""
    t = clock.now()
    at = clock.iso(t)
    ev = {"at": at, "kind": kind, "actor": actor, "text_hi": text_hi, "text_en": text_en, **fields}
    # The microsecond tail keeps two events in the same second in the order they were written.
    sk = f"EV#{at}#{t.strftime('%f')}#{kind}"
    table().put_item(Item=clean({"PK": inc_pk(incident_id), "SK": sk, **ev}))
    return ev


def timeline(incident_id: str) -> list[dict]:
    items: list[dict] = []
    kwargs: dict[str, Any] = {"KeyConditionExpression": Key("PK").eq(inc_pk(incident_id)) & Key("SK").begins_with("EV#")}
    while True:
        res = table().query(**kwargs)
        items.extend(res.get("Items", []))
        if "LastEvaluatedKey" not in res:
            break
        kwargs["ExclusiveStartKey"] = res["LastEvaluatedKey"]
    return [{k: v for k, v in plain(i).items() if k not in ("PK", "SK")} for i in items]


def open_incidents(limit: int = 50, key: str = "STATUS#open") -> list[dict]:
    res = table().query(
        IndexName="gsi1",
        KeyConditionExpression=Key("gsi1pk").eq(key),
        Limit=limit,
    )
    return [plain(i) for i in res.get("Items", [])]


# ---------------- waits: a task token behind a short ID ----------------


def put_wait(wait_id: str, item: dict, ttl_epoch: int) -> None:
    table().put_item(
        Item=clean({"PK": f"WAIT#{wait_id}", "SK": "META", "ttl": ttl_epoch, **item}),
        ConditionExpression="attribute_not_exists(PK)",
    )


def get_wait(wait_id: str) -> dict | None:
    item = table().get_item(Key={"PK": f"WAIT#{wait_id}", "SK": "META"}).get("Item")
    return plain(item) if item else None


def decline_wait(wait_id: str, role: str) -> set | None:
    """Adds a role to the wait's "declined" set. Returns the set, or None if the wait is gone."""
    try:
        res = table().update_item(
            Key={"PK": f"WAIT#{wait_id}", "SK": "META"},
            UpdateExpression="ADD declined :r",
            ConditionExpression="attribute_exists(PK)",
            ExpressionAttributeValues={":r": {role}},
            ReturnValues="ALL_NEW",
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return None
        raise
    return set(res["Attributes"].get("declined", set()))


def take_wait(wait_id: str) -> dict | None:
    """Removes the wait and returns it, once. A second tap on the same button gets None."""
    try:
        res = table().delete_item(
            Key={"PK": f"WAIT#{wait_id}", "SK": "META"},
            ConditionExpression="attribute_exists(PK)",
            ReturnValues="ALL_OLD",
        )
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return None
        raise
    item = res.get("Attributes")
    return plain(item) if item else None


# ---------------- segments ----------------


def get_segment(km: int) -> dict | None:
    item = table().get_item(Key={"PK": f"SEG#{int(km)}", "SK": "META"}).get("Item")
    return plain(item) if item else None


# ---------------- the river ----------------
# GAUGE#<site> holds readings under their ISO time (SK "2026-...") and, beside them, pointers
# to the CWC alerts that name the gauge (SK "ALERT#<identifier>").


def latest_readings(site: str, n: int = 2) -> list[dict]:
    res = table().query(
        KeyConditionExpression=Key("PK").eq(f"GAUGE#{site}") & Key("SK").between("2000", "2999"),
        ScanIndexForward=False,
        Limit=n,
    )
    return [plain(i) for i in res.get("Items", [])]


def active_alerts(site: str) -> list[dict]:
    res = table().query(KeyConditionExpression=Key("PK").eq(f"GAUGE#{site}") & Key("SK").begins_with("ALERT#"))
    now = clock.iso()
    return [plain(i) for i in res.get("Items", []) if not i.get("expires") or clock.parse(i["expires"]) > clock.parse(now)]
