# Baandh Prahari: product roadmap, from MVP to statewide

Written 11 October 2026. This plan folds in the two strategy papers Aryan supplied (*Strategic Technical Analysis and Product Roadmap for the Bandh Prahari Platform* and *Strategic Integration of the Bandh Prahari Platform for the Government of Bihar*), and the two blueprints in `docs/reference/`.

**Nothing in this file is to be built for the hackathon.** `docs/SPEC.md` remains the contract for the MVP. Each phase below becomes SPEC sections, and then Antigravity prompts, only when it is scheduled. Antigravity does the building, testing and API integration; this file is the plan it builds from.

---

## 1. Where the product stands: the MVP for the Government of Bihar

This is what exists in the repository and has been tested (140 backend tests, CI green). It is the only thing a pitch may describe in the present tense.

| Capability | What is built | Where |
| --- | --- | --- |
| **Jawab Ghadi, the answer clock** | AWS Step Functions Standard workflow. It pages the junior engineer with a task token stored under a short wait ID, then climbs JE → AE → EE + district → the zone's flood-fighting force on a timeout. If there's no delivery receipt within 2 minutes, it climbs at once. Every step is written to the timeline. | `statemachine/incident.asl.json`, `src/incident/` |
| **Plain rules set priority** | Pure functions, with a test for every rule, and a test that engineers can raise a priority but never lower it | `src/rules/priority.py` |
| **WhatsApp on AWS** | End User Messaging Social. SNS intake returns fast, deduplicates on message ID, and supports the TEST path. Telegram can be switched in with one parameter. | `src/channels/`, `src/intake/` |
| **Government data in** | SACHET CAP feed (every 15 min) and FMISC gauges (every 3 h); GloFAS as the fallback; "Nadi ka haal" (river status) in Hindi | `src/gov/`, `src/river/` |
| **Government formats out** | CAP 1.2 drafts, always status Exercise, checked against the OASIS schema | `src/gov/cap.py` |
| **Help and relief teams** | Help run on the same clock (20-minute relief clock, climbs to the next team); Amazon Location tracker and a 200 m geofence; public sees counts only | `statemachine/help.asl.json`, `src/help/`, `src/teams/` |
| **Records** | DynamoDB timeline. S3 with Object Lock in **governance mode, 1 day** (hackathon setting). Every log group kept 180 days. KMS on SNS. One IAM role per function. | `template.yaml` |
| **Public page** | Replay of the 29–30 September night; four warning levels; control room; judge path to a real Step Functions run | `web/` |
| **3D live map** | WebGL view of a 200 m grid. Ground: Copernicus DEM. Land: ESA WorldCover. Buildings, roads, bridges and public places: Overture Maps on AWS Open Data (~39,000 footprints in the window). Trees: from WorldCover pixels. Water: Sentinel-2, before (20 Sep) and after (6 Oct) the breach. Live layers: incidents, the patrol at each kilometre, help and teams. 2D painting kept as the fallback. | `web/src/map/`, `tools/build_map.py`, `tools/build_features.py` |
| **Pilot pack** | Hindi and English concept notes, pilot proposal, 10-slide deck | `docs/pilot/` |

**Not built yet, and on the MVP plan:**
- voice notes (Transcribe + Strands drafter)
- Polly clips
- night roll-call
- IRS Form 001 briefing
- the daily satellite Lambda and `GET /map`
- geofence check-in for engineers (the help run has one; the incident run uses a distance check)

See `docs/ANTIGRAVITY_PLAN.md`.

---

## 2. Fact-check before anything goes to the government

The two strategy papers are strong on the problem. But they describe several things as already running in this repository that are not, and a few figures need a source. An official who opens the repository will check. Fix these in any deck, letter or proposal before it is sent.

### 2a. Statements about the codebase that are wrong today

