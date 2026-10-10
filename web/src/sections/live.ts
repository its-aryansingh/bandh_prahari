// The strip at the top: the latest official reading that is above, or nearest to, danger.
import type { Gauges } from "../types";
import { $, clockEn, clockHi, dateEn, dateHi, esc } from "../lib/dom";

export function initLive(g: Gauges): void {
  const official = g.readings.filter((r) => !r.sample);
  const r = official.sort((a, b) => b.wl_m - b.dl_m - (a.wl_m - a.dl_m))[0];
  if (!r) return;
  const diff = r.wl_m - r.dl_m;
  const cm = Math.round(Math.abs(diff) * 100);
  const where_hi = diff >= 0 ? `ख़तरे के निशान से ${cm} से.मी. ऊपर` : `ख़तरे के निशान से ${cm} से.मी. नीचे`;
  const where_en = diff >= 0 ? `${cm} cm above danger level` : `${cm} cm below danger level`;
  const dist = r.district === "Gopalganj" ? "गोपालगंज" : r.district === "Saran" ? "सारण" : r.district;
  $("#live-text").innerHTML = `<span class="hi" lang="hi">गंडक, ${esc(r.site_hi)} (${esc(dist)}): ${where_hi}, ${r.wl_m.toFixed(2)} मी.। स्रोत: CWC, SACHET पर, ${dateHi(r.time)} ${clockHi(r.time)} बजे।</span>
    <span class="en" lang="en">Gandak at ${esc(r.site)} (${esc(r.district)}): ${where_en}, at ${r.wl_m.toFixed(2)} m. Source: CWC on SACHET, ${dateEn(r.time)}, ${clockEn(r.time)}.
    <a href="${esc(r.source_url)}" target="_blank" rel="noopener">CAP</a></span>`;
}
