// "Run the real clock": the judge path. One tap starts a real Step Functions run in Mumbai
// whose roster is the phones drawn here, on one-minute clocks. The phones show what the run
// sends; their buttons answer it (SendTaskSuccess). Nothing reaches a real phone.
// The run's own execution history and timeline are read back from the API every few seconds.
import { api, usingMocks } from "../api";
import { signById } from "../content";
import { $, bi, bil, clockEn, clockHi, esc } from "../lib/dom";
import type { Execution, Sign, Timeline, TimelineEvent } from "../types";

const PHONES = [
  { role: "junior_engineer", hi: "जेई", en: "Junior engineer" },
  { role: "assistant_engineer", hi: "एई", en: "Assistant engineer" },
  { role: "executive_engineer", hi: "ईई", en: "Executive engineer" },
  { role: "district_control_room", hi: "ज़िला नियंत्रण कक्ष", en: "District control room" },
  { role: "mukhiya", hi: "मुखिया, हैजलपुर", en: "Mukhiya, Haijalpur" },
];
const WAIT_KINDS = new Set(["page", "await_onsite", "hold"]);
const POLL_MS = 2500;

interface Button { id: string; hi: string; en: string }

let incident = "";
let timer = 0;
let tick = 0;
let deadline = 0;

const STATUS: Record<string, [string, string]> = {
  running: ["चल रहा", "running"],
  succeeded: ["पूरा", "done"],
  timed_out: ["समय ख़त्म, आगे", "timed out, climbs"],
  failed: ["रुका", "failed"],
};

function currentWait(events: TimelineEvent[]): string {
  const answered = new Set(events.filter((e) => e.kind === "answer").map((e) => String(e.wait)));
  const last = [...events].reverse().find((e) => WAIT_KINDS.has(e.kind) && e.wait);
  if (!last || answered.has(String(last.wait))) return "";
  deadline = Date.parse(last.at) + Number(last.deadline_s ?? 0) * 1000;
  return String(last.wait);
}

function phoneHtml(p: (typeof PHONES)[number], events: TimelineEvent[], live: string): string {
  const msgs = events.filter((e) => e.kind === "message" && e.to === p.role);
  const last = msgs.slice(-2);
  const body = last.length
    ? last
        .map((m) => {
          const btns = ((m.buttons as Button[] | undefined) ?? [])
            .map((b) => {
              const [kind, wait, action] = b.id.split(":");
              const on = kind === "a" && wait === live;
              return `<button class="btn small${on ? "" : " paper"}" type="button" data-wait="${esc(wait)}" data-action="${esc(action)}" data-role="${esc(p.role)}" ${on ? "" : "disabled"}>${bil(b.hi, b.en)}</button>`;
            })
            .join("");
          return `<div class="jmsg"><p class="pair">${bi(m.text_hi, m.text_en)}</p>${btns ? `<div class="jbtns">${btns}</div>` : ""}</div>`;
        })
        .join("")
    : `<p class="small pair jquiet">${bi("अभी कोई संदेश नहीं", "No message yet")}</p>`;
  return `<div class="jphone card"><p class="jwho">${bil(p.hi, p.en)}</p>${body}</div>`;
}

function statesHtml(x: Execution | null): string {
  if (!x) return "";
  return x.states
    .map((s) => {
      const [hi, en] = STATUS[s.status] ?? [s.status, s.status];
      return `<li class="jstate ${esc(s.status)}"><code>${esc(s.name)}</code><span class="chip">${bil(hi, en)}</span>${s.detail ? `<span class="small">${esc(s.detail)}</span>` : ""}</li>`;
    })
    .join("");
}

function eventsHtml(t: Timeline): string {
  return t.events
    .filter((e) => e.kind !== "message")
    .map((e) => `<li><time>${esc(clockHi(e.at))}<span class="en"> · ${esc(clockEn(e.at))}</span></time><span class="pair">${bi(e.text_hi, e.text_en)}</span></li>`)
    .join("");
}