| The papers say | The repository actually has | What to say instead |
| --- | --- | --- |
| "a robust MERN (MongoDB, Express.js, React, Node.js) stack frontend" | Vite + plain TypeScript web page; Python 3.12 Lambdas on AWS SAM; DynamoDB. No MongoDB, Express, React or Node server. | "A serverless AWS stack: Python Lambdas, Step Functions, DynamoDB; a lightweight TypeScript web client" |
| "Python-driven machine learning backend" | No ML model. Priority comes from deterministic rules; the AI only drafts (Bedrock/Strands is a next step). | "Deterministic rules; generative AI only drafts reports" (a strength for government, not a gap) |
| "The repository's infrastructure-as-code ... automates the creation of a private certificate authority" and mTLS at API Gateway | No mTLS, no custom domain, no truststore. Public routes are throttled; role tokens are in SSM. | mTLS is Phase 1 (below) |
| S3 Object Lock "Compliance Mode for a mandatory 180-day retention" | Governance mode, 1-day retention (deliberately, so a hackathon stack can be deleted) | Compliance mode, 180 days, in the pilot account after sign-off (Phase 1). It cannot be undone, so it's the department's decision. |
| Engineers stream GPS "via MQTT to AWS IoT Core"; "45-minute geofence" on the incident run | No IoT Core. The help run has a geofence; the incident run has a distance check on a WhatsApp location pin. | WhatsApp location pin + Amazon Location geofence (Phase 1); IoT Core only if a field app is built (Phase 5) |
| "sounding sirens at the SEOC"; "flags ... on the FMISC dashboard" | No SEOC or FMISC write-back. Climbs go by WhatsApp to the roster. | Phase 1 needs an SEOC integration agreement; FMISC write-back needs WRD's API |
| Cesium Terrain Builder TIN, Quantized Mesh, py3dtiles .b3dm, CesiumJS shader, Timestream WSE API | three.js view of a 200 m grid; a drawn embankment line; buildings as extruded Overture footprints | Phase 2. Amazon Timestream for LiveAnalytics is **closed to new customers** (AWS documentation, "availability change"), so the water level stays in DynamoDB or moves to Timestream for InfluxDB. |
| Offline-first camp ledger, AppSync, SQLite, Aadhaar/ration-card QR scanning, PostGIS, pgRouting | None of these | Phase 3 (ledger) and Phase 4 (routing) |
| "Ready-to-deploy", "drops PFMS validation failures effectively to zero" | MVP. No pilot has been agreed. | "Built and tested; ready for a one-district pilot." Promise a measured reduction, not zero. |
| Haijalpur breach at "right Saran embankment (km 46.5)" | Our kilometre marks are our own (the map uses km 14) | Use the department's chainage once WRD shares it; until then say "near Haijalpur" |

### 2b. Figures that need a primary source before use

| Figure | Status |
| --- | --- |
| 68,800 km² flood-prone, 73% of 94,163 km², 28 of 38 districts | Matches FMISC's own history page. Cite it. |
| Embankments "3,746–3,790 km" | Our sourced figure is 3,808 km (Patna Press, 2025). Pick one and cite the department. |
| 36,460 km² protected | To confirm with WRD |
| Birpur ~9.5 lakh cusec and Valmikinagar ~8.5 lakh cusec design capacity | To confirm with WRD |
| Kusaha 2008: breach at 1,44,000 cusecs, 120 km shift | Widely reported; cite a paper (e.g. Sinha et al. on the 2008 avulsion) |
| Kosi sediment: 101 Mt/yr at Chatara (paper 1) vs 43 Mt/yr at Baltara (paper 2) | Both can be true at different stations. Label each with its station and source. |
| Gandak sediment "450–510 million tonnes annually" | Looks high. **Verify before use**, or drop it. |
| 2019 floods: 88.47 lakh people, 1,269 villages, 130 deaths, 199 camps | To confirm (DMD/BSDMA report) |
| "PFMS failure 20–30% in 2019" | Needs a citation (CAG or DMD). This is the centre of the relief argument, so don't use it without one. |
| ₹6,000–7,000 ex-gratia; ₹7,000 to 8,27,472 families in 2026 | The second is sourced (UNI, 15 Sep 2026) |
| Fasal Sahayata ₹7,500/ha; Kanya Utthan amounts | Check current scheme rates on the state portals |
| Tata Trusts / Megh Pyne Abhiyan 2024: 2,290 households, 91% cut meals, 75% borrowed food | Cite the report directly |
| 14 zonal flood-fighting forces | Sourced (WRD resolution, 27 May 2026) |

