// The live map's renderer: the grid as an isometric, blocky diorama, painted like a
// Madhubani picture on a canvas. Ground, water, trees and huts are painted once into a
// cached bitmap, and painted again only when the water level, a layer, the rotation or
// the zoom changes. Every frame then copies that bitmap and draws the few things that
// move on top (teams, help pins, routes, labels), so a cheap phone keeps up.
import { C } from "../art/palette";
import { mix } from "../lib/motion";
import { CLS, CREST_M, SCOUR_M, type Model } from "./model";
import { type Flood, wse } from "./flood";
import { drawSpriteAt } from "./sprites";

export type Rot = 0 | 1 | 2 | 3;

/** What the painted bitmap shows. Anything else is drawn per frame on top. */
export interface Paint {
  /** The reading at the Rewaghat gauge the water is drawn for (m). */
  level: number;
  flood: Flood;
  /** Water the Sentinel-2 pass saw, and the clouds it couldn't see through. */
  observed: boolean;
  /** Relief camps' tents. */
  camps: boolean;
  /** Quick paint while a slider or the rising water is moving: no patterns or sprites. */
  draft?: boolean;
}

/** Bottom of the soil slab, in metres under the lowest ground. */
const SLAB_M = 3.4;
/** Vertical exaggeration: pixels per metre, as a share of half a tile's width. */
const ZK = 0.44;

// Surfaces. Every fill is a token (tints for large surfaces, as DESIGN.md asks).
const K = {
  cropA: 0,
  cropB: 1,
  trees: 2,
  grass: 3,
  built: 4,
  bare: 5,
  wetland: 6,
  river: 7,
  flood: 8,
  seen: 9,
  bank: 10,
  breach: 11,
} as const;
type Kind = (typeof K)[keyof typeof K];

const TOP: Record<Kind, string> = {
  [K.cropA]: C.haldiTint,
  [K.cropB]: C.dhaanTint,
  [K.trees]: C.dhaanTint,
  [K.grass]: C.dhaanTint,
  [K.built]: C.mittiTint,
  [K.bare]: C.mittiTint,
  [K.wetland]: C.gandakTint,
  [K.river]: C.gandak,
  [K.flood]: mix(C.gandak, C.white, 0.22),
  [K.seen]: mix(C.gandak, C.white, 0.62),
  [K.bank]: C.mitti,
  [K.breach]: C.mittiDeep,
};
const WATERY = (k: Kind) => k === K.river || k === K.flood;
const SOIL = C.mittiDeep;

const hash = (i: number) => {
  let x = (i + 1) * 2654435761;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
};

interface RotFrame {
  C: number;
  R: number;
  /** Rotated column and row of each original cell. */
  cc: Int16Array;
  rr: Int16Array;
  /** Original cell at a rotated position. */
  at: Int32Array;
  /** Painter's order: back to front. */
  order: Int32Array;
}

export class Iso {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cache = document.createElement("canvas");
  private cctx = this.cache.getContext("2d")!;
  private frames: RotFrame[];

  rot: Rot = 0;
  zoom = 1;
  /** Pan, in CSS pixels, of the diorama's centre from the canvas centre. */
  panX = 0;
  panY = 0;

  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  /** Half a tile's width and height at zoom 1, and pixels per metre. */
  hw = 8;
  hh = 4;
  zk = 3.5;
  private zBase: number;
  private zFloor: number;
  private zTop: number;

  // the painted bitmap: its scale (device px per world px) and the world box it covers
  private cacheK = 0;
  private box = { x: 0, y: 0, w: 1, h: 1 };
  private painted: Paint | null = null;
  private paintedKey = "";

  /** Current tops and surfaces, from the last paint. */
  top: Float32Array;
  kind: Uint8Array;

