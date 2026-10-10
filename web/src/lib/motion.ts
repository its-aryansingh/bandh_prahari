// Motion helpers. Same maths as the motion kit: every frame is a function of progress,
// eased with cubic in-out, cubic out, or a damped spring (overshoot, then settle).

export const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const eio = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const eo = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

/** Damped spring from 0 to 1. z: damping ratio (<1 overshoots), wn: natural frequency. */
export function spring(t: number, z = 0.5, wn = 11): number {
  if (t <= 0) return 0;
  const wd = wn * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + ((z * wn) / wd) * Math.sin(wd * t));
}

/** Local progress of a window [a, b] inside a timeline. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

const hx = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const A = hx(a);
  const B = hx(b);
  return "#" + A.map((v, i) => Math.round(lerp(v, B[i], clamp(t))).toString(16).padStart(2, "0")).join("");
}

let reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
if (typeof matchMedia !== "undefined") {
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (e) => (reduced = e.matches));
}
export const reducedMotion = () => reduced;

/** Runs onFrame(p) from 0 to 1 over ms. Resolves at the end; with reduced motion, jumps to 1. */
export function tween(ms: number, onFrame: (p: number) => void): Promise<void> {
  if (reduced || ms <= 0) {
    onFrame(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const p = clamp((now - t0) / ms);
      onFrame(p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Calls cb once, the first time el is at least `threshold` visible. */
export function onceInView(el: Element, cb: () => void, threshold = 0.25): void {
  if (typeof IntersectionObserver === "undefined") {
    cb();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.disconnect();
          cb();
        }
      }
    },
    { threshold },
  );
  io.observe(el);
}

/** Tracks whether el is on screen, so idle loops can stop when nobody sees them. */
export function watchVisible(el: Element, cb: (visible: boolean) => void): void {
  if (typeof IntersectionObserver === "undefined") {
    cb(true);
    return;
  }
  new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting)), { threshold: 0 }).observe(el);
}

/** A requestAnimationFrame loop that can start and stop. tick gets seconds since start. */
export class Loop {
  private raf = 0;
  private t0 = 0;
  constructor(private tick: (seconds: number, dt: number) => void) {}
  private last = 0;
  get running() {
    return this.raf !== 0;
  }
  start() {
    if (this.raf) return;
    this.t0 = performance.now() - this.t0Offset;
    this.last = performance.now();
    const step = (now: number) => {
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.tick((now - this.t0) / 1000, dt);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  private t0Offset = 0;
  stop() {
    if (!this.raf) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.t0Offset = performance.now() - this.t0;
  }
}
