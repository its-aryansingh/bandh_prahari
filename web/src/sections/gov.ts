// Plugged into the government (kit effect 15, flowing paths): what comes in from SACHET,
// FMISC and the department's roster, and what goes out to villages and the district.
import { logoMark } from "../art/ghadi";
import { C } from "../art/palette";
import { $, bi, bil, esc } from "../lib/dom";
import { Loop, clamp, eio, onceInView, reducedMotion } from "../lib/motion";
import type { Gauges } from "../types";

const W = 960;
const H = 330;
interface Node { x: number; y: number; hi: string; en: string; sub_hi: string; sub_en: string; tone: string }
const INS: Node[] = [
  { x: 120, y: 54, hi: "SACHET", en: "SACHET", sub_hi: "CWC, IMD की चेतावनियाँ (CAP 1.2)", sub_en: "CWC and IMD alerts (CAP 1.2)", tone: C.haldiTint },
  { x: 120, y: 132, hi: "FMISC गेज", en: "FMISC gauges", sub_hi: "विभाग की जल-स्तर रीडिंग", sub_en: "The department's water levels", tone: C.haldiTint },
  { x: 120, y: 210, hi: "रोस्टर", en: "Roster", sub_hi: "विभाग की शीट: कौन, किस किमी पर", sub_en: "The department's sheet: who, which km", tone: C.haldiTint },
  { x: 120, y: 288, hi: "लोग", en: "People", sub_hi: "WhatsApp रिपोर्ट, हेल्पलाइन कॉल", sub_en: "WhatsApp reports, helpline calls", tone: C.kesarTint },
];
const OUTS: Node[] = [
  { x: 840, y: 54, hi: "गाँव", en: "Villages", sub_hi: "हिंदी आवाज़ में चेतावनी", sub_en: "Warnings as Hindi voice notes", tone: C.kesarTint },
  { x: 840, y: 132, hi: "CAP ड्राफ़्ट", en: "CAP drafts", sub_hi: "'Exercise', SACHET के ढाँचे में", sub_en: "Marked Exercise, in SACHET's shape", tone: C.dhaanTint },
  { x: 840, y: 210, hi: "IRS फ़ॉर्म 001", en: "IRS Form 001", sub_hi: "ज़िले की ब्रीफ़िंग", sub_en: "The district's briefing", tone: C.dhaanTint },
  { x: 840, y: 288, hi: "मुहर लगा रिकॉर्ड", en: "Locked record", sub_hi: "राहत सूची के लिए, बदला नहीं जा सकता", sub_en: "For the relief list, can't be edited", tone: C.dhaanTint },
];
const HUB = { x: 480, y: 171 };

function bez(x1: number, y1: number, x2: number, y2: number) {
  const m = (x1 + x2) / 2;
  const P = [[x1, y1], [m, y1], [m, y2], [x2, y2]];
  return {
    d: `M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`,
    at: (t: number) => {
      const u = 1 - t;
      return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]);
    },
  };
}

