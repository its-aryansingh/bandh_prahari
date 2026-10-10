"""Government data in and out, against real captured responses (tests/fixtures/README.md).

SACHET: the Bihar RSS and one CWC alert, captured on 10 Oct 2026. FMISC and Open-Meteo
tests run only once their real responses are saved (scripts/fetch_fixtures.ps1).
"""

from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

import pytest
from lxml import etree

from common import clock, db
from gov import cap, fmisc, sachet
from river import nadi, poll

FIX = Path(__file__).parent / "fixtures"
RSS = (FIX / "sachet" / "rss_bihar.2026-10-10.xml").read_bytes()
ALERT_ID = "1791519803955016"
ALERT = (FIX / "sachet" / f"cap.{ALERT_ID}.xml").read_bytes()
XSD = etree.XMLSchema(etree.parse(str(FIX / "cap" / "CAP-v1.2.xsd")))


def fake_get(calls: list):
    def get(url):
        calls.append(url)
        if url == sachet.RSS_URL:
            return RSS
        if url.endswith(f"identifier={ALERT_ID}"):
            return ALERT
        raise OSError("not captured")

    return get


# ---------------- SACHET ----------------


def test_rss_items_carry_identifier_sender_and_link():
    items = sachet.parse_rss(RSS)
    assert len(items) == 34
    cwc = [i for i in items if i["sender"] == "CWC"]
    assert len(cwc) == 27
    g = next(i for i in items if i["identifier"] == ALERT_ID)
    assert g["link"].endswith(f"FetchXMLFile?identifier={ALERT_ID}")
    assert sachet.site_of(g["title"]) == "Dumariaghat"


def test_cap_alert_fields():
    a = sachet.parse_cap(ALERT)
    assert a["sender"] == "CWC" and a["event"] == "Flood" and a["severity"] == "Severe"
    assert a["area"] == "Gandak, Dumariaghat, Gopalganj, Bihar"
    assert a["expires"] == "2026-10-10T06:00:00+05:30"


def test_reading_from_the_alert_description():
    r = sachet.reading(sachet.parse_cap(ALERT))
    assert r["site"] == "Dumariaghat" and r["wl"] == 62.23 and r["dl"] == 62.22
    assert r["trend"] == "steady" and r["hfl"] == 64.36 and r["hfl_date"] == "2020-07-24"
    assert r["time"] == "2026-10-09T06:00:00+05:30"


def test_poll_keeps_our_gauges_and_dedupes_on_identifier(aws):
    calls: list = []
    out = sachet.poll(fake_get(calls))
    # two Gandak at Dumariaghat items; only one alert was captured, the other fetch fails quietly
    assert out["new_alerts"] == 1 and out["readings"] == 1
    assert db.latest_readings("Dumariaghat", 1)[0]["wl"] == 62.23
    calls.clear()
    again = sachet.poll(fake_get(calls))
    assert again["new_alerts"] == 0
    assert not any(ALERT_ID in c for c in calls), "an alert we already have was fetched again"


def test_a_failed_feed_keeps_the_last_good_reading(aws, monkeypatch):
    sachet.poll(fake_get([]))

    def down(url, timeout=15):
        raise OSError("403")

    monkeypatch.setattr(sachet, "fetch", down)
    assert "error" in sachet.handler()
    assert db.latest_readings("Dumariaghat", 1)[0]["wl"] == 62.23


# ---------------- FMISC and GloFAS (real responses only) ----------------


@pytest.mark.skipif(not (FIX / "fmisc" / "layer1_gandak.json").exists(), reason="run scripts/fetch_fixtures.ps1 to capture FMISC")
def test_fmisc_layer1_real_response():
    doc = json.loads((FIX / "fmisc" / "layer1_gandak.json").read_text(encoding="utf-8"))
    rows = fmisc.parse(doc, 1)
    assert rows and all(r["wl"] != fmisc.NO_READING for r in rows)
    assert all(r["river"].lower().endswith("andak") for r in rows)


