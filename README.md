# Investment Radar

一个零依赖的 Vercel 网站，用 FMP API 做股票筛选、单股分析、技术面摘要和 Markdown 研究备忘录。

## 设计原则

Finviz 不作为唯一数据源，也不强依赖非官方爬虫。当前版本把 Finviz 当作筛选入口和人工复核入口，实际数据由 FMP 服务端 API 拉取。

核心流程：

```text
固定筛选器 -> 候选股票 -> 新增/重复/移出变化 -> 单股分析 -> 技术面 -> Markdown 研究备忘录
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

## 下一阶段建议

- 加 Vercel Cron，每天自动扫描并保存结果。
- 接 Supabase/Postgres，记录历史候选池，而不是只用浏览器 localStorage。
- 接 Finviz Elite 官方导出/API，替换或补充当前的 FMP screener。
- 增加邮件/Telegram/飞书提醒，只推送“新增 + 多筛选器重叠 + 行业集中”的股票。
