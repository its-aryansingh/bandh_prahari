# Start here: Baandh Prahari (Environmental Hacks, Heat and Water)

Every warning on Bihar's flood embankments gets an owner, a deadline and a next person:
Jawab Ghadi, the answer clock. Built on AWS, in ap-south-1.

## What's in this folder
| Path | What it is | Who reads it |
| --- | --- | --- |
| AGENTS.md | Rules Antigravity loads in every conversation | Antigravity |
| docs/SPEC.md | The build spec, priority rules and the loop | Antigravity, you |
| planning/PROMPTS.md | The 10 prompts to paste, in order | You |
| planning/PLAN.md | The full winning plan: the problem, judges' view, video script, schedule, checklist, sources | You (kept out of git) |
| data/ | Seed data templates you fill in | You, then the agent |
| scripts/fetch_fixtures.ps1 | Saves today's real SACHET, gauge and CAP schema files | You, once |
| tests/fixtures/ | Real government responses for parser tests | Antigravity |

The live plan doc (with diagrams): https://claude.ai/code/artifact/c24fa99e-c7fc-45b0-a428-e340a487ba37

## First 15 minutes (4:00-4:15 PM)
1. Open this folder in Antigravity. Turn on planning mode; make terminal commands ask for approval.
2. `git init`, create a public GitHub repo, first commit today (planning/ is git-ignored on purpose: it holds your strategy and odds).
3. Run `powershell -ExecutionPolicy Bypass -File scripts\fetch_fixtures.ps1` to save today's real government responses.
4. Paste prompt 1 from planning/PROMPTS.md.

## Gates
- Fri 6 PM: WhatsApp works through AWS, or switch to Telegram.
- Sat 2 AM: Gate 1, the whole loop on your phone.
- Sat 9 AM: first real users. Families who agreed on Friday's calls get the number; only "Nadi ka haal" is live for them.
- Sat 11 PM: Gate 2, a draft video exists.
- Sun 5 PM: submitted. Then stop committing.

## Never
- Paste keys or phone numbers into any chat or file in git.
- Let the agent run `sam deploy`, delete anything, or touch credentials. You run those.
- Send a CAP alert anywhere. Every one is marked Exercise.
