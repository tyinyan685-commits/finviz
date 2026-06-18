import { fmpGet, optional, safeNumber } from "./_lib/fmp.js";
import { scoreStock } from "./_lib/scoring.js";

function first(value) {
  return Array.isArray(value) ? value[0] || {} : value || {};
}

function peFromEarningsYield(value) {
  const earningsYield = safeNumber(value);
  if (earningsYield === null || earningsYield <= 0) return null;
  return 1 / earningsYield;
}

export default async function handler(request, response) {
  const symbol = String(request.query.symbol || "").toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Missing symbol" });

  try {
    const [profileData, quoteData, metricsData, incomeData, balanceData, cashFlowData, stockNewsData, pressReleaseData] =
      await Promise.all([
        optional(fmpGet("/profile", { symbol }), []),
        optional(fmpGet("/quote", { symbol }), []),
        optional(fmpGet("/key-metrics-ttm", { symbol }), []),
        optional(fmpGet("/income-statement", { symbol, period: "annual", limit: 4 }), []),
        optional(fmpGet("/balance-sheet-statement", { symbol, period: "annual", limit: 2 }), []),
        optional(fmpGet("/cash-flow-statement", { symbol, period: "annual", limit: 2 }), []),
        optional(fmpGet("/news/stock", { symbols: symbol, limit: 8 }), []),
        optional(fmpGet("/news/press-releases", { symbols: symbol, limit: 4 }), [])
      ]);

    const profile = first(profileData);
    const quote = first(quoteData);
    const metrics = first(metricsData);
    const latestIncome = incomeData[0] || {};
    const priorIncome = incomeData[1] || {};
    const latestBalance = balanceData[0] || {};
    const latestCashFlow = cashFlowData[0] || {};

    const revenue = safeNumber(latestIncome.revenue);
    const priorRevenue = safeNumber(priorIncome.revenue);
    const netIncome = safeNumber(latestIncome.netIncome);
    const priorNetIncome = safeNumber(priorIncome.netIncome);
    const grossProfit = safeNumber(latestIncome.grossProfit);
    const operatingIncome = safeNumber(latestIncome.operatingIncome);
    const totalDebt = safeNumber(latestBalance.totalDebt);
    const totalEquity = safeNumber(latestBalance.totalStockholdersEquity);
    const freeCashFlow = safeNumber(latestCashFlow.freeCashFlow);

    const revenueGrowth = revenue && priorRevenue ? (revenue - priorRevenue) / priorRevenue : null;
    const netIncomeGrowth =
      netIncome && priorNetIncome && priorNetIncome !== 0 ? (netIncome - priorNetIncome) / Math.abs(priorNetIncome) : null;
    const grossMargin = revenue && grossProfit ? grossProfit / revenue : null;
    const operatingMargin = revenue && operatingIncome ? operatingIncome / revenue : null;
    const debtToEquity = totalDebt && totalEquity ? totalDebt / totalEquity : null;
    const pe = safeNumber(quote.pe ?? metrics.peRatioTTM) ?? peFromEarningsYield(metrics.earningsYieldTTM);

    const score = scoreStock({
      marketCap: safeNumber(quote.marketCap ?? profile.mktCap),
      volume: safeNumber(quote.volume),
      changesPercentage: safeNumber(quote.changesPercentage ?? quote.changePercentage),
      pe,
      eps: safeNumber(quote.eps),
      revenueGrowth,
      netIncomeGrowth,
      grossMargin,
      operatingMargin,
      debtToEquity
    });

    const news = [...stockNewsData, ...pressReleaseData]
      .filter((item) => item && (item.title || item.text || item.url))
      .slice(0, 8);

    response.status(200).json({
      symbol,
      profile,
      quote,
      metrics,
      financials: {
        revenue,
        revenueGrowth,
        netIncome,
        netIncomeGrowth,
        grossMargin,
        operatingMargin,
        freeCashFlow,
        totalDebt,
        debtToEquity,
        pe
      },
      news,
      newsMeta: {
        source: "FMP stable news/stock + news/press-releases",
        count: news.length,
        emptyReason: news.length ? null : "FMP 当前没有返回该股票的新闻或新闻权限暂不可用。"
      },
      score
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}
