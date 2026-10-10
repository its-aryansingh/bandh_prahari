// Madhubani sprites for the live map, drawn with canvas paths: one indigo ink, flat fills
// from the tokens, patterns inside the shapes. Each sprite is drawn once per scale into a
// small bitmap and reused, so the map stays quick on cheap phones.
import { C } from "../art/palette";

type Ctx = CanvasRenderingContext2D;

export interface Sprite {
  img: HTMLCanvasElement;
  /** Where the sprite's foot sits inside the bitmap, in bitmap pixels. */
  ax: number;
  ay: number;
  /** Bitmap pixels per sprite unit. */
  scale: number;
}

const ink = (ctx: Ctx, w: number) => {
  ctx.strokeStyle = C.neel;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
};

const fillStroke = (ctx: Ctx, fill: string, w: number) => {
  ctx.fillStyle = fill;
  ctx.fill();
  ink(ctx, w);
  ctx.stroke();
};

// ---------- the drawings, in sprite units: the foot at (0, 0), y up is negative ----------

/** Mango tree: trunk, round crown with a second ring and leaf marks (the Madhubani "tree of life"). */
function mango(ctx: Ctx, v: number) {
  const w = 1.1;
  ctx.beginPath();
  ctx.moveTo(-1.4, 0);
  ctx.lineTo(-1, -9);
  ctx.lineTo(1, -9);
  ctx.lineTo(1.4, 0);
  ctx.closePath();
  fillStroke(ctx, C.mittiDeep, w);
  const r = 7 + (v % 3) * 0.6;
  ctx.beginPath();
  ctx.ellipse(0, -14, r, r * 0.86, 0, 0, Math.PI * 2);
  fillStroke(ctx, C.dhaan, w);
  ctx.beginPath();
  ctx.ellipse(0, -14, r - 2.2, (r - 2.2) * 0.86, 0, 0, Math.PI * 2);
  ctx.strokeStyle = C.dhaanDeep;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // leaves: small almond shapes around the inner ring
  ctx.fillStyle = C.dhaanTint;
  ink(ctx, 0.55);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + v * 0.7;
    const x = Math.cos(a) * (r - 4.1);
    const y = -14 + Math.sin(a) * (r - 4.1) * 0.86;
    ctx.beginPath();
    ctx.ellipse(x, y, 1.5, 0.75, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, -14, 1, 0, Math.PI * 2);
  ctx.fillStyle = C.haldi;
  ctx.fill();
}

/** Taad (palmyra), common on the field bunds: ringed trunk and a fan of fronds. */
function taad(ctx: Ctx) {
  const w = 1.1;
  ctx.beginPath();
  ctx.moveTo(-1.1, 0);
  ctx.lineTo(-0.7, -17);
  ctx.lineTo(0.7, -17);
  ctx.lineTo(1.1, 0);
  ctx.closePath();
  fillStroke(ctx, C.mitti, w);
  ctx.strokeStyle = C.mittiDeep;
  ctx.lineWidth = 0.6;
  for (let y = -3; y > -16; y -= 2.6) {
    ctx.beginPath();
    ctx.moveTo(-0.9, y);
    ctx.lineTo(0.9, y - 0.5);
    ctx.stroke();
  }
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(Math.cos(a - 0.16) * 4.5, -17 + Math.sin(a - 0.16) * 4.5);
    ctx.lineTo(Math.cos(a) * 7.5, -17 + Math.sin(a) * 6.5);
    ctx.lineTo(Math.cos(a + 0.16) * 4.5, -17 + Math.sin(a + 0.16) * 4.5);
    ctx.closePath();
    fillStroke(ctx, C.dhaan, 0.8);
  }
}

/** A bamboo clump. */
function bamboo(ctx: Ctx) {
  for (const [x, h] of [[-2.4, 15], [0, 18], [2.4, 14]] as const) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + 0.8, -h / 2, x + 1.5, -h);
    ink(ctx, 1.8);
    ctx.stroke();
    ctx.strokeStyle = C.dhaan;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    for (let k = 1; k < 4; k++) {
      const y = -(h * k) / 4;
      ctx.beginPath();
      ctx.ellipse(x + 2.6 * (k % 2 ? 1 : -1), y, 2.3, 0.8, k % 2 ? -0.5 : 0.5, 0, Math.PI * 2);
      fillStroke(ctx, C.dhaan, 0.5);
    }
  }
}

