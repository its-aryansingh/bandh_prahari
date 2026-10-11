"""Builds web/public/map/haijalpur-features.json: what really stands on the Haijalpur stretch,
for the 3D live map. Nothing is placed at random.

- Buildings, roads, bridges, power lines and named places: Overture Maps Foundation release on
  AWS Open Data (s3://overturemaps-us-west-2), which merges OpenStreetMap, Microsoft and Google
  building footprints. Read anonymously with DuckDB.
- Trees: ESA WorldCover 2021 (s3://esa-worldcover) tree pixels at 10 m, thinned to 20 m.

Coordinates are metres east and north of the window's south-west corner, rounded to 1 m.
Usage: python tools/build_features.py web/public/map/haijalpur-features.json
"""
import json, math, sys, datetime
import duckdb, numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling

W, S, E, N = 85.000, 25.905, 85.110, 25.995
RELEASE = "2026-09-23.1"
OUT = sys.argv[1]
LAT0 = math.radians((S + N) / 2)
MX = 111320 * math.cos(LAT0)  # metres per degree of longitude here
MY = 110574  # metres per degree of latitude

def xy(lon, lat):
    return round((lon - W) * MX), round((lat - S) * MY)

con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;")
# public bucket: no credentials, even if the shell has some
con.sql("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key=''; SET s3_session_token='';")
R = f"s3://overturemaps-us-west-2/release/{RELEASE}"
BB = f"bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}"
src = lambda theme, typ: f"read_parquet('{R}/theme={theme}/type={typ}/*', hive_partitioning=1)"

def rings(wkt_geom):
    """Exterior ring of a polygon (or the largest part of a multipolygon) as [[lon, lat], ...]."""
    g = json.loads(wkt_geom)
    if g["type"] == "Polygon":
        return g["coordinates"][0]
    if g["type"] == "MultiPolygon":
        return max((p[0] for p in g["coordinates"]), key=len)
    return []

# ---- buildings: footprint rings, simplified to about 1 m, with height or floors if known
rows = con.sql(f"""SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry, 0.00001)), height, num_floors
                   FROM {src('buildings', 'building')} WHERE {BB}""").fetchall()
buildings = []  # flat: n, h_dm, x0, y0, x1, y1, ...
for gj, h, floors in rows:
    ring = rings(gj)
    if len(ring) < 4:
        continue
    pts = [xy(lon, lat) for lon, lat in ring[:-1]]
    height = h if h else (floors * 3.2 if floors else 0)
    buildings += [len(pts), round(height * 10)] + [v for p in pts for v in p]
print("buildings", len(rows))

# ---- roads and paths, with their class
rows = con.sql(f"""SELECT class, ST_AsGeoJSON(geometry) FROM {src('transportation', 'segment')}
                   WHERE {BB} AND subtype = 'road'""").fetchall()
roads = []
for cls, gj in rows:
    g = json.loads(gj)
    if g["type"] != "LineString":
        continue
    roads.append({"c": cls or "unknown", "p": [v for lon, lat in g["coordinates"] for v in xy(lon, lat)]})
print("roads", len(roads))

# ---- bridges and power towers
rows = con.sql(f"""SELECT subtype, class, ST_AsGeoJSON(ST_Centroid(geometry)) FROM {src('base', 'infrastructure')}
                   WHERE {BB}""").fetchall()
infra = [{"k": cls, "p": list(xy(*json.loads(gj)["coordinates"]))} for sub, cls, gj in rows]
print("infrastructure", len(infra))

# ---- named places (schools, temples, clinics...): candidates for relief camps
cols = {r[0] for r in con.sql(f"DESCRIBE SELECT * FROM {src('places', 'place')} LIMIT 1").fetchall()}
cat = "categories.primary" if "categories" in cols else ("basic_category" if "basic_category" in cols else "NULL")
rows = con.sql(f"""SELECT names.primary, {cat}, ST_X(geometry), ST_Y(geometry) FROM {src('places', 'place')}
                   WHERE {BB}""").fetchall()
places = [{"n": n, "k": k, "p": list(xy(x, y))} for n, k, x, y in rows if n]
print("places", len(places))

# ---- trees: WorldCover tree pixels (class 10) at 10 m, one tree per 20 m block that has one
url = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N24E084_Map.tif"
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
    with rasterio.open("/vsicurl/" + url) as ds:
        win = from_bounds(W, S, E, N, transform=ds.transform)
        wc = ds.read(1, window=win, resampling=Resampling.nearest)
h, w = wc.shape
trees = []
for r in range(0, h - 1, 2):
    for c in range(0, w - 1, 2):
        block = wc[r:r + 2, c:c + 2]
        if (block == 10).sum() >= 2:
            lon = W + (c + 1) / w * (E - W)
            lat = N - (r + 1) / h * (N - S)
            trees += list(xy(lon, lat))
print("trees", len(trees) // 2)

out = {
    "bbox": [W, S, E, N], "origin": "south-west corner, metres east and north",
    "size_m": [round((E - W) * MX), round((N - S) * MY)],
    "buildings": buildings, "roads": roads, "infra": infra, "places": places, "trees": trees,
    "sources": {
        "buildings, roads, bridges, places": f"Overture Maps Foundation release {RELEASE} on AWS Open Data (s3://overturemaps-us-west-2); includes OpenStreetMap (ODbL), Microsoft and Google building footprints",
        "trees": "ESA WorldCover 2021 v200 tree class, 10 m (AWS Open Data)",
    },
    "built_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
}
json.dump(out, open(OUT, "w"), separators=(",", ":"))
