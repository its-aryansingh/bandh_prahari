# Backend in Antigravity: the plan

Aryan builds the backend in Antigravity on his Windows PC. Claude keeps working on the page in `web/`. This file is the order of work. Each step is one prompt, one check, one commit.

## Who touches what

| Antigravity (backend) | Claude (page) |
| --- | --- |
| `template.yaml`, `statemachine/`, `src/`, `tests/`, `data/`, `Makefile`, `docs/DEPLOY.md` | `web/` only |
| Never edits `web/`, except `web/.env.local` on your PC (never committed) | Never edits the backend files |

`docs/SPEC.md` is the contract between the two halves. If either side changes a route or a field, it changes SPEC and `web/src/types.ts` in the same commit. **Run `git pull` before every prompt**, because Claude pushes page work to `main` too.

## Time left (deadline Sunday 5 PM IST)

| By | Done when | If it slips |
| --- | --- | --- |
| Sat 4 PM | Steps 0 to 2 deployed: the clock runs on AWS from the page's judge path | Nothing else matters until this works |
| Sat 8 PM | Steps 3 to 4: SACHET, gauges, "Nadi ka haal", CAP drafts. WhatsApp sends and receives (step 5) | At 8 PM with no WhatsApp: tell Antigravity "switch the channel to Telegram per SPEC" |
| Sat 11 PM | Step 6 (help run and teams) deployed; record video clips | Drop step 7 |
| Sun 11 AM | Step 7 if there's time; step 8 evidence | Cut list below |
| Sun 3 PM | Freeze. README, video, submit | |

Cut, in this order, if late: voice notes, roll-call, geofence (keep a distance check), IRS briefing (use a template), the satellite Lambda (the page keeps the 3 October grid). **Never cut:** the clock that climbs, the judge path, "Nadi ka haal", the live SACHET alert, the CAP draft, the AWS view on the page.

## Step 0: set up your PC (about 40 minutes, no AI needed)

In PowerShell:

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Amazon.SAM-CLI
winget install -e --id Python.Python.3.12
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Git.Git
# open a new PowerShell window, then:
aws configure            # region ap-south-1, output json
aws sts get-caller-identity
git clone https://github.com/its-aryansingh/bandh_prahari
cd bandh_prahari
py -3.12 -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install pytest boto3 cfn-lint
```

Then, in the AWS console (region Mumbai):
1. **Billing → Budgets:** a $5 monthly budget with an email alert.
2. **Bedrock:** check that the model you'll use answers. `aws bedrock list-inference-profiles --region ap-south-1` lists the IDs you can put in `MODEL_ID`.
3. **AWS End User Messaging → Social messaging → Add WhatsApp phone number.** Use a number that is not on WhatsApp now. Meta reviews the display name, which can take hours, so start this first.

Open the folder in Antigravity. Under its rules or customisations, add a workspace rule:

> Follow AGENTS.md and docs/SPEC.md exactly. Only edit backend files (template.yaml, statemachine/, src/, tests/, data/, Makefile, docs/). Never edit web/. Never run sam deploy, never print or commit secrets, phone numbers or account IDs. After every task run `pytest -q` and `sam validate --lint`, then tell me what you could not verify.

Pick its strongest model and keep the agent asking before it runs terminal commands.

## The prompts

Paste them one at a time. After each, read the diff, run the check yourself, then commit with the message given.

### Step 1: skeleton and the clock (target 2 hours)

```
Read AGENTS.md and docs/SPEC.md (sections "Repository layout", "Data: one DynamoDB table", "The incident run", "The public API"). Write a short plan first: files and the test that proves each.

