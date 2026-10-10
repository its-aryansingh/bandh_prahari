"""CAP 1.2 drafts out (docs/SPEC.md, "Government adapters").

One draft per village warning: status Exercise, headline starting "Demo, not a real warning",
two info blocks (hi-IN, en-IN). They are published only on our own GET /cap/rss.xml and
GET /cap/{id}.xml. Nothing is ever sent to SACHET or any government system.
"""

from __future__ import annotations

import json
from datetime import timedelta
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

from common import clock, ids, words

NS = "urn:oasis:names:tc:emergency:cap:1.2"
SENDER = "baandh-prahari.demo"
DEMO = "Demo, not a real warning"
DEMO_HI = "डेमो, असली चेतावनी नहीं"
STRETCH = json.loads((Path(__file__).resolve().parent / "stretch.json").read_text(encoding="utf-8"))

# level -> (msgType, responseType, severity, certainty)
KIND = {
    "saavdhan": ("Alert", "Monitor", "Severe", "Likely"),
    "taiyaar": ("Alert", "Prepare", "Severe", "Likely"),
    "nikal_chalo": ("Alert", "Evacuate", "Extreme", "Observed"),
    "khatra_tala": ("Update", "AllClear", "Severe", "Observed"),
}


def village_info(names: list[str]) -> list[dict]:
    known = {v["name"]: v for v in STRETCH["villages"]}
    return [known.get(n, {"name": n, "name_hi": n, "lgd_code": None, "lat": None, "lon": None}) for n in names]


def polygon(vs: list[dict], pad: float = 0.012) -> str:
    """A closed box around the villages' centres (approximate), as CAP "lat,lon" pairs."""
    pts = [(v["lat"], v["lon"]) for v in vs if v.get("lat") is not None and v.get("lon") is not None]
    if not pts:
        b = (25.905, 25.995, 85.000, 85.110)  # the stretch's box (docs/SPEC.md, "The live map")
    else:
        lats, lons = [p[0] for p in pts], [p[1] for p in pts]
        b = (min(lats) - pad, max(lats) + pad, min(lons) - pad, max(lons) + pad)
    s, n, w, e = b
    ring = [(s, w), (s, e), (n, e), (n, w), (s, w)]
    return " ".join(f"{lat:.4f},{lon:.4f}" for lat, lon in ring)


def _el(name: str, text) -> str:
    return f"<{name}>{escape(str(text))}</{name}>"


def _info(lang: str, level: str, km: int, vs: list[dict], camp: str, sent: str, expires: str) -> str:
    _, response, severity, certainty = KIND[level]
    L = words.LEVELS[level]
    hi = lang == "hi-IN"
    names = ", ".join(v["name_hi"] if hi else v["name"] for v in vs) or ("-")
    steps = "; ".join(L["steps_hi"] if hi else L["steps_en"])
    headline = f"{DEMO}: {DEMO_HI}: {L['hi']}, किमी {km}" if hi else f"{DEMO}: {L['en']}, km {km} of the Gandak right-bank embankment"
    desc = (
        f"छात्र परियोजना का अभ्यास संदेश। गंडक दायाँ तटबंध, किमी {km} (हमारे निशान)। गाँव: {names}। क्षेत्र अनुमानित है।"
        if hi
        else f"A student project's exercise message. Gandak right-bank embankment, km {km} (our marks, not the department's chainage). Villages: {names}. The area is approximate."
    )
    instruction = f"{steps}। राहत शिविर: {camp}।" if hi else f"{steps}. Relief camp: {camp}."
    lgd = [v["lgd_code"] for v in vs if v.get("lgd_code")]
    area = "".join(
        [
            _el("areaDesc", "; ".join(f"{v['name_hi'] if hi else v['name']}" + (f" (LGD {v['lgd_code']})" if v.get("lgd_code") else "") for v in vs) or "Gandak right bank near Haijalpur"),
            _el("polygon", polygon(vs)),
            "".join(f"<geocode><valueName>LGD</valueName><value>{escape(c)}</value></geocode>" for c in lgd),
        ]
    )
    return (
        "<info>"
        + _el("language", lang)
        + _el("category", "Met")
        + _el("event", "तटबंध टूटने का ख़तरा" if hi else "Embankment breach risk")
        + _el("responseType", response)
        + _el("urgency", "Immediate")
        + _el("severity", severity)
        + _el("certainty", certainty)
        + _el("effective", sent)
        + _el("expires", expires)
        + _el("senderName", "बाँध प्रहरी (छात्र परियोजना)" if hi else "Baandh Prahari (student project)")
        + _el("headline", headline)
        + _el("description", desc)
        + _el("instruction", instruction)
        + f"<area>{area}</area>"
        + "</info>"
    )


