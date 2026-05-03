接口在这里：

  后端 → 前端的数据流：

  Flask (Render)              React (react-app/)
  ──────────────              ────────────────────────────────
  app/api/                    react-app/src/store/property.js  ← Redux thunks
    mls_listing_routes.py  →  react-app/src/utils/apiFetch.js  ← 统一 fetch 封装
    search_routes.py          react-app/src/store/session.js
    auth_routes.py            react-app/src/store/agent.js
    ...                       ...

  关键文件：

 ┌─────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │              文件               │                                      作用                                      │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │                                 │ 所有 API 调用的入口，生产环境指向 REACT_APP_API_URL（默认                      │
  │ react-app/src/utils/apiFetch.js │ https://api.tourit.ca），本地开发通过 package.json 的 "proxy":                 │
  │                                 │ "http://localhost:5000" 转发                                                   │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ react-app/src/store/property.js │ areaProperties、searchProperties 等 Redux action，调用 /api/listings/          │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ app/api/mls_listing_routes.py   │ 地图/搜索的主数据接口，POST / 按坐标范围返回 listings                          │
  ├─────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ app/__init__.py                 │ Flask 注册所有 blueprint，配置 CORS，生产环境 catch-all 路由把所有非 API       │
  │                                 │ 请求返回 index.html                                                            │
  └─────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  本地开发：
  React dev server (port 3000) 遇到 /api/... 请求，自动 proxy 到 localhost:5000（Flask）。

  生产：
  React build 输出到 app/static/，Flask 直接 serve 静态文件，API 和前端同域。或者 Vercel 托管前端，前端通过
  REACT_APP_API_URL 跨域调用 Render 上的 Flask。




● DDF (CREA RETS server)
           │
           │  RETS search query (LastUpdated >= N hours ago)
           ▼
  lib/services/hourlySync.ts          ← 每3小时触发
  lib/services/ddfSync.ts             ← 每天触发 (daily 26h lookback)
           │
           │  raw DDF record (item.BedroomsTotal, item.ListPrice, ...)
           ▼
  lib/adapters/ListingAdapter.ts
    mapDDFToSupabase()                ← 字段映射 + 类型转换
           │
           │  { mls_number, bed, bath, list_price, photos_timestamp, ... }
           ▼
  Supabase  →  表: mls_listings
           │
           │  photos_timestamp 变了才调 GetObject 拿图片
           │  lib/services/ddfPhotoFetcher.ts  →  PATCH images[]
           │
  ─────────────────────────────────────────────────────────
           │  前端请求 (用户拖动地图)
           ▼
  app/api/mls_listing_routes.py
    POST /api/listings/               ← 按地图坐标范围查询
           │
           │  SQLAlchemy query (MlsListing.lat/lng.between)
           ▼
  app/models/mls_listing.py
    to_frontend_light_dict()          ← 精简字段，去掉 description/images
           │
           │  JSON: { id, price, bed, bath, lat, lng, type, ... }
           ▼
  react-app/src/utils/apiFetch.js     ← 统一 fetch，指向 REACT_APP_API_URL
           │
           ▼
  react-app/src/store/property.js
    areaProperties() thunk            ← dispatch → Redux store
           │
           ▼
  Redux  state.properties.properties  ← 原始数据数组
           │
           ▼
  react-app/src/components/Search/SearchArea.js
    useEffect filter                  ← price / type / bed / bath /
           │                             sqft / strata / title 客户端过滤
           │  propArr (filtered)
           ▼
  Search/List/index.js                ← 分页 (pagedProperties)
           │
           ▼
  Search/List/PropertyCard.js         ← 渲染每张房源卡片
  Search/Map/index.js                 ← 渲染地图 markers + InfoWindow

  两条主线：
  - 写入线：GitHub Actions → DDF → Adapter → Supabase（后台，定时）
  - 读取线：用户拖地图 → Flask API → Supabase → Redux → 客户端 filter → 页面展示

  git add . && git commit -m "f" && git push origin main
  git reset --hard HEAD