  constructor(
    readonly m: Model,
    canvas: HTMLCanvasElement,
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.zBase = m.zMin - 0.6;
    this.zFloor = this.zBase - SLAB_M;
    this.zTop = m.zMax + 0.5;
    this.top = new Float32Array(m.N);
    this.kind = new Uint8Array(m.N);
    this.frames = ([0, 1, 2, 3] as Rot[]).map((r) => this.frame(r));
  }

  // ---------------- geometry ----------------

  private frame(rot: Rot): RotFrame {
    const { R, C: Cn, N } = this.m;
    const odd = rot % 2 === 1;
    const RC = odd ? Cn : R;
    const CC = odd ? R : Cn;
    const cc = new Int16Array(N);
    const rr = new Int16Array(N);
    const at = new Int32Array(N).fill(-1);
    for (let r = 0; r < R; r++)
      for (let c = 0; c < Cn; c++) {
        const i = r * Cn + c;
        let c2 = c;
        let r2 = r;
        if (rot === 1) {
          c2 = R - 1 - r;
          r2 = c;
        } else if (rot === 2) {
          c2 = Cn - 1 - c;
          r2 = R - 1 - r;
        } else if (rot === 3) {
          c2 = r;
          r2 = Cn - 1 - c;
        }
        cc[i] = c2;
        rr[i] = r2;
        at[r2 * CC + c2] = i;
      }
    const order = Int32Array.from({ length: N }, (_, k) => k).sort((a, b) => cc[a] + rr[a] - (cc[b] + rr[b]) || rr[a] - rr[b]);
    return { C: CC, R: RC, cc, rr, at, order };
  }

  /** A point on the original grid (x = column, y = row, continuous) in the rotated frame. */
  private rotPt(x: number, y: number): [number, number] {
    const { R, C: Cn } = this.m;
    switch (this.rot) {
      case 1:
        return [R - y, x];
      case 2:
        return [Cn - x, R - y];
      case 3:
        return [y, Cn - x];
      default:
        return [x, y];
    }
  }

  /** World coordinates (CSS px at zoom 1) of a rotated grid point at height z. */
  private W(x2: number, y2: number, z: number): [number, number] {
    return [(x2 - y2) * this.hw, (x2 + y2) * this.hh - (z - this.zBase) * this.zk];
  }

  private worldBox() {
    const f = this.frames[this.rot];
    const pad = this.hw * 3;
    const x = -f.R * this.hw - pad;
    const y = -(this.zTop - this.zBase) * this.zk - this.hw * 4;
    const w = (f.C + f.R) * this.hw + 2 * pad;
    const h = (f.C + f.R) * this.hh + (this.zBase - this.zFloor) * this.zk - y + pad;
    return { x, y, w, h };
  }

  private centre(): [number, number] {
    const f = this.frames[this.rot];
    return [((f.C - f.R) * this.hw) / 2, ((f.C + f.R) * this.hh) / 2 - ((this.zTop - this.zBase) * this.zk) / 3];
  }

  /** Grid point (x = column, y = row) at height z to CSS pixels on the canvas. */
  project(x: number, y: number, z: number): [number, number] {
    const [x2, y2] = this.rotPt(x, y);
    const [wx, wy] = this.W(x2, y2, z);
    const [cx, cy] = this.centre();
    return [(wx - cx) * this.zoom + this.cssW / 2 + this.panX, (wy - cy) * this.zoom + this.cssH / 2 + this.panY];
  }

  /** The surface height of cell i as last painted. */
  surface(i: number): number {
    return this.top[i];
  }

  /** The centre of cell i's top face, in CSS pixels. */
  cellPoint(i: number, lift = 0): [number, number] {
    const c = i % this.m.C;
    const r = Math.floor(i / this.m.C);
    return this.project(c + 0.5, r + 0.5, this.top[i] + lift);
  }

