# Lining Up for Democracy 為民主排隊（AR）

2026-11-28 九合一（115 年地方公職人員選舉）全國投開票所：一個地點一個投票箱，從 2 公里高掉下來堆成台灣，外圍排隊的小人排到三排圈票處。用手機打開按「放到你面前看（AR）」。

從 [K30DayMapChallenge-2026](https://github.com/kevin7261/K30DayMapChallenge-2026) Day 27（New tool）的 AR 模式獨立出來。

- `src/App.vue`：AR 頁。背後開一張看不見的 MapLibre 地圖跑 3D 投票箱圖層，模型做好後用 Google model-viewer 顯示
- `src/scene/`：Day 27 的 3D 場景（`ballotLayer.js` 投票箱、`floorDecal.js` 圈票處／排隊小人／告示牌、`arModel.js` 做 .glb）
- `src/scene/data/`：投開票所（`polling.json`）、存好的掉落結果（`ballots-settled.json`）、排隊路線（`queue-path.json`）
- `src/lib/arExport.js`：場景攤平成 AR 模型

```
npm install
npm run serve     # http://localhost:8086（同一個 Wi-Fi 的手機用終端機印的 Network 網址）
npm run deploy    # build 後推到 gh-pages → https://szfftz.github.io/ballot-box/
npm run fetch:polling   # 重抓中選會投開票所（要 shapely）
npm run build:queue     # 重算排隊路線（要 shapely）
```
