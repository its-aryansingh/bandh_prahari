"""SACHET's Bihar feed in (docs/SPEC.md, "Government adapters").

Every 15 minutes: read the RSS, fetch the CAP 1.2 alert behind each new item, keep the CWC
flood alerts for the gauges near our stretch as ALERT#<identifier> (deduplicated on the
identifier), and turn the reading in each alert's description into GAUGE#<site>/<time>.
A failed fetch changes nothing: the last good reading stays. Read only, and gently.
"""

from __future__ import annotations

import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

from botocore.exceptions import ClientError

from common import clock, db

RSS_URL = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml"
CAP_NS = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
UA = "BaandhPrahari/0.1 (student project; reads the public feed every 15 minutes)"

# Gauges whose alerts matter to the Haijalpur stretch: site -> (river, Hindi name, stretch)
SITES = {
    "Dumariaghat": ("Gandak", "डुमरियाघाट", "gandak-rb-haijalpur"),
    "Rewaghat": ("Gandak", "रेवाघाट", "gandak-rb-haijalpur"),
}

READING = re.compile(
    r"flowing at a level of (?P<wl>[\d.]+) m with (?P<trend>\w+) trend.*?"
    r"(?P<diff>[\d.]+) m (?P<side>above|below) its Danger Level of (?P<dl>[\d.]+) m"
    r"(?:.*?previous HFL of (?P<hfl>[\d.]+) m \((?P<hfl_date>[\d/]+)\))?",
    re.S,
)
AT_TIME = re.compile(r"[Aa]t (\d{1,2}):(\d{2}) ([ap]m)")


def fetch(url: str, timeout: int = 15) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (fixed https URLs)
        return r.read()


def parse_rss(xml: bytes) -> list[dict]:
    """Items of SACHET's RSS 2.0 feed."""
    root = ET.fromstring(xml)
    out = []
    for it in root.iter("item"):
        author = it.findtext("author") or ""
        m = re.search(r"\(([^)]+)\)", author)
        pub = it.findtext("pubDate")
        out.append(
            {
                "identifier": (it.findtext("guid") or "").strip(),
                "title": (it.findtext("title") or "").strip(),
                "category": it.findtext("category") or "",
                "link": (it.findtext("link") or "").strip(),
                "sender": m.group(1) if m else author,
                "published": clock.iso(parsedate_to_datetime(pub)) if pub else "",
            }
        )
    return out


def _t(el, path: str) -> str:
    return (el.findtext(path, default="", namespaces=CAP_NS) or "").strip()


def parse_cap(xml: bytes) -> dict:
    """The fields of a CAP 1.2 alert we keep (first info block)."""
    root = ET.fromstring(xml)
    info = root.find("cap:info", CAP_NS)
    area = info.find("cap:area", CAP_NS) if info is not None else None
    return {
        "cap_identifier": _t(root, "cap:identifier"),
        "sender": _t(root, "cap:sender"),
        "sent": _t(root, "cap:sent"),
        "status": _t(root, "cap:status"),
        "event": _t(info, "cap:event") if info is not None else "",
        "severity": _t(info, "cap:severity") if info is not None else "",
        "urgency": _t(info, "cap:urgency") if info is not None else "",
        "certainty": _t(info, "cap:certainty") if info is not None else "",
        "headline": _t(info, "cap:headline") if info is not None else "",
        "description": _t(info, "cap:description") if info is not None else "",
        "effective": _t(info, "cap:effective") if info is not None else "",
        "expires": _t(info, "cap:expires") if info is not None else "",
        "area": _t(area, "cap:areaDesc") if area is not None else "",
    }


def site_of(text: str) -> str | None:
    """'River Gandak at Dumariaghat ...' -> 'Dumariaghat' when it is one of our gauges."""
    for site, (river, _, _) in SITES.items():
        if re.search(rf"\b{river}\b.*\b{site}\b", text, re.I | re.S):
            return site
    return None


def reading(alert: dict) -> dict | None:
    """The gauge reading in a CWC alert's description, if it has one."""
    m = READING.search(alert.get("description", ""))
    site = site_of(alert.get("headline", "") + " " + alert.get("area", ""))
    if not m or not site:
        return None
    wl, dl = float(m["wl"]), float(m["dl"])
    when = alert.get("effective") or alert.get("sent")
    t = AT_TIME.search(alert.get("description", ""))
    if t and when:
        # "At 6:00 am" on the alert's effective date
        d = clock.parse(when)
        hh = int(t.group(1)) % 12 + (12 if t.group(3) == "pm" else 0)
        when = clock.iso(d.replace(hour=hh, minute=int(t.group(2)), second=0, microsecond=0))
    r = {
        "site": site,
        "river": SITES[site][0],
        "wl": wl,
        "dl": dl,
        "trend": {"rising": "rising", "falling": "falling"}.get(m["trend"].lower(), "steady"),
        "time": when,
        "source": "CWC via SACHET",
    }
    if m["hfl"]:
        r["hfl"] = float(m["hfl"])
        dd, mm, yy = m["hfl_date"].split("/")
        r["hfl_date"] = f"{yy}-{mm}-{dd}"
    return r


def store_alert(item: dict, alert: dict) -> bool:
    """ALERT#<identifier>, once. Returns False if we already had it."""
    try:
        db.table().put_item(
            Item=db.clean(
                {
                    "PK": f"ALERT#{item['identifier']}",
                    "SK": "META",
                    **alert,
                    "identifier": item["identifier"],
                    "link": item["link"],
                    "site": site_of(alert["headline"] + " " + alert["area"]) or "",
                    "ttl": clock.epoch() + 30 * 86400,
                }
            ),
            ConditionExpression="attribute_not_exists(PK)",
        )
        site = site_of(alert["headline"] + " " + alert["area"])
        if site:
            # a pointer beside the gauge's readings, so "Nadi ka haal" finds the alert in one query
            db.table().put_item(
                Item={"PK": f"GAUGE#{site}", "SK": f"ALERT#{item['identifier']}", "expires": alert["expires"], "headline": alert["headline"], "severity": alert["severity"], "ttl": clock.epoch() + 30 * 86400}
            )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def store_reading(r: dict, url: str) -> None:
    """GAUGE#<site>/<time>; the same reading twice is one row."""
    db.table().put_item(
        Item=db.clean({"PK": f"GAUGE#{r['site']}", "SK": r["time"], **r, "source_url": url, "ttl": clock.epoch() + 120 * 86400})
    )


def poll(get=None) -> dict:
    """One pass over the feed. `get` is swapped in tests."""
    get = get or fetch
    items = parse_rss(get(RSS_URL))
    new = readings = 0
    for item in items:
        if item["sender"] != "CWC" or not item["identifier"] or not site_of(item["title"]):
            continue
        if db.table().get_item(Key={"PK": f"ALERT#{item['identifier']}", "SK": "META"}).get("Item"):
            continue  # seen it: no second fetch
        try:
            alert = parse_cap(get(item["link"]))
        except Exception:  # one bad alert never stops the rest
            continue
        if store_alert(item, alert):
            new += 1
            r = reading(alert)
            if r:
                store_reading(r, item["link"])
                readings += 1
    return {"items": len(items), "new_alerts": new, "readings": readings}


def handler(_event=None, _ctx=None) -> dict:
    try:
        return poll()
    except Exception as e:  # the feed is down or changed: keep the last good data
        print({"sachet": "fetch failed, keeping the last good reading", "error": repr(e)})
        return {"error": repr(e)}
