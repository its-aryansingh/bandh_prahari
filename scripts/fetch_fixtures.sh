#!/usr/bin/env bash
# Same as fetch_fixtures.ps1, for Linux or macOS.
set -euo pipefail
f=tests/fixtures; day=$(date +%F); ua="BaandhPrahari/0.1 (student project)"
mkdir -p "$f/sachet" "$f/fmisc" "$f/glofas"
curl -sSfL -A "$ua" "https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml" -o "$f/sachet/rss_bihar.$day.xml"
link=$( (grep -A4 'Gandak' "$f/sachet/rss_bihar.$day.xml" || cat "$f/sachet/rss_bihar.$day.xml") | grep -o '<link>[^<]*FetchXMLFile[^<]*</link>' | head -1 | sed 's/<[^>]*>//g;s/&amp;/\&/g')
id=${link##*=}
curl -sSfL -A "$ua" "$link" -o "$f/sachet/cap.$id.xml"
base="https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer"
curl -sSfL -A "$ua" "$base/1/query?where=CWC_own.RIVER+LIKE+%27%25andak%25%27&outFields=*&returnGeometry=false&f=json" -o "$f/fmisc/layer1_gandak.json"
curl -sSfL -A "$ua" "$base/0/query?where=wrd_own.RIVER+LIKE+%27%25andak%25%27&outFields=*&returnGeometry=false&f=json" -o "$f/fmisc/layer0_gandak.json"
curl -sSfL -A "$ua" "https://flood-api.open-meteo.com/v1/flood?latitude=25.975&longitude=85.025&daily=river_discharge&past_days=30&forecast_days=7" -o "$f/glofas/flood_api.json"
echo "Saved fixtures to $f"
