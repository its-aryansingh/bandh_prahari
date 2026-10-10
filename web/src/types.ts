// Shapes of the public API in docs/SPEC.md ("The public API").
// The mock JSON in web/mock/ uses exactly these shapes.

export type Trend = "rising" | "falling" | "steady";
export type Level = "saavdhan" | "taiyaar" | "nikal_chalo" | "khatra_tala";
export type Priority = "P1" | "P2" | "P3";
export type Sign =
  | "overtopping"
  | "boil_soil"
  | "top_slumping"
  | "boil_clear"
  | "slip"
  | "crack"
  | "seepage_clear"
  | "seepage_soil"
  | "rathole";

export interface Village {
  name: string;
  name_hi: string;
  lgd_code: string | null;
  panchayat: string | null;
  block: string | null;
  district: string;
  behind_km: [number, number] | null;
  gauge: string;
  relief_camp_hi: string | null;
  relief_camp_en: string | null;
  wards: { ward: number; households: number }[];
  on_stretch: boolean;
  /** Approximate centre of the settlement, for the live map. Null until filled from OpenStreetMap. */
  lat?: number | null;
  lon?: number | null;
  /** True while lat/lon is our estimate from built-up cells, not a surveyed point. */
  approx?: boolean;
}

export interface Segment {
  km: number;
  villages: string[];
  gauge: string;
  breach_last_5y: boolean;
  vulnerable: boolean;
}

export interface GaugeSite {
  site: string;
  site_hi: string;
  river: string;
  district: string;
  dl_m: number;
  hfl_m?: number;
  source: string;
}

export interface Stretch {
  stretch: {
    id: string;
    name_hi: string;
    name_en: string;
    river: string;
    block: string;
    district: string;
    length_km: number;
    km_note_hi: string;
    km_note_en: string;
  };
  segments: Segment[];
  villages: Village[];
  gauges: GaugeSite[];
  sample: boolean;
}

export interface Reading {
  site: string;
  site_hi: string;
  river: string;
  district: string;
  wl_m: number;
  dl_m: number;
  hfl_m?: number;
  hfl_date?: string;
  trend: Trend;
  time: string;
  source: string;
  source_url: string;
  sample: boolean;
}

export interface Alert {
  identifier: string;
  sender: string;
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  description: string;
  area: string;
  effective: string;
  expires: string;
  sample: boolean;
}

export interface Gauges {
  as_of: string;
  readings: Reading[];
  alerts: Alert[];
  glofas: {
    cell: string;
    source: string;
    unit: string;
    note: string;
    series: { date: string; q: number; forecast: boolean }[];
  };
}

export interface Incident {
  id: string;
  km: number;
  sign: Sign;
  priority: Priority;
  status: string;
  with_role: string;
  opened: string;
  deadline: string;
  villages: string[];
  channel: "whatsapp" | "helpline";
  summary_hi: string;
  summary_en: string;
}

export interface Incidents {
  as_of: string;
  sample: boolean;
  incidents: Incident[];
}

export interface TimelineEvent {
  at: string;
  kind: string;
  actor?: string;
  text_hi: string;
  text_en: string;
  level?: Level;
  count?: number;
  of?: number;
  to?: string;
  transcript_hi?: string;
  transcript_roman?: string;
  [k: string]: unknown;
}

export interface Timeline {
  incident: {
    id: string;
    km: number;
    sign: Sign;
    priority: Priority;
    status: string;
    villages: string[];
    reenactment: boolean;
    note_hi: string;
    note_en: string;
  };
  events: TimelineEvent[];
}

export interface ExecutionState {
  name: string;
  entered: string;
  exited: string;
  status: "succeeded" | "timed_out" | "failed" | "running";
  detail: string | null;
}

export interface Execution {
  executionArn: string;
  type: string;
  sample: boolean;
  states: ExecutionState[];
}

export interface NewIncident {
  km: number;
  sign: Sign;
  village: string;
  caller?: string;
  note?: string;
}

