// "Replay the night": the night of 29-30 September at Haijalpur, km 14, as Baandh Prahari
// would have run it. Like the motion kit, every frame is a pure function of t (seek(t)),
// so it can be paused, scrubbed, and recorded for the video.
//
// Kit effects used here: 01 button to player (opening), 10 elastic type (the shout),
// 11 text to layout (transcript to report), 14 glass focus (the log), 15 flowing paths
// (the ladder), 16 particles (homes ready in the counter).
import { api } from "../api";
import { Ghadi } from "../art/ghadi";
import { icon } from "../art/icons";
import { C } from "../art/palette";
import { face } from "../art/people";
import { NIGHT, nightScene, rr } from "../art/scene";
import { $, bi, bil, clockEn, clockHi, esc, h } from "../lib/dom";
import { clamp, eio, eo, lerp, mix, reducedMotion, seg, spring } from "../lib/motion";
import type { Execution, Timeline, TimelineEvent } from "../types";

// ---------- time ----------
const BASE = Date.parse("2026-09-29T23:39:50+05:30");
const sec = (iso: string) => (Date.parse(iso) - BASE) / 1000;
const iso = (s: number) => new Date(BASE + s * 1000).toISOString();

// replay seconds -> story seconds since 23:39:50
const ANCHORS: [number, number][] = [
  [0, 0], [2.5, 22], [9, 62], [11, 76], [23, 673], [27, 792], [29, 810], [35, 3350], [39, 4330],
  [45, 9030], [48, 9110], [55, 11410], [59, 13210], [64, 21610], [66, 21670], [72, 21670],
];
export const DURATION = 72;
function storyAt(t: number): number {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [t1, s1] = ANCHORS[i];
    const [t0, s0] = ANCHORS[i - 1];
    if (t <= t1) return lerp(s0, s1, (t - t0) / (t1 - t0 || 1));
  }
  return ANCHORS[ANCHORS.length - 1][1];
}
function replayAt(s: number): number {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [t1, s1] = ANCHORS[i];
    const [t0, s0] = ANCHORS[i - 1];
    if (s <= s1) return lerp(t0, t1, (s - s0) / (s1 - s0 || 1));
  }
  return DURATION;
}

// key story moments (seconds since 23:39:50)
const S = {
  report: 22, draft: 41, confirm: 60, p1: 61, taiyaar: 72, pageJE: 73, climb: 673, aeRead: 740,
  answer: 792, dispatch: 805, onsite: 3350, bags0: 3610, bags1: 4330, slump: 9030, breachOk: 9100,
  nikal: 9105, district: 9106, districtOk: 9200, walk0: 9130, walk1: 11410, breach: 13210,
  dawn0: 21000, dawn1: 21610, close: 21610, done: 21670,
};

const CHAPTERS = [
  { t: 2.4, hi: "प्रहरी की वॉइस नोट", en: "A voice note from the patrol", time: S.report },
  { t: 9.6, hi: "P1, और गाँव को 'तैयार रहें'", en: "P1; the village is told to get ready", time: S.taiyaar },
  { t: 22.7, hi: "जेई चुप, बात एई तक", en: "No answer; it climbs", time: S.climb, tone: "late" },
  { t: 26.7, hi: "एई: मैं जा रहा हूँ", en: "\"On my way\"", time: S.answer, tone: "ok" },
  { t: 34.6, hi: "एई मौके पर, घेरे के अंदर", en: "Engineer on site, inside the geofence", time: S.onsite },
  { t: 44.8, hi: "ऊपर धँसाव, निकल चलो", en: "The top slumps: move now", time: S.slump, tone: "late" },
  { t: 63.4, hi: "सुबह: रिपोर्ट अपने आप", en: "Morning: the report writes itself", time: S.close },
];

// ---------- the night scene, as a function of story seconds ----------
interface NightEls {
  sky: SVGRectElement; stars: SVGPathElement[]; moon: SVGGElement; sun: SVGGElement;
  water: SVGPathElement; wave: SVGPathElement; glints: SVGGElement; bank: SVGPathElement;
  crack: SVGPathElement; flood: SVGPathElement; beam: SVGPathElement; fence: SVGEllipseElement;
  fenceLabel: SVGTextElement; spout: SVGGElement; ripple: SVGEllipseElement; ring: SVGEllipseElement;
  drops: SVGCircleElement[]; bags: SVGGElement[]; win: SVGRectElement; waves: SVGGElement; wavePaths: SVGPathElement[];
  sacks: SVGGElement[]; cow: SVGGElement; tractor: SVGGElement; bike: SVGGElement; pin: SVGGElement;
  walkers: SVGGElement[]; je: SVGGElement; ae: SVGGElement; jeScreen: SVGRectElement; jeBuzz: SVGPathElement;
  zzz: SVGTextElement; noStamp: SVGGElement; aeScreen: SVGRectElement; aeOk: SVGGElement;
}

function grabNight(svg: SVGSVGElement): NightEls {
  const q = <T extends Element>(id: string) => svg.querySelector<T>(`#${id}`)!;
  // A bamboo machaan without sacks, and three sacks that will be lifted onto it.
  const N = NIGHT;
  const mx = N.machaanX;
  const mach = svg.querySelector("#ns-machaan")!;
  mach.outerHTML = `<g id="ns-machaan2">
      <path d="M${mx + 4} ${N.ground}V${N.ground - 34}M${mx + 28} ${N.ground}V${N.ground - 34}M${mx + 52} ${N.ground}V${N.ground - 34}" stroke="${C.neel}" stroke-width="3" stroke-linecap="round"/>
      <rect x="${mx - 2}" y="${N.ground - 40}" width="60" height="7" rx="2" fill="${C.haldi}" stroke="${C.neel}" stroke-width="2.2"/>
    </g>`;
  const sackG = svg.querySelector("#ns-sacks")!;
  sackG.innerHTML = [0, 1, 2]
    .map(
      (i) => `<g class="sack" data-i="${i}"><path d="M-9 0c-1-7 1-12 4.6-13.6l1-2.2h6.8l1 2.2C8 -12 10 -7 9 0z" fill="${C.white}" stroke="${C.neel}" stroke-width="2" stroke-linejoin="round"/><path d="M-3.6 -15.4h7.2" stroke="${C.mittiDeep}" stroke-width="2" stroke-linecap="round"/></g>`,
    )
    .join("");
  return {
    sky: q("ns-sky"), stars: Array.from(svg.querySelectorAll<SVGPathElement>(".star")), moon: q("ns-moon"), sun: q("ns-sun"),
    water: q("ns-water"), wave: q("ns-wave"), glints: q("ns-glints"), bank: q("ns-bank"), crack: q("ns-crack"), flood: q("ns-flood"),
    beam: q("ns-beam"), fence: q("ns-fence"), fenceLabel: q("ns-fencelabel"), spout: q("ns-boil-spout"), ripple: q("ns-boil-ripple"),
    ring: q("ns-boil-ring"), drops: [1, 2, 3].map((i) => q<SVGCircleElement>(`ns-boil-d${i}`)),
    bags: Array.from(svg.querySelectorAll<SVGGElement>(".bag")), win: q("ns-hut-win"),
    waves: q("ns-speaker-waves"), wavePaths: Array.from(svg.querySelectorAll<SVGPathElement>("#ns-speaker-waves path")),
    sacks: Array.from(svg.querySelectorAll<SVGGElement>(".sack")), cow: q("ns-cow"), tractor: q("ns-tractor"), bike: q("ns-bike"),
    pin: q("ns-pin"), walkers: [0, 1, 2, 3, 4, 5].map((i) => q<SVGGElement>(`ns-p${i}`)), je: q("ns-je"), ae: q("ns-ae"),
    jeScreen: q("ns-jescreen"), jeBuzz: q("ns-jebuzz"), zzz: q("ns-zzz"), noStamp: q("ns-nostamp"), aeScreen: q("ns-aescreen"), aeOk: q("ns-aeok"),
  };
}

