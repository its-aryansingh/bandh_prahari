// The embankment, drawn as a cartoon cross-section: river, bank, kilometre stone,
// the patrol worker, the boil, and the village behind. One drawing for the day (hero)
// and one for the night (the replay). Parts that move carry ids; sections update them.
import { C } from "./palette";
import { iconBody } from "./icons";
import { face } from "./people";

const S = (w = 2.5) => `stroke="${C.neel}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const f = (n: number) => n.toFixed(1);

export function rr(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Madhubani-style frame: two ink lines with a hatched band between. */
function frame(id: string, w: number, h: number, hatch: string, band: string): { defs: string; under: string; over: string; clip: string } {
  const o = rr(4, 4, w - 8, h - 8, 24);
  const i = rr(16, 16, w - 32, h - 32, 14);
  return {
    defs: `<pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="${band}"/><rect width="2.6" height="7" fill="${hatch}"/></pattern>
      <clipPath id="${id}-clip"><path d="${i}"/></clipPath>`,
    under: "",
    over: `<path d="${o} ${i}" fill="url(#${id}-hatch)" fill-rule="evenodd"/>
      <path d="${o}" fill="none" ${S(3)}/><path d="${i}" fill="none" ${S(2)}/>`,
    clip: `url(#${id}-clip)`,
  };
}

/** A Madhubani sun with a face. */
export function sun(cx: number, cy: number, r: number, id = ""): string {
  let rays = "";
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const a1 = a - 0.13;
    const a2 = a + 0.13;
    const r0 = r + 3;
    const r1 = r + (k % 2 ? 11 : 17);
    rays += `<path d="M${f(cx + r0 * Math.cos(a1))} ${f(cy + r0 * Math.sin(a1))}L${f(cx + r1 * Math.cos(a))} ${f(cy + r1 * Math.sin(a))}L${f(cx + r0 * Math.cos(a2))} ${f(cy + r0 * Math.sin(a2))}Z" fill="${k % 2 ? C.haldi : C.kesar}" ${S(1.6)}/>`;
  }
  const e = r * 0.36;
  return `<g ${id ? `id="${id}"` : ""} class="sun">${rays}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.haldi}" ${S()}/>
    <path d="M${f(cx - e - 7)} ${f(cy - 4)}q7-6.5 14 0q-7 5.5-14 0z" fill="${C.white}" ${S(1.5)}/>
    <path d="M${f(cx + e - 7)} ${f(cy - 4)}q7-6.5 14 0q-7 5.5-14 0z" fill="${C.white}" ${S(1.5)}/>
    <circle cx="${f(cx - e)}" cy="${f(cy - 4)}" r="2.3" fill="${C.neel}"/><circle cx="${f(cx + e)}" cy="${f(cy - 4)}" r="2.3" fill="${C.neel}"/>
    <path d="M${f(cx - e - 7)} ${f(cy - 11)}q7-4 14 0M${f(cx + e - 7)} ${f(cy - 11)}q7-4 14 0" fill="none" ${S(1.5)}/>
    <path d="M${f(cx)} ${f(cy - 3)}v9q0 3-3.5 3" fill="none" ${S(1.5)}/>
    <path d="M${f(cx - 7)} ${f(cy + 13)}q7 5.5 14 0q-7-2-14 0z" fill="${C.sindoor}" ${S(1.3)}/>
    <circle cx="${f(cx - r * 0.62)}" cy="${f(cy + 7)}" r="3" fill="${C.kesar}" opacity=".8"/><circle cx="${f(cx + r * 0.62)}" cy="${f(cy + 7)}" r="3" fill="${C.kesar}" opacity=".8"/>
  </g>`;
}

/** A Madhubani crescent moon with a sleepy face. */
function moon(cx: number, cy: number, r: number, id: string): string {
  return `<g id="${id}">
    <path d="M${cx + r * 0.2} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.8} ${r * 1.72}a${r * 0.82} ${r * 0.82} 0 1 1 -${r * 0.8} -${r * 1.72}z" fill="${C.haldiTint}" ${S()}/>
    <path d="M${cx - r * 0.42} ${cy - 3}q4 3 8 0" fill="none" ${S(1.6)}/>
    <path d="M${cx - r * 0.5} ${cy + r * 0.38}q5 3.4 10 .6" fill="none" ${S(1.6)}/>
    <circle cx="${cx - r * 0.56}" cy="${cy + 6}" r="2.6" fill="${C.kesar}" opacity=".7"/>
  </g>`;
}

function cloud(x: number, y: number, s: number, fill: string): string {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0 42a18 18 0 0 1 14-28a24 24 0 0 1 44-6a18 18 0 0 1 30 14a14 14 0 0 1-4 20z" fill="${fill}" ${S(2.5 / s)}/>`;
}

