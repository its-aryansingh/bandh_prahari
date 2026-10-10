# Real responses to test against

Run scripts/fetch_fixtures.ps1 (Windows) or scripts/fetch_fixtures.sh once, today, before any parser is written.
It saves:
- sachet_bihar.xml: SACHET's Bihar RSS feed
- sachet_alert.xml: the first CAP alert in that feed
- fmisc_gandak.json: the department's gauge layer, Gandak stations
- whatsapp_inbound.json: you add this by hand, from the intake Lambda's first log line (prompt 2)
- CAP-v1.2.xsd: OASIS CAP 1.2 schema, for validating our drafts
