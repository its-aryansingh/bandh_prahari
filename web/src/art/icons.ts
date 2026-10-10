// Cartoon icons: indigo ink outline, flat fills from the palette. 40 x 40 unless noted.
import { C } from "./palette";

const S = `stroke="${C.neel}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const Sx = (w: number) => `stroke="${C.neel}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

const BODIES: Record<string, string> = {
  papers: `<path d="M9 15h22l-1.6 18.5a2.5 2.5 0 0 1-2.5 2.3H13.1a2.5 2.5 0 0 1-2.5-2.3z" fill="${C.gandakTint}" ${S}/>
    <path d="M15 15c0-6 10-6 10 0" fill="none" ${S}/>
    <rect x="13.5" y="18" width="13" height="13.5" rx="1.5" fill="${C.white}"/>
    <rect x="13.5" y="18" width="13" height="3.4" fill="${C.kesar}"/>
    <rect x="13.5" y="18" width="13" height="13.5" rx="1.5" fill="none" ${Sx(1.8)}/>
    <path d="M16.5 25h7M16.5 28.2h4.5" stroke="${C.neel2}" stroke-width="1.6" stroke-linecap="round"/>`,
  food: `<path d="M6 21h28c0 7.5-6.3 13-14 13S6 28.5 6 21z" fill="${C.haldiTint}" ${S}/>
    <path d="M8.5 21q2.5-5 6-4.5q2.5-4 7-2.5q3.5-1.5 6.5 2q3 0 3.5 5z" fill="${C.haldi}" ${Sx(1.8)}/>
    <rect x="25" y="6" width="9" height="8" rx="2" transform="rotate(12 29.5 10)" fill="${C.mittiDeep}" ${Sx(1.8)}/>`,
  torch: `<rect x="5" y="16" width="17" height="9" rx="2.5" fill="${C.haldi}" ${S}/>
    <path d="M22 14.5l6-3v18l-6-3z" fill="${C.haldiTint}" ${S}/>
    <path d="M31.5 14.5l4-2M32 20.5h4.5M31.5 26.5l4 2" stroke="${C.kesar}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M14 17.8l-2.6 3.4h3.2l-2.6 3.4" fill="none" ${Sx(1.6)}/>`,
  cow: `<path d="M5 18.5c3-.5 3.5 4.5 1.5 8" fill="none" ${S}/>
    <path d="M7 19c0-4 3-6 7-6h11c4 0 6 3 6 6v4c0 3-2 5-5 5H12c-3 0-5-2-5-5z" fill="${C.white}" ${S}/>
    <path d="M12.5 16.5c2.5-1.5 5 0 4.6 2.4s-3.4 2.8-4.8 1" fill="${C.mittiTint}"/>
    <path d="M21 13.5c.5-4 5-5 6.8-1.6" fill="${C.white}" ${S}/>
    <path d="M11 28v7M15 28v7M24 28v7M28 27.5v7.5" ${S}/>
    <path d="M29 16c2-2.5 6.5-2.5 7.5.8l1 4.6c.3 2-1.6 3.4-3.8 3.4h-1.8c-2.2 0-3.4-1.8-3.4-3.8z" fill="${C.white}" ${S}/>
    <path d="M31 14.8c-1.2-3-.2-5 2-5.6M35 14.8c1-2.6 3-3.6 4.4-3.1" fill="none" ${S}/>
    <circle cx="33.6" cy="17.6" r="1.1" fill="${C.neel}"/>
    <circle cx="30.6" cy="26.2" r="2.1" fill="${C.haldi}" ${Sx(1.5)}/>`,
  grain: `<path d="M9.5 23v12M30.5 23v12M15.5 23v12M24.5 23v12" ${Sx(2.4)}/>
    <rect x="6" y="20" width="28" height="4" rx="1.5" fill="${C.haldi}" ${S}/>
    <path d="M9 20c-1-5 1-9 4-10.2l.8-1.8h3.4l.8 1.8c3 1.2 4 5.2 3 10.2z" fill="${C.white}" ${S}/>
    <path d="M20 20c-1-5 1-9 4-10.2l.8-1.8h3.4l.8 1.8c3 1.2 4 5.2 3 10.2z" fill="${C.white}" ${S}/>
    <path d="M13.6 9.8h3.6M24.6 9.8h3.6" stroke="${C.mittiDeep}" stroke-width="2" stroke-linecap="round"/>`,
  elders: `<circle cx="14" cy="10" r="4.2" fill="${C.skin}" ${S}/>
    <path d="M11.5 7.6q2.5-2.6 5.5-.2" fill="none" stroke="${C.white}" stroke-width="2" stroke-linecap="round"/>
    <path d="M9.6 16h8.8l1.4 12H8.4z" fill="${C.white}" ${S}/>
    <path d="M11.5 28v7M16.5 28v7M18.8 18.5l5 2" ${S}/>
    <path d="M24.4 19l2.6 16" stroke="${C.mittiDeep}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="30.5" cy="19" r="3.4" fill="${C.skin}" ${S}/>
    <path d="M27.5 23.6h6l.9 7.4h-7.8z" fill="${C.kesar}" ${S}/>
    <path d="M29.3 31v4.4M32.3 31v4.4" ${S}/>`,
  tent: `<path d="M2.5 34h35" ${S}/>
    <path d="M4.5 34L20 8.5 35.5 34z" fill="${C.kesar}" ${S}/>
    <path d="M12.6 22l-3.2 6M27.4 22l3.2 6" stroke="${C.kesarTint}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M15 34l5-10 5 10z" fill="${C.neel}"/>
    <path d="M20 8.5V3l5.5 2.2L20 7.4" fill="${C.dhaan}" ${Sx(1.6)}/>`,
  power: `<rect x="9" y="6" width="22" height="28" rx="3" fill="${C.white}" ${S}/>
    <rect x="15.5" y="11" width="9" height="16" rx="2" fill="${C.gandakTint}" ${Sx(1.8)}/>
    <rect x="17" y="19" width="6" height="7" rx="1.2" fill="${C.sindoor}" ${Sx(1.6)}/>
    <path d="M20 30.5v1" ${S}/>`,
  home: `<rect x="9" y="18" width="22" height="16" rx="1" fill="${C.mittiTint}" ${S}/>
    <path d="M5 19.5L20 7l15 12.5z" fill="${C.kesarDeep}" ${S}/>
    <path d="M10.5 16q2.2 2.2 4.4 0q2.2 2.2 4.4 0q2.2 2.2 4.4 0q2.2 2.2 4.4 0" fill="none" stroke="${C.kesarTint}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M17 34v-7.5a3 3 0 0 1 6 0V34" fill="${C.neel}"/>`,
  well: `<path d="M9.5 27V9M30.5 27V9M7 9h26" ${S}/>
    <path d="M20 9v8.5" ${Sx(1.6)}/>
    <path d="M16.6 17.5h6.8l-1 5h-4.8z" fill="${C.gandak}" ${Sx(1.6)}/>
    <path d="M7 28.5v4.6c0 2.2 5.8 4 13 4s13-1.8 13-4v-4.6" fill="${C.mitti}" ${S}/>
    <ellipse cx="20" cy="28.5" rx="13" ry="4" fill="${C.mitti}" ${S}/>
    <ellipse cx="20" cy="28.6" rx="8.6" ry="2.2" fill="${C.gandak}"/>`,
  phone: `<rect x="12" y="4" width="16" height="32" rx="3.5" fill="${C.neel}"/>
    <rect x="14" y="8" width="12" height="22" rx="1.5" fill="${C.dhaanTint}"/>
    <rect x="15.6" y="11" width="7.4" height="3.6" rx="1.8" fill="${C.white}"/>
    <rect x="17" y="16.6" width="7.4" height="3.6" rx="1.8" fill="${C.dhaan}"/>
    <rect x="15.6" y="22.2" width="5.6" height="3.6" rx="1.8" fill="${C.white}"/>
    <circle cx="20" cy="33" r="1.2" fill="${C.white}"/>`,
  speaker: `<path d="M7 16.5h5.5L25 8.5v23l-12.5-8H7z" fill="${C.haldi}" ${S}/>
    <path d="M29 14c2 3 2 9 0 12M32.6 10.8c3.6 5 3.6 13.4 0 18.4" fill="none" ${S}/>`,
  tractor: `<path d="M6 18.5h15v-7.5h6.5l3 7.5H34v7H6z" fill="${C.dhaan}" ${S}/>
    <path d="M22.6 13.2h3.8l2 5h-5.8z" fill="${C.gandakTint}" ${Sx(1.5)}/>
    <path d="M10.5 18.5v-6" ${S}/>
    <circle cx="27" cy="27.5" r="7" fill="${C.neel}"/><circle cx="27" cy="27.5" r="2.6" fill="${C.haldi}"/>
    <circle cx="11" cy="29.5" r="4.2" fill="${C.neel}"/><circle cx="11" cy="29.5" r="1.6" fill="${C.haldi}"/>`,
  sandbag: `<path d="M4 30.5c0-3.6 2.8-5.6 6.6-5.6h4.8c3.8 0 6.6 2 6.6 5.6s-2.8 4.6-6.6 4.6h-4.8C6.8 35.1 4 34.1 4 30.5z" fill="${C.mittiTint}" ${S}/>
    <path d="M18 30.5c0-3.6 2.8-5.6 6.6-5.6h4.8c3.8 0 6.6 2 6.6 5.6s-2.8 4.6-6.6 4.6h-4.8c-3.8 0-6.6-1-6.6-4.6z" fill="${C.mittiTint}" ${S}/>
    <path d="M11 21.5c0-3.6 2.8-5.6 6.6-5.6h4.8c3.8 0 6.6 2 6.6 5.6s-2.8 4.6-6.6 4.6h-4.8c-3.8 0-6.6-1-6.6-4.6z" fill="${C.mittiTint}" ${S}/>`,
  pin: `<path d="M20 36s11-11 11-19a11 11 0 0 0-22 0c0 8 11 19 11 19z" fill="${C.sindoor}" ${S}/>
    <circle cx="20" cy="17" r="4.4" fill="${C.white}" ${Sx(1.8)}/>`,
  check: `<path d="M9 21l7 7 15-16" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  play: `<path d="M13 8.5l19 11.5-19 11.5z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  pause: `<rect x="11" y="9" width="6.5" height="22" rx="2" fill="currentColor"/><rect x="22.5" y="9" width="6.5" height="22" rx="2" fill="currentColor"/>`,
  close: `<path d="M11 11l18 18M29 11L11 29" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>`,
  sound: `<path d="M7 16h5l9-7v22l-9-7H7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M26 15c1.8 2.8 1.8 7.2 0 10M30 11.5c3.4 5 3.4 12 0 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  mute: `<path d="M7 16h5l9-7v22l-9-7H7z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M26 16l8 8M34 16l-8 8" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  restart: `<path d="M30.5 20A10.5 10.5 0 1 1 26 11.4" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M26.5 5.5l.2 7-7 .3" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  mic: `<rect x="15" y="5" width="10" height="18" rx="5" fill="currentColor"/>
    <path d="M10 19a10 10 0 0 0 20 0M20 29v6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  send: `<path d="M6 20L34 7l-7 27-7-10z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
  camera: `<rect x="5" y="12" width="30" height="21" rx="4" fill="${C.white}" ${S}/><path d="M14 12l2.5-4h7l2.5 4" fill="${C.white}" ${S}/><circle cx="20" cy="22.5" r="5.5" fill="${C.gandakTint}" ${S}/>`,
  rupee: `<path d="M12 9h17M12 15h17M16 9c8 0 8 12 0 12h-3l12 11" fill="none" ${S}/>`,
  stamp: `<path d="M14 6h12v6c0 3 4 4 4 9H10c0-5 4-6 4-9z" fill="${C.sindoorTint}" ${S}/><rect x="7" y="21" width="26" height="6" rx="1.5" fill="${C.sindoor}" ${S}/><path d="M9 33h22" ${S}/>`,
  doc: `<path d="M10 5h14l7 7v23H10z" fill="${C.white}" ${S}/><path d="M24 5v7h7" fill="none" ${S}/><path d="M14 18h12M14 23h12M14 28h8" stroke="${C.neel2}" stroke-width="1.8" stroke-linecap="round"/>`,
  map: `<path d="M5 9l10-3 10 3 10-3v25l-10 3-10-3-10 3z" fill="${C.dhaanTint}" ${S}/><path d="M15 6v25M25 9v25" ${Sx(1.6)}/><path d="M8 24c5-2 8 2 12-1s8-4 12-2" fill="none" stroke="${C.gandak}" stroke-width="2.4" stroke-linecap="round"/>`,
  house_dot: `<path d="M6 19L20 8l14 11v15H6z" fill="currentColor" ${S}/>`,
};

