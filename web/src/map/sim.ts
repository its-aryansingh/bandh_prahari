// Help requests and relief teams on the live map. On the real API this only holds what
// GET /help and GET /teams return and turns taps into POSTs. On the mock data it also
// plays the night forward on a demo clock (one second is one minute): teams drive their
// routes, the 20-minute answer clock runs out, and a late request climbs to the next team.
import type { HelpCount, HelpList, HelpNeed, HelpRequest, Team, TeamKind, Teams } from "../types";
import { CLS, cellLatLon, latLonCell, type Model, type Pt } from "./model";
import { shortestPath } from "./flood";

const MIN = 60_000;

export interface Drive {
  pts: Pt[];
  acc: number[];
  /** Demo time the drive started at pts[0], and how long it takes (ms). */
  t0: number;
  ms: number;
  help: string;
}

export interface TeamState {
  team: Team;
  pos: Pt;
  drive: Drive | null;
}

export interface LogLine {
  at: number;
  hi: string;
  en: string;
  tone?: "late" | "ok";
}

/** Where water stands, so routes can avoid it. Set by the map whenever the water changes. */
export interface Water {
  /** River water over the cell at the what-if reading (or the channel itself). */
  deep: (i: number) => boolean;
  /** Shallow water the satellite saw: a boat floats, a tractor can still wade. */
  shallow: (i: number) => boolean;
}

export interface Route {
  cells: number[];
  km: number;
  min: number;
}

const WALK_KMH = 3;

export class Relief {
  now: number;
  /** Demo minutes per real second on mocks; 1/60 on the real API (real time). */
  get rate(): number {
    return this.demo ? 1 : 1 / 60;
  }
  requests: HelpRequest[] = [];
  teams: TeamState[] = [];
  byVillage: HelpCount[] = [];
  answerMin = 20;
  log: LogLine[] = [];
  /** The team the person plays in the relief view. The demo never acts for it. */
  myTeam: string | null = null;
  /** The request this browser raised from the family view. */
  mine: string | null = null;
  /** Teams a person is playing in another window (two-window demo): the demo never acts for them either. */
  humanTeams = new Set<string>();
  /** Demo minutes before a family's own request is passed to the nearest team. Longer when a relief window is open. */
  autoPageMin = 1.5;
  water: Water = { deep: () => false, shallow: () => false };
  private seq = 518;
  private pending = new Map<string, number>();
  private saved: {
    demo: boolean;
    now: number;
    requests: HelpRequest[];
    teams: TeamState[];
    byVillage: HelpCount[];
    log: LogLine[];
    mine: string | null;
    pending: Map<string, number>;
    autoPageMin: number;
  } | null = null;

  constructor(
    readonly m: Model,
    public demo: boolean,
    help: HelpList,
    teams: Teams,
  ) {
    this.now = Date.parse(help.as_of);
    this.load(help, teams, true);
  }

  // ---------------- the night on the map ----------------

  /** Is the night of 29-30 September playing? */
  get inStory(): boolean {
    return this.saved !== null;
  }

  /** Clears the stage for the night: sample time from `at`, no requests, every team free.
   *  Whatever was showing (sample or real) is kept aside and comes back with endStory(). */
  beginStory(at: number): void {
    if (!this.saved)
      this.saved = {
        demo: this.demo,
        now: this.now,
        requests: this.requests,
        teams: this.teams.map((t) => ({ team: { ...t.team }, pos: [t.pos[0], t.pos[1]] as Pt, drive: t.drive })),
        byVillage: this.byVillage,
        log: this.log,
        mine: this.mine,
        pending: this.pending,
        autoPageMin: this.autoPageMin,
      };
    const s = this.saved;
    this.demo = true;
    this.now = at;
    this.requests = [];
    this.log = [];
    this.mine = null;
    this.pending = new Map();
    this.autoPageMin = 1.5;
    this.byVillage = s.byVillage.map((v) => ({ ...v, open: 0, on_the_way: 0, safe: 0 }));
    this.teams = s.teams.map((t) => ({ team: { ...t.team, status: "free", help_id: null }, pos: [t.pos[0], t.pos[1]] as Pt, drive: null }));
  }