async function refresh(): Promise<void> {
  if (!incident) return;
  const [t, x] = await Promise.all([api.timeline(incident), api.execution(incident).catch(() => null)]);
  const live = currentWait(t.events);
  if (!live) deadline = 0;
  $("#judge-phones").innerHTML = PHONES.map((p) => phoneHtml(p, t.events, live)).join("");
  $("#judge-states").innerHTML = statesHtml(x);
  $("#judge-log").innerHTML = eventsHtml(t);
  const closed = t.incident.status.startsWith("closed");
  $("#judge-status").innerHTML = closed
    ? bi(`रन पूरा: ${t.incident.status.replace("closed_", "")}। रिकॉर्ड S3 में (Object Lock)।`, `Run finished: ${t.incident.status.replace("closed_", "")}. The record is in S3 (Object Lock).`)
    : bi(`चल रहा: ${t.incident.id}, ${t.incident.priority}`, `Running: ${t.incident.id}, ${t.incident.priority}`);
  $<HTMLButtonElement>("#judge-start").disabled = !closed;
  if (closed) stop();
}

function countdown(): void {
  const el = $("#judge-clock");
  if (!deadline) {
    el.textContent = "";
    return;
  }
  const s = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  el.innerHTML = bi(`घड़ी: ${s} सेकंड बाकी`, `Clock: ${s} s left`);
}

function stop(): void {
  clearInterval(timer);
  clearInterval(tick);
  timer = tick = 0;
}

function watch(id: string): void {
  incident = id;
  stop();
  void refresh();
  timer = window.setInterval(() => void refresh().catch(() => undefined), POLL_MS);
  tick = window.setInterval(countdown, 1000);
}

export function initJudge(): void {
  const root = document.getElementById("judge");
  if (!root) return;
  const start = $<HTMLButtonElement>("#judge-start");
  const say = (hi: string, en: string) => ($("#judge-status").innerHTML = bi(hi, en));
  if (usingMocks) {
    start.disabled = true;
    say("यह हिस्सा तभी चलता है जब साइट API से जुड़ी हो (VITE_API_BASE)।", "This part runs only when the site is connected to the API (VITE_API_BASE).");
    return;
  }
  start.addEventListener("click", async () => {
    const sign = ($<HTMLSelectElement>("#judge-sign").value || "boil_soil") as Sign;
    start.disabled = true;
    const r = await api.demoStart(sign).catch(() => null);
    if (!r) {
      start.disabled = false;
      return say("API से जवाब नहीं आया।", "The API did not answer.");
    }
    if (r.status === 201) return watch(r.incident);
    if (r.status === 409 && r.incident) {
      say("एक डेमो पहले से चल रहा है: वही दिखा रहे हैं।", "A demo is already running: showing that one.");
      return watch(r.incident);
    }
    start.disabled = false;
    if (r.status === 429) say("आज के डेमो पूरे हो गए। कल फिर आएँ।", "Today's demo runs are used up. Come back tomorrow.");
    else say("अभी नहीं चल सका, थोड़ी देर में फिर कोशिश करें।", "Couldn't start just now; try again in a moment.");
  });
  $("#judge-phones").addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-wait]");
    if (!b || b.disabled) return;
    b.disabled = true;
    const r = await api.demoAnswer(b.dataset.wait!, b.dataset.action!, b.dataset.role).catch(() => null);
    if (r && !r.ok && r.reason === "late") say("देर हो गई: घड़ी पहले ही आगे बढ़ चुकी थी।", "Too late: the clock had already climbed.");
    void refresh();
  });
  $<HTMLSelectElement>("#judge-sign").innerHTML = (["boil_soil", "overtopping", "crack", "slip", "seepage_clear"] as Sign[])
    .map((s) => `<option value="${s}">${esc(signById(s).hi)} / ${esc(signById(s).en)}</option>`)
    .join("");
  // Someone else's run may be going: show it.
  void api.demoCurrent().then((c) => c.incident && watch(c.incident)).catch(() => undefined);
}
