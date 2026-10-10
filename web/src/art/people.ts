// Cartoon faces for the roster and the chats. 48 x 48, one ink, flat fills.
import { C } from "./palette";

const S = (w = 2.2) => `stroke="${C.neel}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

let uid = 0;

interface FaceOpts {
  bg: string;
  shirt: string;
  hair?: string;
  hat?: string;
  glasses?: boolean;
  mustache?: string;
  closedEyes?: boolean;
  woman?: boolean;
}

function faceSvg(o: FaceOpts): string {
  const id = `fc${++uid}`;
  const eyes = o.closedEyes
    ? `<path d="M18.6 22.4q1.8 1.4 3.6 0M25.8 22.4q1.8 1.4 3.6 0" fill="none" ${S(1.6)}/>`
    : `<circle cx="20.4" cy="22" r="1.5" fill="${C.neel}"/><circle cx="27.6" cy="22" r="1.5" fill="${C.neel}"/>`;
  const glasses = o.glasses
    ? `<circle cx="20.4" cy="22" r="3.4" fill="none" ${S(1.5)}/><circle cx="27.6" cy="22" r="3.4" fill="none" ${S(1.5)}/><path d="M23.8 22h.4" ${S(1.5)}/>`
    : "";
  const mustache = o.mustache
    ? `<path d="M19.6 27.6q4.4 2.8 8.8 0q-4.4-1.2-8.8 0z" fill="${o.mustache}" ${S(1)}/>`
    : `<path d="M21.6 28.2q2.4 1.6 4.8 0" fill="none" ${S(1.5)}/>`;
  const woman = o.woman
    ? `<path d="M12.6 33c-1.8-17 4.4-24.2 11.4-24.4 7 .2 13.2 7.4 11.4 24.4-1.6-10.8-5-15.6-11.4-15.8-6.4.2-9.8 5-11.4 15.8z" fill="${C.kesar}" ${S()}/>
       <path d="M24 9.6v6.4" stroke="${C.sindoor}" stroke-width="1.8" stroke-linecap="round"/>
       <circle cx="24" cy="17.8" r="1.3" fill="${C.sindoor}"/>
       <circle cx="14.8" cy="27" r="1.3" fill="${C.haldi}" ${S(1)}/><circle cx="33.2" cy="27" r="1.3" fill="${C.haldi}" ${S(1)}/>`
    : "";
  return `<svg class="face" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <defs><clipPath id="${id}"><circle cx="24" cy="24" r="21.6"/></clipPath></defs>
    <circle cx="24" cy="24" r="22.6" fill="${o.bg}"/>
    <g clip-path="url(#${id})">
      <path d="M7 50c0-9.6 7.4-15.2 17-15.2S41 40.4 41 50z" fill="${o.shirt}" ${S()}/>
      <rect x="20.6" y="28.5" width="6.8" height="7" fill="${C.skin2}"/>
      <circle cx="14.6" cy="23.4" r="2.3" fill="${C.skin}" ${S(1.8)}/><circle cx="33.4" cy="23.4" r="2.3" fill="${C.skin}" ${S(1.8)}/>
      <ellipse cx="24" cy="22.4" rx="9.6" ry="10.6" fill="${C.skin}" ${S()}/>
      ${o.hair ?? ""}${eyes}${glasses}${mustache}${o.hat ?? ""}${woman}
    </g>
    <circle cx="24" cy="24" r="22.6" fill="none" ${S()}/>
  </svg>`;
}

const hairShort = `<path d="M14.6 20.6c.4-8.4 4.6-12 9.8-12 5.6 0 9.4 3.6 9.4 10.6-3-4-8.8-5.4-13.2-4.2-2.6.8-4.6 2.8-6 5.6z" fill="${C.neel}"/>`;
const hairGrey = `<path d="M14.6 20.6c.4-8.4 4.6-12 9.8-12 5.6 0 9.4 3.6 9.4 10.6-3-4-8.8-5.4-13.2-4.2-2.6.8-4.6 2.8-6 5.6z" fill="${C.neel3}"/>`;

const FACES: Record<string, () => string> = {
  prahari: () =>
    faceSvg({
      bg: C.haldiTint,
      shirt: C.kesarTint,
      mustache: C.neel,
      hat: `<path d="M13.4 19.6c-.4-7.6 4.4-12.2 10.6-12.4 6.2.2 11 4.8 10.6 12.4-6.8-3-14.4-3-21.2 0z" fill="${C.sindoor}" ${S()}/>
            <path d="M16.6 11.6l3 6.4M22 9.2l2.6 7.2M27.6 9.4l1.6 7M31.4 12.6l.6 5.4" stroke="${C.white}" stroke-width="1.6" stroke-linecap="round"/>`,
    }),
  je: () => faceSvg({ bg: C.gandakTint, shirt: C.white, hair: hairShort, glasses: true }),
  je_sleep: () => faceSvg({ bg: C.gandakTint, shirt: C.white, hair: hairShort, closedEyes: true }),
  ae: () =>
    faceSvg({
      bg: C.dhaanTint,
      shirt: C.white,
      mustache: C.neel,
      hat: `<path d="M13 19.4c0-7.4 4.8-11.6 11-11.6s11 4.2 11 11.6z" fill="${C.haldi}" ${S()}/><path d="M11.4 19.6h25.2M24 8v5" ${S()}/>`,
    }),
  ee: () => faceSvg({ bg: C.kesarTint, shirt: C.gandakTint, hair: hairGrey, glasses: true, mustache: C.neel3 }),
  mukhiya: () =>
    faceSvg({
      bg: C.haldiTint,
      shirt: C.white,
      mustache: C.neel,
      hat: `<path d="M14.2 17.4l19.6-1.8-1.2-5.2c-6-2.6-12.4-2.4-17.8.4z" fill="${C.white}" ${S()}/>`,
    }),
  ward: () => faceSvg({ bg: C.dhaanTint, shirt: C.kesar, woman: true }),
  family: () => faceSvg({ bg: C.kesarTint, shirt: C.dhaan, woman: true }),
  dm: () => `<svg class="face" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22.6" fill="${C.gandakTint}" ${S()}/>
      <path d="M11 20h26l-13-8z" fill="${C.kesarTint}" ${S()}/>
      <path d="M14 20v12M20 20v12M28 20v12M34 20v12" ${S(2.4)}/>
      <path d="M10.5 33.5h27" ${S(2.6)}/>
    </svg>`,
  central: () => `<svg class="face" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22.6" fill="${C.haldiTint}" ${S()}/>
      <rect x="13" y="20" width="22" height="14" rx="1.5" fill="${C.white}" ${S()}/>
      <path d="M24 20v-8M20 12.5a5.6 5.6 0 0 1 8 0M17.4 9.8a9.4 9.4 0 0 1 13.2 0" fill="none" ${S(1.8)}/>
      <path d="M17 25h4M17 29h4M27 25h4M27 29h4" ${S(1.8)}/>
    </svg>`,
  rules: () => `<svg class="face" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22.6" fill="${C.white}" ${S()}/>
      <path d="M24 12v24M14 17h20" ${S(2.4)}/>
      <path d="M14 17l-4 9h8zM34 17l-4 9h8z" fill="${C.haldiTint}" ${S(1.8)}/>
      <path d="M18 36h12" ${S(2.6)}/>
    </svg>`,
  village: () => `<svg class="face" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22.6" fill="${C.kesarTint}" ${S()}/>
      <rect x="12" y="24" width="15" height="11" fill="${C.mittiTint}" ${S(1.8)}/>
      <path d="M9.5 25L19.5 16l10 9z" fill="${C.kesarDeep}" ${S(1.8)}/>
      <rect x="29" y="27" width="9" height="8" fill="${C.mittiTint}" ${S(1.8)}/>
      <path d="M27.5 28l6-5.4 6 5.4z" fill="${C.kesarDeep}" ${S(1.8)}/>
      <path d="M8 35h32" ${S()}/>
    </svg>`,
};

export function face(kind: string): string {
  return (FACES[kind] ?? FACES.prahari)();
}
