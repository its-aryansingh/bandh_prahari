// The live map's model: the 56 x 46 grid from AWS Open Data (web/mock/map.haijalpur.json,
// built by tools/build_map.py) turned into what the map needs: the ground, the river's
// channel, both embankments with our kilometre stones, the villages and their camps.
// Plain arithmetic on the grid: it runs in the browser in a few milliseconds, and the
// same steps can run in the daily Lambda.
import type { MapGrid, Village } from "../types";

/** ESA WorldCover classes used on the map. */
export const CLS = { trees: 10, grass: 30, crop: 40, built: 50, bare: 60, water: 80, wetland: 90 } as const;

/** Assumed height of the embankment crest above the ground beside it, in metres. The pilot uses BEAMS crest levels. */
export const CREST_M = 4;
/** Each embankment is drawn this many cells (about 830 m) from the channel's centre line. Approximate. */
export const EMB_OFFSET = 4.2;
/** A breach scours below the ground beside it, in metres. */
export const SCOUR_M = 1;

/** A point on the grid: x = column + 0.5, y = row + 0.5 at the centre of a cell. */
export type Pt = [number, number];

export interface Line {
  pts: Pt[];
  /** Arc length at each point, in cells. */
  acc: number[];
  /** The 4-connected cells the line passes through, in order. */
  cells: number[];
}

export interface Stone {
  km: number;
  x: number;
  y: number;
  cell: number;
}

export interface Camp {
  name_hi: string;
  name_en: string;
  cell: number;
  ground: number;
}

export interface MapVillage {
  key: string;
  name_hi: string;
  name_en: string;
  cell: number;
  cells: number[];
  ward: number;
  households: number;
  camp: Camp | null;
  approx: boolean;
}

export const SIDE = { far: -1, corridor: 0, saran: 1 } as const;

export interface Model {
  R: number;
  C: number;
  N: number;
  cellKm: number;
  bbox: [number, number, number, number];
  dsm: Float32Array;
  /** The DEM with tree and roof cells brought down to the fields around them. */
  ground: Float32Array;
  cls: Uint8Array;
  built: Uint8Array;
  s2: { id: string; date: string; cloud_cover: number } | null;
  s2water: Uint8Array;
  s2cloud: Uint8Array;
  s1: { id: string; date: string } | null;
  s1water: Uint8Array;
  /** 1 where the cell is the river's main channel. */
  channel: Uint8Array;
  centre: Pt[];
  /** Kilometres along the river from the top of the map, for every cell. */
  along: Float32Array;
  /** Slope of the river's surface, metres per kilometre (negative downstream), from the DEM's own river cells. */
  slope: number;
  rb: Line;
  lb: Line;
  /** 1 on the right (Saran) embankment, 2 on the left one. */
  emb: Uint8Array;
  side: Int8Array;
  /** km at a distance along the right embankment (cells). */
  kmAt: (s: number) => number;
  /** Point on the right embankment at a km mark. */
  pointAtKm: (km: number) => Pt;
  kmRange: [number, number];
  stones: Stone[];
  villages: MapVillage[];
  gauge: number;
  gaugeAlong: number;
  zMin: number;
  zMax: number;
}

export const idx = (m: { C: number }, r: number, c: number) => r * m.C + c;
export const rowOf = (m: { C: number }, i: number) => Math.floor(i / m.C);
export const colOf = (m: { C: number }, i: number) => i % m.C;

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/** Cell centre to latitude and longitude. */
export function cellLatLon(m: Model, i: number): [number, number] {
  const [W, S, E, N] = m.bbox;
  const r = rowOf(m, i);
  const c = colOf(m, i);
  return [N - ((r + 0.5) * (N - S)) / m.R, W + ((c + 0.5) * (E - W)) / m.C];
}

/** Latitude and longitude to the cell that holds it, or -1 outside the map. */
export function latLonCell(m: Pick<Model, "bbox" | "R" | "C">, lat: number, lon: number): number {
  const [W, S, E, N] = m.bbox;
  const r = Math.floor(((N - lat) / (N - S)) * m.R);
  const c = Math.floor(((lon - W) / (E - W)) * m.C);
  if (r < 0 || r >= m.R || c < 0 || c >= m.C) return -1;
  return r * m.C + c;
}

/** Grid point (x = col + 0.5) to latitude and longitude. */
export function ptLatLon(m: Model, p: Pt): [number, number] {
  const [W, S, E, N] = m.bbox;
  return [N - (p[1] * (N - S)) / m.R, W + (p[0] * (E - W)) / m.C];
}

