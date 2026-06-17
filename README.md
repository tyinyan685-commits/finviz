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

这个项目没有前端构建步骤，也没有 npm 依赖。Vercel 会直接部署 `public/` 静态页面和 `api/` serverless functions。

## Vercel 环境变量

在 Vercel 项目设置里添加：

```text
FMP_API_KEY=你的_FMP_API_KEY
```

不要把真实 key 写进代码或提交到 GitHub。

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

## 数据逻辑

- 基础股票池来自 FMP `company-screener`。
- 技术指标来自 FMP historical price，自行计算 20/50/200 日均线、1/5/20/60 日涨跌幅、20 日平均成交量、相对成交量、RSI 和距离 52 周高点。
- “优质成长”雷达会额外读取 FMP `key-metrics-ttm`、年度 income statement、balance sheet 和 cash flow，计算收入增长、净利润增长、经营利润率、自由现金流收益率、ROIC/ROE、EV/EBITDA、债务/权益等指标。
- 对 ADR/海外公司，如果财报币种不是 USD，系统不会直接用本币自由现金流除以美元市值，避免跨币种收益率失真。
- 基本面数据带有短期服务端内存缓存，用于减少重复点击时的 API 调用；Vercel 冷启动后会重新拉取。
- Finviz 目前作为人工复核入口，不作为自动数据源。
- 系统会过滤明显的 ETF、基金、权证、单位类、优先股、债券/票据类标的；仍建议对异常名称或价格做人工复核。
- 估值、EPS、PE、基本面等字段取决于当前 FMP 套餐和 endpoint 权限，字段缺失时雷达会降级为价格/成交量/技术面优先。

## 下一阶段建议

- 加 Vercel Cron，每天自动扫描并保存结果。
- 接 Supabase/Postgres，记录历史候选池，而不是只用浏览器 localStorage。
- 接 Finviz Elite 官方导出/API，替换或补充当前的 FMP screener。
- 增加邮件/Telegram/飞书提醒，只推送“新增 + 多筛选器重叠 + 行业集中”的股票。