/** A hut with a khapda (clay tile) roof, frontal, as Madhubani draws it. */
function hut(ctx: Ctx, v: number) {
  const w = 1;
  const W = v % 2 ? 6.4 : 5.4;
  ctx.beginPath();
  ctx.rect(-W, -7, W * 2, 7);
  fillStroke(ctx, C.mittiTint, w);
  ctx.beginPath();
  ctx.moveTo(-1.6, 0);
  ctx.lineTo(-1.6, -3.6);
  ctx.arc(0, -3.6, 1.6, Math.PI, 0);
  ctx.lineTo(1.6, 0);
  ctx.closePath();
  ctx.fillStyle = C.neel;
  ctx.fill();
  // window dots, like painted wall marks
  ctx.fillStyle = C.kesarDeep;
  ctx.beginPath();
  ctx.arc(-W + 2, -4.2, 0.7, 0, Math.PI * 2);
  ctx.arc(W - 2, -4.2, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-W - 2, -6.4);
  ctx.lineTo(0, -13.4);
  ctx.lineTo(W + 2, -6.4);
  ctx.closePath();
  fillStroke(ctx, C.kesarDeep, w);
  // tiles: two rows of scallops
  ctx.strokeStyle = C.kesarTint;
  ctx.lineWidth = 0.6;
  for (const [y, half] of [[-8.6, W - 0.5], [-10.8, W - 3.4]] as const) {
    ctx.beginPath();
    for (let x = -half; x < half - 0.1; x += 1.6) {
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 0.8, y + 1, x + 1.6, y);
    }
    ctx.stroke();
  }
}

/** Madhubani fish: almond body with scales, forked tail, big eye. Faces right. */
function fish(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(0, -4.6, 6, 0);
  ctx.quadraticCurveTo(0, 4.6, -6, 0);
  ctx.closePath();
  fillStroke(ctx, C.haldiTint, 0.8);
  ctx.beginPath();
  ctx.moveTo(-5.6, 0);
  ctx.lineTo(-9.4, -2.8);
  ctx.lineTo(-8.6, 0);
  ctx.lineTo(-9.4, 2.8);
  ctx.closePath();
  fillStroke(ctx, C.haldiDeep, 0.8);
  ctx.strokeStyle = C.kesarDeep;
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  for (const x of [-2.6, -0.4, 1.8]) {
    ctx.moveTo(x, -2.2);
    ctx.quadraticCurveTo(x + 1.2, 0, x, 2.2);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(3.7, -0.6, 0.75, 0, Math.PI * 2);
  ctx.fillStyle = C.neel;
  ctx.fill();
}

/** Relief camp: a white tent with a green flag (green means safe on this page). */
function tent(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(0, -11);
  ctx.lineTo(8, 0);
  ctx.closePath();
  fillStroke(ctx, C.white, 1.1);
  ctx.beginPath();
  ctx.moveTo(-2.6, 0);
  ctx.lineTo(0, -4.6);
  ctx.lineTo(2.6, 0);
  ctx.closePath();
  ctx.fillStyle = C.neel;
  ctx.fill();
  ctx.strokeStyle = C.dhaanDeep;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-4.4, -6);
  ctx.lineTo(-6, -2.6);
  ctx.moveTo(4.4, -6);
  ctx.lineTo(6, -2.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(0, -16);
  ink(ctx, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(4.4, -14.6);
  ctx.lineTo(0, -13.2);
  ctx.closePath();
  fillStroke(ctx, C.dhaan, 0.7);
}

/** The village-road kilometre stone: white with an orange cap. */
function stone(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(-3.4, 0);
  ctx.lineTo(-3.4, -5.6);
  ctx.arc(0, -5.6, 3.4, Math.PI, 0);
  ctx.lineTo(3.4, 0);
  ctx.closePath();
  fillStroke(ctx, C.white, 0.9);
  ctx.beginPath();
  ctx.moveTo(-3.4, -5.8);
  ctx.arc(0, -5.8, 3.4, Math.PI, 0);
  ctx.closePath();
  fillStroke(ctx, C.kesar, 0.9);
}

/** Madhubani cloud with inner scallops. */
function cloud(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.bezierCurveTo(-17, 0, -17, -7, -12, -7.5);
  ctx.bezierCurveTo(-12, -13, -4, -14, -2, -9.5);
  ctx.bezierCurveTo(1, -15, 10, -14, 10, -8);
  ctx.bezierCurveTo(15, -8.5, 17, -2, 13, 0);
  ctx.closePath();
  fillStroke(ctx, C.white, 1);
  ctx.strokeStyle = C.gandakTint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-10, -3);
  ctx.quadraticCurveTo(-7, -6, -4, -3);
  ctx.moveTo(-1, -4);
  ctx.quadraticCurveTo(2.5, -8, 6, -4);
  ctx.stroke();
}

/** Country boat with two Yuva Aapda Mitra volunteers and an oar. Faces right. */
function boat(ctx: Ctx) {
  person(ctx, -3.2, -2.4, C.white);
  person(ctx, 2.6, -2.4, C.gandakTint);
  ctx.beginPath();
  ctx.moveTo(6, -6);
  ctx.lineTo(9.5, 2);
  ink(ctx, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-10, -3);
  ctx.quadraticCurveTo(0, 4.4, 10, -3);
  ctx.lineTo(7.4, -1.4);
  ctx.quadraticCurveTo(0, 1.6, -7.4, -1.4);
  ctx.closePath();
  fillStroke(ctx, C.mittiDeep, 1);
  ctx.strokeStyle = C.mittiTint;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-6, 0.2);
  ctx.quadraticCurveTo(0, 2.6, 6, 0.2);
  ctx.stroke();
}

