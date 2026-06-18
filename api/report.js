function pct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${(number * 100).toFixed(1)}%`;
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000_000) return `$${(number / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
  return `$${number.toFixed(0)}`;
}

function formatNumber(value, digits = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "n/a";
}

export default async function handler(request, response) {
  const symbol = String(request.query.symbol || "").toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Missing symbol" });

  try {
    const host = request.headers.host;
    const protocol = host?.includes("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;
    const [analysisResponse, technicalResponse] = await Promise.all([
      fetch(`${base}/api/analyze?symbol=${symbol}`),
      fetch(`${base}/api/technical?symbol=${symbol}`)
    ]);
    const analysis = await analysisResponse.json();
    const technical = await technicalResponse.json();
    if (analysis.error) throw new Error(analysis.error);

    const news = Array.isArray(analysis.news) ? analysis.news : [];
    const report = `# ${symbol} 投资研究备忘录

> 这是一份研究备忘录，不是买卖建议。它的作用是帮你决定是否值得继续深挖。

## 一句话结论

${symbol} 当前研究优先级为 **${analysis.score?.score ?? "n/a"}/100**。主要理由：${
      analysis.score?.reasons?.join("；") || "需要更多数据验证"
    }。

## 为什么值得看

- 公司：${analysis.profile?.companyName || analysis.quote?.name || symbol}
- 行业：${analysis.profile?.sector || "n/a"} / ${analysis.profile?.industry || "n/a"}
- 市值：${money(analysis.quote?.marketCap || analysis.profile?.mktCap)}
- PE：${formatNumber(analysis.financials?.pe ?? analysis.quote?.pe ?? analysis.metrics?.peRatioTTM)}

## 财务质量

- 最近年度收入：${money(analysis.financials?.revenue)}
- 收入增长：${pct(analysis.financials?.revenueGrowth)}
- 净利润增长：${pct(analysis.financials?.netIncomeGrowth)}
- 毛利率：${pct(analysis.financials?.grossMargin)}
- 经营利润率：${pct(analysis.financials?.operatingMargin)}
- 自由现金流：${money(analysis.financials?.freeCashFlow)}
- 债务/权益：${analysis.financials?.debtToEquity?.toFixed?.(2) || "n/a"}

## 技术面位置

- 最新价格：${technical.latest || "n/a"}
- 20日均线距离：${technical.sma20Distance?.toFixed?.(1) || "n/a"}%
- 50日均线距离：${technical.sma50Distance?.toFixed?.(1) || "n/a"}%
- 200日均线距离：${technical.sma200Distance?.toFixed?.(1) || "n/a"}%
- RSI(14)：${technical.rsi14?.toFixed?.(1) || "n/a"}
- 信号：${technical.signals?.join("；") || "暂无明确技术信号"}

## 近期新闻线索

${news
  .slice(0, 5)
  .map((item) => `- ${item.publishedDate || ""} ${item.title || "Untitled"} ${item.url || ""}`)
  .join("\n")}

## 主要风险

${(analysis.score?.risks || ["需要继续验证估值、竞争、财报质量和事件风险"])
  .map((risk) => `- ${risk}`)
  .join("\n")}

## 下一步验证

- 看最近一份 10-Q / 10-K，确认收入增长是否来自主营业务而非一次性因素。
- 看管理层电话会，确认需求、库存、毛利率和资本开支趋势。
- 对比同业估值，判断当前价格是否已经透支乐观预期。
- 若来自 Finviz 异常放量池，必须找到放量背后的新闻、财报或资金逻辑。
`;

    response.setHeader("content-type", "text/markdown; charset=utf-8");
    response.status(200).send(report);
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}
