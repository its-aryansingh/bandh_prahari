// The control room: the register of open incidents with live clocks, the helpline form
// that puts a call on the same clock, a register row that opens into the whole incident
// (kit effect 03, card to workspace), and the "homes ready" tile that zooms forward
// (kit effect 06, dashboard zoom).
import { api, usingMocks } from "../api";
import { icon } from "../art/icons";
import { face } from "../art/people";
import { ANSWER_MIN, ROLES, SIX_SIGNS, priorityFor, signById } from "../content";
import { $, bi, bil, clockEn, clockHi, esc, h } from "../lib/dom";
import { eio, lerp, reducedMotion, tween } from "../lib/motion";
import type { Gauges, Incident, Incidents, Priority, Sign, Stretch } from "../types";

interface Row {
  inc: Incident;
  deadlineAt: number; // ms, page time
  total: number; // seconds the current person had
  fresh?: boolean;
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh > 0 ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
};

export function initControl(stretch: Stretch, gauges: Gauges, incidents: Incidents): void {
  const list = $("#register-rows");
  if (!incidents.sample) $("#register-sample").remove();
  const asOf = Date.parse(incidents.as_of);
  const now0 = Date.now();
  const rows: Row[] = incidents.incidents.map((inc) => {
    const left = (Date.parse(inc.deadline) - asOf) / 1000;
    return { inc, deadlineAt: now0 + left * 1000, total: ANSWER_MIN[inc.priority] * 60 };
  });

  const vName = (en: string) => stretch.villages.find((v) => v.name === en)?.name_hi ?? en;
  const role = (id: string) => ROLES.find((r) => r.id === id);

  const rowHtml = (r: Row, i: number) => {
    const s = signById(r.inc.sign);
    const who = role(r.inc.with_role);
    return `<li><button type="button" class="reg-row ${r.fresh ? "fresh" : ""}" data-i="${i}" aria-haspopup="dialog">
      <span class="km" aria-label="km ${r.inc.km}">${r.inc.km}</span>
      ${icon(s.icon, "ic sign")}
      <span class="what"><strong>${bil(s.hi, s.en)}</strong><span>${bil(`${r.inc.villages.map(vName).join(", ")} के पीछे`, `Behind ${r.inc.villages.join(", ")}`)}, ${who ? bil(`अभी ${who.hi} के पास`, `with the ${who.en.toLowerCase()}`) : ""}</span></span>
      <span class="ghadi-mini"><span class="prio ${r.inc.priority}">${r.inc.priority}</span><span class="cd" data-cd="${i}">${fmt((r.deadlineAt - Date.now()) / 1000)}</span><small>${bil("जवाब के लिए", "to answer")}</small></span>
    </button></li>`;
  };
  const draw = () => {
    list.innerHTML = rows.map(rowHtml).join("");
    rows.forEach((r) => (r.fresh = false));
  };
  draw();
  const tick = () => {
    rows.forEach((r, i) => {
      const el = list.querySelector<HTMLElement>(`[data-cd="${i}"]`);
      if (!el) return;
      const left = (r.deadlineAt - Date.now()) / 1000;
      el.textContent = left > 0 ? fmt(left) : "0:00";
      el.closest(".reg-row")!.classList.toggle("late", left <= 0);
    });
  };
  setInterval(tick, 1000);

  // ---------- "homes ready" tile, and its zoom ----------
  const READY = 18;
  const NO_REPLY = [3, 8, 11, 14, 19, 22, 24];
  $("#ready-dots").innerHTML = Array.from({ length: 25 }, (_, i) => `<i class="${NO_REPLY.includes(i + 1) ? "" : "on"}"></i>`).join("");
  $("#ready-count").textContent = `${READY}/25`;
  const tile = $<HTMLButtonElement>("#ready-tile");
  tile.addEventListener("click", () => zoomOpen(tile, NO_REPLY));

  // ---------- helpline form ----------
  const grid = $("#sign-grid");
  grid.innerHTML = SIX_SIGNS.map((id, i) => {
    const s = signById(id);
    return `<label><input type="radio" name="sign" value="${id}" ${i === 1 ? "checked" : ""}/><span class="opt">${icon(s.icon, "ic sign")}${bil(s.hi, s.en)}</span></label>`;
  }).join("");
  const kmSel = $<HTMLSelectElement>("#pi-km");
  kmSel.innerHTML = stretch.segments.map((s) => `<option value="${s.km}" ${s.km === 9 ? "selected" : ""}>${s.km}</option>`).join("");
  const vSel = $<HTMLSelectElement>("#pi-village");
  vSel.innerHTML = stretch.villages
    .filter((v) => v.on_stretch)
    .map((v) => `<option value="${esc(v.name)}">${esc(v.name_hi)} / ${esc(v.name)}</option>`)
    .join("");
  const form = $<HTMLFormElement>("#phonein");
  const result = $("#pi-result");
  const nearest = gauges.readings.find((r) => r.site === "Rewaghat") ?? gauges.readings[0];
  const river = { aboveDanger: nearest.wl_m >= nearest.dl_m, rising: nearest.trend === "rising" };

  const preview = () => {
    const sign = (new FormData(form).get("sign") as Sign) ?? "boil_soil";
    const km = Number(kmSel.value);
    const seg = stretch.segments.find((s) => s.km === km);
    const p = priorityFor(sign, river, seg);
    result.innerHTML = `<span class="prio ${p.priority}">${p.priority}</span>
      <span class="pair">${bi(`जेई को ${ANSWER_MIN[p.priority]} मिनट में जवाब देना होगा। ${p.why_hi}।`, `The junior engineer has ${ANSWER_MIN[p.priority]} minutes to answer. ${p.why_en}.`)}</span>`;
    return { sign, km, priority: p.priority };
  };
  form.addEventListener("change", preview);
  preview();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { sign, km, priority } = preview();
    const village = vSel.value;
    const caller = ($<HTMLInputElement>("#pi-caller").value || "").trim();
    try {
      const inc = await api.createIncident({ km, sign, village, caller: caller || undefined, note: caller ? `Caller: ${caller}` : undefined });
      inc.priority = priority as Priority;
      inc.summary_hi = signById(sign).hi;
      inc.summary_en = signById(sign).en;
      const total = ANSWER_MIN[inc.priority] * 60;
      rows.unshift({ inc, deadlineAt: Date.now() + total * 1000, total, fresh: true });
      draw();
      result.innerHTML = `<span class="stamp dhaan" style="--tilt:-4deg">${bil("दर्ज", "Logged")}</span>
        <span class="pair">${bi(`घड़ी शुरू: जेई (डेमो) को पेज गया।${usingMocks ? " नमूना: कोई असली पेज नहीं गया।" : ""}`, `The clock is running: the junior engineer (demo) is paged.${usingMocks ? " Sample: no real page was sent." : ""}`)}</span>`;
    } catch (err) {
      result.innerHTML = `<span class="pair">${bi("कॉल दर्ज नहीं हुई। इंटरनेट देखें और फिर से दबाएँ।", "The call wasn't logged. Check the connection and press again.")}</span>`;
      console.error(err);
    }
  });

  // ---------- a register row opens into the incident ----------
  list.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".reg-row");
    if (!b) return;
    const r = rows[Number(b.dataset.i)];
    workspaceOpen(b, r, vName);
  });
}