// ---------- The live map (GET /map/{stretch}), help requests and relief teams ----------

/** A satellite pass reduced to the map grid: percent of each cell seen as water (and cloud, for optical). */
export interface SatPass {
  id: string;
  date: string;
  cloud_cover?: number;
  water: number[];
  cloud?: number[];
}

/** The stretch as a grid of about 200 m cells, built from AWS Open Data (tools/build_map.py, then the daily Lambda). */
export interface MapGrid {
  stretch?: string;
  /** West, south, east, north in degrees. */
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  cell_m: number;
  /** Copernicus DEM GLO-30, decimetres, row-major from the north-west corner. */
  elev_dm: number[];
  /** ESA WorldCover class of the cell (10 trees, 30 grass, 40 crop, 50 built, 60 bare, 80 water, 90 wetland). */
  cls: number[];
  /** Percent of the cell's 10 m pixels that are built-up. */
  built: number[];
  /** Sentinel-2 L2A optical pass: water from NDWI, cloud from the SCL band. */
  s2: SatPass | null;
  /** Sentinel-1 GRD radar pass: sees through cloud. Null until the daily Lambda runs with the account's credentials. */
  s1?: SatPass | null;
  sources: Record<string, string>;
  built_at: string;
}

/** open: waiting for a team. paged: the clock climbed and asked a named team. claimed: a team
 * tapped "मैं जा रहा हूँ" and the 20-minute clock runs. arrived: on site. rescued: "सुरक्षित". */
export type HelpStatus = "open" | "paged" | "claimed" | "arrived" | "rescued";
export type HelpNeed = "boat" | "medical" | "food" | "animals";

/** A family's call for help. No names and no phone numbers, ever: counts and a pin. */
export interface HelpRequest {
  id: string;
  village: string;
  /** Present only for relief and district callers; the public view gets counts per village. */
  lat?: number;
  lon?: number;
  people: number;
  elderly?: number;
  children?: number;
  needs: HelpNeed[];
  channel: "whatsapp" | "helpline" | "web";
  status: HelpStatus;
  team?: string | null;
  raised: string;
  claimed?: string | null;
  /** When the team must arrive by (claim time + 20 minutes); passing it climbs to the next team. */
  deadline?: string | null;
  arrived?: string | null;
  rescued?: string | null;
  climbs?: number;
  sample: boolean;
}

export interface HelpCount {
  village: string;
  open: number;
  on_the_way: number;
  safe: number;
  /** Households that tapped "हो गया" for the latest warning (READY#), and all households. */
  ready: number;
  households: number;
}

export interface HelpList {
  as_of: string;
  sample: boolean;
  /** Minutes a claiming team has to reach the family before the request climbs to the next team. */
  answer_min: number;
  /** Always present: what the public view shows. */
  by_village: HelpCount[];
  /** Exact requests, only for a relief or district token. */
  requests?: HelpRequest[];
}

export interface NewHelp {
  lat: number;
  lon: number;
  people: number;
  elderly?: number;
  children?: number;
  needs?: HelpNeed[];
  channel: "whatsapp" | "helpline" | "web";
}

export type TeamKind = "boat" | "tractor" | "sdrf";

export interface Team {
  id: string;
  kind: TeamKind;
  name_hi: string;
  name_en: string;
  crew: number;
  lat: number;
  lon: number;
  /** Time of the last position from the Amazon Location tracker. */
  at: string;
  status: "free" | "on_the_way" | "on_site";
  help_id?: string | null;
  /** Typical speed in flood conditions, for minutes-to-reach. */
  speed_kmh: number;
  sample: boolean;
}

export interface Teams {
  as_of: string;
  sample: boolean;
  /** The Amazon Location Service tracker the positions come from. */
  tracker: string;
  teams: Team[];
}

export interface TeamPosition {
  lat: number;
  lon: number;
  accuracy_m?: number;
  at: string;
}