  /** Puts back what was showing before the night. */
  endStory(): void {
    const s = this.saved;
    if (!s) return;
    this.saved = null;
    this.demo = s.demo;
    this.now = s.demo ? s.now : Date.now();
    this.requests = s.requests;
    this.teams = s.teams;
    this.byVillage = s.byVillage;
    this.log = s.log;
    this.mine = s.mine;
    this.pending = s.pending;
    this.autoPageMin = s.autoPageMin;
  }

  /** Takes fresh data from the API (or the mocks, once). */
  load(help: HelpList, teams: Teams, first = false): void {
    this.answerMin = help.answer_min || 20;
    this.byVillage = help.by_village;
    this.requests = help.requests ?? [];
    const old = new Map(this.teams.map((t) => [t.team.id, t]));
    this.teams = teams.teams.map((team) => {
      const prev = old.get(team.id);
      const cell = latLonCell(this.m, team.lat, team.lon);
      const pos: Pt = cell >= 0 ? [(cell % this.m.C) + 0.5, Math.floor(cell / this.m.C) + 0.5] : [0, 0];
      return { team, pos: this.demo && prev ? prev.pos : pos, drive: this.demo && prev ? prev.drive : null };
    });
    if (first && this.demo) {
      // teams already on their way keep driving to their request
      for (const t of this.teams) {
        const r = this.requests.find((x) => x.id === t.team.help_id);
        if (r && r.status === "claimed") this.startDrive(t, r);
      }
    }
    if (!this.demo) this.now = Date.now();
  }

  // ---------------- lookups ----------------

  cellOf(r: HelpRequest): number {
    return r.lat != null && r.lon != null ? latLonCell(this.m, r.lat, r.lon) : -1;
  }

  team(id: string | null | undefined): TeamState | undefined {
    return this.teams.find((t) => t.team.id === id);
  }

  teamCell(t: TeamState): number {
    return Math.floor(t.pos[1]) * this.m.C + Math.floor(t.pos[0]);
  }

  /** Counts per village: what the public view shows. */
  counts(): HelpCount[] {
    if (!this.requests.length) return this.byVillage;
    return this.byVillage.map((v) => {
      const rs = this.requests.filter((r) => r.village === v.village);
      return {
        ...v,
        open: rs.filter((r) => r.status === "open" || r.status === "paged").length,
        on_the_way: rs.filter((r) => r.status === "claimed" || r.status === "arrived").length,
        safe: rs.filter((r) => r.status === "rescued").length,
      };
    });
  }

  // ---------------- routes ----------------

  /** A team's route to a cell, and minutes to get there at its speed. */
  teamRoute(t: TeamState, to: number): Route | null {
    const m = this.m;
    const kind: TeamKind = t.team.kind;
    const boat = kind !== "tractor";
    const cost = (i: number) => {
      const deep = this.water.deep(i) || m.channel[i] === 1;
      const shallow = this.water.shallow(i);
      if (boat) {
        if (m.emb[i]) return 4; // carried over the bank
        return deep || shallow || m.cls[i] === CLS.water || m.cls[i] === CLS.wetland ? 1 : 2.5;
      }
      if (m.emb[i]) return 0.6; // the crest is the road
      if (shallow) return 2.2;
      return 1;
    };
    const ok = (i: number) => boat || !(this.water.deep(i) || m.channel[i] === 1);
    return this.route(this.teamCell(t), (i) => i === to, ok, cost, t.team.speed_kmh || 6);
  }

  /** A family's walk from a cell to the nearest camp over dry ground; null if water cuts them off. */
  walkToCamp(from: number): (Route & { camp: string; camp_en: string; campCell: number }) | null {
    const m = this.m;
    const camps = new Map<number, { hi: string; en: string }>();
    for (const v of m.villages) if (v.camp) camps.set(v.camp.cell, { hi: v.camp.name_hi, en: v.camp.name_en });
    const ok = (i: number) => !(this.water.deep(i) || m.channel[i] === 1) && m.side[i] !== -1;
    const cost = (i: number) => (m.emb[i] ? 0.8 : this.water.shallow(i) ? 4 : 1);
    const r = this.route(from, (i) => camps.has(i), ok, cost, WALK_KMH);
    if (!r) return null;
    const end = r.cells[r.cells.length - 1];
    const c = camps.get(end)!;
    return { ...r, camp: c.hi, camp_en: c.en, campCell: end };
  }