// ---------- overlays ----------
let veil: HTMLElement | null = null;
const getVeil = (): HTMLElement => {
  if (!veil) {
    veil = h<HTMLElement>(`<div class="veil" hidden></div>`);
    document.body.append(veil);
  }
  return veil;
};

/** FLIP a ghost from the source rect to the target rect, then reveal the target. */
async function grow(from: HTMLElement, target: HTMLElement, colour: string) {
  if (reducedMotion()) return;
  const a = from.getBoundingClientRect();
  target.style.visibility = "hidden";
  target.hidden = false;
  const b = target.getBoundingClientRect();
  const ghost = h<HTMLDivElement>(`<div style="position:fixed;z-index:165;border:2.5px solid var(--neel);background:${colour};pointer-events:none"></div>`);
  document.body.append(ghost);
  await tween(480, (p) => {
    const k = eio(p);
    Object.assign(ghost.style, {
      left: `${lerp(a.left, b.left, k)}px`,
      top: `${lerp(a.top, b.top, k)}px`,
      width: `${lerp(a.width, b.width, k)}px`,
      height: `${lerp(a.height, b.height, k)}px`,
      borderRadius: `${lerp(14, 22, k)}px`,
      boxShadow: `${lerp(3, 8, k)}px ${lerp(3, 9, k)}px 0 var(--neel)`,
    });
  });
  target.style.visibility = "";
  ghost.remove();
}