const polyAt = (pts: [number, number][], u: number): [number, number] => {
  const segLen = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = segLen.reduce((a, b) => a + b, 0);
  let d = clamp(u) * total;
  for (let i = 0; i < segLen.length; i++) {
    if (d <= segLen[i]) {
      const k = d / segLen[i];
      return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)];
    }
    d -= segLen[i];
  }
  return pts[pts.length - 1];
};

/** Draws the night at story seconds s; t is replay seconds, for small idle motions. */
function drawNight(e: NightEls, s: number, t: number): void {
  const N = NIGHT;
  const G = N.ground;
  const dawn = eio(seg(s, S.dawn0, S.dawn1));
  e.sky.setAttribute("fill", mix(C.raat, "#F7D9B5", dawn));
  e.stars.forEach((st, i) => st.setAttribute("opacity", ((1 - dawn) * (0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7))).toFixed(2)));
  e.moon.setAttribute("opacity", (1 - dawn).toFixed(2));
  e.sun.setAttribute("opacity", dawn.toFixed(2));
  e.sun.setAttribute("transform", `translate(0 ${(40 * (1 - dawn)).toFixed(1)})`);

  // river
  const breach = eo(seg(s, S.breach, S.breach + 300));
  const level = 300 - 8 * seg(s, 0, S.breach) + 10 * eo(seg(s, S.breach, S.breach + 2400)) + Math.sin(t * 1.5) * 1.4;
  const bx = 300 + ((G - level) * 72) / 130;
  e.water.setAttribute("d", `M16 ${level.toFixed(1)}H${bx.toFixed(1)}L300 ${G}L270 470C200 510 80 512 16 506Z`);
  const ph = (t * 18) % 28;
  let wv = `M${(16 - 28 + ph).toFixed(1)} ${level.toFixed(1)}`;
  for (let x = 16 - 28 + ph; x < bx; x += 14) wv += "q3.5 -3.4 7 0t7 0";
  e.wave.setAttribute("d", wv);
  e.glints.innerHTML = [[60, 26], [118, 44], [170, 30], [90, 70], [220, 58]]
    .map(([x, dy], i) => `<path d="M${x} ${(level + dy).toFixed(1)}h${10 + (i % 2) * 6}" opacity="${(0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i))) * (1 - dawn * 0.6)}"/>`)
    .join("");

  // bank: slumps at 2:10, breaches at 3:20
  const sag = 12 * eo(seg(s, S.slump, S.slump + 600));
  const b = breach;
  let top: string;
  if (b > 0) {
    top = `L${(436 - 6 * b).toFixed(1)} 300L${(446 - 4 * b).toFixed(1)} ${(300 + 122 * b).toFixed(1)}L${(470 + 4 * b).toFixed(1)} ${(300 + 122 * b).toFixed(1)}L${(480 + 6 * b).toFixed(1)} 300`;
  } else {
    top = `L436 300L456 ${(300 + sag).toFixed(1)}L476 300`;
  }
  e.bank.setAttribute("d", `M${N.riverToe} ${G}L${N.topL} 300${top}L${N.topR} 300L${N.landToe} ${G}Z`);
  e.crack.setAttribute("d", "M438 301l6 7 6-6 6 8 6-7 6 6");
  e.crack.setAttribute("opacity", (seg(s, S.slump, S.slump + 60) * (1 - b)).toFixed(2));
  const f = eo(seg(s, S.breach, S.breach + 2400));
  if (b > 0) {
    const nb = 300 + 122 * b;
    e.flood.setAttribute(
      "d",
      `M${(436 - 6 * b).toFixed(1)} ${level.toFixed(1)}L${(446 - 4 * b).toFixed(1)} ${nb.toFixed(1)}L${(470 + 4 * b).toFixed(1)} ${nb.toFixed(1)}L${N.landToe} ${(G - 12 * f).toFixed(1)}L${(N.landToe + 230 * f).toFixed(1)} ${(G - 12 * f).toFixed(1)}L${(N.landToe + 236 * f).toFixed(1)} ${G}L${(480 + 6 * b).toFixed(1)} ${G}L${(480 + 6 * b).toFixed(1)} 300Z`,
    );
    e.flood.setAttribute("opacity", "0.9");
  } else e.flood.setAttribute("opacity", "0");

  // the torch on the boil, until the bank goes
  const beamOn = s >= S.report - 18 && b < 0.5 ? 1 : 0;
  e.beam.setAttribute("d", `M518 262L604 ${G - 2}L672 ${G}Z`);
  e.beam.setAttribute("opacity", (beamOn * (0.2 + 0.04 * Math.sin(t * 13))).toFixed(3));

  // the boil
  const bagsDone = seg(s, S.bags0, S.bags1);
  const boilScale = b > 0.3 ? 0 : lerp(1, 0.5, bagsDone) * (1 + Math.sin(t * 8.2) * 0.07);
  e.spout.setAttribute("transform", `translate(${N.boilX} ${G - 8}) scale(1 ${boilScale.toFixed(3)})`);
  e.drops.forEach((d, i) => {
    const u = ((t + i * 0.37) % 1.1) / 1.1;
    const dir = i === 1 ? 1 : -1;
    d.setAttribute("cx", (N.boilX + dir * (6 + 22 * u) * (i === 2 ? 0.5 : 1)).toFixed(1));
    d.setAttribute("cy", (G - 40 * u * boilScale + 46 * u * u - 6).toFixed(1));
    d.setAttribute("opacity", boilScale > 0.4 ? (1 - u).toFixed(2) : "0");
  });
  const ru = (t % 1.6) / 1.6;
  e.ripple.setAttribute("rx", (22 + 18 * ru).toFixed(1));
  e.ripple.setAttribute("opacity", boilScale > 0 ? (0.6 * (1 - ru)).toFixed(2) : "0");
  e.ring.setAttribute("opacity", s >= S.report && s < S.onsite ? "1" : "0");
  e.ring.style.transform = `scale(${(1 + Math.sin(t * 3) * 0.04).toFixed(3)})`;

  // 200 m geofence: red while waiting, green on ENTER
  const fenceOn = s >= S.p1 && b < 1 ? 1 : 0;
  const entered = s >= S.onsite;
  e.fence.setAttribute("opacity", String(fenceOn * (entered ? 0.9 : 0.75)));
  e.fence.setAttribute("stroke", entered ? C.dhaan : C.sindoor);
  e.fenceLabel.setAttribute("opacity", String(fenceOn));
  e.fenceLabel.querySelectorAll("tspan").forEach((ts, i) => {
    ts.textContent = i === 0 ? (entered ? "200 मी. घेरा: एई अंदर" : "200 मी. घेरा") : entered ? "200 m geofence: engineer inside" : "200 m geofence";
  });

  // sandbags ringed around the boil, one by one
  e.bags.forEach((g, i) => {
    const at = S.bags0 + (i * (S.bags1 - S.bags0)) / 9;
    const k = s >= at ? spring(t - replayAt(at), 0.45, 12) : 0;
    g.style.transform = `scale(${Math.max(0, k).toFixed(3)})`;
    g.style.opacity = s >= at ? "1" : "0";
  });

  // the village: lamps on at "get ready", red at "move now", dark once everyone has left
  const win = s < S.taiyaar ? C.neel : s < S.nikal ? (Math.sin(t * 9) > -0.6 ? C.kesar : C.haldi) : s < S.walk1 ? (Math.sin(t * 7) > 0 ? C.sindoor : C.kesarTint) : C.neel2;
  e.win.setAttribute("fill", win);
  const speak = (s >= S.taiyaar && s < S.taiyaar + 400) || (s >= S.nikal && s < S.nikal + 700);
  e.waves.setAttribute("opacity", speak ? (0.5 + 0.5 * Math.sin(t * 6)).toFixed(2) : "0");
  e.wavePaths.forEach((p) => p.setAttribute("stroke", s >= S.nikal ? C.sindoor : C.haldi));

  // grain and seed onto the machaan (23:44 to 23:52)
  e.sacks.forEach((g, i) => {
    const k = eio(seg(s, S.taiyaar + 170 + i * 140, S.taiyaar + 420 + i * 140));
    const from: [number, number] = [N.hutX + 4 - i * 12, G];
    const to: [number, number] = [N.machaanX + 8 + i * 20, G - 40];
    const x = lerp(from[0], to[0], k);
    const y = lerp(from[1], to[1], k) - Math.sin(Math.PI * k) * 26;
    g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  });

  // the cow walks up to the mound (23:45 to 23:58)
  const ck = eio(seg(s, 310, 1090));
  const [cx, cy] = polyAt([[N.hutX + 40, G], [N.moundX - 14, G], [N.moundX + 30, G - 46], [N.moundX + 34, G - 50]], ck);
  const walking = ck > 0 && ck < 1;
  e.cow.setAttribute("transform", `translate(${(cx - 20).toFixed(1)} ${(cy - 36 - (walking ? Math.abs(Math.sin(t * 9)) * 2 : 0)).toFixed(1)})`);

  // the embankment ambulance and the engineer's motorbike arrive
  const tk = eo(seg(s, S.dispatch, S.dispatch + 2100));
  e.tractor.setAttribute("transform", `translate(${lerp(1000, 690, tk).toFixed(1)} ${G - 40 + (tk > 0 && tk < 1 ? Math.sin(t * 20) * 0.8 : 0)})`);
  const bk = eo(seg(s, 2410, S.onsite));
  e.bike.setAttribute("transform", `translate(${lerp(1000, 652, bk).toFixed(1)} ${G - 34})`);
  const pinT = t - replayAt(S.onsite);
  e.pin.setAttribute("opacity", s >= S.onsite && s < S.onsite + 2600 ? "1" : "0");
  e.pin.setAttribute("transform", `translate(${652} ${(G - 92 - 40 * (1 - clamp(spring(pinT, 0.4, 11), 0, 2))).toFixed(1)})`);

  // families walk to the relief camp on the mound (2:12 to 2:50)
  e.walkers.forEach((g, i) => {
    const st = S.walk0 + i * 160;
    const k = seg(s, st, st + 1500);
    const path: [number, number][] = [[N.hutX + 20, G], [N.moundX - 18, G], [N.moundX + 30, G - 50], [N.tentX + 6 + (i - 2.5) * 9, G - 52]];
    const [x, y] = polyAt(path, eio(k));
    g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    g.setAttribute("opacity", s >= st ? "1" : "0");
    const swing = k > 0 && k < 1 ? Math.sin(t * 14 + i) * 18 : 0;
    g.querySelector(".leg-a")?.setAttribute("transform", `rotate(${swing.toFixed(1)} -3 -8)`);
    g.querySelector(".leg-b")?.setAttribute("transform", `rotate(${(-swing).toFixed(1)} 3 -8)`);
  });

  // the two cut-away panels: the junior engineer asleep, the assistant engineer answering
  const pop = (el: SVGGElement, from: number, to: number) => {
    const inK = s >= from ? spring(t - replayAt(from), 0.5, 12) : 0;
    const out = s >= to ? clamp(1 - (t - replayAt(to)) / 0.35) : 1;
    const k = Math.max(0, inK * out);
    el.style.transform = `scale(${k.toFixed(3)})`;
    el.style.opacity = k > 0.02 ? "1" : "0";
  };
  pop(e.je, S.pageJE - 2, S.answer + 60);
  pop(e.ae, S.climb, S.answer + 1200);
  const jeBuzzing = s >= S.pageJE && s < S.climb;
  e.jeScreen.setAttribute("fill", jeBuzzing ? (Math.sin(t * 16) > 0 ? C.kesar : C.haldiTint) : C.neel2);
  e.jeBuzz.setAttribute("opacity", jeBuzzing && Math.sin(t * 30) > 0 ? "1" : "0");
  e.zzz.setAttribute("transform", `translate(0 ${(Math.sin(t * 2) * 3).toFixed(1)})`);
  const ns = s >= S.climb ? spring(t - replayAt(S.climb), 0.4, 12) : 0;
  e.noStamp.setAttribute("opacity", s >= S.climb ? "1" : "0");
  e.noStamp.style.transform = `scale(${(1.8 - 0.8 * ns).toFixed(3)})`;
  const aeBuzz = s >= S.climb && s < S.aeRead;
  e.aeScreen.setAttribute("fill", aeBuzz ? (Math.sin(t * 16) > 0 ? C.kesar : C.haldiTint) : s >= S.aeRead ? C.dhaanTint : C.neel2);
  const ok = s >= S.answer ? spring(t - replayAt(S.answer), 0.42, 11) : 0;
  e.aeOk.setAttribute("opacity", s >= S.answer ? "1" : "0");
  e.aeOk.style.transform = `scale(${Math.max(0, ok).toFixed(3)})`;
}

