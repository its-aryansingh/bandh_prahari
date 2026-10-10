# Baandh Prahari: rules for every agent

Source of truth: docs/SPEC.md. If a task conflicts with it, stop and ask.
The planning/ folder is for the human. Don't read it unless asked.

## Stack
- Python 3.12 for every Lambda. One SAM template (template.yaml). Region ap-south-1 only.
- Incident run: Step Functions STANDARD, never Express. Waits use
  arn:aws:states:::lambda:invoke.waitForTaskToken with TimeoutSecondsPath.
- One DynamoDB table "bp" with the keys in SPEC.md. S3 bucket with Object Lock
  (governance mode, 1-day retention) and versioning.
- WhatsApp through AWS End User Messaging Social (boto3 client "socialmessaging"):
  send_whatsapp_message, get_whatsapp_message_media, post_whatsapp_message_media.
  Inbound messages arrive on SNS. Channel code lives only in src/channels/;
  everything else calls channels.send_*() so Telegram can replace WhatsApp.
- Bedrock through the Strands Agents SDK. The model ID comes from env var MODEL_ID.
- Web: Vite and plain TypeScript in web/, following web/DESIGN.md (Mithila style:
  indigo ink, flat token fills, Yatra One + Baloo 2). The live map is a canvas-2D
  isometric renderer of the GET /map grid: no map library, no UI framework, no
  gradients, no neon, no dark-mode-first. Hindi first, big type. Help pins are never
  public: the public view shows counts per village only.

## Hard rules
- Plain rules in src/rules/priority.py (pure functions) set priority.
  The AI only drafts. It never sets, raises or lowers a priority.
- Every CAP alert: status Exercise, headline starting "Demo, not a real warning".
  Nothing is ever sent to SACHET or any government system.
- No secrets, phone numbers or account IDs in code or git: env vars and SSM only.
- Every Lambda log group keeps logs 180 days. Least-privilege IAM per function, no "*".
- Lambdas that call Transcribe, Bedrock or Polly get a 30-60 s timeout; the SNS intake
  handler returns fast and hands slow work off asynchronously.
- Don't invent AWS APIs or parameters. If unsure, say so and leave a TODO with a doc link.
- Don't add services, libraries or features that SPEC.md doesn't list.

## Working style
- Before code, write a short plan: the files you'll touch and the test that proves it.
- Small diffs. Never refactor unasked.
- Parsers are tested against real captured responses in tests/fixtures/, not invented ones.
- Run `pytest -q` and `sam validate --lint` before saying a task is done.
- One commit per finished task: "area: what changed".
- End every task by listing what you could NOT verify.