function makeZoom(noReply: number[]): HTMLElement {
  const z = h<HTMLElement>(`<div class="zoom" id="zoom" role="dialog" aria-modal="true" aria-labelledby="zoom-title" hidden>
      <button type="button" class="icon-btn" aria-label="बंद करें / Close">${icon("close")}</button>
      <p class="pair small" id="zoom-title">${bi("हैजलपुर, वार्ड 7: 'तैयार रहें' पर 'हो गया'", "Haijalpur, ward 7: homes that tapped Done on 'Get ready'")}</p>
      <p class="big">18/25</p>
      <div class="dots">${Array.from({ length: 25 }, (_, i) => `<span class="${noReply.includes(i + 1) ? "" : "on"}">${i + 1}</span>`).join("")}</div>
      <p class="pair">${bi(`जवाब नहीं आया: घर ${noReply.join(", ")}। वार्ड सदस्य को सूची मिल चुकी है।`, `No reply yet: homes ${noReply.join(", ")}. The ward member already has the list.`)}</p>
      <button type="button" class="btn small" data-resend>${icon("send")}${bil("इन्हें फिर से भेजें", "Send to these again")}</button>
      <p class="tiny dim pair">${bi("नमूना। गिनती घरों के हैश से होती है, नंबर नहीं रखे जाते।", "Sample. Counted by a hash of each phone; numbers are not kept.")}</p>
    </div>`);
  document.body.append(z);
  z.querySelector("[data-resend]")!.addEventListener("click", (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    b.innerHTML = `${icon("check")}${bil("फिर से भेजा", "Sent again")}`;
    b.setAttribute("disabled", "");
  });
  return z;
}

async function zoomOpen(from: HTMLElement, noReply: number[]) {
  const v = getVeil();
  const z = document.getElementById("zoom") ?? makeZoom(noReply);
  const close = () => {
    z.hidden = true;
    v.hidden = true;
    from.focus();
  };
  z.querySelector<HTMLButtonElement>(".icon-btn")!.onclick = close;
  v.onclick = close;
  z.onkeydown = (e) => e.key === "Escape" && close();
  v.hidden = false;
  await grow(from, z, "var(--dhaan-tint)");
  z.hidden = false;
  z.querySelector<HTMLButtonElement>(".icon-btn")!.focus();
}

