import "./styles/springs.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/sections.css";
import "./styles/overlays.css";
import "./styles/livemap.css";

import { api, usingMocks } from "./api";
import { logoMark } from "./art/ghadi";
import { $, $$, bi, h } from "./lib/dom";
import { initHero } from "./sections/hero";
import { initNadi } from "./sections/nadi";
import { initLevels } from "./sections/levels";
import { initReplay } from "./sections/replay";
import { initReveal } from "./sections/reveal";
import { initWho } from "./sections/who";
import { initControl } from "./sections/control";
import { initGov } from "./sections/gov";
import { initAws } from "./sections/aws";
import { initFooter } from "./sections/footer";
import { initLive } from "./sections/live";

type Lang = "hi" | "en" | "both";

function setLang(lang: Lang) {
  document.documentElement.dataset.lang = lang;
  document.documentElement.lang = lang === "en" ? "en" : "hi";
  $$<HTMLButtonElement>(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  try {
    localStorage.setItem("bp-lang", lang);
  } catch {
    /* storage can be blocked; the page still works */
  }
  document.dispatchEvent(new CustomEvent("bp:lang", { detail: lang }));
}

function initLang() {
  let saved: Lang | null = null;
  try {
    saved = localStorage.getItem("bp-lang") as Lang | null;
  } catch {
    saved = null;
  }
  if (saved === "hi" || saved === "en" || saved === "both") setLang(saved);
  $$<HTMLButtonElement>(".lang button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang as Lang)));
}

async function main() {
  initLang();
  $("#brand-mark").innerHTML = logoMark();
  if (usingMocks) {
    // said once, in the strip at the top, so it never covers the page
    $(".live-strip .wrap").append(h(`<span class="mock-note solo" role="note">${bi("नमूना डेटा: API नहीं जुड़ा", "Sample data: API not connected")}</span>`));
  }

  const [stretch, gauges, incidents] = await Promise.all([api.stretch(), api.gauges(), api.openIncidents()]);

  initLive(gauges);
  initHero();
  initNadi(stretch, gauges);
  // The live map (and its grid) loads only as it nears the screen, so a phone on mobile data
  // gets the top of the page first.
  const loadMap = () =>
    import("./sections/livemap")
      .then((m) => m.initLiveMap(stretch, gauges))
      .catch((err) => {
        console.error(err);
        const lm = document.querySelector("#lm");
        if (lm) lm.innerHTML = `<p class="lm-loading small">${bi("नक़्शा नहीं बन पाया। पन्ना दोबारा खोलें।", "The map didn't load. Reload the page.")}</p>`;
      });
  if (typeof IntersectionObserver === "undefined") loadMap();
  else {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        loadMap();
      },
      { rootMargin: "900px 0px" },
    );
    io.observe($("#naksha"));
  }
  initLevels();
  initReplay();
  initReveal();
  initWho();
  initControl(stretch, gauges, incidents);
  initGov(gauges);
  initAws();
  initFooter();
}

main().catch((err) => {
  console.error(err);
  document.body.append(
    h(`<p class="stamp" role="alert" style="position:fixed;left:12px;bottom:12px;z-index:300">${bi(
      "डेटा नहीं आया। पन्ना दोबारा खोलें।",
      "The data didn't load. Reload the page.",
    )}</p>`),
  );
});
