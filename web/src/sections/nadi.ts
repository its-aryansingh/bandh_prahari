// "Nadi ka haal": type a village, the replies stage in (kit effect 02, search to results),
// and the village's name fills with water to today's level against the danger mark
// (kit effect 09, masked type). The reply text mirrors the WhatsApp reply in SPEC flow 0.
import type { Gauges, Reading, Stretch, Village } from "../types";
import { logoMark } from "../art/ghadi";
import { icon } from "../art/icons";
import { C } from "../art/palette";
import { LEVELS, HELPLINES } from "../content";
import { $, bi, bil, clockEn, clockHi, dateEn, dateHi, esc, h } from "../lib/dom";
import { clamp, eo, reducedMotion, tween } from "../lib/motion";
import { initRiver } from "./river";

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/[\s.,\-'"()]/g, "");

function lev(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export function findVillage(q: string, villages: Village[]): Village | undefined {
  const k = norm(q);
  if (!k) return undefined;
  return (
    villages.find((v) => norm(v.name) === k || norm(v.name_hi) === k) ??
    villages.find((v) => norm(v.name).startsWith(k) || norm(v.name_hi).startsWith(k)) ??
    villages.find((v) => lev(norm(v.name), k) <= 2)
  );
}

const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  return Seg ? Array.from(new Seg("hi", { granularity: "grapheme" }).segment(s), (x) => x.segment) : Array.from(s);
};

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(s: string, font: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * 40;
  measureCtx.font = font;
  return measureCtx.measureText(s).width;
}

/** The village name as a gauge: water rises inside the letters to today's level. */
function maskedName(name: string, frac: number, dangerFrac: number, id: string): { svg: string; target: number } {
  const size = 72;
  const w = Math.max(240, textWidth(name, `400 ${size}px "Yatra One"`) + 36);
  const H = 128;
  const baseY = 88;
  const top = 26;
  const bottom = 100;
  const lvl = bottom - frac * (bottom - top);
  const dy = bottom - dangerFrac * (bottom - top);
  const svg = `<svg class="masked" viewBox="0 0 ${w.toFixed(0)} ${H}" role="img" aria-label="${esc(name)}">
    <defs><clipPath id="${id}-t"><text x="18" y="${baseY}" font-family="Yatra One" font-size="${size}">${esc(name)}</text></clipPath></defs>
    <g clip-path="url(#${id}-t)">
      <rect x="0" y="0" width="${w}" height="${H}" fill="${C.white}"/>
      <g class="water" transform="translate(0 ${bottom + 6})">
        <rect x="0" y="0" width="${w}" height="${H}" fill="${C.gandak}"/>
        <path class="crest" d="" fill="${C.gandakTint}" opacity=".9"/>
      </g>
    </g>
    <text x="18" y="${baseY}" font-family="Yatra One" font-size="${size}" fill="none" stroke="${C.neel}" stroke-width="1.6">${esc(name)}</text>
    <path d="M4 ${dy}H${w - 4}" stroke="${C.sindoor}" stroke-width="2.4" stroke-dasharray="8 6"/>
    <text x="${w - 6}" y="${dy - 6}" text-anchor="end" class="svg-label" font-size="13" fill="${C.sindoor}"><tspan class="hi">ख़तरे का निशान</tspan><tspan class="en">Danger level</tspan></text>
  </svg>`;
  return { svg, target: lvl };
}

const TREND_HI: Record<string, string> = { rising: "बढ़ रहा है", falling: "घट रहा है", steady: "स्थिर है" };
const TREND_EN: Record<string, string> = { rising: "rising", falling: "falling", steady: "steady" };

function speakText(v: Village, r: Reading): string {
  const diff = r.wl_m - r.dl_m;
  const cm = Math.round(Math.abs(diff) * 100);
  const where = diff >= 0 ? `ख़तरे के निशान से ${cm} सेंटीमीटर ऊपर` : `ख़तरे के निशान से ${cm} सेंटीमीटर नीचे`;
  return `${v.name_hi} के पास, ${r.site_hi} पर गंडक ${r.wl_m.toFixed(2)} मीटर पर है। यह ${where} है, और पानी ${TREND_HI[r.trend]}। यह छात्र परियोजना है, सरकारी चेतावनी नहीं। आपात स्थिति में 1070 पर फ़ोन करें।`;
}

export function initNadi(stretch: Stretch, gauges: Gauges): void {
  $("#nadi-avatar").innerHTML = logoMark();
  const thread = $("#nadi-thread");
  const input = $<HTMLInputElement>("#nadi-input");
  const form = $<HTMLFormElement>("#nadi-form");
  const chips = $("#nadi-chips");
  chips.innerHTML = stretch.villages
    .map((v) => `<button type="button" class="chip" data-v="${esc(v.name)}">${bil(v.name_hi, v.name)}</button>`)
    .join("");

  let busy = false;
  let n = 0;
  const scroll = () => thread.scrollTo({ top: thread.scrollHeight, behavior: reducedMotion() ? "auto" : "smooth" });
  const add = (el: HTMLElement, delay = 0) =>
    new Promise<void>((res) =>
      setTimeout(() => {
        el.classList.add("stage-in");
        thread.append(el);
        scroll();
        res();
      }, reducedMotion() ? 0 : delay),
    );

  async function answer(q: string) {
    if (busy || !q.trim()) return;
    busy = true;
    const id = `mt${++n}`;
    await add(h(`<div class="bubble-out"><span>${esc(q)}</span><span class="meta">✓✓</span></div>`));
    const typing = h(`<div class="bubble-in typing" aria-label="लिख रहा है / typing"><i></i><i></i><i></i></div>`);
    await add(typing, 220);
    await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 750));
    typing.remove();

    const v = findVillage(q, stretch.villages);
    if (!v) {
      await add(
        h(`<div class="bubble-in"><span class="pair">${bi(
          "यह नाम अभी सूची में नहीं है। आस-पास के गाँव या प्रखंड का नाम लिखिए, या नीचे से चुनिए।",
          "That name isn't on the list yet. Try a nearby village or block, or pick one below.",
        )}</span></div>`),
      );
      busy = false;
      return;
    }
    const r = gauges.readings.find((x) => x.site === v.gauge);
    if (!r) {
      busy = false;
      return;
    }
    const diff = r.wl_m - r.dl_m;
    const above = diff >= 0;
    const cm = Math.round(Math.abs(diff) * 100);
    const frac = clamp((r.wl_m - (r.dl_m - 2)) / 3);
    const m = maskedName(v.name_hi, frac, 2 / 3, id);
    const src_hi = r.source.startsWith("CWC") ? "CWC, SACHET पर" : "FMISC, जल संसाधन विभाग";
    const card = h(`<div class="bubble-in reading">
      ${m.svg}
      <dl>
        <dt>${bil("नदी", "River")}</dt><dd>${bil(`गंडक, ${r.site_hi} गेज`, `Gandak, ${r.site} gauge`)}</dd>
        <dt>${bil("पानी", "Level")}</dt><dd>${r.wl_m.toFixed(2)} मी.</dd>
        <dt>${bil("ख़तरा", "Danger")}</dt><dd>${r.dl_m.toFixed(2)} मी., <span class="${above ? "over" : "under"}">${bil(above ? `${cm} से.मी. ऊपर` : `${cm} से.मी. नीचे`, above ? `${cm} cm above` : `${cm} cm below`)}</span></dd>
        <dt>${bil("रुझान", "Trend")}</dt><dd>${bil(TREND_HI[r.trend], TREND_EN[r.trend])}</dd>
      </dl>
      <span class="meta">${bil(`${src_hi}, ${dateHi(r.time)} ${clockHi(r.time)}`, `${r.source}, ${dateEn(r.time)} ${clockEn(r.time)}`)}
      ${r.sample ? ` <span class="stamp neel" style="--tilt:-3deg">${bil("नमूना", "sample")}</span>` : ""}</span>
    </div>`);
    await add(card, 0);
    // the water rises inside the letters
    const water = card.querySelector<SVGGElement>(".water")!;
    const crest = card.querySelector<SVGPathElement>(".crest")!;
    const W = Number(card.querySelector("svg")!.getAttribute("viewBox")!.split(" ")[2]);
    const start = 106;
    let ph = 0;
    const setLevel = (yy: number) => {
      water.setAttribute("transform", `translate(0 ${yy.toFixed(2)})`);
      let d = `M0 0`;
      for (let x = -20 + (ph % 20); x < W + 20; x += 20) d += `Q${(x + 5).toFixed(1)} -4 ${(x + 10).toFixed(1)} 0T${(x + 20).toFixed(1)} 0`;
      crest.setAttribute("d", d + `V6H0z`);
    };
    if (reducedMotion()) setLevel(m.target);
    else
      tween(1600, (k) => {
        ph = k * 60;
        setLevel(start + (m.target - start) * eo(k));
      });

    const voice = h(`<div class="bubble-in"><div class="voice">
        <button type="button" aria-label="${esc("सुनें / Listen")}">${icon("play")}</button>
        <span class="wave">${[10, 18, 12, 24, 16, 20, 9, 14, 22, 12, 8, 16, 11].map((x) => `<i style="height:${x}px"></i>`).join("")}</span>
        <span class="tiny dim">0:14</span>
      </div><span class="meta">${bil("हिंदी आवाज़ (Polly, Kajal)", "Hindi voice note (Polly, Kajal)")}</span></div>`);
    wireVoice(voice, speakText(v, r));
    await add(voice, 420);

    if (above) {
      const lv = LEVELS[0];
      const steps = h(`<div class="bubble-in" data-level="saavdhan">
        <span class="lvl">${bil(lv.hi, lv.en)}</span>
        <span class="pair small">${bi("नदी ख़तरे के निशान से ऊपर है। ये चार काम आज कर लीजिए:", "The river is above danger level. Do these four things today:")}</span>
        <ul class="steps-mini">${lv.steps.map((s) => `<li>${icon(s.icon)}<span class="pair">${bi(s.hi, s.en)}</span></li>`).join("")}</ul>
        <div class="btn-row"><button type="button" class="done-btn" aria-pressed="false">${icon("check")}${bil("हो गया", "Done")}</button></div>
      </div>`);
      wireDone(steps);
      await add(steps, 520);
    } else {
      const ok = h(`<div class="bubble-in">
        <span class="pair">${bi("आज ख़तरे की बात नहीं। ख़तरा हुआ तो हम आपको बताएँ?", "No danger today. Shall we tell you if there is?")}</span>
        <div class="btn-row"><button type="button" class="done-btn sub">${bil("ख़तरा हो तो बताएँ", "Tell me if there's danger")}</button></div>
      </div>`);
      ok.querySelector<HTMLButtonElement>(".sub")!.addEventListener(
        "click",
        async (e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.setAttribute("aria-pressed", "true");
          b.disabled = true;
          await add(h(`<div class="bubble-out"><span class="pair">${bi("ख़तरा हो तो बताएँ", "Tell me if there's danger")}</span><span class="meta">✓✓</span></div>`));
          await add(
            h(`<div class="bubble-in"><span class="pair">${bi(
              `ठीक है। ${v.name_hi} के लिए ख़तरे की ख़बर आपको मिलेगी। आपका नंबर सिर्फ़ इस मौसम की बाढ़ चेतावनी के लिए इस्तेमाल होगा। बंद करने के लिए "बंद" लिखें।`,
              `Done. You'll hear about danger for ${v.name}. Your number is used only for flood warnings this season. Send "stop" to end it.`,
            )}</span><span class="meta">${bil("डेमो: यहाँ कोई नंबर दर्ज नहीं होता", "Demo: no number is stored here")}</span></div>`),
            500,
          );
        },
        { once: true },
      );
      await add(ok, 520);
    }
    await add(
      h(`<div class="bubble-in footer-note"><span class="pair">${bi(
        `यह छात्र परियोजना है, सरकारी चेतावनी नहीं। आपात स्थिति में ${HELPLINES.state} या ${HELPLINES.wrd} पर फ़ोन करें।`,
        `A student project, not an official warning. In an emergency call ${HELPLINES.state} or ${HELPLINES.wrd}.`,
      )}</span></div>`),
      380,
    );
    busy = false;
  }

  // Tapping a village types it into the box, then sends it.
  chips.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-v]");
    if (!b || busy) return;
    const v = stretch.villages.find((x) => x.name === b.dataset.v)!;
    const showHindi = document.documentElement.dataset.lang !== "en";
    const text = showHindi ? v.name_hi : v.name;
    input.value = "";
    input.focus({ preventScroll: true });
    if (!reducedMotion()) {
      for (const g of graphemes(text)) {
        input.value += g;
        await new Promise((r) => setTimeout(r, 70));
      }
      await new Promise((r) => setTimeout(r, 180));
    } else input.value = text;
    form.requestSubmit();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value;
    input.value = "";
    answer(q);
  });
  // The hero's "Ask about the river" lands with the cursor in the box.
  $("#ask-river").addEventListener("click", () => setTimeout(() => input.focus({ preventScroll: true }), 650));

  initRiver(gauges);
}

function wireDone(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>(".done-btn").forEach((b) =>
    b.addEventListener("click", () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"))),
  );
}

function wireVoice(root: HTMLElement, text: string) {
  const btn = root.querySelector("button")!;
  const box = root.querySelector(".voice")!;
  btn.addEventListener("click", () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (synth.speaking) {
      synth.cancel();
      box.classList.remove("playing");
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    const hindi = synth.getVoices().find((x) => x.lang.toLowerCase().startsWith("hi"));
    if (hindi) u.voice = hindi;
    u.rate = 0.95;
    u.onend = () => box.classList.remove("playing");
    box.classList.add("playing");
    synth.speak(u);
    if (!hindi) {
      root.append(
        h(`<span class="meta">${bil("इस ब्राउज़र में हिंदी आवाज़ नहीं मिली। WhatsApp पर Polly की हिंदी आवाज़ आती है।", "This browser has no Hindi voice. On WhatsApp the voice note comes from Polly.")}</span>`),
      );
    }
  });
}
