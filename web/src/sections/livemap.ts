// सजीव नक़्शा, the live map. The Haijalpur stretch as a Madhubani voxel diorama built from
// AWS Open Data (Copernicus DEM, ESA WorldCover, Sentinel-2), with the water the satellite
// saw, a what-if flood tied to the Rewaghat gauge, the embankment and our kilometre stones,
// the villages, relief camps on the highest dry ground and safe routes over dry cells.
// Three views of the same night: the family asking for help, the relief team that answers
// (the CampusEvac warden, on a 20-minute clock), and the district that sees it all.
import { api, usingMocks } from "../api";
import { icon } from "../art/icons";
import { face } from "../art/people";
import { C } from "../art/palette";
import { $, $$, bi, bil, clockEn, clockHi, esc, num } from "../lib/dom";
import { clamp, eio, reducedMotion, watchVisible } from "../lib/motion";
import { computeFlood, depthAt, saranWetKm2, villageRisk, type Flood } from "../map/flood";
import { Iso, type Rot } from "../map/iso";
import { CLS, CREST_M, buildModel, cellLatLon, type MapVillage, type Model, type Pt } from "../map/model";
import { Relief, type Route, type TeamState } from "../map/sim";
import { drawSpriteAt } from "../map/sprites";
import type { Gauges, HelpNeed, HelpRequest, Reading, Stretch } from "../types";

type Role = "family" | "relief" | "district";
type Sel =
  | { k: "cell"; i: number }
  | { k: "help"; id: string }
  | { k: "team"; id: string }
  | { k: "village"; key: string }
  | { k: "camp"; key: string }
  | { k: "gauge" }
  | { k: "stone"; km: number };

const STRETCH = "haijalpur";
type LinkMsg =
  | { t: "hello" }
  | { t: "here"; now: number }
  | { t: "raise"; now: number; id: string; cell: number; people: number; needs: HelpNeed[]; elderly: number; children: number }
  | { t: "claim"; now: number; id: string; team: string }
  | { t: "rescue"; now: number; id: string };
const LEVEL_MIN = 52.5;
const LEVEL_MAX = 58.5;
const BREACH_KM = 14;

const lang = () => (document.documentElement.dataset.lang ?? "both") as "hi" | "en" | "both";
const L = (hi: string, en: string) => (lang() === "en" ? en : hi);
const mins = (n: number) => Math.max(0, Math.round(n));

const CLS_NAME: Record<number, [string, string]> = {
  [CLS.trees]: ["पेड़ और बाग़", "Trees and orchards"],
  [CLS.grass]: ["घास", "Grass"],
  [CLS.crop]: ["खेत", "Fields"],
  [CLS.built]: ["बस्ती", "Houses"],
  [CLS.bare]: ["खुली ज़मीन", "Bare ground"],
  [CLS.water]: ["नदी", "River"],
  [CLS.wetland]: ["दलदल", "Wetland"],
};

const NEEDS: { id: HelpNeed; hi: string; en: string }[] = [
  { id: "boat", hi: "नाव", en: "Boat" },
  { id: "medical", hi: "दवा", en: "Medicine" },
  { id: "food", hi: "खाना", en: "Food" },
  { id: "animals", hi: "मवेशी", en: "Cattle" },
];

// Small glyphs for the panels (the canvas draws its own sprites).
const G = {
  boat: `<svg class="ic" viewBox="0 0 40 40" aria-hidden="true"><path d="M4 22q16 12 32 0l-3 6q-13 7-26 0z" fill="${C.mittiDeep}" stroke="${C.neel}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="15" cy="12" r="3" fill="${C.skin}" stroke="${C.neel}" stroke-width="1.8"/><path d="M12 22v-6h6v6" fill="${C.white}" stroke="${C.neel}" stroke-width="1.8"/><circle cx="25" cy="12" r="3" fill="${C.skin}" stroke="${C.neel}" stroke-width="1.8"/><path d="M22 22v-6h6v6" fill="${C.gandakTint}" stroke="${C.neel}" stroke-width="1.8"/></svg>`,
  sdrf: `<svg class="ic" viewBox="0 0 40 40" aria-hidden="true"><path d="M5 20h28l3-3-3 11H7z" fill="${C.white}" stroke="${C.neel}" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 24h27" stroke="${C.neel}" stroke-width="2"/><rect x="1" y="18" width="4" height="7" fill="${C.neel2}" stroke="${C.neel}" stroke-width="1.6"/><circle cx="14" cy="12" r="3" fill="${C.skin}" stroke="${C.neel}" stroke-width="1.8"/><circle cx="23" cy="12" r="3" fill="${C.skin}" stroke="${C.neel}" stroke-width="1.8"/></svg>`,
  medical: `<svg class="ic" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="12" width="22" height="20" rx="4" fill="${C.white}" stroke="${C.neel}" stroke-width="2.2"/><path d="M15 12V9h10v3" fill="none" stroke="${C.neel}" stroke-width="2.2"/><path d="M20 17v10M15 22h10" stroke="${C.dhaanDeep}" stroke-width="3.2" stroke-linecap="round"/></svg>`,
};
const teamGlyph = (k: string) => (k === "boat" ? G.boat : k === "sdrf" ? G.sdrf : icon("tractor"));
const needGlyph = (n: HelpNeed) => (n === "boat" ? G.boat : n === "medical" ? G.medical : n === "food" ? icon("food") : icon("cow"));

const STATUS_TONE: Record<string, string> = { open: C.sindoor, paged: C.sindoor, claimed: C.kesar, arrived: C.haldi, rescued: C.dhaan };