### 2c. Legal points the papers skip

- **Aadhaar.** Scanning Aadhaar QR codes and keying records on an "Aadhaar hash" falls under the Aadhaar Act 2016 and UIDAI's regulations (offline verification, Aadhaar Data Vault, consent). The ledger must use UIDAI's Secure QR offline verification as a registered entity, or avoid Aadhaar and key on ration card number plus a keyed hash. Never store the Aadhaar number. Get legal review before Phase 3.
- **DPDP Act 2023.** Section 7 allows processing to assist people during a disaster. Retention limits, notices and a grievance contact still apply.
- **Government channels.** Sending official alerts (SACHET, Cell Broadcast) stays with the authorised officer. Government SMS needs DLT registration as a "-G" sender.
- **Object Lock compliance mode** is irreversible for its retention period. Only the department's account owner should switch it on.

---

## 3. The roadmap

Each phase lists what it adds, why, how it would be built on AWS, what the government must provide, how success is measured, and what it depends on.

### Phase 1. Pilot hardening: one district, monsoon 2027 (December 2026 to May 2027)

*Goal: the MVP becomes something a department can run and audit. Proposed to WRD and the District Magistrate, Saran.*

| Item | Build | Needs from government | Measure |
| --- | --- | --- | --- |
| **Geofenced presence on every P1** (paper 1, feature 1) | After "on my way", the incident run waits up to 45 min for a WhatsApp location pin inside a 200 m Amazon Location geofence (`BatchEvaluateGeofences`). If none arrives, the site becomes "Unmanned" and climbs. | Roster with phone numbers; agreement on 45 min | Share of P1s with a verified on-site check-in; minutes to site |
| **Night roll-call** (feature 1) | EventBridge Scheduler, every 2 h from 22:00 to 06:00 while an upstream gauge is above danger level: "km X: sab theek?". No reply in 20 min marks the stretch "unmonitored" and pages the JE. | Patrol roster by kilometre | Roll-call coverage per night |
| **IRS Form 001 briefing** (feature 4) | Filled from the timeline first. Bedrock (Strands) writes only the narrative; HTML to PDF. | The district's preferred format | Minutes from P1 to briefing |
| **Voice reports** | Transcribe hi-IN and the Strands drafter; the tap still sets the sign | — | Share of reports by voice; misread rate |
| **Department chainage** | Replace our drawn line and km marks with WRD's chainage (BEAMS/EAMS shapefile) | Data-sharing letter for the Gandak stretches | All incidents tagged by official chainage |
| **mTLS for state systems** (paper 2) | API Gateway custom domain with a truststore in a KMS-encrypted S3 bucket, for state-to-platform calls only. Public routes stay as they are. | The state's CA, or certificates we issue for them | Zero unauthenticated state calls |
| **Audit-grade records** | S3 Object Lock **compliance mode, 180 days**, in the department's own account; CloudTrail data events on the bucket | Account ownership by WRD/BSDMA | — |
| **Access** | Cognito with MFA for control-room, relief and district roles (replaces SSM role tokens) | User list | — |
| **Standby region** | Hyderabad (ap-south-2): DynamoDB global table, Step Functions and Lambda redeployed. Transcribe, Polly and Location aren't offered there, so voice falls back to buttons and geofence to a distance check. | — | Recovery drill passes |
| **Government channels** | Sandes or DLT-registered "-G" SMS for officials who can't use WhatsApp | NIC/TRAI registration | Delivery rate |

**Exit gate:** two dry-run drills with the district before 15 June, then a live season with a weekly report to the nodal officer.

### Phase 2. Terrain that keeps the embankment (2027, alongside the pilot)

*Goal: the 3D map tells a District Magistrate the truth about which reach will overtop. Paper 1 feature 2 and phase 3.*

