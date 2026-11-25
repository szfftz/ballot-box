#!/usr/bin/env python3
"""Day 27「2026 投開票所」（index.vue，/day27）：115 年地方公職人員選舉（2026-11-28）全國投開票所 → data/polling.json、data/polling-summary.json

來源：中選會「115年11月28日地方公職人員選舉投票所地點」查詢網站 https://info.cec.gov.tw/vote2026/voteSearch/
  網站背後的靜態 JSON：
    /vote2026/static/json/dist/prvCityDept.json          縣市、選舉區、鄉鎮市區
    /vote2026/static/json/tbox/{縣市碼}/01{縣市碼}.json   每個投開票所：編號、名稱、地址、所屬村里、鄰、geocode（大多是 null）
  原始檔存在 data/raw/（不進 git）
座標：
  1. 中選會自己有給 geocode 的（「緯度,經度」，178 所）直接用
  2. 其他用地址查 ArcGIS World Geocoding Service（findAddressCandidates，countryCode=TWN）
     地址先全形數字轉半形、拿掉「○○里／村」（ArcGIS 認不得村里），只收門牌等級（PointAddress、Subaddress）且分數 ≥ 90 的
     對不到門牌的也要畫，用最接近的位置（locate()）：路段內插 → 地名、地標 → 村里中心 → 鄉鎮中心
     ArcGIS 的結果要落在地址的鄉鎮市區裡才用；每個點記下定位方式，沒對到門牌的列在 summary 的 approx
  查過的地址快取在 data/raw/geocode-cache.json，重跑只查新的
只用標準函式庫（certifi 有裝就用）。執行：python3 src/scene/fetch_polling.py [--no-fetch]
"""
import json, re, ssl, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / 'data'
RAW = OUT / 'raw'
CACHE = RAW / 'geocode-cache.json'
BASE = 'https://info.cec.gov.tw/vote2026/static'
ARC = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
OK_TYPES = {'PointAddress', 'Subaddress'}
MIN_SCORE = 90
HOWS = ['cec', 'door', 'street', 'place', 'village', 'town']  # 定位方式，準到粗
BBOX = (118.1, 21.8, 122.1, 26.4)  # 臺澎金馬馬祖

try:
    import certifi
    SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL = None


def get_json(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'K30DayMapChallenge-2026'})
            with urllib.request.urlopen(req, timeout=60, context=SSL) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1:
                raise
            print('  retry', url[:90], e)
            time.sleep(2 * (i + 1))


def fetch():
    RAW.mkdir(parents=True, exist_ok=True)
    prvs = get_json(f'{BASE}/json/dist/prvCityDept.json')
    (RAW / 'prvCityDept.json').write_text(json.dumps(prvs, ensure_ascii=False))
    for p in prvs['prvs']:
        c = p['prvCityCode']
        (RAW / f'tbox_{c}.json').write_text(json.dumps(get_json(f'{BASE}/json/tbox/{c}/01{c}.json'), ensure_ascii=False))
        print('  ', p['prvName'])


def norm(addr):
    """全形數字轉半形、去掉縣市鄉鎮後面的「○○里／村」：臺北市文山區試院里木柵路1段72號 → 臺北市文山區木柵路1段72號"""
    a = addr.translate({ord(c): ord(c) - 0xFEE0 for c in '０１２３４５６７８９－'}).strip()
    return re.sub(r'^(..[縣市].{1,3}?[鄉鎮市區])\S{1,4}?[村里](?=\S)', r'\1', a)


def arcgis(addr):
    q = urllib.parse.urlencode({'SingleLine': addr, 'f': 'json', 'maxLocations': 1, 'countryCode': 'TWN',
                                'outFields': 'Addr_type,Match_addr'})
    c = get_json(f'{ARC}?{q}')['candidates']
    if not c:
        return None
    c = c[0]
    return {'lon': round(c['location']['x'], 6), 'lat': round(c['location']['y'], 6), 'score': c['score'],
            'type': c['attributes']['Addr_type'], 'match': c['attributes']['Match_addr']}


def geocode(addrs):
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = sorted({norm(a) for a in addrs} - cache.keys())
    print(f'地理編碼：{len(todo)} 個地址要查（快取 {len(cache)}）')

    def one(a):
        try:
            return a, arcgis(a)
        except Exception as e:
            print('  失敗', a, e)
            return a, 'ERR'
    with ThreadPoolExecutor(6) as ex:
        for i, (a, r) in enumerate(ex.map(one, todo), 1):
            if r != 'ERR':
                cache[a] = r
            if i % 500 == 0:
                CACHE.write_text(json.dumps(cache, ensure_ascii=False))
                print(f'  {i}/{len(todo)}')
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


