# Reference blueprints for integration

Two research documents the team uses as the technical blueprint for how Baandh Prahari plugs into Bihar's systems. Read them before building integration or map work; where they and `docs/SPEC.md` disagree, SPEC.md wins for the hackathon build and the blueprint describes the pilot.

| File | What it covers |
| --- | --- |
| `bihar-flood-platform-analysis.pdf` (14 pages) | The gaps (terrain resolution, false acknowledgements, relief disbursement), cloud ingestion (crowdsourced reports, voice NLP, satellite SAR pipeline, state telemetry and barrage data), breach risk modelling, the multi-tier escalation clock, geofenced presence, nightly roll-call, terrain and mesh fusion with embankment breaklines, dynamic water shading, low-bandwidth delivery, the Yuva Aapda Mitra volunteer cadre, safe evacuation routing, volunteer reporting, Aapda Sampoorti and PFMS integration. |
| `bihar-flood-management-tech-blueprint.pdf` (12 pages) | The architecture and operations blueprint: vulnerability assessment, embankment surveillance latency, the topographic resolution deficit, bridging AWS with Bihar's systems, data ingestion and normalisation, USACE-aligned breach scoring, the official response chain, volunteers, relief logistics and Aapda Sampoorti DBT. |

How they map to the build:

- **Live map (web, "सजीव नक़्शा")**: terrain fusion, dynamic water shading, the SAR/optical satellite pipeline, safe evacuation routing, volunteers and relief teams on the map.
- **Answer clock (Step Functions)**: the multi-tier escalation, the 10-minute response clock with task tokens, geofenced presence, the nightly roll-call.
- **Relief record**: Aapda Sampoorti and PFMS, as the dated record a family or mukhiya shows at the circle office (pilot integration, not built this weekend).