def draft(incident: dict, level: str, camp_hi: str, camp_en: str, previous: dict | None = None) -> dict:
    """{identifier, xml, ...} for one village warning. `previous` is the alert an all-clear updates."""
    msg_type = KIND[level][0]
    now = clock.now().replace(microsecond=0)
    sent = clock.iso(now)
    expires = clock.iso(now + timedelta(hours=12))
    identifier = f"BP-{incident['id']}-{level}-{ids.short_id(4)}"
    vs = village_info(incident.get("villages", []))
    refs = ""
    if previous and msg_type == "Update":
        refs = _el("references", f"{SENDER},{previous['identifier']},{previous['sent']}")
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<alert xmlns="{NS}">'
        + _el("identifier", identifier)
        + _el("sender", SENDER)
        + _el("sent", sent)
        + _el("status", "Exercise")
        + _el("msgType", msg_type)
        + _el("scope", "Public")
        + _el("note", f"{DEMO}. Student project exercise; not issued by any authority and never sent to SACHET.")
        + refs
        + _info("hi-IN", level, incident["km"], vs, camp_hi, sent, expires)
        + _info("en-IN", level, incident["km"], vs, camp_en, sent, expires)
        + "</alert>"
    )
    return {"identifier": identifier, "sent": sent, "level": level, "msg_type": msg_type, "villages": [v["name"] for v in vs], "xml": xml}


def rss(drafts: list[dict], base_url: str) -> str:
    """Our drafts as RSS 2.0, in the shape of SACHET's state feeds."""
    items = "".join(
        "<item>"
        + _el("title", d.get("headline", d["identifier"]))
        + "<description/>"
        + _el("category", "Met")
        + _el("link", f"{base_url}/cap/{d['identifier']}.xml")
        + _el("author", "Baandh Prahari (student project, Exercise)")
        + f'<guid isPermaLink="false">{escape(d["identifier"])}</guid>'
        + _el("pubDate", format_datetime(clock.parse(d["sent"])))
        + "</item>"
        for d in drafts
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>'
        + _el("title", f"Baandh Prahari: CAP drafts ({DEMO})")
        + _el("description", "Exercise drafts from a student project. Not official warnings. Nothing here is sent to SACHET.")
        + _el("language", "hi")
        + _el("link", f"{base_url}/cap/rss.xml")
        + items
        + "</channel></rss>"
    )


def save(incident: dict, level: str, camp_hi: str, camp_en: str) -> dict | None:
    """Write a draft to the locked bucket (cap/<id>.xml) and the table (CAP#<id>, CAP#ALL)."""
    import boto3

    from common import config, db

    if not config.BUCKET_NAME:
        return None
    previous = None
    if level == "khatra_tala":
        last = (db.get_incident(incident["id"]) or {}).get("last_cap")
        previous = last if isinstance(last, dict) and last.get("identifier") else None
    d = draft(incident, level, camp_hi, camp_en, previous)
    key = f"cap/{d['identifier']}.xml"
    boto3.client("s3").put_object(Bucket=config.BUCKET_NAME, Key=key, Body=d["xml"].encode("utf-8"), ContentType="application/xml; charset=utf-8", ChecksumAlgorithm="SHA256")
    headline = f"{DEMO}: {words.LEVELS[level]['en']}, km {incident['km']}"
    row = {"identifier": d["identifier"], "sent": d["sent"], "level": level, "villages": d["villages"], "status": "Exercise", "s3_key": key, "incident": incident["id"], "headline": headline}
    db.table().put_item(Item={"PK": f"CAP#{d['identifier']}", "SK": "META", **row})
    db.table().put_item(Item={"PK": "CAP#ALL", "SK": f"{d['sent']}#{d['identifier']}", **row})
    db.update_incident(incident["id"], last_cap={"identifier": d["identifier"], "sent": d["sent"]})
    return row
