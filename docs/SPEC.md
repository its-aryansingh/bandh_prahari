# Baandh Prahari: build spec

Source of truth for every coding agent. One SAM template, one region (ap-south-1), Python 3.12 throughout.
The product's one idea, its name: **Jawab Ghadi (जवाब घड़ी), the answer clock.** Every warning sign gets an owner, a deadline, and a next person if the deadline passes.

## The slice we build

- **One stretch:** the Gandak's right-bank embankment near Haijalpur (Maker block, Saran), about 20 km, cut into 1 km segments. Kilometre marks are computed by us, not the department's chainage; the README says so.
- **One roster:** a fictional junior, assistant and executive engineer, the zone's flood-fighting force and a district control room, played by you and friends on WhatsApp.
- **Three ways in:** WhatsApp for patrol workers, a control-room form for helpline calls, and the public replay.
- **One flow end to end:** report, page, climb, answer, check-in, warning, close and report, plus the high-water roll-call.
- **The government's own plumbing:** SACHET's Bihar feed and the department's gauges in; CAP 1.2 drafts and the IRS Form 001 briefing out.
- **Useful on day one, with no one's permission:** "Nadi ka haal" (river status) for any village every day, a "get ready" to the village within a minute of a P1, and a dated record for relief. Engineer, district and department links add on top.

## How a message moves

0. **Nadi ka haal (every day).** A villager sends a village name (Hindi or English, fuzzy match against data/villages.csv) or a location pin outside a report flow. Reply in Hindi text plus a Polly voice note: the nearest official gauge's latest reading (GAUGE#), its danger level, the difference, rising/falling/steady, the time and source, any active CWC alert (ALERT#), and whether an incident is open on that village's stretch. When the gauge is above danger level, the reply adds the Saavdhan steps with a "Ho gaya" button. One button, "Khatra ho to batayein", subscribes the number to that village's warnings (store SUB#<village>/<phone> with a short consent note: "your number is used only for flood warnings this season").
   Every "Nadi ka haal" reply ends with: the source and time of the reading; "Yeh ek chhatra pariyojana hai, sarkari chetavani nahi" (a student project, not an official warning); and the helplines 1070 and 1800 345 6145. Count use without keeping identities: USE#<date>/<sha256(phone)> with the village, so the README can report unique people, villages and repeat use. Real users (not on the demo roster) get only this flow: never a "get ready" or "move now".

