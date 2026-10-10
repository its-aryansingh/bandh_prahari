# Task for the Claude Code cloud session

Work in this repo on `main`. Small commits ("area: what changed"), `git fetch origin main` and rebase before every push.

## Read first
`AGENTS.md`, `docs/SPEC.md`, `web/DESIGN.md` (the design contract) and `docs/reference/` (two PDF blueprints plus a README). Use the blueprints as the integration plan: terrain fusion with embankment breaklines, dynamic water shading, the SAR + optical satellite pipeline, safe evacuation routing, Yuva Aapda Mitra volunteers and relief teams, the escalation clock with task tokens, geofenced presence, nightly roll-call, Aapda Sampoorti/PFMS. SPEC.md wins on conflicts. Ignore `planning/`.

## The user's request (honour every word)
"world class 0.1% grade project for realtime visualisation inspired by CampusEvac but in Mithila style instead of Minecraft, with real Bihar government utility using real-time AWS satellite data, and useful to relief support ... keep the same theme: Mithila, vernacular, cartoon, Indian tones ... visualise the river embankments and village localities using AWS satellite data with real-time updates, like CampusEvac's Minecraft visualisation but as a Mithila-style real-time animated satellite visualisation ... not just a showcase but real utility for the Bihar government, people, and relief support groups who help in floods (they act like the evacuators in CampusEvac): help people in real time by tracking them on the map; include the reference documents in the plan as the tech blueprint for integration."
Earlier brief: vernacular; orange/yellow/green with dominant Indian tones and their white tints; cards; cartoon-feel animation. Inspirations: CampusEvac (Best UI: committed identity, mascot, "Practice solo", game HUD, 3D campus) and Beacon (colour only on state, live proof strip, 90-second judge path, night replay).

## Task 1, the main one: "सजीव नक़्शा", the live flood map
A new section after Nadi ka haal (nav "सजीव नक़्शा / Live map") plus a full-screen map mode.

1. **Mithila voxel diorama.** An isometric, blocky 3D view of the Haijalpur stretch from `web/mock/map.haijalpur.json`: 56×46 cells of about 200 m; `elev_dm` (Copernicus DEM), `cls` (ESA WorldCover: 10 trees, 30 grass, 40 crop, 50 built, 80 water, 90 wetland), `built` %, `s2.water` / `s2.cloud` % from the Sentinel-2 pass of 3 Oct 2026. It is all real AWS Open Data, built by `tools/build_map.py`. Prefer a canvas-2D renderer (a cached terrain layer and an animated top layer) for cheap phones, and exaggerate the 11 m relief. Draw it as Madhubani art: indigo ink outlines, flat fills from `src/styles/tokens.css`, hatched fields, a wave-patterned river with Madhubani fish, Madhubani trees, small khapda-roof huts on built cells, a hatched double frame. Drag to pan, wheel or pinch to zoom, rotate 90°, and tap a cell for a card. Respect reduced motion.
2. **Real layers, honestly labelled:**
   - Observed flood water from the satellite pass, with its date and a note that satellites revisit every few days.
   - A what-if flood slider tied to the gauge level: fill from the river over connected DEM cells, with the water animating up through the blocks.
   - The embankment as a ridge with kilometre stones on the south-west (Saran) bank, labelled approximate.
   - The villages (Haijalpur, Parmanand Chhapra, Naukraha) on built-up clusters, labelled approximate.
   - Relief camps on the highest dry ground.
   - The Rewaghat gauge reading from `mock/gauges.json`.
   - Safe evacuation routes over dry cells.
3. **Three roles:**
   - **ज़िला / सरकार:** readiness per village, open help requests, teams, flooded area, households at risk, minutes to reach.
   - **राहत दल** (relief groups and Aapda Mitra, the CampusEvac "warden"): requests nearest first. "मैं जा रहा हूँ" claims one and starts a 20-minute answer clock; if nobody arrives in time it climbs to the next team. "सुरक्षित" marks the family rescued.
   - **परिवार:** "मदद चाहिए" drops a request at the family's pin and shows the nearest camp, the route, and the team's ETA.

   Team positions come from Amazon Location Service trackers; families send a WhatsApp pin with "मदद". The demo simulates 3 teams (a boat, the "बाँध एम्बुलेंस" tractor, SDRF) and 6–8 synthetic requests, each labelled नमूना. Privacy (DPDP): the public view shows counts per village only; exact pins appear only in the relief and district views; no names or numbers.
4. **Backend contract.** Add to `docs/SPEC.md`, `web/src/types.ts`, the mocks and `api.ts`:
   - `GET /map/{stretch}`, `GET /help?status=open`, `POST /help`, `POST /help/{id}/claim`, `POST /help/{id}/rescued`, `GET /teams`, `POST /teams/{id}/position` (calls Location `BatchUpdateDevicePosition`).
   - A daily satellite Lambda: EventBridge Scheduler, Earth Search STAC on AWS, a Sentinel-2 NDWI mask with SCL clouds masked, plus Sentinel-1 GRD radar (requester-pays), writing the grid JSON to S3.
   - Help requests run on the same Step Functions answer clock.
   - Update the web rule in `AGENTS.md` to match.

## Task 2: polish (from review)
- English lines under display headings stay small and unshaded.
- The hero is too tall at 1440×900: the buttons must sit above the fold.
- In the river chart, the peak label collides with "today": move it left of the peak, on two lines.
- The two-mornings scenes are too small: zoom to the village side.
- In "both" mode, the government flow and replay ladder SVG labels need English sub-labels (`.en-both` / `.hi-only` exist).
- The AWS dock overflows: size its icons from the container width.
- Finish the layers card.
- Tighten the level-deck fan.
- 390 px: no horizontal overflow, and the theatre usable on a phone.
- No console errors.

## Quality bar and checks
Top 0.1% craft: the map is the most memorable thing on the page, as beautiful as a Madhubani painting and as useful as a control-room screen. Follow `web/DESIGN.md` (two fonts: Yatra One + Baloo 2; ink outlines; coloured offset shadows; motion only to explain change; Hindi first; honest labels; helplines 1070 and 1800 345 6145 always reachable). Verify with Playwright at 1440×900 and 390×844 in all three languages, look at the screenshots and fix what you see; `cd web && npm ci && npm run build` must pass. Don't deploy, add no secrets, phone numbers or account IDs, and keep CAP drafts marked Exercise. Push to `main`, then summarise what you built, what you verified, and what you could not verify.
