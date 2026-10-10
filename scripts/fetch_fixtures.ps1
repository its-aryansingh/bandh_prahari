# Saves today's real government responses for the parser tests (AGENTS.md: real captures only).
# Run from the repo root in PowerShell:  powershell -ExecutionPolicy Bypass -File scripts\fetch_fixtures.ps1
# Then:  git add tests/fixtures ; git commit -m "tests: real FMISC and Open-Meteo captures"
$ErrorActionPreference = "Stop"
$f = "tests/fixtures"
$day = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path "$f/sachet", "$f/fmisc", "$f/glofas" | Out-Null
$ua = @{ "User-Agent" = "BaandhPrahari/0.1 (student project)" }

Invoke-WebRequest "https://sachet.ndma.gov.in/cap_public_website/rss/rss_bihar.xml" -Headers $ua -OutFile "$f/sachet/rss_bihar.$day.xml"
[xml]$rss = Get-Content "$f/sachet/rss_bihar.$day.xml" -Encoding UTF8
$item = $rss.rss.channel.item | Where-Object { $_.title -like "*Gandak*" } | Select-Object -First 1
if (-not $item) { $item = $rss.rss.channel.item | Select-Object -First 1 }
Invoke-WebRequest $item.link -Headers $ua -OutFile "$f/sachet/cap.$($item.guid.'#text').xml"

$q = "where={0}.RIVER+LIKE+%27%25andak%25%27&outFields=*&returnGeometry=false&f=json"
$base = "https://gis.fmiscwrdbihar.gov.in/arcgis/rest/services/FmiscHydro/FMISC_Dynmic/MapServer"
Invoke-WebRequest "$base/1/query?$($q -f 'CWC_own')" -Headers $ua -OutFile "$f/fmisc/layer1_gandak.json"
Invoke-WebRequest "$base/0/query?$($q -f 'wrd_own')" -Headers $ua -OutFile "$f/fmisc/layer0_gandak.json"

Invoke-WebRequest "https://flood-api.open-meteo.com/v1/flood?latitude=25.975&longitude=85.025&daily=river_discharge&past_days=30&forecast_days=7" -Headers $ua -OutFile "$f/glofas/flood_api.json"
Write-Host "Saved fixtures to $f"