export function initGov(g: Gauges): void {
  const host = $("#gov-flow");
  const pillW = 236;
  const pill = (n: Node, side: "in" | "out", i: number) => `<g class="gnode" data-k="${side}${i}">
      <rect class="gring" x="${n.x - pillW / 2 - 4}" y="${n.y - 30}" width="${pillW + 8}" height="60" rx="20" fill="none" stroke="${side === "in" ? C.haldiDeep : C.dhaan}" stroke-width="2" opacity="0"/>
      <rect x="${n.x - pillW / 2}" y="${n.y - 26}" width="${pillW}" height="52" rx="16" fill="${n.tone}" stroke="${C.neel}" stroke-width="2.2"/>
      <text x="${n.x - pillW / 2 + 14}" y="${n.y - 4}" font-size="16" fill="${C.neel}"><tspan class="hi">${n.hi}</tspan><tspan class="en">${n.en}</tspan></text>
      <text x="${n.x - pillW / 2 + 14}" y="${n.y + 15}" font-size="12.5" fill="${C.neel2}" font-weight="600"><tspan class="hi">${esc(n.sub_hi)}</tspan><tspan class="en">${esc(n.sub_en)}</tspan></text>
    </g>`;
  const ins = INS.map((n) => bez(n.x + pillW / 2, n.y, HUB.x - 74, HUB.y));
  const outs = OUTS.map((n) => bez(HUB.x + 74, HUB.y, n.x - pillW / 2, n.y));
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Data in from SACHET, FMISC gauges, the roster and people; out to villages, CAP drafts, the IRS Form 001 briefing and a locked record.">
    ${[...ins, ...outs].map((p) => `<path d="${p.d}" fill="none" stroke="${C.neel3}" stroke-width="2" opacity=".5"/>`).join("")}
    ${[...ins, ...outs].map((p, i) => `<path class="glit" data-i="${i}" d="${p.d}" fill="none" stroke="${i < 4 ? C.haldiDeep : C.dhaan}" stroke-width="3" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`).join("")}
    <g class="gpk"></g>
    ${INS.map((n, i) => pill(n, "in", i)).join("")}${OUTS.map((n, i) => pill(n, "out", i)).join("")}
    <g class="hub">
      <circle class="hubring" cx="${HUB.x}" cy="${HUB.y}" r="78" fill="none" stroke="${C.kesar}" stroke-width="3" opacity="0"/>
      <rect x="${HUB.x - 74}" y="${HUB.y - 62}" width="148" height="124" rx="24" fill="${C.chuna}" stroke="${C.neel}" stroke-width="2.6"/>
      <svg x="${HUB.x - 28}" y="${HUB.y - 54}" width="56" height="56" viewBox="0 0 64 64">${logoMark().replace(/<svg[^>]*>|<\/svg>/g, "")}</svg>
      <text x="${HUB.x}" y="${HUB.y + 26}" text-anchor="middle" font-family="Yatra One" font-size="19" fill="${C.neel}">बाँध प्रहरी</text>
      <text x="${HUB.x}" y="${HUB.y + 46}" text-anchor="middle" font-size="12" fill="${C.neel2}" font-weight="600"><tspan class="hi">नियम + जवाब घड़ी</tspan><tspan class="en">Rules + answer clock</tspan></text>
    </g>
  </svg>`;
  const svg = host.querySelector("svg")!;
  const lits = Array.from(svg.querySelectorAll<SVGPathElement>(".glit"));
  const pk = svg.querySelector<SVGGElement>(".gpk")!;
  const rings = Array.from(svg.querySelectorAll<SVGRectElement>(".gring"));
  const hubring = svg.querySelector<SVGCircleElement>(".hubring")!;
  const paths = [...ins, ...outs];

  // In first (0 to 2.2 s, staggered), the hub answers (2.2 s), then out (2.4 to 4.6 s).
  const startOf = (i: number) => (i < 4 ? i * 0.25 : 2.4 + (i - 4) * 0.25);
  const DUR = 1.2;
  const draw = (t: number) => {
    let dots = "";
    paths.forEach((p, i) => {
      const k = clamp((t - startOf(i)) / DUR);
      lits[i].setAttribute("stroke-dashoffset", (1 - eio(k)).toFixed(3));
      if (k > 0 && k < 1) {
        const [x, y] = p.at(eio(k));
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${i < 4 ? C.haldi : C.dhaan}" opacity=".35"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${C.white}" stroke="${C.neel}" stroke-width="1.4"/>`;
      }
    });
    pk.innerHTML = dots;
    rings.forEach((r, i) => {
      const arrive = i < 4 ? startOf(i) : startOf(i) + DUR;
      const a = (t - arrive) / 0.7;
      r.setAttribute("opacity", a > 0 && a < 1 ? (0.9 * (1 - a)).toFixed(2) : "0");
    });
    const hb = (t - (startOf(3) + DUR)) / 0.8;
    hubring.setAttribute("opacity", hb > 0 && hb < 1 ? (1 - hb).toFixed(2) : "0");
    hubring.setAttribute("r", (78 + 18 * clamp(hb)).toFixed(1));
  };
  draw(reducedMotion() ? 99 : 0);
  if (!reducedMotion()) {
    const loop = new Loop((t) => {
      draw(t);
      if (t > 6) {
        loop.stop();
        draw(99);
      }
    });
    onceInView(svg, () => loop.start(), 0.4);
    // A tap on the diagram runs the data through again.
    svg.addEventListener("click", () => {
      const again = new Loop((t) => {
        draw(t);
        if (t > 6) again.stop();
      });
      again.start();
    });
  }

  // ---------- the three cards ----------
  const a = g.alerts[0];
  const r = g.readings.find((x) => x.site === "Dumariaghat");
  $("#gov-sachet").innerHTML = `<span class="stamp dhaan" style="--tilt:5deg">${bil("असली", "Real")}</span>
    <h3>${bil("CWC की चेतावनी, SACHET से", "A CWC alert, from SACHET")}</h3>
    <p class="pair">${bi(
      r ? `गंडक, डुमरियाघाट (गोपालगंज): ${r.wl_m.toFixed(2)} मी., ख़तरे के निशान ${r.dl_m.toFixed(2)} मी. से 0.01 मी. ऊपर, स्थिर। पिछला उच्चतम ${r.hfl_m?.toFixed(2)} मी. (24 जुलाई 2020)।` : "",
      a ? a.description : "",
    )}</p>
    <p class="small pair">${bi("नियम: इससे गोपालगंज के बाँधों पर रात की हाज़िरी अपने आप शुरू होती है।", "Rule: this alone starts the night roll-call on the Gopalganj stretches.")}</p>
    <p class="src">${bil("स्रोत", "Source")}: <a href="${esc(r?.source_url ?? "#")}" target="_blank" rel="noopener">SACHET CAP XML</a>, ${esc(a?.effective.slice(0, 10) ?? "")}</p>`;
  $("#gov-cap").innerHTML = `<span class="stamp" style="--tilt:6deg">${bil("अभ्यास", "Exercise")}</span>
    <h3>${bil("हमारा CAP ड्राफ़्ट", "Our CAP draft")}</h3>
    <pre>&lt;status&gt;Exercise&lt;/status&gt;
&lt;msgType&gt;Alert&lt;/msgType&gt;
&lt;event&gt;Embankment breach risk&lt;/event&gt;
&lt;responseType&gt;Prepare&lt;/responseType&gt;
&lt;headline&gt;Demo, not a real warning:
  get ready, km 14, Gandak right bank&lt;/headline&gt;
&lt;areaDesc&gt;Haijalpur, Parmanand Chhapra,
  Naukraha (Maker, Saran)&lt;/areaDesc&gt;</pre>
    <p class="small pair">${bi("हर चेतावनी का CAP 1.2 ड्राफ़्ट, उसी ढाँचे में जो SACHET इस्तेमाल करता है। ज़िला चाहे तो ले ले। हम कुछ नहीं भेजते।", "Every warning gets a CAP 1.2 draft in SACHET's own shape, for the district to take if it wants. We send nothing.")}</p>`;
  $("#gov-record").innerHTML = `<span class="stamp dhaan" style="--tilt:-5deg">${bil("दर्ज", "Recorded")}</span>
    <h3>${bil("राहत के लिए रिकॉर्ड", "A record for relief")}</h3>
    <p class="pair">${bi("किस गाँव के पीछे बाँध कब टूटा, किसे कब ख़बर गई: S3 Object Lock में, बदला नहीं जा सकता। राहत सूची बनते समय परिवार या मुखिया इसे अंचल कार्यालय में दिखा सकते हैं।", "Which village was behind the breach, when the water came, who was told when: kept under S3 Object Lock, unchangeable. A family or mukhiya can show it at the circle office when relief lists are drawn up.")}</p>
    <p class="small pair">${bi("इस साल 8.27 लाख परिवारों को ₹7,000 DBT से मिले, गाँव-गाँव की सूची से।", "This year ₹7,000 each went to 8.27 lakh families by DBT, from lists checked village by village.")}</p>`;
}
