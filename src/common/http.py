"""Small helpers for API Gateway HTTP API (payload format 2.0) handlers."""

from __future__ import annotations

import base64
import hmac
import json
import time
from typing import Any

import boto3

_ssm = None
_cache: dict[str, tuple[float, str]] = {}


def respond(status: int, body: Any, headers: dict | None = None) -> dict:
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json; charset=utf-8", "cache-control": "no-store", **(headers or {})},
        "body": json.dumps(body, ensure_ascii=False, default=str),
    }


def body(event: dict) -> dict:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode()
    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def route(event: dict) -> str:
    """"GET /incidents/{id}/timeline" style key."""
    return event.get("routeKey", "")


def path(event: dict, name: str) -> str:
    return (event.get("pathParameters") or {}).get(name, "")


def query(event: dict, name: str, default: str = "") -> str:
    return (event.get("queryStringParameters") or {}).get(name, default)


def secret(name: str, ttl_s: int = 300) -> str:
    """An SSM SecureString, cached for a few minutes. Tokens and numbers never live in code."""
    global _ssm
    hit = _cache.get(name)
    if hit and hit[0] > time.time():
        return hit[1]
    if _ssm is None:
        _ssm = boto3.client("ssm")
    try:
        value = _ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    except _ssm.exceptions.ParameterNotFound:
        value = ""
    _cache[name] = (time.time() + ttl_s, value)
    return value


def has_token(event: dict, param: str) -> bool:
    """True if the request's bearer token matches the SSM parameter. An unset parameter matches nothing."""
    expected = secret(param)
    auth = (event.get("headers") or {}).get("authorization", "")
    given = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    return bool(expected) and bool(given) and hmac.compare_digest(given.encode(), expected.encode())