def geocode_poi(queries, cache):
    todo = sorted(set(queries) - cache.keys())
    print(f'地標查詢：{len(todo)} 個')
    def one(q):
        try:
            return q, arcgis(q[4:])
        except Exception as e:
            print('  失敗', q, e)
            return q, 'ERR'
    with ThreadPoolExecutor(6) as ex:
        for q, r in ex.map(one, todo):
            if r != 'ERR':
                cache[q] = r
    CACHE.write_text(json.dumps(cache, ensure_ascii=False))
    return cache


def inside(lon, lat):
    return BBOX[0] < lon < BBOX[2] and BBOX[1] < lat < BBOX[3]


def tw(s):
    """統一寫法：台→臺、脚→腳、村里界的罕用字括號 [磘] → 磘"""
    return s.replace('台', '臺').replace('脚', '腳').replace('[', '').replace(']', '')


def load_areas():
    """鄉鎮市區、村里界（data/boundary/，從 K30DayMapChallenge-2026 複製）→ {(縣市, 鄉鎮): 面}、{(縣市, 鄉鎮, 村里): 面}"""
    from shapely.geometry import shape
    def read(name):
        return json.loads((ROOT / f'data/boundary/{name}.geojson').read_text())['features']
    towns = {(tw(f['properties']['COUNTYNAME']), tw(f['properties']['TOWNNAME'])): shape(f['geometry']) for f in read('town')}
    vills = {}
    for f in read('village'):
        p = f['properties']
        if p['VILLNAME']:
            vills[(tw(p['COUNTYNAME']), tw(p['TOWNNAME']), tw(p['VILLNAME']))] = shape(f['geometry'])
    return towns, vills


def center(g):
    """面的中心；中心不在面裡（彎月形、多塊）就用面上的代表點"""
    c = g.centroid
    return c if g.contains(c) else g.representative_point()


def poi_query(b):
    name = re.sub(r'[（(].*$', '', b['name']).strip() or b['name']
    name = re.sub(r'@[0-9A-F]+@', '', re.sub(r'\d+(樓|教室|班)$', '', name)).strip()
    return f"POI|{name} {b['county']}{b['town']}"


def locate(b, cache, towns, vills):
    """回傳 (經度, 緯度, 定位方式)；ArcGIS 的結果要落在地址的鄉鎮市區裡才算（容許 300 公尺誤差）
    cec 中選會座標 → door 門牌 → street 路段內插（同一條路上的門牌號碼推算）→ place 地名、地標 → village 村里中心 → town 鄉鎮中心"""
    from shapely.geometry import Point
    if b['cec']:
        lat, lon = map(float, b['cec'].split(','))
        return lon, lat, 'cec'
    cty, town = tw(b['county']), tw(b['town'])
    tg = towns.get((cty, town))
    g = cache.get(norm(b['addr']))
    if g and inside(g['lon'], g['lat']) and (tg is None or tg.buffer(0.003).contains(Point(g['lon'], g['lat']))):
        t = g['type']
        if t in OK_TYPES:
            return g['lon'], g['lat'], 'door'
        if t in ('StreetAddress', 'StreetAddressExt', 'StreetInt'):
            return g['lon'], g['lat'], 'street'
        # 地名、地標要比鄉鎮更細（只對到「○○縣○○鄉」的不算）
        if t in ('POI', 'Locality', 'StreetName') and re.sub(r'[\s,0-9]', '', g['match']) not in {cty + town, tw(b['county'].replace('臺', '台')) + town}:
            if not g['match'].replace('台', '臺').replace(' ', '').startswith(cty + town) or len(g['match']) > len(cty + town) + 1:
                return g['lon'], g['lat'], 'street' if t == 'StreetName' else 'place'
    # 投開票所名稱查地標（「松林國小 臺南市西港區」）：POI、分數 ≥ 95、落在鄉鎮裡
    q = poi_query(b)
    g = cache.get(q)
    if g and g['type'] == 'POI' and g['score'] >= 95 and tg is not None and tg.buffer(0.003).contains(Point(g['lon'], g['lat'])):
        return g['lon'], g['lat'], 'place'
    # 地址裡的村里（沒有就用投開票所負責的村里）
    m = re.match(r'^..[縣市].{1,3}?[鄉鎮市區](\S{1,4}?[村里])', b['addr'])
    for v in ([tw(m[1])] if m else []) + [tw(b['li'])]:
        vg = vills.get((cty, town, v))
        if vg is None and '@' in v:  # 中選會的罕用字是 @CNS 碼@，當成任一字比對
            pat = re.compile('^' + re.sub(r'@[0-9A-F]+@', '.', v) + '$')
            hit = [g for (c2, t2, v2), g in vills.items() if c2 == cty and t2 == town and pat.match(v2)]
            vg = hit[0] if len(hit) == 1 else None
        if vg is not None:
            c = center(vg)
            return round(c.x, 6), round(c.y, 6), 'village'
    c = center(tg)
    return round(c.x, 6), round(c.y, 6), 'town'