function tuft(x: number, y: number, col = C.dhaan): string {
  return `<path d="M${x} ${y}l2.4-7 2.4 7 2.4-9.5 2.4 9.5 2.4-6 2.4 6" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** The village-road kilometre stone: white with an orange cap. */
export function milestone(x: number, ground: number, km: number, id = ""): string {
  return `<g ${id ? `id="${id}"` : ""}>
    <path d="M${x - 11} ${ground}v-22a11 11 0 0 1 22 0v22z" fill="${C.white}" ${S(2)}/>
    <path d="M${x - 11} ${ground - 23}a11 11 0 0 1 22 0z" fill="${C.kesar}" ${S(2)}/>
    <text x="${x}" y="${ground - 5}" text-anchor="middle" class="svg-num" font-size="12" fill="${C.neel}">${km}</text>
  </g>`;
}

function gaugeStaff(x: number, top: number, bottom: number, danger: number): string {
  let ticks = "";
  for (let y = top + 8; y < bottom; y += 10) {
    const long = Math.round((y - top - 8) / 10) % 5 === 0;
    ticks += `<path d="M${x} ${y}h${long ? 9 : 5}" stroke="${C.neel}" stroke-width="1.4"/>`;
  }
  return `<g class="staff">
    <path d="M${x} ${bottom}V${top + 6}l6-6 6 6V${bottom}z" fill="${C.white}" ${S(2)}/>
    ${ticks}
    <rect x="${x - 3}" y="${danger - 3}" width="18" height="6" rx="1" fill="${C.sindoor}" ${S(1.2)}/>
    <path d="${rr(x - 62, danger - 11, 54, 22, 6)}" fill="${C.white}" ${S(1.8)}/>
    <path d="M${x - 8} ${danger}h5" ${S(1.8)}/>
    <text x="${x - 35}" y="${danger + 5}" text-anchor="middle" class="svg-label" font-size="13" fill="${C.sindoor}"><tspan class="hi">ख़तरा</tspan><tspan class="en">Danger</tspan></text>
  </g>`;
}

function fish(x: number, y: number, flip: boolean): string {
  return `<g transform="translate(${x} ${y}) scale(${flip ? -1 : 1} 1)">
    <path d="M0 0q15-11 30 0q-15 11-30 0z" fill="${C.haldi}" ${S(1.8)}/>
    <path d="M30 0l9-7v14z" fill="${C.kesar}" ${S(1.8)}/>
    <path d="M10 -3.4q3 3.4 0 6.8M16 -4q3 4 0 8M22 -3.4q3 3.4 0 6.8" fill="none" stroke="${C.kesarDeep}" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="6" cy="-1" r="1.8" fill="${C.neel}"/>
  </g>`;
}

/** The patrol worker. pose: "phone" (hero) or "torch" (night). */
function prahari(x: number, foot: number, pose: "phone" | "torch", id: string): string {
  const y = foot;
  const torchArm =
    pose === "torch"
      ? `<path d="M${x + 13} ${y - 50}l13 8" stroke="${C.neel}" stroke-width="8.5" stroke-linecap="round"/><path d="M${x + 13} ${y - 50}l13 8" stroke="${C.skin}" stroke-width="5" stroke-linecap="round"/>
         <g id="${id}-torch"><rect x="${x + 22}" y="${y - 47}" width="14" height="7" rx="2" transform="rotate(32 ${x + 22} ${y - 47})" fill="${C.haldi}" ${S(1.8)}/></g>`
      : `<path d="M${x + 13} ${y - 50}q10-2 13-20" fill="none" stroke="${C.neel}" stroke-width="8.5" stroke-linecap="round"/><path d="M${x + 13} ${y - 50}q10-2 13-20" fill="none" stroke="${C.skin}" stroke-width="5" stroke-linecap="round"/>
         <g id="${id}-phone"><rect x="${x + 20}" y="${y - 88}" width="12" height="20" rx="2.5" fill="${C.neel}"/><rect id="${id}-screen" x="${x + 22}" y="${y - 85.5}" width="8" height="14" rx="1" fill="${C.kesar}"/></g>`;
  return `<g id="${id}">
    <path d="M${x - 22} ${y - 64}l6 64" stroke="${C.neel}" stroke-width="6.5" stroke-linecap="round"/><path d="M${x - 22} ${y - 64}l6 64" stroke="${C.mittiDeep}" stroke-width="3.4" stroke-linecap="round"/>
    <rect x="${x - 10}" y="${y - 30}" width="9" height="28" rx="3" fill="${C.white}" ${S(2)}/>
    <rect x="${x + 1}" y="${y - 30}" width="9" height="28" rx="3" fill="${C.white}" ${S(2)}/>
    <ellipse cx="${x - 6}" cy="${y - 1}" rx="6" ry="2.6" fill="${C.neel}"/><ellipse cx="${x + 6}" cy="${y - 1}" rx="6" ry="2.6" fill="${C.neel}"/>
    <path d="M${x - 15} ${y - 56}q15-6 30 0l4 30q-19 6-38 0z" fill="${C.kesarTint}" ${S(2)}/>
    <path d="M${x - 15} ${y - 56}l8-2-4 30h-8z" fill="${C.sindoor}" ${S(1.6)}/>
    <path d="M${x - 13} ${y - 50}l6 1M${x - 14} ${y - 42}l6 1M${x - 15} ${y - 34}l6 1" stroke="${C.white}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M${x - 14} ${y - 52}l-8 18" stroke="${C.neel}" stroke-width="8.5" stroke-linecap="round"/><path d="M${x - 14} ${y - 52}l-8 18" stroke="${C.skin}" stroke-width="5" stroke-linecap="round"/>
    ${torchArm}
    <circle cx="${x}" cy="${y - 70}" r="13" fill="${C.skin}" ${S(2)}/>
    <path d="M${x - 13} ${y - 72}c-.4-8 5-14 13.4-14 8.2 0 13 5.6 12.6 13.6-7.6-3.6-17.6-3.6-26 .4z" fill="${C.sindoor}" ${S(2)}/>
    <path d="M${x - 8} ${y - 82}l3 7M${x + 1} ${y - 85}l1.6 8M${x + 8} ${y - 82}l-.6 7" stroke="${C.white}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="${x - 4.6}" cy="${y - 69}" r="1.6" fill="${C.neel}"/><circle cx="${x + 4.6}" cy="${y - 69}" r="1.6" fill="${C.neel}"/>
    <path d="M${x - 6} ${y - 63}q6 3.4 12 0q-6-1.4-12 0z" fill="${C.neel}"/>
  </g>`;
}

/** The sand boil: a cone of sand with muddy water spouting from it, ringed for attention. */
function boil(x: number, ground: number, id: string): string {
  return `<g id="${id}">
    <ellipse id="${id}-ripple" cx="${x}" cy="${ground - 1}" rx="34" ry="7" fill="none" stroke="${C.gandak}" stroke-width="2.2" opacity="0"/>
    <path d="M${x - 26} ${ground}q26-17 52 0z" fill="${C.mittiTint}" ${S(2.2)}/>
    <g id="${id}-spout" transform="translate(${x} ${ground - 8}) scale(1 0)">
      <path d="M-9 0C-10.5-12-6-24-2-33c1.2-3 3-3 4.2 0C6-24 10.5-12 9 0z" fill="${C.boil}" ${S(2)}/>
      <path d="M-3.5-6c-.6-6 .4-12 2-17" fill="none" stroke="${C.gandakTint}" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    </g>
    <circle id="${id}-d1" cx="${x}" cy="${ground}" r="3.2" fill="${C.boil}" ${S(1.2)} opacity="0"/>
    <circle id="${id}-d2" cx="${x}" cy="${ground}" r="2.6" fill="${C.boil}" ${S(1.2)} opacity="0"/>
    <circle id="${id}-d3" cx="${x}" cy="${ground}" r="2.9" fill="${C.boil}" ${S(1.2)} opacity="0"/>
    <ellipse id="${id}-ring" cx="${x}" cy="${ground - 14}" rx="40" ry="30" fill="none" stroke="${C.sindoor}" stroke-width="2.6" stroke-dasharray="7 6" opacity="0" style="transform-origin:${x}px ${ground - 14}px"/>
  </g>`;
}

/** A village loudspeaker (bhonpu) on a bamboo pole, horn facing left. */
function loudspeaker(x: number, base: number, top: number, id: string): string {
  return `<g id="${id}">
    <path d="M${x} ${base}V${top}" ${S(2.5)}/>
    <rect x="${x - 2}" y="${top - 7}" width="7" height="13" rx="2" fill="${C.neel2}" ${S(1.8)}/>
    <path d="M${x - 2} ${top - 4}l-20-9v26l20-9z" fill="${C.haldi}" ${S(2.2)}/>
    <g id="${id}-waves" fill="none" stroke="${C.kesar}" stroke-width="2.6" stroke-linecap="round" opacity="0">
      <path d="M${x - 29} ${top - 8}q-5 8 0 16"/><path d="M${x - 37} ${top - 14}q-9 14 0 28"/>
    </g>
  </g>`;
}

function nest(name: string, x: number, y: number, size: number, extra = ""): string {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 40 40" overflow="visible" ${extra}>${iconBody(name)}</svg>`;
}

