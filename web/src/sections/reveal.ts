// The same water, two mornings. A bamboo chik blind rolls up over "what could have been"
// (kit effect 12, image reveal, with chik slats instead of dark shutters).
import { morningScene } from "../art/scene";
import { $, bil } from "../lib/dom";

export function initReveal(): void {
  $("#reveal-before").innerHTML = morningScene("before");
  const after = $("#reveal-after");
  after.insertAdjacentHTML("afterbegin", morningScene("after"));
  const chik = $("#chik");
  chik.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--i:${11 - i}"></i>`).join("");
  const btn = $<HTMLButtonElement>("#chik-btn");
  btn.addEventListener("click", () => {
    const up = !chik.classList.contains("up");
    chik.classList.toggle("up", up);
    btn.setAttribute("aria-expanded", String(up));
    btn.innerHTML = up
      ? `<span class="bi">${bil("चिक गिराएँ", "Lower the blind")}</span>`
      : `<span class="bi">${bil("चिक उठाएँ", "Raise the blind")}</span>`;
  });
}
