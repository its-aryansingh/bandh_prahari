// The live map in 3D: the same 200 m grid the 2D painting uses (Copernicus DEM ground, ESA
// WorldCover land, Sentinel-2 water, the gauge-driven flood), drawn with WebGL in the
// Madhubani manner: flat token colours, indigo ink edges, hatched fields, patterned water.
// Everything standing on it is real: 39k building footprints, roads, bridges and named
// places from the Overture Maps release on AWS Open Data, and trees from WorldCover's 10 m
// tree pixels. Nothing is placed at random.
//
// What moves is read every frame from the page's state: the river level, the breach, help
// requests, relief teams, open incidents and the patrol on each kilometre, night and dawn.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { C } from "../art/palette";
import { mix } from "../lib/motion";
import { CLS, CREST_M, SCOUR_M, type Model, type Pt } from "./model";
import { type Flood, wse } from "./flood";

/** Metres of height to world units. Ground relief here is about 11 m, so this exaggerates ~12x. */
const VZ = 0.12;
/** Houses are drawn at a readable height, not to vertical scale (footprints are to scale). */
const HOUSE_H = 0.07;
const TS = 24; // texture pixels per cell

export interface Features {
  size_m: [number, number];
  buildings: number[];
  roads: { c: string; p: number[] }[];
  infra: { k: string; p: number[] }[];
  places: { n: string; k: string | null; p: number[] }[];
  trees: number[];
}

export interface Paint3D {
  level: number;
  flood: Flood;
  observed: boolean;
  camps: boolean;
}

export interface Team3D {
  id: string;
  kind: "boat" | "sdrf" | "tractor";
  pos: Pt;
  heading: number;
  name: [string, string];
  selected: boolean;
  moving: boolean;
}
export interface Pin3D {
  id: string;
  cell: number;
  colour: string;
  mine: boolean;
}
export interface Beacon3D {
  id: string;
  km: number;
  priority: "P1" | "P2" | "P3";
  label: [string, string];
}
export interface Route3D {
  pts: Pt[];
  colour: string;
}
export interface State3D {
  lang: () => "hi" | "en" | "both";
  night: number;
  sun: number;
  breachKm: number | null;
  ringKm: number;
  teams: Team3D[];
  pins: Pin3D[];
  beacons: Beacon3D[];
  routes: Route3D[];
  /** km marks with an open incident, and its colour; others show the patrol as watched. */
  patrolAlarm: Map<number, string>;
  selCell: number | null;
  photo: boolean;
  villageCounts: Map<string, [number, number, number]> | null;
}

export type Pick3D =
  | { k: "cell"; i: number }
  | { k: "team"; id: string }
  | { k: "help"; id: string }
  | { k: "village"; key: string }
  | { k: "stone"; km: number }
  | { k: "gauge" }
  | { k: "place"; name: string; kind: string | null; cell: number };

const PUBLIC_PLACE = /school|learning|education|hospital|health|clinic|pharmacy|worship|temple|mosque|bridge/;

const hex = (s: string) => new THREE.Color(s);

export class View3D {
  readonly canvas: HTMLCanvasElement;
  private labels: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sunLight: THREE.DirectionalLight;
  private moonLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private lamps: THREE.PointLight[] = [];
  private top = new Float32Array(0);
  private ground = new Float32Array(0);
  private terrain = new THREE.Group();
  private topMesh: THREE.Mesh | null = null;
  private topCells: Int32Array = new Int32Array(0);
  private topTex: THREE.CanvasTexture | null = null;
  private photoTex: THREE.Texture | null = null;
  private waterShimmer: THREE.Mesh | null = null;
  private waveTex: THREE.CanvasTexture;
  private dynamic = new THREE.Group();
  private teamMeshes = new Map<string, THREE.Group>();
  private pinMeshes = new Map<string, THREE.Group>();
  private beaconMeshes = new Map<string, THREE.Group>();
  private patrol: { km: number; body: THREE.Mesh; ring: THREE.Mesh; lantern: THREE.Mesh }[] = [];
  private routeLines: THREE.Line[] = [];
  private routeKey = "";
  private selMesh: THREE.LineLoop;
  private ringMesh: THREE.Mesh;
  private breachMesh: THREE.Mesh;
  private places: { name: string; kind: string | null; x: number; z: number; cell: number }[] = [];
  private raf = 0;
  private last = performance.now();
  private running = false;
  private w = 1;
  private h = 1;
  private coarse: boolean;
  private focusTo: THREE.Vector3 | null = null;
  private distTo = 0;
  private hits: { x: number; y: number; r: number; pick: Pick3D }[] = [];
  private paintKey = "";
  private ray = new THREE.Raycaster();
  onFrame: (() => void) | null = null;
  /** Drawn on the label layer after the labels: the painting's border, the moon and sun. */
  afterLabels: ((g: CanvasRenderingContext2D, w: number, h: number, now: number) => void) | null = null;

