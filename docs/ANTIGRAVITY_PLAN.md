# Baandh Prahari: the master plan, from now to deployment

Updated Sunday 11 October 2026, 9:00 AM IST. **Submission deadline: today, 5 PM IST.** Online judging starts at 8 PM.

This one file covers four things:
- **Part A:** every feature the product has, or is meant to have, and where it stands
- **Part B:** today's plan, hour by hour, to a deployed, submitted MVP
- **Part C:** each remaining build step as a prompt for Antigravity
- **Part D:** after submission, the plan from MVP to a deployed pilot for the Government of Bihar and onward, with every feature in `docs/ROADMAP.md`

## Who does what

| Antigravity (Gemini) | Aryan | Claude |
| --- | --- | --- |
| All backend code, testing, API integration, small integration fixes in `web/` (no new page features), `docs/DEPLOY.md` | AWS console steps, `sam deploy`, secrets in SSM, WhatsApp/Meta, Amplify, real-device checks, video, submission, people (users, the official) | Planning only: this file, `docs/ROADMAP.md`, new `docs/SPEC.md` sections |

**Rules for every Antigravity prompt:**
- Follow `AGENTS.md` and `docs/SPEC.md`.
- Write a short plan before code.
- Use real captured fixtures for parsers.
- Run `pytest -q` and `sam validate --lint --region ap-south-1`.
- Make one commit per finished item, with message "area: what changed".
- End by saying what couldn't be verified.

**Rules for you:**
- **Run `git pull` before every prompt.**
- Never paste keys, phone numbers or account IDs into chat or git. They go in SSM only.
- Antigravity never runs `sam deploy`. You run it.

Workspace rule to keep in Antigravity's settings:

> Follow AGENTS.md and docs/SPEC.md exactly. Backend files are yours: template.yaml, statemachine/, src/, tests/, scripts/, data/, Makefile, docs/DEPLOY.md. In web/ make only small fixes needed to integrate with the API, never new features. Never run sam deploy, never print or commit secrets, phone numbers or account IDs. Small diffs, never refactor unasked. After every task run `pytest -q` and `sam validate --lint --region ap-south-1`, then tell me what you could not verify.

---

# Part A: every feature and where it stands

Legend:
- **Done:** built and tested in the repository.
- **Today-A:** must be done before submitting.
- **Today-B:** do it if Tier A is finished by 12:30.
- **Today-C:** only if far ahead; otherwise it moves to the pilot.
- **Pilot:** after the hackathon, Part D.

### A1. For families behind the bank