  private route(from: number, isTarget: (i: number) => boolean, ok: (i: number) => boolean, cost: (i: number) => number, kmh: number): Route | null {
    if (from < 0) return null;
    if (isTarget(from)) return { cells: [from], km: 0, min: 0 };
    const cells = shortestPath(this.m, from, isTarget, ok, cost);
    if (!cells) return null;
    let km = 0;
    let weighted = 0;
    for (let k = 1; k < cells.length; k++) {
      const a = cells[k - 1];
      const b = cells[k];
      const d = Math.hypot((a % this.m.C) - (b % this.m.C), Math.floor(a / this.m.C) - Math.floor(b / this.m.C)) * this.m.cellKm;
      km += d;
      weighted += d * cost(b);
    }
    return { cells, km, min: (weighted / kmh) * 60 };
  }

  /** The nearest free team to a cell, by minutes; optionally skipping some. */
  nearestFree(cell: number, skip: Set<string> = new Set()): { t: TeamState; route: Route } | null {
    let best: { t: TeamState; route: Route } | null = null;
    for (const t of this.teams) {
      if (t.team.status !== "free" || skip.has(t.team.id)) continue;
      const route = this.teamRoute(t, cell);
      if (route && (!best || route.min < best.route.min)) best = { t, route };
    }
    return best;
  }

  // ---------------- actions ----------------

  private say(hi: string, en: string, tone?: LogLine["tone"]) {
    this.log.unshift({ at: this.now, hi, en, tone });
    this.log.length = Math.min(this.log.length, 12);
  }

  private startDrive(t: TeamState, r: HelpRequest) {
    const to = this.cellOf(r);
    const route = this.teamRoute(t, to);
    if (!route) return;
    const pts: Pt[] = [t.pos, ...route.cells.slice(1).map((i): Pt => [(i % this.m.C) + 0.5, Math.floor(i / this.m.C) + 0.5])];
    const acc = [0];
    for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    t.drive = { pts, acc, t0: this.now, ms: Math.max(1, route.min) * MIN, help: r.id };
    t.team.status = "on_the_way";
    t.team.help_id = r.id;
  }

  /** "मैं जा रहा हूँ": a team takes a request and its 20-minute clock starts. */
  claim(id: string, teamId: string): boolean {
    const r = this.requests.find((x) => x.id === id);
    const t = this.team(teamId);
    if (!r || !t || t.team.status !== "free" || r.status === "rescued" || r.status === "arrived") return false;
    r.status = "claimed";
    r.team = teamId;
    r.claimed = new Date(this.now).toISOString();
    r.deadline = new Date(this.now + this.answerMin * MIN).toISOString();
    this.startDrive(t, r);
    this.say(`${t.team.name_hi} ${this.villageHi(r.village)} जा रही है; ${this.answerMin} मिनट की घड़ी शुरू`, `${t.team.name_en} is going to ${r.village}; the ${this.answerMin}-minute clock starts`);
    return true;
  }

  /** "सुरक्षित": the family is safe. */
  rescue(id: string, fromOtherWindow = false): boolean {
    const r = this.requests.find((x) => x.id === id);
    // another window's team may reach the family a frame before this window's copy does
    if (!r || r.status === "rescued" || (r.status !== "arrived" && !fromOtherWindow)) return false;
    r.status = "rescued";
    r.rescued = new Date(this.now).toISOString();
    const t = this.team(r.team);
    if (t) {
      t.team.status = "free";
      t.team.help_id = null;
      t.drive = null;
    }
    this.say(`${this.villageHi(r.village)}: ${r.people} लोग सुरक्षित`, `${r.village}: ${r.people} people safe`, "ok");
    return true;
  }

