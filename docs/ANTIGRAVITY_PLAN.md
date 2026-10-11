# Backend in Antigravity: the plan

Updated Saturday 10 October, 12:30 PM IST. Aryan finishes and deploys the backend in Antigravity on his Windows PC. Claude keeps working on the page in `web/` and the docs. Each step below is one prompt (or one deploy), one check and one commit.

## Where things stand

Most of the backend is already written and merged into `main`: 126 tests pass and `sam validate --lint` passes. **Nothing is deployed yet**, so the first job is to deploy, not to write code.

| Part | State | What's left |
| --- | --- | --- |
| The answer clock (`statemachine/incident.asl.json`, `src/incident/`): page, climb JE → AE → EE + DM, answer, warn, close | Built, tested | Deploy (step 1) |
| Judge path (`POST /demo/runs`, `/demo/answer`, `GET /demo/runs/current`) and the control-room form (`POST /incidents`) | Built, tested | Deploy |
| Public reads: `/incidents`, `/incidents/{id}/timeline`, `/incidents/{id}/execution` | Built, tested | One real execution history for the skipped test (step 2) |
| SACHET in, FMISC gauges in, GloFAS fallback, "Nadi ka haal" (`/stretch`, `/gauges`) | Built, tested on real SACHET captures | Real FMISC and Open-Meteo captures (step 2) |
| CAP 1.2 drafts out, always Exercise (`/cap/rss.xml`, `/cap/{file}`), checked against the OASIS XSD | Built, tested | — |
| WhatsApp through End User Messaging Social, SNS intake, delivery climb; Telegram switchable | Built, tested | Link the number and switch it on (step 3) |
| Help run and relief teams for the live map (`src/help/`, `src/api/help.py`, `statemachine/help.asl.json`) | **Half built, not in the template** | Step 4 |
| `/map/{stretch}` and the daily satellite Lambda (`src/sat/`) | Not started | Step 5 (until then the page uses the grid it ships with: Sentinel-2 of 6 Oct, and 20 Sep for before the breach) |
| IRS Form 001 briefing, voice notes, roll-call, geofence check-in | Not started | Step 6, in cut order |
| CloudWatch dashboard, evidence run, `docs/DEPLOY.md` | Not started | Step 7 |

## Who touches what

From Sunday 11 October, 8:50 AM: **Antigravity owns all testing, the backend and the API integration, including small fixes in `web/` needed to integrate.** Claude only plans (this file, `docs/ROADMAP.md`, new SPEC sections). The page is feature-complete; don't add page features.

| Antigravity | Claude |
| --- | --- |
| `template.yaml`, `statemachine/`, `src/`, `tests/`, `scripts/`, `data/`, `Makefile`, `docs/DEPLOY.md`; integration fixes in `web/` (small diffs, no new features) | Plans: this file, `docs/ROADMAP.md`, new SPEC sections |

`docs/SPEC.md` is the contract. If either side changes a route or a field, it changes SPEC and `web/src/types.ts` in the same commit. **Run `git pull` before every prompt**, because Claude may push plan updates to `main`.

## Time left (deadline Sunday 5 PM IST)

| By | Done when | If it slips |
| --- | --- | --- |
| Sat 3 PM | Step 1: the stack is deployed and `make fast-incident` passes; the page's judge path runs a real clock on AWS | Nothing else matters until this works |
| Sat 5 PM | Step 2: real fixtures captured, all tests run | Keep the skips, say so in the README |
| Sat 8 PM | Step 3: WhatsApp sends and receives; "Haijalpur" and TEST answer | At 8 PM with no WhatsApp: switch to Telegram (step 3b) |
| Sat 11 PM | Step 4: help run and teams live; two phones see each other. Record video clips | Page stays on its sample help data, labelled |
| Sun 11 AM | Steps 5 to 7 as time allows | Cut list below |
| Sun 3 PM | Freeze. README, video, submit | |

**Cut, in this order, if late:** voice notes, roll-call, geofence (keep a distance check), IRS briefing (use a template), the satellite Lambda. **Never cut:** the clock that climbs, the judge path, "Nadi ka haal", the live SACHET alert, the CAP draft, the AWS view on the page.

## Step 0: set up your PC (about 40 minutes, no AI needed)

