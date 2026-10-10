// AWS: a magnetic dock of the services (kit effect 08) and the system as layers pulled
// apart in depth (kit effect 13, perspective shift).
import { awsGlyph, icon } from "../art/icons";
import { C } from "../art/palette";
import { $, $$, bi } from "../lib/dom";
import { reducedMotion } from "../lib/motion";

const SERVICES = [
  { g: "chat", name: "End User Messaging Social", tile: C.dhaan, hi: "WhatsApp संदेश भेजना और पाना: बटन, सूची, आवाज़, फ़ोटो।", en: "Sends and receives WhatsApp: buttons, lists, voice notes, photos." },
  { g: "sns", name: "Amazon SNS", tile: C.kesarDeep, hi: "आने वाले संदेश और डिलीवरी की रसीदें यहाँ उतरती हैं।", en: "Inbound messages and delivery receipts land here." },
  { g: "lambda", name: "AWS Lambda", tile: C.kesar, hi: "हर क़दम एक छोटा फ़ंक्शन: रिपोर्ट, पेज, जवाब, चेतावनी।", en: "Every step is a small function: report, page, answer, warning." },
  { g: "sfn", name: "AWS Step Functions", tile: C.neel2, hi: "जवाब घड़ी: पेज करो, टास्क टोकन पर रुको, समय पूरा तो अगला व्यक्ति।", en: "The answer clock: page, wait on a task token, and move to the next person when time runs out." },
  { g: "ddb", name: "Amazon DynamoDB", tile: C.gandakDeep, hi: "हर घटना और हर क़दम, तारीख़ और समय के साथ।", en: "Every incident and every step, timestamped." },
  { g: "transcribe", name: "Amazon Transcribe", tile: C.dhaanDeep, hi: "हिंदी वॉइस नोट से शब्द (hi-IN)।", en: "Hindi voice notes to text (hi-IN)." },
  { g: "bedrock", name: "Amazon Bedrock", tile: C.mittiDeep, hi: "रिपोर्ट का मसौदा लिखता है। प्राथमिकता कभी नहीं।", en: "Drafts the report. Never sets the priority." },
  { g: "polly", name: "Amazon Polly", tile: C.sindoor, hi: "हिंदी आवाज़ (Kajal) में चेतावनी और नदी का हाल।", en: "Warnings and river status in a Hindi voice (Kajal)." },
  { g: "location", name: "Amazon Location Service", tile: C.sindoorDeep, hi: "200 मी. का घेरा: इंजीनियर पहुँचा या नहीं, बिना लगातार ट्रैक किए।", en: "A 200 m geofence: is the engineer there, without tracking them all the time." },
  { g: "scheduler", name: "EventBridge Scheduler", tile: C.haldiDeep, hi: "डिलीवरी की जाँच और नदी ऊँची होने पर रात की हाज़िरी।", en: "Delivery checks, and the night roll-call when the river is high." },
  { g: "s3", name: "Amazon S3", tile: C.dhaan, hi: "फ़ोटो, आवाज़ और रिकॉर्ड, Object Lock के साथ।", en: "Photos, voice notes and the record, under Object Lock." },
  { g: "cloudwatch", name: "Amazon CloudWatch", tile: C.gandak, hi: "हर जवाब में कितने मिनट लगे; P1 पर कोई मौके पर नहीं तो अलार्म।", en: "Minutes to every answer; an alarm on any P1 with nobody on site." },
  { g: "kms", name: "AWS KMS", tile: C.neel, hi: "सब कुछ एन्क्रिप्ट। फ़ोन नंबर सिर्फ़ SSM में।", en: "Everything encrypted. Phone numbers only in SSM." },
  { g: "amplify", name: "AWS Amplify", tile: C.kesarDeep, hi: "यह वेबसाइट।", en: "This website." },
];

const LAYERS = [
  { icon: "phone", tone: C.kesarTint, hi: "लोग: WhatsApp पर प्रहरी, गाँव, इंजीनियर", en: "People: patrol, villages, engineers on WhatsApp" },
  { icon: "stamp", tone: C.white, hi: "नियम: प्राथमिकता कोड तय करता है, AI नहीं", en: "Rules: code sets the priority, not the AI" },
  { icon: "pin", tone: C.gandakTint, hi: "AWS: Step Functions, Lambda, DynamoDB, Location", en: "AWS: Step Functions, Lambda, DynamoDB, Location" },
  { icon: "doc", tone: C.haldiTint, hi: "सरकारी डेटा: SACHET, FMISC, CAP, IRS 001", en: "Government data: SACHET, FMISC, CAP, IRS 001" },
];

export function initAws(): void {
  const dock = $("#dock");
  const detail = $("#dock-detail");
  dock.innerHTML = SERVICES.map(
    (s, i) => `<button type="button" role="option" aria-selected="${i === 3}" style="--tile:${s.tile}" aria-label="${s.name}">${awsGlyph(s.g)}</button>`,
  ).join("");
  const btns = $$<HTMLButtonElement>("button", dock);
  const show = (i: number) => {
    btns.forEach((b, k) => b.setAttribute("aria-selected", String(k === i)));
    const s = SERVICES[i];
    detail.innerHTML = `<p class="name">${s.name}</p><p class="pair">${bi(s.hi, s.en)}</p>`;
  };
  show(3);

  // Icons swell around the pointer and ease back with distance (Gaussian falloff, as in the kit).
  const BASE = innerWidth < 640 ? 34 : 44;
  const AMP = innerWidth < 640 ? 16 : 26;
  const size = (px: number | null) =>
    btns.forEach((b) => {
      if (px === null) {
        b.style.setProperty("--s", `${BASE}px`);
        return;
      }
      const r = b.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const s = BASE + AMP * Math.exp(-(((c - px) / 70) ** 2));
      b.style.setProperty("--s", `${s.toFixed(1)}px`);
    });
  size(null);
  let raf = 0;
  if (!reducedMotion()) {
    dock.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => size(e.clientX));
    });
    dock.addEventListener("pointerleave", () => size(null));
  }
  dock.addEventListener("pointerover", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b) show(btns.indexOf(b as HTMLButtonElement));
  });
  dock.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (b) show(btns.indexOf(b as HTMLButtonElement));
  });
  dock.addEventListener("keydown", (e) => {
    const cur = btns.findIndex((b) => b.getAttribute("aria-selected") === "true");
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (cur + d + btns.length) % btns.length;
    show(n);
    btns[n].focus();
  });

  // Layers
  const stage = $("#layers-stage");
  stage.innerHTML = LAYERS.map((l, i) => `<div class="layer" style="--i:${i};background:${l.tone};z-index:${10 - i}">${icon(l.icon)}<span class="pair">${bi(l.hi, l.en)}</span></div>`).join("");
  const btn = $<HTMLButtonElement>("#layers-btn");
  btn.addEventListener("click", () => {
    const open = !stage.classList.contains("open");
    stage.classList.toggle("open", open);
    btn.setAttribute("aria-pressed", String(open));
  });
}
