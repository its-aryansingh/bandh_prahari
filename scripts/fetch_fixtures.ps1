# Run from the repo root in PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\fetch_fixtures.ps1
$ErrorActionPreference = "Stop"
$f = "tests/fixtures"
New-Item -ItemType Directory -Force -Path $f | Out-Null
Invoke-WebRequest "https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml" -OutFile "$f/sachet_bihar.xml"
[xml]$rss = Get-Content "$f/sachet_bihar.xml"
$link = $rss.rss.channel.item[0].link
Invoke-WebRequest $link -OutFile "$f/sachet_alert.xml"
$q = "where=CWC_own.RIVER+LIKE+%27%25andak%25%27&outFields=*&returnGeometry=false&f=json"
Invoke-WebRequest "https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer/1/query?$q" -OutFile "$f/fmisc_gandak.json"
Invoke-WebRequest "https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.xsd" -OutFile "$f/CAP-v1.2.xsd"
Write-Host "Saved fixtures to $f"