In PowerShell:

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Amazon.SAM-CLI
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
# close PowerShell, open a new window, then:
aws configure                      # your access key, region ap-south-1, output json
aws sts get-caller-identity        # must print your account, not an error
git clone https://github.com/its-aryansingh/bandh_prahari
cd bandh_prahari
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1       # if blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
pip install -r requirements-dev.txt
pytest -q                          # expect: 126 passed, 3 skipped
sam validate --lint --region ap-south-1
```

In the AWS console, region **Asia Pacific (Mumbai)**:
1. **Billing → Budgets:** a $5 monthly cost budget with an email alert.
2. **Bedrock:** `aws bedrock list-inference-profiles --region ap-south-1` lists the model IDs you can use later (step 6). Not needed for steps 1 to 4.
3. **AWS End User Messaging → Social messaging → Add WhatsApp phone number.** Use a number that is not on WhatsApp now. Meta reviews the display name, which can take hours, so start this now.

Open the folder in Antigravity and add a workspace rule (in its rules or customisations settings):

> Follow AGENTS.md and docs/SPEC.md exactly. Only edit backend files (template.yaml, statemachine/, src/, tests/, scripts/, data/, Makefile, docs/DEPLOY.md). Never edit web/. Never run sam deploy, never print or commit secrets, phone numbers or account IDs. Small diffs, never refactor unasked. After every task run `pytest -q` and `sam validate --lint --region ap-south-1`, then tell me what you could not verify.

Pick its strongest model and keep it asking before it runs terminal commands. Note which models you used: the README must name every AI tool.

## Step 1: deploy what's built (about 30 minutes, no AI unless it breaks)

```powershell
sam build
sam deploy --guided
```

Answer the prompts like this:

| Prompt | Answer |
| --- | --- |
| Stack name | `bp` (the Makefile expects it) |
| Region | `ap-south-1` |
| Channel | `screen` (messages are only drawn on the page for now) |
| Outbound | `off` |
| DemoDailyCap | `300` |
| WhatsAppPhoneNumberHex, MetaApiVersion | press Enter (defaults) |
| AllowedOrigin | `*` for now; the Amplify URL later |
| Confirm changes / allow role creation | `y` |
| Functions without authorization… Is this okay? | `y` (the public routes are meant to be open and are throttled) |
| Save arguments to samconfig.toml | `y` (it's git-ignored) |

Then:

```powershell
python scripts/seed.py --dry-run    # look at what it will write
python scripts/seed.py
$api = aws cloudformation describe-stacks --stack-name bp --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
python scripts/fast_incident.py $api   # about two minutes; must end with every step passing
```

Check on the page: in `web/`, create `.env.local` with `VITE_API_BASE=<the ApiUrl>`, run `npm ci`, then `npm run dev`, and open http://localhost:5173. In the judge panel of the control-room section, press "रन शुरू करें / Start a run" and watch it climb in the Step Functions console. Record 20 seconds of that for the video.

If anything fails, paste the exact error into Antigravity: "Fix only this. Don't refactor. Tell me what you changed." Commit any fix as `backend: <what changed>`.

## Step 2: real fixtures (20 minutes)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\fetch_fixtures.ps1
# the execution ARN of step 1's run is in the Step Functions console (state machine "IncidentRun…", the latest execution)
python -c "import boto3,json,sys; h=boto3.client('stepfunctions',region_name='ap-south-1').get_execution_history(executionArn=sys.argv[1],maxResults=1000); open('tests/fixtures/sfn_history.json','w',encoding='utf-8').write(json.dumps({'events':h['events']},default=str,ensure_ascii=False,indent=1))" <execution ARN>
pytest -q
```

