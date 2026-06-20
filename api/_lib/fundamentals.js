import { fmpGet, optional, safeNumber } from "./fmp.js";

const FUNDAMENTAL_CACHE_TTL_MS = 30 * 60 * 1000;
const fundamentalCache = new Map();

function first(value) {
  return Array.isArray(value) ? value[0] || {} : value || {};
}

function growth(current, prior) {
  if (current === null || prior === null || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

function ratio(numerator, denominator) {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

function peFromEarningsYield(value) {
  const earningsYield = safeNumber(value);
  if (earningsYield === null || earningsYield <= 0) return null;
  return 1 / earningsYield;
}

export async function loadFundamentals(symbol, marketCap = null) {
  const cached = fundamentalCache.get(symbol);
  if (cached && Date.now() - cached.createdAt < FUNDAMENTAL_CACHE_TTL_MS) {
    return cached.data;
  }

  const [metricsData, incomeData, balanceData, cashFlowData] = await Promise.all([
    optional(fmpGet("/key-metrics-ttm", { symbol }), []),
    optional(fmpGet("/income-statement", { symbol, period: "annual", limit: 3 }), []),
    optional(fmpGet("/balance-sheet-statement", { symbol, period: "annual", limit: 2 }), []),
    optional(fmpGet("/cash-flow-statement", { symbol, period: "annual", limit: 2 }), [])
  ]);

  const metrics = first(metricsData);
  const latestIncome = incomeData[0] || {};
  const priorIncome = incomeData[1] || {};
  const latestBalance = balanceData[0] || {};
  const latestCashFlow = cashFlowData[0] || {};
  const financialCurrency = latestIncome.reportedCurrency ?? latestCashFlow.reportedCurrency ?? null;

  const revenue = safeNumber(latestIncome.revenue);
  const priorRevenue = safeNumber(priorIncome.revenue);
  const netIncome = safeNumber(latestIncome.netIncome);
  const priorNetIncome = safeNumber(priorIncome.netIncome);
  const grossProfit = safeNumber(latestIncome.grossProfit);
  const operatingIncome = safeNumber(latestIncome.operatingIncome);
  const totalDebt = safeNumber(latestBalance.totalDebt);
  const totalEquity = safeNumber(latestBalance.totalStockholdersEquity);
  const freeCashFlow = safeNumber(latestCashFlow.freeCashFlow);
  const cap = safeNumber(marketCap ?? metrics.marketCap);
  const earningsYield = safeNumber(metrics.earningsYieldTTM);

  const data = {
    revenue,
    revenueGrowth: growth(revenue, priorRevenue),
    netIncome,
    netIncomeGrowth: growth(netIncome, priorNetIncome),
    grossMargin: ratio(grossProfit, revenue),
    operatingMargin: ratio(operatingIncome, revenue),
    freeCashFlow,
    freeCashFlowYield: financialCurrency === "USD" ? ratio(freeCashFlow, cap) : null,
    financialCurrency,
    totalDebt,
    debtToEquity: ratio(totalDebt, totalEquity),
    returnOnEquity: safeNumber(metrics.returnOnEquityTTM),
    returnOnInvestedCapital: safeNumber(metrics.returnOnInvestedCapitalTTM),
    evToEbitda: safeNumber(metrics.evToEBITDATTM),
    earningsYield,
    pe: peFromEarningsYield(earningsYield),
    incomeQuality: safeNumber(metrics.incomeQualityTTM)
  };

  data.observationCount = [
    data.revenue,
    data.netIncome,
    data.grossMargin,
    data.operatingMargin,
    data.freeCashFlow,
    data.returnOnEquity,
    data.returnOnInvestedCapital,
    data.pe
  ].filter((value) => value !== null).length;

  fundamentalCache.set(symbol, { createdAt: Date.now(), data });
  return data;
}

export async function enrichStocksWithFundamentals(stocks, maxCount = 40, concurrency = 6) {
  const selected = stocks.slice(0, maxCount);
  let cursor = 0;
  const enriched = new Map();

  async function worker() {
    while (cursor < selected.length) {
      const stock = selected[cursor];
      cursor += 1;
      const fundamentals = await optional(loadFundamentals(stock.symbol, stock.marketCap), null);
      if (fundamentals?.observationCount > 0) enriched.set(stock.symbol, fundamentals);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));

  return stocks.map((stock) => {
    const fundamentals = enriched.get(stock.symbol);
    if (!fundamentals) return stock;
    return {
      ...stock,
      ...fundamentals,
      fundamentalReady: fundamentals.observationCount > 0,
      fundamentalObservationCount: fundamentals.observationCount
    };
  });
}
