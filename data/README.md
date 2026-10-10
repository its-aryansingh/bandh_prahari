# Seed data (you fill these)

- stretch.geojson: draw the Gandak right-bank embankment near Haijalpur (Maker block, Saran) at https://geojson.io on the satellite layer, about 20 km, as one LineString. Save here. The agent can't see the embankment.
- villages.csv: fill LGD codes from https://lgdirectory.gov.in, coordinates from OpenStreetMap, and the nearest relief camp (a school or high ground).
- roster.json: fictional names only. Put real test phone numbers in SSM Parameter Store (/bp/roster/*), never in git.
- replay.json: the agent writes it from docs/SPEC.md "Seed data".