/** The SDRF motor boat: white hull, outboard motor, three crew. Faces right. */
function sdrf(ctx: Ctx) {
  person(ctx, -4.6, -2.6, C.haldiTint);
  person(ctx, -0.4, -2.6, C.haldiTint);
  person(ctx, 3.8, -2.6, C.haldiTint);
  ctx.beginPath();
  ctx.moveTo(-10, -3.4);
  ctx.lineTo(9, -3.4);
  ctx.lineTo(11, -5.4);
  ctx.lineTo(8.4, 1.4);
  ctx.lineTo(-9, 1.4);
  ctx.closePath();
  fillStroke(ctx, C.white, 1);
  ctx.beginPath();
  ctx.moveTo(-9.4, -0.8);
  ctx.lineTo(9.4, -0.8);
  ctx.strokeStyle = C.neel;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-13, -5, 3, 5);
  fillStroke(ctx, C.neel2, 0.8);
}

/** The embankment ambulance: a repair tractor. Faces right. */
function tractor(ctx: Ctx) {
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(1, -4);
  ctx.lineTo(1, -10);
  ctx.lineTo(6, -10);
  ctx.lineTo(8, -4);
  ctx.lineTo(10, -4);
  ctx.lineTo(10, 1);
  ctx.lineTo(-9, 1);
  ctx.closePath();
  fillStroke(ctx, C.dhaanDeep, 1);
  ctx.beginPath();
  ctx.rect(2.2, -9, 3, 4);
  fillStroke(ctx, C.gandakTint, 0.6);
  // sandbags in the trolley
  ctx.fillStyle = C.mittiTint;
  ink(ctx, 0.6);
  for (const x of [-7.5, -4.5, -1.5]) {
    ctx.beginPath();
    ctx.ellipse(x, -5.2, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  for (const [x, r] of [[6, 3.6], [-5, 2.6]] as const) {
    ctx.beginPath();
    ctx.arc(x, 1.6, r, 0, Math.PI * 2);
    ctx.fillStyle = C.neel;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, 1.6, r * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = C.haldiTint;
    ctx.fill();
  }
}

function person(ctx: Ctx, x: number, y: number, body: string) {
  ctx.beginPath();
  ctx.moveTo(x - 1.8, y);
  ctx.lineTo(x - 1.4, y - 4);
  ctx.lineTo(x + 1.4, y - 4);
  ctx.lineTo(x + 1.8, y);
  ctx.closePath();
  fillStroke(ctx, body, 0.7);
  ctx.beginPath();
  ctx.arc(x, y - 5.6, 1.5, 0, Math.PI * 2);
  fillStroke(ctx, C.skin, 0.7);
}

const DRAW: Record<string, (ctx: Ctx, v: number) => void> = {
  mango,
  taad: (ctx) => taad(ctx),
  bamboo: (ctx) => bamboo(ctx),
  hut,
  fish: (ctx) => fish(ctx),
  tent: (ctx) => tent(ctx),
  stone: (ctx) => stone(ctx),
  cloud: (ctx) => cloud(ctx),
  boat: (ctx) => boat(ctx),
  sdrf: (ctx) => sdrf(ctx),
  tractor: (ctx) => tractor(ctx),
};

/** Half-width and height of each sprite's box, in sprite units, with room for the ink. */
const BOX: Record<string, [number, number, number]> = {
  // [half width, up, down]
  mango: [9.5, 23, 1.5],
  taad: [9, 25, 1.5],
  bamboo: [7, 20, 1.5],
  hut: [9, 15, 1.5],
  fish: [10.5, 6, 6],
  tent: [9.5, 17.5, 1.5],
  stone: [5, 10.5, 1.5],
  cloud: [18, 16, 2],
  boat: [11.5, 10, 4],
  sdrf: [14.5, 10, 3],
  tractor: [11, 11.5, 6],
};

const cache = new Map<string, Sprite>();

/** A sprite bitmap at about `scale` device pixels per unit (bucketed to keep the cache small). */
export function sprite(kind: string, variant: number, scale: number, flip = false): Sprite {
  const bucket = Math.max(0.25, Math.round(Math.log2(Math.max(scale, 0.05)) * 3) / 3);
  const s = Math.pow(2, bucket);
  const key = `${kind}:${variant}:${bucket}:${flip ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [hw, up, down] = BOX[kind] ?? [10, 20, 2];
  const img = document.createElement("canvas");
  img.width = Math.ceil(hw * 2 * s) + 2;
  img.height = Math.ceil((up + down) * s) + 2;
  const ctx = img.getContext("2d")!;
  const ax = img.width / 2;
  const ay = up * s + 1;
  ctx.translate(ax, ay);
  ctx.scale(flip ? -s : s, s);
  DRAW[kind]?.(ctx, variant);
  const out = { img, ax, ay, scale: s };
  cache.set(key, out);
  return out;
}

/** Draws a sprite with its foot at (x, y), `unit` device pixels per sprite unit. */
export function drawSprite(ctx: Ctx, kind: string, variant: number, x: number, y: number, unit: number, flip = false): void {
  const sp = sprite(kind, variant, unit, flip);
  const k = unit / sp.scale;
  ctx.drawImage(sp.img, x - sp.ax * k, y - sp.ay * k, sp.img.width * k, sp.img.height * k);
}