1. **Report.** WhatsApp → AWS End User Messaging Social → SNS → intake Lambda. Deduplicate on the WhatsApp message ID. Media goes to the locked S3 bucket through `GetWhatsAppMessageMedia`. A voice note goes to Transcribe (hi-IN); the job's completion event on EventBridge wakes the drafter.
2. **Draft and confirm.** The Strands agent proposes the kilometre and the sign. The reporter gets a list of the six signs with the suggestion on top; one tap confirms. The rules Lambda sets the priority and starts the incident run.
3. **Page.** A task in the run stores its token under a short wait ID and sends a WhatsApp message with two buttons: "Main ja raha hoon" (on my way) and "Mera kshetra nahi" (not my stretch). The button carries the wait ID; the answer Lambda looks up the token and calls `SendTaskSuccess`.
4. **Delivery.** Status events (sent, delivered, read, failed) arrive on the same SNS topic and go into the timeline. A one-off EventBridge Scheduler schedule checks two minutes after each page; with no delivery receipt, the Lambda calls `SendTaskFailure` with `Undelivered`, and the run climbs.
5. **Check-in.** The engineer shares a location pin and a photo (WhatsApp strips GPS from photos). The Lambda calls `BatchEvaluateGeofences`, which stores no track; the ENTER event on EventBridge ends the on-site wait.
6. **Warn, in four levels with steps people will actually take.** A warning that only says "leave" mostly gets ignored (a 2025 Kosi survey: 671 of 1,081 families stayed even after hearing the water was rising, fearing for animals and belongings). So every level is a short list of cheap steps, sent as Hindi text plus a Polly (Kajal, hi-IN, neural) voice note, each with a "Ho gaya" (done) button:
   - **Saavdhan (watch):** nearest official gauge above danger level, or a CWC alert. Papers (Aadhaar, passbook, ration card, land papers) in a plastic bag; dry food (chura, gur, sattu) and water for three days; phone and torch charged; decide where the cattle would go. CAP responseType Monitor.
   - **Taiyaar (get ready):** a P1 confirmed by the reporter, sent at once without waiting for any official. Grain, seed and fodder onto the machaan or roof; cattle untied and taken to high ground; papers kept on you; the elderly, children, pregnant women and anyone who can't walk at the house nearest high ground. CAP responseType Prepare.
   - **Nikal chalo (move):** only on an engineer's Breached/confirm tap, or two P1 reports from different phones within 300 m and 30 minutes. Go to the named camp or high ground, most vulnerable first; power off at the main; take the papers. CAP responseType Evacuate.
   - **Khatra tala (all clear):** when the engineer marks the stretch Secured. Go home; check walls and wells. CAP msgType Update, responseType AllClear.
   Recipients: the mukhiya, ward members and families subscribed to that village. `PostWhatsAppMessageMedia` uploads the MP3; the mukhiya also gets "Gaon ke loudspeaker par chalaayen" (play it on the village loudspeaker). "Ho gaya" taps are stored as READY#<incident>/<level>#<sha256(phone)>; the ward member gets a running count per ward ("18 of 25 households ready") and who hasn't replied yet. The mukhiya can cancel a false alarm with one tap; everything is logged. Outcome metric: share of subscribed households ready before the water.
