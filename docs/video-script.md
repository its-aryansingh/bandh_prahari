# The 3-minute video: shot list

Judges score "what it does, who it is for, and where AWS fits". The chapters use those words. Narrate in your own voice, end by **2:55**, upload to YouTube (unlisted is fine), paste the chapters into the description, and check it plays in a signed-out browser.

Thumbnail: a phone with a red P1 page over the Gandak, and the line "1 minute to warn the village. 10 to make the engineer answer."

Record each shot as soon as the feature works (20 seconds each), so Saturday night is assembly, not reshooting. Don't use flood footage you didn't shoot or license; the replay, the map and the phones carry it.

| Chapter (YouTube) | Time | On screen | You say (about) | AWS visible |
| --- | --- | --- | --- | --- |
| 0:00 The night | 0:00–0:20 | The live map's night: "Play that night on the map", from the river climbing to the bank giving way at km 14. Caption: "29 September 2026, Haijalpur, Saran. A re-enactment." | "That night the Gandak broke this embankment. The water warned us first: seepage, then piping. The question is who had to answer." | |
| 0:20 Who it is for | 0:20–0:40 | The family view; the patrol worker; the engineer's phone. The dated reports: breaches at Haijalpur and Sheetalpur, seven engineers suspended on 4 October, "left the breach sites" | "Embankments warn before they break. In Bihar, the warning has nowhere to go. This is for the family behind the bank, the patrol worker, and the engineer who must answer." | |
| 0:40 What it does | 0:40–1:20 | "Replay the night": report, P1, page, silence, the climb, the answer, the Hindi "Taiyaar" steps, the ward member's list filling with "Ho gaya". Then on the map: the family asks for a boat, the team goes, the 20-minute clock, safe at dawn | "Every warning starts Jawab Ghadi, the answer clock: an owner, a deadline, and a next person. The village hears 'get ready' within a minute, without waiting for anyone." | The Step Functions graph |
| 1:20 Plugged into the government | 1:20–1:40 | Today's real SACHET alert on the page; a village name on WhatsApp returning today's official reading in Hindi; a CAP draft marked Exercise | "It reads what the government already publishes, and hands back what the district already uses, as a draft only the district can send." | EventBridge Scheduler, Lambda |
| 1:40 Where AWS fits | 1:40–2:15 | The judge panel: "Start a run", don't answer, watch it climb, answer from the next phone. Then a fast console tour: WhatsApp in End User Messaging Social, the Step Functions execution, DynamoDB timeline, S3 Object Lock, CloudWatch | One line per service and its one job. "Plain rules set the priority. The AI only drafts. Nobody can lower a P1." | All of them |
| 2:15 What changes for the people living with it | 2:15–2:40 | The night, twice: what happened and what would have, with grain up, cattle out and papers in a bag before the water. The map's end card: asked 2:41, safe 2:52. Words from people in Saran or Gopalganj, as on-screen quotes with permission | "This year's review found it a week later. Baandh Prahari shows it at 11:51 PM, while there's still time to act." | |
| 2:40 Try it | 2:40–2:55 | The public page URL; "send your village's name or TEST" with the number. One line of honest limits | "Baandh Prahari. Every warning gets an answer." | The Amplify URL |

## Description text for YouTube

```
Baandh Prahari (बाँध प्रहरी): a Hindi WhatsApp line for families behind Bihar's flood embankments, with an answer clock for the engineer on duty. Built on AWS for Environmental Hacks (WeMakeDevs x AWS).

0:00 The night
0:20 Who it is for
0:40 What it does
1:20 Plugged into the government
1:40 Where AWS fits
2:15 What changes for the people living with it
2:40 Try it

Live page: <Amplify URL>
Code: https://github.com/its-aryansingh/bandh_prahari
A student project with no government affiliation. The patrol reports in the replay are a re-enactment; river readings and alerts are real and credited.
```
