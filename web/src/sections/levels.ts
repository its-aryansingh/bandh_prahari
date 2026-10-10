// The four warnings as a deck of cards (kit effect 07, spring stack): pick a level and its
// card springs to the front, overshoots its rest angle and settles. "हो गया" stamps green.
import { icon } from "../art/icons";
import { LEVELS } from "../content";
import { $, $$, bi, bil } from "../lib/dom";
import { reducedMotion } from "../lib/motion";
import type { Level } from "../types";

const WARD: Record<Level, { hi: string; en: string }> = {
  saavdhan: { hi: "वार्ड सदस्य देखते हैं: किन घरों ने 'हो गया' दबाया", en: "The ward member sees which homes tapped Done" },
  taiyaar: { hi: "वार्ड सदस्य को गिनती मिलती है: 18/25 घर तैयार", en: "The ward member gets a count: 18 of 25 homes ready" },
  nikal_chalo: { hi: "वार्ड सदस्य देखते हैं: कौन शिविर पहुँचा, कौन बाक़ी", en: "The ward member sees who reached the camp, who's left" },
  khatra_tala: { hi: "सबको जिन्हें चेतावनी मिली थी", en: "Sent to everyone who was warned" },
};

export function initLevels(): void {
  const pick = $("#level-pick");
  const deck = $("#level-deck");

  pick.innerHTML = LEVELS.map(
    (l, i) => `<button type="button" role="tab" id="lt-${l.id}" aria-controls="lc-${l.id}" aria-selected="${i === 1}" tabindex="${i === 1 ? 0 : -1}" data-level="${l.id}">
      <span class="name">${bi(l.hi, l.en).replace('class="en"', 'class="en solo"')}</span>
      <span class="imd-name">${bil(l.imd_hi, l.imd_en)}</span>
    </button>`,
  ).join("");

  deck.innerHTML = LEVELS.map(
    (l) => `<article class="lcard" id="lc-${l.id}" role="tabpanel" aria-labelledby="lt-${l.id}" data-level="${l.id}">
      <header class="lcard-head">
        <div>
          <p class="lv-name">${l.hi}</p>
          <p class="lv-en">${l.en}</p>
          <p class="lv-imd">${bil(l.imd_hi, l.imd_en)}</p>
        </div>
        <span class="cap" title="CAP 1.2 responseType">CAP: ${l.cap}</span>
      </header>
      <div class="lcard-body">
        <p class="lcard-when"><b>${bil("कब", "When")}</b><span class="pair">${bi(l.when_hi, l.when_en)}</span></p>
        <ol class="lsteps">
          ${l.steps
            .map(
              (s) => `<li>${icon(s.icon)}<span class="txt">${bi(s.hi, s.en)}</span>
              <button type="button" class="done-btn" aria-pressed="false">${icon("check")}${bil("हो गया", "Done")}</button></li>`,
            )
            .join("")}
        </ol>
        <footer class="lcard-foot">
          <span class="pair">${bi(WARD[l.id].hi, WARD[l.id].en)}</span>
          <span><span class="count" data-count>0/${l.steps.length}</span> ${bil("आपके काम", "your steps")}</span>
        </footer>
        <p class="small dim pair">${bi(`अगर ग़लत अलार्म हो: ${l.ifFalse_hi}`, `If it's a false alarm: ${l.ifFalse_en}`)}</p>
      </div>
    </article>`,
  ).join("");

  const cards = $$<HTMLElement>(".lcard", deck);
  const tabs = $$<HTMLButtonElement>("button", pick);
  let order = LEVELS.map((l) => l.id);

  // Fanned behind the front card, like a hand of cards.
  const POSE = [
    { x: 0, y: 0, r: 0, s: 1 },
    { x: 14, y: -16, r: 2.6, s: 0.97 },
    { x: 26, y: -30, r: 5, s: 0.94 },
    { x: 36, y: -42, r: 7.2, s: 0.91 },
  ];
  const layout = () => {
    cards.forEach((c) => {
      const k = order.indexOf(c.dataset.level as Level);
      const p = POSE[k];
      c.style.zIndex = String(10 - k);
      c.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${p.r}deg) scale(${p.s})`;
      c.setAttribute("aria-hidden", String(k !== 0));
      c.style.boxShadow = k === 0 ? "" : "4px 5px 0 var(--lv-deep)";
      c.querySelectorAll("button").forEach((b) => (b.tabIndex = k === 0 ? 0 : -1));
    });
    const front = cards.find((c) => c.dataset.level === order[0])!;
    deck.style.minHeight = `${front.offsetHeight + 60}px`;
  };

  const select = (id: Level, focus = false) => {
    if (order[0] === id) return;
    tabs.forEach((t) => {
      const on = t.dataset.level === id;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    const card = cards.find((c) => c.dataset.level === id)!;
    order = [id, ...order.filter((x) => x !== id)];
    if (reducedMotion()) {
      layout();
      return;
    }
    // Anticipation: the chosen card lifts out of the deck first, then springs to the front.
    card.style.zIndex = "20";
    card.style.transition = "transform 0.16s ease-out";
    card.style.transform = `translate(40px, -60px) rotate(-6deg) scale(1.02)`;
    setTimeout(() => {
      card.style.transition = "";
      layout();
    }, 160);
  };

  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t.dataset.level as Level));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = LEVELS[(i + d + LEVELS.length) % LEVELS.length].id;
      select(next, true);
    });
  });

  deck.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".done-btn");
    if (!b) return;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    const card = b.closest<HTMLElement>(".lcard")!;
    const done = card.querySelectorAll('.done-btn[aria-pressed="true"]').length;
    const total = card.querySelectorAll(".done-btn").length;
    card.querySelector("[data-count]")!.textContent = `${done}/${total}`;
  });

  order = ["taiyaar", "saavdhan", "nikal_chalo", "khatra_tala"];
  layout();
  window.addEventListener("resize", layout);
  document.addEventListener("bp:lang", () => requestAnimationFrame(layout));
  document.fonts?.ready.then(layout);
}