7. **Roll-call.** When an official reading is above danger level, or SACHET carries a CWC flood alert for a gauge, a two-hourly night schedule starts for the stretches near it. Each worker gets "km 14: sab theek?" with "Theek hai" and "Samasya hai". No answer in 20 minutes nudges the junior engineer.
8. **Phone-in.** The control-room form (kilometre, sign, caller, note) goes through the same rules into the same run.
9. **Help (मदद).** A family sends a WhatsApp location pin with the word "मदद" (or the control room logs a helpline call, or the live map's family view sends one). `POST /help` stores HELP#<id> with the pin, the number of people, elderly and children, and needs (boat, medicine, food, cattle); never a name, and the phone number only as sha256 for deduplication. It starts the help run (below): the nearest free relief team is asked; "मैं जा रहा हूँ" claims it and starts a 20-minute clock; if the team isn't on site in time the run asks the next team and tells the district control room; "सुरक्षित" closes it. The family gets the nearest relief camp, a dry route to it, and the team's minutes to arrive, as Hindi text plus a Polly voice note.

## Repository layout

```
template.yaml               SAM: every resource
statemachine/incident.asl.json
src/
  channels/whatsapp.py      text, buttons, lists, audio; media in; status events
  channels/telegram.py      fallback with the same interface
  intake/handler.py         SNS event, dedupe, media, draft, "which sign?"
  agent/drafter.py          Strands agent and its tools
  rules/priority.py         pure functions, no AWS calls
  incident/                 open, page, answer, checkin, warn, close, report
  gov/sachet.py             SACHET Bihar feed in
  gov/fmisc.py              department gauges in
  gov/cap.py                CAP 1.2 drafts out
  river/poll.py             Open-Meteo (GloFAS) pull, roll-call schedules
  rollcall/ask.py           "sab theek?" and the nudge
  api/public.py             REST for the page and the control room
  help/                     open, claim, rescued, and the help run's page and climb
  teams/position.py         POST /teams/{id}/position to the Location tracker; GET /teams
  sat/grid.py               the daily satellite Lambda: the live map's grid to S3
statemachine/help.asl.json  the help run (same clock pattern as the incident run)
data/                       stretch.geojson, villages.csv, roster.json, replay.json
tools/build_map.py          builds the static grid (DEM, land cover) once; the Lambda adds water daily
web/                        Vite + TypeScript page on Amplify; the live map is a canvas-2D isometric renderer
tests/                      pytest; tests/fixtures/ holds real captured responses
Makefile                    build, deploy, test, seed, fast-incident
```

## Data: one DynamoDB table "bp"

| PK | SK | Holds |
| --- | --- | --- |
| `SEG#<km>` | `META` | Centre point, line, villages behind with LGD codes, nearest gauge, breach history, vulnerable flag |
| `SEG#<km>` | `ROSTER#1` to `ROSTER#5` | Junior, assistant, executive engineer, the zone's flood-fighting force, district control room: name and WhatsApp number |
| `INC#<id>` | `META` | Kilometre, sign, priority, status, execution ARN |
| `INC#<id>` | `EV#<time>#<kind>` | Every event: report, draft, confirm, page, delivered, read, answer, climb, check-in, warning, close |
| `WAIT#<short id>` | `META` | A task token, its incident, and who it waits for; TTL removes it |
| `GAUGE#<site>` | `<time>` | An official reading: water level, danger level, trend, source (SACHET or FMISC) |
| `ALERT#<identifier>` | `META` | A SACHET alert: sender, event, severity, area, matched stretches, expiry |
| `CAP#<id>` | `META` | One of our CAP drafts: villages, level, status, S3 key of its XML |
| `GLOFAS#<cell>` | `<date>` | Modelled discharge for the river panel |
| `SUB#<village>` | `<phone>` | A family subscribed to a village's warnings, with consent time; cleared after the season |
| `READY#<incident>` | `<level>#<sha256(phone)>` | A household's "Ho gaya" for a warning level, with the time; feeds the ward member's count |
| `CONV#<phone>` | `STATE` | Where a reporter is in the two-tap flow; TTL after 30 minutes |
| `HELP#<id>` | `META` | A family's call for help: village, pin, people, elderly, children, needs, status, team, deadline, execution ARN, sha256(phone); TTL after the season |
| `HELP#<id>` | `EV#<time>#<kind>` | raised, paged, claimed, climb, arrived, rescued |
| `TEAM#<id>` | `META` | A relief team (Aapda Mitra boat, embankment ambulance, SDRF): kind, crew, speed, status, its device ID on the tracker. No member names |
| `MAP#<stretch>` | `<date>` | S3 key of that day's grid JSON and the satellite passes in it |

One GSI on status and priority feeds the control room. Media and nightly timeline snapshots go to an S3 bucket with Object Lock: governance mode, one-day retention this weekend.

## The incident run (Step Functions, Standard)

State names are written for the camera.

| State | What it does | Clock, real / demo |
| --- | --- | --- |
| `OpenIncident` | Writes the incident and puts a 200 m circle geofence around it | |
| `WarnVillagesGetReady` | For a P1: the Taiyaar steps to the mukhiya, ward members and subscribed families, and a CAP draft marked Exercise | |
| `PageJuniorEngineer` | Sends the page, waits for its task token; fails with `Undelivered` if no delivery receipt in 2 minutes | 10 min / 60 s |
| `PageAssistantEngineer` | The same, junior engineer copied | 10 min / 60 s |
| `PageExecutiveEngineer` | The same | 10 min / 60 s |
| `PageForceAndDistrict` | The zone's flood-fighting force and the district control room | 10 min / 60 s |
| `AlertCentralFloodControlRoom` | Keeps paging the Central Flood Control Room every 10 minutes until someone answers | |
| `DispatchRepairTeam` | Logs the nearest embankment ambulance and sandbag stock | |
| `AwaitEngineerOnSite` | Waits for the geofence ENTER event; on timeout pages the next level with "not on site" | 45 min / 3 min |
| `HoldTheStretch` | Asks for a check-in every 30 minutes until the engineer taps Secured or Breached | 30 min / 90 s |
| `WarnVillagesMoveNow` | On Breached: the Nikal chalo steps with the nearest relief camp, and a CAP draft | |
| `AllClear` | On Secured: Khatra tala to everyone who was warned | |
| `HandToDistrict` | Sends the district the IRS Form 001 briefing the agent fills | |
| `WriteIncidentReport` | The agent writes the Hindi and English report from the timeline | |

Waits use `arn:aws:states:::lambda:invoke.waitForTaskToken` and read their timeout from the input with `TimeoutSecondsPath`, so one machine serves real and demo clocks. A worse second report on the same kilometre is handled outside the run: the intake sends "move now", pages the district directly, and writes both to the same timeline.

## The agent

A Strands agent on Bedrock: Nova Lite through its cross-region profile, or Nova 2 Lite through `global.amazon.nova-2-lite-v1:0` (confirm with `aws bedrock list-inference-profiles --region ap-south-1`). Model ID from env var `MODEL_ID`. Use the official Strands Lambda layer.

- **Tools:** `find_km(lat, lon)`, `river_state(km)`, `open_incidents(km)`, `ask_reporter(question)`.
- **Its job:** from transcript, photo and location, propose kilometre, sign and a one-line summary; ask at most one follow-up.
- **Never:** set or change a priority, or choose who is paged.
- **At close:** write the incident report from the timeline, Hindi and English.
- If Transcribe or Bedrock fails, reply "AI unavailable" and keep the six-sign list.

## WhatsApp rules that shape the build

- Reply buttons: at most three, titles up to 20 characters. The six signs go in a list (up to ten rows).
- Button IDs carry the short wait ID, never the task token.
- Free-form messages reach only people who messaged you in the last 24 hours. Every roster phone sends "join" before recording.
- Voice notes arrive as Ogg/Opus. Transcribe lists Ogg for batch and Ogg Opus for streaming: test one real voice note first; use streaming if batch refuses it.
- The same message can arrive twice: deduplicate on its ID.
- boto3 client `socialmessaging`: `send_whatsapp_message(originationPhoneNumberId, metaApiVersion="v20.0", message=<WhatsApp Cloud API JSON bytes>)`, `get_whatsapp_message_media(mediaId, originationPhoneNumberId, destinationS3File)`, `post_whatsapp_message_media(originationPhoneNumberId, sourceS3File)`. Write the SNS parser from a real captured event in tests/fixtures/.

## Government adapters

- **SACHET's Bihar feed (in, every 15 minutes).** `https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml` is RSS 2.0; each item links to `FetchXMLFile?identifier=…`, a CAP 1.2 alert (namespace `urn:oasis:names:tc:emergency:cap:1.2`). Keep `identifier`, `sender` (CWC or IMD), `event`, `severity`, `urgency`, `headline`, `description` (carries the level and distance from danger), `areaDesc`, `effective`, `expires`. Match the gauge in `areaDesc`/headline ("Gandak at Dumariaghat") to stretches; deduplicate on `identifier`.
- **The department's gauges (in, every three hours).** Query layer 1 (CWC gauges) or layer 0 (department's own) of `https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer/<layer>/query` with `where=CWC_own.RIVER LIKE '%andak%'`, `outFields=*`, `returnGeometry=false`, `f=json`. Fields (prefixed `CWC_own.` or `wrd_own.`): `SITE_NAME`, `RIVER`, `DIST_NAME`, `DL` (danger level), `WL` (water level), `TREND`, `DATE_` (epoch ms). `WL` of -4 means no reading. Not an official API: read gently, keep the last good reading. Nearest gauge to Haijalpur: Rewaghat (DL 54.41 m).
- **CAP 1.2 drafts (out).** One per village warning: `status` Exercise, `msgType` Alert, `scope` Public, two `info` blocks (`hi-IN`, `en-IN`), `category` Met, `event` "Embankment breach risk", `responseType` Monitor (Saavdhan), Prepare (Taiyaar) or Evacuate (Nikal chalo), plus an Update with AllClear (Khatra tala), `urgency` Immediate, `severity` Severe or Extreme, `certainty` Likely or Observed. Headline starts "Demo, not a real warning". `instruction` names the relief camp. `area`: villages with LGD codes in `areaDesc`, plus a closed `polygon`. Serve `GET /cap/rss.xml` in the same shape as SACHET's feeds. Nothing is ever sent to SACHET.
- **IRS Form 001 briefing (out).** At hand-off the agent fills the district's incident briefing from the timeline (map, actions so far, who is deployed, resources). Render as an HTML page (browsers render Hindi correctly; print to PDF if needed).
- **Roster (in).** A spreadsheet/CSV in the department's shape (stretch, km from, km to, JE, AE, EE, flood-fighting force, district control room, each with a WhatsApp number) dropped into S3 updates the roster. Numbers come from SSM, never git.
- **Template settings.** Log groups 180 days; KMS for DynamoDB, S3, SNS; S3 Object Lock governance; DynamoDB PITR; API throttling. Pilot only: Cognito MFA, WAF, Hyderabad replica.