Build:
1. template.yaml (SAM, ap-south-1): HTTP API, the DynamoDB table "bp" with the keys in SPEC, the S3 bucket with Object Lock (governance, 1 day) and versioning, 180-day log groups for every function, least-privilege IAM with no "*".
2. src/rules/priority.py: pure functions exactly as SPEC's priority table, with one pytest per row in tests/test_priority.py. Nobody can lower a priority.
3. statemachine/incident.asl.json, Standard: page the JE, wait with arn:aws:states:::lambda:invoke.waitForTaskToken and TimeoutSecondsPath, climb to the AE, then the EE and DM; the "get ready" warning goes out at once without waiting. Name states in plain English (the graph is on camera). Tokens stored in DynamoDB under a short wait ID.
4. src/api/public.py for GET /stretch, /gauges, /incidents?status=open, /incidents/{id}/timeline, /incidents/{id}/execution (GetExecutionHistory), POST /incidents and POST /replay. POST /incidents (the page's control-room form, which is also the judges' way to start a real run) and POST /replay start runs whose roster is the fictional demo roster, with 60-second clocks, throttled; they never message a real phone. Seed one finished run with the ID INC-0930-14 (the night the page replays) from data/replay.json. Responses match web/src/types.ts and the files in web/mock/ exactly.
5. Channel calls go through src/channels/ only. For this step the channel is a "screen" channel that just writes the message to the timeline.
Run pytest -q and sam validate --lint.
```

Check: `pytest -q` and `sam validate --lint` pass. Then deploy it yourself:

```powershell
sam build
sam deploy --guided   # stack bandh-prahari, region ap-south-1, allow IAM role creation, save to samconfig.toml
```

Copy the `ApiUrl` output. In `web/`, create `.env.local` with `VITE_API_BASE=<ApiUrl>`, run `npm ci; npm run dev`, open the page, and file a report from the control-room form. Then open the Step Functions console and watch the run climb. Commit with `backend: skeleton, rules and the answer clock`, then push.

### Step 2: the page's AWS view (30 minutes)

```
The page calls GET /incidents/{id}/execution and GET /incidents/{id}/timeline for the replay (INC-0930-14) and for runs started from the control-room form (see web/src/api.ts, web/src/sections/replay.ts and web/src/sections/control.ts). Make sure both return what those files expect, including state names and timestamps, and add CORS for the Amplify domain and localhost:5173. Add a pytest that loads a recorded execution history from tests/fixtures/ and checks the mapping.
```

Check: the replay and a control-room run show real execution steps on your local page. Commit with `backend: execution and timeline for the page`.

### Step 3: the government feeds (2 hours)

```
Build src/gov/sachet.py (SACHET's Bihar CAP/RSS feed), src/gov/fmisc.py (the department's gauges from gis.fmiscwrdbihar.gov.in) and src/river/poll.py (GloFAS through Open-Meteo as the fallback), on EventBridge Scheduler schedules as SPEC says. Keep the last good reading, skip water levels of -4, dedupe alerts on their identifier, store GAUGE# and ALERT# rows.
First capture real responses with scripts/fetch_fixtures.ps1 into tests/fixtures/ and test the parsers against those, never invented data.
Then "Nadi ka haal": a village name (fuzzy match on data/villages.csv) returns today's nearest reading in Hindi with source and time, "Yeh ek chhatra pariyojana hai, sarkari chetavani nahi" and the helplines 1070 and 1800 345 6145.
```

Run `.\scripts\fetch_fixtures.ps1` when it asks; it needs your Indian internet connection. Deploy, then check that `GET /gauges` shows today's reading. Commit with `backend: SACHET, gauges and Nadi ka haal`.

### Step 4: out to the government (1 hour)

```
src/gov/cap.py: CAP 1.2 drafts for each warning level as SPEC maps them (Monitor, Prepare, Evacuate, AllClear). status is always Exercise and every headline starts "Demo, not a real warning". Validate against the OASIS CAP 1.2 XSD in a test (save the XSD in tests/fixtures/). Serve GET /cap/rss.xml and GET /cap/{id}.xml. Nothing is ever sent to SACHET or any government system.
```

Commit with `backend: CAP 1.2 Exercise drafts`.

### Step 5: WhatsApp (1 to 2 hours, once your number is linked)

```
src/channels/whatsapp.py and src/intake/handler.py exactly per SPEC "How a message moves" and "WhatsApp rules": boto3 client "socialmessaging" (send_whatsapp_message, get_whatsapp_message_media, post_whatsapp_message_media), inbound on SNS, the intake handler returns fast and hands slow work off asynchronously, dedupe on the WhatsApp message ID, button IDs carry the short wait ID, delivery status events go into the timeline. The TEST path makes the sender both worker and engineer on one-minute clocks. Phone numbers of the demo roster come from SSM, never from git. Keep src/channels/telegram.py with the same interface so one setting switches the channel.
If you are unsure of any parameter of these APIs, say so and leave a TODO with the AWS doc link. Don't guess.
```

Put the roster numbers in SSM yourself (`aws ssm put-parameter --type SecureString ...`), deploy, then send "Haijalpur" and then "TEST" from your phone. Commit with `backend: WhatsApp channel and intake`.

### Step 6: help requests and relief teams for the live map (2 hours)

```
Build the live map's backend exactly per SPEC "The live map": POST /help, GET /help (public gets by_village counts only; relief and district role tokens from SSM also get pins), POST /help/{id}/claim, POST /help/{id}/rescued, GET /teams, POST /teams/{id}/position with the Amazon Location tracker bp-teams, and statemachine/help.asl.json with the same clock pattern (60 s / 2 min demo clocks). No names or phone numbers anywhere; phones only as sha256. Responses match web/mock/help.json and web/mock/teams.json.
```

Deploy. Open the page on two phones, one as परिवार and one as राहत दल (enter the role token on the relief phone). The family's request should reach the relief phone within a few seconds. Commit with `backend: help run, teams and positions`.

### Step 7: if there's time

Ask for one at a time:
- "Voice notes: Transcribe hi-IN and the Strands drafter per SPEC; the tap sets the sign, the AI only drafts; Polly Kajal voice for warnings."
- "Check-ins with BatchEvaluateGeofences, the night roll-call per SPEC, and the IRS Form 001 briefing."
- "src/sat/grid.py, the daily satellite Lambda per SPEC, writing map/haijalpur/latest.json; GET /map/{stretch} returns it."
- "CloudWatch: metrics for minutes-to-answer and climbs, two alarms, one dashboard."

### Step 8: evidence (30 minutes)

```
Write docs/DEPLOY.md (Windows PowerShell, from nothing to a live URL, with the outputs I should see and teardown) and a Makefile target that runs five replays and prints the measured times from CloudWatch, for the README's Evidence section.
```

## Putting the page live

Use Amplify Hosting: connect the GitHub repo, set the app root to `web`, the build command to `npm ci && npm run build`, the output to `dist`, and the environment variable `VITE_API_BASE` to your `ApiUrl`. Every push to `main` redeploys.

## When something breaks

Paste the exact error into Antigravity with: "Fix only this. Don't refactor. Tell me what you changed." If the page and the API disagree, SPEC and `web/src/types.ts` decide.