  /** "मदद चाहिए" from the family view, at a cell. */
  raise(cell: number, people: number, needs: HelpNeed[], elderly = 0, children = 0, from?: { id: string }): HelpRequest {
    const [lat, lon] = cellLatLon(this.m, cell);
    const village = this.villageNear(cell);
    if (from) {
      const n = Number(from.id.replace(/\D/g, ""));
      if (Number.isFinite(n)) this.seq = Math.max(this.seq, n + 1);
    }
    const r: HelpRequest = {
      id: from?.id ?? `HELP-0${this.seq++}`,
      village,
      lat: +lat.toFixed(4),
      lon: +lon.toFixed(4),
      people,
      elderly,
      children,
      needs,
      channel: "web",
      status: "open",
      team: null,
      raised: new Date(this.now).toISOString(),
      claimed: null,
      deadline: null,
      arrived: null,
      rescued: null,
      climbs: 0,
      sample: true,
    };
    this.requests.unshift(r);
    if (!from) this.mine = r.id;
    this.say(`${this.villageHi(village)} से नई मदद की माँग: ${people} लोग`, `New call for help from ${village}: ${people} people`);
    return r;
  }

  villageNear(cell: number): string {
    let best = this.m.villages[0]?.key ?? "";
    let bd = Infinity;
    for (const v of this.m.villages) {
      const d = Math.hypot((v.cell % this.m.C) - (cell % this.m.C), Math.floor(v.cell / this.m.C) - Math.floor(cell / this.m.C));
      if (d < bd) {
        bd = d;
        best = v.key;
      }
    }
    return best;
  }

  villageHi(key: string): string {
    return this.m.villages.find((v) => v.key === key)?.name_hi ?? key;
  }

  // ---------------- the clock ----------------