1. **Burn the embankment into the ground.** First step, cheap: in `tools/build_map.py` and the daily Lambda, raise the cells along WRD's surveyed crest line to the surveyed crest height, instead of our assumed 4 m. The flood fill (`web/src/map/flood.ts`) then stops water at the real crest.
2. **Finer ground.** Move from 200 m cells to the DEM's 30 m, and then to CartoDEM or survey DTMs where WRD has them.
3. **True terrain tiles.** An AWS Batch job builds a TIN with the crest breaklines burned in and exports quantized-mesh terrain tiles. Buildings become 3D Tiles carrying LGD village codes. Both are served from S3 behind CloudFront with Origin Access Control, Brotli compression, year-long cache on static tiles, and 15-second cache on live endpoints.
4. **Water as a shader.** The client places a water plane at the forecast or observed surface level from the API and compares depth per pixel. The current three.js view can take this shader directly; CesiumJS only becomes necessary if the department wants the whole state on a globe.
5. **Satellites every pass.** The daily Lambda (`src/sat/grid.py`, already specified) adds Sentinel-1 radar water extent: requester-pays GRD, calibrated, filtered and thresholded, on AWS Batch. Radar sees through monsoon cloud, which hid much of this area on 28 Sep and 10 Oct. Each pass's water becomes a polygon for Phases 3 and 4.
6. **Drone LiDAR** (paper 1, phase 3). Ingest point clouds for critical reaches, extract bare earth, and inject a sub-metre DTM into the same tile pipeline. This depends on WRD flying the reaches.

**Needs:** WRD embankment shapefiles with crest and toe levels; DTMs where they exist. **Measure:** the what-if overtopping level at Rewaghat matches WRD's own HFL records for past events.

### Phase 3. The relief camp ledger (2027 to 2028)

*Goal: families get ex-gratia faster, with fewer bank rejections. Paper 1 feature 3, paper 2 feature 3.*

- **App.** First a Progressive Web App that works offline (IndexedDB), so no app-store step is needed. A native app later if the camps need camera scanning beyond the browser.
- **Intake.** Scan the ration card, plus Aadhaar Secure QR offline verification only if the department is a registered offline verification entity (see 2c). Sign and timestamp each record on the device. Sync when any signal returns: AppSync delta sync, or a plain idempotent batch API (simpler, same DynamoDB rules).
- **No double claims.** DynamoDB single-table design. `BENEFICIARY#<keyed hash>` / `RELIEF#<season-wave>` is written with `attribute_not_exists(SK)`, so a second camp can't register the same family for the same wave. The keyed hash uses an HMAC key in KMS, never the raw ID.
- **Residency proof.** Join the family's LGD village code to that wave's flood polygons from Phase 2's satellite passes, with an officer override.
- **Export.** A deduplicated batch in **Aapda Sampoorti's exact intake format**, which DMD must provide. Camp stock on `CAMP#<id>` / `ITEM#<kind>`.
- **Needs:** DMD's format and a test environment; legal sign-off on IDs; BSDMA-trained volunteers for a camp pilot.
- **Measure:** days from camp intake to DBT credit; share of records rejected by PFMS. Target a reduction against the district's own last season, not "zero".

### Phase 4. Ward-level command for volunteers (2027 to 2028)

*Goal: Aapda Mitra and Ganga Prahari volunteers become the eyes and hands at ward level. Paper 1 feature 4.*

- **Safe routing.** The road graph already exists: about 2,560 real segments are in `web/public/map/haijalpur-features.json` from Overture. Load roads statewide into PostGIS on Amazon RDS with pgRouting. On each new flood polygon, set the cost of submerged edges to infinity (`ST_Intersects`), and route with `pgr_dijkstra` to real shelters: schools and health centres from Overture places, verified by the Circle Officer.
- **Volunteers as sensors.** Volunteers report through the same WhatsApp intake, and the same rules set priority. Teams appear on the Amazon Location tracker, which is already built for relief teams.
- **Ward dashboard.** The 3D map's district view, scoped to a ward: open incidents, unmonitored stretches, households ready, help requests, teams.
- **Needs:** volunteer rosters from BSDMA. **Measure:** minutes from a help request to a team on site; share of routed trips that stayed dry.

### Phase 5. Communications that survive the flood (2028)

Paper 1, phase 1.

