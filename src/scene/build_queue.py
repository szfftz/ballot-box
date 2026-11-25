#!/usr/bin/env python3
"""Day 27 排隊小人的路線：台灣本島＋澎湖往外推 35 公里的一圈（平滑過），分成三段給三個圈票區
→ data/queue-path.json：[[[經度, 緯度], …]]（一圈，約每 3 km 一點）
來源：data/boundary/taiwan.geojson（內政部國土測繪中心縣市界合併）
執行：python3 src/scene/build_queue.py（要 shapely）
"""
import json, math
from pathlib import Path
from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
LAND = HERE.parents[1] / 'data/boundary/taiwan.geojson'
LON0, LAT0 = 120.9, 23.7
KX = 111320 * math.cos(math.radians(LAT0))
BUFS = [35000]  # 往外推幾公尺（一圈，分成三段給三個圈票區）
STEP = 3000

to_m = lambda lon, lat: ((lon - LON0) * KX, (lat - LAT0) * 111320)
to_ll = lambda x, y: (round(LON0 + x / KX, 5), round(LAT0 + y / 111320, 5))

polys = []
for f in json.loads(LAND.read_text())['features']:
    g = shape(f['geometry'])
    for p in (g.geoms if isinstance(g, MultiPolygon) else [g]):
        c = p.centroid
        if 119.2 < c.x < 122.2 and 21.8 < c.y < 25.4:  # 本島、澎湖、綠島、蘭嶼、小琉球（不含金門、馬祖）
            polys.append(Polygon([to_m(*xy) for xy in p.exterior.coords]))
land = unary_union(polys)
lanes = []
for BUF in BUFS:
    ring = land.buffer(BUF + 20000).buffer(-20000).simplify(500)  # 先多推再縮回來：把凹進去的地方填平，線比較順
    if isinstance(ring, MultiPolygon):
        ring = max(ring.geoms, key=lambda g: g.area)
    line = ring.exterior
    n = int(line.length // STEP)
    lanes.append([to_ll(*line.interpolate(i * STEP).coords[0]) for i in range(n)])
    print(BUF // 1000, 'km:', n, 'points', round(line.length / 1000), 'km')
(HERE / 'data/queue-path.json').write_text(json.dumps(lanes, separators=(',', ':')))