def main():
    if '--no-fetch' not in sys.argv:
        print('下載中選會投開票所資料')
        fetch()
    prvs = json.loads((RAW / 'prvCityDept.json').read_text())['prvs']
    town = {}
    for p in prvs:
        for ar in p['areas']:
            for d in ar['depts']:
                town[(p['prvCityCode'], d['deptCode'])] = d['deptName']

    boxes = []  # 每個投開票所一筆
    for p in prvs:
        c = p['prvCityCode']
        for dp in json.loads((RAW / f'tbox_{c}.json').read_text())['depts']:
            for li in dp['lis']:
                for t in li['tboxs']:
                    boxes.append({'county': p['prvName'], 'town': town.get((c, dp['deptCode']), ''), 'li': li['liName'],
                                  'no': t['tboxNo'], 'name': t['tboxName'].strip(), 'addr': t['addr'].strip(),
                                  'neighbor': t['neighbor'] or '', 'cec': t['geocode']})
    cache = geocode([b['addr'] for b in boxes if not b['cec']])

    # 每一所都要畫：定位方式（HOW）依序試，用第一個成功的
    towns, vills = load_areas()
    # 地址對不到的，先用名稱查地標（查過的也存在快取，key 前面加 POI|）
    need = {poi_query(b) for b in boxes if locate(b, cache, towns, vills)[2] in ('village', 'town')}
    cache = geocode_poi(need, cache)
    sites, src = {}, Counter()
    for b in boxes:
        lon, lat, how = locate(b, cache, towns, vills)
        b['how'] = how
        src[how] += 1
        s = sites.setdefault((b['county'], b['addr']), {'lon': round(lon, 5), 'lat': round(lat, 5), 'county': b['county'],
                                                        'town': b['town'], 'addr': b['addr'], 'boxes': []})
        s['boxes'].append(b)

    rows = []
    for s in sites.values():
        bs = sorted(s['boxes'], key=lambda b: b['no'])
        names = Counter(re.sub(r'[（(].*$', '', b['name']).strip() or b['name'] for b in bs)
        # [經度, 緯度, 地點名稱, 地址, 縣市, 鄉鎮市區, 投開票所數, 定位方式, 投開票所 [[編號, 名稱, 村里, 鄰], …]]
        rows.append([s['lon'], s['lat'], names.most_common(1)[0][0], s['addr'], s['county'], s['town'], len(bs), bs[0]['how'],
                     [[b['no'], b['name'], b['li'], b['neighbor']] for b in bs]])
    rows.sort(key=lambda r: r[6])  # 多的畫在上面
    (OUT / 'polling.json').write_text(json.dumps(rows, ensure_ascii=False, separators=(',', ':')))

    by = defaultdict(lambda: [0, 0, 0])  # 縣市：投開票所、門牌等級（中選會＋門牌）、地點
    for b in boxes:
        by[b['county']][0] += 1
        by[b['county']][1] += b['how'] in ('cec', 'door')
    for r in rows:
        by[r[4]][2] += 1
    order = [p['prvName'] for p in prvs]
    top = max(rows, key=lambda r: r[6])
    summary = {
        'boxes': len(boxes), 'sites': len(rows), 'how': {k: src[k] for k in HOWS},
        'maxN': {'name': top[2], 'addr': top[3], 'n': top[6]},
        'counties': [[c, *by[c]] for c in order],  # [縣市, 投開票所, 門牌等級, 地點]
        # 沒對到門牌的（路段以下）：[縣市, 鄉鎮, 編號, 名稱, 地址, 定位方式]
        'approx': [[b['county'], b['town'], b['no'], b['name'], b['addr'], b['how']] for b in boxes if b['how'] not in ('cec', 'door')],
    }
    (OUT / 'polling-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"{len(boxes)} 所投開票所 → {len(rows)} 個地點；定位方式", dict(src))
    print('最多', top[2], top[3], top[6])


if __name__ == '__main__':
    main()
