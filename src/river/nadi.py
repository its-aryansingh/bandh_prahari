"""Nadi ka haal (नदी का हाल): a village's name in, today's river reading out, in Hindi first.

docs/SPEC.md, flow 0. The nearest official gauge's latest reading (GAUGE#), its danger level,
the difference, the trend, its time and source; any active CWC alert; whether an incident is
open behind the village. When nothing official is fresh, it says so and gives the GloFAS model
as a model. Every reply ends with the source and time, the student note and the helplines.
Real users get only this: never a "get ready" or "move now".
"""

from __future__ import annotations

import difflib
import json
import re
import unicodedata
from datetime import timedelta
from pathlib import Path

from common import clock, db, words

STRETCH = json.loads((Path(__file__).resolve().parent.parent / "gov" / "stretch.json").read_text(encoding="utf-8"))
FRESH = timedelta(hours=36)
TREND = {"rising": ("बढ़ रहा है", "rising"), "falling": ("घट रहा है", "falling"), "steady": ("स्थिर है", "steady")}
GAUGE_HI = {g["site"]: g["site_hi"] for g in STRETCH["gauges"]}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s).lower()
    return re.sub(r"[^\wऀ-ॿ]+", " ", s).strip()


def find_village(text: str) -> dict | None:
    """Hindi or English, forgiving of spelling: 'haijalpur', 'हैजलपुर', 'Hajalpur'."""
    t = _norm(text)
    if not t:
        return None
    names: dict[str, dict] = {}
    for v in STRETCH["villages"]:
        names[_norm(v["name"])] = v
        names[_norm(v["name_hi"])] = v
    if t in names:
        return names[t]
    for key, v in names.items():
        if key and (key in t or t in key) and min(len(key), len(t)) >= 4:
            return v
    best = difflib.get_close_matches(t, list(names), n=1, cutoff=0.75)
    return names[best[0]] if best else None


def _fmt_time(iso: str) -> tuple[str, str]:
    d = clock.parse(iso).astimezone(clock.IST)
    h12 = d.hour % 12 or 12
    part = "रात" if d.hour < 4 else "सुबह" if d.hour < 12 else "दोपहर" if d.hour < 16 else "शाम" if d.hour < 19 else "रात"
    return f"{d.day}/{d.month}, {part} {h12}:{d.minute:02d}", d.strftime("%d %b, %I:%M %p IST")


def reply(text: str) -> dict | None:
    """{"village", "hi", "en", "above_danger"} or None when no village matches."""
    v = find_village(text)
    if not v:
        return None
    sites = [v["gauge"]] + [g["site"] for g in STRETCH["gauges"] if g["site"] != v["gauge"]]
    reading = None
    for site in sites:
        rows = db.latest_readings(site, 2)
        if rows and clock.now() - clock.parse(rows[0]["time"]) < FRESH:
            reading = rows
            break
    name_hi, name_en = v["name_hi"], v["name"]
    if reading:
        r = reading[0]
        diff = round(r["wl"] - r["dl"], 2)
        site_hi = GAUGE_HI.get(r["site"], r["site"])
        trend = r.get("trend") or ("rising" if len(reading) > 1 and r["wl"] > reading[1]["wl"] else "steady")
        t_hi, t_en = TREND.get(trend, TREND["steady"])
        side_hi = f"ख़तरे के निशान से {abs(diff):.2f} मी. {'ऊपर' if diff > 0 else 'नीचे'}"
        side_en = f"{abs(diff):.2f} m {'above' if diff > 0 else 'below'} the danger level"
        when_hi, when_en = _fmt_time(r["time"])
        hi = f"नदी का हाल, {name_hi}: गंडक, {site_hi} पर {r['wl']:.2f} मी. ({side_hi} {r['dl']:.2f} मी.), पानी {t_hi}।"
        en = f"River status, {name_en}: the Gandak at {r['site']} is {r['wl']:.2f} m ({side_en} of {r['dl']:.2f} m), {t_en}."
        src_hi, src_en = f"स्रोत: {r['source']}, {when_hi}", f"Source: {r['source']}, {when_en}"
        above = diff > 0
        alerts = db.active_alerts(r["site"])
    else:
        hi = f"नदी का हाल, {name_hi}: अभी कोई ताज़ा सरकारी रीडिंग नहीं मिली।"
        en = f"River status, {name_en}: no fresh official reading just now."
        src_hi, src_en = "स्रोत: SACHET (NDMA) और FMISC (जल संसाधन विभाग, बिहार)", "Source: SACHET (NDMA) and FMISC (WRD Bihar)"
        above, alerts = False, []
    if alerts:
        hi += f"\nCWC की बाढ़ चेतावनी जारी है ({alerts[0].get('severity', '')})।"
        en += f"\nA CWC flood alert is active ({alerts[0].get('severity', '')})."
    open_here = [i for i in db.open_incidents() if v["name"] in (i.get("villages") or []) and not i.get("demo")]
    if open_here:
        hi += f"\nआपके गाँव के पीछे किमी {open_here[0]['km']} पर बाँध की एक घटना खुली है।"
        en += f"\nAn embankment incident is open at km {open_here[0]['km']} behind your village."
    if above:
        L = words.LEVELS["saavdhan"]
        hi += "\n" + L["hi"] + ":\n" + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(L["steps_hi"]))
        en += "\n" + L["en"] + ":\n" + "\n".join(f"{i + 1}. {s}" for i, s in enumerate(L["steps_en"]))
    f_hi, f_en = words.footer(src_hi, src_en)
    return {"village": v["name"], "hi": hi + "\n\n" + f_hi, "en": en + "\n\n" + f_en, "above_danger": above}
