// The page talks to the public API in docs/SPEC.md. With no VITE_API_BASE it runs on
// the mock JSON in web/mock/, which has the same shapes, and says so on screen.

import type {
  DemoStart,
  Execution,
  Gauges,
  HelpList,
  HelpRequest,
  Incident,
  Incidents,
  MapGrid,
  NewHelp,
  NewIncident,
  Sign,
  Stretch,
  TeamPosition,
  Teams,
  Timeline,
} from "./types";
import stretchMock from "../mock/stretch.json";
import gaugesMock from "../mock/gauges.json";
import incidentsMock from "../mock/incidents.json";
import timelineMock from "../mock/timeline.INC-0930-14.json";
import executionMock from "../mock/execution.INC-0930-14.json";
import helpMock from "../mock/help.json";
import teamsMock from "../mock/teams.json";

const BASE: string = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
export const usingMocks = BASE === "";

/** A relief or district role token unlocks exact pins (GET /help) and team actions. */
const auth = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

async function get<T>(path: string, mock: unknown, token?: string): Promise<T> {
  if (usingMocks) return structuredClone(mock) as T;
  const res = await fetch(BASE + path, { headers: { accept: "application/json", ...auth(token) } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...auth(token) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} answered ${res.status}`);
  return (await res.json()) as T;
}

/** The judge path answers 409 (busy, or a late tap) and 429 (daily cap) with a body the page reads. */
async function postDemo<T>(path: string, body: unknown): Promise<T & { status: number }> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ...data, status: res.status };
}

export const api = {
  stretch: () => get<Stretch>("/stretch", stretchMock),
  gauges: () => get<Gauges>("/gauges", gaugesMock),
  openIncidents: () => get<Incidents>("/incidents?status=open", incidentsMock),
  timeline: (id: string) => get<Timeline>(`/incidents/${encodeURIComponent(id)}/timeline`, timelineMock),
  execution: (id: string) => get<Execution>(`/incidents/${encodeURIComponent(id)}/execution`, executionMock),

  /** The live map's grid: terrain, land cover and the latest satellite water (daily Lambda). */
  map: async (stretch: string): Promise<MapGrid> => {
    const built = async () => structuredClone((await import("../mock/map.haijalpur.json")).default) as unknown as MapGrid;
    if (usingMocks) return built();
    // until the daily satellite Lambda serves GET /map, the grid built from AWS Open Data ships with the page
    return get<MapGrid>(`/map/${encodeURIComponent(stretch)}`, null).catch(built);
  },
  /** Open help requests. Without a relief or district token, counts per village only. */
  help: (token?: string) => get<HelpList>("/help?status=open", helpMock, token),
  /** Relief teams' latest positions from the Amazon Location Service tracker. */
  teams: () => get<Teams>("/teams", teamsMock),

  /** Control-room form for helpline calls. On mocks the incident lives only in this tab. */
  async createIncident(body: NewIncident): Promise<Incident> {
    if (usingMocks) {
      const now = new Date();
      return {
        id: `INC-DEMO-${now.getTime().toString(36).slice(-5).toUpperCase()}`,
        km: body.km,
        sign: body.sign,
        priority: "P3",
        status: "paged",
        with_role: "junior_engineer",
        opened: now.toISOString(),
        deadline: now.toISOString(),
        villages: [body.village],
        channel: "helpline",
        summary_hi: body.note ?? "",
        summary_en: body.note ?? "",
      };
    }
    return post<Incident>("/incidents", body);
  },

  // The judge path: a real Step Functions run on the phones drawn on the page (never a real phone).
  demoStart: (sign: Sign) => postDemo<DemoStart>("/demo/runs", { sign }),
  demoCurrent: () => get<{ incident: string }>("/demo/runs/current", { incident: "" }),
  demoAnswer: (wait: string, action: string, role?: string) => postDemo<{ ok: boolean; reason?: string }>("/demo/answer", { wait, action, role }),

  // The help actions. On mocks the live map's demo clock plays them out in this tab only.
  createHelp: (body: NewHelp) => post<HelpRequest>("/help", body),
  claimHelp: (id: string, team: string, token: string) => post<HelpRequest>(`/help/${encodeURIComponent(id)}/claim`, { team }, token),
  rescued: (id: string, token: string) => post<HelpRequest>(`/help/${encodeURIComponent(id)}/rescued`, {}, token),
  teamPosition: (id: string, pos: TeamPosition, token: string) => post<{ ok: true }>(`/teams/${encodeURIComponent(id)}/position`, pos, token),
};