// ---------- phones ----------
interface Msg {
  s: number;
  side: "in" | "out";
  html: string;
  late?: boolean;
}

const wave = (n: number) => `<span class="wave">${Array.from({ length: n }, (_, i) => `<i style="height:${6 + ((i * 7) % 12)}px"></i>`).join("")}</span>`;
const boilPic = `<span class="pic"><svg viewBox="0 0 64 46" aria-hidden="true"><rect width="64" height="46" fill="${C.raat}"/><path d="M0 40h64" stroke="${C.mittiTint}" stroke-width="2"/><path d="M18 40q14-10 28 0z" fill="${C.mittiTint}"/><path d="M28 38c-1-8 1-14 4-19 3 5 5 11 4 19z" fill="${C.boil}" stroke="${C.neel}" stroke-width="1.4"/></svg></span>`;

function phoneA(): Msg[] {
  return [
    { s: S.report, side: "out", html: `<div class="media">${icon("play")}${wave(16)}<span class="tiny">0:07</span></div><div class="media">${boilPic}<span class="tiny">📍 ${bil("किमी 14 के पास", "near km 14")}</span></div><span class="meta">${clockHi(iso(S.report))}</span>` },
    { s: S.draft, side: "in", html: `<span class="pair">${bi("मसौदा: किमी 14, ज़मीन वाली ढलान के नीचे मिट्टी वाला उबाल। सही है?", "Draft: km 14, a boil carrying soil at the land-side toe. Is that right?")}</span><div class="wa-btns"><span>${bil("हाँ, यही", "Yes, this")}</span><span>${bil("दूसरा संकेत", "Another sign")}</span></div>` },
    { s: S.confirm, side: "out", html: `<span>${bil("हाँ, यही", "Yes, this")}</span>` },
    { s: S.p1 + 1, side: "in", html: `<span class="pair">${bi("P1 दर्ज। गाँवों को 'तैयार रहें' भेजा। जेई को पेज किया: 10 मिनट में जवाब।", "P1 logged. The villages were told to get ready. The junior engineer is paged: 10 minutes to answer.")}</span>` },
    { s: S.climb + 1, side: "in", late: true, html: `<span class="pair">${bi("जेई ने 10 मिनट में जवाब नहीं दिया। अब एई को भेजा, ईई को कॉपी।", "No answer from the junior engineer in 10 minutes. Sent to the assistant engineer; the executive engineer is copied.")}</span>` },
    { s: S.answer + 1, side: "in", html: `<span class="pair">${bi("एई आ रहे हैं। बाँध एम्बुलेंस (10 मज़दूर) और 400 बोरियाँ रवाना।", "The assistant engineer is on the way. The embankment ambulance (10 workers) and 400 sandbags are dispatched.")}</span>` },
    { s: S.onsite + 1, side: "in", html: `<span class="pair">${bi("एई मौके पर पहुँचे, जगह से 120 मी.।", "The assistant engineer is on site, 120 m from the spot.")}</span>` },
    { s: S.slump, side: "out", html: `<div class="media">${icon("play")}${wave(12)}<span class="tiny">0:05</span></div><span class="pair">${bi("ऊपर से बाँध धँस रहा है", "The top of the bank is slumping")}</span>` },
    { s: S.nikal + 1, side: "in", late: true, html: `<span class="pair">${bi("एई ने टूटने की पुष्टि की। गाँवों को 'निकल चलो' भेजा। ज़िला को पेज किया।", "The engineer confirmed the breach. The villages were told to move. The district is paged.")}</span>` },
    { s: S.done, side: "in", html: `<span class="pair">${bi("रिपोर्ट बन गई। आपकी रिपोर्ट से 3 गाँवों को 1 मिनट में ख़बर मिली। धन्यवाद।", "The report is ready. Your report got word to 3 villages within a minute. Thank you.")}</span>` },
  ];
}