/** The six danger signs as embankment cross-sections. 48 x 32. */
function signArt(kind: string): string {
  const water = (top: number) => {
    const x = 12 + ((28 - top) * 7) / 16;
    return `<path d="M1 ${top}H${x.toFixed(1)}L12 28H1z" fill="${C.gandak}"/>`;
  };
  const bank = `<path d="M12 28L19 12h10l7 16z" fill="${C.mitti}" ${Sx(1.8)}/>`;
  const ground = `<path d="M1 28h46" ${Sx(1.8)}/>`;
  switch (kind) {
    case "s_seep":
      return water(15) + bank + `<path d="M31.5 19.5l3.3 7.5" stroke="${C.gandakDeep}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
        <path d="M39 20.5c1.6 2.4 2.4 3.6 2.4 4.8a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.4 2.4-4.8z" fill="${C.gandak}" ${Sx(1.2)}/>` + ground;
    case "s_boil":
      return water(14) + bank + `<path d="M37 28q4-4 8 0z" fill="${C.mittiTint}" ${Sx(1.4)}/>
        <path d="M39.6 27c-.6-3 0-6 1.4-8.4 1.4 2.4 2 5.4 1.4 8.4z" fill="${C.boil}" ${Sx(1.3)}/>
        <circle cx="37.4" cy="19.6" r="1.2" fill="${C.boil}"/><circle cx="44.6" cy="20.6" r="1.1" fill="${C.boil}"/>` + ground;
    case "s_crack":
      return water(15) + bank + `<path d="M20 12l1.8 4 1.8-3 1.8 4 1.8-3.4 1.4 2.4" fill="none" stroke="${C.sindoor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` + ground;
    case "s_slip":
      return water(15) + `<path d="M12 28L19 12h10l2.2 5-3.4 4.6L31 28z" fill="${C.mitti}" ${Sx(1.8)}/>
        <path d="M31.2 17.5l-3.2 4.4 3.6 6.1h6.4z" fill="${C.mittiTint}" ${Sx(1.6)} transform="translate(2.6 1.2)"/>
        <path d="M37 13.5q3 1.5 3.6 4.6" fill="none" stroke="${C.sindoor}" stroke-width="1.8" stroke-linecap="round"/>` + ground;
    case "s_overtop":
      return `<path d="M1 10h28l7 18H1z" fill="${C.gandak}"/>` + bank.replace(C.mitti, C.mitti) +
        `<path d="M18.2 10.4h11.4l7 17" fill="none" stroke="${C.gandak}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M33 18.5l1.8 4.4 3.4-2.6" fill="none" stroke="${C.sindoor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` + ground;
    case "s_rat":
      return water(17) + bank + `<ellipse cx="17.6" cy="19" rx="1.4" ry="1.1" fill="${C.neel}"/>
        <ellipse cx="15.6" cy="23.4" rx="1.3" ry="1" fill="${C.neel}"/>
        <ellipse cx="20.6" cy="23.8" rx="1.2" ry=".95" fill="${C.neel}"/>
        <path d="M22 23.8q3 .2 3.6 2.6" fill="none" stroke="${C.neel}" stroke-width="1.2" stroke-linecap="round"/>` + ground;
    case "s_slump":
      return water(14) + `<path d="M12 28L19 12h2.6l2.4 3.6 2.4-3.6H29l7 16z" fill="${C.mitti}" ${Sx(1.8)}/>
        <path d="M24 6v4.4M22.4 9l1.6 1.8 1.6-1.8" fill="none" stroke="${C.sindoor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` + ground;
  }
  return "";
}

