// "What if the river rises": for every cell, the lowest reading at the Rewaghat gauge at
// which river water can reach it. Water starts in the channel and spreads only to
// connected cells lower than its surface; the embankments stop it unless the bank is
// breached. The surface falls downstream with the river's own slope. One pass of a
// minimax Dijkstra gives every cell's threshold, so the slider answers instantly.
// This is a rough sketch, not a hydraulic model; the page says so.
import { CREST_M, SCOUR_M, type Model, type Pt } from "./model";

export interface Flood {
  breachKm: number | null;
  breach: Set<number>;
  /** Lowest gauge reading (m) at which the cell holds river water. */
  thr: Float32Array;
  /** 0..1: the order in which water reaches the cell, for the spreading animation. */
  order: Float32Array;
}

/** The water surface at cell i when the gauge reads `level`. */
export const wse = (m: Model, i: number, level: number) => level + m.slope * (m.along[i] - m.gaugeAlong);

/** Height of what water has to get over at cell i: the ground, the crest, or the scoured gap. */
export function topAt(m: Model, i: number, breach: Set<number>): number {
  if (breach.has(i)) return m.ground[i] - SCOUR_M;
  if (m.emb[i]) return m.ground[i] + CREST_M;
  return m.ground[i];
}

/** Cells of the right embankment opened by a breach at `km` (two or three cells, so the gap is real). */
export function breachCells(m: Model, km: number): Set<number> {
  const p: Pt = m.pointAtKm(km);
  const cells = m.rb.cells
    .map((i) => ({ i, d: Math.hypot((i % m.C) + 0.5 - p[0], Math.floor(i / m.C) + 0.5 - p[1]) }))
    .sort((a, b) => a.d - b.d)
    .filter((x, k) => k < 2 || x.d < 1.3)
    .slice(0, 3)
    .map((x) => x.i);
  return new Set(cells);
}

class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]];
      [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const k = this.k;
    const v = this.v;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < k.length && k[l] < k[s]) s = l;
        if (r < k.length && k[r] < k[s]) s = r;
        if (s === i) break;
        [k[s], k[i]] = [k[i], k[s]];
        [v[s], v[i]] = [v[i], v[s]];
        i = s;
      }
    }
    return top;
  }
}

export function computeFlood(m: Model, breachKm: number | null): Flood {
  const { N, C, R } = m;
  const breach = breachKm == null ? new Set<number>() : breachCells(m, breachKm);
  const thr = new Float32Array(N).fill(Infinity);
  const order = new Float32Array(N).fill(1);
  const done = new Uint8Array(N);
  const heap = new Heap();
  // What a reading must beat at cell i, given the surface falls downstream.
  const need = (i: number) => topAt(m, i, breach) - m.slope * (m.along[i] - m.gaugeAlong);
  for (let i = 0; i < N; i++) {
    if (m.channel[i]) {
      thr[i] = -Infinity;
      heap.push(-Infinity, i);
    }
  }
  let popped = 0;
  while (heap.size) {
    const [t, i] = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    order[i] = popped++;
    const r = Math.floor(i / C);
    const c = i % C;
    const nb = [r > 0 ? i - C : -1, r < R - 1 ? i + C : -1, c > 0 ? i - 1 : -1, c < C - 1 ? i + 1 : -1];
    for (const j of nb) {
      if (j < 0 || done[j]) continue;
      const tj = Math.max(t, need(j));
      if (tj < thr[j]) {
        thr[j] = tj;
        heap.push(tj, j);
      }
    }
  }
  for (let i = 0; i < N; i++) order[i] = popped ? order[i] / popped : 1;
  return { breachKm, breach, thr, order };
}

/** Is cell i under river water at this reading? */
export const wet = (f: Flood, i: number, level: number) => f.thr[i] < level;

/** Depth of river water at cell i (m), 0 if dry. */
export function depthAt(m: Model, f: Flood, i: number, level: number): number {
  if (!(f.thr[i] < level)) return 0;
  return Math.max(0, wse(m, i, level) - m.ground[i]);
}

export interface VillageRisk {
  wetCells: number;
  cells: number;
  /** Reading at which half the village's cells take water. Infinity if never. */
  under: number;
  maxDepth: number;
}

export function villageRisk(m: Model, f: Flood, cells: number[], level: number): VillageRisk {
  const t = cells.map((i) => f.thr[i]).sort((a, b) => a - b);
  const under = t[Math.floor((t.length - 1) / 2)];
  let wetCells = 0;
  let maxDepth = 0;
  for (const i of cells) {
    const d = depthAt(m, f, i, level);
    if (f.thr[i] < level) wetCells++;
    maxDepth = Math.max(maxDepth, d);
  }
  return { wetCells, cells: cells.length, under, maxDepth };
}

/** Area (km²) of the Saran side under water at this reading. */
export function saranWetKm2(m: Model, f: Flood, level: number): number {
  let n = 0;
  for (let i = 0; i < m.N; i++) if (m.side[i] === 1 && f.thr[i] < level) n++;
  return n * m.cellKm * m.cellKm;
}

/**
 * Shortest path on the grid (8 directions, no cutting corners) from `from` to the first
 * cell where `isTarget` holds, through cells where `ok` holds. Returns the cells, or null.
 */
export function shortestPath(
  m: Model,
  from: number,
  isTarget: (i: number) => boolean,
  ok: (i: number) => boolean,
  cost: (i: number) => number = () => 1,
): number[] | null {
  const { N, C, R } = m;
  const dist = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const heap = new Heap();
  dist[from] = 0;
  heap.push(0, from);
  while (heap.size) {
    const [d, i] = heap.pop();
    if (done[i]) continue;
    done[i] = 1;
    if (i !== from && isTarget(i)) {
      const path = [i];
      let k = i;
      while (prev[k] >= 0) {
        k = prev[k];
        path.push(k);
      }
      return path.reverse();
    }
    const r = Math.floor(i / C);
    const c = i % C;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
        const j = rr * C + cc;
        if (done[j] || !(ok(j) || isTarget(j))) continue;
        if (dr && dc && !(ok(r * C + cc) && ok(rr * C + c))) continue;
        const nd = d + (dr && dc ? Math.SQRT2 : 1) * cost(j);
        if (nd < dist[j]) {
          dist[j] = nd;
          prev[j] = i;
          heap.push(nd, j);
        }
      }
  }
  return null;
}

/** Length of a cell path in km. */
export function pathKm(m: Model, path: number[]): number {
  let s = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1];
    const b = path[k];
    s += Math.hypot((a % m.C) - (b % m.C), Math.floor(a / m.C) - Math.floor(b / m.C));
  }
  return s * m.cellKm;
}