@pytest.mark.skipif(not (FIX / "glofas" / "flood_api.json").exists(), reason="run scripts/fetch_fixtures.ps1 to capture Open-Meteo")
def test_glofas_real_response():
    rows = poll.parse(json.loads((FIX / "glofas" / "flood_api.json").read_text()))
    assert rows and all(r["q"] >= 0 for r in rows)


def test_fmisc_query_is_the_spec_query():
    u = fmisc.url(1)
    assert "/MapServer/1/query?" in u and "CWC_own.RIVER+LIKE+%27%25andak%25%27" in u and "returnGeometry=false" in u and "f=json" in u


# ---------------- CAP drafts out ----------------


@pytest.mark.parametrize("level", ["saavdhan", "taiyaar", "nikal_chalo", "khatra_tala"])
def test_every_draft_passes_the_oasis_schema_and_is_an_exercise(level):
    d = cap.draft({"id": "DEMO-1010-0600-14-abc", "km": 14, "villages": ["Haijalpur", "Unknown village"]}, level, "पंचायत भवन (नमूना)", "Panchayat bhawan (sample)")
    doc = etree.fromstring(d["xml"].encode())
    assert XSD.validate(etree.ElementTree(doc)), XSD.error_log
    ns = {"c": cap.NS}
    assert doc.findtext("c:status", namespaces=ns) == "Exercise"
    heads = doc.findall("c:info/c:headline", ns)
    assert len(heads) == 2 and all(h.text.startswith("Demo, not a real warning") for h in heads)
    assert [i.findtext("c:language", namespaces=ns) for i in doc.findall("c:info", ns)] == ["hi-IN", "en-IN"]
    assert doc.findtext("c:info/c:responseType", namespaces=ns) == cap.KIND[level][1]
    poly = doc.findtext("c:info/c:area/c:polygon", namespaces=ns).split()
    assert len(poly) >= 4 and poly[0] == poly[-1]


def test_all_clear_updates_the_earlier_alert():
    first = cap.draft({"id": "X", "km": 14, "villages": ["Haijalpur"]}, "taiyaar", "a", "b")
    upd = cap.draft({"id": "X", "km": 14, "villages": ["Haijalpur"]}, "khatra_tala", "a", "b", previous=first)
    doc = etree.fromstring(upd["xml"].encode())
    assert XSD.validate(etree.ElementTree(doc)), XSD.error_log
    assert doc.findtext(f"{{{cap.NS}}}msgType") == "Update"
    assert doc.findtext(f"{{{cap.NS}}}references") == f"{cap.SENDER},{first['identifier']},{first['sent']}"


def test_our_feed_is_rss_like_sachets():
    d = cap.draft({"id": "X", "km": 14, "villages": ["Haijalpur"]}, "taiyaar", "a", "b")
    feed = etree.fromstring(cap.rss([{**d, "headline": "Demo, not a real warning: x"}], "https://api.example").encode())
    assert feed.tag == "rss" and feed.find("channel/item/guid").text == d["identifier"]
    assert feed.find("channel/item/link").text == f"https://api.example/cap/{d['identifier']}.xml"


def test_the_bundled_stretch_is_the_pages_stretch():
    root = Path(__file__).resolve().parent.parent
    assert (root / "src" / "gov" / "stretch.json").read_text(encoding="utf-8") == (root / "web" / "mock" / "stretch.json").read_text(encoding="utf-8")


# ---------------- Nadi ka haal ----------------


@pytest.mark.parametrize("text", ["Haijalpur", "haijalpur", "हैजलपुर", "Hajalpur", "  HAIJALPUR!! "])
def test_village_names_match_in_hindi_and_english(text):
    assert nadi.find_village(text)["name"] == "Haijalpur"


def test_unknown_text_matches_no_village():
    assert nadi.find_village("hello") is None and nadi.reply("hello") is None


