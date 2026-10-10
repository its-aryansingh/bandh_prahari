// Jawab Ghadi, the answer clock: a twin-bell alarm clock. The small mark is the logo;
// the big one counts down whoever has to answer next.
import { C } from "./palette";

const S = (w = 3) => `stroke="${C.neel}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** The logo mark: alarm clock with the river in its face, hands at ten past ten. 64 x 64. */
export function logoMark(cls = "mark"): string {
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs><clipPath id="lm-face"><circle cx="32" cy="35" r="19"/></clipPath></defs>
    <path d="M20 52l-5 7M44 52l5 7" ${S(3.4)}/>
    <path d="M9 21.5a11.5 11.5 0 0 1 15-13.4z" fill="${C.haldi}" ${S(2.8)}/>
    <path d="M55 21.5a11.5 11.5 0 0 0-15-13.4z" fill="${C.haldi}" ${S(2.8)}/>
    <path d="M32 13V8M27.5 7.5h9" ${S(2.8)}/>
    <circle cx="32" cy="35" r="21.5" fill="${C.chuna}" ${S(3.2)}/>
    <g clip-path="url(#lm-face)"><path d="M10 41q5.5-4.4 11 0t11 0 11 0 11 0V60H10z" fill="${C.gandak}"/>
    <path d="M10 41q5.5-4.4 11 0t11 0 11 0 11 0" fill="none" ${S(2.2)}/></g>
    <path d="M32 35l-8.4-6M32 35l10.6-8.2" ${S(3.4)}/>
    <circle cx="32" cy="35" r="3" fill="${C.kesar}" ${S(1.8)}/>
  </svg>`;
}

export type GhadiState = "idle" | "run" | "late" | "done";

/** A big clock with a countdown ring. set() is cheap and can run every frame. */
export class Ghadi {
  el: SVGSVGElement;
  private ring: SVGCircleElement;
  private digits: SVGTextElement;
  private bells: SVGGElement;
  private face: SVGCircleElement;
  private readonly L = 2 * Math.PI * 40;

  constructor(cls = "ghadi") {
    const wrap = document.createElement("div");
    wrap.innerHTML = `<svg class="${cls}" viewBox="0 0 120 128" aria-hidden="true" focusable="false">
      <path d="M36 112l-8 12M84 112l8 12" ${S(4)}/>
      <g class="bells">
        <path d="M10 34a20 20 0 0 1 26-23z" fill="${C.haldi}" ${S(3)}/>
        <path d="M110 34a20 20 0 0 0-26-23z" fill="${C.haldi}" ${S(3)}/>
        <path d="M60 18v-8M52 9h16" ${S(3)}/>
      </g>
      <circle class="face" cx="60" cy="68" r="50" fill="${C.chuna}" ${S(3.4)}/>
      <circle cx="60" cy="68" r="40" fill="none" stroke="${C.kesarTint}" stroke-width="9"/>
      <circle class="ring" cx="60" cy="68" r="40" fill="none" stroke="${C.kesar}" stroke-width="9" stroke-linecap="round"
        transform="rotate(-90 60 68)" stroke-dasharray="${this.L.toFixed(2)}" stroke-dashoffset="0"/>
      <text class="digits" x="60" y="80" text-anchor="middle" font-size="34" fill="${C.neel}">10:00</text>
    </svg>`;
    this.el = wrap.firstElementChild as SVGSVGElement;
    this.ring = this.el.querySelector(".ring")!;
    this.digits = this.el.querySelector(".digits")!;
    this.bells = this.el.querySelector(".bells")!;
    this.face = this.el.querySelector(".face")!;
  }

  /** remaining and total in seconds. */
  set(remaining: number, total: number, state: GhadiState, ringing = 0): void {
    const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
    this.ring.setAttribute("stroke-dashoffset", (this.L * (1 - frac)).toFixed(2));
    const col = state === "late" ? C.sindoor : state === "done" ? C.dhaan : state === "idle" ? C.neel3 : C.kesar;
    this.ring.setAttribute("stroke", col);
    this.face.setAttribute("fill", state === "late" ? C.sindoorTint : state === "done" ? C.dhaanTint : C.chuna);
    const r = Math.max(0, Math.round(remaining));
    const mm = Math.floor(r / 60);
    const ss = String(r % 60).padStart(2, "0");
    this.digits.textContent = state === "done" ? "✓" : `${mm}:${ss}`;
    this.digits.setAttribute("font-size", state === "done" ? "44" : mm >= 100 ? "26" : "34");
    // Bells shake when the clock rings (ringing 0..1), like a real alarm clock.
    const a = ringing > 0 ? Math.sin(ringing * Math.PI * 14) * 7 * (1 - ringing) : 0;
    this.bells.setAttribute("transform", `rotate(${a.toFixed(2)} 60 40)`);
  }
}
