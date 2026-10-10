// The page talks to the public API in docs/SPEC.md. With no VITE_API_BASE it runs on
// the mock JSON in web/mock/, which has the same shapes, and says so on screen.

import type { Execution, Gauges, Incident, Incidents, NewIncident, Stretch, Timeline } from "./types";
import stretchMock from "../mock/stretch.json";
import gaugesMock from "../mock/gauges.json";
import incidentsMock from "../mock/incidents.json";
import timelineMock from "../mock/timeline.INC-0930-14.json";
import executionMock from "../mock/execution.INC-0930-14.json";

const BASE: string = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
export const usingMocks = BASE === "";

async function get<T>(path: string, mock: unknown): Promise<T> {
  if (usingMocks) return structuredClone(mock) as T;
  const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  stretch: () => get<Stretch>("/stretch", stretchMock),
  gauges: () => get<Gauges>("/gauges", gaugesMock),
  openIncidents: () => get<Incidents>("/incidents?status=open", incidentsMock),
  timeline: (id: string) => get<Timeline>(`/incidents/${encodeURIComponent(id)}/timeline`, timelineMock),
  execution: (id: string) => get<Execution>(`/incidents/${encodeURIComponent(id)}/execution`, executionMock),

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
    const res = await fetch(BASE + "/incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST /incidents answered ${res.status}`);
    return (await res.json()) as Incident;
  },
};