function phoneB(): Msg[] {
  return [
    { s: S.taiyaar, side: "in", html: `<span class="lvl" data-level="taiyaar">${bil("तैयार रहें", "Get ready")}</span><div class="media">${icon("play")}${wave(18)}<span class="tiny">0:18</span></div>
      <span class="pair">${bi("किमी 14 पर बाँध में ख़तरा। अनाज, बीज और चारा मचान पर। मवेशी ऊँची जगह। कागज़ात साथ। बुज़ुर्ग और बच्चे ऊँचाई के पास वाले घर में।", "Danger at km 14. Grain, seed and fodder onto the machaan. Cattle to high ground. Papers on you. The elderly and children at the house nearest high ground.")}</span>
      <div class="wa-btns"><span>${bil("हो गया", "Done")}</span></div>` },
    { s: S.taiyaar + 1, side: "in", html: `<div class="counter" data-counter="taiyaar"><span class="pair small">${bi("वार्ड 7 के 25 घरों को भेजा। 'हो गया' की गिनती:", "Sent to the 25 homes of ward 7. Homes that tapped Done:")}</span><span class="big">0/25</span><span class="dots">${"<i></i>".repeat(25)}</span></div>` },
    { s: S.nikal, side: "in", html: `<span class="lvl" data-level="nikal_chalo">${bil("निकल चलो", "Move now")}</span><div class="media">${icon("play")}${wave(18)}<span class="tiny">0:16</span></div>
      <span class="pair">${bi("राहत शिविर: पंचायत भवन (नमूना)। सबसे कमज़ोर पहले। बिजली का मेन स्विच बंद। कागज़ात साथ।", "Relief camp: the panchayat bhawan (sample). The most vulnerable first. Power off at the main. Take the papers.")}</span>
      <div class="wa-btns"><span>${bil("हो गया", "Done")}</span></div>` },
    { s: S.nikal + 2, side: "in", html: `<div class="counter red" data-counter="nikal_chalo"><span class="pair small">${bi("शिविर पहुँचे घर:", "Homes at the camp:")}</span><span class="big">0/25</span><span class="dots">${"<i></i>".repeat(25)}</span></div>` },
    { s: S.done, side: "in", html: `<span class="pair">${bi("बाँध टूटा, पर वार्ड 7 के 22 घर शिविर में थे और 23 घरों का अनाज ऊपर था। तारीख़ वाला रिकॉर्ड राहत सूची के लिए सुरक्षित है।", "The bank broke, but 22 homes of ward 7 were at the camp and 23 had their grain up. The dated record is kept for the relief list.")}</span>` },
  ];
}

// ---------- the ladder (flowing paths) ----------
const LN = {
  prahari: { x: 70, y: 74, face: "prahari", hi: "प्रहरी", en: "Patrol" },
  rules: { x: 214, y: 74, face: "rules", hi: "नियम", en: "Rules" },
  village: { x: 372, y: 28, face: "village", hi: "3 गाँव", en: "3 villages" },
  je: { x: 372, y: 122, face: "je", hi: "जेई", en: "JE" },
  ae: { x: 530, y: 122, face: "ae", hi: "एई", en: "AE" },
  ee: { x: 688, y: 122, face: "ee", hi: "ईई (कॉपी)", en: "EE (cc)" },
  district: { x: 860, y: 74, face: "dm", hi: "ज़िला", en: "District" },
} as const;
type LK = keyof typeof LN;
const EDGES: { a: LK; b: LK; at: number[]; dash?: boolean }[] = [
  { a: "prahari", b: "rules", at: [S.report, S.slump] },
  { a: "rules", b: "village", at: [S.taiyaar, S.nikal] },
  { a: "rules", b: "je", at: [S.pageJE] },
  { a: "je", b: "ae", at: [S.climb] },
  { a: "ae", b: "ee", at: [S.climb], dash: true },
  { a: "ae", b: "district", at: [S.district] },
];
const edgePath = (a: LK, b: LK) => {
  const A = LN[a];
  const B = LN[b];
  const x1 = A.x + 44;
  const x2 = B.x - 44;
  const m = (x1 + x2) / 2;
  return { d: `M${x1} ${A.y}C${m} ${A.y} ${m} ${B.y} ${x2} ${B.y}`, p: (t: number): [number, number] => {
    const u = 1 - t;
    const P = [[x1, A.y], [m, A.y], [m, B.y], [x2, B.y]];
    return [0, 1].map((k) => u * u * u * P[0][k] + 3 * u * u * t * P[1][k] + 3 * u * t * t * P[2][k] + t * t * t * P[3][k]) as [number, number];
  } };
};

function ladderSvg(): string {
  const nodes = (Object.keys(LN) as LK[])
    .map((k) => {
      const n = LN[k];
      return `<g class="lnode" data-k="${k}">
        <rect class="ring" x="${n.x - 46}" y="${n.y - 20}" width="92" height="40" rx="20" fill="none" stroke="${C.kesar}" stroke-width="2" opacity="0"/>
        <rect class="pill" x="${n.x - 44}" y="${n.y - 18}" width="88" height="36" rx="18" fill="${C.chuna}" stroke="${C.neel}" stroke-width="2"/>
        <svg x="${n.x - 42}" y="${n.y - 16}" width="32" height="32" viewBox="0 0 48 48">${face(n.face).replace(/<svg[^>]*>|<\/svg>/g, "")}</svg>
        <text x="${n.x - 6}" y="${n.y + 5}" font-size="13" fill="${C.neel}"><tspan class="hi">${n.hi}</tspan><tspan class="en">${n.en}</tspan></text>
        <g class="badge" opacity="0"><circle cx="${n.x + 38}" cy="${n.y - 16}" r="10" fill="${C.dhaan}" stroke="${C.neel}" stroke-width="2"/><text class="bt" x="${n.x + 38}" y="${n.y - 11.5}" text-anchor="middle" font-size="13" fill="#fff">✓</text></g>
      </g>`;
    })
    .join("");
  const edges = EDGES.map((e, i) => {
    const { d } = edgePath(e.a, e.b);
    return `<path d="${d}" fill="none" stroke="rgba(255,253,248,.28)" stroke-width="2" ${e.dash ? 'stroke-dasharray="5 5"' : ""}/><path class="lit" data-e="${i}" d="${d}" fill="none" stroke="${C.haldi}" stroke-width="2.6" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>`;
  }).join("");
  return `<svg viewBox="0 0 930 150" role="img" aria-label="Who is asked next: patrol worker, rules, the villages, junior engineer, assistant engineer, executive engineer, district">${edges}<g class="packets"></g>${nodes}</svg>`;
}

// ---------- the theatre ----------
let timeline: Timeline | null = null;
let execution: Execution | null = null;

export function initReplay(): void {
  // poster: the night at 11:51 PM, the minute nobody answered
  const posterHost = $("#poster-art");
  posterHost.innerHTML = nightScene();
  const posterEls = grabNight(posterHost.querySelector("svg")!);
  drawNight(posterEls, 700, 30);

  $("#chapters").innerHTML = CHAPTERS.map(
    (c) => `<li><button type="button" data-replay="${c.t}" data-tone="${c.tone ?? ""}"><span class="t">${clockHi(iso(c.time)).replace(/^(रात|सुबह) /, "$1 ")}</span><span class="d pair">${bi(c.hi, c.en)}</span></button></li>`,
  ).join("");

  document.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-replay]");
    if (!b) return;
    e.preventDefault();
    open(b, Number(b.dataset.replay));
  });
}

let theatre: HTMLElement | null = null;
let api_: ReturnType<typeof buildTheatre> | null = null;

