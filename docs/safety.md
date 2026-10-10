# Safety model

Baandh Prahari sits next to people's homes on the worst night of the year. These are the rules that keep it from doing harm, and where each one is enforced. None of them is a line in a prompt.

## 1. Arithmetic decides; the AI only drafts

- Priority comes from `src/rules/priority.py`: pure functions of the sign (boil, seepage, crack, slip, overtopping, rat hole, slump), the river's state and the stretch. `tests/test_priority.py` has a test per row of the table in `docs/SPEC.md`.
- An engineer can raise a priority, never lower it. There is a test for that too.
- The language model (Amazon Bedrock through Strands Agents, the next step) proposes a kilometre and a sign from a voice note. The reporter confirms with one tap, and the tap is what counts. The model never sets, raises or lowers a priority, and the incident opens even if the model is slow or down ("AI unavailable" shows instead of hiding).

## 2. Nothing official is ever sent

- Every CAP alert the system writes has `status` Exercise, and every headline starts "Demo, not a real warning". `tests/test_gov.py` checks every draft against the OASIS CAP 1.2 schema and the Exercise status.
- Nothing is sent to SACHET, the Cell Broadcast System or any government system. A real alert would be approved and sent by the district's authorised officer, through their own channel.

## 3. Real people get only what is safe to give them

- One stack parameter, `Outbound`, stops every message to a real phone. It stays `off` until the roster phones have sent "join".
- Only numbers on the demo roster can ever receive a page or a warning: `scripts/seed.py` stores their SHA-256 hashes as an allowlist (`ALLOW#`), and `tests/test_whatsapp.py` checks that strangers can't report, test or answer.
- Anyone else gets "Nadi ka haal" only: the official reading, its source and time, "a student project, not an official warning", and the helplines 1070 and 1800 345 6145. Never "get ready", never "move now".

## 4. The judge path can't touch real runs

- `POST /demo/runs` uses the fictional roster, draws its phones on the page, runs on 60-second clocks and is capped per day (`DemoDailyCap`) and throttled at API Gateway.
- The demo answer route refuses any task token that belongs to a real incident, even while the channel is "screen" (`tests/test_api.py`).

## 5. Privacy, under the DPDP Act 2023

- Help requests hold no names. The family's phone number is stored only as a SHA-256 hash, for deduplication.
- A number that subscribes to a village's warnings is stored with a consent note ("your number is used only for flood warnings this season"). Clearing these at the end of the season is a manual step for now; a pilot sets an expiry on them. Usage is counted per day as a hash, so the README can report unique people without keeping identities.
- The public map shows counts per village, never pins. Exact pins go only to relief and district callers with a role token from SSM (a pilot adds Cognito with MFA).
- Team positions come only from team phones on duty. Nobody else is tracked, and the geofence check stores no track.

## 6. The record can't be quietly changed

- The incident record goes to S3 with Object Lock (governance mode, one day for the hackathon; a pilot would use a longer retention) and versioning.
- Every Lambda log group keeps 180 days, as CERT-In's 2022 directions ask, in India.

## 7. Least privilege

- Every function has its own IAM role, with no managed policies. The only `Resource: "*"` entries are those IAM can't scope (`SendTaskSuccess`/`SendTaskFailure`, a bucket-wide deny of plain HTTP, a KMS key policy), each explained at the top of `template.yaml`.
- Phone numbers, tokens and secrets live only in SSM Parameter Store, never in git.

## 8. Honest on screen

- The replay and the map's night are labelled as re-enactments on sample data; river readings and alerts are labelled with their source and time.
- Kilometre marks are ours, not the department's chainage, and the map says the embankment line, villages and camps are approximate. The flood what-if says it is "a rough sketch, not a hydraulic model".