/** Cells along a polyline, 4-connected, so water can't slip through a diagonal gap. */
function rasterize(pts: Pt[], R: number, C: number): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  let last: [number, number] | null = null;
  const add = (r: number, c: number) => {
    if (r < 0 || r >= R || c < 0 || c >= C) return;
    const i = r * C + c;
    if (!seen.has(i)) {
      seen.add(i);
      out.push(i);
    }
  };
  for (let k = 0; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k];
    const [x1, y1] = pts[k + 1];
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 8) + 1;
    for (let s = 0; s <= n; s++) {
      const x = x0 + ((x1 - x0) * s) / n;
      const y = y0 + ((y1 - y0) * s) / n;
      const c = Math.floor(x);
      const r = Math.floor(y);
      if (last && (last[0] !== r || last[1] !== c)) {
        if (last[0] !== r && last[1] !== c) add(r, last[1]); // close the diagonal
      }
      if (!last || last[0] !== r || last[1] !== c) {
        add(r, c);
        last = [r, c];
      }
    }
  }
  return out;
}

function arc(pts: Pt[]): number[] {
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return acc;
}

function pointAt(pts: Pt[], acc: number[], s: number): Pt {
  if (s <= 0) return pts[0];
  for (let k = 1; k < pts.length; k++) {
    if (s <= acc[k]) {
      const t = (s - acc[k - 1]) / (acc[k] - acc[k - 1] || 1);
      return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t];
    }
  }
  return pts[pts.length - 1];
}

/** Extends a line beyond both ends so it leaves the map. */
function extend(pts: Pt[]): Pt[] {
  const a = pts[0];
  const b = pts[Math.min(3, pts.length - 1)];
  const y = pts[pts.length - 1];
  const z = pts[Math.max(0, pts.length - 4)];
  return [[a[0] + (a[0] - b[0]) * 2, a[1] + (a[1] - b[1]) * 2], ...pts, [y[0] + (y[0] - z[0]) * 2, y[1] + (y[1] - z[1]) * 2]];
}

/**
 * Builds the model. `villages` come from GET /stretch; those with lat/lon get a place on the map.
 * `kmAnchor` pins our kilometre count: the right-bank point level with this grid row is km 14.
 */