async function open(from: HTMLElement, startT: number) {
  if (!timeline) [timeline, execution] = await Promise.all([api.timeline("INC-0930-14"), api.execution("INC-0930-14")]);
  if (!theatre) {
    api_ = buildTheatre(timeline!, execution!);
    theatre = api_.el;
    document.body.append(theatre);
  }
  await morphOpen(from);
  theatre.hidden = false;
  document.documentElement.style.overflow = "hidden";
  api_!.opener = from;
  api_!.seek(startT);
  api_!.play();
  theatre.querySelector<HTMLButtonElement>(".th-close")!.focus();
}

/** Kit effect 01: the button's shell grows into the player; its play icon becomes pause. */
async function morphOpen(from: HTMLElement) {
  if (reducedMotion()) return;
  const r = from.getBoundingClientRect();
  const shell = h<HTMLDivElement>(`<div class="shell-morph"><svg viewBox="-20 -20 40 40" style="position:absolute;width:44px;height:44px;left:12px;top:50%;margin-top:-22px"><path fill="${C.chuna}" d=""/><path fill="${C.chuna}" d=""/></svg></div>`);
  document.body.append(shell);
  const paths = shell.querySelectorAll("path");
  const svg = shell.querySelector("svg")!;
  const PL = [[-6.5, -8], [0, -4], [0, 4], [-6.5, 8]];
  const PR = [[0, -4], [6.5, 0], [6.5, 0], [0, 4]];
  const QL = [[-6, -7], [-2, -7], [-2, 7], [-6, 7]];
  const QR = [[2, -7], [6, -7], [6, 7], [2, 7]];
  const W = innerWidth;
  const H = innerHeight;
  await new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const p = clamp((now - t0) / 620);
      const k = eio(p);
      const l = lerp(r.left, 0, k);
      const tp = lerp(r.top, 0, k);
      const w = lerp(r.width, W, k);
      const hh = lerp(r.height, H, k);
      Object.assign(shell.style, { left: `${l}px`, top: `${tp}px`, width: `${w}px`, height: `${hh}px`, borderRadius: `${lerp(14, 0, k)}px` });
      // the icon travels to the centre, grows, then morphs into pause
      const cx = lerp(34, w / 2, k);
      svg.style.left = `${cx - 22}px`;
      svg.style.transform = `scale(${lerp(1, 2.4, eo(p))})`;
      const m = eio(seg(p, 0.55, 1));
      const quad = (A: number[][], B: number[][]) => "M" + A.map((pt, i) => `${lerp(pt[0], B[i][0], m)} ${lerp(pt[1], B[i][1], m)}`).join("L") + "Z";
      paths[0].setAttribute("d", quad(PL, QL));
      paths[1].setAttribute("d", quad(PR, QR));
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  setTimeout(() => shell.remove(), 120);
}