  /** Grid point to CSS px, standing on the painted surface of the cell it falls in. */
  onSurface(p: [number, number], lift = 0): [number, number] {
    const c = Math.min(this.m.C - 1, Math.max(0, Math.floor(p[0])));
    const r = Math.min(this.m.R - 1, Math.max(0, Math.floor(p[1])));
    return this.project(p[0], p[1], this.top[r * this.m.C + c] + lift);
  }

  /** Pixels per metre on screen, for scaling sprites drawn per frame. */
  get unit(): number {
    return this.hw * this.zoom;
  }

  /** Sizes the canvas to its box and fits the diorama. Returns true if anything changed. */
  resize(): boolean {
    // layout size, not getBoundingClientRect: the 90° turn squashes the canvas with a CSS transform
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.offsetWidth));
    const h = Math.max(1, Math.round(this.canvas.offsetHeight));
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return false;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    const f = this.frames[this.rot];
    const n = f.C + f.R;
    const hw = Math.min((w * 0.96) / n, (h * 0.92) / (n / 2 + (this.zTop - this.zFloor) * ZK));
    this.hw = Math.max(1.5, hw);
    this.hh = this.hw / 2;
    this.zk = this.hw * ZK;
    this.cacheK = 0; // force a repaint at the new size
    return true;
  }

  get size(): [number, number] {
    return [this.cssW, this.cssH];
  }

  /** Device pixels per CSS pixel, as the canvas is drawn. */
  get ratio(): number {
    return this.dpr;
  }

  // ---------------- the painted bitmap ----------------

  /** Works out every cell's surface for this paint. */
  private surfaces(p: Paint) {
    const m = this.m;
    for (let i = 0; i < m.N; i++) {
      const g = m.ground[i];
      let k: Kind;
      let t = g;
      const cls = m.cls[i];
      if (p.flood.breach.has(i)) {
        k = K.breach;
        t = g - SCOUR_M;
      } else if (m.emb[i]) {
        k = K.bank;
        t = g + CREST_M;
      } else if (cls === CLS.trees) k = K.trees;
      else if (cls === CLS.built || m.built[i] >= 30) k = K.built;
      else if (cls === CLS.grass) k = K.grass;
      else if (cls === CLS.bare) k = K.bare;
      else if (cls === CLS.wetland) k = K.wetland;
      else k = hash(i * 7 + Math.floor(i / m.C)) < 0.5 ? K.cropA : K.cropB;
      // river water: the channel always, other cells when the reading floods them
      const w = wse(m, i, p.level);
      if (m.channel[i]) {
        k = K.river;
        t = Math.max(t, w, m.dsm[i]);
      } else if (p.flood.thr[i] < p.level && w > t) {
        k = K.flood;
        t = w;
      } else if (p.observed && m.s2water[i] > 50 && k !== K.bank) {
        k = K.seen;
        t = t + 0.2;
      }
      this.kind[i] = k;
      this.top[i] = t;
    }
  }

  private patterns: Partial<Record<string, CanvasPattern>> = {};
  private patternK = 0;

  /** Patterns drawn at the bitmap's resolution so their lines stay crisp at any zoom. */
  private pattern(name: string): CanvasPattern | null {
    const k = this.cacheK;
    if (this.patternK !== k) {
      this.patterns = {};
      this.patternK = k;
    }
    const hit = this.patterns[name];
    if (hit) return hit;
    const T = Math.max(2.6, this.hw * 0.42); // tile size in world px
    const s = Math.max(4, Math.round(T * k));
    const tile = document.createElement("canvas");
    const wide = name === "waves" || name === "flood";
    tile.width = wide ? s * 2 : s;
    tile.height = s;
    const t = tile.getContext("2d")!;
    const lw = Math.max(0.8, k * 0.55);
    t.lineCap = "round";
    switch (name) {
      case "a": // kachni hatching, one way
      case "b": {
        t.strokeStyle = "rgba(31,35,80,0.30)";
        t.lineWidth = lw;
        t.beginPath();
        for (const o of [-s, 0, s]) {
          if (name === "a") {
            t.moveTo(o, s);
            t.lineTo(o + s, 0);
          } else {
            t.moveTo(o, 0);
            t.lineTo(o + s, s);
          }
        }
        t.stroke();
        break;
      }
      case "waves":
      case "flood": {
        t.strokeStyle = name === "waves" ? "rgba(255,253,248,0.7)" : "rgba(36,96,125,0.55)";
        t.lineWidth = lw;
        t.beginPath();
        const y0 = s * 0.5;
        for (let x = 0; x <= s * 2; x += 1) {
          const y = y0 + Math.sin((x / (s * 2)) * Math.PI * 2) * s * 0.18;
          if (x === 0) t.moveTo(x, y);
          else t.lineTo(x, y);
        }
        t.stroke();
        break;
      }
      case "seen": {
        // seen from space: fine crossed lines, like a printed survey map
        t.strokeStyle = "rgba(255,253,248,0.75)";
        t.lineWidth = lw * 0.9;
        t.beginPath();
        t.moveTo(0, s);
        t.lineTo(s, 0);
        t.moveTo(-s / 2, s / 2);
        t.lineTo(s / 2, -s / 2);
        t.moveTo(s / 2, s * 1.5);
        t.lineTo(s * 1.5, s / 2);
        t.stroke();
        t.fillStyle = "rgba(36,96,125,0.45)";
        t.beginPath();
        t.arc(s * 0.75, s * 0.75, lw * 0.8, 0, Math.PI * 2);
        t.fill();
        break;
      }
      case "dots": {
        t.fillStyle = "rgba(148,112,62,0.6)";
        t.beginPath();
        t.arc(s * 0.3, s * 0.3, lw, 0, Math.PI * 2);
        t.arc(s * 0.8, s * 0.75, lw * 0.8, 0, Math.PI * 2);
        t.fill();
        break;
      }
      case "reeds": {
        t.strokeStyle = "rgba(29,107,54,0.6)";
        t.lineWidth = lw;
        t.beginPath();
        t.moveTo(s * 0.3, s * 0.9);
        t.lineTo(s * 0.25, s * 0.35);
        t.moveTo(s * 0.45, s * 0.9);
        t.lineTo(s * 0.55, s * 0.4);
        t.stroke();
        break;
      }
      case "bank": {
        // the stitched border of a Madhubani painting, along the crest
        t.strokeStyle = "rgba(148,112,62,0.9)";
        t.lineWidth = lw;
        t.beginPath();
        t.moveTo(0, s * 0.7);
        t.lineTo(s * 0.5, s * 0.3);
        t.lineTo(s, s * 0.7);
        t.stroke();
        break;
      }
    }
    const pat = this.cctx.createPattern(tile, "repeat");
    if (!pat) return null;
    pat.setTransform(new DOMMatrix().scale(1 / k, 1 / k));
    this.patterns[name] = pat;
    return pat;
  }

  /** Paints the diorama into the bitmap, unless it already shows exactly this. */
  paint(p: Paint, force = false): void {
    const key = `${p.level.toFixed(3)}|${p.flood.breachKm}|${p.observed}|${p.camps}|${p.draft ? 1 : 0}|${this.rot}`;
    const k = Math.min(this.zoom * this.dpr, 4096 / Math.max(this.worldBox().w, this.worldBox().h));
    const kBucket = Math.max(0.5, Math.round(k * 4) / 4);
    if (!force && key === this.paintedKey && kBucket === this.cacheK) return;
    this.paintedKey = key;
    this.painted = p;
    this.cacheK = kBucket;
    this.box = this.worldBox();
    const cv = this.cache;
    cv.width = Math.ceil(this.box.w * kBucket);
    cv.height = Math.ceil(this.box.h * kBucket);
    const ctx = this.cctx;
    ctx.setTransform(kBucket, 0, 0, kBucket, -this.box.x * kBucket, -this.box.y * kBucket);
    ctx.clearRect(this.box.x, this.box.y, this.box.w, this.box.h);
    this.surfaces(p);
    this.paintCells(ctx, p);
  }

  private paintCells(ctx: CanvasRenderingContext2D, p: Paint): void {
    const m = this.m;
    const f = this.frames[this.rot];
    const { top, kind } = this;
    const k = this.cacheK;
    const draft = !!p.draft;
    const ink = C.neel;
    const hair = 0.75 / Math.max(1, k * 0.5);
    const at = (c2: number, r2: number) => (c2 < 0 || r2 < 0 || c2 >= f.C || r2 >= f.R ? -1 : f.at[r2 * f.C + c2]);
    const P = (x2: number, y2: number, z: number) => this.W(x2, y2, z);
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    };
    const pat = (n: string) => (draft ? null : this.pattern(n));
    const PAT: Partial<Record<Kind, string>> = {
      [K.cropA]: "a",
      [K.cropB]: "b",
      [K.river]: "waves",
      [K.flood]: "flood",
      [K.seen]: "seen",
      [K.bare]: "dots",
      [K.wetland]: "reeds",
      [K.bank]: "bank",
    };
    const unitW = this.hw * 0.085; // sprite units to world px
    const ground = m.ground;

    // One side face, from height hi down to lo, split where water meets the ground.
    const side = (x0: number, y0: number, x1: number, y1: number, hi: number, lo: number, i: number, shade: number, front: boolean) => {
      if (hi <= lo + 0.01) return;
      const kd = kind[i] as Kind;
      const g = kd === K.bank ? ground[i] + CREST_M : kd === K.breach ? ground[i] - SCOUR_M : ground[i];
      const bands: [number, number, string][] = [];
      if (WATERY(kd) && hi > g) {
        bands.push([hi, Math.max(lo, g), mix(TOP[kd], C.neel, shade)]);
        hi = Math.max(lo, g);
      }
      if (hi > lo + 0.01) {
        // the cell's own colour for its top half metre, then soil
        const band = Math.min(hi, Math.max(lo, hi - (front ? 0.5 : 99)));
        const own = kd === K.bank || kd === K.breach ? TOP[kd] : WATERY(kd) || kd === K.seen ? C.mittiTint : TOP[kd];
        bands.push([hi, band, mix(own, C.neel, shade)]);
        if (band > lo + 0.01) bands.push([band, lo, mix(SOIL, C.neel, shade * 0.6)]);
      }
      for (const [a, b, col] of bands) {
        quad(P(x0, y0, a), P(x1, y1, a), P(x1, y1, b), P(x0, y0, b));
        ctx.fillStyle = col;
        ctx.fill();
      }
      quad(P(x0, y0, bands[0][0]), P(x1, y1, bands[0][0]), P(x1, y1, lo), P(x0, y0, lo));
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = hair;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    for (let n = 0; n < f.order.length; n++) {
      const i = f.order[n];
      const c2 = f.cc[i];
      const r2 = f.rr[i];
      const h = top[i];
      const kd = kind[i] as Kind;
      const nl = at(c2, r2 + 1);
      const nr = at(c2 + 1, r2);
      const edgeL = nl < 0;
      const edgeR = nr < 0;
      side(c2, r2 + 1, c2 + 1, r2 + 1, h, edgeL ? this.zFloor : top[nl], i, 0.16, edgeL);
      side(c2 + 1, r2, c2 + 1, r2 + 1, h, edgeR ? this.zFloor : top[nr], i, 0.3, edgeR);

      // the top face
      const a = P(c2, r2, h);
      const b = P(c2 + 1, r2, h);
      const c = P(c2 + 1, r2 + 1, h);
      const d = P(c2, r2 + 1, h);
      quad(a, b, c, d);
      ctx.fillStyle = TOP[kd];
      ctx.fill();
      const pn = PAT[kd];
      const pp = pn ? pat(pn) : null;
      if (pp) {
        ctx.fillStyle = pp;
        ctx.fill();
      }
      // ink where one surface meets another: field boundaries, shores, the bank
      const nb = at(c2, r2 - 1);
      const nlft = at(c2 - 1, r2);
      const crop = (x: number) => x === K.cropA || x === K.cropB;
      // 2: a strong line (a different kind of ground), 1: a soft one (two fields), 0: none
      const edge = (j: number) => {
        if (j < 0) return 2;
        const kj = kind[j] as Kind;
        if (kj === kd || (WATERY(kj) && WATERY(kd))) return 0;
        return crop(kj) && crop(kd) ? 1 : 2;
      };
      const ends: [number[], number[], number][] = [
        [a, b, edge(nb)],
        [a, d, edge(nlft)],
        [b, c, edge(nr)],
        [d, c, edge(nl)],
      ];
      for (const strength of [1, 2]) {
        ctx.beginPath();
        let any = false;
        for (const [p0, p1, e] of ends)
          if (e === strength) {
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
            any = true;
          }
        if (!any) continue;
        ctx.strokeStyle = ink;
        ctx.globalAlpha = strength === 1 ? 0.18 : WATERY(kd) ? 0.35 : 0.55;
        ctx.lineWidth = hair * 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (draft) continue;
      // ---- what stands on the cell ----
      const cx = (a[0] + c[0]) / 2;
      const cy = (a[1] + c[1]) / 2;
      const g = ground[i];
      const under = WATERY(kd) ? h - g : 0; // water over the ground here, in metres
      const hv = hash(i);
      const stand = (kindName: string, v: number, ox: number, oy: number, u: number, flip = false) => {
        const x = cx + ox * this.hw;
        const yFoot = cy + oy * this.hh + under * this.zk;
        if (under > 0.05) {
          // standing in water: hide what's under the surface, then a ripple at the waterline
          const yWater = cy + oy * this.hh;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x - this.hw * 3, yWater - this.hw * 8, this.hw * 6, this.hw * 8);
          ctx.clip();
          drawSpriteAt(ctx, kindName, v, x, yFoot, u, k, flip);
          ctx.restore();
          ctx.beginPath();
          ctx.ellipse(x, yWater, this.hw * 0.42, this.hh * 0.32, 0, 0, Math.PI * 2);
          ctx.strokeStyle = C.white;
          ctx.lineWidth = hair * 1.6;
          ctx.stroke();
        } else drawSpriteAt(ctx, kindName, v, x, yFoot, u, k, flip);
      };
      if (kd === K.river) {
        if (hv < 0.09) drawSpriteAt(ctx, "fish", 0, cx, cy, unitW * 0.75, k, hv < 0.045);
        continue;
      }
      const base = m.cls[i];
      if (base === CLS.trees) {
        const v = Math.floor(hv * 100);
        const kn = hv < 0.62 ? "mango" : hv < 0.85 ? "taad" : "bamboo";
        stand(kn, v, -0.18 + hash(i + 3) * 0.36, -0.1, unitW * 0.95, hv > 0.5);
        if (hash(i + 11) < 0.35) stand("mango", v + 1, 0.42, 0.3, unitW * 0.7);
      } else if (base === CLS.built || m.built[i] >= 25) {
        const n2 = m.built[i] >= 60 ? 3 : m.built[i] >= 35 ? 2 : 1;
        const spots: [number, number][] = [
          [-0.25, -0.1],
          [0.3, 0.12],
          [-0.05, 0.42],
        ];
        for (let s = 0; s < n2; s++) stand("hut", s + Math.floor(hv * 10), spots[s][0], spots[s][1], unitW * 0.62, s % 2 === 1);
      } else if ((kd === K.cropA || kd === K.cropB) && hv < 0.06) {
        stand("taad", 1, 0.3, 0.2, unitW * 0.8);
      }
    }

    // the front of the slab: soil strata, like the cross-section of a bank
    if (!draft) this.strata(ctx, f);

    // kilometre stones on the right bank
    if (!draft)
      for (const s of m.stones) {
        const [x2, y2] = this.rotPt(s.x, s.y);
        const [x, y] = this.W(x2, y2, top[s.cell] + 0.1);
        drawSpriteAt(ctx, "stone", 0, x, y, unitW * 0.75, k);
      }

    // the gauge: a painted staff standing in the river
    if (!draft) {
      const gi = m.gauge;
      const gx = (gi % m.C) + 0.2;
      const gy = Math.floor(gi / m.C) + 0.5;
      const [x2, y2] = this.rotPt(gx, gy);
      const [x, y] = this.W(x2, y2, top[gi]);
      drawSpriteAt(ctx, "staff", 0, x, y, unitW * 0.9, k);
    }

    // camps: on the highest dry ground near each village
    if (p.camps && !draft)
      for (const v of m.villages) {
        if (!v.camp) continue;
        const i = v.camp.cell;
        const [x2, y2] = this.rotPt((i % m.C) + 0.5, Math.floor(i / m.C) + 0.5);
        const [x, y] = this.W(x2, y2, top[i]);
        drawSpriteAt(ctx, "tent", 0, x, y, unitW * 1.05, k);
      }

    // clouds over the cells the satellite couldn't see through
    if (p.observed && !draft) {
      for (let i = 0; i < m.N; i++) {
        if (m.s2cloud[i] <= 50) continue;
        const r = Math.floor(i / m.C);
        const c = i % m.C;
        if (!((r % 7 === 2 && c % 8 === 3) || (r % 7 === 5 && c % 8 === 7))) continue;
        const [x2, y2] = this.rotPt(c + 0.5, r + 0.5);
        const [x, y] = this.W(x2, y2, this.zTop + 2.2);
        ctx.globalAlpha = 0.92;
        drawSpriteAt(ctx, "cloud", 0, x, y, unitW * 0.72, k, (r + c) % 2 === 0);
        ctx.globalAlpha = 1;
      }
    }
  }

  /** Strata lines and pebbles on the two front faces of the slab. */
  private strata(ctx: CanvasRenderingContext2D, f: RotFrame) {
    const lines = [this.zBase - 1.1, this.zBase - 2.3];
    ctx.strokeStyle = C.mittiTint;
    ctx.lineWidth = Math.max(0.6, this.hw * 0.12);
    ctx.setLineDash([this.hw * 0.9, this.hw * 0.5]);
    ctx.beginPath();
    for (const z of lines) {
      const a = this.W(0, f.R, z);
      const b = this.W(f.C, f.R, z);
      const c = this.W(f.C, 0, z);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // the slab's outline in ink
    const a = this.W(0, f.R, this.zFloor);
    const b = this.W(f.C, f.R, this.zFloor);
    const c = this.W(f.C, 0, this.zFloor);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(c[0], c[1]);
    ctx.strokeStyle = C.neel;
    ctx.lineWidth = Math.max(1.2, this.hw * 0.22);
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  // ---------------- each frame ----------------

  /** Copies the bitmap into the view. The caller draws what moves on top. */
  blit(): CanvasRenderingContext2D {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.painted) return ctx;
    const [cx, cy] = this.centre();
    const s = this.zoom * this.dpr;
    const dx = ((this.box.x - cx) * this.zoom + this.cssW / 2 + this.panX) * this.dpr;
    const dy = ((this.box.y - cy) * this.zoom + this.cssH / 2 + this.panY) * this.dpr;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.cache, dx, dy, this.box.w * s, this.box.h * s);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return ctx;
  }

  /** Repaints at the current zoom if the bitmap is too soft or too large for it. */
  sharpen(): boolean {
    if (!this.painted) return false;
    const before = this.cacheK;
    this.paint(this.painted);
    return this.cacheK !== before;
  }

  /** The cell under (x, y) CSS px, its top or one of its walls, front-most first; -1 if none. */
  pick(x: number, y: number): number {
    const f = this.frames[this.rot];
    const at = (c2: number, r2: number) => (c2 < 0 || r2 < 0 || c2 >= f.C || r2 >= f.R ? -1 : f.at[r2 * f.C + c2]);
    const [cx, cy] = this.centre();
    const S = (x2: number, y2: number, z: number): [number, number] => {
      const [wx, wy] = this.W(x2, y2, z);
      return [(wx - cx) * this.zoom + this.cssW / 2 + this.panX, (wy - cy) * this.zoom + this.cssH / 2 + this.panY];
    };
    for (let n = f.order.length - 1; n >= 0; n--) {
      const i = f.order[n];
      const c2 = f.cc[i];
      const r2 = f.rr[i];
      const h = this.top[i];
      const nl = at(c2, r2 + 1);
      const nr = at(c2 + 1, r2);
      const hl = nl < 0 ? this.zFloor : this.top[nl];
      const hr = nr < 0 ? this.zFloor : this.top[nr];
      if (inside([S(c2, r2, h), S(c2 + 1, r2, h), S(c2 + 1, r2 + 1, h), S(c2, r2 + 1, h)], x, y)) return i;
      if (h > hl && inside([S(c2, r2 + 1, h), S(c2 + 1, r2 + 1, h), S(c2 + 1, r2 + 1, hl), S(c2, r2 + 1, hl)], x, y)) return i;
      if (h > hr && inside([S(c2 + 1, r2, h), S(c2 + 1, r2 + 1, h), S(c2 + 1, r2 + 1, hr), S(c2 + 1, r2, hr)], x, y)) return i;
    }
    return -1;
  }

  /** Clamps the pan so some of the diorama always stays on screen. */
  clampPan(): void {
    const f = this.frames[this.rot];
    const w = (f.C + f.R) * this.hw * this.zoom;
    const h = (f.C + f.R) * this.hh * this.zoom;
    const mx = Math.max(0, w / 2 - this.cssW * 0.2) + this.cssW * 0.1;
    const my = Math.max(0, h / 2 - this.cssH * 0.2) + this.cssH * 0.1;
    this.panX = Math.max(-mx, Math.min(mx, this.panX));
    this.panY = Math.max(-my, Math.min(my, this.panY));
  }

  /** Pans so that grid point (x, y) sits at the canvas centre. */
  centreOn(x: number, y: number): void {
    const c = Math.min(this.m.C - 1, Math.max(0, Math.floor(x)));
    const r = Math.min(this.m.R - 1, Math.max(0, Math.floor(y)));
    const [sx, sy] = this.project(x, y, this.top[r * this.m.C + c] || this.m.ground[r * this.m.C + c]);
    this.panX += this.cssW / 2 - sx;
    this.panY += this.cssH / 2 - sy;
    this.clampPan();
  }

  /** Zooms by factor about the CSS point (x, y). */
  zoomAt(factor: number, x: number, y: number, min = 0.8, max = 6): void {
    const z = Math.max(min, Math.min(max, this.zoom * factor));
    const k = z / this.zoom;
    this.panX = (this.panX + this.cssW / 2 - x) * k + x - this.cssW / 2;
    this.panY = (this.panY + this.cssH / 2 - y) * k + y - this.cssH / 2;
    this.zoom = z;
    this.clampPan();
  }

  setRot(r: Rot): void {
    this.rot = r;
    this.cacheK = 0;
    this.paintedKey = "";
    this.cssW = 0; // recompute the fit for the rotated frame
    this.resize();
    if (this.painted) this.paint(this.painted, true);
  }
}

function inside(pts: [number, number][], x: number, y: number): boolean {
  let ok = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
