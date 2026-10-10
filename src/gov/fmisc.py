"""The department's gauges in (docs/SPEC.md, "Government adapters"), every three hours.

FMISC's ArcGIS MapServer layer 1 (CWC gauges) and layer 0 (the department's own), Gandak
stations only. Not an official API: one request per layer per run, a polite User-Agent, and
the last good reading is kept when it fails. WL of -4 means no reading and is skipped.
"""

from __future__ import annotations

import json
import urllib.parse
from datetime import datetime, timezone

from common import clock
from gov import sachet

BASE = "https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer/{layer}/query"
LAYERS = {1: "CWC_own", 0: "wrd_own"}  # layer -> field prefix
NO_READING = -4


def url(layer: int) -> str:
    prefix = LAYERS[layer]
    q = {"where": f"{prefix}.RIVER LIKE '%andak%'", "outFields": "*", "returnGeometry": "false", "f": "json"}
    return BASE.format(layer=layer) + "?" + urllib.parse.urlencode(q)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse(doc: dict, layer: int) -> list[dict]:
    """ArcGIS query JSON -> readings. Field names carry the layer's prefix."""
    prefix = LAYERS[layer]
    out = []
    for f in doc.get("features", []):
        a = {k.split(".", 1)[-1]: v for k, v in (f.get("attributes") or {}).items()}
        wl, dl = _num(a.get("WL")), _num(a.get("DL"))
        site = str(a.get("SITE_NAME") or "").strip().title()
        if not site or wl is None or wl == NO_READING or dl is None or not a.get("DATE_"):
            continue
        when = datetime.fromtimestamp(int(a["DATE_"]) / 1000, tz=timezone.utc)
        trend = str(a.get("TREND") or "").strip().lower()
        out.append(
            {
                "site": site,
                "river": str(a.get("RIVER") or "").strip().title(),
                "district": str(a.get("DIST_NAME") or "").strip().title(),
                "wl": wl,
                "dl": dl,
                "trend": "rising" if trend.startswith("ris") else "falling" if trend.startswith("fal") else "steady",
                "time": clock.iso(when),
                "source": "FMISC (WRD Bihar)" + (", CWC gauge" if prefix == "CWC_own" else ""),
            }
        )
    return out


def poll(get=sachet.fetch) -> dict:
    n = 0
    for layer in LAYERS:
        try:
            doc = json.loads(get(url(layer)))
        except Exception as e:  # keep the last good reading
            print({"fmisc": f"layer {layer} failed", "error": repr(e)})
            continue
        for r in parse(doc, layer):
            sachet.store_reading(r, "https://fmiscwrdbihar.gov.in/")
            n += 1
    return {"readings": n}


def handler(_event=None, _ctx=None) -> dict:
    return poll()
