"""The SNS intake: End User Messaging Social publishes every WhatsApp message and status here.

It must return fast. It deduplicates on the WhatsApp message ID (the same message can arrive
twice), writes delivery receipts straight into the timeline (two DynamoDB writes), and hands
every message to the worker asynchronously (Lambda InvocationType "Event"). Nothing slow runs
here: no Transcribe, no Bedrock, no Polly.
"""

from __future__ import annotations

import json
import os

import boto3
from botocore.exceptions import ClientError

from common import clock, config, db
from incident import delivery
from intake import parse

_lambda = None
# Set CAPTURE=on for a few minutes to log raw events for tests/fixtures/ (docs/DEPLOY.md).
CAPTURE = os.environ.get("CAPTURE", "off") == "on"


def lam():
    global _lambda
    if _lambda is None:
        _lambda = boto3.client("lambda")
    return _lambda


def first_time(key: str) -> bool:
    """DEDUP#<key>: True the first time we see it."""
    try:
        db.table().put_item(
            Item={"PK": f"DEDUP#{key}", "SK": "META", "ttl": clock.epoch() + 2 * 86400},
            ConditionExpression="attribute_not_exists(PK)",
        )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def handler(event: dict, _ctx=None) -> dict:
    if CAPTURE:
        for r in event.get("Records", []):
            print(json.dumps({"capture": (r.get("Sns") or {}).get("Message")}))
    handed = statuses = dupes = 0
    for item in parse.sns_event(event):
        if item["kind"] == "status":
            if not first_time(f"{item['id']}#{item['status']}"):
                dupes += 1
                continue
            delivery.on_status(item)
            statuses += 1
        elif item.get("id"):
            if not first_time(item["id"]):
                dupes += 1
                continue
            item["channel"] = "whatsapp"
            lam().invoke(FunctionName=config.WORKER_FUNCTION, InvocationType="Event", Payload=json.dumps(item).encode())
            handed += 1
    return {"handed": handed, "statuses": statuses, "duplicates": dupes}
