"""Load the stretch, the roster and the demo allowlist into the table "bp".

    python scripts/seed.py            # writes SEG#, ROSTER#, SUB#<village>/ROLE#, ALLOW#
    python scripts/seed.py --dry-run  # prints what it would write

Phone numbers never come from git: the roster names SSM parameters (/bp/roster/je ...),
and this script reads them only to store their sha256 as ALLOW#<hash>, the list of numbers
that may ever get a page or a warning this weekend. Run it again after changing a number.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parent.parent
KMS = range(1, 21)  # about 20 km, cut into 1 km segments (our marks, not the department's chainage)
GAUGE = "Rewaghat"  # nearest official gauge to Haijalpur (docs/SPEC.md)


def phone_hash(phone: str) -> str:
    return hashlib.sha256(re.sub(r"\D", "", phone).encode()).hexdigest()


def stretch() -> dict:
    """The page's stretch file: villages with the kilometres they sit behind, and their camps (sample)."""
    return json.loads((ROOT / "web" / "mock" / "stretch.json").read_text(encoding="utf-8"))


def items(region: str, with_allowlist: bool = True) -> list[dict]:
    roster = json.loads((ROOT / "data" / "roster.json").read_text(encoding="utf-8"))
    st = stretch()
    segs = {s["km"]: s for s in st["segments"]}
    out: list[dict] = []
    for km in KMS:
        behind = [v for v in st["villages"] if v.get("behind_km") and v["behind_km"][0] <= km <= v["behind_km"][1]]
        seg = segs.get(km, {})
        meta = {
            "PK": f"SEG#{km}",
            "SK": "META",
            "km": km,
            "villages": [v["name"] for v in behind],
            "gauge": seg.get("gauge", GAUGE),
            "breach_last_5y": bool(seg.get("breach_last_5y")),
            "vulnerable": bool(seg.get("vulnerable")),
            "sample": True,
        }
        if behind and behind[0].get("relief_camp_hi"):
            meta["camp_hi"], meta["camp_en"] = behind[0]["relief_camp_hi"], behind[0]["relief_camp_en"]
        out.append(meta)
        for n, r in enumerate(roster["roles"], start=1):
            out.append({"PK": f"SEG#{km}", "SK": f"ROSTER#{n}", "level": r["level"], "role": r["role"], "name": r["name"], "ssm": r["ssm"]})
    for m in roster.get("mukhiyas", []):
        out.append({"PK": f"SUB#{m['village']}", "SK": "ROLE#mukhiya", "role": "mukhiya", "name": m["name"], "ssm": m["ssm"]})
    if with_allowlist:
        ssm = boto3.client("ssm", region_name=region)
        names = [r["ssm"] for r in roster["roles"]] + [m["ssm"] for m in roster.get("mukhiyas", [])]
        for name in names:
            try:
                phone = ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
            except ssm.exceptions.ParameterNotFound:
                print(f"  (no {name} in SSM yet: that role gets nothing)")
                continue
            out.append({"PK": f"ALLOW#{phone_hash(phone)}", "SK": "META", "why": "demo roster"})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="bp")
    ap.add_argument("--region", default="ap-south-1")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    rows = items(a.region, with_allowlist=not a.dry_run)
    if a.dry_run:
        for r in rows:
            print(r["PK"], r["SK"])
        return
    table = boto3.resource("dynamodb", region_name=a.region).Table(a.table)
    with table.batch_writer() as b:
        for r in rows:
            b.put_item(Item=r)
    print(f"wrote {len(rows)} rows to {a.table}")


if __name__ == "__main__":
    main()
