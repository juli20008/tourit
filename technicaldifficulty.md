### 1. 后端与数据库：从“能跑”到“工业级”

你手里有 70,000 个经纪人数据和动态房源，传统的查询方式在高并发下会卡死。

- **难题：** 地图矩形区域查询（Spatial Query）的性能。
- **ToDo：**
  - **数据库选型：** 建议使用 **PostgreSQL + PostGIS**。它是处理地理空间数据的行业标准，能快速计算“屏幕内有哪些房源”。
  - **缓存策略：** 引入 **Redis**。房源数据（MLS）虽然变动快，但在几分钟内是相对静态的，没必要每次缩放地图都去撞数据库。
  - **索引优化：** 确保针对 `latitude` 和 `longitude` 建立了空间索引（GIST Index）。

### 2. IDX / BrokerBay 深度集成：最硬的骨头

这是房产网站的生命线。

- **难题：** 数据清洗与准实时同步。各地的 MLS 数据格式（RETS 或 Web API）非常混乱。
- **ToDo：**
  - **数据标准化：** 建立一套映射机制，将 IDX 原始数据转换为你 Phase 1-4 定义好的 JSON Token 格式。
  - **Webhooks：** 如果 BrokerBay 支持，使用 Webhook 实时接收预约更新，而不是轮询（Polling），以节省服务器资源。
  - **合规性：** 确保前端展示符合 TREB/CREA 的显示标准（比如必须显示 Listing Office 等）。

### 3. 高并发下的地图渲染：解决“掉帧”

用户缩放地图时，前端需要处理数万个坐标点。

- **难题：** 浏览器 DOM 节点上限。如果地图上有 1000 个真正的 HTML Element Marker，页面会直接崩掉。
- **ToDo：**
  - **Canvas 渲染：** 不要使用普通的 HTML Marker。使用 **Mapbox GL JS** 或 **Google Maps API 的 WebGL 覆盖层**。它们在 Canvas 上渲染，处理 10 万个点也不会掉帧。
  - **聚类 (Clustering)：** 实现“点聚合”。在缩放层级较高时，将附近的 50 个房源聚合为一个数字，只在放大后显示具体 Marker。
  - **Supercluster：** 这是一个极其高效的 JavaScript 库，专门用于在前端处理数万个点的聚合逻辑。

### 4. Cloud Hosting 与 自动化部署

- **难题：** 成本控制与全球访问速度。
- **ToDo：**
  - **前端部署：** 直接上 **Vercel**（完美契合你的 Next.js 栈），它的 Edge Network 能确保你的静态资源和首屏加载极快。
  - **后端 API：** 可以考虑 **AWS Lambda (Serverless)** 或者 **Render/Railroad**。对于你这种 Micro-SaaS 来说，按需付费最划算。
  - **CDN 优化：** 所有的房源图片必须通过 CDN（如 Cloudinary 或 Vercel Image Optimization）进行压缩和格式转换（WebP），否则图片加载会拖死你的 300ms 交互。

### 5. Cursor 的高级玩法：架构护航

你提到的“所见即所得”，在 Phase 4 后要转向“逻辑严密性”。

- **ToDo：**
  - **Typescript 强制化：** 让 Cursor 为所有 API 返回值生成 Interface。这样当后端数据结构变了，前端会直接报错，而不是默默崩溃。
  - **自动化测试：** 让 Cursor 帮你写 **Playwright 或 Cypress** 的端到端测试。模拟用户“打开地图 -> 缩放 -> 点击房源 -> 发起预约”的全流程。

---

### 你的待办优先级 (Priority Matrix)


|               |                       |                                      |
| ------------- | --------------------- | ------------------------------------ |
| **优先级**       | **任务模块**              | **核心理由**                             |
| **P0 (立刻)**   | **IDX/BrokerBay 跑通**  | 没有真实、合规的数据流，UI 再漂亮也是空壳。              |
| **P1 (紧随其后)** | **PostGIS 空间查询**      | 决定了“地图联动”是否真的能承载 70,000 条数据。         |
| **P2 (进阶)**   | **Canvas/Cluster 渲染** | 确保用户在 Downtown Toronto 这种房源密集区缩放不卡顿。 |
| **P3 (维护)**   | **Vercel/Cloudfront** | 优化加载速度和图片分发。                         |



PWA -> webapp


Next Steps:

#Marketing:
1. Bring 8 realtors onboard 
2. One button to create a listing on FBMP/Kijiji/Xiaohongshu

Absolutely need to be fixed:
1. 字段
2. Geo精确性
3. Filters
4. For Sale/For Lease
5. Request a showing
6. Chat function
7. Search function
8. Sort - 广告？

Nice to have:
1. Gallery滚动浏览
2. Lead Distribution Logic：
Show confirmed availability for the booked time.
3. Disclaimer - cookie - map jump to allow track your location - right now do not jump to location

帮我改点前端的东西，注意不要碰后端的任何file：