export async function initLiveMap(stretch: Stretch, gauges: Gauges): Promise<void> {
  const host = $("#lm");
  const [grid, help, teams] = await Promise.all([api.map(STRETCH), api.help(), api.teams()]);
  const m = buildModel(grid, stretch.villages);
  const relief = new Relief(m, usingMocks, help, teams);
  const link = usingMocks && "BroadcastChannel" in window ? new BroadcastChannel("bp-live-demo") : null;
  const share = (msg: LinkMsg) => link?.postMessage(msg);

  const rewa: Reading | undefined = gauges.readings.find((r) => r.site === "Rewaghat");
  const dl = stretch.gauges.find((g) => g.site === "Rewaghat")?.dl_m ?? rewa?.dl_m ?? 54.41;
  const today = rewa?.wl_m ?? dl - 0.8;
  const crest = crestReading(m);
  const haijalpur = m.villages.find((v) => v.key === "Haijalpur") ?? m.villages[0];

  const S = {
    role: "family" as Role,
    level: today,
    shown: today,
    breach: false,
    layers: { observed: true, camps: true, routes: true, help: true },
    sel: null as Sel | null,
    home: haijalpur ? haijalpur.cell : Math.floor(m.N / 2),
    people: 4,
    elderly: 0,
    children: 0,
    needs: new Set<HelpNeed>(["boat"]),
    full: false,
  };

  const floods: { none?: Flood; breach?: Flood } = {};
  const flood = () => (S.breach ? (floods.breach ??= computeFlood(m, BREACH_KM)) : (floods.none ??= computeFlood(m, null)));
  const deep = (i: number) => flood().thr[i] < S.level && !m.emb[i];
  relief.water = { deep, shallow: (i) => S.layers.observed && m.s2water[i] > 50 };

  // ---------------- the frame ----------------
  host.innerHTML = `
    <div class="lm-bar">
      <div class="lm-roles" role="tablist" aria-label="${esc(L("आप कौन हैं", "Who are you"))}">
        ${(
          [
            ["family", "family", "परिवार", "Family"],
            ["relief", "prahari", "राहत दल", "Relief team"],
            ["district", "dm", "ज़िला / सरकार", "District"],
          ] as const
        )
          .map(([id, f, hi, en], i) => `<button type="button" role="tab" data-role="${id}" aria-selected="${i === 0}" aria-controls="lm-side">${face(f)}${bil(hi, en)}</button>`)
          .join("")}
      </div>
      <button type="button" class="btn small lm-night">${icon("play")}${bil("उस रात को नक़्शे पर चलाएँ", "Play that night on the map")}</button>
      <p class="lm-clock" aria-live="off"><span class="lm-clock-t num"></span><small>${usingMocks ? bil("डेमो घड़ी: 1 सेकंड = 1 मिनट", "Demo clock: 1 second = 1 minute") : bil("अभी", "Now")}</small></p>
      ${usingMocks ? `<button type="button" class="chip lm-pair" title="${esc(L("इसी पन्ने को दूसरी खिड़की में राहत दल बनकर खोलें; दोनों साथ चलेंगे", "Open this page again as the relief team; both windows play together"))}">${bil("दूसरी खिड़की: राहत दल", "Second window: relief")}</button><span class="sticker dhaan lm-linked" hidden>${bil("दो खिड़कियाँ जुड़ीं", "Two windows linked")}</span>` : ""}
      <button type="button" class="icon-btn lm-full-btn" aria-pressed="false" aria-label="${esc(L("पूरी स्क्रीन", "Full screen"))}">${FULL_ICON}</button>
    </div>
    <div class="lm-body">
      <div class="lm-stage">
        <canvas class="lm-canvas" tabindex="0" role="img" aria-describedby="lm-desc"></canvas>
        <p class="sr-only" id="lm-desc"></p>
        <div class="lm-hud lm-tl">
          <button type="button" class="lm-gauge" data-sel="gauge"></button>
        </div>
        <div class="lm-hud lm-tr" role="group" aria-label="${esc(L("नक़्शा घुमाएँ और ज़ूम करें", "Rotate and zoom the map"))}">
          <button type="button" class="icon-btn lm-rot" aria-label="${esc(L("90° घुमाएँ", "Rotate 90°"))}">${ROT_ICON}</button>
          <button type="button" class="icon-btn lm-zin" aria-label="${esc(L("पास से", "Zoom in"))}">${PLUS_ICON}</button>
          <button type="button" class="icon-btn lm-zout" aria-label="${esc(L("दूर से", "Zoom out"))}">${MINUS_ICON}</button>
        </div>
        <div class="lm-hud lm-bl" aria-hidden="true"><span class="lm-compass">${COMPASS}</span><span class="lm-scale"><i></i><b>1 किमी</b></span></div>
        <p class="lm-hud lm-br stamp neel">${bil("नमूना: टीमें, माँगें, शिविर · अनुमानित: बाँध की रेखा, गाँवों की जगह", "Sample: teams, requests, camps · Approximate: embankment line, village spots")}</p>
        <div class="lm-card" hidden role="dialog" aria-live="polite"></div>
        <p class="lm-hint" hidden></p>
        <div class="lm-story" hidden>
          <div class="lm-story-top">
            <span class="lm-story-t num"></span>
            <ol class="lm-story-steps" aria-hidden="true">${"<li></li>".repeat(6)}</ol>
            <button type="button" class="icon-btn lm-story-x" aria-label="${esc(L("रोकें", "Stop"))}">${icon("close")}</button>
          </div>
          <p class="lm-story-line pair" aria-live="polite"></p>
          <div class="lm-story-end" hidden>
            <p class="lm-story-sum small pair"></p>
            <div class="row"><button type="button" class="btn small lm-story-again">${icon("restart")}${bil("फिर से", "Again")}</button><button type="button" class="btn small paper lm-story-close">${bil("नक़्शे पर लौटें", "Back to the map")}</button></div>
          </div>
          <p class="lm-story-note tiny">${bil("नाटकीय रूपांतर, नमूना डेटा पर। पानी का फैलाव मोटा अनुमान है।", "A re-enactment on sample data. The spread of water is a rough sketch.")}</p>
        </div>
      </div>
      <aside class="lm-side" id="lm-side" role="tabpanel" aria-live="polite"></aside>
    </div>
    <div class="lm-foot">
      <div class="lm-whatif">
        <div class="lm-whatif-head">
          <label for="lm-level" class="lm-whatif-label">${bil("अगर रेवाघाट गेज यहाँ तक चढ़े", "If the Rewaghat gauge rises to")}</label>
          <output class="lm-level-out num" for="lm-level"></output>
        </div>
        <div class="lm-ruler">
          <svg class="lm-ruler-art" viewBox="0 0 600 44" preserveAspectRatio="none" aria-hidden="true"></svg>
          <input id="lm-level" type="range" min="${LEVEL_MIN}" max="${LEVEL_MAX}" step="0.05" value="${today.toFixed(2)}" />
          <div class="lm-marks"></div>
        </div>
        <div class="lm-whatif-row">
          <button type="button" class="chip lm-breach" aria-pressed="false">${BREACH_ICON}${bil(`किमी ${BREACH_KM} पर दरार मानें`, `Assume a breach at km ${BREACH_KM}`)}</button>
          <p class="lm-sum small pair" aria-live="polite"></p>
        </div>
        <p class="tiny dim pair">${bi(
          "मोटा अनुमान, हाइड्रोलिक मॉडल नहीं: नदी से जुड़े, पानी की सतह से नीचे वाले खाने भरते हैं; बाँध पानी रोकता है जब तक दरार न हो।",
          "A rough sketch, not a hydraulic model: cells connected to the river and below the water surface fill; the embankment holds unless it's breached.",
        )}</p>
      </div>
      <div class="lm-layers" role="group" aria-label="${esc(L("परतें", "Layers"))}">
        <p class="lm-layers-title small">${bil("परतें", "Layers")}</p>
        <button type="button" class="chip" data-layer="observed" aria-pressed="true"><i class="sw s-seen"></i>${bil(`उपग्रह ने देखा पानी, ${s2DateHi(m)}`, `Water seen by satellite, ${s2DateEn(m)}`)}</button>
        <button type="button" class="chip" disabled title="${esc(L("रोज़ की Lambda चलने पर", "After the daily Lambda runs"))}"><i class="sw s-radar"></i>${bil("रडार (Sentinel-1): जल्द", "Radar (Sentinel-1): soon")}</button>
        <button type="button" class="chip" data-layer="camps" aria-pressed="true">${icon("tent")}${bil("राहत शिविर", "Relief camps")}</button>
        <button type="button" class="chip" data-layer="routes" aria-pressed="true"><i class="sw s-route"></i>${bil("सुरक्षित रास्ते", "Safe routes")}</button>
        <button type="button" class="chip" data-layer="help" aria-pressed="true"><i class="sw s-pin"></i>${bil("मदद और टीमें", "Help and teams")}</button>
        <ul class="lm-key tiny" aria-label="${esc(L("कुंजी", "Key"))}">
          <li><i class="sw s-river"></i>${bil("नदी", "River")}</li>
          <li><i class="sw s-flood"></i>${bil("अगर नदी चढ़े", "What-if water")}</li>
          <li><i class="sw s-seen"></i>${bil("उपग्रह का पानी", "Satellite water")}</li>
          <li><i class="sw s-bank"></i>${bil("बाँध (अनुमानित)", "Embankment (approx.)")}</li>
        </ul>
      </div>
    </div>`;

  $("#lm-sources").innerHTML = bi(
    `ज़मीन की ऊँचाई: Copernicus DEM GLO-30। ज़मीन का उपयोग: ESA WorldCover 2021। पानी: Sentinel-2 L2A, ${s2DateHi(m)} 2026 (${m.s2?.id ?? "-"}, बादल ${m.s2?.cloud_cover ?? "-"}%)। सब AWS Open Data से, लगभग 200 मी. के खानों में। उपग्रह हर कुछ दिन में लौटता है, इसलिए यह पानी आज का नहीं। टीमों की जगह असली सिस्टम में Amazon Location Service से आती है; यहाँ सब नमूना है।`,
    `Height: Copernicus DEM GLO-30. Land cover: ESA WorldCover 2021. Water: Sentinel-2 L2A, ${s2DateEn(m)} 2026 (${m.s2?.id ?? "-"}, ${m.s2?.cloud_cover ?? "-"}% cloud). All from AWS Open Data, in cells of about 200 m. Satellites come back every few days, so this water is not today's. In the real system team positions come from Amazon Location Service; here they are samples.`,
  );

  const stage = $(".lm-stage", host);
  const canvas = $<HTMLCanvasElement>(".lm-canvas", host);
  const side = $(".lm-side", host);
  const card = $(".lm-card", host);
  const hint = $(".lm-hint", host);
  const range = $<HTMLInputElement>("#lm-level", host);
  const out = $(".lm-level-out", host);
  const sum = $(".lm-sum", host);
  const clockEl = $(".lm-clock-t", host);
  const gaugeBtn = $(".lm-gauge", host);
  const iso = new Iso(m, canvas);

  // ---------------- painting ----------------
  let repaintTimer = 0;
  const paint = (draft = false) => iso.paint({ level: S.shown, flood: flood(), observed: S.layers.observed, camps: S.layers.camps, draft });
  const fullPaintSoon = () => {
    clearTimeout(repaintTimer);
    repaintTimer = window.setTimeout(() => {
      paint(false);
      need();
    }, 140);
  };

  // the water rises (or falls) through the blocks to a new reading
  let anim: { from: number; to: number; t0: number; ms: number } | null = null;
  const setLevel = (v: number, animate: boolean) => {
    v = clamp(v, LEVEL_MIN, LEVEL_MAX);
    S.level = v;
    range.value = v.toFixed(2);
    if (!animate || reducedMotion()) {
      anim = null;
      S.shown = v;
      paint(true);
      fullPaintSoon();
    } else anim = { from: S.shown, to: v, t0: performance.now(), ms: 900 + Math.abs(v - S.shown) * 260 };
    updateWhatIf();
    renderSide();
    need();
  };

  // ---------------- per-frame drawing on top ----------------
  let visible = false;
  let raf = 0;
  let lastT = performance.now();
  let lastTick = 0;
  const need = () => {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  };

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(250, now - lastT);
    lastT = now;
    if (anim) {
      const k = clamp((now - anim.t0) / anim.ms);
      S.shown = anim.from + (anim.to - anim.from) * eio(k);
      paint(k < 1);
      if (k >= 1) {
        anim = null;
        S.shown = S.level;
        paint(false);
      }
    }
    if (story.on || story.night > 0) storyFrame(dt);
    if (relief.tick(dt)) {
      renderSide();
      if (S.sel) renderCard();
    }
    storyWatch();
    if (now - lastTick > 500) {
      lastTick = now;
      tickTexts();
    }
    const ctx = iso.blit();
    drawOverlay(ctx, now);
    const pulsing = S.layers.help && S.role !== "family" && relief.requests.some((r) => r.status === "open" || r.status === "paged");
    if (visible && (anim || relief.busy || pulsing || dragging || story.on || story.night > 0)) raf = requestAnimationFrame(frame);
  }

  // ---------------- overlay ----------------
  const fontUI = (px: number, w = 700) => `${w} ${px}px "Baloo 2", "Noto Sans Devanagari", system-ui, sans-serif`;
  type Box = { x: number; y: number; w: number; h: number };
  // labels already on the map this frame, and the HUD's corners: new labels move or give way
  let placed: Box[] = [];
  let hudBoxes: Box[] = [];
  const measureHud = () => {
    const c = canvas.getBoundingClientRect();
    hudBoxes = $$<HTMLElement>(".lm-hud:not([hidden])", host)
      .filter((el) => getComputedStyle(el).display !== "none")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
      });
  };
  const overlaps = (b: Box) => placed.some((p) => b.x < p.x + p.w + 4 && b.x + b.w + 4 > p.x && b.y < p.y + p.h + 4 && b.y + b.h + 4 > p.y);
  const chipText = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    hi: string,
    en: string,
    o: { bg?: string; fg?: string; shade?: string; size?: number; sub?: string; must?: boolean } = {},
  ): Box | null => {
    const size = o.size ?? 14;
    const l = lang();
    const main = l === "en" ? en : hi;
    const sub = o.sub ?? (l === "both" && en !== hi ? en : "");
    ctx.font = fontUI(size);
    const w1 = ctx.measureText(main).width;
    ctx.font = fontUI(size * 0.72, 600);
    const w2 = sub ? ctx.measureText(sub).width : 0;
    const w = Math.max(w1, w2) + 16;
    const h = size * 1.25 + (sub ? size * 0.9 : 0) + 8;
    let box: Box | null = null;
    for (const dy of [0, -(h + 6), h + 10, -2 * (h + 6)]) {
      const b = { x: x - w / 2, y: y - h + dy, w, h };
      if (!overlaps(b)) {
        box = b;
        break;
      }
    }
    if (!box) {
      if (!o.must) return null;
      box = { x: x - w / 2, y: y - h, w, h };
    }
    placed.push(box);
    const { x: bx, y: by } = box;
    if (Math.abs(by + h - y) > 2) {
      // a leader line back to the place the label belongs to
      ctx.beginPath();
      ctx.moveTo(x, by + (by + h < y ? h : 0));
      ctx.lineTo(x, y);
      ctx.strokeStyle = C.neel;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = o.shade ?? C.kesar;
    roundRect(ctx, bx + 2.5, by + 3, w, h, 7);
    ctx.fill();
    ctx.fillStyle = o.bg ?? C.chuna;
    roundRect(ctx, bx, by, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = C.neel;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = o.fg ?? C.neel;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = fontUI(size);
    ctx.fillText(main, bx + w / 2, by + size * 1.08 + 3);
    if (sub) {
      ctx.font = fontUI(size * 0.72, 600);
      ctx.fillStyle = C.neel2;
      ctx.fillText(sub, bx + w / 2, by + size * 1.08 + 3 + size * 0.88);
    }
    return box;
  };

  /** Three small counts beside a village's name: waiting, on the way, safe. */
  const badges = (ctx: CanvasRenderingContext2D, b: Box, c: { open: number; on_the_way: number; safe: number }) => {
    const items: [number, string, string][] = [
      [c.open, C.sindoor, C.white],
      [c.on_the_way, C.kesar, C.neel],
      [c.safe, C.dhaan, C.white],
    ];
    let x = b.x + b.w + 6;
    const y = b.y + b.h / 2;
    for (const [n, bg, fg] of items) {
      ctx.beginPath();
      ctx.arc(x + 10, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = C.neel;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = fg;
      ctx.font = `400 13px "Yatra One", "Baloo 2", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), x + 10, y + 1);
      ctx.textBaseline = "alphabetic";
      x += 23;
    }
    placed.push({ x: b.x + b.w, y: b.y, w: x - (b.x + b.w), h: b.h });
  };

  // things on the map you can tap, collected while drawing
  let hits: { x: number; y: number; r: number; sel: Sel }[] = [];

  function drawOverlay(ctx: CanvasRenderingContext2D, now: number) {
    hits = [];
    placed = [...hudBoxes];
    const u = iso.unit; // css px per half tile at this zoom
    const show = (lvl: number) => u >= lvl;
    const showPins = S.layers.help && S.role !== "family";

    // routes first, under everything
    if (S.layers.routes) {
      for (const t of relief.teams) {
        if (!t.drive) continue;
        const k = clamp((relief.now - t.drive.t0) / t.drive.ms);
        const rest = remaining(t.drive.pts, t.drive.acc, k);
        path(ctx, rest, C.kesarDeep, now);
      }
      const fam = familyRoute();
      if (fam && (S.role === "family" || S.sel?.k === "cell")) path(ctx, fam.cells.map(cellPt), C.dhaanDeep, now, true);
      const sr = selectedTeamRoute();
      if (sr) path(ctx, sr.cells.map(cellPt), C.neel, now);
    }

    // the night: the ground goes dark, the villages keep their lamps; labels stay readable on top
    if (story.night > 0.01) nightShade(ctx, story.night);
    if (story.night > 0.01 || story.sun > 0) sky(ctx, now);
    if (story.ringKm) {
      const [x, y] = iso.onSurface(m.pointAtKm(story.ringKm), 0);
      const k = reducedMotion() ? 0.5 : (now / 900) % 1;
      ctx.strokeStyle = C.haldi;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, u * (1.2 + k * 2.4), u * (0.7 + k * 1.3), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      chipText(ctx, x + u * 3.2, y - u * 0.4, `किमी ${story.ringKm}: रिसाव`, `km ${story.ringKm}: seepage`, { bg: C.haldiTint, shade: C.kesarDeep, size: 13, must: true });
    }

    // the breach
    if (S.breach) {
      const [x, y] = iso.onSurface(m.pointAtKm(BREACH_KM), 0);
      ctx.strokeStyle = C.sindoor;
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(x, y, u * 2.2, u * 1.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      chipText(ctx, x, y - u * 1.4, "दरार (मानी गई)", "Breach (assumed)", { bg: C.sindoorTint, shade: C.sindoorDeep, size: 13 });
    }

    // help pins (relief and district only: exact places are not public)
    if (showPins) {
      for (const r of relief.requests) {
        const cell = relief.cellOf(r);
        if (cell < 0 || (r.status === "rescued" && relief.minutesSince(r.rescued) > 30)) continue;
        const [x, y] = iso.cellPoint(cell, 0);
        drawPin(ctx, x, y, r, now);
        hits.push({ x, y: y - 22, r: 18, sel: { k: "help", id: r.id } });
        placed.push({ x: x - 12, y: y - 36, w: 24, h: 36 });
      }
    }
    // the family's own pin and request
    if (S.role === "family") {
      const mine = relief.requests.find((r) => r.id === relief.mine);
      const cell = mine ? relief.cellOf(mine) : S.home;
      const [x, y] = iso.cellPoint(cell, 0);
      if (mine) drawPin(ctx, x, y, mine, now);
      else drawHome(ctx, x, y);
    }

    // teams (their name labels wait until the villages have their places)
    const teamLabels: (() => void)[] = [];
    if (S.layers.help) {
      for (const t of relief.teams) {
        const [x, y] = iso.onSurface(t.pos, 0);
        const flip = t.drive ? headingLeft(t) : false;
        const kind = t.team.kind === "sdrf" ? "sdrf" : t.team.kind === "boat" ? "boat" : "tractor";
        const unit = Math.max(0.9, Math.min(2.4, u * 0.16));
        if (S.sel?.k === "team" && S.sel.id === t.team.id) ring(ctx, x, y - 6, 22, C.haldi);
        drawSpriteAt(ctx, kind, 0, x, y, unit, iso.ratio, flip);
        const selT = (S.sel?.k === "team" && S.sel.id === t.team.id) || t.team.id === relief.myTeam;
        hits.push({ x, y: y - 8, r: 18, sel: { k: "team", id: t.team.id } });
        teamLabels.push(() => {
          if (show(7) || selT) chipText(ctx, x, y - unit * 13, t.team.name_hi, t.team.name_en, { size: 12, bg: C.white, shade: C.neel, sub: "", must: selT });
        });
        placed.push({ x: x - unit * 12, y: y - unit * 10, w: unit * 24, h: unit * 12 });
      }
    }

    // labels: villages first (they must show), then what fits around them
    const counts = new Map(relief.counts().map((c) => [c.village, c]));
    for (const v of m.villages) {
      const [x, y] = iso.cellPoint(v.cell, 0);
      const b = chipText(ctx, x, y - u * 1.9, v.name_hi, v.name_en, { size: show(7) ? 16 : 14, must: true })!;
      hits.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(20, b.w / 2), sel: { k: "village", key: v.key } });
      if (S.layers.help && S.role === "family") {
        const c = counts.get(v.key);
        if (c) badges(ctx, b, c);
      }
    }
    if (S.layers.camps)
      for (const v of m.villages) {
        if (!v.camp) continue;
        const [cx, cy] = iso.cellPoint(v.camp.cell, 0);
        hits.push({ x: cx, y: cy - u * 0.8, r: Math.max(12, u * 1.2), sel: { k: "camp", key: v.key } });
        if (!show(5)) continue;
        const cb = chipText(ctx, cx, cy - u * 2.2, "शिविर", "Camp", { size: 12, bg: C.dhaanTint, shade: C.dhaanDeep, sub: "" });
        if (cb) hits.push({ x: cx, y: cb.y + cb.h / 2, r: Math.max(14, cb.w / 2), sel: { k: "camp", key: v.key } });
      }
    {
      const [x, y] = iso.cellPoint(m.gauge, 0);
      hits.push({ x, y: y - u * 1.5, r: Math.max(14, u * 1.4), sel: { k: "gauge" } });
      if (show(5)) {
        const b = chipText(ctx, x, y - u * 2.8, "रेवाघाट गेज", "Rewaghat gauge", { size: 12, bg: C.gandakTint, shade: C.gandakDeep, sub: "" });
        if (b) hits.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(16, b.w / 2), sel: { k: "gauge" } });
      }
    }
    // kilometre numbers beside the stones
    if (show(4)) {
      ctx.font = fontUI(12);
      ctx.textAlign = "left";
      for (const s of m.stones) {
        if (!show(8) && s.km % 2) continue;
        const [x, y] = iso.onSurface([s.x, s.y], 0);
        const box = { x: x + u * 0.6, y: y - u * 0.4 - 12, w: 18, h: 14 };
        hits.push({ x, y: y - u * 0.5, r: Math.max(10, u), sel: { k: "stone", km: s.km } });
        if (overlaps(box)) continue;
        placed.push(box);
        ctx.strokeStyle = C.white;
        ctx.lineWidth = 3;
        ctx.strokeText(String(s.km), box.x, y - u * 0.4);
        ctx.fillStyle = C.kesarDeep;
        ctx.fillText(String(s.km), box.x, y - u * 0.4);
      }
    }

    teamLabels.forEach((f) => f());

    // the selected cell
    if (S.sel?.k === "cell") {
      const i = S.sel.i;
      const c = i % m.C;
      const r = Math.floor(i / m.C);
      const h = iso.surface(i);
      const p = [iso.project(c, r, h), iso.project(c + 1, r, h), iso.project(c + 1, r + 1, h), iso.project(c, r + 1, h)];
      ctx.beginPath();
      p.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = C.neel;
      ctx.stroke();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = C.haldi;
      ctx.stroke();
    }

    // the double frame, hatched, like the border of a painting
    frameBorder(ctx, ...iso.size);
  }

  const cellPt = (i: number): Pt => [(i % m.C) + 0.5, Math.floor(i / m.C) + 0.5];

  function path(ctx: CanvasRenderingContext2D, pts: Pt[], col: string, now: number, walk = false) {
    if (pts.length < 2) return;
    const sp = pts.map((p) => iso.onSurface(p, 0.15));
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    sp.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3.4;
    ctx.setLineDash(walk ? [2, 7] : [9, 6]);
    ctx.lineDashOffset = reducedMotion() ? 0 : -((now / 60) % 30);
    ctx.stroke();
    ctx.setLineDash([]);
    // where it ends
    const [ex, ey] = sp[sp.length - 1];
    ctx.beginPath();
    ctx.arc(ex, ey, 5, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, r: HelpRequest, now: number) {
    const col = STATUS_TONE[r.status] ?? C.sindoor;
    const waiting = r.status === "open" || r.status === "paged";
    const sel = S.sel?.k === "help" && S.sel.id === r.id;
    if (waiting && !reducedMotion()) {
      const k = ((now / 1400) % 1 + 1) % 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 6 + k * 22, (6 + k * 22) * 0.5, 0, 0, Math.PI * 2);
      ctx.strokeStyle = C.sindoor;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (sel) ring(ctx, x, y - 22, 19, C.haldi);
    const s = r.status === "rescued" ? 0.75 : 1;
    const hy = y - 24 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 7 * s, hy + 6 * s);
    ctx.arc(x, hy, 11 * s, Math.PI * 0.82, Math.PI * 0.18);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = C.neel;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = r.status === "arrived" ? C.neel : C.white;
    ctx.font = `400 ${Math.round(13 * s)}px "Yatra One", "Baloo 2", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(r.status === "rescued" ? "✓" : String(r.people), x, hy + 1);
    ctx.textBaseline = "alphabetic";
  }

  function drawHome(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const hy = y - 26;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 8, hy + 8);
    ctx.lineTo(x - 8, hy - 2);
    ctx.lineTo(x, hy - 10);
    ctx.lineTo(x + 8, hy - 2);
    ctx.lineTo(x + 8, hy + 8);
    ctx.closePath();
    ctx.fillStyle = C.neel;
    ctx.fill();
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.haldi;
    ctx.fillRect(x - 2.5, hy + 1, 5, 6);
  }

  function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = C.neel;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const headingLeft = (t: TeamState) => {
    const d = t.drive!;
    const k = clamp((relief.now - d.t0) / d.ms);
    const ahead = remaining(d.pts, d.acc, Math.min(1, k + 0.02));
    const a = iso.onSurface(t.pos);
    const b = iso.onSurface(ahead[Math.min(1, ahead.length - 1)] ?? t.pos);
    return b[0] < a[0];
  };

  // ---------------- routes the panels talk about ----------------
  let famCache: { key: string; r: ReturnType<Relief["walkToCamp"]> } = { key: "", r: null };
  function familyRoute() {
    const mine = relief.requests.find((r) => r.id === relief.mine);
    const from = mine ? relief.cellOf(mine) : S.sel?.k === "cell" && S.role !== "family" ? S.sel.i : S.home;
    const key = `${from}|${S.level}|${S.breach}|${S.layers.observed}`;
    if (famCache.key !== key) famCache = { key, r: relief.walkToCamp(from) };
    return famCache.r;
  }
  function selectedTeamRoute(): Route | null {
    if (S.sel?.k !== "help" || S.role === "family") return null;
    const r = relief.requests.find((x) => x.id === (S.sel as { id: string }).id);
    if (!r || r.status === "rescued" || r.status === "arrived" || r.status === "claimed") return null;
    const me = relief.team(relief.myTeam);
    if (S.role === "relief" && me && me.team.status === "free") return relief.teamRoute(me, relief.cellOf(r));
    return relief.nearestFree(relief.cellOf(r))?.route ?? null;
  }

  // ---------------- the what-if line ----------------
  function updateWhatIf() {
    out.textContent = `${S.level.toFixed(2)} ${L("मी.", "m")}`;
    const f = flood();
    const km2 = saranWetKm2(m, f, S.level);
    const vs = m.villages.map((v) => ({ v, r: villageRisk(m, f, v.cells, S.level) }));
    const hit = vs.filter((x) => x.r.wetCells / x.r.cells >= 0.3);
    const homes = Math.round(vs.reduce((a, x) => a + (x.v.households * x.r.wetCells) / x.r.cells, 0));
    const vsHi = hit.map((x) => x.v.name_hi).join(", ");
    const vsEn = hit.map((x) => x.v.name_en).join(", ");
    sum.innerHTML =
      km2 < 0.05
        ? bi(
            S.level < dl ? `ख़तरे के निशान (${dl.toFixed(2)}) से नीचे: पानी नदी और दोनों बाँधों के बीच ही।` : `बाँध पानी रोके हुए है: सारण की तरफ़ पानी नहीं पहुँचता।`,
            S.level < dl ? `Below the danger level (${dl.toFixed(2)}): water stays in the river, between the embankments.` : `The embankment holds: no water reaches the Saran side.`,
          )
        : bi(
            `सारण की तरफ़ ${num(km2, 1)} किमी² पानी में${hit.length ? `; डूबते गाँव: ${vsHi}; लगभग ${homes} घर` : ""}।`,
            `${num(km2, 1)} km² under water on the Saran side${hit.length ? `; villages going under: ${vsEn}; about ${homes} homes` : ""}.`,
          );
    canvas.setAttribute(
      "aria-label",
      L(
        `हैजलपुर के पास गंडक का नक़्शा, ऊपर से तिरछा। गेज ${S.level.toFixed(2)} मी. पर। ${hit.length ? `डूबते गाँव: ${vsHi}` : "गाँव सूखे"}।`,
        `Map of the Gandak near Haijalpur, seen at an angle. Gauge at ${S.level.toFixed(2)} m. ${hit.length ? `Villages going under: ${vsEn}` : "Villages dry"}.`,
      ),
    );
    $("#lm-desc").textContent = L(
      "खींचें: नक़्शा सरकाएँ। Ctrl के साथ स्क्रॉल या दो उँगली: ज़ूम। R: घुमाएँ। किसी खाने को छुएँ: उसकी जानकारी।",
      "Drag to move the map. Ctrl + scroll or two fingers to zoom. R to rotate. Tap a cell for its details.",
    );
    gaugeBtn.innerHTML = `<span class="gl">${STAFF_ICON}</span><span><b class="num">${(rewa?.wl_m ?? today).toFixed(2)} ${L("मी.", "m")}</b> ${bil("रेवाघाट, आज", "Rewaghat, today")}<small>${bil(`ख़तरा ${dl.toFixed(2)}`, `Danger ${dl.toFixed(2)}`)}${rewa?.sample ? ` · ${bil("नमूना", "sample")}` : ""}</small></span>`;
  }

  // ruler: a painted staff gauge lying on its side, with today, danger and the crest marked
  {
    const svg = $(".lm-ruler-art", host);
    const x = (v: number) => ((v - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)) * 600;
    let ticks = "";
    for (let v = Math.ceil(LEVEL_MIN * 10) / 10; v <= LEVEL_MAX + 1e-6; v += 0.1) {
      const whole = Math.abs(v - Math.round(v)) < 1e-6;
      const half = Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;
      ticks += `<path d="M${x(v).toFixed(1)} 6V${whole ? 26 : half ? 20 : 14}" stroke="${C.neel}" stroke-width="${whole ? 2 : 1}"/>`;
    }
    svg.innerHTML = `<rect x="0" y="4" width="600" height="36" rx="6" fill="${C.white}" stroke="${C.neel}" stroke-width="2.5"/>
      <rect x="${x(dl)}" y="4" width="${x(LEVEL_MAX) - x(dl)}" height="36" fill="${C.sindoorTint}"/>
      <rect x="${x(dl) - 2}" y="4" width="4" height="36" fill="${C.sindoor}"/>
      <rect x="${x(crest) - 1.5}" y="4" width="3" height="36" fill="${C.mittiDeep}"/>
      ${ticks}<rect x="0" y="4" width="600" height="36" rx="6" fill="none" stroke="${C.neel}" stroke-width="2.5"/>`;
    const marks = $(".lm-marks", host);
    const pct = (v: number) => `${(((v - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN)) * 100).toFixed(2)}%`;
    marks.innerHTML = [
      { v: today, hi: "आज", en: "Today", cls: "today" },
      { v: dl, hi: "ख़तरा", en: "Danger", cls: "danger" },
      { v: crest, hi: "बाँध का सिरा (अनु.)", en: "Bank top (approx.)", cls: "crest" },
    ]
      .map((k) => `<button type="button" class="lm-mark ${k.cls}" style="left:${pct(k.v)}" data-level="${k.v.toFixed(2)}">${bil(k.hi, k.en)} <span class="num">${k.v.toFixed(2)}</span></button>`)
      .join("");
    marks.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-level]");
      if (b) setLevel(Number(b.dataset.level), true);
    });
  }

  range.addEventListener("input", () => {
    anim = null;
    S.level = Number(range.value);
    S.shown = S.level;
    paint(true);
    fullPaintSoon();
    updateWhatIf();
    renderSideSoon();
    need();
  });

  $(".lm-breach", host).addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    S.breach = !S.breach;
    b.setAttribute("aria-pressed", String(S.breach));
    famCache.key = "";
    // a breach only shows once the river is high enough to pour through it
    const target = S.breach && S.level < 55.8 ? 56.2 : S.level;
    if (S.breach) iso.centreOn(...m.pointAtKm(BREACH_KM));
    setLevel(target, true);
    if (target === S.level && !anim) {
      paint(true);
      fullPaintSoon();
    }
  });

  $$<HTMLButtonElement>("[data-layer]", host).forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.layer as keyof typeof S.layers;
      S.layers[k] = !S.layers[k];
      b.setAttribute("aria-pressed", String(S.layers[k]));
      famCache.key = "";
      paint(false);
      renderSide();
      need();
    }),
  );

  // ---------------- view controls ----------------
  const rotate = () => {
    const next = ((iso.rot + 1) % 4) as Rot;
    const apply = () => {
      iso.setRot(next);
      paint(false);
      updateScale();
      need();
    };
    if (reducedMotion()) return apply();
    canvas.style.transition = "transform 0.14s ease-in";
    canvas.style.transform = "scaleX(0.04)";
    setTimeout(() => {
      apply();
      canvas.style.transition = "transform 0.6s var(--spring-pop)";
      canvas.style.transform = "";
    }, 140);
  };
  $(".lm-rot", host).addEventListener("click", rotate);
  const zoomBy = (f: number) => {
    const [w, h] = iso.size;
    iso.zoomAt(f, w / 2, h / 2);
    sharpenSoon();
    need();
  };
  $(".lm-zin", host).addEventListener("click", () => zoomBy(1.4));
  $(".lm-zout", host).addEventListener("click", () => zoomBy(1 / 1.4));
  let sharpenTimer = 0;
  const sharpenSoon = () => {
    clearTimeout(sharpenTimer);
    sharpenTimer = window.setTimeout(() => {
      if (iso.sharpen()) need();
      updateScale();
    }, 160);
  };
  const updateScale = () => {
    // north: the direction of falling rows, wherever the turn has put it
    const c0 = iso.project(28, 23, m.zMin);
    const c1 = iso.project(28, 18, m.zMin);
    $(".lm-compass", host).style.setProperty("--a", `${((Math.atan2(c1[0] - c0[0], -(c1[1] - c0[1])) * 180) / Math.PI).toFixed(1)}deg`);
    // 1 km along a row, on screen
    const a = iso.project(10, 20, m.zMin);
    const b = iso.project(10 + 1 / m.cellKm, 20, m.zMin);
    const px = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const el = $(".lm-scale i", host);
    const kmShown = px > 160 ? 0.5 : px < 50 ? 2 : 1;
    el.style.width = `${Math.round(px * kmShown)}px`;
    $(".lm-scale b", host).textContent = L(`${kmShown} किमी`, `${kmShown} km`);
  };

  // pointers: drag to pan, two fingers to pinch, tap to pick
  const ptrs = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let downAt: { x: number; y: number; t: number } | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener("pointerdown", (e) => {
    const p = local(e);
    ptrs.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (ptrs.size === 1) downAt = { ...p, t: performance.now() };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      downAt = null;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) {
      // hover: a pointer cursor over things you can tap
      const p = local(e);
      canvas.style.cursor = hitAt(p.x, p.y) ? "pointer" : "grab";
      return;
    }
    const p = local(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      iso.panX += mx - pinch.mx;
      iso.panY += my - pinch.my;
      iso.zoomAt(d / pinch.d, mx, my);
      pinch = { d, mx, my };
      dragging = true;
      sharpenSoon();
      need();
      return;
    }
    if (downAt && !dragging && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) dragging = true;
    if (dragging) {
      iso.panX += p.x - prev.x;
      iso.panY += p.y - prev.y;
      iso.clampPan();
      canvas.style.cursor = "grabbing";
      need();
    }
  });
  const end = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      if (!dragging && downAt && p && e.type === "pointerup") tap(p.x, p.y);
      dragging = false;
      downAt = null;
      canvas.style.cursor = "grab";
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!S.full && !e.ctrlKey && !e.metaKey) {
        flashHint(L("ज़ूम: Ctrl के साथ स्क्रॉल करें, या + − बटन", "To zoom: Ctrl + scroll, or the + − buttons"));
        return;
      }
      e.preventDefault();
      const p = local(e);
      iso.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
      sharpenSoon();
      need();
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (e) => {
    const step = 50;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (iso.panX += step),
      ArrowRight: () => (iso.panX -= step),
      ArrowUp: () => (iso.panY += step),
      ArrowDown: () => (iso.panY -= step),
      "+": () => zoomBy(1.3),
      "=": () => zoomBy(1.3),
      "-": () => zoomBy(1 / 1.3),
      r: rotate,
      R: rotate,
      Escape: () => select(null),
    };
    const f = keys[e.key];
    if (!f) return;
    e.preventDefault();
    f();
    iso.clampPan();
    need();
  });

  let hintTimer = 0;
  const flashHint = (text: string, ms = 1600) => {
    hint.textContent = text;
    hint.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => (hint.hidden = true), ms);
  };

  const hitAt = (x: number, y: number) => {
    let best: (typeof hits)[number] | null = null;
    let bd = Infinity;
    for (const h of hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  };

  function tap(x: number, y: number) {
    const h = hitAt(x, y);
    if (h) return select(h.sel, x, y);
    const i = iso.pick(x, y);
    if (i < 0) return select(null);
    if (S.role === "family" && !relief.mine) {
      S.home = i;
      famCache.key = "";
      renderSide();
    }
    select({ k: "cell", i }, x, y);
  }

  // ---------------- the card for what you tapped ----------------
  let cardAt: { x: number; y: number } | null = null;
  function select(sel: Sel | null, x?: number, y?: number) {
    S.sel = sel;
    if (x != null && y != null) cardAt = { x, y };
    renderCard();
    renderSide();
    need();
  }

  function renderCard() {
    const sel = S.sel;
    if (!sel) {
      card.hidden = true;
      return;
    }
    let html = "";
    if (sel.k === "cell") html = cellCard(sel.i);
    else if (sel.k === "help") html = helpCard(sel.id);
    else if (sel.k === "team") html = teamCard(sel.id);
    else if (sel.k === "village") html = villageCard(sel.key);
    else if (sel.k === "camp") html = campCard(sel.key);
    else if (sel.k === "gauge") html = gaugeCard();
    else if (sel.k === "stone") html = stoneCard(sel.km);
    if (!html) {
      card.hidden = true;
      return;
    }
    card.innerHTML = `<button type="button" class="icon-btn lm-card-x" aria-label="${esc(L("बंद करें", "Close"))}">${icon("close")}</button>${html}`;
    card.hidden = false;
    // beside the tap, inside the stage
    const [w, h] = iso.size;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (w < 560 || !cardAt) {
      card.style.left = "";
      card.style.top = "";
      card.classList.add("sheet");
    } else {
      card.classList.remove("sheet");
      const left = cardAt.x + 18 + cw > w - 8 ? cardAt.x - 18 - cw : cardAt.x + 18;
      card.style.left = `${clamp(left, 8, w - cw - 8)}px`;
      card.style.top = `${clamp(cardAt.y - ch / 2, 64, h - ch - 8)}px`;
    }
  }

  const rows = (r: [string, string, string][]) =>
    `<dl class="lm-dl">${r.map(([hi, en, v]) => `<dt>${bil(hi, en)}</dt><dd>${v}</dd>`).join("")}</dl>`;

  function cellCard(i: number): string {
    const [lat, lon] = cellLatLon(m, i);
    const cls = CLS_NAME[m.cls[i]] ?? ["ज़मीन", "Land"];
    const isBank = m.emb[i] === 1 || m.emb[i] === 2;
    const title = isBank ? ["बाँध (अनुमानित रेखा)", "Embankment (approximate line)"] : m.channel[i] ? ["गंडक की धारा", "The Gandak's channel"] : cls;
    const d = depthAt(m, flood(), i, S.level);
    const vNear = nearestVillage(i);
    const sideHi = m.side[i] === 1 ? "सारण की तरफ़ (दायाँ किनारा)" : m.side[i] === -1 ? "पूरब की तरफ़ (बायाँ किनारा)" : "दोनों बाँधों के बीच";
    const sideEn = m.side[i] === 1 ? "Saran side (right bank)" : m.side[i] === -1 ? "East side (left bank)" : "Between the embankments";
    const r: [string, string, string][] = [
      ["ज़मीन की ऊँचाई", "Ground height", `${m.ground[i].toFixed(1)} ${L("मी.", "m")}${isBank ? ` + ${CREST_M} ${L("मी. बाँध (अनु.)", "m bank (approx.)")}` : ""}`],
      ["किनारा", "Side", bi(sideHi, sideEn)],
      [`उपग्रह, ${s2DateHi(m)}`, `Satellite, ${s2DateEn(m)}`, m.s2cloud[i] > 50 ? bi("बादल: यहाँ दिखा नहीं", "Cloud: couldn't see") : bi(`${m.s2water[i]}% पानी`, `${m.s2water[i]}% water`)],
      [`अगर गेज ${S.level.toFixed(2)}`, `If the gauge reads ${S.level.toFixed(2)}`, d > 0.02 ? bi(`${d.toFixed(1)} मी. पानी`, `${d.toFixed(1)} m of water`) : bi("सूखा", "Dry")],
      ["पास का गाँव", "Nearest village", vNear ? bi(`${vNear.v.name_hi}, ${num(vNear.km, 1)} किमी`, `${vNear.v.name_en}, ${num(vNear.km, 1)} km`) : "-"],
    ];
    const fam = S.role === "family" && !relief.mine;
    const walk = familyRoute();
    return `<p class="lm-card-k">${bil("खाना", "Cell")} · ${lat.toFixed(4)}, ${lon.toFixed(4)}</p>
      <h3>${bil(title[0], title[1])}</h3>${rows(r)}
      ${fam ? `<p class="small pair">${walk ? bi(`यहाँ से ${walk.camp} तक सूखा रास्ता: ${num(walk.km, 1)} किमी, पैदल लगभग ${mins(walk.min)} मिनट।`, `A dry route from here to the ${walk.camp_en}: ${num(walk.km, 1)} km, about ${mins(walk.min)} minutes on foot.`) : bi("यहाँ से शिविर तक सूखा रास्ता नहीं। ऊँची जगह पर रहें, नाव आएगी।", "No dry route to a camp from here. Stay on high ground; a boat will come.")}</p>
      <button type="button" class="btn small" data-act="ask">${bil("यहीं से मदद माँगें", "Ask for help from here")}</button>` : ""}`;
  }

  function nearestVillage(i: number): { v: MapVillage; km: number } | null {
    let best: { v: MapVillage; km: number } | null = null;
    for (const v of m.villages) {
      const km = Math.hypot((v.cell % m.C) - (i % m.C), Math.floor(v.cell / m.C) - Math.floor(i / m.C)) * m.cellKm;
      if (!best || km < best.km) best = { v, km };
    }
    return best;
  }

  function statusLine(r: HelpRequest): string {
    const t = relief.team(r.team);
    const nHi = t?.team.name_hi ?? "टीम";
    const nEn = t?.team.name_en ?? "A team";
    switch (r.status) {
      case "open":
        return bi(`मदद का इंतज़ार, ${mins(relief.minutesSince(r.raised))} मिनट से`, `Waiting for help, ${mins(relief.minutesSince(r.raised))} min`);
      case "paged":
        return bi(`${nHi} से माँगा गया${r.climbs ? " (घड़ी आगे बढ़ी)" : ""}`, `${nEn} asked${r.climbs ? " (the clock climbed)" : ""}`);
      case "claimed": {
        const left = relief.minutesLeft(r) ?? 0;
        return bi(`${nHi} रास्ते में · घड़ी में ${mins(left)} मिनट बाक़ी`, `${nEn} on the way · ${mins(left)} min left on the clock`);
      }
      case "arrived":
        return bi(`${nHi} पहुँच गई`, `${nEn} is there`);
      default:
        return bi("सुरक्षित", "Safe");
    }
  }

  function helpCard(id: string): string {
    const r = relief.requests.find((x) => x.id === id);
    if (!r || S.role === "family") return "";
    return `<p class="lm-card-k">${esc(r.id)} · ${bil("नमूना", "sample")} · ${r.channel === "helpline" ? "1800 345 6145" : r.channel === "whatsapp" ? "WhatsApp" : bil("वेब", "web")}</p>
      <h3>${bil(`${relief.villageHi(r.village)}: ${r.people} लोग`, `${r.village}: ${r.people} people`)}</h3>
      <p class="lm-needs">${r.needs.map((n) => `<span class="need">${needGlyph(n)}${bil(NEEDS.find((x) => x.id === n)!.hi, NEEDS.find((x) => x.id === n)!.en)}</span>`).join("")}${r.elderly ? `<span class="need">${icon("elders")}${bil(`${r.elderly} बुज़ुर्ग`, `${r.elderly} elderly`)}</span>` : ""}${r.children ? `<span class="need">${bil(`${r.children} बच्चे`, `${r.children} children`)}</span>` : ""}</p>
      <p class="small pair" data-tick="status:${esc(r.id)}">${statusLine(r)}</p>
      ${actionFor(r)}
      <p class="tiny dim pair">${bi("कोई नाम या फ़ोन नंबर नहीं: सिर्फ़ गिनती और जगह, और वह भी सिर्फ़ राहत दल और ज़िले को।", "No names or phone numbers: counts and a place, and only for relief teams and the district.")}</p>`;
  }

  function actionFor(r: HelpRequest): string {
    if (S.role !== "relief") return "";
    const me = relief.team(relief.myTeam);
    if (!me) return "";
    if ((r.status === "open" || (r.status === "paged" && r.team === me.team.id)) && me.team.status === "free") {
      const route = relief.teamRoute(me, relief.cellOf(r));
      return `<button type="button" class="btn small" data-act="claim" data-id="${esc(r.id)}">${bil("मैं जा रहा हूँ", "On my way")}</button>
        <p class="tiny pair">${route ? bi(`${me.team.name_hi}: ${num(route.km, 1)} किमी, लगभग ${mins(route.min)} मिनट। ${relief.answerMin} मिनट में न पहुँचे तो अगली टीम।`, `${me.team.name_en}: ${num(route.km, 1)} km, about ${mins(route.min)} min. Not there in ${relief.answerMin} minutes and the next team is asked.`) : ""}</p>`;
    }
    if (r.status === "arrived" && r.team === me.team.id) return `<button type="button" class="btn small" data-act="rescue" data-id="${esc(r.id)}" style="--shade:var(--dhaan-deep)">${icon("check")}${bil("सुरक्षित", "Safe")}</button>`;
    return "";
  }

  function teamCard(id: string): string {
    const t = relief.team(id);
    if (!t) return "";
    const r = relief.requests.find((x) => x.id === t.team.help_id);
    const eta = relief.eta(t);
    const st = t.team.status === "free" ? ["ख़ाली", "Free"] : t.team.status === "on_site" ? ["मौक़े पर", "On site"] : ["रास्ते में", "On the way"];
    return `<p class="lm-card-k">${esc(t.team.id)} · ${bil("नमूना", "sample")}</p>
      <h3 class="lm-team-h">${teamGlyph(t.team.kind)}${bil(t.team.name_hi, t.team.name_en)}</h3>
      ${rows([
        ["दल", "Crew", `${t.team.crew}`],
        ["हाल", "Status", bi(st[0], st[1])],
        ...(r && S.role !== "family" ? ([["कहाँ जा रही", "Going to", bi(`${relief.villageHi(r.village)} (${r.people} लोग)`, `${r.village} (${r.people} people)`)]] as [string, string, string][]) : []),
        ...(eta != null ? ([["पहुँचने में", "Arrives in", `<span data-tick="eta:${esc(t.team.id)}">${bi(`${mins(eta)} मिनट`, `${mins(eta)} min`)}</span>`]] as [string, string, string][]) : []),
      ])}
      <p class="tiny dim pair">${bi("जगह: Amazon Location Service ट्रैकर (असली सिस्टम में टीम का फ़ोन भेजता है)।", "Position: an Amazon Location Service tracker (in the real system, the team's phone sends it).")}</p>`;
  }

  function villageCard(key: string): string {
    const v = m.villages.find((x) => x.key === key);
    if (!v) return "";
    const c = relief.counts().find((x) => x.village === key);
    const risk = villageRisk(m, flood(), v.cells, S.level);
    const seen = v.cells.filter((i) => m.s2water[i] > 50).length;
    const sv = stretch.villages.find((x) => x.name === key);
    return `<p class="lm-card-k">${bil("गाँव", "Village")} · ${bil("जगह अनुमानित", "place approximate")}${sv?.lgd_code ? ` · LGD ${esc(sv.lgd_code)}` : ""}</p>
      <h3>${bil(v.name_hi, v.name_en)}</h3>
      ${rows([
        ["घर (वार्ड " + v.ward + ")", "Homes (ward " + v.ward + ")", `${v.households}`],
        ["तैयार घर (हो गया)", "Homes ready (Done)", c ? `${c.ready}/${c.households}` : "-"],
        [`उपग्रह, ${s2DateHi(m)}`, `Satellite, ${s2DateEn(m)}`, bi(`${v.cells.length} में से ${seen} खानों में पानी`, `water in ${seen} of ${v.cells.length} cells`)],
        [`अगर गेज ${S.level.toFixed(2)}`, `If the gauge reads ${S.level.toFixed(2)}`, risk.wetCells ? bi(`${risk.wetCells}/${risk.cells} खाने डूबे, ${risk.maxDepth.toFixed(1)} मी. तक`, `${risk.wetCells}/${risk.cells} cells under, up to ${risk.maxDepth.toFixed(1)} m`) : bi("सूखा", "Dry")],
        ["डूबने लगेगा", "Starts going under at", Number.isFinite(risk.under) ? `${risk.under.toFixed(2)} ${L("मी.", "m")}` : "-"],
        ...(c ? ([["मदद", "Help", bi(`${c.open} इंतज़ार · ${c.on_the_way} रास्ते में · ${c.safe} सुरक्षित`, `${c.open} waiting · ${c.on_the_way} on the way · ${c.safe} safe`)]] as [string, string, string][]) : []),
        ...(v.camp ? ([["शिविर", "Camp", bi(v.camp.name_hi, v.camp.name_en)]] as [string, string, string][]) : []),
      ])}`;
  }

  function campCard(key: string): string {
    const v = m.villages.find((x) => x.key === key);
    if (!v?.camp) return "";
    return `<p class="lm-card-k">${bil("राहत शिविर", "Relief camp")} · ${bil("नमूना", "sample")}</p>
      <h3>${bil(v.camp.name_hi, v.camp.name_en)}</h3>
      ${rows([
        ["किसके लिए", "For", bi(v.name_hi, v.name_en)],
        ["ज़मीन की ऊँचाई", "Ground height", `${v.camp.ground.toFixed(1)} ${L("मी.", "m")}`],
      ])}
      <p class="small pair">${bi("पास की सबसे ऊँची सूखी ज़मीन पर, उसी किनारे पर, बाँध से हटकर: नक़्शे की ऊँचाई से चुना।", "On the highest dry ground nearby, on the same side, off the bank: chosen from the map's heights.")}</p>`;
  }

  function gaugeCard(): string {
    return `<p class="lm-card-k">${bil("गेज", "Gauge")} · ${bil("जगह अनुमानित", "place approximate")}</p>
      <h3>${bil("रेवाघाट, गंडक", "Rewaghat, Gandak")}</h3>
      ${rows([
        ["आज की रीडिंग", "Today's reading", rewa ? `${rewa.wl_m.toFixed(2)} ${L("मी.", "m")}${rewa.sample ? ` (${L("नमूना", "sample")})` : ""}` : "-"],
        ["ख़तरे का निशान", "Danger level", `${dl.toFixed(2)} ${L("मी.", "m")}`],
        ["रुझान", "Trend", rewa ? bi(rewa.trend === "rising" ? "बढ़ रहा" : rewa.trend === "falling" ? "घट रहा" : "स्थिर", rewa.trend) : "-"],
        ["स्रोत", "Source", rewa ? `${esc(rewa.source)}, ${clockHiEn(rewa.time)}` : "-"],
      ])}
      <p class="small pair">${bi("नीचे की पट्टी इसी गेज की है: उसे खिसकाकर देखें कि नदी कितनी चढ़े तो कौन-सा गाँव डूबने लगता है।", "The slider below is this gauge: move it to see how high the river has to rise before each village starts going under.")}</p>`;
  }

  function stoneCard(km: number): string {
    const s = m.stones.find((x) => x.km === km);
    if (!s) return "";
    const behind = stretch.villages.filter((v) => v.behind_km && km >= v.behind_km[0] && km <= v.behind_km[1]);
    return `<p class="lm-card-k">${bil("किलोमीटर का पत्थर", "Kilometre stone")}</p>
      <h3>${bil(`किमी ${km}`, `km ${km}`)}</h3>
      ${rows([
        ["पीछे के गाँव", "Villages behind", behind.length ? bi(behind.map((v) => v.name_hi).join(", "), behind.map((v) => v.name).join(", ")) : "-"],
        ["बाँध की ऊँचाई (अनु.)", "Bank top (approx.)", `${(m.ground[s.cell] + CREST_M).toFixed(1)} ${L("मी.", "m")}`],
      ])}
      <p class="tiny dim pair">${bi(stretch.stretch.km_note_hi, stretch.stretch.km_note_en)}</p>`;
  }

  card.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".lm-card-x")) return select(null);
    act(t);
  });

  // ---------------- the role panels ----------------
  function act(t: HTMLElement) {
    const b = t.closest<HTMLElement>("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "ask") return askHelp();
    if (a === "claim" && b.dataset.id && relief.myTeam) {
      if (usingMocks) {
        if (relief.claim(b.dataset.id, relief.myTeam)) share({ t: "claim", now: relief.now, id: b.dataset.id, team: relief.myTeam });
      }
      else postThen(api.claimHelp(b.dataset.id, relief.myTeam, roleToken()));
    }
    if (a === "rescue" && b.dataset.id) {
      if (usingMocks) {
        if (relief.rescue(b.dataset.id)) share({ t: "rescue", now: relief.now, id: b.dataset.id });
      }
      else postThen(api.rescued(b.dataset.id, roleToken()));
    }
    if (a === "team" && b.dataset.id) {
      relief.myTeam = b.dataset.id;
      const t2 = relief.team(b.dataset.id);
      if (t2) {
        iso.centreOn(...t2.pos);
        S.sel = { k: "team", id: t2.team.id };
      }
    }
    if (a === "people") S.people = clamp(S.people + Number(b.dataset.d), 1, 15);
    if (a === "elderly") S.elderly = S.elderly ? 0 : 1;
    if (a === "children") S.children = S.children ? 0 : 1;
    if (a === "need") {
      const n = b.dataset.need as HelpNeed;
      if (S.needs.has(n)) S.needs.delete(n);
      else S.needs.add(n);
    }
    if (a === "go" && b.dataset.id) {
      const r = relief.requests.find((x) => x.id === b.dataset.id);
      if (r) {
        const c = relief.cellOf(r);
        iso.centreOn((c % m.C) + 0.5, Math.floor(c / m.C) + 0.5);
        S.sel = { k: "help", id: r.id };
        const [x, y] = iso.cellPoint(c);
        cardAt = { x, y };
      }
    }
    if (a === "again") {
      relief.mine = null;
      famCache.key = "";
    }
    renderSide();
    renderCard();
    need();
  }

  function askHelp() {
    const cell = S.sel?.k === "cell" ? S.sel.i : S.home;
    S.home = cell;
    if (usingMocks) {
      const r = relief.raise(cell, S.people, [...S.needs], S.elderly, S.children);
      share({ t: "raise", now: relief.now, id: r.id, cell, people: r.people, needs: r.needs, elderly: r.elderly ?? 0, children: r.children ?? 0 });
    }
    else {
      const [lat, lon] = cellLatLon(m, cell);
      postThen(api.createHelp({ lat, lon, people: S.people, elderly: S.elderly, children: S.children, needs: [...S.needs], channel: "web" }), (r) => (relief.mine = r.id));
    }
    famCache.key = "";
    S.sel = null;
    renderCard();
    renderSide();
    need();
  }

  // the real API: relief and district actions carry a role token (from the department, never in git)
  function roleToken(): string {
    try {
      return sessionStorage.getItem("bp-role-token") ?? "";
    } catch {
      return "";
    }
  }
  function postThen<T>(p: Promise<T>, then?: (v: T) => void) {
    p.then((v) => {
      then?.(v);
      return refresh();
    }).catch((err) => {
      console.warn(err);
      flashHint(L("नहीं हो पाया। दोबारा कोशिश करें।", "That didn't go through. Try again."));
    });
  }
  async function refresh() {
    if (relief.inStory) return;
    const [h, t] = await Promise.all([api.help(roleToken() || undefined), api.teams()]);
    relief.load(h, t);
    renderSide();
    need();
  }
  // a few seconds is enough for two phones to feel connected, and cheap enough for the API
  if (!usingMocks) setInterval(() => visible && document.visibilityState === "visible" && refresh().catch(() => undefined), 4000);

  side.addEventListener("click", (e) => act(e.target as HTMLElement));

  let sideTimer = 0;
  const renderSideSoon = () => {
    clearTimeout(sideTimer);
    sideTimer = window.setTimeout(renderSide, 120);
  };

  function renderSide() {
    const focusKey = (document.activeElement as HTMLElement | null)?.closest?.("[data-key]")?.getAttribute("data-key");
    side.innerHTML = S.role === "family" ? familyPanel() : S.role === "relief" ? reliefPanel() : districtPanel();
    if (focusKey) side.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  function familyPanel(): string {
    const mine = relief.requests.find((r) => r.id === relief.mine);
    const counts = relief.counts();
    const villageRows = counts
      .map((c) => {
        const v = m.villages.find((x) => x.key === c.village);
        return `<li><span class="vn">${bil(v?.name_hi ?? c.village, c.village)}</span><span class="vc"><b class="o">${c.open}</b> ${bil("इंतज़ार", "waiting")} <b class="w">${c.on_the_way}</b> ${bil("रास्ते में", "on the way")} <b class="s">${c.safe}</b> ${bil("सुरक्षित", "safe")}</span></li>`;
      })
      .join("");
    const walk = familyRoute();
    const near = nearestVillage(S.home);
    let top = "";
    if (!mine) {
      top = `<h3 class="display h3 bi"><span class="hi">मदद चाहिए?</span><span class="en">Need help?</span></h3>
        <ol class="lm-steps small">
          <li>${bil("नक़्शे पर अपना घर छुएँ", "Tap your home on the map")}<span class="dim"> · ${near ? bil(`अभी: ${near.v.name_hi} के पास`, `now: near ${near.v.name_en}`) : ""}</span></li>
          <li>${bil("कितने लोग हैं, बताएँ", "Say how many people")}</li>
          <li>${bil("बटन दबाएँ", "Press the button")}</li>
        </ol>
        <div class="lm-people">
          <span class="small">${bil("लोग", "People")}</span>
          <button type="button" class="icon-btn" data-act="people" data-d="-1" data-key="p-" aria-label="${esc(L("एक कम", "One fewer"))}">${MINUS_ICON}</button>
          <b class="num">${S.people}</b>
          <button type="button" class="icon-btn" data-act="people" data-d="1" data-key="p+" aria-label="${esc(L("एक और", "One more"))}">${PLUS_ICON}</button>
          <button type="button" class="chip" data-act="elderly" data-key="eld" aria-pressed="${!!S.elderly}">${bil("बुज़ुर्ग साथ", "Elderly")}</button>
          <button type="button" class="chip" data-act="children" data-key="chi" aria-pressed="${!!S.children}">${bil("छोटे बच्चे", "Small children")}</button>
        </div>
        <div class="lm-needs-pick">${NEEDS.map((n) => `<button type="button" class="chip" data-act="need" data-need="${n.id}" data-key="n-${n.id}" aria-pressed="${S.needs.has(n.id)}">${needGlyph(n.id)}${bil(n.hi, n.en)}</button>`).join("")}</div>
        <button type="button" class="btn lm-ask" data-act="ask" data-key="ask" style="--shade:var(--sindoor)">${HELP_ICON}<span class="bi"><span class="hi">मदद चाहिए</span><span class="en">I need help</span></span></button>
        <p class="small pair lm-walk">${walk ? bi(`अभी पैदल: ${walk.camp} तक ${num(walk.km, 1)} किमी, लगभग ${mins(walk.min)} मिनट, सूखे रास्ते से (नक़्शे पर हरी बिंदियाँ)।`, `On foot now: ${num(walk.km, 1)} km to the ${walk.camp_en}, about ${mins(walk.min)} minutes, on a dry route (green dots on the map).`) : bi("आपके घर से शिविर तक सूखा रास्ता नहीं: ऊँची जगह पर रहें, मदद माँगें।", "No dry route from your home to a camp: stay on high ground and ask for help.")}</p>
        <p class="tiny dim pair">${bi("WhatsApp पर भी: अपनी लोकेशन पिन के साथ 'मदद' लिखकर भेजें।", "On WhatsApp too: send your location pin with the word 'मदद'.")}</p>`;
    } else {
      const t = relief.team(mine.team);
      const eta = t ? relief.eta(t) : null;
      const steps: [string, string, boolean][] = [
        ["माँग पहुँची", "Request received", true],
        ["टीम ने ली", "A team took it", ["claimed", "arrived", "rescued"].includes(mine.status)],
        ["टीम पहुँची", "The team is here", ["arrived", "rescued"].includes(mine.status)],
        ["सुरक्षित", "Safe", mine.status === "rescued"],
      ];
      top = `<div class="lm-mine signboard" style="--edge:${mine.status === "rescued" ? "var(--dhaan)" : "var(--kesar)"}">
          <p class="lm-card-k">${esc(mine.id)} · ${bil("नमूना", "sample")}</p>
          <h3 class="display h3 bi">${mine.status === "rescued" ? `<span class="hi">आप सुरक्षित हैं</span><span class="en">You are safe</span>` : `<span class="hi">मदद आ रही है</span><span class="en">Help is coming</span>`}</h3>
          <ol class="lm-track">${steps.map(([hi, en, on]) => `<li class="${on ? "on" : ""}">${bil(hi, en)}</li>`).join("")}</ol>
          <p class="small pair" data-tick="status:${esc(mine.id)}">${statusLine(mine)}</p>
          ${eta != null ? `<p class="lm-eta"><b class="num" data-tick="eta:${esc(t!.team.id)}">${mins(eta)}</b> ${bil("मिनट में पहुँचेगी", "minutes away")}</p>` : ""}
          <p class="small pair">${walk ? bi(`पानी उतरे तो शिविर: ${walk.camp}, ${num(walk.km, 1)} किमी, सूखे रास्ते से।`, `When you can walk: the ${walk.camp_en}, ${num(walk.km, 1)} km, on a dry route.`) : bi("जहाँ हैं वहीं ऊँची जगह पर रहें: रास्ता पानी में है, नाव आएगी।", "Stay where you are, on high ground: the way is under water, a boat will come.")}</p>
          <button type="button" class="btn small paper" data-act="again" data-key="again">${bil("नई माँग (डेमो)", "New request (demo)")}</button>
        </div>`;
    }
    return `${top}
      <div class="lm-public">
        <h4 class="small">${bil("गाँव-गाँव मदद की गिनती", "Help, village by village")}</h4>
        <ul class="lm-vcount">${villageRows}</ul>
        <p class="tiny dim pair">${bi("निजता: इस सार्वजनिक दृश्य में सिर्फ़ गिनती। सही जगह सिर्फ़ राहत दल और ज़िले को दिखती है, कोई नाम या नंबर नहीं।", "Privacy: this public view shows counts only. Exact places go only to relief teams and the district, with no names or numbers.")}</p>
      </div>`;
  }

  function reliefPanel(): string {
    if (!relief.myTeam) relief.myTeam = (relief.teams.find((t) => t.team.status === "free") ?? relief.teams[0])?.team.id ?? null;
    const me = relief.team(relief.myTeam);
    const teamsRow = relief.teams
      .map((t) => `<button type="button" class="chip" data-act="team" data-id="${esc(t.team.id)}" data-key="t-${esc(t.team.id)}" aria-pressed="${t.team.id === relief.myTeam}">${teamGlyph(t.team.kind)}${bil(t.team.name_hi, t.team.name_en)}</button>`)
      .join("");
    const list = relief.requests
      .filter((r) => r.status !== "rescued")
      .map((r) => ({ r, route: me ? relief.teamRoute(me, relief.cellOf(r)) : null }))
      .sort((a, b) => (a.r.team === relief.myTeam ? -1 : 0) - (b.r.team === relief.myTeam ? -1 : 0) || (a.route?.min ?? 999) - (b.route?.min ?? 999));
    let mine = "";
    if (me) {
      const r = relief.requests.find((x) => x.id === me.team.help_id && x.status !== "rescued");
      const eta = relief.eta(me);
      const left = r ? relief.minutesLeft(r) : null;
      mine = `<div class="lm-myteam">
        <p class="small">${bil("आपकी टीम", "Your team")}: <b>${bil(me.team.name_hi, me.team.name_en)}</b> · ${me.team.crew} ${bil("लोग", "crew")}</p>
        ${
          r
            ? `<p class="pair">${bi(`${relief.villageHi(r.village)}, ${r.people} लोग`, `${r.village}, ${r.people} people`)}</p>
               ${r.status === "claimed" && left != null ? `<p class="lm-clockbig ${left < 5 ? "late" : ""}"><b class="num" data-tick="left:${esc(r.id)}">${mins(left)}</b> ${bil("मिनट घड़ी में बाक़ी", "minutes left on the clock")}${eta != null ? ` · ${bil("पहुँचने में", "arrive in")} <span data-tick="eta:${esc(me.team.id)}">${mins(eta)}</span>` : ""}</p>` : ""}
               ${actionFor(r)}`
            : `<p class="small pair">${bi("ख़ाली: नीचे से सबसे पास वाली माँग लें।", "Free: take the nearest request below.")}</p>`
        }
      </div>`;
    }
    const rowsHtml = list
      .map(({ r, route }) => {
        const tone = STATUS_TONE[r.status];
        const forMe = r.status === "paged" && r.team === relief.myTeam;
        return `<li class="lm-req ${forMe ? "forme" : ""}">
          <button type="button" class="lm-req-go" data-act="go" data-id="${esc(r.id)}" data-key="go-${esc(r.id)}">
            <i class="dot" style="background:${tone}"></i>
            <span class="who">${bil(`${relief.villageHi(r.village)}, ${r.people} लोग`, `${r.village}, ${r.people} people`)}${r.elderly ? ` ${icon("elders")}` : ""}</span>
            <span class="needs">${r.needs.map(needGlyph).join("")}</span>
            <span class="st small" data-tick="status:${esc(r.id)}">${statusLine(r)}</span>
            <span class="far num">${route ? `${mins(route.min)}<small>${bil("मिनट", "min")}</small>` : "-"}</span>
          </button>
          ${forMe ? `<p class="tiny lm-forme">${bil("घड़ी आगे बढ़ी: आपसे माँगा गया", "The clock climbed: you're asked")}</p>` : ""}
          ${(r.status === "open" || forMe) && me?.team.status === "free" ? `<button type="button" class="btn small" data-act="claim" data-id="${esc(r.id)}" data-key="c-${esc(r.id)}">${bil("मैं जा रहा हूँ", "On my way")}</button>` : ""}
        </li>`;
      })
      .join("");
    return `<div class="lm-teams">${teamsRow}</div>
      ${mine}
      <h3 class="lm-h">${bil("माँगें, सबसे पास पहले", "Requests, nearest first")}</h3>
      <ol class="lm-reqs">${rowsHtml || `<li class="small">${bil("कोई खुली माँग नहीं", "No open requests")}</li>`}</ol>
      <p class="tiny dim pair">${bi(`"मैं जा रहा हूँ" से ${relief.answerMin} मिनट की घड़ी चलती है। उतने में न पहुँचे तो वही Step Functions घड़ी अगली टीम से माँगती है और ज़िले को बताती है।`, `"On my way" starts a ${relief.answerMin}-minute clock. Not there in time, and the same Step Functions clock asks the next team and tells the district.`)}</p>
      <p class="tiny dim pair">${bi("असली सिस्टम में यह दृश्य राहत दल के कोड से खुलता है। यहाँ सब नमूना है।", "In the real system this view opens with a relief team's code. Everything here is a sample.")}</p>`;
  }

  function districtPanel(): string {
    const f = flood();
    const km2 = saranWetKm2(m, f, S.level);
    let seenCells = 0;
    for (let i = 0; i < m.N; i++) if (m.side[i] === 1 && m.s2water[i] > 50) seenCells++;
    const seenKm2 = seenCells * m.cellKm * m.cellKm;
    const atRisk = Math.round(
      m.villages.reduce((a, v) => {
        const r = villageRisk(m, f, v.cells, S.level);
        const wetShare = r.wetCells / r.cells;
        const seenShare = S.layers.observed ? v.cells.filter((i) => m.s2water[i] > 50).length / v.cells.length : 0;
        return a + v.households * Math.max(wetShare, seenShare);
      }, 0),
    );
    const open = relief.requests.filter((r) => r.status === "open" || r.status === "paged");
    const waitingPeople = open.reduce((a, r) => a + r.people, 0);
    const safePeople = relief.requests.filter((r) => r.status === "rescued").reduce((a, r) => a + r.people, 0);
    const reach = open
      .map((r) => relief.nearestFree(relief.cellOf(r))?.route.min)
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b);
    const med = reach.length ? reach[Math.floor(reach.length / 2)] : null;
    const free = relief.teams.filter((t) => t.team.status === "free").length;
    const moving = relief.teams.filter((t) => t.team.status === "on_the_way").length;
    const climbs = relief.requests.reduce((a, r) => a + (r.climbs ?? 0), 0);
    const tile = (big: string, hi: string, en: string, tone = "") => `<div class="lm-tile ${tone}"><b class="num">${big}</b><span>${bil(hi, en)}</span></div>`;
    const counts = relief.counts();
    const ready = counts
      .map((c) => {
        const v = m.villages.find((x) => x.key === c.village);
        const p = c.households ? c.ready / c.households : 0;
        return `<li><span class="vn">${bil(v?.name_hi ?? c.village, c.village)}</span><span class="bar" role="img" aria-label="${c.ready}/${c.households}"><i style="width:${(p * 100).toFixed(0)}%"></i></span><b class="num">${c.ready}/${c.households}</b></li>`;
      })
      .join("");
    const log = relief.log
      .slice(0, 5)
      .map((l) => `<li class="${l.tone ?? ""}"><span class="t">${bil(clockHi(new Date(l.at).toISOString()), clockEn(new Date(l.at).toISOString()))}</span><span class="pair">${bi(l.hi, l.en)}</span></li>`)
      .join("");
    return `<div class="lm-tiles">
        ${tile(num(km2, 1), `किमी² पानी में (अगर ${S.level.toFixed(2)})`, `km² under water (if ${S.level.toFixed(2)})`)}
        ${tile(num(seenKm2, 1), `किमी², उपग्रह ने देखा (${s2DateHi(m)})`, `km² seen by satellite (${s2DateEn(m)})`)}
        ${tile(String(atRisk), "घर ख़तरे में", "homes at risk", atRisk ? "warn" : "")}
        ${tile(`${open.length}`, `खुली माँगें, ${waitingPeople} लोग`, `open requests, ${waitingPeople} people`, open.length ? "warn" : "")}
        ${tile(`${free}/${relief.teams.length}`, `टीमें ख़ाली, ${moving} रास्ते में`, `teams free, ${moving} on the way`)}
        ${tile(med != null ? String(mins(med)) : "-", "मिनट, सबसे पास की टीम तक (बीच का)", "min for the nearest team (median)")}
        ${tile(String(safePeople), "लोग सुरक्षित", "people safe", "ok")}
        ${tile(String(climbs), "बार घड़ी आगे बढ़ी", "times the clock climbed", climbs ? "warn" : "")}
      </div>
      <h3 class="lm-h">${bil("गाँव की तैयारी (हो गया)", "Village readiness (Done)")}</h3>
      <ul class="lm-ready">${ready}</ul>
      <h3 class="lm-h">${bil("अभी क्या हुआ", "Just now")}</h3>
      <ol class="lm-log">${log || `<li class="small">${bil("घड़ी चल रही है…", "The clock is running…")}</li>`}</ol>
      <p class="tiny dim pair">${bi("यह आँकड़े उसी नक़्शे से गिने जाते हैं। ज़िले को IRS फ़ॉर्म 001 में यही तस्वीर जाती है।", "These numbers are counted from the same map. The same picture goes to the district in the IRS Form 001 briefing.")}</p>`;
  }

  // ---------------- the clock texts, twice a second ----------------
  function tickTexts() {
    clockEl.textContent = L(clockHi(new Date(relief.now).toISOString()), clockEn(new Date(relief.now).toISOString()));
    if (story.on) storyT.textContent = clockEl.textContent;
    $$<HTMLElement>("[data-tick]", host).forEach((el) => {
      const [kind, id] = el.dataset.tick!.split(":");
      if (kind === "status") {
        const r = relief.requests.find((x) => x.id === id);
        if (r) el.innerHTML = statusLine(r);
      } else if (kind === "eta") {
        const t = relief.team(id);
        const e = t ? relief.eta(t) : null;
        if (e != null) el.textContent = el.closest(".lm-card") ? L(`${mins(e)} मिनट`, `${mins(e)} min`) : String(mins(e));
      } else if (kind === "left") {
        const r = relief.requests.find((x) => x.id === id);
        const left = r ? relief.minutesLeft(r) : null;
        if (left != null) {
          el.textContent = String(mins(left));
          el.closest(".lm-clockbig")?.classList.toggle("late", left < 5);
        }
      }
    });
  }

  // ---------------- roles, full screen, language ----------------
  const roleBtns = $$<HTMLButtonElement>(".lm-roles button", host);
  let myTeamChoice: string | null = null;
  const setRole = (role: Role) => {
    S.role = role;
    roleBtns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.role === role)));
    host.dataset.role = role;
    // only the relief view plays a team; elsewhere the demo acts for every team
    if (role === "relief") relief.myTeam = myTeamChoice;
    else {
      if (relief.myTeam) myTeamChoice = relief.myTeam;
      relief.myTeam = null;
    }
    if (S.sel?.k === "help" && role === "family") S.sel = null;
    renderSide();
    renderCard();
    need();
  };
  roleBtns.forEach((b, i) => {
    b.addEventListener("click", () => setRole(b.dataset.role as Role));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = roleBtns[(i + d + roleBtns.length) % roleBtns.length];
      n.focus();
      setRole(n.dataset.role as Role);
    });
  });

  // ---------------- two windows, one demo ----------------
  // On sample data, windows of this page on one device share their actions, so a family window and a
  // relief window play the same night together (the two-phone moment without a server). With the real
  // API every phone reads the same server instead.
  if (link) {
    let synced = false;
    const linkedBadge = host.querySelector<HTMLElement>(".lm-linked");
    const joined = () => {
      relief.autoPageMin = 6; // give the person in the relief window time to answer first
      if (linkedBadge) linkedBadge.hidden = false;
    };
    link.onmessage = (e: MessageEvent<LinkMsg>) => {
      if (relief.inStory) return;
      const d = e.data;
      if (d.t === "hello") {
        share({ t: "here", now: relief.now });
        joined();
        return;
      }
      if (d.t === "here") {
        if (!synced) relief.now = d.now;
        synced = true;
        joined();
        return;
      }
      relief.now = Math.max(relief.now, d.now);
      if (d.t === "raise" && !relief.requests.some((r) => r.id === d.id)) {
        relief.raise(d.cell, d.people, d.needs, d.elderly, d.children, { id: d.id });
        if (S.role !== "family") flashHint(L("नई मदद की माँग आई", "A new call for help came in"));
      }
      if (d.t === "claim") {
        relief.humanTeams.add(d.team);
        relief.claim(d.id, d.team);
      }
      if (d.t === "rescue") relief.rescue(d.id, true);
      renderSide();
      renderCard();
      need();
    };
    share({ t: "hello" });
  }
  host.querySelector(".lm-pair")?.addEventListener("click", () => {
    const u = new URL(location.href);
    u.searchParams.set("role", "relief");
    u.hash = "naksha";
    window.open(u.toString(), "bp-relief", "popup,width=480,height=860");
  });
  const asked = new URLSearchParams(location.search).get("role");
  if (asked === "relief" || asked === "district") queueMicrotask(() => setRole(asked));

  // ---------------- the night of 29-30 September, played on the map ----------------
  // The replay tells the night on phones; this plays it on the ground. The river climbs past danger,
  // the patrol worker reports at our km 14 (the replay's 11:40 PM), the engineer answers, the bank
  // slumps and gives way, the water finds the low fields, a family asks for a boat and the nearest
  // team goes on the same answer clock, until dawn. Sample data and a rough flood sketch, labelled.
  const IST = (hhmm: string, day = 29) => Date.parse(`2026-09-${day}T${hhmm}:00+05:30`);
  const breachBtn = $<HTMLButtonElement>(".lm-breach", host);
  const storyEl = $(".lm-story", host);
  const storyLine = $(".lm-story-line", host);
  const storyT = $(".lm-story-t", host);
  const storyEnd = $(".lm-story-end", host);
  const storySteps = $$<HTMLElement>(".lm-story-steps li", host);
  const story = {
    on: false,
    night: 0, // 0 day to 1 night, eased towards nightTo every frame
    nightTo: 0,
    sun: 0, // dawn: the sun rises as the night goes
    follow: null as (() => Pt | null) | null,
    zoomTo: 0,
    zooming: false,
    timers: [] as number[],
    req: "",
    seen: "",
    climbs: 0,
    team: "",
    ringKm: 0,
  };
  const storySay = (step: number, hi: string, en: string) => {
    storyLine.innerHTML = bi(hi, en);
    storySteps.forEach((li, k) => {
      li.classList.toggle("done", k < step - 1);
      li.classList.toggle("now", k === step - 1);
    });
    if (!reducedMotion()) storyLine.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "ease-out" });
  };
  const shake = () => {
    if (reducedMotion()) return;
    canvas.animate(
      [{ transform: "none" }, { transform: "translate(-7px, 3px)" }, { transform: "translate(6px, -3px)" }, { transform: "translate(-4px, 2px)" }, { transform: "translate(2px, -1px)" }, { transform: "none" }],
      { duration: 520, easing: "ease-out" },
    );
  };

  function storyStart() {
    storyStop(false);
    delete document.documentElement.dataset.mapNight;
    story.on = true;
    relief.beginStory(IST("23:00"));
    if (S.role !== "family") setRole("family");
    S.sel = null;
    S.breach = false;
    breachBtn.setAttribute("aria-pressed", "false");
    if (haijalpur) S.home = haijalpur.cell;
    famCache.key = "";
    setLevel(dl - 0.3, false);
    host.dataset.story = "1";
    storyEl.hidden = false;
    storyEnd.hidden = true;
    story.nightTo = 1;
    story.sun = 0;
    if (reducedMotion()) story.night = 1;
    story.zoomTo = iso.size[0] < 700 ? 2.3 : 1.9;
    const km = m.pointAtKm(BREACH_KM);
    story.follow = () => km;
    story.req = "";
    story.ringKm = 0;
    renderCard();
    renderSide();
    tickTexts();
    storySay(1, "29 सितंबर, रात 11 बजे। रेवाघाट पर गंडक ख़तरे के निशान के पास है।", "29 September, 11 PM. At Rewaghat the Gandak is close to danger level.");
    const at = (ms: number, f: () => void) => story.timers.push(window.setTimeout(f, ms));
    at(2000, () => {
      relief.now = IST("23:25");
      setLevel(dl + 0.9, true);
      storySay(1, "पानी ख़तरे के निशान से ऊपर चढ़ता है। बाँध अभी पानी रोके हुए है।", "The water climbs past danger level. The embankment still holds.");
    });
    at(6000, () => {
      relief.now = IST("23:40");
      story.ringKm = BREACH_KM;
      storySay(2, `रात 11:40: पहरेदार किमी ${BREACH_KM} पर रिसाव की ख़बर देता है। जवाब घड़ी शुरू होती है (वही रात जो ऊपर रीप्ले में है)।`, `11:40 PM: the patrol worker reports seepage at km ${BREACH_KM}. The answer clock starts (the night the replay above tells).`);
    });
    at(10500, () => {
      relief.now = IST("23:53");
      storySay(2, "11:53: इंजीनियर जवाब देता है। गाँव को 'तैयार रहें': अनाज ऊपर, मवेशी ऊँची जगह, काग़ज़ थैले में।", "11:53 PM: the engineer answers. The village gets 'Get ready': grain up high, cattle to high ground, papers in a bag.");
    });
    at(15000, () => {
      relief.now = IST("02:10", 30);
      storySay(3, "रात 2:10: बाँध धँसने लगता है। गाँव को 'निकल चलो' जाता है।", "2:10 AM: the bank starts to slump. 'Move now' goes to the village.");
    });
    at(18800, () => {
      relief.now = IST("02:30", 30);
      story.ringKm = 0;
      S.breach = true;
      breachBtn.setAttribute("aria-pressed", "true");
      famCache.key = "";
      setLevel(Math.max(S.level, 56.4), true);
      shake();
      storySay(3, `रात 2:30: किमी ${BREACH_KM} पर बाँध टूटता है (यहाँ मानी गई जगह)। पानी सारण की तरफ़ के नीचे खेतों में भरता है।`, `2:30 AM: the embankment gives way at km ${BREACH_KM} (an assumed spot). Water fills the low fields on the Saran side.`);
    });
    at(24500, () => {
      if (!haijalpur) return finish(null);
      relief.now = IST("02:41", 30);
      const cell = haijalpur.cell;
      S.home = cell;
      const r = relief.raise(cell, 6, ["boat"], 1, 2);
      story.req = r.id;
      story.seen = r.status;
      story.climbs = 0;
      famCache.key = "";
      story.follow = () => cellPt(cell);
      storySay(4, "2:41: हैजलपुर में पानी से घिरा एक परिवार नाव माँगता है: 6 लोग, एक बुज़ुर्ग, दो बच्चे।", "2:41 AM: a family in Haijalpur, cut off by water, asks for a boat: 6 people, one of them elderly, two children.");
      renderSide();
      need();
    });
    // if no team can reach them (or the tab slept), the story still ends
    at(95000, () => {
      if (story.on && storyEnd.hidden) finish(null);
    });
  }

  // follows the family's request through the same clock the relief view runs
  function storyWatch() {
    if (!story.on || !story.req) return;
    const r = relief.requests.find((x) => x.id === story.req);
    if (!r) return;
    const climbs = r.climbs ?? 0;
    if (r.status === story.seen && climbs === story.climbs) return;
    story.seen = r.status;
    const t = relief.team(r.team);
    const tHi = t?.team.name_hi ?? "टीम";
    const tEn = t?.team.name_en ?? "The team";
    if (climbs > story.climbs) {
      story.climbs = climbs;
      storySay(5, `20 मिनट पूरे और टीम नहीं पहुँची: घड़ी ने अगली टीम, ${tHi}, से माँगा और ज़िले को बताया।`, `20 minutes up and the team hasn't arrived: the clock asks the next team, ${tEn}, and tells the district.`);
      return;
    }
    if (r.status === "paged") storySay(4, `सबसे पास की ख़ाली टीम, ${tHi}, को ख़बर जाती है।`, `The nearest free team, ${tEn}, is asked.`);
    else if (r.status === "claimed") {
      story.team = r.team ?? "";
      story.follow = () => relief.team(story.team)?.pos ?? null;
      const eta = t ? relief.eta(t) : null;
      storySay(5, `${tHi}: "मैं जा रहा हूँ"। 20 मिनट की जवाब घड़ी शुरू।${eta != null ? ` रास्ता लगभग ${mins(eta)} मिनट।` : ""}`, `${tEn}: "On my way." The 20-minute answer clock starts.${eta != null ? ` About ${mins(eta)} minutes by its route.` : ""}`);
    } else if (r.status === "arrived") {
      const took = mins(relief.minutesSince(r.raised));
      storySay(5, `${tHi} माँग के ${took} मिनट बाद परिवार तक पहुँची।`, `${tEn} reached the family ${took} minutes after they asked.`);
    } else if (r.status === "rescued") finish(r);
  }

  // dawn, and what the record shows
  function finish(r: HelpRequest | null) {
    story.nightTo = 0;
    story.sun = 0.001;
    story.follow = null;
    story.zoomTo = iso.size[0] < 700 ? 1.8 : 1.3;
    const camp = r ? m.villages.find((v) => v.key === r.village)?.camp : null;
    if (r)
      storySay(
        6,
        `सुबह से पहले ${r.people} लोग सुरक्षित${camp ? `, ${camp.name_hi} में` : ""}। हर क़दम का एक मालिक, एक समय-सीमा और एक रिकॉर्ड।`,
        `${r.people} people safe before dawn${camp ? `, at ${camp.name_en}` : ""}. Every step had an owner, a deadline and a record.`,
      );
    else storySay(6, "सुबह। हर क़दम का एक मालिक, एक समय-सीमा और एक रिकॉर्ड।", "Morning. Every step had an owner, a deadline and a record.");
    const t = (iso?: string | null) => (iso ? [clockHi(iso), clockEn(iso)] : ["-", "-"]);
    if (r) {
      const [a, b, c, d] = [t(r.raised), t(r.claimed), t(r.arrived), t(r.rescued)];
      $(".lm-story-sum", host).innerHTML = bi(
        `माँगी ${a[0]} · टीम चली ${b[0]} · पहुँची ${c[0]} · सुरक्षित ${d[0]}। उस रात असल में कोई घड़ी नहीं थी; विभाग की समीक्षा ने ऐसी बातें एक हफ़्ते बाद पाईं।`,
        `Asked ${a[1]} · team on its way ${b[1]} · there ${c[1]} · safe ${d[1]}. That night there was no clock; the department's review found such things a week later.`,
      );
    } else $(".lm-story-sum", host).innerHTML = "";
    storyEnd.hidden = false;
  }

  function storyStop(restore = true) {
    story.timers.forEach(clearTimeout);
    story.timers = [];
    if (!story.on) return;
    story.on = false;
    story.follow = null;
    story.zoomTo = 0;
    story.ringKm = 0;
    story.req = "";
    story.nightTo = 0;
    story.sun = 0;
    if (!restore) return;
    story.night = 0;
    delete host.dataset.story;
    storyEl.hidden = true;
    relief.endStory();
    S.breach = false;
    breachBtn.setAttribute("aria-pressed", "false");
    if (haijalpur) S.home = haijalpur.cell;
    famCache.key = "";
    setLevel(today, true);
    renderSide();
    renderCard();
    tickTexts();
    need();
  }

  // every frame while the night plays: the dark comes and goes, the camera follows what matters
  function storyFrame(dt: number) {
    const k = reducedMotion() ? 1 : dt;
    if (story.night < story.nightTo) story.night = Math.min(story.nightTo, story.night + k / 1600);
    else if (story.night > story.nightTo) story.night = Math.max(story.nightTo, story.night - k / 2600);
    if (story.sun > 0 && story.sun < 1) story.sun = Math.min(1, story.sun + k / 2600);
    if (dragging) return;
    const p = story.follow?.();
    if (p) {
      const [w, h] = iso.size;
      const [sx, sy] = iso.onSurface(p, 0);
      const a = reducedMotion() ? 1 : 1 - Math.exp(-dt / 450);
      iso.panX += (w / 2 - sx) * a;
      iso.panY += (h / 2 - sy) * a;
      iso.clampPan();
    }
    if (story.zoomTo) {
      const [w, h] = iso.size;
      const ratio = story.zoomTo / iso.zoom;
      if (Math.abs(ratio - 1) > 0.01) {
        iso.zoomAt(reducedMotion() ? ratio : Math.pow(ratio, Math.min(1, dt / 380)), w / 2, h / 2, 0.8, 6);
        story.zooming = true;
      } else if (story.zooming) {
        story.zooming = false;
        story.zoomTo = 0;
        sharpenSoon();
      }
    }
  }

  // night: multiply the ground towards indigo, then lamps in the villages
  function nightShade(ctx: CanvasRenderingContext2D, k: number) {
    const [w, h] = iso.size;
    const mix = (a: number, b: number) => Math.round(a + (b - a) * k);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${mix(255, 104)}, ${mix(255, 110)}, ${mix(255, 176)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "screen";
    const u = iso.unit;
    for (const v of m.villages) {
      const [x, y] = iso.cellPoint(v.cell, 0);
      const r = u * 3.4;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(247, 181, 0, ${0.62 * k})`);
      g.addColorStop(1, "rgba(247, 181, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  // the sky inside the frame, painted as in Madhubani: a moon with stars, then a sun with a face
  function sky(ctx: CanvasRenderingContext2D, now: number) {
    const [w, h] = iso.size;
    // top right, beside the zoom buttons, where the diorama's corner leaves sky
    const x = w - (w < 700 ? 112 : 142);
    const y = Math.min(64, h * 0.12);
    const still = reducedMotion();
    if (story.night > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, story.night * 1.3);
      for (const [sx, sy, r, ph] of [
        [-120, 4, 5, 0],
        [-70, 34, 3.5, 1.7],
        [70, -6, 4.5, 3.1],
        [130, 30, 3.5, 4.4],
        [-170, 40, 3, 2.2],
        [180, 2, 3, 5.2],
      ]) {
        const tw = still ? 1 : 0.75 + 0.25 * Math.sin(now / 520 + ph);
        star(ctx, x + sx, y + sy, r * tw);
      }
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0.35 * Math.PI, 1.65 * Math.PI, false);
      ctx.bezierCurveTo(-1, -15, -2, 15, 21 * Math.cos(0.35 * Math.PI), 21 * Math.sin(0.35 * Math.PI));
      ctx.closePath();
      ctx.fillStyle = C.haldiTint;
      ctx.strokeStyle = C.neel;
      ctx.lineWidth = 2.4;
      ctx.fill();
      ctx.stroke();
      // the moon's eye and smile, as the painters draw it
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.quadraticCurveTo(-10, -9, -6, -6);
      ctx.moveTo(-14, 6);
      ctx.quadraticCurveTo(-10, 10, -6, 7);
      ctx.stroke();
      ctx.restore();
    }
    if (story.sun > 0) {
      const k = eio(story.sun);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(x, y + (1 - k) * 46);
      const spin = still ? 0 : now / 6000;
      for (let i = 0; i < 12; i++) {
        const a = spin + (i * Math.PI) / 6;
        ctx.save();
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-6, -24);
        ctx.lineTo(0, -38);
        ctx.lineTo(6, -24);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? C.sindoor : C.kesar;
        ctx.strokeStyle = C.neel;
        ctx.lineWidth = 1.8;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.fillStyle = C.haldi;
      ctx.strokeStyle = C.neel;
      ctx.lineWidth = 2.6;
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-11, -4);
      ctx.quadraticCurveTo(-7, -9, -3, -4);
      ctx.moveTo(3, -4);
      ctx.quadraticCurveTo(7, -9, 11, -4);
      ctx.moveTo(-8, 7);
      ctx.quadraticCurveTo(0, 13, 8, 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rr = i % 2 ? r * 0.38 : r * 1.6;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = C.haldi;
    ctx.fill();
  }

  canvas.addEventListener("pointerdown", () => {
    // the person takes the camera; the next moment of the story takes it back
    if (story.on) {
      story.follow = null;
      story.zoomTo = 0;
    }
  });
  $(".lm-night", host).addEventListener("click", storyStart);
  $(".lm-story-x", host).addEventListener("click", () => storyStop());
  $(".lm-story-close", host).addEventListener("click", () => storyStop());
  $(".lm-story-again", host).addEventListener("click", storyStart);
  document.addEventListener("bp:map-night", storyStart);
  if (document.documentElement.dataset.mapNight) queueMicrotask(storyStart);

  const fullBtn = $<HTMLButtonElement>(".lm-full-btn", host);
  const setFull = (on: boolean) => {
    S.full = on;
    host.classList.toggle("full", on);
    fullBtn.setAttribute("aria-pressed", String(on));
    fullBtn.innerHTML = on ? icon("close") : FULL_ICON;
    fullBtn.setAttribute("aria-label", on ? L("पूरी स्क्रीन बंद करें", "Exit full screen") : L("पूरी स्क्रीन", "Full screen"));
    document.documentElement.style.overflow = on ? "hidden" : "";
    requestAnimationFrame(() => {
      measureHud();
      if (iso.resize()) paint(false);
      updateScale();
      renderCard();
      need();
    });
  };
  fullBtn.addEventListener("click", () => setFull(!S.full));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && story.on) storyStop();
    else if (e.key === "Escape" && S.full) setFull(false);
  });

  document.addEventListener("bp:lang", () => {
    updateWhatIf();
    renderSide();
    renderCard();
    tickTexts();
    updateScale();
    need();
  });

  // ---------------- start ----------------
  new ResizeObserver(() => {
    measureHud();
    if (iso.resize()) {
      paint(false);
      updateScale();
      // a resized canvas is blank until drawn, so draw now rather than on the next frame
      drawOverlay(iso.blit(), performance.now());
      need();
    }
  }).observe(stage);
  iso.resize();
  measureHud();
  // phones start close to Haijalpur; wide screens see the whole stretch
  if (iso.size[0] < 700 && haijalpur) {
    iso.zoom = 2.1;
    paint(false);
    iso.centreOn((haijalpur.cell % m.C) + 0.5, Math.floor(haijalpur.cell / m.C) + 2.5);
  } else {
    iso.zoom = 1.12;
    paint(false);
    if (haijalpur) iso.centreOn((haijalpur.cell % m.C) + 4, Math.floor(haijalpur.cell / m.C) + 1);
  }
  paint(false);
  updateWhatIf();
  updateScale();
  renderSide();
  tickTexts();
  watchVisible(host, (v) => {
    visible = v;
    if (v) {
      lastT = performance.now();
      need();
    }
  });
  document.fonts?.ready.then(() => need());
}

// ---------------- helpers ----------------

/** Our assumed embankment crest, as a reading at the gauge: where the first bank cell overtops. */
function crestReading(m: Model): number {
  let lo = Infinity;
  for (let i = 0; i < m.N; i++) if (m.emb[i] === 1) lo = Math.min(lo, m.ground[i] + CREST_M - m.slope * (m.along[i] - m.gaugeAlong));
  return Number.isFinite(lo) ? Math.min(58.4, lo) : 57.8;
}

function remaining(pts: Pt[], acc: number[], k: number): Pt[] {
  const s = acc[acc.length - 1] * k;
  for (let i = 1; i < pts.length; i++) {
    if (s <= acc[i]) {
      const u = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
      const p: Pt = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u];
      return [p, ...pts.slice(i)];
    }
  }
  return [pts[pts.length - 1]];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The painting's frame: two ink lines with a hatched band between, as in Madhubani borders. */
function frameBorder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const b = 12;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(b, b, w - 2 * b, h - 2 * b);
  ctx.fillStyle = C.haldiTint;
  ctx.fill("evenodd");
  ctx.clip("evenodd");
  ctx.strokeStyle = C.kesar;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  for (let s = -h; s < w + h; s += 9) {
    ctx.moveTo(s, 0);
    ctx.lineTo(s + h, h);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = C.neel;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(1.25, 1.25, w - 2.5, h - 2.5);
  ctx.strokeRect(b - 1.25, b - 1.25, w - 2 * b + 2.5, h - 2 * b + 2.5);
}

const clockHiEn = (iso: string) => `${clockHi(iso)} (${clockEn(iso)})`;
const MON_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function s2DateHi(m: Model): string {
  const d = m.s2?.date;
  return d ? `${Number(d.slice(8, 10))} ${MON_HI[Number(d.slice(5, 7)) - 1]}` : "-";
}
function s2DateEn(m: Model): string {
  const d = m.s2?.date;
  return d ? `${Number(d.slice(8, 10))} ${MON_EN[Number(d.slice(5, 7)) - 1]}` : "-";
}

const COMPASS = `<svg viewBox="-23 -23 46 46"><circle r="20" fill="${C.white}" stroke="${C.neel}" stroke-width="2.5"/><g class="needle"><path d="M0-16L5 0H-5z" fill="${C.sindoor}" stroke="${C.neel}" stroke-width="1.5" stroke-linejoin="round"/><path d="M0 16L5 0H-5z" fill="${C.white}" stroke="${C.neel}" stroke-width="1.5" stroke-linejoin="round"/><circle r="2.4" fill="${C.neel}"/></g></svg>`;
const svgIc = (d: string) => `<svg class="ic" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${d}</svg>`;
const INK = `stroke="${C.neel}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const PLUS_ICON = svgIc(`<path d="M20 9v22M9 20h22" ${INK}/>`);
const MINUS_ICON = svgIc(`<path d="M9 20h22" ${INK}/>`);
const ROT_ICON = svgIc(`<path d="M30 14a12 12 0 1 0 2 11" ${INK}/><path d="M31 6v9h-9" ${INK}/>`);
const FULL_ICON = svgIc(`<path d="M8 15V8h7M25 8h7v7M32 25v7h-7M15 32H8v-7" ${INK}/>`);
const BREACH_ICON = svgIc(`<path d="M4 26h11l3-6 3 9 3-7 2 4h10" ${INK}/><path d="M8 26l-2 6M32 26l2 6" ${INK}/>`);
const HELP_ICON = svgIc(`<path d="M20 34s11-10 11-18a11 11 0 0 0-22 0c0 8 11 18 11 18z" fill="${C.sindoor}" stroke="${C.chuna}" stroke-width="2.6"/><path d="M20 10v8M20 22v.5" stroke="${C.chuna}" stroke-width="3.4" stroke-linecap="round"/>`);
const STAFF_ICON = `<svg viewBox="0 0 20 40" aria-hidden="true"><rect x="6" y="3" width="8" height="34" fill="${C.white}" stroke="${C.neel}" stroke-width="2"/><rect x="6" y="12" width="8" height="5" fill="${C.sindoor}"/><path d="M6 8h5M6 22h5M6 27h3M6 32h5" stroke="${C.neel}" stroke-width="1.6"/><path d="M1 30q4.5-3 9 0t9 0" fill="none" stroke="${C.gandak}" stroke-width="2.4"/></svg>`;