async function workspaceOpen(from: HTMLElement, r: Row, vName: (s: string) => string) {
  const v = getVeil();
  document.getElementById("workspace")?.remove();
  const s = signById(r.inc.sign);
  const chain = ["junior_engineer", "assistant_engineer", "executive_engineer", "district_control_room"];
  const at = chain.indexOf(r.inc.with_role);
  const ws = h(`<div class="workspace" id="workspace" role="dialog" aria-modal="true" aria-labelledby="ws-title" hidden>
    <div class="ws-top">
      <span class="km">${r.inc.km}</span><span class="prio ${r.inc.priority}">${r.inc.priority}</span>
      <p class="ws-title" id="ws-title">${bil(`${s.hi}, किमी ${r.inc.km}`, `${s.en}, km ${r.inc.km}`)}</p>
      <button type="button" class="icon-btn" aria-label="बंद करें / Close">${icon("close")}</button>
    </div>
    <div class="ws-body">
      <div class="ws-col">
        <div class="card ws-box">
          <h3>${bil("जवाब घड़ी", "The answer clock")}</h3>
          <ol class="ws-steps">${chain
            .map((id, i) => {
              const ro = ROLES.find((x) => x.id === id)!;
              const st = i < at ? bil("चूके", "missed") : i === at ? bil("अभी", "now") : bil("अगला", "next");
              return `<li>${face(ro.face)}<span>${bil(ro.hi, ro.en)}</span><span class="st ${i === at ? "now" : "next"}">${st}</span></li>`;
            })
            .join("")}</ol>
          <p class="small dim pair" style="margin-top:10px">${bi(`हर व्यक्ति के पास ${ANSWER_MIN[r.inc.priority]} मिनट। जवाब नहीं तो अपने आप अगला।`, `Each person gets ${ANSWER_MIN[r.inc.priority]} minutes. No answer, and it moves on by itself.`)}</p>
        </div>
        <div class="card ws-box" style="--shade:var(--kesar)">
          <h3>${bil("गाँव", "Villages")}</h3>
          <p class="pair">${bi(`${r.inc.villages.map(vName).join(", ")}: ${r.inc.priority === "P1" ? "'तैयार रहें' भेजा गया" : "अभी चेतावनी नहीं, P1 पर अपने आप जाएगी"}`, `${r.inc.villages.join(", ")}: ${r.inc.priority === "P1" ? "'Get ready' sent" : "no warning yet; it goes out by itself on a P1"}`)}</p>
        </div>
      </div>
      <div class="ws-col">
        <div class="card ws-box" style="--shade:var(--dhaan-deep)">
          <h3>${bil("काग़ज़ जो अपने आप बनते हैं", "Papers that write themselves")}</h3>
          <p class="pair small">${bi("ज़िले के लिए IRS फ़ॉर्म 001 ब्रीफ़िंग, CAP 1.2 ड्राफ़्ट ('Exercise'), और बंद होने पर हिंदी-अंग्रेज़ी रिपोर्ट।", "The IRS Form 001 briefing for the district, a CAP 1.2 draft (marked Exercise), and a Hindi and English report at close.")}</p>
        </div>
        <div class="card ws-box">
          <h3>${bil("कब क्या हुआ", "What happened, when")}</h3>
          <p class="small pair">${bi(`${clockHi(r.inc.opened)}: ${r.inc.channel === "helpline" ? "हेल्पलाइन कॉल दर्ज" : "WhatsApp रिपोर्ट"}, ${r.inc.summary_hi}`, `${clockEn(r.inc.opened)}: ${r.inc.channel === "helpline" ? "helpline call logged" : "WhatsApp report"}, ${r.inc.summary_en}`)}</p>
          <button type="button" class="btn small paper" data-replay="0" style="margin-top:12px">${icon("play")}${bil("एक पूरी रात देखें", "Watch a whole night")}</button>
        </div>
      </div>
    </div>
  </div>`);
  document.body.append(ws);
  const close = () => {
    ws.hidden = true;
    v.hidden = true;
    from.focus();
  };
  ws.querySelector(".icon-btn")!.addEventListener("click", close);
  ws.querySelector("[data-replay]")!.addEventListener("click", () => {
    ws.hidden = true;
    v.hidden = true;
  });
  v.onclick = close;
  ws.addEventListener("keydown", (e) => e.key === "Escape" && close());
  v.hidden = false;
  await grow(from, ws, "var(--chuna)");
  ws.hidden = false;
  ws.querySelector<HTMLButtonElement>(".icon-btn")!.focus();
}
