#!/usr/bin/env bash
set -euo pipefail
f=tests/fixtures; mkdir -p "$f"
curl -sSL "https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml" -o "$f/sachet_bihar.xml"
link=$(grep -o '<link>[^<]*FetchXMLFile[^<]*</link>' "$f/sachet_bihar.xml" | head -1 | sed 's/<[^>]*>//g;s/&amp;/\&/g')
curl -sSL "$link" -o "$f/sachet_alert.xml"
curl -sSL "https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer/1/query?where=CWC_own.RIVER+LIKE+%27%25andak%25%27&outFields=*&returnGeometry=false&f=json" -o "$f/fmisc_gandak.json"
curl -sSL "https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.xsd" -o "$f/CAP-v1.2.xsd"
echo "Saved fixtures to $f"
