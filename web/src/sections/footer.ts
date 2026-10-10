// The closing mark (kit effect 16, particle logo): dots, one for each household, fly in and
// assemble into the answer clock, once, when the footer comes into view.
import { logoMark } from "../art/ghadi";
import { $ } from "../lib/dom";
import { eo, onceInView, reducedMotion } from "../lib/motion";

export function initFooter(): void {
  const canvas = $<HTMLCanvasElement>("#particle-mark");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const img = new Image();
  const svg = logoMark().replace('class="mark"', `xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"`);
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  img.onload = () => {
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const o = off.getContext("2d")!;
    o.drawImage(img, 0, 0, W, H);
    const data = o.getImageData(0, 0, W, H).data;
    const pts: { x: number; y: number; c: string; sx: number; sy: number; d: number }[] = [];
    const step = 5;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y += step)
      for (let x = 0; x < W; x += step) {
        const i = (y * W + x) * 4;
        if (data[i + 3] > 120) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          pts.push({ x, y, c: `rgb(${r},${g},${b})`, sx: rnd() * W, sy: H + rnd() * H * 0.6, d: (x / W) * 0.35 + rnd() * 0.15 });
        }
      }
    const paint = (p: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const q of pts) {
        const k = eo((p - q.d) / 0.6);
        const x = q.sx + (q.x - q.sx) * k;
        const y = q.sy + (q.y - q.sy) * k - Math.sin(Math.PI * k) * 24;
        ctx.fillStyle = q.c;
        ctx.globalAlpha = 0.35 + 0.65 * k;
        ctx.beginPath();
        ctx.arc(x, y, k > 0.98 ? 2.4 : 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    if (reducedMotion()) {
      paint(2);
      return;
    }
    paint(0);
    onceInView(canvas, () => {
      const t0 = performance.now();
      const step2 = (now: number) => {
        const p = (now - t0) / 1600;
        paint(p);
        if (p < 1.2) requestAnimationFrame(step2);
      };
      requestAnimationFrame(step2);
    }, 0.5);
  };
}
