// The Gandak discharge chart. Daily columns morph into the trend line (kit effect 05).
// One series, so no legend: the title names it. Colours validated with the dataviz
// validator: #1E88C7 for the model series, #6FB0DA (same hue, lighter step) for forecast.
import type { Gauges } from "../types";
import { $, esc, num } from "../lib/dom";
import { clamp, eio, mix, reducedMotion, tween } from "../lib/motion";

const SERIES = "#1E88C7";
const FORECAST = "#6FB0DA";
const GREY = "#C9CBDA";
const GRID = "#E6E7EF";
const INK = "#1F2350";
const INK2 = "#4B5080";

const W = 640;
const H = 320;
const M = { l: 54, r: 18, t: 40, b: 44 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;
const YMAX = 8000;

const MON_HI = ["जन.", "फ़र.", "मार्च", "अप्रै.", "मई", "जून", "जुला.", "अग.", "सित.", "अक्टू.", "नवं.", "दिसं."];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dHi = (iso: string) => `${Number(iso.slice(8, 10))} ${MON_HI[Number(iso.slice(5, 7)) - 1]}`;
const dEn = (iso: string) => `${Number(iso.slice(8, 10))} ${MON_EN[Number(iso.slice(5, 7)) - 1]}`;

type Pt = [number, number];
const segs = (pts: Pt[]) => {
  const out: [Pt, Pt, Pt, Pt][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    out.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2]);
  }
  return out;
};
const bz = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]) as Pt;
};

