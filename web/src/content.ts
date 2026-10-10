// Product content shared by every section: the warning levels, the signs, the roster.
// Mirrors docs/SPEC.md. The server's rules (src/rules/priority.py) are the source of truth;
// the page only mirrors them to show a priority before the API answers.

import type { Level, Priority, Segment, Sign } from "./types";

export interface Step {
  icon: string;
  hi: string;
  en: string;
}

export interface LevelInfo {
  id: Level;
  hi: string;
  en: string;
  imd_hi: string;
  imd_en: string;
  cap: string;
  when_hi: string;
  when_en: string;
  steps: Step[];
  ifFalse_hi: string;
  ifFalse_en: string;
}

export const LEVELS: LevelInfo[] = [
  {
    id: "saavdhan",
    hi: "सावधान",
    en: "Watch",
    imd_hi: "पीला: जानकारी रखें",
    imd_en: "Yellow: be aware",
    cap: "Monitor",
    when_hi: "नज़दीकी सरकारी गेज ख़तरे के निशान से ऊपर हो, या CWC की बाढ़ चेतावनी आए।",
    when_en: "The nearest official gauge is above danger level, or CWC issues a flood alert.",
    steps: [
      { icon: "papers", hi: "आधार, पासबुक, राशन कार्ड और ज़मीन के कागज़ प्लास्टिक की थैली में", en: "Aadhaar, passbook, ration card and land papers in a plastic bag" },
      { icon: "food", hi: "तीन दिन का सूखा खाना (चूड़ा, गुड़, सत्तू) और पानी", en: "Dry food for three days (chura, gur, sattu) and water" },
      { icon: "torch", hi: "फ़ोन और टॉर्च चार्ज", en: "Phone and torch charged" },
      { icon: "cow", hi: "तय कर लें कि मवेशी कहाँ जाएँगे", en: "Decide where the cattle would go" },
    ],
    ifFalse_hi: "कुछ नहीं खोया, बस तैयारी हुई।",
    ifFalse_en: "Almost nothing lost.",
  },
  {
    id: "taiyaar",
    hi: "तैयार",
    en: "Get ready",
    imd_hi: "नारंगी: तैयार रहें",
    imd_en: "Orange: be prepared",
    cap: "Prepare",
    when_hi: "किसी ने ख़तरे का संकेत भेजा और उसकी पुष्टि हुई (P1)। किसी अफ़सर का इंतज़ार नहीं, एक मिनट के अंदर।",
    when_en: "A reported danger sign is confirmed (P1). Sent within a minute, without waiting for any official.",
    steps: [
      { icon: "grain", hi: "अनाज, बीज और चारा मचान या छत पर", en: "Grain, seed and fodder onto the machaan or roof" },
      { icon: "cow", hi: "मवेशी खोलकर ऊँची जगह ले जाएँ", en: "Untie the cattle and take them to high ground" },
      { icon: "papers", hi: "कागज़ात अपने पास रखें", en: "Keep the papers on you" },
      { icon: "elders", hi: "बुज़ुर्ग, बच्चे, गर्भवती महिलाएँ और जो चल नहीं सकते, ऊँचाई के पास वाले घर में", en: "The elderly, children, pregnant women and anyone who can't walk at the house nearest high ground" },
    ],
    ifFalse_hi: "सामान ऊपर गया, फिर नीचे आ गया।",
    ifFalse_en: "Things moved up, then back down.",
  },
  {
    id: "nikal_chalo",
    hi: "निकल चलो",
    en: "Move now",
    imd_hi: "लाल: कार्रवाई करें",
    imd_en: "Red: take action",
    cap: "Evacuate",
    when_hi: "सिर्फ़ तब, जब इंजीनियर बाँध टूटने की पुष्टि करें, या दो अलग फ़ोन 300 मी. और 30 मिनट के अंदर P1 भेजें।",
    when_en: "Only when an engineer confirms a breach, or two different phones report a P1 within 300 m and 30 minutes.",
    steps: [
      { icon: "tent", hi: "राहत शिविर या ऊँची जगह जाएँ, सबसे कमज़ोर पहले", en: "Go to the relief camp or high ground, the most vulnerable first" },
      { icon: "power", hi: "बिजली का मेन स्विच बंद", en: "Power off at the main" },
      { icon: "papers", hi: "कागज़ात साथ लें", en: "Take the papers" },
    ],
    ifFalse_hi: "एक रात शिविर में। इसीलिए यह पुष्टि के बाद ही जाता है।",
    ifFalse_en: "A night at the camp. That's why it needs confirmation.",
  },
  {
    id: "khatra_tala",
    hi: "ख़तरा टला",
    en: "All clear",
    imd_hi: "हरा: कोई चेतावनी नहीं",
    imd_en: "Green: no advisory",
    cap: "AllClear",
    when_hi: "इंजीनियर बाँध को सुरक्षित बताएँ।",
    when_en: "The engineer marks the stretch secured.",
    steps: [
      { icon: "home", hi: "घर लौटें", en: "Go home" },
      { icon: "well", hi: "दीवारें और कुआँ जाँच लें", en: "Check the walls and the well" },
    ],
    ifFalse_hi: "मुखिया एक टैप में ग़लत अलार्म रद्द कर सकते हैं, और सब दर्ज होता है।",
    ifFalse_en: "The mukhiya can cancel a false alarm with one tap; everything is logged.",
  },
];

