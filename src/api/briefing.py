"""IRS Form 001 Incident Briefing (docs/SPEC.md, "Government adapters" and "The public API").

Rendered as an HTML page: browsers render Hindi correctly, and it prints cleanly to PDF.
Every briefing clearly bears "Demo, not a real warning / छात्र परियोजना".
"""

from __future__ import annotations

import html
import json
from pathlib import Path

from common import clock, db, words

STRETCH = json.loads((Path(__file__).resolve().parent.parent / "gov" / "stretch.json").read_text(encoding="utf-8"))


def render(incident_id: str) -> str | None:
    inc = db.get_incident(incident_id)
    if not inc:
        return None
    events = db.timeline(incident_id)

    km = inc.get("km", 14)
    sign = inc.get("sign", "boil_soil")
    priority = inc.get("priority", "P1")
    status = inc.get("status", "with_district")
    opened = inc.get("opened", clock.iso())

    # Find villages behind this stretch
    villages = [v for v in STRETCH.get("villages", []) if v.get("behind_km") and v["behind_km"][0] <= km <= v["behind_km"][1]]
    if not villages:
        villages = STRETCH.get("villages", [])[:3]

    sign_h = words.sign_hi(sign)
    sign_e = words.sign_en(sign)

    # Build timeline rows
    rows_html = []
    for e in events:
        at = html.escape(str(e.get("at", "")))
        kind = html.escape(str(e.get("kind", "")))
        actor = html.escape(str(e.get("actor", "")))
        text_hi = html.escape(str(e.get("text_hi", "")))
        text_en = html.escape(str(e.get("text_en", "")))
        rows_html.append(f"""
        <tr>
          <td class="mono">{at}</td>
          <td><span class="badge badge-kind">{kind}</span></td>
          <td>{actor}</td>
          <td><strong>{text_hi}</strong><br><span class="muted">{text_en}</span></td>
        </tr>
        """)
    timeline_rows = "".join(rows_html)

    # Build village rows
    v_rows = []
    for v in villages:
        v_name = html.escape(v.get("name", ""))
        v_name_hi = html.escape(v.get("name_hi", ""))
        lgd = html.escape(str(v.get("lgd_code") or "—"))
        camp_hi = html.escape(str(v.get("relief_camp_hi") or "पंचायत भवन"))
        camp_en = html.escape(str(v.get("relief_camp_en") or "Panchayat Bhawan"))
        v_rows.append(f"""
        <tr>
          <td><strong>{v_name_hi}</strong> ({v_name})</td>
          <td class="mono">{lgd}</td>
          <td>{camp_hi} / {camp_en}</td>
        </tr>
        """)
    village_rows = "".join(v_rows)

    return f"""<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IRS Form 001 — {html.escape(incident_id)} — Incident Briefing</title>
  <style>
    :root {{
      --ink: #0f172a;
      --indigo: #1e3a8a;
      --indigo-bg: #eff6ff;
      --border: #cbd5e1;
      --muted: #64748b;
      --warn-bg: #fef3c7;
      --warn-border: #f59e0b;
      --warn-text: #92400e;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--ink);
      background: #f8fafc;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
    }}
    .sheet {{
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 32px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }}
    .demo-banner {{
      background: var(--warn-bg);
      border: 1px solid var(--warn-border);
      color: var(--warn-text);
      padding: 10px 16px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 24px;
      text-align: center;
    }}
    .header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--indigo);
      padding-bottom: 16px;
      margin-bottom: 24px;
    }}
    h1 {{
      margin: 0 0 4px 0;
      font-size: 24px;
      color: var(--indigo);
    }}
    .sub-head {{
      color: var(--muted);
      font-size: 14px;
      margin: 0;
    }}
    .grid-summary {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      background: var(--indigo-bg);
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 28px;
    }}
    .stat-label {{
      font-size: 12px;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: 0.05em;
    }}
    .stat-val {{
      font-size: 16px;
      font-weight: 700;
      color: var(--ink);
      margin-top: 2px;
    }}
    .badge {{
      display: inline-block;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
    }}
    .badge-p1 {{ background: #fee2e2; color: #991b1b; }}
    .badge-p2 {{ background: #fef3c7; color: #92400e; }}
    .badge-p3 {{ background: #e0f2fe; color: #075985; }}
    .badge-kind {{ background: #e2e8f0; color: #334155; }}
    h2 {{
      font-size: 18px;
      color: var(--indigo);
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
      margin-top: 28px;
      margin-bottom: 12px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      margin-bottom: 20px;
    }}
    th, td {{
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }}
    th {{
      background: #f1f5f9;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .mono {{
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
    }}
    .muted {{ color: var(--muted); }}
    .helpline-box {{
      background: #f8fafc;
      border: 1px dashed var(--border);
      border-radius: 6px;
      padding: 14px;
      margin-top: 24px;
      font-size: 13px;
    }}
    @media print {{
      body {{ background: #ffffff; padding: 0; }}
      .sheet {{ border: none; box-shadow: none; padding: 0; }}
    }}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="demo-banner">
      ⚠ छात्र परियोजना (डेमो) — सरकारी प्रणाली नहीं / Student Project (Demo) — Not an Official Warning
    </div>

    <div class="header">
      <div>
        <h1>IRS फ़ॉर्म 001 — घटना ब्रीफ़िंग (Incident Briefing)</h1>
        <p class="sub-head">डिस्ट्रिक्ट डिज़ास्टर मैनेजमेंट अथॉरिटी, सारण / DDMA Saran &bull; बाँध प्रहरी (जवाब घड़ी)</p>
      </div>
      <div style="text-align: right;">
        <span class="mono" style="font-size: 14px; font-weight: 700;">{html.escape(incident_id)}</span><br>
        <span class="muted" style="font-size: 12px;">{html.escape(opened)}</span>
      </div>
    </div>

    <div class="grid-summary">
      <div>
        <div class="stat-label">स्थान / Location</div>
        <div class="stat-val">गंडक दायाँ तटबंध, किमी {km}</div>
      </div>
      <div>
        <div class="stat-label">संकेत / Warning Sign</div>
        <div class="stat-val">{sign_h} ({sign_e})</div>
      </div>
      <div>
        <div class="stat-label">प्राथमिकता / Priority</div>
        <div class="stat-val"><span class="badge badge-{'p1' if priority == 'P1' else 'p2' if priority == 'P2' else 'p3'}">{priority}</span> &bull; {status}</div>
      </div>
      <div>
        <div class="stat-label">प्रखंड व ज़िला / Block & Dist</div>
        <div class="stat-val">मकेर, सारण (Maker, Saran)</div>
      </div>
      <div>
        <div class="stat-label">नज़दीकी गेज / Gauge</div>
        <div class="stat-val">रेवाघाट (Rewaghat, गंडक)</div>
      </div>
      <div>
        <div class="stat-label">स्थिति / Current State</div>
        <div class="stat-val">ज़िले को हस्तांतरित (Handed over)</div>
      </div>
    </div>

    <h2>1. प्रभावित क्षेत्र व राहत शिविर / Villages & Designated Camps</h2>
    <table>
      <thead>
        <tr>
          <th>गाँव / Village</th>
          <th>LGD कोड</th>
          <th>नामित राहत शिविर / Relief Camp</th>
        </tr>
      </thead>
      <tbody>
        {village_rows}
      </tbody>
    </table>

    <h2>2. अब तक की कार्रवाई / Chronology of Actions Taken</h2>
    <table>
      <thead>
        <tr>
          <th>समय (IST)</th>
          <th>प्रकार</th>
          <th>कर्ता (Actor)</th>
          <th>विवरण / Details</th>
        </tr>
      </thead>
      <tbody>
        {timeline_rows}
      </tbody>
    </table>

    <h2>3. तैनात संसाधन व सहायता दल / Resources Mobilized</h2>
    <p style="font-size: 14px; margin: 4px 0 12px 0;">
      तटबंध एम्बुलेंस (ट्रैक्टर व 10 मज़दूर दल), बोरी भंडार डिपो, तथा आपदा मित्र नाव को सूचित किया गया।
    </p>

    <div class="helpline-box">
      <strong>आपातकालीन संपर्क / Helplines:</strong><br>
      राज्य आपदा नियंत्रण कक्ष: <strong>1070</strong> &bull; जल संसाधन विभाग नियंत्रण कक्ष: <strong>1800 345 6145</strong><br>
      <span class="muted">यह ब्रीफ़िंग बाँध प्रहरी टाइमलाइन से स्वतः तैयार की गई है।</span>
    </div>
  </div>
</body>
</html>
"""