def test_reply_carries_reading_source_time_student_note_and_helplines(aws):
    now = clock.now().replace(microsecond=0)
    db.table().put_item(Item=db.clean({"PK": "GAUGE#Rewaghat", "SK": clock.iso(now - timedelta(hours=3)), "site": "Rewaghat", "wl": 54.6, "dl": 54.41, "trend": "rising", "time": clock.iso(now - timedelta(hours=3)), "source": "FMISC (WRD Bihar)"}))
    r = nadi.reply("हैजलपुर")
    assert r["village"] == "Haijalpur" and r["above_danger"] is True
    hi = r["hi"]
    assert "54.60" in hi and "ऊपर" in hi and "बढ़ रहा" in hi
    assert "स्रोत: FMISC (WRD Bihar)" in hi
    assert "छात्र परियोजना" in hi and "1070" in hi and "1800 345 6145" in hi
    assert "सावधान" in hi or "Saavdhan" in r["en"]  # above danger: the watch steps
    assert "A student project, not an official warning." in r["en"]


def test_reply_without_fresh_official_data_says_so(aws):
    old = clock.iso(clock.now() - timedelta(days=5))
    db.table().put_item(Item=db.clean({"PK": "GAUGE#Rewaghat", "SK": old, "site": "Rewaghat", "wl": 50.0, "dl": 54.41, "time": old, "source": "FMISC"}))
    r = nadi.reply("Haijalpur")
    assert "ताज़ा सरकारी रीडिंग नहीं" in r["hi"] and r["above_danger"] is False
    assert "1070" in r["hi"]


# ---------------- the routes ----------------


def _ev(route, path=None):
    return {"routeKey": route, "pathParameters": path or {}, "requestContext": {"domainName": "api.example"}}


def test_gauges_route_serves_the_readings_and_alerts_sachet_stored(aws):
    from api import river

    sachet.poll(fake_get([]))
    g = json.loads(river.handler(_ev("GET /gauges"))["body"])
    r = next(x for x in g["readings"] if x["site"] == "Dumariaghat")
    assert r["wl_m"] == 62.23 and r["dl_m"] == 62.22 and r["source"] == "CWC via SACHET" and r["sample"] is False
    # the captured alert expired on 10 Oct 06:00 IST, so whether it shows depends on today
    assert isinstance(g["alerts"], list) and g["glofas"]["unit"] == "m3/s"


def test_stretch_route_has_the_pages_shape(aws):
    from api import river

    s = json.loads(river.handler(_ev("GET /stretch"))["body"])
    assert set(s) == {"stretch", "segments", "villages", "gauges", "sample"} and len(s["segments"]) == 20


def test_a_warning_writes_a_cap_draft_the_feed_serves(aws):
    from api import river
    from incident import warn

    inc = {"id": "DEMO-1010-0600-14-abc", "km": 14, "villages": ["Haijalpur"], "channel": "screen", "priority": "P1", "sign": "boil_soil"}
    db.put_incident(inc)
    warn.handler({"incident": inc, "level": "taiyaar"})
    feed = river.handler(_ev("GET /cap/rss.xml"))
    assert feed["statusCode"] == 200 and "application/xml" in feed["headers"]["content-type"]
    ident = etree.fromstring(feed["body"].encode()).find("channel/item/guid").text
    one = river.handler(_ev("GET /cap/{file}", {"file": f"{ident}.xml"}))
    doc = etree.fromstring(one["body"].encode())
    assert XSD.validate(etree.ElementTree(doc)) and doc.findtext(f"{{{cap.NS}}}status") == "Exercise"
    # all clear updates the earlier draft
    warn.handler({"incident": inc, "level": "khatra_tala"})
    items = etree.fromstring(river.handler(_ev("GET /cap/rss.xml"))["body"].encode()).findall("channel/item")
    assert len(items) == 2
    assert river.handler(_ev("GET /cap/{file}", {"file": "../../etc.xml"}))["statusCode"] == 404
