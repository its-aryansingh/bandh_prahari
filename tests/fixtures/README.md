# Real responses to test against

AGENTS.md: parsers are tested against real captured responses, never invented ones.

| File | What | Where it came from |
| --- | --- | --- |
| sachet/rss_bihar.2026-10-10.xml | SACHET's Bihar RSS feed | captured 10 Oct 2026 (also in web/mock/sachet/) |
| sachet/cap.1791519803955016.xml | One CWC CAP alert: Gandak at Dumariaghat | captured 10 Oct 2026 (FetchXMLFile) |
| cap/CAP-v1.2.xsd | OASIS CAP 1.2 schema | the copy bundled in the capvalidator package on PyPI (0.1.0.dev4); sha256 dd73a2e1… |
| fmisc/layer1_gandak.json, layer0_gandak.json | FMISC gauge layers, Gandak stations | not yet: the cloud build machine was refused. Run scripts/fetch_fixtures.ps1 |
| glofas/flood_api.json | Open-Meteo Flood API, the Gandak cell | not yet: same. Run scripts/fetch_fixtures.ps1 |
| sfn_history.json | A real GetExecutionHistory response (judge path run) | after the first deploy, see docs/DEPLOY.md |
| whatsapp/aws_sample_text.sns_message.json | The SNS Message End User Messaging Social publishes (a text) | a real, redacted capture published in aws-samples/sample-whatsapp-end-user-messaging-connect-chat (message_aggregator/sns_message.json) |
| whatsapp/meta/*.json | Meta webhook entries: buttons, lists, voice, location, statuses | the pywa project's test data (github.com/david-lev/pywa, tests/data/updates, MIT) |
| whatsapp/ours/*.json | Our own number's events | not yet: set CAPTURE=on on bp-intake after linking the number (docs/DEPLOY.md) |

Tests that need a file not yet captured are skipped, and say which script to run.