## The public API

| Route | For |
| --- | --- |
| `GET /stretch` | Segments, villages (with LGD codes) and gauges for the map |
| `GET /gauges` | Latest official readings for the river panel |
| `GET /incidents?status=open` | The control room |
| `GET /incidents/{id}/timeline` | The timeline and the replay |
| `GET /incidents/{id}/execution` | Live Step Functions history for the judges' AWS view (`GetExecutionHistory`) |
| `POST /incidents` | Control-room form for helpline calls |
| `POST /replay` | Starts a replay run (pages drawn on screen, 60×), one run at a time |
| `GET /cap/rss.xml`, `GET /cap/{id}.xml` | Our CAP drafts |
| `GET /briefing/{id}` | The IRS Form 001 briefing (HTML) |
| `GET /map/{stretch}` | The live map's grid (see "The live map"): today's JSON from S3 |
| `GET /help?status=open` | Help requests. Public: `by_village` counts only. With a relief or district role token: also `requests` with exact pins |
| `POST /help` | A call for help from the family view or the control room (the WhatsApp "मदद" pin takes the same path through intake) |
| `POST /help/{id}/claim` | "मैं जा रहा हूँ": a team takes the request; the 20-minute clock starts (role token) |
| `POST /help/{id}/rescued` | "सुरक्षित": the family is safe; the run closes (role token) |
| `GET /teams` | Relief teams and their latest positions, from `ListDevicePositions` on the tracker |
| `POST /teams/{id}/position` | A team's phone reports where it is; the Lambda calls `BatchUpdateDevicePosition` (role token) |