export const levelById = (id: Level) => LEVELS.find((l) => l.id === id)!;

export interface SignInfo {
  id: Sign;
  icon: string;
  hi: string;
  en: string;
  base: Priority;
}

/** The six buttons a patrol worker gets on WhatsApp, plus the variants the rules use. */
export const SIGNS: SignInfo[] = [
  { id: "overtopping", icon: "s_overtop", hi: "ऊपर से पानी", en: "Overtopping", base: "P1" },
  { id: "boil_soil", icon: "s_boil", hi: "मिट्टी वाला उबाल", en: "Boil carrying soil", base: "P1" },
  { id: "top_slumping", icon: "s_slump", hi: "ऊपरी सतह धँसना", en: "Top slumping", base: "P1" },
  { id: "boil_clear", icon: "s_boil", hi: "साफ़ पानी का उबाल", en: "Boil, clear water", base: "P2" },
  { id: "slip", icon: "s_slip", hi: "ढलान खिसकना", en: "Slope slip", base: "P2" },
  { id: "crack", icon: "s_crack", hi: "ऊपर दरार", en: "Crack on top", base: "P2" },
  { id: "seepage_soil", icon: "s_seep", hi: "रिसाव, मिट्टी के साथ", en: "Seepage with soil", base: "P2" },
  { id: "seepage_clear", icon: "s_seep", hi: "रिसाव, साफ़ पानी", en: "Seepage, clear", base: "P3" },
  { id: "rathole", icon: "s_rat", hi: "चूहे के बिल", en: "Rat holes", base: "P3" },
];

export const signById = (id: Sign) => SIGNS.find((s) => s.id === id)!;

/** The six buttons on WhatsApp, in the order a worker sees them. */
export const SIX_SIGNS: Sign[] = ["seepage_clear", "boil_soil", "crack", "slip", "overtopping", "rathole"];

const up = (p: Priority): Priority => (p === "P3" ? "P2" : "P1");

/** Mirror of src/rules/priority.py: sign, river, history. Engineers can raise, never lower. */
export function priorityFor(
  sign: Sign,
  river: { aboveDanger: boolean; rising: boolean },
  seg?: Segment,
): { priority: Priority; why_hi: string; why_en: string } {
  let p = signById(sign).base;
  const why_hi: string[] = [`${signById(sign).hi}: ${p}`];
  const why_en: string[] = [`${signById(sign).en}: ${p}`];
  if (sign === "slip" && river.aboveDanger) {
    p = "P1";
    why_hi.push("नदी ख़तरे से ऊपर: P1");
    why_en.push("river above danger: P1");
  }
  if (sign === "crack" && river.rising) {
    p = "P1";
    why_hi.push("नदी चढ़ रही: P1");
    why_en.push("river rising: P1");
  }
  if (sign === "rathole" && river.aboveDanger) {
    p = "P2";
    why_hi.push("नदी ख़तरे से ऊपर: P2");
    why_en.push("river above danger: P2");
  }
  if (seg && (seg.breach_last_5y || seg.vulnerable) && p !== "P1") {
    p = up(p);
    why_hi.push(`किमी ${seg.km} पहले टूटा या कमज़ोर सूची में: ${p}`);
    why_en.push(`km ${seg.km} breached before or on the vulnerable list: ${p}`);
  }
  return { priority: p, why_hi: why_hi.join(", "), why_en: why_en.join(", ") };
}

/** Minutes the person paged has to tap "on my way". */
export const ANSWER_MIN: Record<Priority, number> = { P1: 10, P2: 30, P3: 240 };

export interface Role {
  id: string;
  hi: string;
  en: string;
  face: string;
}

export const ROLES: Role[] = [
  { id: "patrol", hi: "प्रहरी", en: "Patrol worker", face: "prahari" },
  { id: "junior_engineer", hi: "जेई", en: "Junior engineer", face: "je" },
  { id: "assistant_engineer", hi: "एई", en: "Assistant engineer", face: "ae" },
  { id: "executive_engineer", hi: "ईई", en: "Executive engineer", face: "ee" },
  { id: "district_control_room", hi: "ज़िला", en: "District", face: "dm" },
  { id: "central_flood_control_room", hi: "केंद्रीय कक्ष", en: "Central room", face: "central" },
];

export const roleById = (id: string) => ROLES.find((r) => r.id === id);

export const HELPLINES = { state: "1070", wrd: "1800 345 6145" };
