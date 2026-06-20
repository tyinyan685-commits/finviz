# Investment Radar

一个零依赖的 Vercel 网站，用 FMP API 做股票筛选、单股分析、技术面摘要和 Markdown 研究备忘录。

## 设计原则

Finviz 不作为唯一数据源，也不强依赖非官方爬虫。当前版本把 Finviz 当作筛选入口和人工复核入口，实际数据由 FMP 服务端 API 拉取。

核心流程：

```text
固定筛选器 -> 候选股票 -> 技术面补强 -> 优质成长基本面补强 -> 新增/重复/移出变化 -> 单股分析 -> Markdown 研究备忘录
```

## 本地/部署要求

- GitHub 账号
- Vercel 账号
- FMP 付费 API Key
- Supabase 项目

这个项目没有前端构建步骤，也没有 npm 依赖。Vercel 会直接部署 `public/` 静态页面和 `api/` serverless functions。

## Vercel 环境变量

在 Vercel 项目设置里添加：

```text
FMP_API_KEY=你的_FMP_API_KEY
SUPABASE_URL=你的_SUPABASE_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY=你的_SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET=一个你自己生成的长随机字符串
RATING_API_BASE=https://stocks.wiseain.com（可选，默认即此地址）
```

不要把真实 key 写进代码或提交到 GitHub。

`SUPABASE_SERVICE_ROLE_KEY` 只放在 Vercel 服务端环境变量里，不要放到前端代码、GitHub 或公开页面。

## Supabase 设置

1. 在 Supabase 新建一个项目。
2. 进入 SQL Editor。
3. 打开本仓库的 `supabase/schema.sql`，复制全部 SQL 并运行。
4. 进入 Project Settings > API，复制 Project URL，填入 Vercel 的 `SUPABASE_URL`。
5. 在同一页面复制 `service_role` key，填入 Vercel 的 `SUPABASE_SERVICE_ROLE_KEY`。
6. 在 Vercel 里添加 `CRON_SECRET`，建议使用 32 位以上随机字符串。
7. 重新部署 Vercel。

升级已有 Supabase 项目时，再次运行 `supabase/schema.sql` 是安全的：脚本使用 `create table if not exists`，会补建每日统一评级所需的 `stock_ratings` 表和索引。

手动测试保存快照：

```text
https://你的域名/api/snapshot?preset=momentum_breakout&limit=15&secret=你的_CRON_SECRET
```

不建议频繁手动请求 `preset=all`，因为一次跑完全部雷达会消耗较多 FMP 调用。Vercel Cron 已经按 15 分钟间隔分开运行各个雷达。

查看历史队列：

```text
https://你的域名/api/history?days=30&limit=30
```

## 部署步骤

1. 把这个目录推到 GitHub。
2. 在 Vercel 里 New Project，选择这个 GitHub repo。
3. Framework Preset 选择 `Other` 或保持自动识别。
4. 添加环境变量 `FMP_API_KEY`。
5. Deploy。

## API

- `GET /api/presets`：返回筛选器预设。
- `GET /api/screen?preset=momentum_breakout`：运行候选股筛选。
- `GET /api/analyze?symbol=AAPL`：获取公司、财务、估值和新闻摘要。
- `GET /api/technical?symbol=AAPL`：生成均线、RSI 和技术面信号。
- `GET /api/report?symbol=AAPL`：生成 Markdown 研究备忘录。
- `GET /api/health`：检查 FMP key 对 quote/profile/key metrics/annual financials/historical price 的字段可用性。
- `GET /api/snapshot?preset=all&limit=30`：运行雷达并保存到 Supabase。
- `GET /api/rate-candidates?limit=40`：合并当天重复候选，调用分析站统一评级并保存到 Supabase。
- `GET /api/history?days=30&limit=30`：读取历史候选池，生成研究优先队列。

## 数据逻辑

- 基础股票池来自 FMP `company-screener`。
- 技术指标来自 FMP historical price，自行计算 20/50/200 日均线、1/5/20/60 日涨跌幅、20 日平均成交量、相对成交量、RSI 和距离 52 周高点。
- “优质成长”雷达会额外读取 FMP `key-metrics-ttm`、年度 income statement、balance sheet 和 cash flow，计算收入增长、净利润增长、经营利润率、自由现金流收益率、ROIC/ROE、EV/EBITDA、债务/权益等指标。
- 对 ADR/海外公司，如果财报币种不是 USD，系统不会直接用本币自由现金流除以美元市值，避免跨币种收益率失真。
- 基本面数据带有短期服务端内存缓存，用于减少重复点击时的 API 调用；Vercel 冷启动后会重新拉取。
- 筛选结果带有 5 分钟服务端内存缓存，普通刷新优先复用结果；如需强制刷新，可请求 `/api/screen?preset=quality_growth&refresh=1`。
- 每日快照会保存到 Supabase `radar_runs` 和 `radar_candidates`，历史队列按多雷达命中、出现次数和平均分排序。
- 五个雷达完成后，评级任务会优先处理多雷达重叠和雷达分数较高的 40 只股票。每只约使用 6 次 FMP 调用，约 240 次/批，低于当前每分钟 300 次上限。结果保存到 `stock_ratings`，历史队列展示统一评分、评级和数据可信度。
- Vercel Hobby Cron 可能延迟一小时；UTC 04:00 前完成的快照仍归入刚结束的美股交易日。评级任务安排在次日 UTC 01:30，并优先选择最近雷达覆盖最完整的日期，避免跨午夜拆成两天。
- 统一评级由 `stocks.wiseain.com/api/rating` 生成，只使用真实接口数据；缺失指标按中性处理并降低可信度，模拟 K 线不会进入正式评级。
- Finviz 目前作为人工复核入口，不作为自动数据源。
- 系统会过滤明显的 ETF、基金、权证、单位类、优先股、债券/票据类标的；仍建议对异常名称或价格做人工复核。
- 估值、EPS、PE、基本面等字段取决于当前 FMP 套餐和 endpoint 权限，字段缺失时雷达会降级为价格/成交量/技术面优先。

## 下一阶段建议

- 接 Finviz Elite 官方导出/API，替换或补充当前的 FMP screener。
- 增加邮件/Telegram/飞书提醒，只推送“新增 + 多筛选器重叠 + 行业集中”的股票。
