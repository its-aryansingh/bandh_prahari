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