function hut(x: number, ground: number, w: number, id: string): string {
  const h = 42;
  const top = ground - h;
  const rx0 = x - 10;
  const rx1 = x + w + 10;
  const peak = x + w / 2;
  let tiles = "";
  for (let yy = top - 22; yy < top + 2; yy += 8) {
    const t = (yy - (top - 30)) / 32;
    const xa = peak - (peak - rx0) * t;
    const xb = peak + (rx1 - peak) * t;
    tiles += `<path d="M${f(xa + 4)} ${f(yy)}${Array.from({ length: Math.max(1, Math.floor((xb - xa - 8) / 9)) }, () => "q2.25 2.6 4.5 0q2.25 2.6 4.5 0").join("")}" fill="none" stroke="${C.kesarTint}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return `<g id="${id}">
    <rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${C.mittiTint}" ${S(2.2)}/>
    <path d="M${x + w * 0.22} ${ground}v-20a6 6 0 0 1 12 0v20z" fill="${C.neel}"/>
    <rect id="${id}-win" x="${x + w * 0.6}" y="${top + 12}" width="${w * 0.24}" height="13" rx="1.5" fill="${C.neel}" ${S(1.8)}/>
    <path d="M${rx0} ${top + 2}L${peak} ${top - 30}L${rx1} ${top + 2}z" fill="${C.kesarDeep}" ${S(2.2)}/>
    ${tiles}
  </g>`;
}

/** Hero: daytime, the moment the boil is seen. 720 x 480. Ground at 400, bank top at 278. */
export const HERO = { ground: 400, top: 278, rest: 294, danger: 300 };

export function heroScene(): string {
  const W = 720;
  const H = 480;
  const G = HERO.ground;
  const T = HERO.top;
  const fr = frame("hs", W, H, C.kesar, C.chuna);
  let rain = "";
  for (let i = 0; i < 6; i++) rain += `<path class="rain" d="M${112 + i * 16} ${104 + (i % 2) * 6}l-5 13" stroke="${C.gandak}" stroke-width="2.6" stroke-linecap="round"/>`;
  const dashes = [
    [236, 368], [266, 338], [304, 316], [342, 344], [382, 308], [414, 364], [442, 384], [294, 380], [358, 384],
  ]
    .map(([x, y]) => `<path d="M${x} ${y}l9-2" stroke="${C.mittiDeep}" stroke-width="2.2" stroke-linecap="round"/>`)
    .join("");
  return `<svg class="scene" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="hs-title">
    <title id="hs-title">Cartoon cross-section of the Gandak embankment at kilometre 14: the river high on the left, a patrol worker on top with his phone, muddy water boiling out at the foot on the village side, and a cow, a grain platform and a hut behind.</title>
    <defs>${fr.defs}</defs>
    <g clip-path="${fr.clip}">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${C.haldiTint}"/>
      ${sun(630, 90, 27, "hs-sun")}
      <g id="hs-cloud">${cloud(70, 44, 1.05, C.white)}${rain}</g>
      <path d="M16 458C70 464 140 462 176 430L196 ${G}H704V470H16z" fill="${C.mittiTint}"/>
      <path id="hs-water" d="" fill="${C.gandak}"/>
      <path id="hs-wave" d="" fill="none" ${S(2.4)}/>
      <g id="hs-crests" stroke="${C.white}" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".75"></g>
      ${fish(44, 432, false)}${fish(112, 444, true)}
      <path d="M16 458C70 464 140 462 176 430L196 ${G}" fill="none" ${S(2)} opacity=".55"/>
      ${gaugeStaff(150, 252, 466, HERO.danger)}
      <path d="M470 ${G}H704" ${S(2.5)}/>
      <path d="M196 ${G}L262 ${T}H404L470 ${G}z" fill="${C.mitti}" ${S()}/>
      ${dashes}
      ${tuft(268, T)}${tuft(326, T)}${tuft(386, T)}${tuft(222, 358)}${tuft(446, 364)}
      ${milestone(298, T, 14, "hs-km")}
      ${prahari(352, T, "phone", "hs-man")}
      ${boil(500, G, "hs-boil")}
      ${nest("cow", 536, G - 50, 57)}
      ${nest("grain", 590, G - 61, 70)}
      ${hut(652, G, 60, "hs-hut")}
      ${loudspeaker(684, 330, 300, "hs-speaker")}
      ${tuft(474, G)}${tuft(560, G)}
    </g>
    ${fr.over}
    <g id="hs-bubble" class="bubble" style="transform-origin:392px 204px">
      <path d="${rr(380, 140, 214, 60, 14)}" fill="${C.white}" ${S()}/>
      <path d="M392 199l-4 14 15-13" fill="${C.white}" ${S()}/>
      <path d="M392 198.5h12" stroke="${C.white}" stroke-width="3.5"/>
      <g fill="${C.neel2}">${[6, 11, 16, 9, 13, 18, 10, 7, 12, 5]
        .map((hgt, i) => `<rect x="${394 + i * 5.2}" y="${170 - hgt / 2}" width="3" height="${hgt}" rx="1.5"/>`)
        .join("")}</g>
      <text x="450" y="165" class="svg-label" font-size="15" fill="${C.neel}"><tspan class="hi">किमी 14: पानी उबल रहा है</tspan><tspan class="en">km 14: water boiling up</tspan></text>
      <text x="450" y="185" class="svg-small" font-size="12" fill="${C.neel2}"><tspan class="hi">मटमैला है, 0:07</tspan><tspan class="en">It's muddy. 0:07</tspan></text>
    </g>
  </svg>`;
}

/** Hero water: the river's top edge at y (rest 294), with a phase for the waves. */
export function heroWater(y: number, phase: number): { body: string; wave: string; crests: string } {
  const G = HERO.ground;
  const bx = 196 + ((G - y) * 66) / 122;
  const body = `M16 ${f(y)}H${f(bx)}L196 ${G}L176 430C140 462 70 464 16 458Z`;
  let wave = `M${f(16 - 28 + (phase % 28))} ${f(y)}`;
  for (let x = 16 - 28 + (phase % 28); x < bx; x += 14) wave += `q3.5 -3.4 7 0t7 0`;
  const crests = [
    [34, 22], [86, 34], [130, 20], [60, 50],
  ]
    .map(([x, dy]) => `<path d="M${f(x + ((phase * 0.5) % 10))} ${f(y + dy)}q6-3 12 0"/>`)
    .join("");
  return { body, wave, crests };
}

// ---------- The night: 960 x 540 ----------

const NW = 960;
const NH = 540;
export const NIGHT = {
  ground: 430,
  bankTop: 300,
  riverToe: 300,
  landToe: 602,
  topL: 372,
  topR: 530,
  boilX: 632,
  machaanX: 668,
  hutX: 742,
  hutW: 72,
  moundX: 846,
  tentX: 892,
};

function star(x: number, y: number, s: number, i: number): string {
  return `<path class="star" data-i="${i}" d="M${x} ${y - s}l${s * 0.28} ${s * 0.72} ${s * 0.72} ${s * 0.28}-${s * 0.72} ${s * 0.28}-${s * 0.28} ${s * 0.72}-${s * 0.28}-${s * 0.72}-${s * 0.72}-${s * 0.28} ${s * 0.72}-${s * 0.28}z" fill="${C.haldiTint}"/>`;
}

function smallPerson(id: string, colour: string, child = false): string {
  const s = child ? 0.72 : 1;
  return `<g id="${id}" class="walker" transform="translate(0 0)">
    <g transform="scale(${s})">
      <circle cx="0" cy="-33" r="6" fill="${C.skin}" ${S(1.8)}/>
      <path d="M-7 -26h14l3 18h-20z" fill="${colour}" ${S(1.8)}/>
      <path class="leg-a" d="M-3 -8v8" ${S(2.2)}/><path class="leg-b" d="M3 -8v8" ${S(2.2)}/>
    </g>
  </g>`;
}

function cutaway(id: string, x: number, y: number, w: number, h: number, inner: string, cap_hi: string, cap_en: string): string {
  return `<g id="${id}" class="cutaway" style="transform-origin:${x + w / 2}px ${y + h / 2}px">
    <path d="${rr(x + 6, y + 7, w, h, 16)}" fill="${C.kesar}"/>
    <path d="${rr(x, y, w, h, 16)}" fill="${C.chuna}" ${S()}/>
    ${inner}
    <path d="M${x} ${y + h - 26}H${x + w}" ${S(2)}/>
    <text x="${x + 12}" y="${y + h - 8}" class="svg-label" font-size="13" fill="${C.neel}"><tspan class="hi">${cap_hi}</tspan><tspan class="en">${cap_en}</tspan></text>
  </g>`;
}

export function nightScene(): string {
  const N = NIGHT;
  const fr = frame("ns", NW, NH, C.haldi, C.raat);
  let stars = "";
  const pts = [
    [70, 210], [120, 250], [300, 210], [360, 248], [560, 70], [610, 130], [660, 60], [700, 150], [740, 96], [900, 170],
    [930, 60], [590, 200], [520, 160], [460, 90], [430, 200], [880, 230], [250, 236], [700, 230], [780, 190], [40, 260],
  ];
  pts.forEach(([x, y], i) => (stars += star(x, y, 4 + (i % 3) * 1.6, i)));
  const sandbags = Array.from({ length: 9 }, (_, i) => {
    const a = Math.PI + (i / 8) * Math.PI;
    const x = N.boilX + Math.cos(a) * 32;
    const y = N.ground - 4 + Math.sin(a) * 9 + (i % 2) * 2;
    return `<g class="bag" data-i="${i}" style="transform-origin:${f(x)}px ${f(y)}px"><path d="M${f(x - 9)} ${f(y)}c0-3.6 2.6-5.4 6-5.4h6c3.4 0 6 1.8 6 5.4s-2.6 4.4-6 4.4h-6c-3.4 0-6-.8-6-4.4z" fill="${C.mittiTint}" ${S(1.8)}/></g>`;
  }).join("");
  const jeInner = `
    <rect x="48" y="96" width="150" height="34" rx="6" fill="${C.gandakTint}" ${S(2)}/>
    <rect x="52" y="86" width="44" height="18" rx="8" fill="${C.white}" ${S(2)}/>
    <path d="M86 104h108v26H86z" fill="${C.haldi}" ${S(2)}/>
    <path d="M96 112l8 8 8-8 8 8 8-8 8 8 8-8 8 8 8-8 8 8" fill="none" stroke="${C.kesarDeep}" stroke-width="1.6"/>
    <svg x="58" y="64" width="38" height="38" viewBox="0 0 48 48">${face("je_sleep").replace(/<svg[^>]*>|<\/svg>/g, "")}</svg>
    <text id="ns-zzz" x="104" y="80" class="svg-num" font-size="16" fill="${C.neel2}">z z z</text>
    <g id="ns-jephone"><rect x="214" y="92" width="16" height="28" rx="3" fill="${C.neel}"/><rect id="ns-jescreen" x="216.5" y="95" width="11" height="20" rx="1.5" fill="${C.neel2}"/></g>
    <path id="ns-jebuzz" d="M208 96l-5-3M208 106h-6M236 96l5-3M236 106h6" stroke="${C.kesar}" stroke-width="2.4" stroke-linecap="round" opacity="0"/>
    <g id="ns-nostamp" opacity="0" style="transform-origin:150px 92px"><rect x="98" y="74" width="104" height="30" rx="4" fill="none" stroke="${C.sindoor}" stroke-width="3" transform="rotate(-8 150 89)"/>
    <text x="150" y="95" text-anchor="middle" class="svg-label" font-size="15" fill="${C.sindoor}" transform="rotate(-8 150 89)"><tspan class="hi">जवाब नहीं</tspan><tspan class="en">No answer</tspan></text></g>`;
  const aeInner = `
    <rect x="300" y="110" width="80" height="26" rx="4" fill="${C.mittiTint}" ${S(2)}/>
    <svg x="306" y="62" width="48" height="48" viewBox="0 0 48 48">${face("ae").replace(/<svg[^>]*>|<\/svg>/g, "")}</svg>
    <g id="ns-aephone"><rect x="362" y="74" width="16" height="28" rx="3" fill="${C.neel}"/><rect id="ns-aescreen" x="364.5" y="77" width="11" height="20" rx="1.5" fill="${C.neel2}"/></g>
    <g id="ns-aeok" opacity="0" style="transform-origin:448px 96px">
      <path d="${rr(394, 74, 118, 38, 12)}" fill="${C.dhaanTint}" ${S(2)}/>
      <text x="453" y="98" text-anchor="middle" class="svg-label" font-size="13" fill="${C.dhaanDeep}"><tspan class="hi">मैं जा रहा हूँ</tspan><tspan class="en">On my way</tspan></text>
    </g>`;
  const people = [
    smallPerson("ns-p0", C.kesar),
    smallPerson("ns-p1", C.dhaan),
    smallPerson("ns-p2", C.white),
    smallPerson("ns-p3", C.sindoor, true),
    smallPerson("ns-p4", C.haldi),
    smallPerson("ns-p5", C.gandakTint, true),
  ].join("");
  return `<svg class="scene night" viewBox="0 0 ${NW} ${NH}" role="img" aria-labelledby="ns-title">
    <title id="ns-title">The night of 29 to 30 September at kilometre 14, Haijalpur, drawn as a cartoon: the river, the bank, the patrol worker with a torch, the boil, the village and a relief camp on high ground. Panels show the junior and assistant engineers.</title>
    <defs>${fr.defs}</defs>
    <g clip-path="${fr.clip}">
      <rect id="ns-sky" x="0" y="0" width="${NW}" height="${NH}" fill="${C.raat}"/>
      <g id="ns-stars">${stars}</g>
      ${moon(812, 96, 30, "ns-moon")}
      <g id="ns-sun" opacity="0">${sun(812, 150, 30)}</g>
      <path d="M16 506C80 512 200 510 270 470L300 ${N.ground}H944V524H16z" fill="${C.mittiDeep}"/>
      <path id="ns-water" d="" fill="${C.gandakDeep}"/>
      <path id="ns-wave" d="" fill="none" stroke="${C.gandakTint}" stroke-width="2.2" stroke-linecap="round"/>
      <g id="ns-glints" stroke="${C.haldiTint}" stroke-width="2.4" stroke-linecap="round" opacity=".7"></g>
      ${gaugeStaff(214, 272, 508, 316)}
      <path id="ns-flood" d="" fill="${C.gandak}" opacity="0"/>
      <path d="M${N.landToe} ${N.ground}H944" ${S(2.5)}/>
      <path id="ns-mound" d="M${N.moundX - 20} ${N.ground}C${N.moundX + 10} ${N.ground - 2} ${N.moundX + 16} ${N.ground - 52} ${N.moundX + 52} ${N.ground - 52}H944V${N.ground}z" fill="${C.dhaanDeep}" ${S()}/>
      <path id="ns-bank" d="" fill="${C.mitti}" ${S()}/>
      <path id="ns-crack" d="" fill="none" stroke="${C.sindoor}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" opacity="0"/>
      ${milestone(420, N.bankTop, 14, "ns-km")}
      <path id="ns-beam" d="" fill="${C.haldi}" opacity="0"/>
      ${prahari(482, N.bankTop, "torch", "ns-man")}
      <ellipse id="ns-fence" cx="${N.boilX}" cy="${N.ground - 6}" rx="112" ry="40" fill="none" stroke="${C.sindoor}" stroke-width="2.4" stroke-dasharray="7 7" opacity="0"/>
      <text id="ns-fencelabel" x="${N.boilX + 70}" y="${N.ground + 32}" class="svg-small" font-size="12" fill="${C.haldiTint}" opacity="0"><tspan class="hi">200 मी. घेरा</tspan><tspan class="en">200 m geofence</tspan></text>
      ${boil(N.boilX, N.ground, "ns-boil")}
      <g id="ns-bags">${sandbags}</g>
      ${nest("grain", N.machaanX - 4, N.ground - 52, 60, 'id="ns-machaan"')}
      <g id="ns-sacks">
        <path d="M${N.machaanX + 34} ${N.ground}c-1-6 1-11 4-12.4l1-2h4l1 2c3 1.4 5 6.4 4 12.4z" fill="${C.white}" ${S(2)}/>
      </g>
      ${hut(N.hutX, N.ground, N.hutW, "ns-hut")}
      ${loudspeaker(N.hutX + N.hutW + 18, N.ground, N.ground - 96, "ns-speaker")}
      ${nest("tent", N.tentX - 6, N.ground - 100, 56)}
      <g id="ns-cow">${nest("cow", 0, 0, 40)}</g>
      <g id="ns-tractor" transform="translate(1000 ${N.ground - 40})">${nest("tractor", 0, 0, 44)}</g>
      <g id="ns-bike" transform="translate(1000 ${N.ground - 34})">
        <circle cx="6" cy="28" r="6" fill="${C.neel}"/><circle cx="30" cy="28" r="6" fill="${C.neel}"/>
        <path d="M6 28l9-10h12l3 10" fill="none" ${S(2.2)}/><path d="M15 18l-2-5h8" fill="none" ${S(2)}/>
        <circle cx="21" cy="5" r="5" fill="${C.skin}" ${S(1.6)}/><path d="M15.6 4a5.4 5.4 0 0 1 10.8 0z" fill="${C.haldi}" ${S(1.6)}/>
      </g>
      <g id="ns-pin" opacity="0">${nest("pin", 0, 0, 30)}</g>
      ${people}
    </g>
    ${fr.over}
    ${cutaway("ns-je", 36, 44, 220, 146, jeInner, "जेई, घर पर", "Junior engineer, at home")}
    ${cutaway("ns-ae", 282, 44, 240, 146, aeInner, "एई, घर पर", "Assistant engineer, at home")}
  </svg>`;
}

/** The morning after the breach, two ways: "before" (no warning) and "after" (ready). 960 x 540. */
export function morningScene(variant: "before" | "after"): string {
  const N = NIGHT;
  const G = N.ground;
  const id = `ms-${variant}`;
  const fr = frame(id, NW, NH, variant === "after" ? C.dhaan : C.neel3, C.chuna);
  const flood = G - 30;
  const sack = (x: number, y: number, rot: number) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-9 0c-1-7 1-12 4.6-13.6l1-2.2h6.8l1 2.2C8 -12 10 -7 9 0z" fill="${C.white}" ${S(2)}/><path d="M-3.6 -15.4h7.2" stroke="${C.mittiDeep}" stroke-width="2" stroke-linecap="round"/></g>`;
  const person = (x: number, y: number, col: string, s = 1) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-33" r="6" fill="${C.skin}" ${S(1.8)}/><path d="M-7 -26h14l3 18h-20z" fill="${col}" ${S(1.8)}/><path d="M-3 -8v8M3 -8v8" ${S(2.2)}/></g>`;
  const machaan = `<g><path d="M${N.machaanX + 4} ${G}V${G - 40}M${N.machaanX + 28} ${G}V${G - 40}M${N.machaanX + 52} ${G}V${G - 40}" stroke="${C.neel}" stroke-width="3" stroke-linecap="round"/>
    <rect x="${N.machaanX - 2}" y="${G - 46}" width="60" height="7" rx="2" fill="${C.haldi}" ${S(2.2)}/></g>`;
  let parts = "";
  if (variant === "before") {
    parts = `
      ${machaan}
      <path d="M${N.moundX - 20} ${G}C${N.moundX + 10} ${G - 2} ${N.moundX + 16} ${G - 52} ${N.moundX + 52} ${G - 52}H944V${G}z" fill="${C.dhaan}" ${S()}/>
      ${person(N.hutX + 24, G - 70, C.kesar, 0.9)}${person(N.hutX + 44, G - 70, C.sindoor, 0.7)}
      <path d="${rr(N.hutX + 10, G - 74, 54, 10, 4)}" fill="none"/>`;
  } else {
    parts = `
      ${machaan}
      ${sack(N.machaanX + 10, G - 46, 0)}${sack(N.machaanX + 28, G - 46, 0)}${sack(N.machaanX + 46, G - 46, 0)}
      <path d="M${N.moundX - 20} ${G}C${N.moundX + 10} ${G - 2} ${N.moundX + 16} ${G - 52} ${N.moundX + 52} ${G - 52}H944V${G}z" fill="${C.dhaan}" ${S()}/>
      ${nest("tent", N.tentX - 6, G - 100, 56)}
      ${nest("cow", N.moundX + 14, G - 88, 40)}
      ${person(N.tentX - 18, G - 52, C.kesar)}${person(N.tentX + 54, G - 52, C.dhaan)}${person(N.tentX + 66, G - 52, C.sindoor, 0.72)}
      ${nest("papers", N.tentX + 30, G - 74, 26)}`;
  }
  const floating =
    variant === "before"
      ? `${sack(N.hutX - 40, flood + 4, -32)}${sack(N.machaanX + 6, flood + 6, 24)}${sack(N.landToe + 70, flood + 5, 60)}
         <g transform="translate(${N.machaanX + 70} ${flood - 14})"><svg x="0" y="0" width="44" height="44" viewBox="0 0 40 40">${iconBody("cow")}</svg></g>
         <rect x="${N.hutX + 92}" y="${flood + 2}" width="14" height="10" rx="1" fill="${C.white}" ${S(1.4)} transform="rotate(14 ${N.hutX + 99} ${flood + 7})"/>
         <rect x="${N.landToe + 30}" y="${flood + 4}" width="12" height="9" rx="1" fill="${C.white}" ${S(1.4)} transform="rotate(-20 ${N.landToe + 36} ${flood + 8})"/>`
      : "";
  return `<svg class="scene" viewBox="0 0 ${NW} ${NH}" role="img" aria-label="${variant === "before" ? "The morning after the breach without warning: water inside the hut, sacks of grain and a cow in the flood water, a family on the roof." : "The same morning with an hour's warning: grain on the machaan above the water, the cow on the mound, the family at the relief camp with their papers."}">
    <defs>${fr.defs}</defs>
    <g clip-path="${fr.clip}">
      <rect x="0" y="0" width="${NW}" height="${NH}" fill="${C.haldiTint}"/>
      ${sun(820, 110, 30)}
      ${cloud(110, 60, 1, C.white)}
      <path d="M16 506C80 512 200 510 270 470L300 ${G}H944V524H16z" fill="${C.mittiTint}"/>
      <path d="M16 316H${(300 + ((G - 316) * 72) / 130).toFixed(1)}L300 ${G}L270 470C200 510 80 512 16 506Z" fill="${C.gandak}"/>
      <path d="M${N.riverToe} ${G}L${N.topL} 300L430 300L440 420L470 420L482 300L${N.topR} 300L${N.landToe} ${G}Z" fill="${C.mitti}" ${S()}/>
      ${hut(N.hutX, G, N.hutW, `${id}-hut`)}
      ${parts}
      <path d="M440 316L440 420H470L470 316ZM${N.landToe - 30} ${flood}H${N.moundX + 4}C${N.moundX + 12} ${flood} ${N.moundX + 14} ${G} ${N.moundX + 14} ${G}H${N.landToe - 40}Z" fill="${C.gandak}" opacity=".88"/>
      <path d="M${N.landToe - 30} ${flood}q8-4 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" fill="none" stroke="${C.gandakTint}" stroke-width="2.2" stroke-linecap="round"/>
      ${floating}
    </g>
    ${fr.over}
  </svg>`;
}