function buildTheatre(tl: Timeline, ex: Execution) {
  const el = h<HTMLElement>(`<div class="theatre" role="dialog" aria-modal="true" aria-labelledby="th-title" hidden>
    <div class="th-top">
      <p class="th-title bi" id="th-title"><span class="hi">उस रात: हैजलपुर, किमी 14</span><span class="en">That night: Haijalpur, km 14</span></p>
      <p class="th-clock" aria-live="off"><span class="clk">रात 11:39</span><small class="day"></small></p>
      <button type="button" class="icon-btn th-sound" aria-pressed="false" aria-label="आवाज़ / Sound">${icon("mute")}</button>
      <button type="button" class="icon-btn th-close" aria-label="बंद करें / Close">${icon("close")}</button>
    </div>
    <div class="th-body">
      <div class="th-side left th-panel show" data-panel="a">
        <div class="mini-phone"><div class="phone-top">${face("prahari")}<span>${bil("प्रहरी का फ़ोन", "Patrol worker's phone")}</span></div><div class="thread" data-thread="a"></div></div>
      </div>
      <div class="th-center">
        <div class="th-stage">
          <div class="night-host"></div>
          <svg class="th-overlay t2l-svg" viewBox="0 0 960 540" aria-hidden="true"></svg>
          <div class="th-overlay"><div class="shout" aria-hidden="true"></div></div>
          <p class="th-ghadi-cap" aria-live="polite"></p>
          <div class="th-ghadi"></div>
          <div class="th-end" hidden>
            <div class="card">
              <p class="display h3 bi"><span class="hi">बाँध फिर भी टूटा। पर इस बार गाँव तैयार था।</span><span class="en">The bank still broke. This time the village was ready.</span></p>
              <div class="facts">
                <div><b>11:41</b>${bil("गाँव को ख़बर, रिपोर्ट के 1 मिनट बाद", "The village told, 1 minute after the report")}</div>
                <div><b>11:51</b>${bil("पता था कि जेई ने जवाब नहीं दिया", "Known: the junior engineer hadn't answered")}</div>
                <div><b>22/25</b>${bil("वार्ड 7 के घर शिविर में", "homes of ward 7 at the camp")}</div>
              </div>
              <p class="small pair">${bi("इस साल की विभागीय समीक्षा ने ऐसी बातें एक हफ़्ते बाद पाईं। बाँध प्रहरी उन्हें उसी रात दिखाता है।", "This year's department review found such things a week later. Baandh Prahari shows them that night.")}</p>
              <div class="row"><button type="button" class="btn small th-again">${icon("restart")}${bil("फिर से चलाएँ", "Play again")}</button><button type="button" class="btn small paper th-close2">${bil("बंद करें", "Close")}</button></div>
            </div>
          </div>
        </div>
        <div class="th-now"><span class="t"></span><span class="msg"></span></div>
        <div class="th-ladder">${ladderSvg()}</div>
        <div class="sfn-wrap">
          <p class="sfn-head"><span>${bil("AWS Step Functions: हर इंतज़ार एक स्टेट", "AWS Step Functions: every wait is a state")}</span><code>${esc(ex.executionArn.replace("ACCOUNT_ID", "…"))}</code></p>
          <ul class="sfn">${ex.states.map((s) => `<li><span class="st" data-st="${s.name}"><i></i>${s.name}</span></li>`).join("")}</ul>
        </div>
        <div class="th-tabs" role="tablist">
          <button type="button" role="tab" data-tab="a" aria-selected="true">${bil("प्रहरी", "Patrol")}</button>
          <button type="button" role="tab" data-tab="b" aria-selected="false">${bil("गाँव", "Village")}</button>
          <button type="button" role="tab" data-tab="log" aria-selected="false">${bil("समय-रेखा", "Timeline")}</button>
        </div>
      </div>
      <div class="th-side right">
        <div class="mini-phone th-panel" data-panel="b"><div class="phone-top">${face("ward")}<span>${bil("वार्ड 7 की सदस्य, हैजलपुर", "Ward 7 member, Haijalpur")}</span></div><div class="thread" data-thread="b"></div></div>
        <div class="th-log th-panel" data-panel="log"><p class="th-log-head">${bil("समय-रेखा (DynamoDB)", "Timeline (DynamoDB)")}</p><ol><span class="lens" aria-hidden="true"></span></ol></div>
      </div>
    </div>
    <div class="th-bottom">
      <button type="button" class="th-play" aria-label="चलाएँ या रोकें / Play or pause">${icon("pause")}</button>
      <button type="button" class="speed" aria-label="गति / Speed">1×</button>
      <div class="scrub"><div class="track"><div class="fill"></div></div>${CHAPTERS.map((c) => `<span class="mark ${c.tone === "late" ? "late" : ""}" style="left:${((c.t / DURATION) * 100).toFixed(2)}%"></span>`).join("")}<span class="knob"></span><input type="range" min="0" max="${DURATION * 10}" step="1" value="0" aria-label="रात में कहाँ / Position in the night"/></div>
      <p class="tiny solo" style="color:var(--haldi-tint);max-width:16em">${bil("पुनर्निर्मित। नदी, गाँव, तारीख़ असली।", "Re-enactment. River, villages, date are real.")}</p>
    </div>
  </div>`);

  // --- parts ---
  const host = el.querySelector<HTMLElement>(".night-host")!;
  host.innerHTML = nightScene();
  const night = grabNight(host.querySelector("svg")!);
  const ghadi = new Ghadi();
  el.querySelector(".th-ghadi")!.append(ghadi.el);
  const gcap = el.querySelector<HTMLElement>(".th-ghadi-cap")!;
  const clk = el.querySelector<HTMLElement>(".clk")!;
  const day = el.querySelector<HTMLElement>(".day")!;
  const nowT = el.querySelector<HTMLElement>(".th-now .t")!;
  const nowMsg = el.querySelector<HTMLElement>(".th-now .msg")!;
  const endCard = el.querySelector<HTMLElement>(".th-end")!;
  const shout = el.querySelector<HTMLElement>(".shout")!;
  const t2l = el.querySelector<SVGSVGElement>(".t2l-svg")!;
  const playBtn = el.querySelector<HTMLButtonElement>(".th-play")!;
  const speedBtn = el.querySelector<HTMLButtonElement>(".speed")!;
  const soundBtn = el.querySelector<HTMLButtonElement>(".th-sound")!;
  const range = el.querySelector<HTMLInputElement>(".scrub input")!;
  const fill = el.querySelector<HTMLElement>(".scrub .fill")!;
  const knob = el.querySelector<HTMLElement>(".scrub .knob")!;

  // phones
  const threads = { a: el.querySelector<HTMLElement>('[data-thread="a"]')!, b: el.querySelector<HTMLElement>('[data-thread="b"]')! };
  const msgs = { a: phoneA(), b: phoneB() };
  (["a", "b"] as const).forEach((k) => {
    threads[k].innerHTML = msgs[k]
      .map((m, i) => `<div class="msg ${m.side === "in" ? "bubble-in" : "bubble-out"}" data-i="${i}" ${m.late ? 'style="border-color:var(--sindoor);background:var(--sindoor-tint)"' : ""}>${m.html}</div>`)
      .join("");
  });
  const msgEls = { a: Array.from(threads.a.children) as HTMLElement[], b: Array.from(threads.b.children) as HTMLElement[] };

  // counters fed by the 'ready' events
  const ready = tl.events.filter((e) => e.kind === "ready");
  const countAt = (level: string, s: number) => {
    let c = 0;
    for (const e of ready) if (e.level === level && sec(e.at) <= s) c = e.count ?? c;
    return c;
  };

  // the log: key events only
  const logEvents = tl.events.filter((e, i, all) => !["ready", "read", "delivered"].includes(e.kind) && !(e.kind === "hold" && all.findIndex((x) => x.kind === "hold") !== i));
  const logOl = el.querySelector<HTMLOListElement>(".th-log ol")!;
  const lens = logOl.querySelector<HTMLElement>(".lens")!;
  logOl.insertAdjacentHTML(
    "beforeend",
    logEvents
      .map((e) => `<li data-s="${sec(e.at)}" class="${["climb", "confirm_breach", "breach"].includes(e.kind) ? "late" : ""}"><span class="tm">${bil(clockHi(e.at).replace(/^(रात|सुबह) /, ""), clockEn(e.at))}</span><span class="pair">${bi(e.text_hi, e.text_en)}</span></li>`)
      .join(""),
  );
  const logRows = Array.from(logOl.querySelectorAll<HTMLLIElement>("li"));

  // the ladder
  const ladder = el.querySelector<SVGSVGElement>(".th-ladder svg")!;
  const lit = Array.from(ladder.querySelectorAll<SVGPathElement>(".lit"));
  const packets = ladder.querySelector<SVGGElement>(".packets")!;
  const lnodes = Object.fromEntries(Array.from(ladder.querySelectorAll<SVGGElement>(".lnode")).map((g) => [g.dataset.k!, g])) as Record<LK, SVGGElement>;
  const edgeFns = EDGES.map((e) => edgePath(e.a, e.b));

  // step functions
  const sfnEls = Array.from(el.querySelectorAll<HTMLElement>(".sfn .st"));

  // mobile tabs
  const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>(".th-tabs button"));
  const panels = Array.from(el.querySelectorAll<HTMLElement>(".th-panel"));
  let manualTabUntil = 0;
  const showTab = (k: string, manual = false) => {
    tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === k)));
    panels.forEach((p) => p.classList.toggle("show", p.dataset.panel === k));
    if (manual) manualTabUntil = performance.now() + 9000;
  };
  tabs.forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab!, true)));

  // text to layout tokens (kit effect 11)
  let tokens: { g: SVGGElement; a: [number, number]; b: [number, number]; w: number }[] = [];
  const buildT2L = () => {
    const en = document.documentElement.dataset.lang === "en";
    const ctx = document.createElement("canvas").getContext("2d")!;
    ctx.font = `700 20px "Baloo 2"`;
    const line = en ? ["km 14,", "water boiling up,", "it's muddy"] : ["किमी 14 पर", "पानी उबल रहा है,", "मटमैला है"];
    const widths = line.map((s) => ctx.measureText(s).width + 20);
    const total = widths.reduce((a, b) => a + b, 0) + 12 * (line.length - 1);
    let x = 480 - total / 2;
    const linePos = widths.map((w) => {
      const p: [number, number] = [x, 64];
      x += w + 12;
      return p;
    });
    const card = { x: 282, y: 34, w: 396, h: 184 };
    const targets: [number, number][] = [
      [card.x + 18, card.y + 40],
      [card.x + 18, card.y + 84],
      [card.x + 18, card.y + 84],
    ];
    const sign = en ? "Boil carrying soil" : "मिट्टी वाला उबाल";
    const signW = ctx.measureText(sign).width + 20;
    t2l.innerHTML = `<g class="t2l-card" opacity="0"><path d="${rr(card.x + 6, card.y + 6, card.w, card.h, 16)}" fill="${C.kesar}"/><path d="${rr(card.x, card.y, card.w, card.h, 16)}" fill="${C.chuna}" stroke="${C.neel}" stroke-width="2.5"/>
        <svg x="${card.x + card.w - 106}" y="${card.y + 44}" width="88" height="62" viewBox="0 0 64 46">${boilPic.replace(/<span class="pic">|<\/span>/g, "").replace(/<svg[^>]*>|<\/svg>/g, "")}</svg>
        <text class="t2l-cap" x="${card.x + 18}" y="${card.y + 144}" font-size="15" fill="${C.neel2}" opacity="0">${en ? "AI drafted it; the patrol worker confirmed with one tap" : "AI ने मसौदा लिखा, प्रहरी ने एक टैप में पुष्टि की"}</text>
        <text class="t2l-rule" x="${card.x + 18}" y="${card.y + 170}" font-size="15" fill="${C.sindoorDeep}" opacity="0">${en ? "Rules, not AI: boil carrying soil = P1" : "नियम, AI नहीं: मिट्टी वाला उबाल = P1"}</text>
      </g>
      <text class="t2l-src" x="480" y="40" text-anchor="middle" font-size="14" fill="${C.haldiTint}" opacity="0">${en ? "Voice note, through Amazon Transcribe (hi-IN)" : "वॉइस नोट, Amazon Transcribe (hi-IN) से"}</text>
      ${line
        .map(
          (s, i) => `<g class="tok" data-i="${i}" opacity="0"><rect x="0" y="-22" width="${widths[i]}" height="32" rx="9" fill="${i === 0 ? C.white : C.kesarTint}" stroke="${C.neel}" stroke-width="2"/><text x="10" y="0" font-size="20" fill="${C.neel}">${esc(s)}</text></g>`,
        )
        .join("")}
      <g class="tok sign" opacity="0"><rect x="0" y="-22" width="${signW}" height="32" rx="9" fill="${C.kesarTint}" stroke="${C.neel}" stroke-width="2"/><text x="10" y="0" font-size="20" fill="${C.neel}">${esc(sign)}</text></g>
      <g class="kick" opacity="0" style="transform-origin:${card.x + card.w - 50}px ${card.y + 26}px"><rect x="${card.x + card.w - 80}" y="${card.y + 10}" width="60" height="34" rx="8" fill="${C.sindoorTint}" stroke="${C.sindoor}" stroke-width="3" transform="rotate(-6 ${card.x + card.w - 50} ${card.y + 27})"/><text x="${card.x + card.w - 50}" y="${card.y + 35}" text-anchor="middle" font-size="22" fill="${C.sindoor}" class="svg-num" transform="rotate(-6 ${card.x + card.w - 50} ${card.y + 27})">P1</text></g>`;
    tokens = Array.from(t2l.querySelectorAll<SVGGElement>(".tok[data-i]")).map((g, i) => ({ g, a: linePos[i], b: targets[i], w: widths[i] }));
    t2l.querySelectorAll("text").forEach((t) => t.setAttribute("font-family", t.classList.contains("svg-num") ? "Yatra One" : "Baloo 2"));
    t2l.querySelectorAll("text").forEach((t) => t.setAttribute("font-weight", "700"));
  };
  buildT2L();

  // the shout (kit effect 10): grapheme clusters stretch on one baseline
  const buildShout = () => {
    const en = document.documentElement.dataset.lang === "en";
    const word = en ? "MOVE NOW!" : "निकल चलो!";
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    const parts = Seg ? Array.from(new Seg("hi", { granularity: "grapheme" }).segment(word), (x) => x.segment) : Array.from(word);
    shout.innerHTML = parts.map((p) => `<span>${p === " " ? "&nbsp;" : esc(p)}</span>`).join("");
  };
  buildShout();
  document.addEventListener("bp:lang", () => {
    buildT2L();
    buildShout();
    render(t);
  });

  // --- state ---
  let t = 0;
  let playing = false;
  let speed = 1;
  let sound = false;
  let last = 0;
  let raf = 0;
  let lastFocus = -1;
  let lastSpoken = -1;

  const say = (text: string) => {
    if (!sound || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith("hi"));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };

  function render(tt: number) {
    t = tt;
    const s = storyAt(tt);
    drawNight(night, s, tt);
    const at = iso(s);
    clk.textContent = clockHi(at);
    day.textContent = s < 1210 ? "29 सितंबर / 29 Sep" : "30 सितंबर / 30 Sep";

    // the answer clock: who are we waiting for?
    let label: [string, string] = ["अभी कोई घड़ी नहीं", "No clock running"];
    if (s < S.pageJE) ghadi.set(600, 600, "idle");
    else if (s < S.climb) {
      ghadi.set(600 - (s - S.pageJE), 600, "run");
      label = ["इंतज़ार: जेई, 10 मिनट", "Waiting for: JE, 10 min"];
    } else if (s < S.climb + 25) {
      ghadi.set(0, 600, "late", clamp((s - S.climb) / 25));
      label = ["जेई: जवाब नहीं", "JE: no answer"];
    } else if (s < S.answer) {
      ghadi.set(600 - (s - S.climb), 600, "run");
      label = ["इंतज़ार: एई, 10 मिनट", "Waiting for: AE, 10 min"];
    } else if (s < S.dispatch + 30) {
      ghadi.set(0, 600, "done");
      label = ["एई ने 2 मिनट में जवाब दिया", "AE answered in 2 min"];
    } else if (s < S.onsite) {
      ghadi.set(2700 - (s - S.answer), 2700, "run");
      label = ["एई को 45 मिनट में मौके पर पहुँचना है", "AE must be on site within 45 min"];
    } else if (s < S.onsite + 60) {
      ghadi.set(0, 2700, "done");
      label = ["मौके पर, 43 मिनट में", "On site in 43 min"];
    } else if (s < S.nikal) {
      const left = 1800 - ((s - S.onsite) % 1800);
      ghadi.set(left, 1800, "run");
      label = ["अगली हाज़िरी: हर 30 मिनट", "Next check-in: every 30 min"];
    } else if (s < S.districtOk) {
      ghadi.set(600 - (s - S.district), 600, "run");
      label = ["इंतज़ार: ज़िला, 10 मिनट", "Waiting for: district, 10 min"];
    } else {
      ghadi.set(0, 600, "done");
      label = ["ज़िला ने संभाला", "The district has it"];
    }
    gcap.innerHTML = bil(label[0], label[1]);

    // now-line: the latest event
    const evs = tl.events.filter((e) => sec(e.at) <= s && e.kind !== "ready");
    const cur: TimelineEvent | undefined = evs[evs.length - 1];
    if (cur) {
      nowT.textContent = clockHi(cur.at);
      nowMsg.innerHTML = bi(cur.text_hi, cur.text_en);
    } else {
      nowT.textContent = clockHi(at);
      nowMsg.innerHTML = bi("गंडक ख़तरे के निशान के पास। प्रहरी टॉर्च लेकर बाँध पर।", "The Gandak is near danger level. The patrol worker is on the bank with a torch.");
    }

    // phones
    (["a", "b"] as const).forEach((k) => {
      let newest = -1;
      msgs[k].forEach((m, i) => {
        const on = s >= m.s;
        const elx = msgEls[k][i];
        if (on && !elx.classList.contains("on")) newest = i;
        elx.classList.toggle("on", on);
      });
      if (newest >= 0) threads[k].scrollTop = threads[k].scrollHeight;
    });
    threads.b.querySelectorAll<HTMLElement>("[data-counter]").forEach((c) => {
      const n = countAt(c.dataset.counter!, s);
      c.querySelector(".big")!.textContent = `${n}/25`;
      c.querySelectorAll("i").forEach((d, i) => d.classList.toggle("on", i < n));
    });

    // log with the glass lens on the current row (kit effect 14)
    let focus = -1;
    logRows.forEach((r, i) => {
      const rs = Number(r.dataset.s);
      if (rs <= s) focus = i;
    });
    logRows.forEach((r, i) => {
      r.classList.toggle("future", i > focus);
      r.classList.toggle("past", i < focus);
      r.classList.toggle("focus", i === focus);
    });
    if (focus !== lastFocus) {
      lastFocus = focus;
      const row = logRows[Math.max(0, focus)];
      if (row) {
        lens.style.transform = `translateY(${row.offsetTop - 3}px)`;
        lens.style.height = `${row.offsetHeight + 6}px`;
        lens.style.opacity = focus >= 0 ? "1" : "0";
        logOl.scrollTo({ top: Math.max(0, row.offsetTop - logOl.clientHeight / 2), behavior: reducedMotion() ? "auto" : "smooth" });
      }
    }

    // ladder pulses and node states (kit effect 15)
    let pk = "";
    EDGES.forEach((e, i) => {
      const first = e.at.find((a) => s >= a);
      const k = first === undefined ? 0 : clamp((tt - replayAt(first)) / 1.0);
      lit[i].setAttribute("stroke-dashoffset", (1 - k).toFixed(3));
      lit[i].setAttribute("stroke", e.at.length > 1 && s >= e.at[1] ? C.sindoor : e.dash ? C.haldiTint : C.haldi);
      e.at.forEach((a) => {
        const g = (tt - replayAt(a)) / 1.0;
        if (s >= a && g >= 0 && g < 1) {
          const [x, y] = edgeFns[i].p(eio(g));
          pk += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${C.haldi}" opacity=".35"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${C.chuna}"/>`;
        }
      });
    });
    packets.innerHTML = pk;
    const node = (k: LK, fillCol: string, ringOn: boolean, badge: "" | "ok" | "no" | "p1") => {
      const g = lnodes[k];
      g.querySelector(".pill")!.setAttribute("fill", fillCol);
      const ring = g.querySelector<SVGRectElement>(".ring")!;
      ring.setAttribute("opacity", ringOn ? (0.5 + 0.5 * Math.sin(tt * 7)).toFixed(2) : "0");
      const b = g.querySelector<SVGGElement>(".badge")!;
      b.setAttribute("opacity", badge ? "1" : "0");
      const circle = b.querySelector("circle")!;
      const txt = b.querySelector(".bt")!;
      circle.setAttribute("fill", badge === "no" ? C.sindoor : badge === "p1" ? C.sindoor : C.dhaan);
      txt.textContent = badge === "no" ? "✕" : badge === "p1" ? "!" : "✓";
    };
    node("prahari", s >= S.report ? C.haldiTint : C.chuna, (s >= S.report && s < S.p1) || (s >= S.slump && s < S.nikal), s >= S.report ? "ok" : "");
    node("rules", s >= S.p1 ? C.sindoorTint : C.chuna, false, s >= S.p1 ? "p1" : "");
    node("village", s >= S.nikal ? C.sindoorTint : s >= S.taiyaar ? C.kesarTint : C.chuna, (s >= S.taiyaar && s < S.taiyaar + 300) || (s >= S.nikal && s < S.nikal + 600), "");
    node("je", s >= S.climb ? C.sindoorTint : C.chuna, s >= S.pageJE && s < S.climb, s >= S.climb ? "no" : "");
    node("ae", s >= S.answer ? C.dhaanTint : C.chuna, s >= S.climb && s < S.answer, s >= S.answer ? "ok" : "");
    node("ee", s >= S.climb ? C.haldiTint : C.chuna, false, "");
    node("district", s >= S.districtOk ? C.dhaanTint : C.chuna, s >= S.district && s < S.districtOk, s >= S.districtOk ? "ok" : "");

    // step functions, as they run
    ex.states.forEach((st, i) => {
      const a = sec(st.entered);
      const b = sec(st.exited);
      const elx = sfnEls[i];
      elx.className = "st " + (s < a ? "" : s < b ? "running" : st.status);
    });

    // overlay: transcript to report (2.5 s to 10.4 s)
    const tIn = seg(tt, 2.5, 3.9);
    const flow = eio(seg(tt, 4.6, 7.0));
    const out = seg(tt, 9.6, 10.4);
    const vis = tt >= 2.5 && tt < 10.4 ? 1 - out : 0;
    t2l.style.opacity = String(vis);
    t2l.querySelector(".t2l-src")!.setAttribute("opacity", String(clamp(tIn * 3) * (1 - flow)));
    t2l.querySelector(".t2l-card")!.setAttribute("opacity", flow.toFixed(2));
    tokens.forEach((tk, i) => {
      const appear = clamp((tIn * 3 - i) * 1.2);
      const x = lerp(tk.a[0], tk.b[0], flow);
      const y = lerp(tk.a[1], tk.b[1], flow) - Math.sin(Math.PI * flow) * (18 + i * 6);
      // tokens 2 and 3 merge into the sign
      const fade = i > 0 ? 1 - seg(flow, 0.55, 0.85) : 1;
      tk.g.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      tk.g.setAttribute("opacity", (appear * fade).toFixed(2));
    });
    const sign = t2l.querySelector<SVGGElement>(".tok.sign")!;
    sign.setAttribute("transform", `translate(${tokens[1]?.b[0] ?? 300} ${tokens[1]?.b[1] ?? 118})`);
    sign.setAttribute("opacity", seg(flow, 0.6, 0.9).toFixed(2));
    t2l.querySelector(".t2l-cap")!.setAttribute("opacity", seg(tt, 7.2, 7.8).toFixed(2));
    t2l.querySelector(".t2l-rule")!.setAttribute("opacity", seg(tt, 8.2, 8.6).toFixed(2));
    const kick = t2l.querySelector<SVGGElement>(".kick")!;
    const kp = tt >= 8.2 ? spring(tt - 8.2, 0.4, 12) : 0;
    kick.setAttribute("opacity", tt >= 8.2 ? "1" : "0");
    kick.style.transform = `scale(${(2 - kp).toFixed(3)})`;

    // overlay: the shout (48.2 s to 52.6 s)
    const sp = tt < 48.2 ? 0 : tt < 49.6 ? (tt - 48.2) / 1.4 : tt < 51.6 ? 1 : 1 - (tt - 51.6) / 1.0;
    shout.style.opacity = String(clamp(sp * 4));
    const spans = Array.from(shout.children) as HTMLElement[];
    const mid = (spans.length - 1) / 2;
    spans.forEach((sp2, i) => {
      const d = Math.abs(i - mid) / Math.max(1, mid);
      const k = eio(clamp(sp) * 1.36 - d * 0.36);
      const sy = 1 + (1.15 - 0.55 * d) * k;
      const sx = 1 - (0.2 - 0.14 * d) * k;
      sp2.style.transform = `scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    });

    // end card
    endCard.hidden = tt < 66.3;

    // scrubber
    const frac = tt / DURATION;
    fill.style.width = `${(frac * 100).toFixed(2)}%`;
    knob.style.left = `${(frac * 100).toFixed(2)}%`;
    if (document.activeElement !== range) range.value = String(Math.round(tt * 10));

    // mobile: follow the story unless the viewer chose a tab
    if (performance.now() > manualTabUntil && innerWidth < 1100) {
      const want = s >= S.done ? "b" : s >= S.nikal ? "b" : s >= S.climb && s < S.answer + 30 ? "log" : s >= S.taiyaar && s < S.climb ? "b" : "a";
      showTab(want);
    }
  }

  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const prevS = storyAt(t);
    let next = t + dt * speed;
    if (next >= DURATION) {
      next = DURATION;
      pause();
    }
    render(next);
    const s = storyAt(next);
    // voice notes, when sound is on and we cross the moment while playing
    if (prevS < S.taiyaar && s >= S.taiyaar && lastSpoken !== 1) {
      lastSpoken = 1;
      say("तैयार रहिए। किमी 14 पर बाँध में ख़तरा है। अनाज, बीज और चारा मचान पर रखिए, मवेशी ऊँची जगह ले जाइए, कागज़ात साथ रखिए।");
    }
    if (prevS < S.nikal && s >= S.nikal && lastSpoken !== 2) {
      lastSpoken = 2;
      say("निकल चलिए। राहत शिविर पंचायत भवन में है। सबसे पहले बुज़ुर्ग, बच्चे और बीमार। बिजली का मेन स्विच बंद कीजिए।");
    }
    if (playing) raf = requestAnimationFrame(frame);
  };
  function play() {
    if (playing) return;
    if (t >= DURATION) seek(0);
    playing = true;
    playBtn.innerHTML = icon("pause");
    if (reducedMotion()) {
      // step mode: jump to the next chapter instead of animating
      const nextC = CHAPTERS.find((c) => c.t > t + 0.1);
      seek(nextC ? nextC.t : DURATION);
      playing = false;
      playBtn.innerHTML = icon("play");
      return;
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    playBtn.innerHTML = icon("play");
  }
  function seek(tt: number) {
    lastSpoken = tt > replayAt(S.nikal) ? 2 : tt > replayAt(S.taiyaar) ? 1 : -1;
    render(clamp(tt, 0, DURATION));
  }
  function close() {
    pause();
    window.speechSynthesis?.cancel();
    el.hidden = true;
    document.documentElement.style.overflow = "";
    ctl.opener?.focus();
  }

  playBtn.addEventListener("click", () => (playing ? pause() : play()));
  speedBtn.addEventListener("click", () => {
    speed = speed === 1 ? 2 : 1;
    speedBtn.textContent = `${speed}×`;
  });
  soundBtn.addEventListener("click", () => {
    sound = !sound;
    soundBtn.setAttribute("aria-pressed", String(sound));
    soundBtn.innerHTML = icon(sound ? "sound" : "mute");
    if (!sound) window.speechSynthesis?.cancel();
  });
  range.addEventListener("input", () => {
    pause();
    seek(Number(range.value) / 10);
  });
  el.querySelector(".th-close")!.addEventListener("click", close);
  el.querySelector(".th-close2")!.addEventListener("click", close);
  el.querySelector(".th-again")!.addEventListener("click", () => {
    seek(0);
    play();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === " " && (e.target as HTMLElement).tagName !== "BUTTON") {
      e.preventDefault();
      playing ? pause() : play();
    } else if (e.key === "ArrowRight" && (e.target as HTMLElement) !== range) seek(t + 3);
    else if (e.key === "ArrowLeft" && (e.target as HTMLElement) !== range) seek(t - 3);
  });

  const ctl = { el, seek, play, pause, opener: null as HTMLElement | null };
  return ctl;
}