/** Glyphs for the AWS dock: white on a coloured tile. 40 x 40. */
const AWS: Record<string, string> = {
  lambda: `<path d="M12 31l8.2-15.4L16.8 9M20.2 15.6L28 31" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  sfn: `<circle cx="12" cy="12" r="4" fill="#fff"/><circle cx="28" cy="12" r="4" fill="#fff"/><circle cx="20" cy="28" r="4" fill="#fff"/><path d="M15.5 14.5l3 10M24.5 14.5l-3 10M16 12h8" stroke="#fff" stroke-width="2.4"/>`,
  ddb: `<ellipse cx="20" cy="11" rx="10" ry="4" fill="#fff"/><path d="M10 11v18c0 2.2 4.5 4 10 4s10-1.8 10-4V11" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M10 20c0 2.2 4.5 4 10 4s10-1.8 10-4" fill="none" stroke="#fff" stroke-width="2.6"/>`,
  s3: `<path d="M9 12l3 19c.4 2 3.8 3 8 3s7.6-1 8-3l3-19" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="20" cy="12" rx="11" ry="4" fill="#fff"/>`,
  events: `<path d="M8 10l9 10-9 10M18 10l9 10-9 10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 9v22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
  sns: `<circle cx="13" cy="20" r="3.4" fill="#fff"/><path d="M19 14a8 8 0 0 1 0 12M23.5 10a14 14 0 0 1 0 20M28 6.5a19 19 0 0 1 0 27" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  chat: `<path d="M7 10a3 3 0 0 1 3-3h20a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H17l-7 6v-6a3 3 0 0 1-3-3z" fill="#fff"/><circle cx="14" cy="17" r="2" fill="currentColor"/><circle cx="20" cy="17" r="2" fill="currentColor"/><circle cx="26" cy="17" r="2" fill="currentColor"/>`,
  transcribe: `<path d="M7 14v6M11 10v14M15 13v8M19 16v2" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M24 12h9M24 17h9M24 22h6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M8 29h24" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  bedrock: `<path d="M6 30c4-3 8-3 14-3s10 0 14 3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M9 23c3-3 7-4 11-4s8 1 11 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M13 16c2-3 4.5-4.5 7-4.5s5 1.5 7 4.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  polly: `<path d="M7 16h5l8-6v20l-8-6H7z" fill="#fff"/><path d="M25 15c1.8 2.8 1.8 7.2 0 10M29 11.5c3.4 5 3.4 12 0 17" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  location: `<path d="M20 34s10-9.6 10-17a10 10 0 0 0-20 0c0 7.4 10 17 10 17z" fill="#fff"/><circle cx="20" cy="17" r="4" fill="currentColor"/>`,
  scheduler: `<rect x="7" y="9" width="26" height="24" rx="3" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M7 15h26M14 6v6M26 6v6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M20 20v5l3.5 2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
  cloudwatch: `<circle cx="20" cy="20" r="13" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M11 23l5-5 4 4 8-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  kms: `<circle cx="14" cy="20" r="6" fill="none" stroke="#fff" stroke-width="2.8"/><path d="M20 20h14M29 20v5M33 20v4" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>`,
  apigw: `<path d="M8 33V17a12 12 0 0 1 24 0v16" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M14 25h12M22 21l4 4-4 4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  amplify: `<rect x="7" y="8" width="26" height="24" rx="3" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M7 14h26" stroke="#fff" stroke-width="2.6"/><path d="M12 20h10M12 25h16" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>`,
};

/** The inner drawing of an icon, for nesting inside a larger SVG. */
export const iconBody = (name: string) => BODIES[name] ?? "";

export function icon(name: string, cls = "ic"): string {
  if (name.startsWith("s_")) {
    return `<svg class="${cls} sign" viewBox="0 0 48 32" aria-hidden="true" focusable="false">${signArt(name)}</svg>`;
  }
  const body = BODIES[name];
  if (!body) return "";
  return `<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function awsGlyph(name: string): string {
  return `<svg class="ic" viewBox="0 0 40 40" aria-hidden="true" focusable="false">${AWS[name] ?? ""}</svg>`;
}