- **LoRaWAN pagers** for JEs on critical reaches, through AWS IoT Core for LoRaWAN, so a page and its acknowledgement survive a carrier outage. The acknowledgement goes straight into the existing task-token flow.
- **Bluetooth mesh** between camp devices, so one device can carry the whole camp's ledger out when it finds a signal.
- **Amazon Connect** voice calls for pages, once Indian numbers are provisioned. Lead time is weeks.
- **Measure:** page delivery during the worst hour of the worst night.

### Phase 6. Prediction: a research track with partners (2028 onwards)

Paper 1, phases 2 and 5. Each item runs as a study with an academic partner (IIT Patna, IIT Kanpur, CWC) before any of it feeds the clock. The rules stay the authority on priority.

- **Slope moisture from Sentinel-1 backscatter**, as an early seepage signal.
- **Deformation from InSAR.** This needs SLC data, not the GRD used for water extent, and careful validation on earthen banks under vegetation.
- **Channel migration and avulsion risk:** cross-valley against down-valley slope from historical imagery and DEMs, giving a ranked list of reaches for pre-monsoon works.
- **Stage forecasts.** Build on CWC's and the department's official forecasts. A GNN or BiLSTM model on SageMaker only if it beats them in back-testing.
- **On-device assistant for volunteers:** a small offline model plus a local index of the USACE Flood Fight Handbook and BSDMA protocols, giving step-by-step sandbag ringing guidance with no network.
- **Address to LGD code:** matching colloquial village names to LGD codes. This extends the fuzzy village match "Nadi ka haal" already uses.

### Phase 7. Deeper financial integration (with NIC and Finance)

Paper 1, phase 4.

- **Live account checks.** IFSC and account validation against PFMS while the family is still at the desk. Needs an NIC/PFMS API and approval.
- **Crop loss.** Flood polygons over the Revenue Department's cadastral maps (Bhu-Naksha) give a list of affected plots for Fasal Sahayata, without a field survey for every plot.
- **Measure:** months saved between the flood and crop-loss payment.

---

## 4. How the pieces line up with what exists

```
MVP today                         Phase 1                  Phase 2                Phase 3-4               Phase 5-7
WhatsApp intake + rules ────────▶ voice, roll-call ──────────────────────────────▶ volunteers report ───▶ LoRa pagers
Jawab Ghadi (Step Functions) ───▶ geofence on P1, IRS ──────────────────────────────────────────────────▶ Connect calls
SACHET / FMISC / CAP drafts ────▶ chainage from BEAMS ──▶ crest burned into DEM
3D map (200 m grid, Overture) ──────────────────────────▶ 30 m → TIN tiles ───▶ ward dashboard
Sentinel-2 before/after ────────▶ daily Lambda ─────────▶ Sentinel-1 radar ───▶ flood polygons ─────▶ crop-loss lists
Help run + Location tracker ────────────────────────────────────────────────────▶ pgRouting safe routes
                                                                               ▶ camp ledger ─────────▶ PFMS live checks
```

---

## 5. Handing a phase to Antigravity

For each scheduled item:

1. Write its SPEC section first: routes, table keys, states and tests. AGENTS.md says nothing gets built that SPEC doesn't list.
2. One Antigravity prompt per item, in the style of `docs/ANTIGRAVITY_PLAN.md`: a short plan first, real captured fixtures for every parser, `pytest -q` and `sam validate --lint`, one commit per item.
3. Anything touching a government system starts as read-only or draft-only, marked Exercise or sample, until the department signs off.

---

## 6. Sources

- The two strategy papers supplied by Aryan (11 October 2026), and `docs/reference/` (two integration blueprints).
- Primary sources already cited in `docs/pilot/pilot-proposal` and the README (FMISC, SACHET, WRD resolution of 27 May 2026, UNI 15 Sep 2026, Patna Press, CERT-In, DPDP Act).
- AWS documentation: *Amazon Timestream for LiveAnalytics availability change*; API Gateway mutual TLS; Step Functions callback pattern; Amazon Location geofencing.
- Overture Maps Foundation release 2026-09-23.1 on AWS Open Data (s3://overturemaps-us-west-2): © OpenStreetMap contributors (ODbL); Microsoft and Google building footprints.
