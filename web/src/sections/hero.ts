// The hero's one orchestrated moment: the river rises to the danger mark, the boil starts,
// the patrol worker's voice note goes out, and the answer clock starts. Then it idles quietly.
import { HERO, heroScene, heroWater } from "../art/scene";
import { Ghadi } from "../art/ghadi";
import { face } from "../art/people";
import { $, bil } from "../lib/dom";
import { Loop, clamp, eo, reducedMotion, seg, spring, watchVisible } from "../lib/motion";

const LADDER = [
  { face: "prahari", hi: "प्रहरी", en: "Patrol worker", when_hi: "एक वॉइस नोट", when_en: "One voice note" },
  { face: "village", hi: "गाँव", en: "The village", when_hi: "1 मिनट में तैयार रहें", when_en: "Get ready, in 1 minute", cls: "village" },
  { face: "je", hi: "जेई", en: "Junior engineer", when_hi: "10 मिनट में जवाब", when_en: "Answers in 10 min" },
  { face: "ae", hi: "एई", en: "Assistant engineer", when_hi: "वरना अगले 10 में", when_en: "Or in the next 10" },
  { face: "ee", hi: "ईई", en: "Executive engineer", when_hi: "वरना अगले 10 में", when_en: "Or in the next 10" },
  { face: "dm", hi: "ज़िला और बाढ़ बल", en: "District, flood force", when_hi: "वरना अगले 10 में", when_en: "Or in the next 10" },
];

export function initHero(): void {
  const host = $("#hero-scene");
  host.innerHTML = heroScene();
  const svg = host.querySelector("svg")!;
  const water = svg.querySelector<SVGPathElement>("#hs-water")!;
  const wave = svg.querySelector<SVGPathElement>("#hs-wave")!;
  const crests = svg.querySelector<SVGGElement>("#hs-crests")!;
  const spout = svg.querySelector<SVGGElement>("#hs-boil-spout")!;
  const ring = svg.querySelector<SVGEllipseElement>("#hs-boil-ring")!;
  const ripple = svg.querySelector<SVGEllipseElement>("#hs-boil-ripple")!;
  const drops = [1, 2, 3].map((i) => svg.querySelector<SVGCircleElement>(`#hs-boil-d${i}`)!);
  const bubble = svg.querySelector<SVGGElement>("#hs-bubble")!;
  const screen = svg.querySelector<SVGRectElement>("#hs-man-screen")!;
  const waves = svg.querySelector<SVGGElement>("#hs-speaker-waves")!;

  const ghadi = new Ghadi();
  $("#hero-ghadi").append(ghadi.el);
  const badge = $("#hero-badge");

  $("#hero-ladder").innerHTML = LADDER.map(
    (s) => `<li class="${s.cls ?? ""}">${face(s.face)}<span class="who">${bil(s.hi, s.en)}</span>
      <span class="when">${bil(s.when_hi, s.when_en)}</span></li>`,
  ).join("");

  const BOIL_X = 500;
  const G = HERO.ground;
  const START = 380; // where the water starts, below the danger mark
  let phase = 0;

  const draw = (t: number, dt: number) => {
    phase += dt * 16;
    // 1. the river rises to just above the danger mark (0 to 1.2 s)
    const rise = eo(seg(t, 0, 1.2));
    const bob = Math.sin(t * 1.6) * 1.2 * rise;
    const y = START + (HERO.rest - START) * rise + bob;
    const w = heroWater(y, phase);
    water.setAttribute("d", w.body);
    wave.setAttribute("d", w.wave);
    crests.innerHTML = w.crests;
    // 2. the boil starts (spring from 0.7 s), then keeps bubbling
    const b = spring(t - 0.7, 0.42, 11);
    const pulse = 1 + Math.sin(t * 8.2) * 0.07 + Math.sin(t * 3.1) * 0.05;
    spout.setAttribute("transform", `translate(${BOIL_X} ${G - 8}) scale(1 ${Math.max(0, b * pulse).toFixed(3)})`);
    drops.forEach((d, i) => {
      const u = ((t - 0.9 + i * 0.37) % 1.1) / 1.1;
      const on = t > 0.9 + i * 0.37;
      const dir = i === 1 ? 1 : -1;
      const x = BOIL_X + dir * (6 + 22 * u) * (i === 2 ? 0.5 : 1);
      const yy = G - 40 * u + 46 * u * u - 6;
      d.setAttribute("cx", x.toFixed(1));
      d.setAttribute("cy", yy.toFixed(1));
      d.setAttribute("opacity", on ? (1 - u).toFixed(2) : "0");
    });
    const ru = ((t - 0.8) % 1.6) / 1.6;
    ripple.setAttribute("rx", (22 + 18 * ru).toFixed(1));
    ripple.setAttribute("ry", (4 + 4 * ru).toFixed(1));
    ripple.setAttribute("opacity", t > 0.8 ? (0.7 * (1 - ru)).toFixed(2) : "0");
    ring.setAttribute("opacity", clamp((t - 1.6) / 0.4).toFixed(2));
    ring.style.transform = `scale(${(1 + Math.sin(t * 2.4) * 0.03).toFixed(3)})`;
    // 3. the voice note: the phone lights and the bubble pops (1.0 s)
    const pop = spring(t - 1.0, 0.45, 12);
    bubble.style.transform = `scale(${Math.max(0, 0.6 + 0.4 * pop).toFixed(3)})`;
    bubble.style.opacity = clamp((t - 1.0) / 0.15).toFixed(2);
    screen.setAttribute("fill", t > 1.0 && Math.floor(t * 2) % 2 === 0 ? "#FFE9D6" : "#F27A1A");
    // the loudspeaker shows the village being told, a beat later (1.8 s)
    waves.setAttribute("opacity", t > 1.8 ? (0.5 + 0.5 * Math.sin(t * 5)).toFixed(2) : "0");
    // 4. the answer clock pops in and starts (1.4 s), then counts down in real seconds
    const g = spring(t - 1.4, 0.42, 11);
    badge.style.transform = `scale(${Math.max(0, g).toFixed(3)}) rotate(${((1 - Math.min(1, g)) * -12).toFixed(2)}deg)`;
    const running = Math.max(0, t - 1.6);
    ghadi.set(600 - running, 600, "run", t > 1.4 && t < 2.6 ? (t - 1.4) / 1.2 : 0);
  };

  if (reducedMotion()) {
    draw(3, 0);
    ghadi.set(600, 600, "run");
    return;
  }

  badge.style.transformOrigin = "60% 60%";
  const loop = new Loop((t, dt) => draw(t, Math.min(dt, 0.05)));
  draw(0, 0);
  // The idle loop runs only while the hero is on screen and the tab is visible.
  let onScreen = false;
  const sync = () => (onScreen && !document.hidden ? loop.start() : loop.stop());
  watchVisible(svg, (visible) => {
    onScreen = visible;
    sync();
  });
  document.addEventListener("visibilitychange", sync);
}