  constructor(
    private m: Model,
    private stage: HTMLElement,
    private state: () => State3D,
    features: Features | null,
  ) {
    this.coarse = matchMedia("(pointer: coarse)").matches;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "lm-canvas3d";
    this.labels = document.createElement("canvas");
    this.labels.className = "lm-labels3d";
    this.lctx = this.labels.getContext("2d")!;
    stage.prepend(this.labels);
    stage.prepend(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.coarse, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(this.coarse ? 1.25 : 2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = !this.coarse;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = hex(C.chuna);
    this.scene.fog = new THREE.Fog(hex(C.chuna), 60, 140);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
    this.camera.position.set(-30, 34, 44);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 95;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.target.set(-3, 0.6, 2);
    // plain scroll keeps scrolling the page; zoom with Ctrl/Cmd + scroll, pinch, or the buttons
    this.controls.enableZoom = false;
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey || this.stage.closest(".lm.full"))) return;
        e.preventDefault();
        this.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      },
      { passive: false },
    );
    this.controls.addEventListener("start", () => {
      this.focusTo = null;
      this.distTo = 0;
    });

    // light: a warm sun from the south-east, the sky and the earth; at night, the moon and lamps
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe8d3a8, 1.9);
    this.scene.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xfff4e0, 1.35);
    this.sunLight.position.set(30, 46, 22);
    this.sunLight.castShadow = !this.coarse;
    const sc = this.sunLight.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.far = 140;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
    this.moonLight = new THREE.DirectionalLight(0x9fb4ff, 0);
    this.moonLight.position.set(-24, 40, -18);
    this.scene.add(this.moonLight);
    for (const v of m.villages.slice(0, 6)) {
      const p = new THREE.PointLight(0xffb347, 0, 9, 1.6);
      p.userData.cell = v.cell;
      this.lamps.push(p);
      this.scene.add(p);
    }

    this.waveTex = this.makeWaveTexture();
    this.scene.add(this.terrain);
    this.scene.add(this.dynamic);

    // selection outline, the seepage ring, the breach mark
    const sel = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1), new THREE.Vector3(0, 0, 1)]);
    this.selMesh = new THREE.LineLoop(sel, new THREE.LineBasicMaterial({ color: C.haldi }));
    this.selMesh.visible = false;
    this.dynamic.add(this.selMesh);
    this.ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40), new THREE.MeshBasicMaterial({ color: C.haldi, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.ringMesh.rotation.x = -Math.PI / 2;
    this.ringMesh.visible = false;
    this.dynamic.add(this.ringMesh);
    this.breachMesh = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: C.sindoor, side: THREE.DoubleSide }));
    this.breachMesh.rotation.x = -Math.PI / 2;
    this.breachMesh.visible = false;
    this.dynamic.add(this.breachMesh);

    this.ground = new Float32Array(m.N);
    for (let i = 0; i < m.N; i++) this.ground[i] = m.emb[i] ? m.ground[i] + CREST_M : m.ground[i];
    this.buildStones();
    if (features) this.buildFeatures(features);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(stage);
  }

  // ---------------- coordinates ----------------

  private Y(z: number) {
    return (z - (this.m.zMin - 1)) * VZ;
  }
  /** Grid point (column, row) to world x, z. */
  private wx(x: number) {
    return x - this.m.C / 2;
  }
  private wz(y: number) {
    return y - this.m.R / 2;
  }
  private cellAt(x: number, y: number) {
    const c = Math.min(this.m.C - 1, Math.max(0, Math.floor(x)));
    const r = Math.min(this.m.R - 1, Math.max(0, Math.floor(y)));
    return r * this.m.C + c;
  }
  /** World position standing on the drawn surface (water top where it's wet). */
  private onTop(p: Pt, lift = 0): THREE.Vector3 {
    const i = this.cellAt(p[0], p[1]);
    return new THREE.Vector3(this.wx(p[0]), this.Y(this.top[i] || this.ground[i]) + lift, this.wz(p[1]));
  }

  /** Screen position (CSS px) of a grid point, or null if behind the camera. */
  project(p: Pt, lift = 0): [number, number] | null {
    const v = this.onTop(p, lift).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return [((v.x + 1) / 2) * this.w, ((1 - v.y) / 2) * this.h];
  }

  // ---------------- the ground ----------------

  /** Rebuilds the ground and water for a reading, flood and layers, unless nothing changed. */
  private lastPaint: [Paint3D, boolean] | null = null;
  setPaint(p: Paint3D, photo: boolean): void {
    this.lastPaint = [p, photo];
    const key = `${p.level.toFixed(2)}|${p.flood.breachKm}|${p.observed}|${photo}`;
    if (key === this.paintKey) return;
    this.paintKey = key;
    const m = this.m;
    const top = new Float32Array(m.N);
    const kind = new Uint8Array(m.N); // 0 crop, 1 trees, 2 built, 3 grass/bare, 4 wetland, 5 river, 6 flood, 7 seen, 8 bank, 9 breach
    for (let i = 0; i < m.N; i++) {
      const g = m.ground[i];
      let k = 0;
      let t = g;
      if (p.flood.breach.has(i)) {
        k = 9;
        t = g - SCOUR_M;
      } else if (m.emb[i]) {
        k = 8;
        t = g + CREST_M;
      } else if (m.cls[i] === CLS.trees) k = 1;
      else if (m.cls[i] === CLS.built || m.built[i] >= 30) k = 2;
      else if (m.cls[i] === CLS.grass || m.cls[i] === CLS.bare) k = 3;
      else if (m.cls[i] === CLS.wetland) k = 4;
      const w = wse(m, i, p.level);
      if (m.channel[i]) {
        k = 5;
        t = Math.max(t, w, m.dsm[i]);
      } else if (p.flood.thr[i] < p.level && w > t) {
        k = 6;
        t = w;
      } else if (p.observed && m.s2water[i] > 50 && k !== 8) k = 7;
      kind[i] = k;
      top[i] = t;
    }
    this.top = top;
    this.buildTerrain(top, kind, photo);
  }

  private buildTerrain(top: Float32Array, kind: Uint8Array, photo: boolean) {
    const m = this.m;
    for (const o of [...this.terrain.children]) {
      this.terrain.remove(o);
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
    }
    const floor = this.Y(m.zMin - 3.6);
    const pos: number[] = [];
    const uv: number[] = [];
    const cells: number[] = [];
    const wpos: number[] = [];
    const wcol: number[] = [];
    const wnorm: number[] = [];
    const shim: number[] = [];
    const shimUv: number[] = [];
    const ink: number[] = [];
    const wallCol = (k: number, y: number, yTop: number) => {
      if (k === 5 || k === 6) return y > this.Y(m.zMin) - 0.01 && yTop - y < 0.5 ? hex(C.gandakDeep) : hex(C.mittiDeep);
      if (k === 8) return hex(C.mitti);
      return yTop - y < 0.06 ? hex(mix(TOPC[k], C.neel, 0.15)) : hex(C.mittiDeep);
    };
    const wall = (ax: number, az: number, bx: number, bz: number, yTop: number, yBot: number, k: number, nx: number, nz: number) => {
      if (yTop - yBot < 0.004) return;
      const ct = wallCol(k, yTop, yTop);
      const cb = hex(mix(C.mittiDeep, C.neel, 0.2));
      wpos.push(ax, yTop, az, bx, yTop, bz, bx, yBot, bz, ax, yTop, az, bx, yBot, bz, ax, yBot, az);
      for (const c of [ct, ct, cb, ct, cb, cb]) wcol.push(c.r, c.g, c.b);
      for (let n = 0; n < 6; n++) wnorm.push(nx, 0, nz);
      ink.push(ax, yTop, az, bx, yTop, bz);
    };
    for (let r = 0; r < m.R; r++)
      for (let c = 0; c < m.C; c++) {
        const i = r * m.C + c;
        const y = this.Y(top[i]);
        const x0 = this.wx(c);
        const x1 = this.wx(c + 1);
        const z0 = this.wz(r);
        const z1 = this.wz(r + 1);
        pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
        const u0 = c / m.C;
        const u1 = (c + 1) / m.C;
        const v0 = 1 - r / m.R;
        const v1 = 1 - (r + 1) / m.R;
        uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
        cells.push(i, i);
        if (kind[i] === 5 || kind[i] === 6) {
          shim.push(x0, y + 0.004, z0, x0, y + 0.004, z1, x1, y + 0.004, z1, x0, y + 0.004, z0, x1, y + 0.004, z1, x1, y + 0.004, z0);
          shimUv.push(c, r, c, r + 1, c + 1, r + 1, c, r, c + 1, r + 1, c + 1, r);
        }
        // walls down to each lower neighbour (or the slab's floor at the edge)
        const nb = (cc: number, rr: number) => (cc < 0 || rr < 0 || cc >= m.C || rr >= m.R ? floor : this.Y(top[rr * m.C + cc]));
        const k = kind[i];
        wall(x0, z1, x1, z1, y, Math.max(floor, Math.min(y, nb(c, r + 1))), k, 0, 1);
        wall(x1, z0, x0, z0, y, Math.max(floor, Math.min(y, nb(c, r - 1))), k, 0, -1);
        wall(x1, z1, x1, z0, y, Math.max(floor, Math.min(y, nb(c + 1, r))), k, 1, 0);
        wall(x0, z0, x0, z1, y, Math.max(floor, Math.min(y, nb(c - 1, r))), k, -1, 0);
      }
    // tops: one texture for the whole grid, painted like the 2D map, or the satellite photo
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    tg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    tg.computeVertexNormals();
    this.topTex?.dispose();
    this.topTex = this.paintTops(kind);
    const tm = new THREE.MeshLambertMaterial({ map: photo && this.photoTex ? this.photoTex : this.topTex });
    this.topMesh = new THREE.Mesh(tg, tm);
    this.topMesh.receiveShadow = !this.coarse;
    this.topCells = Int32Array.from(cells);
    this.terrain.add(this.topMesh);
    // walls with vertex colours
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wpos, 3));
    wg.setAttribute("normal", new THREE.Float32BufferAttribute(wnorm, 3));
    wg.setAttribute("color", new THREE.Float32BufferAttribute(wcol, 3));
    const walls = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    walls.receiveShadow = !this.coarse;
    this.terrain.add(walls);
    // indigo ink along every step in the ground, like the outline of a painted shape
    const ig = new THREE.BufferGeometry();
    ig.setAttribute("position", new THREE.Float32BufferAttribute(ink, 3));
    this.terrain.add(new THREE.LineSegments(ig, new THREE.LineBasicMaterial({ color: C.neel, transparent: true, opacity: 0.55 })));
    // moving wave lines on the water
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(shim, 3));
    sg.setAttribute("uv", new THREE.Float32BufferAttribute(shimUv, 2));
    this.waterShimmer = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.waveTex, transparent: true, depthWrite: false, opacity: photo ? 0.5 : 1 }));
    this.terrain.add(this.waterShimmer);
    // re-seat what stands on the ground
    this.restack();
  }

  private paintTops(kind: Uint8Array): THREE.CanvasTexture {
    const m = this.m;
    const cv = document.createElement("canvas");
    cv.width = m.C * TS;
    cv.height = m.R * TS;
    const g = cv.getContext("2d")!;
    g.lineCap = "round";
    for (let r = 0; r < m.R; r++)
      for (let c = 0; c < m.C; c++) {
        const i = r * m.C + c;
        const k = kind[i];
        const x = c * TS;
        const y = r * TS;
        g.fillStyle = k === 0 ? (((c * 7 + r * 3) >> 1) % 2 ? C.haldiTint : C.dhaanTint) : TOPC[k];
        g.fillRect(x, y, TS, TS);
        g.save();
        g.beginPath();
        g.rect(x, y, TS, TS);
        g.clip();
        if (k === 0 || k === 3) {
          // kachni: the fine parallel hatching of Mithila line painting
          g.strokeStyle = "rgba(31,35,80,0.28)";
          g.lineWidth = 1;
          g.beginPath();
          const dir = (c + r) % 2 ? 1 : -1;
          for (let s = -TS; s < TS * 2; s += 5) {
            g.moveTo(x + s, y + (dir > 0 ? TS : 0));
            g.lineTo(x + s + TS, y + (dir > 0 ? 0 : TS));
          }
          g.stroke();
        } else if (k === 5 || k === 6) {
          g.strokeStyle = k === 5 ? "rgba(255,253,248,0.55)" : "rgba(36,96,125,0.5)";
          g.lineWidth = 1.4;
          for (let yy = y + 4; yy < y + TS; yy += 7) {
            g.beginPath();
            for (let xx = 0; xx <= TS; xx += 2) g.lineTo(x + xx, yy + Math.sin(((xx + c * TS) / TS) * Math.PI * 2) * 1.6);
            g.stroke();
          }
        } else if (k === 7) {
          g.strokeStyle = "rgba(255,253,248,0.8)";
          g.lineWidth = 1;
          g.beginPath();
          for (let s = -TS; s < TS * 2; s += 4) {
            g.moveTo(x + s, y + TS);
            g.lineTo(x + s + TS, y);
          }
          g.stroke();
        } else if (k === 4) {
          g.strokeStyle = "rgba(29,107,54,0.55)";
          g.lineWidth = 1.2;
          g.beginPath();
          for (let s = 3; s < TS; s += 6) {
            g.moveTo(x + s, y + TS - 3);
            g.lineTo(x + s - 1, y + 8);
          }
          g.stroke();
        } else if (k === 8) {
          g.strokeStyle = "rgba(148,112,62,0.95)";
          g.lineWidth = 1.4;
          g.beginPath();
          for (let s = 0; s < TS; s += 6) {
            g.moveTo(x + s, y + TS * 0.62);
            g.lineTo(x + s + 3, y + TS * 0.38);
            g.lineTo(x + s + 6, y + TS * 0.62);
          }
          g.stroke();
        }
        g.restore();
        // ink where one kind of ground meets another
        const diff = (cc: number, rr: number) => cc < 0 || rr < 0 || cc >= m.C || rr >= m.R || (kind[rr * m.C + cc] !== k && !(isWater(k) && isWater(kind[rr * m.C + cc])));
        g.strokeStyle = C.neel;
        g.globalAlpha = 0.6;
        g.lineWidth = 1.6;
        g.beginPath();
        if (diff(c, r - 1)) (g.moveTo(x, y), g.lineTo(x + TS, y));
        if (diff(c - 1, r)) (g.moveTo(x, y), g.lineTo(x, y + TS));
        g.stroke();
        g.globalAlpha = 1;
      }
    // clouds the satellite couldn't see through, as hatched white
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  /** Forces the ground to be rebuilt on the next setPaint (the satellite pass changed). */
  invalidate(): void {
    this.paintKey = "";
  }

  /** The satellite's own picture of the window, draped over the ground. */
  setPhoto(url: string | null): void {
    if (!url) {
      this.photoTex = null;
      this.paintKey = "";
      return;
    }
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.photoTex = t;
      this.paintKey = "";
      if (this.lastPaint) this.setPaint(...this.lastPaint);
    });
  }

  private makeWaveTexture(): THREE.CanvasTexture {
    const cv = document.createElement("canvas");
    cv.width = 64;
    cv.height = 64;
    const g = cv.getContext("2d")!;
    g.strokeStyle = "rgba(255,253,248,0.85)";
    g.lineWidth = 3;
    g.lineCap = "round";
    for (let y = 12; y < 64; y += 26) {
      g.beginPath();
      for (let x = 0; x <= 64; x += 2) g.lineTo(x, y + Math.sin((x / 64) * Math.PI * 4) * 4);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ---------------- what really stands on it ----------------

  private houses: THREE.Mesh | null = null;
  private houseBase: Float32Array | null = null;
  private houseCells: Int32Array | null = null;
  private treeMesh: THREE.InstancedMesh | null = null;
  private treeCells: Int32Array | null = null;
  private treeXZ: Float32Array | null = null;
  private roadLines: THREE.LineSegments | null = null;
  private roadCells: Int32Array | null = null;

  private buildFeatures(f: Features) {
    const m = this.m;
    const [W, H] = f.size_m;
    const gx = (x: number) => (x / W) * m.C;
    const gy = (y: number) => ((H - y) / H) * m.R;
    // ---- buildings: every footprint, extruded, with a roof in a Mithila colour
    const pos: number[] = [];
    const col: number[] = [];
    const base: number[] = [];
    const cellsOf: number[] = [];
    const roofs = [C.kesar, C.sindoor, C.mitti, C.haldi].map(hex);
    const wallC = hex(C.chuna);
    const b = f.buildings;
    let n = 0;
    for (let k = 0; k < b.length; ) {
      const cnt = b[k];
      const pts: [number, number][] = [];
      for (let j = 0; j < cnt; j++) pts.push([gx(b[k + 2 + 2 * j]), gy(b[k + 3 + 2 * j])]);
      k += 2 + 2 * cnt;
      let cx = 0;
      let cy = 0;
      for (const p of pts) (cx += p[0]), (cy += p[1]);
      cx /= cnt;
      cy /= cnt;
      const cell = this.cellAt(cx, cy);
      const roof = roofs[(n++ * 2654435761) >>> 30];
      const h = HOUSE_H;
      // roof: a fan from the centroid (footprints are small and nearly convex)
      for (let j = 0; j < cnt; j++) {
        const a = pts[j];
        const c2 = pts[(j + 1) % cnt];
        pos.push(this.wx(cx), h, this.wz(cy), this.wx(a[0]), h, this.wz(a[1]), this.wx(c2[0]), h, this.wz(c2[1]));
        for (let t = 0; t < 3; t++) (col.push(roof.r, roof.g, roof.b), base.push(0), cellsOf.push(cell));
        // wall
        pos.push(this.wx(a[0]), h, this.wz(a[1]), this.wx(a[0]), 0, this.wz(a[1]), this.wx(c2[0]), 0, this.wz(c2[1]));
        pos.push(this.wx(a[0]), h, this.wz(a[1]), this.wx(c2[0]), 0, this.wz(c2[1]), this.wx(c2[0]), h, this.wz(c2[1]));
        for (let t = 0; t < 6; t++) (col.push(wallC.r * 0.92, wallC.g * 0.9, wallC.b * 0.86), base.push(0), cellsOf.push(cell));
      }
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    hg.computeVertexNormals();
    this.houseBase = Float32Array.from(pos.filter((_, j) => j % 3 === 1));
    this.houseCells = Int32Array.from(cellsOf);
    this.houses = new THREE.Mesh(hg, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.houses.castShadow = !this.coarse;
    this.scene.add(this.houses);

    // ---- trees: one per real 20 m tree block (fewer on a phone)
    const step = this.coarse ? 4 : 2;
    const tcount = Math.floor(f.trees.length / 2 / step);
    const canopy = new THREE.IcosahedronGeometry(0.048, 0);
    canopy.translate(0, 0.085, 0);
    this.treeMesh = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ color: C.white, flatShading: true, emissive: hex(C.dhaanDeep), emissiveIntensity: 0.25 }), tcount);
    this.treeMesh.castShadow = !this.coarse;
    this.treeCells = new Int32Array(tcount);
    this.treeXZ = new Float32Array(tcount * 2);
    const tint = new THREE.Color();
    for (let t = 0, j = 0; t < tcount; t++, j += 2 * step) {
      const x = gx(f.trees[j]);
      const y = gy(f.trees[j + 1]);
      this.treeCells[t] = this.cellAt(x, y);
      this.treeXZ[2 * t] = this.wx(x);
      this.treeXZ[2 * t + 1] = this.wz(y);
      tint.set(t % 3 === 0 ? C.dhaan : mix(C.dhaan, C.haldi, 0.22));
      this.treeMesh.setColorAt(t, tint);
    }
    this.scene.add(this.treeMesh);

    // ---- roads, as ink lines on the ground; bigger roads darker
    const rp: number[] = [];
    const rc: number[] = [];
    const rcell: number[] = [];
    const major = new Set(["trunk", "primary", "secondary", "tertiary"]);
    for (const road of f.roads) {
      const c = hex(major.has(road.c) ? C.neel : C.mittiDeep);
      for (let j = 0; j + 3 < road.p.length; j += 2) {
        const x0 = gx(road.p[j]);
        const y0 = gy(road.p[j + 1]);
        const x1 = gx(road.p[j + 2]);
        const y1 = gy(road.p[j + 3]);
        rp.push(this.wx(x0), 0, this.wz(y0), this.wx(x1), 0, this.wz(y1));
        rc.push(c.r, c.g, c.b, c.r, c.g, c.b);
        rcell.push(this.cellAt(x0, y0), this.cellAt(x1, y1));
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
    rg.setAttribute("color", new THREE.Float32BufferAttribute(rc, 3));
    this.roadLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }));
    this.roadCells = Int32Array.from(rcell);
    this.scene.add(this.roadLines);

    // ---- named public places (schools, health centres, temples, bridges): labels, and shelters to know about
    for (const p of f.places) {
      if (!p.k || !PUBLIC_PLACE.test(p.k)) continue;
      const x = gx(p.p[0]);
      const y = gy(p.p[1]);
      this.places.push({ name: p.n, kind: p.k, x, z: y, cell: this.cellAt(x, y) });
    }
  }

  /** Puts houses, trees and roads back on the surface after the ground or water changed. */
  private restack() {
    if (this.houses && this.houseBase && this.houseCells) {
      const a = this.houses.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let v = 0; v < a.count; v++) {
        const i = this.houseCells[v];
        // houses stand on the ground: under a flood, the water hides them
        a.setY(v, this.Y(this.ground[i]) + this.houseBase[v]);
      }
      a.needsUpdate = true;
      this.houses.geometry.computeBoundingSphere();
    }
    if (this.treeMesh && this.treeCells && this.treeXZ) {
      const mtx = new THREE.Matrix4();
      for (let t = 0; t < this.treeCells.length; t++) {
        const i = this.treeCells[t];
        const s = 0.85 + ((t * 97) % 40) / 100;
        mtx.makeScale(s, s, s).setPosition(this.treeXZ[2 * t], this.Y(this.ground[i]), this.treeXZ[2 * t + 1]);
        this.treeMesh.setMatrixAt(t, mtx);
      }
      this.treeMesh.instanceMatrix.needsUpdate = true;
      this.treeMesh.computeBoundingSphere();
    }
    if (this.roadLines && this.roadCells) {
      const a = this.roadLines.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let v = 0; v < a.count; v++) a.setY(v, this.Y(this.ground[this.roadCells[v]]) + 0.012);
      a.needsUpdate = true;
      this.roadLines.geometry.computeBoundingSphere();
    }
    for (const s of this.stones) s.mesh.position.y = this.Y(this.top[s.cell] || this.ground[s.cell]);
  }

  // ---------------- kilometre stones and the patrol on each kilometre ----------------

  private stones: { km: number; cell: number; mesh: THREE.Group }[] = [];
  private buildStones() {
    const m = this.m;
    const stoneG = new THREE.BoxGeometry(0.1, 0.16, 0.1);
    stoneG.translate(0, 0.08, 0);
    const capG = new THREE.BoxGeometry(0.11, 0.06, 0.11);
    capG.translate(0, 0.17, 0);
    const bodyG = new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8);
    bodyG.translate(0.16, 0.08, 0);
    const headG = new THREE.SphereGeometry(0.035, 10, 8);
    headG.translate(0.16, 0.2, 0);
    const lanternG = new THREE.SphereGeometry(0.025, 8, 6);
    lanternG.translate(0.22, 0.13, 0);
    const ringG = new THREE.RingGeometry(0.2, 0.26, 28);
    ringG.rotateX(-Math.PI / 2);
    ringG.translate(0.08, 0.015, 0);
    for (const s of m.stones) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(stoneG, new THREE.MeshLambertMaterial({ color: C.white })));
      g.add(new THREE.Mesh(capG, new THREE.MeshLambertMaterial({ color: C.kesar })));
      const body = new THREE.Mesh(bodyG, new THREE.MeshLambertMaterial({ color: C.kesar }));
      g.add(body);
      g.add(new THREE.Mesh(headG, new THREE.MeshLambertMaterial({ color: C.skin })));
      const lantern = new THREE.Mesh(lanternG, new THREE.MeshBasicMaterial({ color: C.haldi }));
      lantern.visible = false;
      g.add(lantern);
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: C.dhaan, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
      g.add(ring);
      g.position.set(this.wx(s.x), 0, this.wz(s.y));
      g.traverse((o) => (o.castShadow = !this.coarse));
      this.dynamic.add(g);
      this.stones.push({ km: s.km, cell: s.cell, mesh: g });
      this.patrol.push({ km: s.km, body, ring, lantern });
    }
  }

  // ---------------- what moves ----------------

  private teamMesh(kind: Team3D["kind"]): THREE.Group {
    const g = new THREE.Group();
    const ink = new THREE.MeshBasicMaterial({ color: C.neel, side: THREE.BackSide });
    if (kind === "tractor") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.2), new THREE.MeshLambertMaterial({ color: C.kesar }));
      body.position.y = 0.14;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.18), new THREE.MeshLambertMaterial({ color: C.haldiTint }));
      cab.position.set(-0.08, 0.28, 0);
      g.add(body, cab);
      for (const [x, r] of [
        [-0.11, 0.09],
        [0.12, 0.065],
      ])
        for (const z of [-0.11, 0.11]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 14), new THREE.MeshLambertMaterial({ color: C.neel }));
          w.rotation.x = Math.PI / 2;
          w.position.set(x, r, z);
          g.add(w);
        }
    } else {
      const hullG = new THREE.CylinderGeometry(0.12, 0.08, 0.5, 4, 1);
      hullG.rotateZ(Math.PI / 2);
      hullG.rotateX(Math.PI / 4);
      hullG.scale(1, 0.5, 1);
      const hull = new THREE.Mesh(hullG, new THREE.MeshLambertMaterial({ color: kind === "sdrf" ? C.sindoor : C.kesar }));
      hull.position.y = 0.05;
      const out = new THREE.Mesh(hullG, ink);
      out.position.copy(hull.position);
      out.scale.setScalar(1.12);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), new THREE.MeshLambertMaterial({ color: C.neel }));
      mast.position.set(0, 0.22, 0);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), new THREE.MeshBasicMaterial({ color: kind === "sdrf" ? C.white : C.haldi, side: THREE.DoubleSide }));
      flag.position.set(0.07, 0.32, 0);
      g.add(out, hull, mast, flag);
    }
    g.traverse((o) => (o.castShadow = !this.coarse));
    return g;
  }

  private pinMesh(colour: string): THREE.Group {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 16), new THREE.MeshLambertMaterial({ color: colour }));
    cone.rotation.x = Math.PI;
    cone.position.y = 0.22;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshLambertMaterial({ color: colour }));
    ball.position.y = 0.42;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ color: C.white }));
    dot.position.set(0, 0.42, 0.09);
    g.add(cone, ball, dot);
    return g;
  }

  private beaconMesh(colour: string): THREE.Group {
    const g = new THREE.Group();
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 3.2, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    col.position.y = 1.6;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 32), new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.name = "ring";
    g.add(col, ring);
    return g;
  }

  private syncSet<T extends { id: string }>(map: Map<string, THREE.Group>, items: T[], make: (t: T) => THREE.Group) {
    const seen = new Set<string>();
    for (const t of items) {
      seen.add(t.id);
      if (!map.has(t.id)) {
        const g = make(t);
        map.set(t.id, g);
        this.dynamic.add(g);
      }
    }
    for (const [id, g] of map)
      if (!seen.has(id)) {
        this.dynamic.remove(g);
        map.delete(id);
      }
  }

  // ---------------- the loop ----------------

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(100, now - this.last);
      // a phone draws at 30 frames a second, which is plenty for this and kinder to its battery
      if (this.coarse && dt < 30) return;
      this.last = now;
      this.frame(now, dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame(now: number, dt: number) {
    const st = this.state();
    this.onFrame?.();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the camera: the person drives it; the night story eases it towards what matters
    if (this.focusTo) {
      const k = still ? 1 : 1 - Math.exp(-dt / 500);
      const d = this.focusTo.clone().sub(this.controls.target).multiplyScalar(k);
      this.controls.target.add(d);
      this.camera.position.add(d);
      if (this.distTo) {
        const off = this.camera.position.clone().sub(this.controls.target);
        const len = off.length();
        off.setLength(len + (this.distTo - len) * k);
        this.camera.position.copy(this.controls.target).add(off);
      }
    }
    this.controls.update();
    const far = this.camera.position.distanceTo(this.controls.target);
    if (this.houses) this.houses.visible = far < 46;
    if (this.treeMesh) this.treeMesh.visible = far < 70;
    if (!still) this.waveTex.offset.x = (this.waveTex.offset.x + dt / 9000) % 1;

    // day and night
    const n = st.night;
    const day = 1 - n;
    this.scene.background = hex(mix(C.chuna, C.raat, n));
    (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color);
    this.hemi.intensity = 0.45 + 1.45 * day;
    this.hemi.color.set(mix("#ffffff", "#5b63b0", n));
    this.sunLight.intensity = 1.35 * day * (st.sun > 0 ? 0.5 + 0.5 * st.sun : 1);
    this.moonLight.intensity = 0.55 * n;
    for (const p of this.lamps) {
      p.intensity = 2.4 * n;
      const v = this.onTop([(p.userData.cell % this.m.C) + 0.5, Math.floor(p.userData.cell / this.m.C) + 0.5], 0.6);
      p.position.copy(v);
    }

    // patrol: one watcher per kilometre, green while all is well, the incident's colour when not
    const t = now / 1000;
    for (const p of this.patrol) {
      const alarm = st.patrolAlarm.get(p.km);
      (p.ring.material as THREE.MeshBasicMaterial).color.set(alarm ?? C.dhaan);
      (p.ring.material as THREE.MeshBasicMaterial).opacity = alarm && !still ? 0.55 + 0.45 * Math.sin(t * 5) : 0.9;
      p.lantern.visible = n > 0.3;
    }

    // relief teams
    this.syncSet(this.teamMeshes, st.teams, (tm) => this.teamMesh(tm.kind));
    for (const tm of st.teams) {
      const g = this.teamMeshes.get(tm.id)!;
      g.position.copy(this.onTop(tm.pos, 0));
      g.rotation.y = -tm.heading;
      g.scale.setScalar(tm.selected ? 1.35 : 1);
    }
    // help pins
    this.syncSet(this.pinMeshes, st.pins, (p) => this.pinMesh(p.colour));
    for (const p of st.pins) {
      const g = this.pinMeshes.get(p.id)!;
      const c = p.cell;
      g.position.copy(this.onTop([(c % this.m.C) + 0.5, Math.floor(c / this.m.C) + 0.5], still ? 0.05 : 0.05 + 0.05 * Math.sin(t * 3 + c)));
      g.scale.setScalar(p.mine ? 1.5 : 1);
    }
    // incidents: a column of light over the kilometre, pulsing at its base
    this.syncSet(this.beaconMeshes, st.beacons, (b) => this.beaconMesh(b.priority === "P1" ? C.sindoor : b.priority === "P2" ? C.kesar : C.haldi));
    for (const b of st.beacons) {
      const g = this.beaconMeshes.get(b.id)!;
      g.position.copy(this.onTop(this.m.pointAtKm(b.km), 0));
      const ring = g.getObjectByName("ring")!;
      const k = still ? 0.5 : (t * 0.8) % 1;
      ring.scale.setScalar(1 + k * 1.6);
      ((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
    // routes
    const rkey = st.routes.map((r) => r.colour + r.pts.length + r.pts[0]?.join(",") + r.pts[r.pts.length - 1]?.join(",")).join("|") + this.paintKey;
    if (rkey !== this.routeKey) {
      this.routeKey = rkey;
      for (const l of this.routeLines) {
        this.dynamic.remove(l);
        l.geometry.dispose();
      }
      this.routeLines = st.routes.map((r) => {
        const g = new THREE.BufferGeometry().setFromPoints(r.pts.map((p) => this.onTop(p, 0.06)));
        const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: r.colour, dashSize: 0.25, gapSize: 0.15 }));
        line.computeLineDistances();
        this.dynamic.add(line);
        return line;
      });
    }
    // the selected cell, the reported spot, the breach
    if (st.selCell != null) {
      const c = st.selCell % this.m.C;
      const r = Math.floor(st.selCell / this.m.C);
      this.selMesh.visible = true;
      this.selMesh.position.set(this.wx(c), this.Y(this.top[st.selCell]) + 0.01, this.wz(r));
    } else this.selMesh.visible = false;
    this.ringMesh.visible = st.ringKm > 0;
    if (st.ringKm) {
      this.ringMesh.position.copy(this.onTop(this.m.pointAtKm(st.ringKm), 0.03));
      const k = still ? 0.5 : (t * 1.1) % 1;
      this.ringMesh.scale.setScalar(1 + 2 * k);
      (this.ringMesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
    this.breachMesh.visible = st.breachKm != null;
    if (st.breachKm != null) this.breachMesh.position.copy(this.onTop(this.m.pointAtKm(st.breachKm), 0.03));

    this.renderer.render(this.scene, this.camera);
    this.drawLabels(st, t);
  }

  // ---------------- labels, on a flat layer above the 3D ----------------

  private drawLabels(st: State3D, t: number) {
    const g = this.lctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    this.hits = [];
    const lang = st.lang();
    const placed: [number, number, number, number][] = [];
    const free = (x: number, y: number, w: number, h: number) => !placed.some(([a, b, c, d]) => x < a + c + 4 && x + w + 4 > a && y < b + d + 3 && y + h + 3 > b);
    const dist = this.camera.position.distanceTo(this.controls.target);
    const chip = (x: number, y: number, hi: string, en: string, o: { bg?: string; ink?: string; shade?: string; size?: number; must?: boolean; sub?: string } = {}) => {
      const size = o.size ?? 14;
      const main = lang === "en" ? en : hi;
      const sub = lang === "both" && en && en !== hi ? en : o.sub ?? "";
      g.font = `700 ${size}px "Baloo 2", "Noto Sans Devanagari", sans-serif`;
      const w1 = g.measureText(main).width;
      g.font = `600 ${size - 4}px "Baloo 2", sans-serif`;
      const w2 = sub ? g.measureText(sub).width : 0;
      const w = Math.max(w1, w2) + 16;
      const h = sub ? size + size - 2 + 8 : size + 10;
      const bx = x - w / 2;
      const by = y - h;
      if (!o.must && !free(bx, by, w, h)) return null;
      placed.push([bx, by, w, h]);
      g.fillStyle = o.shade ?? C.neel;
      roundRect(g, bx + 2, by + 3, w, h, 8);
      g.fill();
      g.fillStyle = o.bg ?? C.white;
      roundRect(g, bx, by, w, h, 8);
      g.fill();
      g.strokeStyle = C.neel;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = o.ink ?? C.neel;
      g.textAlign = "center";
      g.textBaseline = "top";
      g.font = `700 ${size}px "Baloo 2", "Noto Sans Devanagari", sans-serif`;
      g.fillText(main, x, by + 4);
      if (sub) {
        g.font = `600 ${size - 4}px "Baloo 2", sans-serif`;
        g.fillStyle = C.neel2;
        g.fillText(sub, x, by + size + 4);
      }
      return { x: bx, y: by, w, h };
    };
    const at = (p: Pt, lift = 0) => this.project(p, lift);
    const m = this.m;
    // incidents first: they matter most
    for (const b of st.beacons) {
      const s = at(m.pointAtKm(b.km), 1.1);
      if (!s) continue;
      const box = chip(s[0], s[1], b.label[0], b.label[1], { must: true, bg: b.priority === "P1" ? C.sindoorTint : b.priority === "P2" ? C.kesarTint : C.haldiTint, shade: b.priority === "P1" ? C.sindoor : C.kesarDeep, size: 14 });
      if (box) this.hits.push({ x: s[0], y: s[1] - box.h / 2, r: Math.max(20, box.w / 2), pick: { k: "stone", km: b.km } });
    }
    // villages, with help counts per village in the public view
    for (const v of m.villages) {
      const s = at([(v.cell % m.C) + 0.5, Math.floor(v.cell / m.C) + 0.5], 0.5);
      if (!s) continue;
      const box = chip(s[0], s[1], v.name_hi, v.name_en, { must: true, size: dist < 30 ? 16 : 14 });
      if (box) this.hits.push({ x: box.x + box.w / 2, y: box.y + box.h / 2, r: Math.max(20, box.w / 2), pick: { k: "village", key: v.key } });
      const cnt = st.villageCounts?.get(v.key);
      if (box && cnt) {
        let bx = box.x + box.w + 6;
        for (const [n, colr] of [
          [cnt[0], C.sindoor],
          [cnt[1], C.kesar],
          [cnt[2], C.dhaan],
        ] as [number, string][]) {
          g.beginPath();
          g.arc(bx + 9, box.y + box.h / 2, 10, 0, Math.PI * 2);
          g.fillStyle = colr;
          g.fill();
          g.strokeStyle = C.neel;
          g.lineWidth = 1.5;
          g.stroke();
          g.fillStyle = C.white;
          g.font = `700 12px "Baloo 2", sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(String(n), bx + 9, box.y + box.h / 2 + 1);
          bx += 22;
        }
      }
    }
    // the gauge
    {
      const gi = m.gauge;
      const s = at([(gi % m.C) + 0.5, Math.floor(gi / m.C) + 0.5], 0.9);
      if (s) {
        const box = chip(s[0], s[1], "रेवाघाट गेज", "Rewaghat gauge", { bg: C.gandakTint, shade: C.gandakDeep, size: 12 });
        if (box) this.hits.push({ x: s[0], y: s[1] - 10, r: 22, pick: { k: "gauge" } });
      }
    }
    // relief teams
    for (const tm of st.teams) {
      const s = at(tm.pos, 0.45);
      if (!s) continue;
      this.hits.push({ x: s[0], y: s[1] + 10, r: 20, pick: { k: "team", id: tm.id } });
      if (dist < 34 || tm.selected || tm.moving) chip(s[0], s[1], tm.name[0], tm.name[1], { size: 12, must: tm.selected });
    }
    for (const p of st.pins) {
      const s = at([(p.cell % m.C) + 0.5, Math.floor(p.cell / m.C) + 0.5], 0.5);
      if (s) this.hits.push({ x: s[0], y: s[1], r: 18, pick: { k: "help", id: p.id } });
    }
    // kilometre numbers and the patrol beside each stone
    if (dist < 60)
      for (const s0 of m.stones) {
        const s = at([s0.x, s0.y], 0.35);
        if (!s) continue;
        this.hits.push({ x: s[0], y: s[1] + 8, r: 14, pick: { k: "stone", km: s0.km } });
        if (!free(s[0] - 9, s[1] - 14, 18, 14)) continue;
        placed.push([s[0] - 9, s[1] - 14, 18, 14]);
        g.font = `700 12px "Baloo 2", sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "bottom";
        g.lineWidth = 3;
        g.strokeStyle = C.white;
        g.strokeText(String(s0.km), s[0], s[1]);
        g.fillStyle = C.kesarDeep;
        g.fillText(String(s0.km), s[0], s[1]);
      }
    // real public places, when close enough to read them
    if (dist < 26)
      for (const p of this.places) {
        const s = this.project([p.x, p.z], 0.3);
        if (!s) continue;
        const box = chip(s[0], s[1], p.name, "", { size: 11, bg: C.haldiTint, shade: C.haldiDeep });
        if (box) this.hits.push({ x: box.x + box.w / 2, y: box.y + box.h / 2, r: Math.max(14, box.w / 2), pick: { k: "place", name: p.name, kind: p.kind, cell: p.cell } });
      }
    this.afterLabels?.(g, this.w, this.h, t * 1000);
  }

  // ---------------- input ----------------

  /** What's under a tap: a label or marker first, then the ground. */
  pick(x: number, y: number): Pick3D | null {
    let best: { d: number; pick: Pick3D } | null = null;
    for (const h of this.hits) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && (!best || d < best.d)) best = { d, pick: h.pick };
    }
    if (best) return best.pick;
    if (!this.topMesh) return null;
    this.ray.setFromCamera(new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1), this.camera);
    const hit = this.ray.intersectObject(this.topMesh, false)[0];
    if (!hit || hit.faceIndex == null) return null;
    return { k: "cell", i: this.topCells[hit.faceIndex] };
  }

  zoomBy(f: number): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.setLength(Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, off.length() * f)));
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
  }

  /** Eases the camera to look at a grid point, optionally from a distance. */
  focus(p: Pt | null, distance = 0): void {
    if (!p) {
      this.focusTo = null;
      return;
    }
    this.focusTo = this.onTop(p, 0);
    this.distTo = distance;
  }

  /** Puts the camera at once: looking at a grid point from a distance, tilt and compass bearing. */
  view(p: Pt, distance: number, tiltDeg = 52, bearingDeg = 215): void {
    const t = this.onTop(p, 0);
    this.controls.target.copy(t);
    const phi = THREE.MathUtils.degToRad(tiltDeg);
    const th = THREE.MathUtils.degToRad(bearingDeg);
    this.camera.position.set(t.x + distance * Math.sin(phi) * Math.sin(th), t.y + distance * Math.cos(phi), t.z + distance * Math.sin(phi) * Math.cos(th));
    this.focusTo = null;
    this.controls.update();
  }

  /** Turns the view 90 degrees about where it's looking. */
  rotate(): void {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.camera.position.copy(this.controls.target).add(off);
  }

  resize(): void {
    const r = this.stage.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // a narrow screen needs the camera further back to fit the stretch
    this.camera.fov = this.w < 700 ? 42 : 34;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.labels.width = Math.round(this.w * dpr);
    this.labels.height = Math.round(this.h * dpr);
  }

  get size(): [number, number] {
    return [this.w, this.h];
  }

  setVisible(on: boolean): void {
    this.canvas.hidden = !on;
    this.labels.hidden = !on;
    if (on) this.start();
    else this.stop();
  }
}

const TOPC: string[] = [
  C.haldiTint, // crop (alternates with dhaan tint in the texture)
  C.dhaanTint, // trees
  C.mittiTint, // built
  C.dhaanTint, // grass, bare
  C.gandakTint, // wetland
  C.gandak, // river
  mix(C.gandak, C.white, 0.22), // flood
  mix(C.gandak, C.white, 0.45), // seen by the satellite
  C.mitti, // bank
  C.mittiDeep, // breach
];
const isWater = (k: number) => k === 5 || k === 6;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
