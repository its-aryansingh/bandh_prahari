"""Builds web/mock/map.haijalpur.json from AWS open data.
- Copernicus DEM GLO-30 (s3://copernicus-dem-30m) for elevation
- ESA WorldCover 2021 (s3://esa-worldcover) for land cover and settlements
- Sentinel-2 L2A via Earth Search STAC on AWS (s3://sentinel-cogs) for observed water
The Lambda version of this runs daily (see docs/SPEC.md, "The live map")."""
import json, sys, datetime, urllib.request
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling

W, S, E, N = 85.000, 25.905, 85.110, 25.995
COLS, ROWS = 56, 46
OUT = sys.argv[1]

def read(url, out_shape, resampling):
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open("/vsicurl/" + url) as src:
            if src.crs and src.crs.to_epsg() != 4326:
                from rasterio.warp import transform_bounds
                b = transform_bounds("EPSG:4326", src.crs, W, S, E, N)
            else:
                b = (W, S, E, N)
            win = from_bounds(*b, transform=src.transform)
            return src.read(1, window=win, out_shape=out_shape, resampling=resampling, boundless=True, fill_value=0)

dem = read("https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N25_00_E085_00_DEM/Copernicus_DSM_COG_10_N25_00_E085_00_DEM.tif", (ROWS, COLS), Resampling.average)
wc_full = read("https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N24E084_Map.tif", (ROWS * 10, COLS * 10), Resampling.nearest)
blocks = wc_full.reshape(ROWS, 10, COLS, 10).transpose(0, 2, 1, 3).reshape(ROWS, COLS, 100)
cls = np.zeros((ROWS, COLS), int); built = np.zeros((ROWS, COLS), int)
for r in range(ROWS):
    for c in range(COLS):
        v = blocks[r, c]; vals, cnt = np.unique(v, return_counts=True)
        cls[r, c] = int(vals[np.argmax(cnt)]); built[r, c] = int((v == 50).sum())

# Sentinel-2: least cloudy scene since 25 Sep
req = urllib.request.Request("https://earth-search.aws.element84.com/v1/search", method="POST",
    headers={"content-type": "application/json"},
    data=json.dumps({"collections": ["sentinel-2-l2a"], "bbox": [W, S, E, N],
                     "datetime": "2026-09-25T00:00:00Z/2026-10-10T23:59:59Z", "limit": 30}).encode())
items = json.load(urllib.request.urlopen(req, timeout=60))["features"]
print("s2 items", len(items), [ (i["properties"]["datetime"][:10], round(i["properties"].get("eo:cloud_cover", 100))) for i in items][:12])
s2 = None
if items:
    it = sorted(items, key=lambda i: (round(i["properties"].get("eo:cloud_cover", 100) / 10), -int(i["properties"]["datetime"][:10].replace("-", ""))))[0]
    a = it["assets"]
    g = read(a["green"]["href"], (ROWS * 10, COLS * 10), Resampling.bilinear).astype(float)
    n = read(a["nir"]["href"], (ROWS * 10, COLS * 10), Resampling.bilinear).astype(float)
    scl = read(a["scl"]["href"], (ROWS * 10, COLS * 10), Resampling.nearest)
    ndwi = (g - n) / np.maximum(g + n, 1)
    cloud = np.isin(scl, [3, 8, 9, 10])
    water = (ndwi > 0.05) & ~cloud
    wf = water.reshape(ROWS, 10, COLS, 10).mean(axis=(1, 3))
    cf = cloud.reshape(ROWS, 10, COLS, 10).mean(axis=(1, 3))
    s2 = {"id": it["id"], "date": it["properties"]["datetime"][:10], "cloud_cover": round(it["properties"].get("eo:cloud_cover", 0), 1),
          "water": [int(x * 100) for x in wf.ravel()], "cloud": [int(x * 100) for x in cf.ravel()]}
    print("s2 pick", s2["id"], s2["date"], s2["cloud_cover"], "water cells", int((wf > 0.5).sum()), "cloud cells", int((cf > 0.5).sum()))

out = {"bbox": [W, S, E, N], "cols": COLS, "rows": ROWS,
       "cell_m": round((E - W) * 111320 * np.cos(np.radians((S + N) / 2)) / COLS),
       "elev_dm": [int(round(x * 10)) for x in dem.ravel()], "cls": [int(x) for x in cls.ravel()], "built": [int(x) for x in built.ravel()],
       "s2": s2,
       "sources": {"dem": "Copernicus DEM GLO-30, s3://copernicus-dem-30m (AWS Open Data)",
                   "landcover": "ESA WorldCover 2021 v200, s3://esa-worldcover (AWS Open Data)",
                   "water": "Sentinel-2 L2A via Earth Search STAC, s3://sentinel-cogs (AWS Open Data)"},
       "built_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
e = dem.ravel()
print("elev m min/median/max", round(e.min(), 1), round(float(np.median(e)), 1), round(e.max(), 1))
print("classes", dict(zip(*[x.tolist() for x in np.unique(cls, return_counts=True)])))
