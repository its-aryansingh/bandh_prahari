// Who gets what (kit effect 04, tabs to panels): the selection pill stretches across to the
// next tab, leading edge first, and the panel's messages stage in.
import { logoMark } from "../art/ghadi";
import { icon } from "../art/icons";
import { face } from "../art/people";
import { $, $$, bi, bil } from "../lib/dom";
import { eio, reducedMotion, tween } from "../lib/motion";

interface Who {
  id: string;
  face: string;
  hi: string;
  en: string;
  thread: string;
  gets: [string, string];
  does: [string, string];
  when: [string, string];
}

const wave = (n: number) => `<span class="wave" style="display:inline-flex;gap:2px;align-items:center;height:18px">${Array.from({ length: n }, (_, i) => `<i style="width:2.5px;border-radius:2px;background:var(--neel-2);height:${6 + ((i * 7) % 12)}px"></i>`).join("")}</span>`;
const voice = (len: string) => `<span style="display:flex;gap:8px;align-items:center">${icon("play")}${wave(16)}<span class="tiny dim">${len}</span></span>`;

const WHO: Who[] = [
  {
    id: "family",
    face: "family",
    hi: "परिवार",
    en: "Family",
    thread: `<div class="bubble-out" style="--i:0">${bil("हैजलपुर", "Haijalpur")}</div>
      <div class="bubble-in" style="--i:1">${voice("0:14")}<span class="pair small">${bi("गंडक, रेवाघाट: 53.62 मी., ख़तरे से 79 से.मी. नीचे, घट रहा है।", "Gandak at Rewaghat: 53.62 m, 79 cm below danger, falling.")}</span></div>
      <div class="bubble-in" style="--i:2" data-level="taiyaar"><span class="lvl">${bil("तैयार रहें", "Get ready")}</span>${voice("0:18")}<span class="pair small">${bi("अनाज मचान पर, मवेशी ऊँची जगह, कागज़ात साथ।", "Grain on the machaan, cattle to high ground, papers on you.")}</span><div class="wa-btns"><span>${bil("हो गया", "Done")}</span></div></div>`,
    gets: ["रोज़ नदी का हाल आवाज़ में, और ख़तरे पर 1 मिनट के अंदर 'तैयार रहें' के क़दम।", "The river's state by voice any day, and the get-ready steps within a minute of danger."],
    does: ["'हो गया' दबाते हैं, ताकि वार्ड सदस्य को पता रहे।", "Tap Done, so the ward member knows."],
    when: ["रिपोर्ट के 1 मिनट के अंदर। 'निकल चलो' सिर्फ़ पुष्टि के बाद।", "Within a minute of the report. 'Move now' only after confirmation."],
  },
  {
    id: "ward",
    face: "ward",
    hi: "वार्ड सदस्य",
    en: "Ward member",
    thread: `<div class="bubble-in" style="--i:0"><span class="pair small">${bi("वार्ड 7: 18/25 घर तैयार।", "Ward 7: 18 of 25 homes ready.")}</span><span class="dots" style="display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-top:6px">${Array.from({ length: 25 }, (_, i) => `<i style="aspect-ratio:1;border-radius:3px;border:1.5px solid var(--neel);background:${i < 18 ? "var(--dhaan)" : "#fff"}"></i>`).join("")}</span></div>
      <div class="bubble-in" style="--i:1"><span class="pair small">${bi("जवाब नहीं आया: घर 3, 8, 11, 14, 19, 22, 24।", "No reply yet: homes 3, 8, 11, 14, 19, 22, 24.")}</span></div>
      <div class="bubble-out" style="--i:2">${bil("घर 8 और 11 में बुज़ुर्ग हैं, जा रही हूँ", "Homes 8 and 11 have elderly people, going now")}</div>`,
    gets: ["अपने वार्ड के हर घर की गिनती: किसने 'हो गया' दबाया, कौन बाक़ी है।", "A live count for every home in the ward: who tapped Done, who hasn't."],
    does: ["जिन घरों से जवाब नहीं आया, वहाँ जाकर देखती हैं।", "Goes to the homes that haven't replied."],
    when: ["चेतावनी के साथ ही, फिर हर नए जवाब पर।", "With the warning, then with every new reply."],
  },
  {
    id: "mukhiya",
    face: "mukhiya",
    hi: "मुखिया",
    en: "Mukhiya",
    thread: `<div class="bubble-in" style="--i:0" data-level="taiyaar"><span class="lvl">${bil("तैयार रहें", "Get ready")}</span>${voice("0:18")}<span class="pair small">${bi("गाँव के लाउडस्पीकर पर चलाएँ।", "Play this on the village loudspeaker.")}</span></div>
      <div class="bubble-in" style="--i:1"><span class="pair small">${bi("ग़लत अलार्म लगे तो एक टैप में रद्द करें। सब दर्ज होता है।", "If it looks like a false alarm, cancel it with one tap. Everything is logged.")}</span><div class="wa-btns"><span>${bil("चेतावनी रद्द करें", "Cancel the warning")}</span></div></div>`,
    gets: ["वही चेतावनी, और लाउडस्पीकर पर चलाने लायक़ आवाज़ की क्लिप, जो बिना फ़ोन वाले घरों तक पहुँचती है।", "The same warning, plus a clip ready for the loudspeaker, which reaches homes without a phone."],
    does: ["लाउडस्पीकर पर चलाते हैं। ग़लत अलार्म हो तो रद्द करते हैं।", "Plays it on the loudspeaker. Cancels a false alarm."],
    when: ["रिपोर्ट के 1 मिनट के अंदर।", "Within a minute of the report."],
  },
  {
    id: "engineer",
    face: "je",
    hi: "इंजीनियर",
    en: "Engineer",
    thread: `<div class="bubble-in" style="--i:0" data-level="nikal_chalo"><span class="lvl">P1</span><span class="pair small">${bi("किमी 14, मिट्टी वाला उबाल। नदी चरम पर। नज़दीकी बाँध एम्बुलेंस: किमी 12। 10 मिनट में जवाब दें।", "km 14, boil carrying soil. River at its peak. Nearest embankment ambulance: km 12. Answer within 10 minutes.")}</span><div class="wa-btns"><span>${bil("मैं जा रहा हूँ", "On my way")}</span><span>${bil("मेरा क्षेत्र नहीं", "Not my stretch")}</span></div></div>
      <div class="bubble-in" style="--i:1"><span class="pair small">${bi("पहुँचने पर लोकेशन और फ़ोटो भेजें (45 मिनट के अंदर, 200 मी. के घेरे में)।", "On arrival, send a location pin and a photo (within 45 minutes, inside the 200 m circle).")}</span></div>`,
    gets: ["फ़ोटो, नक़्शा, नदी का रुझान और नज़दीकी ट्रैक्टर के साथ पेज।", "A page with the photo, the map, the river trend and the nearest repair tractor."],
    does: ["10 मिनट में 'मैं जा रहा हूँ', 45 मिनट में मौके से लोकेशन और फ़ोटो, फिर हर 30 मिनट हाज़िरी।", "Taps 'On my way' within 10 minutes, sends a pin and photo from the spot within 45, then checks in every 30."],
    when: ["P1 पर 10 मिनट, P2 पर 30। जवाब नहीं तो अगले अफ़सर तक।", "10 minutes for a P1, 30 for a P2. No answer, and it climbs."],
  },
  {
    id: "control",
    face: "central",
    hi: "कंट्रोल रूम",
    en: "Control room",
    thread: `<div class="bubble-in" style="--i:0"><span class="pair small">${bi("किमी 14 पर P1: 10 मिनट से जवाब नहीं। अब एई के पास।", "P1 at km 14: no answer for 10 minutes. Now with the assistant engineer.")}</span></div>
      <div class="bubble-in" style="--i:1"><span class="pair small">${bi("ज़िले के लिए IRS फ़ॉर्म 001 ब्रीफ़िंग तैयार।", "IRS Form 001 briefing ready for the district.")}</span><div class="wa-btns"><span>${bil("ब्रीफ़िंग खोलें", "Open the briefing")}</span></div></div>`,
    gets: ["हर खुली घटना, उसकी घड़ी, और ज़िले के लिए भरी हुई ब्रीफ़िंग।", "Every open incident with its clock, and a briefing filled in for the district."],
    does: ["हेल्पलाइन की कॉल दर्ज करते हैं, जो उसी घड़ी पर चलती है।", "Logs helpline calls, which run on the same clock."],
    when: ["जब तक कोई न उठाए, हर 10 मिनट।", "Every 10 minutes until someone answers."],
  },
];

export function initWho(): void {
  const bar = $("#who .tab-bar");
  const pill = $("#who .tab-pill");
  const panel = $("#who-panel");
  bar.insertAdjacentHTML(
    "beforeend",
    WHO.map((w, i) => `<button type="button" role="tab" id="who-${w.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" aria-controls="who-panel" data-id="${w.id}">${face(w.face)}${bil(w.hi, w.en)}</button>`).join(""),
  );
  const btns = $$<HTMLButtonElement>("button", bar);
  let cur = 0;

  const fill = (i: number) => {
    const w = WHO[i];
    panel.setAttribute("aria-labelledby", `who-${w.id}`);
    panel.innerHTML = `<div class="phone"><div class="phone-screen"><div class="phone-top">${logoMark()}<span>बाँध प्रहरी</span></div><div class="phone-thread">${w.thread}</div></div></div>
      <div class="who-facts"><dl>
        <div style="--i:0"><dt>${bil("क्या मिलता है", "What they get")}</dt><dd class="pair">${bi(w.gets[0], w.gets[1])}</dd></div>
        <div style="--i:1"><dt>${bil("क्या करते हैं", "What they do")}</dt><dd class="pair">${bi(w.does[0], w.does[1])}</dd></div>
        <div style="--i:2"><dt>${bil("कितनी जल्दी", "How fast")}</dt><dd class="pair">${bi(w.when[0], w.when[1])}</dd></div>
      </dl></div>`;
  };

  const place = (L: number, R: number) => {
    pill.style.left = `${L}px`;
    pill.style.width = `${Math.max(0, R - L)}px`;
  };
  const edges = (b: HTMLElement) => [b.offsetLeft, b.offsetLeft + b.offsetWidth] as const;

  const select = async (i: number, focus = false) => {
    if (i === cur) return;
    const [a0, a1] = edges(btns[cur]);
    const [b0, b1] = edges(btns[i]);
    const right = i > cur;
    btns.forEach((b, k) => {
      b.setAttribute("aria-selected", String(k === i));
      b.tabIndex = k === i ? 0 : -1;
    });
    if (focus) btns[i].focus();
    cur = i;
    fill(i);
    btns[i].scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    // leading edge first, trailing edge catches up (kit: lead = eio(p*1.3), trail = eio(p*1.3 - 0.3))
    await tween(460, (p) => {
      const lead = eio(p * 1.3);
      const trail = eio(p * 1.3 - 0.3);
      if (right) place(a0 + (b0 - a0) * trail, a1 + (b1 - a1) * lead);
      else place(a0 + (b0 - a0) * lead, a1 + (b1 - a1) * trail);
    });
    place(b0, b1);
  };

  btns.forEach((b, i) => {
    b.addEventListener("click", () => select(i));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select((cur + d + WHO.length) % WHO.length, true);
    });
  });
  fill(0);
  const sync = () => {
    const [l, r] = edges(btns[cur]);
    place(l, r);
  };
  requestAnimationFrame(sync);
  window.addEventListener("resize", sync);
  document.addEventListener("bp:lang", () => requestAnimationFrame(sync));
  document.fonts?.ready.then(sync);
}
