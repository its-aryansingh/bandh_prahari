# Baandh Prahari web: design system

Read this before touching anything in web/. It is the contract for every screen.

## What the page is for

- **Who sees it:** hackathon judges first (English readers with three minutes), and the people the product serves: families behind the Gandak embankment, ward members, the mukhiya, engineers, control-room staff (Hindi readers, cheap phones, mobile data).
- **Its one job:** let a judge feel the answer clock (Jawab Ghadi) in one click, see that the data is real, and remember one name.
- **The one memorable thing:** the night of 29 to 30 September at Haijalpur, replayed as a cartoon diorama with two phones and a clock. Everything else stays quiet.

## The idea behind the look

The four colours the brief asked for are the warning scale India already uses. IMD's colour code is green (no advisory), yellow (be aware), orange (be prepared), red (take action). Baandh Prahari's four warning levels map onto it exactly:

| Level | Colour | IMD meaning | CAP responseType |
| --- | --- | --- | --- |
| सावधान, Saavdhan (watch) | haldi yellow | Be aware | Monitor |
| तैयार, Taiyaar (get ready) | kesar orange | Be prepared | Prepare |
| निकल चलो, Nikal chalo (move) | sindoor red | Take action | Evacuate |
| ख़तरा टला, Khatra tala (all clear) | dhaan green | No advisory | AllClear |

So colour is spent on state (Beacon's discipline): full-strength yellow, orange, red and green mean a warning level and nothing else. Large surfaces use their white tints. Buttons are indigo ink, so they never look like a warning.

The vernacular comes from the subject's own world: hand-painted Devanagari signboards, Madhubani double-line borders and its sun, moon and fish, Champaran indigo (the Gandak flows through Champaran), village-road milestones with an orange cap for the kilometre marks, the painted staff gauge with its red danger mark, the twin-bell alarm clock, the machaan, the gamchha, the village loudspeaker, the government office register and its rubber stamp.

## Tokens

| Token | Hex | Use |
| --- | --- | --- |
| `--chuna` (lime-wash white) | #FFFDF8 | Page |
| `--neel` (Champaran indigo) | #1F2350 | Text, every outline, primary buttons |
| `--haldi` / tint / deep | #F7B500 / #FFF5D1 / #B07E00 | Saavdhan; "be aware" surfaces |
| `--kesar` / tint / deep | #F27A1A / #FFE9D6 / #B5550C | Taiyaar; button shade |
| `--sindoor` / tint / deep | #D9342B / #FDE3DF / #9A2119 | Nikal chalo; P1 |
| `--dhaan` / tint / deep | #2E9D50 / #E2F4E5 / #1D6B36 | Khatra tala; "done", "ready" |
| `--gandak` / tint / deep | #3A8DB4 / #E1F0F7 / #24607D | Water only |
| `--mitti` / deep | #C79A5B / #94703E | Earth of the embankment, illustration only |
| `--raat` | #1B1E44 | The night sky of the replay, nowhere else |

Neutral text: `--neel-2` #4B5080 for secondary lines, `--neel-3` #8A8EB0 for disabled.

## Type

- **Yatra One** (Catherine Leigh Schmidt; Devanagari and Latin, drawn from hand-painted Indian railway signage): headings, big numerals, the clock. Painted with a solid offset "drop shade" in kesar, the way sign painters shade letters.
- **Baloo 2** 500 and 700 (Ek Type, rounded Indic sans): everything you read. Body 18px with line-height 1.6 for Devanagari.
- Scale: 14, 16, 18, 21, 24, 36, 48, 72 (clamped on phones).
- Bilingual like a government signboard: Hindi on top, English below and smaller. A toggle shows हिंदी, English or both; both is the default.

## Shapes

- Every card, button and illustration uses one ink: a 2.5px indigo outline.
- Shadows are solid, offset and coloured: the card's own colour, darker. Never grey, never blurred.
- Radius follows hierarchy: stage and big panels 22px, cards 16px, buttons 14px, chips round.
- Card types follow what they represent: signboard (double frame), chat bubble, register row (ruled paper, red margin), stamped receipt, level card, milestone badge. Never one generic card.
- No gradients, no glassy blur, no neon, no dark mode first.

## Motion

Cartoon physics: anticipation, overshoot and settle, squash on press. Springs come from the kit's damped-spring formula, baked into CSS `linear()` curves (`--spring`, `--spring-pop`, `--spring-soft`).

Rules:

1. Motion explains a change. Nothing moves for decoration.
2. One orchestrated moment on load (the hero: the river rises, the boil starts, the clock starts). No fade-up on every section.
3. Everything else answers a person's action, or is part of the replay they started.
4. The replay is a pure function of time, like the kit's `seek(t)`: it can be paused, scrubbed and recorded for the video.
5. `prefers-reduced-motion`: every effect jumps to its end state; the replay becomes step-by-step.

### Where each of the 16 kit effects lives

| Kit effect | In Baandh Prahari | Meaning |
| --- | --- | --- |
| 01 Button to player | "Replay the night" grows into the theatre | Your click becomes the night |
| 02 Search to results | Nadi ka haal: type a village, replies stage in | Asking the river |
| 03 Card to workspace | A register row opens into the incident | One report becomes the whole case |
| 04 Tabs to panels | Who gets what: family, ward member, engineer, control room | Same incident, different messages |
| 05 Chart morph | Gandak discharge: daily bars become the trend | 29 September stands out |
| 06 Dashboard zoom | "18 of 25 homes ready" zooms out of the control room | The number that matters |
| 07 Spring stack | The four warning cards | Pick a level, it springs forward |
| 08 Magnetic dock | AWS services | What each one does here |
| 09 Masked type | The village name fills with water to today's level | How high is the river, for me |
| 10 Elastic type | "निकल चलो!" in the replay | The loudspeaker shout |
| 11 Text to layout | The voice-note transcript becomes the report | What the AI drafts |
| 12 Image reveal | A bamboo chik blind rolls up on "what could have been" | The same night, ready |
| 13 Perspective shift | People, rules, AWS, government data as layers | How it is built |
| 14 Glass focus | The timeline lens on 11:51 PM | The minute nobody answered |
| 15 Flowing paths | The escalation ladder; data in from SACHET, out as CAP | Who is asked next |
| 16 Particle logo | Households tapping "हो गया" fly into the ward's count; the closing mark | Every dot is a family ready |

## Copy

- Hindi first, plain spoken Hindi (बाँध, not only तटबंध). Sentence case in English. No all-caps labels, no middle-dot strings, no arrows on buttons.
- Every number names its source and time. Sample data says नमूना (sample). The replay says it is a re-enactment.
- Buttons say what happens: रात दोबारा चलाएँ (Replay the night), हो गया (Done), घड़ी शुरू करें (Start the clock).
- Always visible: "यह छात्र परियोजना है, सरकारी चेतावनी नहीं" and the helplines 1070 and 1800 345 6145.

## Review against the brief (what changed before building)

- Primary buttons were going to be saffron. Saffron means "get ready", so buttons became indigo ink with a saffron shade and the four colours stay pure.
- A stats-strip hero (big number, small label) is the default; replaced by a painted signboard beside a cartoon cross-section of the actual embankment.
- Section fade-ups and hover tilts on every card are the generic default; removed. Motion is kept for the hero moment, the replay and responses to taps.
- The brief asks for cards; the SaaS card kit (same radius, same grey shadow) is the generic version. Cards here differ by what they are.
- Generic sans pairs were rejected for Yatra One (painted railway signage) and Baloo 2.
