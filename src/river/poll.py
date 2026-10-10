"""GloFAS modelled discharge for the river panel, from the Open-Meteo Flood API (daily).

The fallback when no official reading is fresh: GLOFAS#<cell>/<date>, a model, labelled as
one on the page. It never feeds the priority rules or a warning.
"""

from __future__ import annotations

import json
import urllib.parse

from common import clock, db
from gov import sachet

LAT, LON = 25.975, 85.025  # the Gandak cell near Haijalpur (docs/SPEC.md, "Seed data")
CELL = f"{LAT}N {LON}E"
URL = "https://flood-api.open-meteo.com/v1/flood?" + urllib.parse.urlencode(
    {"latitude": LAT, "longitude": LON, "daily": "river_discharge", "past_days": 30, "forecast_days": 7}
)


def parse(doc: dict) -> list[dict]:
    """{"daily": {"time": [...], "river_discharge": [...]}} -> [{date, q}], skipping nulls."""
    d = doc.get("daily") or {}
    return [{"date": t, "q": q} for t, q in zip(d.get("time", []), d.get("river_discharge", [])) if q is not None]


def poll(get=sachet.fetch) -> dict:
    rows = parse(json.loads(get(URL)))
    today = clock.now().strftime("%Y-%m-%d")
    with db.table().batch_writer() as b:
        for r in rows:
            b.put_item(Item=db.clean({"PK": f"GLOFAS#{CELL}", "SK": r["date"], "q": r["q"], "forecast": r["date"] > today, "fetched": clock.iso(), "ttl": clock.epoch() + 60 * 86400}))
    return {"days": len(rows)}


def handler(_event=None, _ctx=None) -> dict:
    try:
        return poll()
    except Exception as e:  # keep yesterday's series
        print({"glofas": "fetch failed, keeping the last series", "error": repr(e)})
        return {"error": repr(e)}
