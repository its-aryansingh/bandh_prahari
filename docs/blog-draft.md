# What a 10-minute clock would have changed on the Gandak

_Draft for the AWS Builder Center. Replace the bracketed parts, and add a screenshot of the replay and the GIF of the map._

On the night of 29–30 September 2026, the Gandak broke its embankments at Haijalpur in Saran and Sheetalpur in Gopalganj. The reports that followed are short and familiar: "seepage and piping at several locations" before the breach. Five days later the Water Resources Department suspended seven engineers, saying some had left the breach sites instead of responding, and that coordination with residents was weak.

What struck me is that the bank warned first. Bihar already pays one patrol worker for every kilometre of its 3,808 km of embankments, keeps repair tractors on standby and runs a helpline. The parts exist. What doesn't exist is the wire between them: a timed, escalating, recorded link from the person who sees water boiling out of the bank, to the engineer who must act, to the families who must move their grain and cattle before the water comes.

So I built that wire, and called it Jawab Ghadi (जवाब घड़ी), the answer clock.

## Every warning gets an owner, a deadline and a next person

A patrol worker sends a voice note and a photo to a WhatsApp number. Plain rules, not a model, set the priority from the sign and the river. A P1 does two things at once:

- The village hears "Taiyaar" (get ready) within a minute, in Hindi: lift the grain onto the machaan, take the cattle to high ground, keep your papers on you. Nobody waits for an official to decide, and nobody is asked to leave home on one report.
- The junior engineer on duty gets a page with two buttons. If nobody taps "on my way" within 10 minutes, or the message isn't even delivered within two, the page climbs: assistant engineer, executive engineer and district, then the zone's flood-fighting force.

Every step lands in a record that can't be quietly changed. The review that took a week this year writes itself.

## Why AWS Step Functions is the heart of it

The clock is an AWS Step Functions Standard workflow. Each page is a task that waits for a task token with `TimeoutSecondsPath`; the WhatsApp button carries a short wait ID that maps to the token in DynamoDB. A missed deadline is just the timeout branch, and the execution history is the audit trail. A run can wait for days and survive anything that happens to a Lambda.

Around it:

- **AWS End User Messaging Social** runs a real WhatsApp number from AWS; messages and delivery receipts arrive on SNS.
- **Amazon EventBridge Scheduler** reads NDMA's SACHET alerts every 15 minutes and the department's gauges every three hours, and schedules the two-minute delivery check after every page.
- **Amazon DynamoDB** holds the timeline; **Amazon S3 Object Lock** keeps the record; every log group keeps 180 days; everything runs in Mumbai.
- [Next: **Amazon Transcribe** for Hindi voice notes, **Strands Agents on Amazon Bedrock** to draft reports and the district's IRS briefing, **Amazon Polly** for loudspeaker clips, **Amazon Location Service** for check-ins.]

The model never decides anything. It drafts; arithmetic decides; nobody can lower a P1.

## Useful before any government says yes

The same number answers "Nadi ka haal" (how's the river?) for any village, every day: send a village's name and get the nearest official gauge reading, whether it's rising, and any CWC alert, in Hindi. The government already publishes all of it, in English, on maps and PDFs villages never see. [N people from M villages tried it this weekend.]

## A map that a relief team can use

The public page has a live map of the Haijalpur stretch, painted like a Madhubani picture and built entirely from AWS Open Data: Copernicus DEM for the ground, ESA WorldCover for fields and villages, Sentinel-2 for where the satellite saw water. A what-if slider tied to the Rewaghat gauge shows which fields would flood, and the same answer clock runs relief: a family asks for a boat, the nearest team taps "मैं जा रहा हूँ", and 20 minutes later, if they aren't there, the next team is asked and the district is told.

## What I'd need for a pilot

One district (Saran), one monsoon: the division's roster of engineers, the list of stretches by chainage, a WhatsApp number in the department's name, and a 30-minute briefing for patrol workers. The estimate is about $155 for the season. For scale, the 2024 Gandak flood cost ₹512 crore.

The code is open source: https://github.com/its-aryansingh/bandh_prahari

_Baandh Prahari is a student project with no government affiliation. Every public alert it drafts is marked Exercise._
