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
OUT = sys.argv[1]  # optional argv[2]: a folder for the true-colour pictures

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

# Sentinel-2: the latest clear pass over the bbox, and the last clear pass before the
# 29-30 September breach, so the page can show before and after from space.
req = urllib.request.Request("https://earth-search.aws.element84.com/v1/search", method="POST",
    headers={"content-type": "application/json"},
    data=json.dumps({"collections": ["sentinel-2-l2a"], "bbox": [W, S, E, N],
                     "datetime": "2026-09-15T00:00:00Z/" + datetime.date.today().isoformat() + "T23:59:59Z", "limit": 60}).encode())
items = json.load(urllib.request.urlopen(req, timeout=60))["features"]
print("s2 items", len(items))
PHOTO_DIR = sys.argv[2] if len(sys.argv) > 2 else None

def sat_pass(it):
    a = it["assets"]
    g = read(a["green"]["href"], (ROWS * 10, COLS * 10), Resampling.bilinear).astype(float)
    n = read(a["nir"]["href"], (ROWS * 10, COLS * 10), Resampling.bilinear).astype(float)
    scl = read(a["scl"]["href"], (ROWS * 10, COLS * 10), Resampling.nearest)
    ndwi = (g - n) / np.maximum(g + n, 1)
    cloud = np.isin(scl, [3, 8, 9, 10]) | (scl == 0)
    water = (ndwi > 0.05) & ~cloud
    wf = water.reshape(ROWS, 10, COLS, 10).mean(axis=(1, 3))
    cf = cloud.reshape(ROWS, 10, COLS, 10).mean(axis=(1, 3))
    p = {"id": it["id"], "date": it["properties"]["datetime"][:10], "cloud_cover": round(float(cf.mean()) * 100, 1),
         "water": [int(x * 100) for x in wf.ravel()], "cloud": [int(x * 100) for x in cf.ravel()]}
    if PHOTO_DIR and "visual" in a:
        # the true-colour picture of the same window, to drape over the 3D ground
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
            with rasterio.open("/vsicurl/" + a["visual"]["href"]) as src:
                from rasterio.warp import transform_bounds
                bb = transform_bounds("EPSG:4326", src.crs, W, S, E, N)
                rgb = src.read(window=from_bounds(*bb, transform=src.transform), out_shape=(3, ROWS * 16, COLS * 16), resampling=Resampling.bilinear, boundless=True, fill_value=0)
        from PIL import Image
        name = f"s2-{p['date']}.jpg"
        Image.fromarray(np.transpose(rgb, (1, 2, 0)).astype("uint8")).save(f"{PHOTO_DIR}/{name}", quality=82)
        p["photo"] = name
    print("s2 pass", p["id"], p["date"], "local cloud %", p["cloud_cover"], "water cells", int((wf > 0.5).sum()))
    return p

# one item per date: the tiles overlap, and 45RTJ covers the whole window (44RRP stops short)
by_date = {}
for it in items:
    d = it["properties"]["datetime"][:10]
    pref = 0 if "_45RTJ_" in it["id"] else 1
    key = (pref, it["properties"].get("eo:cloud_cover", 100))
    if d not in by_date or key < by_date[d][0]:
        by_date[d] = (key, it)
by_date = {d: v[1] for d, v in by_date.items()}

def clearest(dates, tries=4):
    """The most recent pass with little cloud over the window; else the least cloudy one tried."""
    best = None
    for d in sorted(dates, reverse=True)[:tries]:
        p = sat_pass(by_date[d])
        if p["cloud_cover"] <= 25:
            return p
        if best is None or p["cloud_cover"] < best["cloud_cover"]:
            best = p
    return best

ok = lambda d: by_date[d]["properties"].get("eo:cloud_cover", 100) <= 60
s2 = clearest([d for d in by_date if d >= "2026-09-30" and ok(d)])
s2_before = clearest([d for d in by_date if d < "2026-09-29" and ok(d)])

out = {"bbox": [W, S, E, N], "cols": COLS, "rows": ROWS,
       "cell_m": round((E - W) * 111320 * np.cos(np.radians((S + N) / 2)) / COLS),
       "elev_dm": [int(round(x * 10)) for x in dem.ravel()], "cls": [int(x) for x in cls.ravel()], "built": [int(x) for x in built.ravel()],
       "s2": s2,
       "s2_before": s2_before,
       "sources": {"dem": "Copernicus DEM GLO-30, s3://copernicus-dem-30m (AWS Open Data)",
                   "landcover": "ESA WorldCover 2021 v200, s3://esa-worldcover (AWS Open Data)",
                   "water": "Sentinel-2 L2A via Earth Search STAC, s3://sentinel-cogs (AWS Open Data)"},
       "built_at": datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
e = dem.ravel()
print("elev m min/median/max", round(e.min(), 1), round(float(np.median(e)), 1), round(e.max(), 1))
print("classes", dict(zip(*[x.tolist() for x in np.unique(cls, return_counts=True)])))