export function buildModel(g: MapGrid, villages: Village[], kmAnchor = { row: 24, km: 14 }): Model {
  const R = g.rows;
  const C = g.cols;
  const N = R * C;
  const cellKm = g.cell_m / 1000;
  const dsm = Float32Array.from(g.elev_dm, (v) => v / 10);
  const cls = Uint8Array.from(g.cls);
  const built = Uint8Array.from(g.built);
  const I = (r: number, c: number) => r * C + c;

  // ---- ground: the DEM is a surface model, so trees and roofs read high ----
  const ground = Float32Array.from(dsm);
  const open = (i: number) => (cls[i] === 30 || cls[i] === 40 || cls[i] === 60 || cls[i] === 90) && built[i] < 25;
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const i = I(r, c);
      if (!(cls[i] === CLS.trees || cls[i] === CLS.built || built[i] >= 25)) continue;
      const vals: number[] = [];
      for (let rr = Math.max(0, r - 2); rr <= Math.min(R - 1, r + 2); rr++)
        for (let cc = Math.max(0, c - 2); cc <= Math.min(C - 1, c + 2); cc++) if (open(I(rr, cc))) vals.push(dsm[I(rr, cc)]);
      if (vals.length >= 3) ground[i] = Math.min(dsm[i], median(vals));
    }

  // ---- the main channel: follow the river's water cells from the top row down ----
  const runsIn = (r: number) => {
    const runs: number[][] = [];
    let cur: number[] = [];
    for (let c = 0; c < C; c++) {
      if (cls[I(r, c)] === CLS.water) cur.push(c);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
    return runs;
  };
  const first = runsIn(0).sort((a, b) => b.length - a.length)[0];
  let prev = first ? (first[0] + first[first.length - 1]) / 2 : C / 2;
  const raw: number[] = [];
  const channel = new Uint8Array(N);
  for (let r = 0; r < R; r++) {
    const near = runsIn(r)
      .map((run) => run.filter((c) => Math.abs(c - prev) <= 4.5))
      .filter((run) => run.length > 0);
    if (!near.length) {
      raw.push(prev);
      continue;
    }
    // contiguous pieces only
    const pieces: number[][] = [];
    for (const run of near) {
      let cur = [run[0]];
      for (let k = 1; k < run.length; k++) {
        if (run[k] === cur[cur.length - 1] + 1) cur.push(run[k]);
        else {
          pieces.push(cur);
          cur = [run[k]];
        }
      }
      pieces.push(cur);
    }
    const best = pieces.sort((a, b) => Math.abs((a[0] + a[a.length - 1]) / 2 - prev) - Math.abs((b[0] + b[b.length - 1]) / 2 - prev))[0];
    best.forEach((c) => (channel[I(r, c)] = 1));
    prev = (best[0] + best[best.length - 1]) / 2;
    raw.push(prev);
  }
  // water cells touching the channel and close to it are channel too (the wide reaches)
  for (let pass = 0; pass < 3; pass++)
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++) {
        const i = I(r, c);
        if (channel[i] || cls[i] !== CLS.water || Math.abs(c - raw[r]) > 6) continue;
        if ((c > 0 && channel[i - 1]) || (c < C - 1 && channel[i + 1]) || (r > 0 && channel[i - C]) || (r < R - 1 && channel[i + C])) channel[i] = 1;
      }
  const smooth = raw.map((_, r) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, r - 3); k <= Math.min(R - 1, r + 3); k++) {
      s += raw[k];
      n++;
    }
    return s / n;
  });
  const centre: Pt[] = smooth.map((c, r) => [c + 0.5, r + 0.5]);
  const tangent = (k: number): Pt => {
    const a = centre[Math.max(0, k - 2)];
    const b = centre[Math.min(R - 1, k + 2)];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  };
  // Facing downstream (rows increase), the right hand points to the right bank: (-ty, tx).
  const normal = (k: number): Pt => {
    const t = tangent(k);
    return [-t[1], t[0]];
  };
  const offset = (d: number): Pt[] => centre.map((p, k) => [p[0] + normal(k)[0] * d, p[1] + normal(k)[1] * d]);
  const rbPts = extend(offset(EMB_OFFSET));
  const lbPts = extend(offset(-EMB_OFFSET));
  const rb: Line = { pts: rbPts, acc: arc(rbPts), cells: rasterize(rbPts, R, C) };
  const lb: Line = { pts: lbPts, acc: arc(lbPts), cells: rasterize(lbPts, R, C) };
  const emb = new Uint8Array(N);
  lb.cells.forEach((i) => (emb[i] = 2));
  rb.cells.forEach((i) => (emb[i] = 1));
  // where our approximate line crosses water, the bank wins: a gap would let the fill leak through
  for (let i = 0; i < N; i++) if (emb[i] && channel[i]) channel[i] = 0;

  // ---- along the river, and which side of it each cell is on ----
  const cacc = arc(centre);
  const along = new Float32Array(N);
  const side = new Int8Array(N);
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const x = c + 0.5;
      const y = r + 0.5;
      let best = 0;
      let bd = Infinity;
      for (let k = Math.max(0, r - 10); k <= Math.min(R - 1, r + 10); k++) {
        const d = (centre[k][0] - x) ** 2 + (centre[k][1] - y) ** 2;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      const t = tangent(best);
      const n = normal(best);
      const dx = x - centre[best][0];
      const dy = y - centre[best][1];
      along[I(r, c)] = (cacc[best] + dx * t[0] + dy * t[1]) * cellKm;
      const s = dx * n[0] + dy * n[1];
      side[I(r, c)] = s > EMB_OFFSET ? SIDE.saran : s < -EMB_OFFSET ? SIDE.far : SIDE.corridor;
    }
  for (let i = 0; i < N; i++) if (emb[i]) side[i] = SIDE.corridor;

  // ---- the river's surface slope, from the DEM's own channel cells ----
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (!channel[i]) continue;
    sx += along[i];
    sy += dsm[i];
    sxx += along[i] * along[i];
    sxy += along[i] * dsm[i];
    n++;
  }
  const fit = n > 10 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : -0.2;
  const slope = Number.isFinite(fit) ? Math.max(-0.4, Math.min(-0.02, fit)) : -0.2;

  // ---- our kilometre count along the right embankment ----
  const anchorS = rb.acc[Math.min(rb.pts.length - 1, kmAnchor.row + 1)]; // +1: the extension point
  const k0 = kmAnchor.km - anchorS * cellKm;
  const kmAt = (s: number) => k0 + s * cellKm;
  const pointAtKm = (km: number) => pointAt(rb.pts, rb.acc, (km - k0) / cellKm);
  const inside = (p: Pt) => p[0] >= 0 && p[0] < C && p[1] >= 0 && p[1] < R;
  const stones: Stone[] = [];
  const kmFrom = Math.ceil(kmAt(0));
  const kmTo = Math.floor(kmAt(rb.acc[rb.acc.length - 1]));
  let lo = Infinity;
  let hi = -Infinity;
  for (let km = kmFrom; km <= kmTo; km++) {
    const p = pointAtKm(km);
    if (!inside(p)) continue;
    lo = Math.min(lo, km);
    hi = Math.max(hi, km);
    stones.push({ km, x: p[0], y: p[1], cell: I(Math.floor(p[1]), Math.floor(p[0])) });
  }

  // ---- the gauge: on the channel near the top, at its right-bank edge (approximate) ----
  let gauge = -1;
  for (let r = 3; r < R && gauge < 0; r++) {
    let bestC = -1;
    for (let c = 0; c < C; c++) if (channel[I(r, c)] && (bestC < 0 || c < bestC)) bestC = c;
    if (bestC >= 0) gauge = I(r, bestC);
  }
  if (gauge < 0) gauge = 0;

  // ---- villages: around their approximate centres, on built-up cells ----
  const mapVillages: MapVillage[] = [];
  for (const v of villages) {
    if (!v.on_stretch || v.lat == null || v.lon == null) continue;
    const cell = latLonCell({ bbox: g.bbox, R, C }, v.lat, v.lon);
    if (cell < 0) continue;
    const r0 = Math.floor(cell / C);
    const c0 = cell % C;
    const near: { i: number; d: number }[] = [];
    for (let r = Math.max(0, r0 - 4); r <= Math.min(R - 1, r0 + 4); r++)
      for (let c = Math.max(0, c0 - 4); c <= Math.min(C - 1, c0 + 4); c++) {
        const i = I(r, c);
        const d = Math.hypot(r - r0, c - c0);
        if (d <= 3.2 && built[i] >= 8 && !emb[i] && !channel[i]) near.push({ i, d });
      }
    near.sort((a, b) => a.d - b.d);
    const cells = Array.from(new Set([cell, ...near.slice(0, 14).map((x) => x.i)]));
    // the camp: the highest dry ground within about 1.6 km, on the same side, off the bank
    let camp: Camp | null = null;
    let bestScore = -Infinity;
    for (let r = Math.max(0, r0 - 8); r <= Math.min(R - 1, r0 + 8); r++)
      for (let c = Math.max(0, c0 - 8); c <= Math.min(C - 1, c0 + 8); c++) {
        const i = I(r, c);
        const d = Math.hypot(r - r0, c - c0);
        if (d > 8 || d < 1.5 || cls[i] === CLS.water || emb[i] || side[i] !== side[cell]) continue;
        const score = ground[i] - d * 0.02;
        if (score > bestScore) {
          bestScore = score;
          camp = { name_hi: v.relief_camp_hi ?? "शिविर", name_en: v.relief_camp_en ?? "Camp", cell: i, ground: ground[i] };
        }
      }
    mapVillages.push({
      key: v.name,
      name_hi: v.name_hi,
      name_en: v.name,
      cell,
      cells,
      ward: v.wards[0]?.ward ?? 0,
      households: v.wards.reduce((a, w) => a + w.households, 0),
      camp,
      approx: v.approx !== false,
    });
  }

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < N; i++) {
    zMin = Math.min(zMin, ground[i]);
    zMax = Math.max(zMax, ground[i] + (emb[i] ? CREST_M : 0));
  }

  const s2 = g.s2;
  const s1 = g.s1 ?? null;
  return {
    R,
    C,
    N,
    cellKm,
    bbox: g.bbox,
    dsm,
    ground,
    cls,
    built,
    s2: s2 ? { id: s2.id, date: s2.date, cloud_cover: s2.cloud_cover ?? 0 } : null,
    s2water: Uint8Array.from(s2?.water ?? new Array(N).fill(0)),
    s2cloud: Uint8Array.from(s2?.cloud ?? new Array(N).fill(0)),
    s1: s1 ? { id: s1.id, date: s1.date } : null,
    s1water: Uint8Array.from(s1?.water ?? new Array(N).fill(0)),
    channel,
    centre,
    along,
    slope,
    rb,
    lb,
    emb,
    side,
    kmAt,
    pointAtKm,
    kmRange: [lo, hi],
    stones,
    villages: mapVillages,
    gauge,
    gaugeAlong: along[gauge],
    zMin,
    zMax,
  };
}