export function initRiver(g: Gauges): void {
  const host = $("#river-chart");
  const data = g.glofas.series;
  const n = data.length;
  const slot = PW / n;
  const bw = Math.min(24, slot - 2);
  const x = (i: number) => M.l + slot * i + slot / 2;
  const y = (q: number) => M.t + PH * (1 - q / YMAX);
  const base = M.t + PH;
  const pts: Pt[] = data.map((d, i) => [x(i), y(d.q)]);
  const peakI = data.reduce((best, d, i) => (d.q > data[best].q ? i : best), 0);
  const todayI = data.findIndex((d) => d.forecast) - 1;

  // sampled smooth line, to draw it progressively
  const samples: { p: Pt; i: number }[] = [{ p: pts[0], i: 0 }];
  segs(pts).forEach((s, i) => {
    for (let j = 1; j <= 8; j++) samples.push({ p: bz(s[0], s[1], s[2], s[3], j / 8), i: i + (j === 8 ? 1 : 0) });
  });
  const fcSample = todayI * 8; // the sample index of today's point

  const grid = [0, 2000, 4000, 6000, 8000]
    .map((v) => `<path d="M${M.l} ${y(v)}H${W - M.r}" stroke="${v === 0 ? INK2 : GRID}" stroke-width="1"/>
      <text x="${M.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="${INK2}">${num(v)}</text>`)
    .join("");
  const ticks = [0, 14, peakI, todayI]
    .map((i) => `<text x="${x(i)}" y="${base + 20}" text-anchor="middle" font-size="12" fill="${INK2}"><tspan class="hi">${dHi(data[i].date)}</tspan><tspan class="en">${dEn(data[i].date)}</tspan></text>`)
    .join("");

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="rc-title rc-desc" tabindex="0">
    <title id="rc-title">Gandak discharge near Rewaghat, 1 September to 16 October 2026</title>
    <desc id="rc-desc">Daily model discharge in cubic metres per second. It rises from about 3,250 on 25 September to a peak of 7,515 on 29 September, the night the embankment broke at Haijalpur, then falls to about 3,840 on 10 October. Days after 10 October are forecast.</desc>
    ${grid}
    <path class="today" d="M${x(todayI) + slot / 2} ${M.t - 6}V${base}" stroke="${INK2}" stroke-width="1"/>
    <text x="${x(todayI) + slot / 2 + 4}" y="${M.t - 10}" font-size="12" fill="${INK2}"><tspan class="hi">आज</tspan><tspan class="en">Today</tspan> <tspan class="hi">→ पूर्वानुमान</tspan><tspan class="en">→ forecast</tspan></text>
    <g class="bars"></g>
    <path class="area" fill="${SERIES}" opacity="0"/>
    <path class="line" fill="none" stroke="${SERIES}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path class="line-fc" fill="none" stroke="${FORECAST}" stroke-width="2" stroke-dasharray="5 5" stroke-linecap="round"/>
    <g class="marks"></g>
    <g class="peak-label" opacity="1">
      <path d="M${x(peakI)} ${y(data[peakI].q) - 8}V${M.t - 14}h18" fill="none" stroke="${INK}" stroke-width="1.2"/>
      <text x="${x(peakI) + 22}" y="${M.t - 10}" font-size="13" fill="${INK}"><tspan class="hi">29 सितंबर: ${num(data[peakI].q)}। उस रात हैजलपुर में बाँध टूटा।</tspan><tspan class="en">29 Sep: ${num(data[peakI].q)}. The embankment broke at Haijalpur that night.</tspan></text>
    </g>
    ${ticks}
    <path class="cross" d="" stroke="${INK}" stroke-width="1" opacity="0"/>
    <g class="hits"></g>
  </svg>
  <div class="tip" role="status" hidden></div>
  <details class="table-view tiny"><summary><span class="hi">आँकड़े तालिका में</span><span class="en solo">Data as a table</span></summary>
    <table><thead><tr><th><span class="hi">तारीख़</span><span class="en solo">Date</span></th><th>m³/s</th></tr></thead>
    <tbody>${data.map((d) => `<tr><td>${esc(d.date)}${d.forecast ? " *" : ""}</td><td>${num(d.q)}</td></tr>`).join("")}</tbody></table>
    <p>* <span class="hi">पूर्वानुमान</span><span class="en solo">forecast</span></p>
  </details>`;

  const svg = host.querySelector("svg")!;
  const barsG = svg.querySelector<SVGGElement>(".bars")!;
  const line = svg.querySelector<SVGPathElement>(".line")!;
  const lineFc = svg.querySelector<SVGPathElement>(".line-fc")!;
  const area = svg.querySelector<SVGPathElement>(".area")!;
  const marks = svg.querySelector<SVGGElement>(".marks")!;
  const cross = svg.querySelector<SVGPathElement>(".cross")!;
  const hits = svg.querySelector<SVGGElement>(".hits")!;
  const tip = host.querySelector<HTMLDivElement>(".tip")!;

  // A column with a 4px rounded data-end, square at the baseline.
  const col = (cx: number, top: number, w: number) => {
    const r = Math.min(4, w / 2, (base - top) / 2);
    const l = cx - w / 2;
    return `M${l.toFixed(2)} ${base}V${(top + r).toFixed(2)}a${r} ${r} 0 0 1 ${r} -${r}H${(l + w - r).toFixed(2)}a${r} ${r} 0 0 1 ${r} ${r}V${base}z`;
  };

  let p = 0; // 0 = daily columns, 1 = trend line
  const render = () => {
    let bars = "";
    data.forEach((d, i) => {
      const ki = eio(p * 1.5 - (i / n) * 0.5);
      const w = bw + (2.5 - bw) * ki;
      const baseCol = d.forecast ? FORECAST : SERIES;
      const fill = mix(baseCol, GREY, ki);
      bars += `<path d="${col(x(i), y(d.q), w)}" fill="${fill}" opacity="${(1 - 0.55 * ki).toFixed(2)}"/>`;
    });
    barsG.innerHTML = bars;
    const lk = clamp((p - 0.2) / 0.7);
    const cut = Math.floor(lk * (samples.length - 1));
    const obs = samples.slice(0, Math.min(cut, fcSample) + 1).map((s) => s.p);
    const fc = cut > fcSample ? samples.slice(fcSample, cut + 1).map((s) => s.p) : [];
    const poly = (a: Pt[]) => (a.length > 1 ? "M" + a.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join("L") : "");
    line.setAttribute("d", poly(obs));
    lineFc.setAttribute("d", poly(fc));
    const all = samples.slice(0, cut + 1).map((s) => s.p);
    area.setAttribute("d", all.length > 1 ? `${poly(all)}L${all[all.length - 1][0]} ${base}L${all[0][0]} ${base}Z` : "");
    area.setAttribute("opacity", (0.1 * eio(lk)).toFixed(3));
    const dot = (i: number, show: number) =>
      show > 0
        ? `<circle cx="${x(i)}" cy="${y(data[i].q)}" r="${(6 * show).toFixed(2)}" fill="#fff"/><circle cx="${x(i)}" cy="${y(data[i].q)}" r="${(4.5 * show).toFixed(2)}" fill="${SERIES}"/>`
        : "";
    marks.innerHTML = dot(peakI, clamp((lk - 0.62) / 0.12)) + dot(todayI, clamp((lk - 0.86) / 0.1));
  };
  render();

  // ---- hover and keyboard: per-column tooltip on columns, crosshair on the line ----
  hits.innerHTML = data
    .map((_, i) => `<rect x="${(M.l + slot * i).toFixed(2)}" y="${M.t}" width="${slot.toFixed(2)}" height="${PH}" fill="transparent" data-i="${i}"/>`)
    .join("");
  let active = -1;
  const show = (i: number) => {
    active = i;
    const d = data[i];
    const r = svg.getBoundingClientRect();
    const sx = r.width / W;
    tip.hidden = false;
    tip.textContent = "";
    const v = document.createElement("strong");
    v.textContent = `${num(d.q)} m³/s`;
    const lab = document.createElement("span");
    lab.textContent = `${d.date}${d.forecast ? " (forecast)" : ""}`;
    tip.append(v, lab);
    const left = x(i) * sx;
    tip.style.left = `${Math.min(r.width - 120, Math.max(0, left - 60))}px`;
    tip.style.top = `${Math.max(0, y(d.q) * sx - 58)}px`;
    cross.setAttribute("d", p > 0.5 ? `M${x(i)} ${M.t}V${base}` : "");
    cross.setAttribute("opacity", p > 0.5 ? "0.5" : "0");
    hits.querySelectorAll("rect").forEach((h, k) => h.setAttribute("fill", k === i && p <= 0.5 ? "rgba(31,35,80,0.06)" : "transparent"));
  };
  const hide = () => {
    active = -1;
    tip.hidden = true;
    cross.setAttribute("opacity", "0");
    hits.querySelectorAll("rect").forEach((h) => h.setAttribute("fill", "transparent"));
  };
  hits.addEventListener("pointermove", (e) => {
    const t = e.target as SVGRectElement;
    if (t.dataset.i) show(Number(t.dataset.i));
  });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = active < 0 ? peakI : clamp(active + (e.key === "ArrowRight" ? 1 : -1), 0, n - 1);
      show(next);
    } else if (e.key === "Escape") hide();
  });
  svg.addEventListener("blur", hide);

  // ---- the morph toggle ----
  const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("#river-card .seg button"));
  let busy = false;
  btns.forEach((b) =>
    b.addEventListener("click", async () => {
      const target = b.dataset.mode === "line" ? 1 : 0;
      if (busy || target === Math.round(p)) return;
      btns.forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      busy = true;
      hide();
      const from = p;
      if (reducedMotion()) {
        p = target;
        render();
      } else {
        await tween(1100, (k) => {
          p = from + (target - from) * eio(k);
          render();
        });
      }
      p = target;
      render();
      busy = false;
    }),
  );
}
