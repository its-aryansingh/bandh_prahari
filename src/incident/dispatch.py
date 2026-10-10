"""DispatchRepairTeam: log the nearest embankment ambulance and the sandbag stock, and tell the engineer."""

from __future__ import annotations

from channels import send_text
from common import db, roster


def handler(event: dict, _ctx=None) -> dict:
    inc = event["incident"]
    ans = event.get("answer") or {}
    role = ans.get("role", "junior_engineer")
    seg = db.get_segment(inc["km"]) or {}
    amb_km = seg.get("ambulance_km", inc["km"] - 2)
    bags = seg.get("sandbags", 400)
    sample = not seg.get("ambulance_km")
    tag_hi, tag_en = (" (नमूना)", " (sample)") if sample else ("", "")
    db.event(
        inc["id"],
        "dispatch",
        f"बाँध एम्बुलेंस किमी {amb_km} से रवाना, 10 मज़दूर, {bags} बोरी{tag_hi}",
        f"Embankment ambulance sent from km {amb_km}: 10 workers, {bags} sandbags{tag_en}",
        actor="system",
        ambulance_km=amb_km,
        sandbags=bags,
        to=role,
    )
    channel = inc.get("channel", "screen")
    to = roster.person(inc["km"], role, int(ans.get("level", 1)), channel)
    send_text(
        channel,
        to,
        {
            "hi": f"बाँध एम्बुलेंस किमी {amb_km} से आपकी ओर: 10 मज़दूर, {bags} बोरी{tag_hi}।",
            "en": f"The embankment ambulance is coming from km {amb_km}: 10 workers, {bags} sandbags{tag_en}.",
        },
        incident_id=inc["id"],
    )
    db.update_incident(inc["id"], status="answered", with_role=role)
    return {"ambulance_km": amb_km, "sandbags": bags}