Judge path: sending a village name (for example "Haijalpur") returns today's real river reading; sending TEST on WhatsApp makes the sender both worker and engineer, on one-minute clocks. Any other text gets a Hindi and English help menu.

## The live map (सजीव नक़्शा)

The public page's map: the stretch as an isometric, blocky diorama in Madhubani style (web/DESIGN.md), useful to the district, to relief groups (Yuva Aapda Mitra volunteers, the embankment ambulance, SDRF) and to families. The two blueprints in docs/reference/ describe the pilot; this is the weekend's slice.

**The grid (`GET /map/{stretch}`).** 56 × 46 cells of about 200 m over the Haijalpur stretch (bbox 85.000–85.110 E, 25.905–25.995 N), row-major from the north-west corner. Shape: `web/src/types.ts` `MapGrid`; sample: `web/mock/map.haijalpur.json`. All of it is AWS Open Data:
- `elev_dm`: Copernicus DEM GLO-30 (s3://copernicus-dem-30m), mean per cell, decimetres. The DEM is a surface model, so the page brings tree and roof cells down to the fields around them.
- `cls`, `built`: ESA WorldCover 2021 v200 (s3://esa-worldcover): the commonest class per cell and the share of built-up 10 m pixels.
- `s2`: the least cloudy Sentinel-2 L2A pass of the last ten days (Earth Search STAC on AWS, collection `sentinel-2-l2a`, COGs in s3://sentinel-cogs): `water` = percent of the cell with NDWI (green B03, near-infrared B08) above 0.05, after masking SCL classes 3, 8, 9 and 10 (cloud shadow, cloud, cirrus); `cloud` = percent masked.
- `s1`: Sentinel-1 GRD radar, which sees through cloud: VV backscatter below a threshold as water. TODO: confirm the Earth Search collection ID (expected `sentinel-1-grd`) at https://earth-search.aws.element84.com/v1/collections; the GRD files are requester-pays (s3://sentinel-s1-l1c, https://registry.opendata.aws/sentinel-1/), so the Lambda's reads carry the requester-pays flag and the account pays the transfer. Null until it runs.

`tools/build_map.py` builds the static parts once. **The daily satellite Lambda** (`src/sat/grid.py`, Python 3.12, 60 s timeout, on an EventBridge Scheduler schedule every morning) searches STAC for new passes over the bbox, reduces them to the grid, writes `map/<stretch>/<date>.json` and `map/<stretch>/latest.json` to S3 and a MAP# row; `GET /map/{stretch}` returns latest. Its IAM role reads only those public buckets and writes only `map/*`. Every pass keeps its scene ID and date, and the page says that satellites come back every few days.

**In 3D, for the district's patrol desk.** The page draws the same grid in 3D (WebGL, three.js) with the 2D painting as the fallback. On top of the 200 m ground it stands only real things, from `web/public/map/<stretch>-features.json` built by `tools/build_features.py`: every building footprint, road, bridge and named public place in the window from the Overture Maps release on AWS Open Data (s3://overturemaps-us-west-2, read anonymously; OpenStreetMap under ODbL plus Microsoft and Google building footprints, credited on the page), and trees from ESA WorldCover's 10 m tree pixels. Live layers, read from the API every 4 seconds: open incidents as a column of light over their kilometre with the answer clock's minutes left, the patrol at each kilometre stone (green while all is well, the incident's colour when not), help requests and relief teams. Satellite: the latest clear Sentinel-2 pass and the last clear pass before the breach (`s2_before`), each with its true-colour picture (`photo`, in `web/public/sat/`), switchable before and after and drapeable over the 3D ground. Sentinel-1 radar stays a TODO for the daily Lambda (requester-pays).

**What the page draws from it, honestly labelled.**
- Observed water from the latest pass, with its date and a note on the revisit time; cloudy cells drawn as clouds.
- A what-if flood tied to the official gauge: for a reading at Rewaghat, water fills cells connected to the river whose ground is below the water surface (the surface falls downstream with the river's slope from the DEM). The embankment holds unless the person assumes a breach (km 14). Labelled "a rough sketch, not a hydraulic model". The pilot replaces the drawn bank with surveyed crest levels.
- The embankments as ridges (assumed 4 m crest), our kilometre stones on the right (Saran) bank, the villages on their built-up cells and relief camps on the highest dry ground nearby, all marked approximate or sample.
- Safe routes over dry cells (walking to a camp) and team routes (boats float, the tractor keeps to dry ground and the crest).

**Three views.** परिवार (public): river state, the family's own request and its progress, counts per village. राहत दल: requests nearest first, "मैं जा रहा हूँ", "सुरक्षित". ज़िला: flooded area, homes at risk, open requests, teams, minutes to reach, village readiness (READY#), and what just happened.

**Privacy (DPDP).** The public view shows counts per village only. Exact pins go only to relief and district callers, who send a role token kept in SSM (pilot: Cognito with MFA). No names or phone numbers anywhere in HELP#, TEAM#, the API or the page. Team positions come only from team phones on duty; nobody else is tracked. HELP# rows expire after the season.

**Positions (Amazon Location Service).** One tracker, `bp-teams`. `POST /teams/{id}/position` calls `BatchUpdateDevicePosition` (DeviceId = the team ID, Position = [lon, lat], SampleTime, Accuracy.Horizontal); `GET /teams` calls `ListDevicePositions` and joins TEAM# rows. A help request puts a 200 m circle geofence around the family's pin (`PutGeofence`); the tracker is linked to the geofence collection (`AssociateTrackerConsumer`), so a team's ENTER event on EventBridge ends the run's on-site wait, like the engineer's check-in.

**The help run (Step Functions, Standard, `statemachine/help.asl.json`).** The same answer clock as the incident run: waits use `lambda:invoke.waitForTaskToken` with `TimeoutSecondsPath`, button IDs carry a short wait ID, and every step is written to `HELP#<id>/EV#`.

| State | What it does | Clock, real / demo |
| --- | --- | --- |
| `OpenHelpRequest` | Writes HELP#, finds the camp and the dry route, puts the 200 m geofence on the pin | |
| `AskNearestTeam` | Asks the nearest free team (minutes by route); waits for "मैं जा रहा हूँ" | 10 min / 60 s, then `AlertDistrictControlRoom` and ask again |
| `AwaitTeamOnSite` | Waits for the geofence ENTER event (or the team's "पहुँच गए") | 20 min / 2 min |
| `AskNextTeam` | On timeout: asks the next nearest free team, tells the district; the late team keeps going and whoever arrives first counts | loops to `AwaitTeamOnSite` |
| `AwaitFamilySafe` | Waits for "सुरक्षित" | |
| `CloseHelpRequest` | Closes HELP#, removes the geofence, tells the family and the ward member | |

The demo on the page plays the same states on mock data with a clock of one second per minute; with `VITE_API_BASE` set it reads the real API every 4 seconds while the map is on screen, so two phones (a family and a relief team) see each other's actions within seconds. On sample data, two windows of the page on one device share their actions through a BroadcastChannel.

## Seed data

- `data/stretch.geojson`: the embankment line near Haijalpur, drawn by hand at geojson.io on satellite view.
- Kilometre marks computed along the line, labelled as ours.
- `data/villages.csv`: villages behind the stretch with LGD codes and relief camps.
- `data/roster.json`: fictional names; numbers from SSM.
- River: Open-Meteo Flood API for the Gandak cell (25.975N, 85.025E), plus official readings from SACHET/FMISC.
- `data/replay.json`: the night of 29–30 September as timed events (11:40 PM report → 11:41 P1 page → 11:51 climb → 11:53 answer + "get ready" → 12:35 AM check-in → 2:10 AM slumping, "move now" → morning: closed as breached).

## Tests

- **Rules:** one test per row of the priority table, plus "engineers can raise a priority, never lower it".
- **Snapping:** a point 50 m off the line lands on the right kilometre.
- **Government data:** SACHET and FMISC parsers against saved real responses, including a -4 reading and a repeated alert.
- **CAP:** every draft passes the OASIS CAP 1.2 XSD and is marked Exercise.
- **Whole run:** `make fast-incident` drives a P1 on demo clocks and asserts report, page, timeout, climb, answer, warning, on site, close.
- **Evidence run:** 50 incidents on demo clocks; median and p95 tap-to-page time from CloudWatch, for the README.
- **Live map:** the satellite Lambda's grid has the same shape as `tools/build_map.py`'s, tested on a saved window of one real scene; SCL cloud classes are masked. A help request on demo clocks with a late team climbs to the next team and still closes as rescued. `GET /help` without a role token returns no pins.

## Decision gates

| When | Check | If it fails |
| --- | --- | --- |
| Fri 6 PM | WhatsApp sends and receives through AWS | Switch the channel to Telegram; core unchanged |
| Sat 2 AM | Gate 1: report, page, climb, answer, warning | Drop voice; six-sign list stays |
| Sat 12 PM | CAP draft passes schema; briefing fills | Feed only; briefing from a template |
| Sat 1:30 PM | Geofence ENTER event arrives | Distance check in the Lambda |
| Sat 5 PM | Replay runs on a phone | Replay from a recorded run |
| Sat 11 PM | Gate 2: draft video exists | Sunday morning goes to the video only |

---

# Product behaviour (copied from the plan)

### The loop

1. **Report.** The patrol worker sends a voice note, a photo and a location pin to the Baandh Prahari WhatsApp number: "km 14 par paani ubal raha hai" (water is boiling up at km 14). Six big buttons work too: seepage, boiling, crack, slip, overtopping, rat hole. The location is snapped to the embankment's kilometre mark. Anyone without WhatsApp calls the helpline, and the control room logs the call into the same flow.
2. **Confirm.** The AI drafts the report from the voice and photo. The worker confirms the sign with one tap.
3. **Score.** Plain rules set the priority from three things: the sign, the river at the nearest official gauge (the government's own reading against its danger level), and that stretch's history.
4. **Page.** The junior engineer on duty for that kilometre gets the photo, the map, the river trend and the nearest repair tractor. They must tap "on my way": within 10 minutes for a P1, 30 for a P2. If WhatsApp can't deliver the page within two minutes, it moves up without waiting out the clock.
5. **Climb.** If nobody answers, the page goes to the assistant engineer, then the executive engineer and the district magistrate. Every step is timestamped.
6. **Prove presence.** For a P1, the engineer sends a location pin and a photo from within 200 m of the spot within 45 minutes, then every 30 minutes until the stretch is secured. "Left the site" becomes visible as it happens, not in a review a week later.
7. **Mobilise.** The nearest "embankment ambulance" (a repair tractor with ten workers) and the nearby sandbag stock are shown, and the dispatch is logged.
8. **Warn.** Once a P1 is confirmed, or the page reaches the executive engineer, villages behind that stretch get a two-level Hindi voice alert on WhatsApp, through their mukhiya, ward members and registered residents, as a clip ready to play on the village loudspeaker:
   - **Get ready:** move grain, cattle and documents up.
   - **Move now:** go to a named relief camp.
9. **Close.** The stretch is marked secured with a photo, or breached, which hands over to district disaster response. Either way, the incident timeline writes itself.

**When the river is high, it asks first.** If the nearest official gauge is above danger level, or CWC issues a flood alert for it on SACHET, every patrol worker on that stretch gets a check every two hours through the night: "km 14: sab theek?" (all well?), with two buttons. A kilometre that stays silent for 20 minutes nudges the junior engineer, so an unwatched stretch shows up before it fails.

### The priority rules (arithmetic decides)

The rules follow the US Army Corps of Engineers' [Flood Fight Handbook](https://ndresponse.gov/sites/www/files/documents/docs/cemvp_flood-fight_handbook_2009final.pdf) (2009). It says overtopping "should be prevented at any cost". It treats piping as urgent. A boil discharging clear water in a steady flow "is usually not dangerous", but one carrying material needs action "immediately". The same handbook asks for a patrol team with "a good communication system", which is what Baandh Prahari is. Engineers can raise a priority but never lower one.

| Sign | Starts at | Raised when |
| --- | --- | --- |
| Overtopping, or water within 0.5 m of the top | P1 | Already highest |
| Boil or piping carrying soil (muddy water, sand coming out), or the top of the embankment slumping | P1 | Already highest |
| Boil with clear water in a steady flow | P2 | To P1 if the flow grows or turns muddy |
| Slip of the land-side slope | P2 | To P1 if the river is above danger level |
| Crack along the top | P2 | To P1 if the river is rising |
| Seepage with clear water | P3 | To P2 if it carries soil, or soaks a large area of the slope |
| Rat or animal holes (local practice; not in the handbook) | P3 | To P2 if the river is above danger level |

A stretch that breached in the past five years, or that's on the department's vulnerable list, goes up one level.

