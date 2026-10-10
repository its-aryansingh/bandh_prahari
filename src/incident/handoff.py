"""HandToDistrict: the stretch is the district's now. It gets the IRS Form 001 briefing link."""

from __future__ import annotations

from channels import send_text
from common import db, roster


def handler(event: dict, _ctx=None) -> dict:
    inc = event["incident"]
    reason = event.get("reason", "breached")
    channel = inc.get("channel", "screen")
    why = {
        "breached": ("बाँध टूटा", "the embankment breached"),
        "unanswered": ("कोई इंजीनियर नहीं आया", "no engineer came"),
        "no_checkin": ("मौक़े से हाज़िरी नहीं", "no check-ins from the site"),
        "long_hold": ("रोक बहुत लंबी चली", "the hold ran past the run's limit"),
    }.get(reason, (reason, reason))
    link = f"/briefing/{inc['id']}"
    db.event(
        inc["id"],
        "handoff",
        f"ज़िले को सौंपा ({why[0]}): IRS फ़ॉर्म 001 ब्रीफ़िंग",
        f"Handed to the district ({why[1]}): the IRS Form 001 briefing",
        actor="system",
        reason=reason,
        briefing=link,
    )
    for p in roster.people(inc["km"], 4, channel):
        if p["role"] == "district_control_room":
            send_text(
                channel,
                p,
                {
                    "hi": f"किमी {inc['km']} अब ज़िले के पास ({why[0]})। ब्रीफ़िंग: {link}",
                    "en": f"Km {inc['km']} is now with the district ({why[1]}). Briefing: {link}",
                },
                incident_id=inc["id"],
            )
    db.update_incident(inc["id"], status="with_district")
    return {"briefing": link}