(Don't use PowerShell's `>` to save JSON: it writes UTF-16 and the tests can't read it.) The three skipped tests run on their own once the files exist. If any fail, the prompt:

```
I captured real responses: tests/fixtures/fmisc/, tests/fixtures/glofas/ and tests/fixtures/sfn_history.json (from today's deployed run). These tests now fail: <paste pytest's output>. Fix the parsers for the real shape; don't change the captured files and don't invent data. Check that a water level of -4 is still skipped.
```

Check: `pytest -q` shows 0 skipped. Commit `tests: real FMISC, Open-Meteo and execution captures`.

## Step 3: WhatsApp (1 to 2 hours, once your number is linked)

In the console, under End User Messaging → Social messaging, open your WhatsApp Business account and set its **event destination** to the `InboundTopicArn` output of the stack. Copy the phone number ID (the part after `phone-number-id/` in the number's ARN).

Put the demo roster's numbers in SSM, one per role in `data/roster.json` (your phone and friends' phones only, people who agreed):

```powershell
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/roster/je --value "+91XXXXXXXXXX"
# repeat for each name under /bp/roster/ and /bp/mukhiya/ that data/roster.json lists
python scripts/seed.py
```

Every roster phone sends "join" to your WhatsApp number first (WhatsApp only lets you message people who wrote to you in the last 24 hours). Then redeploy with the channel on:

```powershell
sam deploy --parameter-overrides Channel=whatsapp Outbound=on WhatsAppPhoneNumberHex=<the id>
```

Check: send "Haijalpur" (today's reading in Hindi with its source), then "TEST" (you become worker and engineer on one-minute clocks; don't answer the first page and watch it climb). Commit any fix as `backend: <what changed>`.

**Step 3b, only if WhatsApp isn't working by 8 PM.** Make a bot with @BotFather in Telegram, then:

```powershell
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/telegram/token --value "<bot token>"
aws ssm put-parameter --region ap-south-1 --type SecureString --name /bp/telegram/hook-secret --value "<any long random string>"
sam deploy --parameter-overrides Channel=telegram Outbound=on
```

and ask Antigravity: "Give me the exact setWebhook command for our Telegram bot, pointing at POST /telegram/hook with the secret token header, per src/intake/telegram_hook.py." Say why in the README.

## Step 4: help requests and relief teams (2 hours)

```
The help run is half built: src/help/core.py, src/help/run.py, src/help/teams.json, src/api/help.py and statemachine/help.asl.json exist but are not in template.yaml. Finish it exactly per docs/SPEC.md "How a message moves" step 9 and "The live map": write a short plan first.
1. Add the help run state machine (Standard; waitForTaskToken with TimeoutSecondsPath; demo clocks 60 s and 2 min) and its Lambdas to template.yaml, least-privilege roles, 180-day log groups.
2. Routes: POST /help, GET /help?status=open (public: by_village counts only; relief and district tokens from SSM /bp/tokens/* also get pins), POST /help/{id}/claim, POST /help/{id}/rescued, GET /teams, POST /teams/{id}/position.
3. Amazon Location: one tracker bp-teams (BatchUpdateDevicePosition, ListDevicePositions), and the 200 m geofence on the family's pin. If you are unsure of any parameter, say so and leave a TODO with the AWS doc link; until it works, the "पहुँच गए" button ends the on-site wait.
4. No names or phone numbers anywhere; phones only as sha256. Responses match web/mock/help.json, web/mock/teams.json and web/src/types.ts exactly.
5. Tests from SPEC: a late team climbs to the next team and the request still closes as rescued; GET /help without a token returns no pins.
```

Then put the role tokens in SSM (`/bp/tokens/relief`, `/bp/tokens/district`, long random strings), deploy, and open the page on two phones with `?role=relief` on one. A family's request should reach the relief phone within a few seconds. Commit `backend: help run, teams and positions`.

## Step 5: the satellite Lambda (1 to 2 hours, cut if late)

```
Build src/sat/grid.py exactly per docs/SPEC.md "The live map" (the grid): the daily Lambda (60 s timeout, EventBridge Scheduler every morning) searches Earth Search STAC sentinel-2-l2a for the bbox, reduces the least cloudy pass of the last ten days to the 56 x 46 grid the way tools/build_map.py does (NDWI > 0.05, SCL 3, 8, 9, 10 masked as cloud), writes map/haijalpur/<date>.json and latest.json to S3 and a MAP# row. GET /map/{stretch} returns latest.json. Its role reads only the public buckets and writes only map/*. Also write s2_before (the last clear pass before 29 Sep) and each pass's true-colour picture (photo), exactly as tools/build_map.py does now. Keep Sentinel-1 a TODO. Test the grid's shape against tools/build_map.py on a saved window of one real scene. If rasterio is too big for a Lambda zip, say so and propose the smallest option before building.
```

## Step 6: if there's time, one prompt at a time

- "The IRS Form 001 briefing per SPEC: GET /briefing/{id} renders an HTML page from the timeline. Fill it from the timeline first; the Strands agent only adds the narrative if Bedrock answers (MODEL_ID env var)."
- "Voice notes per SPEC: Transcribe hi-IN and the Strands drafter. The tap sets the sign; the AI only drafts and never sets a priority. Polly Kajal for warnings. 30 to 60 s timeouts."
- "The high-water roll-call per SPEC, started by a SACHET alert or a reading above danger level."
- "The check-in: a 200 m distance check in the Lambda now; BatchEvaluateGeofences only if you can confirm its parameters from the AWS docs."

## Step 7: evidence and the deploy guide (30 minutes)

```
1. CloudWatch: a metric for minutes-to-answer and for climbs, two alarms, one dashboard, all in template.yaml.
2. A Makefile target "evidence" that runs five judge-path replays and prints median and worst tap-to-page time from CloudWatch, for the README's Evidence section.
3. docs/DEPLOY.md: Windows PowerShell, from nothing to a live URL, with the outputs I should see at each step, and teardown (sam delete, then empty the bucket after its 1-day lock).
```

Run `make evidence` (or the Python behind it) and send the numbers to Claude for the README.

## Step 8: integrate and test the page against the live API (1 to 2 hours)

When `VITE_API_BASE` is set, the page reads the routes below. Every response must match `web/src/types.ts` and the matching file in `web/mock/`.

| Route | Page part | Fields the page relies on |
| --- | --- | --- |
| `GET /stretch`, `GET /gauges` | river panel, Nadi ka haal, live strip, the map's gauge chip | `readings[].site, wl_m, dl_m`; Rewaghat must be present |
| `GET /incidents?status=open` | control room; **the 3D map's incident beacons and patrol rings** (read every 4 s) | `id, km, priority, status, with_role, deadline` |
| `GET /incidents/{id}/timeline`, `/execution` | replay, judge panel | state names, timestamps |
| `POST /demo/runs`, `POST /demo/answer`, `GET /demo/runs/current` | judge panel | |
| `GET /help?status=open`, `GET /teams`, `POST /help…`, `POST /teams/{id}/position` | live map, all three roles | as `web/mock/help.json`, `teams.json` |
| `GET /map/{stretch}` | live map grid | **Not built yet; the page falls back to the grid it ships with** (`web/mock/map.haijalpur.json`: Sentinel-2 of 6 Oct, `s2_before` of 20 Sep, `photo` names). Step 5 makes it live. |

The page also loads two sets of static files from Amplify:
- `web/public/map/haijalpur-features.json`: 2.8 MB, about 0.9 MB compressed. These are the real buildings, roads, places and trees for the 3D map.
- `web/public/sat/*.jpg`: the satellite photos.

Check that Amplify serves them compressed with a long cache.

Prompt:

```
Integrate and test the page (web/) against the deployed API at <ApiUrl>. Don't add features; small fixes only.
1. For each route in the table in docs/ANTIGRAVITY_PLAN.md step 8, call it and compare the JSON with web/src/types.ts and web/mock/. Fix the backend if they differ; if the page is wrong, fix the page with the smallest diff.
2. CORS: the Amplify URL and http://localhost:5173 only.
3. A Playwright smoke test at 1440x900 and 390x844, in Hindi, English and both: no console errors, no horizontal overflow; the replay plays to its end card; the judge panel starts a real run and shows its states; the live map loads (3D canvas or 2D painting); "Play that night on the map" reaches its end card; the before/after satellite switch and the 2D/3D button work.
4. Headless browsers draw WebGL in software, so the 3D map runs at under 1 frame a second there. Don't judge 3D speed headless; I'll check it on real devices.
Run the tests, then tell me what you could not verify.
```

Check these yourself, on real devices over mobile data:
- **A cheap Android phone on 4G:**
  - The 3D map should appear within about 10 seconds, and turning and zooming should be smooth.
  - If it isn't, tell Antigravity: "Default the live map to 2D on phones; keep the 3D button."
- **Two phones, one opened with `?role=relief`:**
  - A family's request should reach the relief phone within a few seconds.
  - An incident filed from the control room should show its beacon on both.
- **Play the night with sound on.** It's the best 40 seconds for the video.

## Putting the page live

Amplify Hosting in the console: connect the GitHub repo, branch `main`, app root `web`, build command `npm ci && npm run build`, output directory `dist`, environment variable `VITE_API_BASE` = your `ApiUrl`. Every push to `main` redeploys. Then redeploy the stack with `AllowedOrigin=<the Amplify URL>`.

## When something breaks

Paste the exact error into Antigravity: "Fix only this. Don't refactor. Tell me what you changed." If the page and the API disagree, SPEC and `web/src/types.ts` decide; tell Claude and it fixes the page side.
