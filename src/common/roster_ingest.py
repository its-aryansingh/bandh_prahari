"""Ingest department roster CSV dropped into S3 (docs/SPEC.md, "Roster (in)").

Shape:
stretch, km_from, km_to, je_name, je_ssm, ae_name, ae_ssm, ee_name, ee_ssm, force_name, force_ssm, district_name, district_ssm

Hard rule:
Phone columns hold SSM parameter names (e.g. /bp/roster/je), NEVER raw phone numbers.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any

from common import config, db

ROLES_MAP = [
    (1, "junior_engineer", "je_name", "je_ssm"),
    (2, "assistant_engineer", "ae_name", "ae_ssm"),
    (3, "executive_engineer", "ee_name", "ee_ssm"),
    (4, "flood_fighting_force", "force_name", "force_ssm"),
    (5, "district_control_room", "district_name", "district_ssm"),
]

PHONE_PATTERN = re.compile(r"(\+?91)?[6-9]\d{9}")


def validate_ssm_param(val: str, field_name: str) -> str:
    cleaned = val.strip()
    if not cleaned.startswith("/"):
        raise ValueError(f"Field '{field_name}' must be an SSM parameter path starting with '/', got: {cleaned}")
    if PHONE_PATTERN.search(cleaned):
        raise ValueError(f"Field '{field_name}' appears to contain a raw phone number! Secrets and numbers are prohibited in roster CSV.")
    return cleaned


def parse_csv(csv_text: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    items: list[dict[str, Any]] = []

    for row in reader:
        # Normalize column names: strip spaces and lower case
        r = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        km_from = int(r.get("km_from", 1))
        km_to = int(r.get("km_to", 20))

        # Validate SSM parameter columns
        validated_roles = []
        for level, role, name_col, ssm_col in ROLES_MAP:
            name_val = r.get(name_col, f"{role.replace('_', ' ').title()} (demo)")
            ssm_val = r.get(ssm_col, f"/bp/roster/{role}")
            valid_ssm = validate_ssm_param(ssm_val, ssm_col)
            validated_roles.append((level, role, name_val, valid_ssm))

        for km in range(km_from, km_to + 1):
            for level, role, name_val, ssm_val in validated_roles:
                item = {
                    "PK": f"SEG#{km}",
                    "SK": f"ROSTER#{level}",
                    "level": level,
                    "role": role,
                    "name": name_val,
                    "ssm": ssm_val,
                }
                items.append(item)

    return items


def ingest_csv(csv_text: str) -> int:
    """Parses department roster CSV and writes to DynamoDB bp table."""
    records = parse_csv(csv_text)
    tbl = db.table()
    with tbl.batch_writer() as batch:
        for it in records:
            batch.put_item(Item=it)
    return len(records)
