// Small DOM helpers. No framework: strings for markup, a few typed lookups.

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

/** Builds one element from an HTML string. */
export function h<T extends Element = HTMLElement>(html: string): T {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Bilingual text: Hindi first, English second. CSS decides what shows (data-lang on <html>). */
export const bi = (hi: string, en: string) =>
  `<span class="hi" lang="hi">${esc(hi)}</span><span class="en" lang="en">${esc(en)}</span>`;

/** Bilingual, inline: "हिंदी / English" when both languages show. For labels and chips. */
export const bil = (hi: string, en: string) =>
  `<span class="il"><span class="hi" lang="hi">${esc(hi)}</span><span class="en" lang="en">${esc(en)}</span></span>`;

/** Bilingual, but Hindi only when both languages show. For labels the English adds nothing to. */
export const bs = (hi: string, en: string) =>
  `<span class="hi" lang="hi">${esc(hi)}</span><span class="en solo" lang="en">${esc(en)}</span>`;

/** Same, for SVG text nodes. */
export const biSvg = (hi: string, en: string, attrs = "") =>
  `<tspan class="hi" ${attrs}>${esc(hi)}</tspan><tspan class="en" ${attrs}>${esc(en)}</tspan>`;

const IST = "Asia/Kolkata";

/** "रात 11:40" / "11:40 PM". */
export function clockHi(iso: string): string {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: IST })
    .formatToParts(d);
  const hh = Number(p.find((x) => x.type === "hour")?.value ?? 0);
  const mm = p.find((x) => x.type === "minute")?.value ?? "00";
  const part = hh < 4 ? "रात" : hh < 12 ? "सुबह" : hh < 16 ? "दोपहर" : hh < 19 ? "शाम" : "रात";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${part} ${h12}:${mm}`;
}

export function clockEn(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST })
    .format(new Date(iso))
    .replace(/\s?(am|pm)/i, (m) => " " + m.trim().toUpperCase());
}

const MONTHS_HI = ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
export function dateHi(iso: string): string {
  const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: IST }));
  return `${d.getDate()} ${MONTHS_HI[d.getMonth()]}`;
}
export function dateEn(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: IST }).format(new Date(iso));
}

/** Indian digit grouping: 7515 -> "7,515", 827472 -> "8,27,472". */
export const num = (n: number, digits = 0) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