  /** Advances the demo clock by dt real milliseconds. Returns true if anything changed. */
  tick(dtMs: number): boolean {
    if (!this.demo) {
      this.now = Date.now();
      return false;
    }
    this.now += dtMs * this.rate * 60;
    let changed = false;
    // teams drive
    for (const t of this.teams) {
      const d = t.drive;
      if (!d) continue;
      const k = Math.min(1, (this.now - d.t0) / d.ms);
      t.pos = along(d, k);
      if (k >= 1) {
        t.drive = null;
        const r = this.requests.find((x) => x.id === d.help);
        if (r && (r.status === "claimed" || r.status === "paged")) {
          r.status = "arrived";
          r.team = t.team.id;
          r.arrived = new Date(this.now).toISOString();
          t.team.status = "on_site";
          this.say(`${t.team.name_hi} ${this.villageHi(r.village)} पहुँची`, `${t.team.name_en} reached ${r.village}`, "ok");
          // anyone else on the way to this family can turn back
          for (const o of this.teams)
            if (o !== t && o.team.help_id === r.id) {
              o.drive = null;
              o.team.status = "free";
              o.team.help_id = null;
            }
        } else {
          t.team.status = "free";
          t.team.help_id = null;
        }
        changed = true;
      }
    }
    // the answer clock: late means the next team is asked, and the late one keeps going
    for (const r of this.requests) {
      if (r.status !== "claimed" || !r.deadline || this.now < Date.parse(r.deadline)) continue;
      r.climbs = (r.climbs ?? 0) + 1;
      r.deadline = null;
      const late = this.team(r.team);
      const busy = new Set(this.teams.filter((t) => t.team.help_id === r.id).map((t) => t.team.id));
      const next = this.nearestFree(this.cellOf(r), busy);
      const lateHi = late?.team.name_hi ?? "टीम";
      const lateEn = late?.team.name_en ?? "The team";
      if (next) {
        r.status = "paged";
        r.team = next.t.team.id;
        this.say(
          `${this.answerMin} मिनट पूरे, ${lateHi} नहीं पहुँची: ${next.t.team.name_hi} को भेजा, ज़िले को ख़बर`,
          `${this.answerMin} minutes up and ${lateEn} hasn't arrived: ${next.t.team.name_en} is asked, the district is told`,
          "late",
        );
      } else {
        this.say(`${this.answerMin} मिनट पूरे, ${lateHi} नहीं पहुँची: कोई टीम ख़ाली नहीं, ज़िला नियंत्रण कक्ष को ख़बर`, `${this.answerMin} minutes up and ${lateEn} hasn't arrived: no team is free, the district control room is told`, "late");
      }
      changed = true;
    }
    // the other teams act on their own, a couple of demo minutes after they're asked
    for (const r of this.requests) {
      const actor = this.team(r.team);
      const isMine = (t?: TeamState) => !!t && (t.team.id === this.myTeam || this.humanTeams.has(t.team.id));
      const wait = (key: string, mins: number) => {
        const due = this.pending.get(key);
        if (due == null) {
          this.pending.set(key, this.now + mins * MIN);
          return false;
        }
        if (this.now < due) return false;
        this.pending.delete(key);
        return true;
      };
      if (r.status === "paged" && actor && !isMine(actor) && actor.team.status === "free" && wait(`claim:${r.id}:${actor.team.id}`, 2)) {
        const deadline = new Date(this.now + this.answerMin * MIN).toISOString();
        r.status = "claimed";
        r.claimed = new Date(this.now).toISOString();
        r.deadline = deadline;
        this.startDrive(actor, r);
        this.say(`${actor.team.name_hi} ने माँग ली: मैं जा रहा हूँ`, `${actor.team.name_en} took it: on my way`);
        changed = true;
      } else if (r.status === "paged" && actor && actor.team.status !== "free" && actor.team.help_id !== r.id && wait(`repage:${r.id}:${actor.team.id}`, 1)) {
        // the team that was asked got busy first: ask the next free one
        const next = this.nearestFree(this.cellOf(r), new Set([actor.team.id]));
        if (next) {
          r.team = next.t.team.id;
          this.say(`${actor.team.name_hi} व्यस्त: ${next.t.team.name_hi} से माँगा`, `${actor.team.name_en} is busy: ${next.t.team.name_en} is asked`);
          changed = true;
        }
      } else if (r.status === "open" && r.id === this.mine && wait(`auto:${r.id}`, this.autoPageMin)) {
        const next = this.nearestFree(this.cellOf(r), this.myTeam ? new Set([this.myTeam]) : new Set());
        if (next) {
          r.team = next.t.team.id;
          r.status = "paged";
          this.say(`सबसे पास की ख़ाली टीम, ${next.t.team.name_hi}, को भेजा`, `The nearest free team, ${next.t.team.name_en}, is asked`);
        } else this.say("सभी टीमें व्यस्त: ज़िला नियंत्रण कक्ष को ख़बर", "Every team is busy: the district control room is told", "late");
        changed = true;
      } else if (r.status === "arrived" && actor && !isMine(actor) && wait(`safe:${r.id}`, 3)) {
        this.rescue(r.id);
        changed = true;
      }
    }
    return changed;
  }

  /** Is anything moving or counting down? (So the map knows to keep drawing.) */
  get busy(): boolean {
    return this.demo && (this.teams.some((t) => t.drive) || this.requests.some((r) => r.status !== "rescued"));
  }

  /** Minutes left on a claimed request's clock (negative if late). */
  minutesLeft(r: HelpRequest): number | null {
    return r.deadline ? (Date.parse(r.deadline) - this.now) / MIN : null;
  }

  minutesSince(iso: string | null | undefined): number {
    return iso ? (this.now - Date.parse(iso)) / MIN : 0;
  }

  /** A driving team's minutes to arrival. */
  eta(t: TeamState): number | null {
    return t.drive ? Math.max(0, (t.drive.t0 + t.drive.ms - this.now) / MIN) : null;
  }
}

function along(d: Drive, k: number): Pt {
  const s = d.acc[d.acc.length - 1] * k;
  for (let i = 1; i < d.pts.length; i++) {
    if (s <= d.acc[i]) {
      const u = (s - d.acc[i - 1]) / (d.acc[i] - d.acc[i - 1] || 1);
      return [d.pts[i - 1][0] + (d.pts[i][0] - d.pts[i - 1][0]) * u, d.pts[i - 1][1] + (d.pts[i][1] - d.pts[i - 1][1]) * u];
    }
  }
  return d.pts[d.pts.length - 1];
}