| Feature | State | Where / step |
| --- | --- | --- |
| "Nadi ka haal": a village name returns today's official reading in Hindi, with source, time, "student project, not an official warning" and the helplines | Done | `src/river/nadi.py` |
| Subscribe to a village's warnings ("Khatra ho to batayein") with a consent note | Done | `src/intake/worker.py` (SUB#) |
| Usage counted without identities (USE#) | Done | `src/intake/worker.py` |
| Polly Hindi voice-note reply (Kajal) | **Today-C**, step C9 | |
| Four warning levels with steps (Saavdhan, Taiyaar, Nikal chalo, Khatra tala), each with a "Ho gaya" button; READY# counts per ward | Done | `src/incident/warn.py` |
| "Nikal chalo" after two P1 reports within 300 m and 30 minutes (besides the engineer's confirmation) | **Today-C**, step C10 | SPEC step 6 |
| The mukhiya can cancel a false alarm with one tap, logged | **Today-C**, step C10 | SPEC step 6 |
| Ask for help (मदद) from WhatsApp pin, control room or the live map; nearest camp, dry route, team ETA | Done (help run) | `src/help/`, `statemachine/help.asl.json` |

### A2. For patrol workers and engineers

| Feature | State | Where / step |
| --- | --- | --- |
| Report on WhatsApp: the six-sign list, one tap confirms; dedupe on message ID; intake returns fast | Done | `src/intake/` |
| Plain rules set priority; engineers can raise, never lower | Done | `src/rules/priority.py` |
| Jawab Ghadi: page JE, wait for task token (10 min, 60 s on demo), climb to AE, then EE and DM, then the zone's force | Done | `statemachine/incident.asl.json` |
| No delivery receipt in 2 minutes means climb at once | Done | `src/incident/delivery.py` |
| TEST path: the sender plays worker and engineer on one-minute clocks | Done | `src/intake/worker.py` |
| Voice note to draft: Transcribe hi-IN and the Strands drafter (the tap still sets the sign) | **Today-C**, step C9 | |
| Engineer's on-site check-in: location pin within 200 m (distance check now; geofence later) | Done (distance check) / Pilot (geofence + 45-min window) | `src/intake/worker.py` |
| Night roll-call "km X: sab theek?" every 2 h when a gauge is above danger level; no answer in 20 min nudges the JE | **Today-B**, step C7 | SPEC step 7 |

### A3. For the district and the department

| Feature | State | Where / step |
| --- | --- | --- |
| Control-room form for helpline calls, on the same clock | Done | `src/api/control.py` |
| CAP 1.2 drafts, status Exercise, OASIS-schema checked; `GET /cap/rss.xml` | Done | `src/gov/cap.py` |
| SACHET Bihar feed every 15 min; FMISC gauges every 3 h; GloFAS fallback | Done | `src/gov/`, `src/river/poll.py` |
| IRS Form 001 incident briefing, `GET /briefing/{id}` | **Today-B**, step C6 | SPEC "Government adapters" |
| Roster updated by dropping a CSV in the department's shape into S3 | **Today-C**, step C10 | SPEC "Roster (in)" |
| CloudWatch: minutes-to-answer and climbs, two alarms, one dashboard; `make evidence` | **Today-A**, step C5 | |

### A4. For relief groups

| Feature | State | Where / step |
| --- | --- | --- |
| Help run: nearest free team, "मैं जा रहा हूँ" starts 20 minutes, late climbs to the next team and tells the district, "सुरक्षित" closes | Done | `src/help/run.py` |
| Team positions on an Amazon Location tracker; 200 m geofence on the family's pin | Done | `src/teams/position.py` |
| Public sees counts per village only; role tokens unlock pins | Done | `src/api/help.py` |

### A5. The public page and the live map

| Feature | State | Where / step |
| --- | --- | --- |
| Hindi-first page: replay of 29–30 Sep, four warning levels, who gets what, control room, government and AWS views, honest limits | Done | `web/` |
| Judge path: start a real Step Functions run from the page | Done | `web/src/sections/judge.ts`, `src/api/demo.py` |
| Live map, 3D (WebGL) with the 2D painting as fallback; real buildings, roads, places (Overture on AWS Open Data), trees (WorldCover), DEM ground | Done | `web/src/map/view3d.ts` |
| Live layers: incidents as light columns with the clock, the patrol at every km stone, help, teams; read every 4 s | Done (page side) / **Today-A** integration, step C3 | |
| Sentinel-2 before (20 Sep) and after (6 Oct), with photos; the night of 29–30 Sep on the map | Done (shipped grid) | `web/mock/map.haijalpur.json` |
| `GET /map/{stretch}` and the daily satellite Lambda | **Today-B**, step C8 (the page falls back to the shipped grid until then) | |
| Sentinel-1 radar water | Pilot | ROADMAP phase 2 |

### A6. Deployment, security and records

| Feature | State | Where / step |
| --- | --- | --- |
| One SAM template, ap-south-1; 180-day logs; least-privilege role per function; KMS on SNS, S3 and DynamoDB; PITR; API throttling | Done | `template.yaml` |
| S3 Object Lock, governance mode, 1 day (hackathon) | Done / Pilot: compliance mode, 180 days | |
| Stack deployed; `make fast-incident` passes | Done at least once (a real execution history is in `tests/fixtures/`) / **Today-A**: redeploy the latest main, step C1 | |
| WhatsApp live (or Telegram) | **Today-A**, step C2 | |
| Site on Amplify, CORS locked to it | **Today-A**, step C3 | |
| `docs/DEPLOY.md`, Windows, from nothing to live, and teardown | **Today-A**, step C5 | |
| CI on GitHub (tests, lint, web build) | Done | `.github/workflows/ci.yml` |

### A7. Submission material

| Item | State |
| --- | --- |
| README in the judges' words, safety, architecture, video shot list, blog draft | Done (blanks to fill, step B5) |
| Government pilot pack (Hindi and English concept notes, proposal, deck) | Done (`docs/pilot/`; add your contact details) |
| Roadmap to statewide with a fact-check of the strategy papers | Done (`docs/ROADMAP.md`) |
| Video (YouTube, under 3:00), blog published, submission form | **Today-A**, Part B |

---

# Part B: today, hour by hour

| Time (IST) | What | Who | Done when |
| --- | --- | --- | --- |
| **9:00–9:45** | C1: pull, redeploy latest main, seed, `fast_incident` | You + Antigravity if it breaks | `fast_incident` passes on today's stack |
| **9:00–11:00** (in parallel, waiting on Meta) | C2: WhatsApp live, or the Telegram switch | You | "Haijalpur" and TEST answer on your phone |
| **9:45–11:00** | C3: the site on Amplify; integration and smoke tests | Antigravity + you | Live URL works on a phone over mobile data |
| **11:00–11:30** | C4: real users for Nadi ka haal (send the number to the families who agreed) | You | First counts in USE# |
| **11:00–12:30** | C5: CloudWatch, `make evidence`, `docs/DEPLOY.md` | Antigravity | Evidence numbers in hand |
| **12:30** | **Decision gate.** If C1–C5 are done, do Tier B (C6 briefing, C7 roll-call, C8 satellite Lambda) only while you record. If not, skip all of Tier B. | You | |
| **12:30–2:30** | B1–B3: record the video, cut to 2:55, upload | You | Plays signed-out on YouTube |
| **2:30–3:15** | B4: publish the Builder Center blog | You | Public link |
| **3:15–3:45** | B5: fill the README blanks; send Claude the numbers if you want help with wording | You | No "_add…_" left in README |
| **3:45–4:15** | B6: final checklist | You | Every box ticked |
| **4:15–4:30** | B7: submit, screenshot the confirmation, tag v1.0 | You | Submitted with 30 minutes' buffer |
| **After 4:30** | Freeze `main`. Keep the stack and Amplify up until results. Post-hackathon work goes on a branch (Part D). | | |

**Cut order if late (cut from the top):**
1. C10 small rules (two-P1 rule, mukhiya cancel, roster CSV)
2. C9 voice and Polly
3. C8 satellite Lambda (the map keeps its shipped grid)
4. C7 roll-call
5. C6 briefing (a template is enough)
6. The CloudWatch dashboard (keep one measured time)

**Never cut:**
- the climbing clock
- the judge path
- Nadi ka haal
- the live SACHET alert
- the CAP draft
- the AWS view on the page
- the live map
- the video
- submitting by 4:30

### B1–B3. The video

Follow `docs/video-script.md`: seven chapters, 2:55, AWS on screen.

Shots to record:
- the replay
- "Play that night on the map", with sound on
- the 3D map turning around Haijalpur, then the before/after satellite switch
- a real judge-path run climbing in the Step Functions console
- a real WhatsApp "Haijalpur" reply and a TEST page climbing on your phone
- the console tour: End User Messaging, Step Functions, DynamoDB, S3 Object Lock, CloudWatch

Mark the replay and map night as a re-enactment on screen. Upload to YouTube, public or unlisted, paste the chapters into the description, set the thumbnail, and check playback in a signed-out window.

### B4. Blog

Use `docs/blog-draft.md`. Fill the bracketed parts, add the hero image and the map GIF from `docs/assets/`, and publish on the AWS Builder Center. Check that your profile shows your university as verified.

### B5. README blanks

These are marked _add…_ or _fill_ in the README:
- the live URL
- the video link
- the WhatsApp number (or the Telegram bot)
- the evidence times (C5)
- user counts (C4)
- the Antigravity model you used
- quotes, only with permission

Update the "What's built" table to match Part A after today's steps.

### B6. Final checklist

- [ ] Track: Heat and Water. Every AI tool named: Claude (Anthropic, Opus 5.5), Antigravity (Google, with its model), and Bedrock/Strands inside the product if used.
- [ ] Repo public; `main` CI green; no secrets (run a search for "+91", "AKIA" and "arn:aws" across the repo).
- [ ] Video under 3:00, AWS on screen, plays signed-out, chapters in the description.
- [ ] Every feature the write-up claims appears in the video, or is listed as "next".
- [ ] Live page works on a phone over mobile data, signed out. WhatsApp TEST answers.
- [ ] Every CAP alert is Exercise. README says there's no government affiliation, and that the replay is a re-enactment.
- [ ] Data credits: SACHET, FMISC, GloFAS/Open-Meteo, Copernicus DEM, ESA WorldCover, Sentinel-2, Overture Maps (© OpenStreetMap contributors, ODbL; Microsoft and Google footprints).
- [ ] Real users got only Nadi ka haal. Their numbers get deleted after the event, and the README reports counts only.
- [ ] Blog published and linked; Builder Center profile verified.

### B7. Submit and freeze

Submit, screenshot the confirmation, then:

```powershell
git pull
git tag v1.0
git push origin v1.0
```

Stop committing to `main`. Keep the stack running, with the $5 budget alarm on.

---

# Part C: the build steps (prompts for Antigravity)

### C1. Redeploy the latest main (9:00, about 30 minutes)

Run this yourself:

```powershell
git pull
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
pytest -q                                   # expect 140 passed
sam validate --lint --region ap-south-1
sam build
sam deploy                                  # uses samconfig.toml from your first --guided deploy
python scripts/seed.py
$api = aws cloudformation describe-stacks --stack-name bp --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
python scripts/fast_incident.py $api        # must end with every step passing
```

If it's your first deploy, use `sam deploy --guided` with these answers:
- stack name `bp`, region `ap-south-1`
- `Channel=screen`, `Outbound=off`, `DemoDailyCap=300`
- `AllowedOrigin=*` for now
- allow role creation; say yes to the open routes
- save to `samconfig.toml`

**If anything fails:** paste the exact error into Antigravity: "Fix only this. Don't refactor. Tell me what you changed."

### C2. WhatsApp, or Telegram (start at 9:00; decide by 11:00)

**WhatsApp:**
1. In AWS End User Messaging → Social messaging, link a number that is not on WhatsApp. Set the WhatsApp Business account's event destination to the stack's `InboundTopicArn`.
2. Copy the phone number ID: the part after `phone-number-id/` in the number's ARN.
3. Put each demo roster number in SSM, one per `ssm` name listed in `data/roster.json` (people who agreed only), then reseed:

   ```powershell
   aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/roster/je --value "+91XXXXXXXXXX"
   python scripts/seed.py
   ```

4. Every roster phone sends "join" to the number first, because WhatsApp only allows replies within 24 hours of someone writing to you.
5. Redeploy with the channel on:

   ```powershell
   sam deploy --parameter-overrides Channel=whatsapp Outbound=on WhatsAppPhoneNumberHex=<id>
   ```

6. Check: send "Haijalpur" and get the reading in Hindi with its source. Send "TEST", don't answer the first page, and watch it climb.

**At 11:00 with no WhatsApp:** switch to Telegram.
1. Make a bot with @BotFather.
2. Put the bot token in SSM at `/bp/telegram/token`, and a long random string at `/bp/telegram/hook-secret`.
3. Run `sam deploy --parameter-overrides Channel=telegram Outbound=on`.
4. Ask Antigravity: "Give me the exact setWebhook command for our bot, pointing at POST /telegram/hook with the secret-token header, per src/intake/telegram_hook.py."

Say why in the README.

### C3. Site live, integrated and smoke-tested (9:45, about 1–2 hours)

**Amplify Hosting:**
- connect the GitHub repo, branch `main`, app root `web`
- build `npm ci && npm run build`, output `dist`
- env var `VITE_API_BASE` = `ApiUrl`
- then `sam deploy --parameter-overrides AllowedOrigin=<Amplify URL>`

When `VITE_API_BASE` is set, the page reads these routes. Every response must match `web/src/types.ts` and the matching file in `web/mock/`:

| Route | Page part | Fields the page relies on |
| --- | --- | --- |
| `GET /stretch`, `GET /gauges` | river panel, Nadi ka haal, live strip, the map's gauge chip | `readings[].site, wl_m, dl_m`; Rewaghat must be present |
| `GET /incidents?status=open` | control room; **the 3D map's incident beacons and patrol rings** (every 4 s) | `id, km, priority, status, with_role, deadline` |
| `GET /incidents/{id}/timeline`, `/execution` | replay, judge panel | state names, timestamps |
| `POST /demo/runs`, `POST /demo/answer`, `GET /demo/runs/current` | judge panel | |
| `GET /help?status=open`, `GET /teams`, `POST /help…`, `POST /teams/{id}/position` | live map, all three roles | as `web/mock/help.json`, `teams.json` |
| `GET /map/{stretch}` | live map grid | not built until C8; the page falls back to its shipped grid |

**Static files:** check that Amplify serves `web/public/map/haijalpur-features.json` (2.8 MB raw, about 0.9 MB compressed: the real buildings, roads, places and trees) and `web/public/sat/*.jpg` compressed, with a long cache. If not, add custom headers in Amplify: `Cache-Control: public, max-age=86400` for `/map/*` and `/sat/*`.

Prompt:

```
Integrate and test the page (web/) against the deployed API at <ApiUrl>. Don't add features; small fixes only.
1. Call each route in the table in docs/ANTIGRAVITY_PLAN.md step C3 and compare the JSON with web/src/types.ts and web/mock/. Fix the backend if they differ; if the page is wrong, fix the page with the smallest diff.
2. CORS: the Amplify URL and http://localhost:5173 only.
3. A Playwright smoke test (tests/web_smoke.py) at 1440x900 and 390x844, in Hindi, English and both: no console errors, no horizontal overflow; the replay plays to its end card; the judge panel starts a real run and shows its states; the live map loads (3D canvas or 2D painting); "Play that night on the map" reaches its end card; the before/after satellite switch and the 2D/3D button work.
4. Headless browsers draw WebGL in software (under 1 frame a second), so don't judge 3D speed headless.
Run the tests, then tell me what you could not verify.
```

**Real-device checks, yours, on mobile data:**
- **Cheap Android phone on 4G:** the 3D map should appear within about 10 s and turn smoothly. If not, tell Antigravity: "Default the live map to 2D on phones; keep the 3D button."
- **Two phones, one with `?role=relief`:** a family's request reaches the relief phone within a few seconds, and an incident filed from the control room shows its beacon on both.

### C4. First real users (11:00, you)

Send the number only to the families who agreed on the calls. They use Nadi ka haal only, never warnings. At the end of the day, count unique people and villages from USE# rows (counts only), and put them in the README.

### C5. Evidence and the deploy guide (11:00, about 1 hour)

```
1. CloudWatch in template.yaml: a custom metric for minutes from report to first answer and one for climbs (emitted from the incident Lambdas), an alarm on any P1 with no answer after 10 minutes and one on Lambda errors, and one dashboard with both metrics, Step Functions executions and API 4xx/5xx.
2. A Makefile target "evidence" (and scripts/evidence.py, standard library + boto3) that runs five judge-path runs through the API and prints median and worst tap-to-page and climb times from CloudWatch, for the README's Evidence section.
3. docs/DEPLOY.md: Windows PowerShell, from nothing to a live URL, with the output to expect at each step, the WhatsApp and Telegram setup, the SSM names, and teardown (sam delete; the bucket empties after its 1-day lock).
```

Deploy, run `python scripts/evidence.py $api`, and put the numbers in the README.

### C6. IRS Form 001 briefing (Today-B, about 1 hour)

```
GET /briefing/{id} per docs/SPEC.md "Government adapters": an HTML page in Hindi and English built from the incident's timeline and the stack's data, in the IRS Form 001 shape: incident name and number, date and time, map position (km, lat/lon, villages with LGD codes), situation summary, actions so far (from the timeline), resources deployed (engineers, flood-fighting force, tractor, relief teams), and who prepared it. Fill every field from data first. If Bedrock answers (MODEL_ID env var, through the official Strands Lambda layer), the agent may add a short narrative paragraph only; the page must work without it ("AI unavailable" note). Store a copy in the Object Lock bucket. The control room's incident card links to it. Tests: a briefing for the seeded replay incident contains its km, villages and the climb.
```

### C7. Night roll-call (Today-B, about 1 hour)

```
The high-water roll-call per docs/SPEC.md step 7: when FMISC shows the nearest gauge above danger level, or SACHET carries a CWC alert for it, create an EventBridge Scheduler schedule (every 2 hours, 22:00-06:00 IST) for the stretches near it. Each run sends each patrol worker on the roster "km X: sab theek?" with "Theek hai" / "Samasya hai" buttons through channels.send_*(); no answer in 20 minutes nudges that kilometre's JE and writes ROLLCALL#<date>/<km> as unmonitored; "Samasya hai" opens the six-sign list. Stop and delete the schedule when the reading falls below danger level. Expose GET /rollcall/latest (km -> answered/unanswered) for the page. Tests: an alert starts it; a silent worker is flagged after 20 minutes; the schedule is removed when the river falls.
```

When this lands, a small page fix can colour the 3D patrol rings grey for "unmonitored" kilometres from `GET /rollcall/latest`. That's an integration fix, so Antigravity can do it.

### C8. The daily satellite Lambda and GET /map (Today-B, about 1–2 hours)

```
Build src/sat/grid.py per docs/SPEC.md "The live map": a daily Lambda (EventBridge Scheduler every morning, 60 s timeout, 1024 MB) that searches Earth Search STAC sentinel-2-l2a over the bbox and reduces the latest clear pass (window cloud <= 25%, else the least cloudy of the last four) to the 56 x 46 grid exactly as tools/build_map.py does (NDWI > 0.05 on B03/B08; SCL 0, 3, 8, 9, 10 masked as cloud; tile 45RTJ preferred). It also keeps s2_before (the last clear pass before 29 Sep) and saves each pass's true-colour picture (the "visual" asset) as a JPEG. It writes map/haijalpur/<date>.json and latest.json plus the pictures to S3 and a MAP# row. GET /map/{stretch} returns latest.json with photo URLs the page can load (pre-signed or a public prefix via the API). Its role reads only the public buckets and writes only map/*. If rasterio is too big for a zip, use a container image Lambda or a Lambda layer, and say which before building. Keep Sentinel-1 a TODO. Test the grid's shape against tools/build_map.py on a saved window of one real scene.
```

Make sure the page's photo URLs match what GET /map returns: today it loads `/sat/<photo>` from Amplify. That's an integration fix if needed.

### C9. Voice notes and Polly (Today-C, about 2 hours)

```
Per docs/SPEC.md steps 1-2 and 6: a voice note goes to S3 through GetWhatsAppMessageMedia, then Amazon Transcribe (hi-IN) as a job; the completion event on EventBridge wakes the drafter. The Strands agent (Bedrock, MODEL_ID env var, official Strands Lambda layer, 60 s timeout) proposes the km and the sign with tools that look up the stretch and open incidents; the reporter gets the six-sign list with the suggestion on top and one tap confirms. The AI never sets, raises or lowers a priority, and the incident opens on the tap even if Transcribe or Bedrock fail. Warnings and Nadi ka haal replies also get a Polly (Kajal, hi-IN, neural) MP3 sent with post_whatsapp_message_media; the mukhiya's message says "Gaon ke loudspeaker par chalaayen". If unsure of any parameter, leave a TODO with the AWS doc link.
```

### C10. Small rules from the spec (Today-C, about 1 hour)

```
Three small items from docs/SPEC.md:
1. "Nikal chalo" also goes out when two P1 reports come from different phones within 300 m and 30 minutes (besides the engineer's Breached/confirm tap). Test both paths.
2. The mukhiya can cancel a false alarm with one button; the run records who cancelled and when, the village gets "Khatra tala" with the reason, and the CAP draft becomes an Update with AllClear. Test it.
3. Roster (in): a CSV in the department's shape (stretch, km from, km to, JE, AE, EE, flood-fighting force, district control room) dropped in s3://<bucket>/roster/ updates ROSTER# rows; phone columns hold SSM parameter names, never numbers. Test with a fictional CSV.
```

---

# Part D: after the submission, from MVP to a deployed pilot and onward

`main` stays frozen at `v1.0` until results are out. All further work goes on a branch `pilot`, merged after the results. Every feature below is detailed in `docs/ROADMAP.md`, which includes a fact-check to do before anything goes to the government.

### D0. Week 1 after results: tidy and talk

- Merge `pilot`. Fix anything the judges or users reported.
- Send the pilot pack (`docs/pilot/`, contact details filled in) to the Bihar official you spoke to, with the roadmap's fact-check applied.
- Ask for a meeting with WRD (Saran division) and the DM's office.

### D1. Production-grade deployment (December 2026 to February 2027)

| Step | What | Done when |
| --- | --- | --- |
| Accounts | Separate AWS accounts for dev, staging and prod, in the department's name or through a MeitY-empanelled managed service provider; AWS Organizations; billing alarms | Prod owned by the department |
| CI/CD | GitHub Actions deploying with OIDC roles (no keys): tests → `sam validate` → deploy to dev on merge → staging on tag → prod with manual approval; Amplify per environment | One-click, reviewed deploys |
| Identity | Cognito user pools with MFA for control room, district, relief and engineers, replacing SSM role tokens | Every staff action has a named login |
| State systems | API Gateway custom domain with mutual TLS for state-to-platform calls, with a truststore in KMS-encrypted S3. Public routes stay as they are, behind AWS WAF. | Only certificate-holding state systems can call the state routes |
| Records | S3 Object Lock in **compliance mode, 180 days**, in prod only, after the department signs off (it can't be undone); CloudTrail data events | Audit-ready |
| Resilience | Hyderabad (ap-south-2) standby: DynamoDB global table; Lambda and Step Functions deployed there; voice falls back to buttons and geofence to a distance check; quarterly failover drill | Drill passes |
| Observability | CloudWatch dashboards per district; alarms to the on-call team; X-Ray traces | Alarms reach a person |
| Data | WRD chainage and embankment shapefiles replace our drawn line and km marks; LGD codes verified; the department's real roster through the CSV drop | Incidents tagged by official chainage |
| Channels | WhatsApp Business in the department's name, with Meta verification; Sandes or a DLT-registered "-G" SMS sender for officials | Department number live |
| Legal | MoU or data-sharing letter; DPDP notice and retention schedule; security audit by a CERT-In empanelled auditor | Signed |

### D2. Pilot features (March to May 2027): ROADMAP phase 1

- Geofenced presence on every P1: a 45-minute window after "on my way", or the site becomes "Unmanned" and climbs.
- Night roll-call, if C7 wasn't built.
- IRS 001 and voice, if C6 and C9 weren't built.
- Training: a 30-minute briefing for patrol workers; the control-room manual in Hindi.
- Two dry-run drills with the district before 15 June.

### D3. Live season (15 June to 31 October 2027)

- Weekly report to the nodal officer, with these measures:
  - minutes to first answer
  - share of P1s answered within 10 minutes
  - roll-call coverage
  - households ready before the water
  - help requests closed safe
  - Nadi ka haal users
- An incident review within 48 hours of any breach, using the system's own timeline.
- A season report in November, and the decision on more districts.

### D4. After the pilot: the rest of the roadmap (`docs/ROADMAP.md` phases 2–7)

| Phase | Features |
| --- | --- |
| 2. Terrain that keeps the embankment | Surveyed crest burned into the ground model; 30 m, then survey DTMs; TIN and quantized-mesh terrain tiles and 3D Tiles buildings with LGD codes on CloudFront (OAC, Brotli); a water shader at the forecast level; Sentinel-1 radar water on AWS Batch; drone LiDAR for critical reaches |
| 3. Relief camp ledger | Offline-first web app; ration card scan (Aadhaar only through UIDAI offline verification, after legal review); one claim per family per wave (DynamoDB conditional writes, keyed hash in KMS); residency check against flood polygons; export in Aapda Sampoorti's own format; camp stock |
| 4. Ward-level command | Statewide road graph in PostGIS with pgRouting; submerged roads cut from routes; safe routes to verified shelters; Aapda Mitra and Ganga Prahari volunteers as reporters; ward dashboard on the 3D map |
| 5. Communications that survive the flood | LoRaWAN pagers for JEs on critical reaches (AWS IoT Core for LoRaWAN) feeding the task-token flow; Bluetooth mesh between camp devices; Amazon Connect calls |
| 6. Prediction, with research partners | Slope moisture from Sentinel-1 backscatter; InSAR deformation (needs SLC data); channel-shift and avulsion risk; stage forecasts only if they beat CWC's; an offline assistant on the USACE Flood Fight Handbook and BSDMA protocols; address-to-LGD matching |
| 7. Finance | Live IFSC and account checks against PFMS (NIC approval); crop-loss lists from flood polygons over the Revenue Department's cadastral maps for Fasal Sahayata |

How each item is handed over: Claude writes its SPEC section, then Antigravity gets one prompt per item (in the style of Part C), then tests, then a staging deploy, then prod with approval.

---

## When something breaks

Paste the exact error into Antigravity: "Fix only this. Don't refactor. Tell me what you changed." If the page and the API disagree, `docs/SPEC.md` and `web/src/types.ts` decide. If the plan itself needs changing, ask Claude.
