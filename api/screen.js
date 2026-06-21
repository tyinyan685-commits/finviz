import { fmpGet, fmpV3Get, safeNumber } from "./_lib/fmp.js";
import { enrichStocksWithFundamentals } from "./_lib/fundamentals.js";
import { getPreset } from "./_lib/presets.js";
import { scoreStock } from "./_lib/scoring.js";
import { enrichStocksWithTechnical } from "./_lib/technical.js";

const NON_COMMON_STOCK_TERMS =
  /\b(etf|fund|trust|index|proshares|ishares|vanguard|spdr|invesco|direxion|yieldmax|warrant|rights|units|preferred|notes due|etn|bond)\b/i;
const NON_COMMON_SYMBOL_SUFFIX = /(\.W|\.WS|\.WT|\.U|-WS|-WT|-U)$/i;
const SCREEN_CACHE_TTL_MS = 5 * 60 * 1000;
const screenCache = new Map();

function today(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

function parseLimit(value, fallback) {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(100, Math.round(limit)));
}

function ratio(numerator, denominator) {
  return numerator && denominator ? numerator / denominator : null;
}

function pctValue(value) {
  const number = safeNumber(value);
  if (number === null) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function isCommonStock(row, quote) {
  const name = `${quote.name ?? row.companyName ?? ""} ${row.industry ?? ""}`;
  const symbol = String(row.symbol ?? quote.symbol ?? "");
  return !NON_COMMON_STOCK_TERMS.test(name) && !NON_COMMON_SYMBOL_SUFFIX.test(symbol);
}

function normalizeStock(row, quote = {}) {
  const marketCap = safeNumber(quote.marketCap ?? row.marketCap);
  const volume = safeNumber(quote.volume ?? row.volume);
  const avgVolume = safeNumber(quote.avgVolume);
  const changesPercentage = pctValue(quote.changesPercentage ?? quote.changePercentage);
  const price = safeNumber(quote.price ?? row.price);
  const pe = safeNumber(quote.pe);
  const eps = safeNumber(quote.eps);
  const priceAvg50 = safeNumber(quote.priceAvg50);
  const priceAvg200 = safeNumber(quote.priceAvg200);
  const relativeVolume = ratio(volume, avgVolume);
  const distance50 = price && priceAvg50 ? ((price - priceAvg50) / priceAvg50) * 100 : null;
  const distance200 = price && priceAvg200 ? ((price - priceAvg200) / priceAvg200) * 100 : null;

  return {
    symbol: row.symbol ?? quote.symbol,
    name: quote.name ?? row.companyName ?? row.symbol ?? quote.symbol,
    sector: row.sector ?? "Unknown",
    industry: row.industry ?? "Unknown",
    exchange: row.exchangeShortName ?? row.exchange ?? quote.exchange ?? "",
    price,
    change: safeNumber(quote.change),
    changesPercentage,
    volume,
    avgVolume,
    relativeVolume,
    marketCap,
    pe,
    eps,
    priceAvg50,
    priceAvg200,
    distance50,
    distance200,
    earningsDate: row.earningsDate ?? quote.earningsAnnouncement ?? null
  };
}

function strategyScore(presetId, stock) {
  const change = stock.changesPercentage ?? 0;
  const relVol = stock.relativeVolume ?? 1;
  const marketCapBonus = Math.min(12, Math.log10(Math.max(stock.marketCap ?? 1, 1_000_000_000)) - 8);
  const volumeBonus = Math.min(12, Math.max(0, Math.log10(Math.max(stock.volume ?? 1, 1)) - 5));

  if (presetId === "momentum_breakout") {
    return (
      35 +
      Math.min(22, Math.max(0, stock.change20d ?? change) * 0.7) +
      Math.min(8, Math.max(0, stock.change5d ?? 0) * 0.8) +
      Math.min(14, Math.max(0, relVol - 1) * 7) +
      Math.min(8, volumeBonus) +
      ((stock.distanceFromHigh52Week ?? -100) > -8 ? 8 : 0) +
      ((stock.distance50 ?? 0) > 0 ? 7 : -7) +
      ((stock.distance200 ?? 0) > 0 ? 7 : -7) +
      marketCapBonus
    );
  }

  if (presetId === "quality_growth") {
    return (
      24 +
      Math.min(14, Math.max(0, stock.revenueGrowth ?? 0) * 50) +
      Math.min(12, Math.max(0, stock.netIncomeGrowth ?? 0) * 35) +
      Math.min(12, Math.max(0, stock.operatingMargin ?? 0) * 25) +
      Math.min(10, Math.max(0, stock.freeCashFlowYield ?? 0) * 250) +
      Math.min(12, Math.max(0, stock.returnOnInvestedCapital ?? stock.returnOnEquity ?? 0) * 30) +
      Math.min(6, Math.max(0, stock.earningsYield ?? 0) * 120) +
      (stock.eps && stock.eps > 0 ? 6 : 0) +
      (stock.evToEbitda && stock.evToEbitda > 0 && stock.evToEbitda < 18 ? 6 : 0) +
      (stock.evToEbitda && stock.evToEbitda >= 18 && stock.evToEbitda < 30 ? 3 : 0) +
      (stock.debtToEquity !== null && stock.debtToEquity < 0.5 ? 4 : 0) +
      (stock.debtToEquity && stock.debtToEquity > 2 ? -8 : 0) +
      ((stock.distance200 ?? 0) > 0 ? 6 : -4) +
      ((stock.distance50 ?? 0) > 0 ? 3 : 0) +
      marketCapBonus
    );
  }

  if (presetId === "pullback_watch") {
    const pullbackSweetSpot = stock.distance50 !== null && stock.distance50 > -8 && stock.distance50 < 3 ? 18 : 0;
    return (
      55 +
      ((stock.distance200 ?? -999) > 0 ? 15 : -18) +
      pullbackSweetSpot +
      (stock.rsi14 && stock.rsi14 < 55 ? 8 : 0) +
      (change < 0 ? 10 : 0) -
      Math.max(0, change) * 2 +
      marketCapBonus
    );
  }

  if (presetId === "unusual_volume") {
    return (
      38 +
      Math.min(35, Math.max(0, relVol - 1) * 18) +
      Math.min(8, volumeBonus) +
      Math.min(16, Math.abs(change) * 2) +
      Math.min(10, Math.abs(stock.change5d ?? 0) * 1.5) +
      (stock.volume && stock.volume > 2_000_000 ? 8 : 0) +
      marketCapBonus
    );
  }

  if (presetId === "earnings_watch") {
    return 50 + (stock.earningsDate ? 18 : 0) + Math.min(12, Math.abs(change) * 2) + marketCapBonus;
  }

  return scoreStock(stock).score;
}

function strategyReasons(presetId, stock) {
  const reasons = [];
  const risks = [];
  if (stock.relativeVolume && stock.relativeVolume > 1.3) reasons.push(`相对成交量 ${stock.relativeVolume.toFixed(1)}x`);
  if (stock.changesPercentage && stock.changesPercentage > 2) reasons.push(`当日涨幅 ${stock.changesPercentage.toFixed(1)}%`);
  if (stock.change20d && stock.change20d > 8) reasons.push(`20日涨幅 ${stock.change20d.toFixed(1)}%`);
  if (stock.distance50 !== null && stock.distance50 > 0) reasons.push("价格在50日均线上方");
  if (stock.distance200 !== null && stock.distance200 > 0) reasons.push("价格在200日均线上方");
  if (stock.distanceFromHigh52Week !== null && stock.distanceFromHigh52Week > -8) reasons.push("接近52周高点");
  if (stock.eps && stock.eps > 0) reasons.push("EPS 为正");
  if (stock.revenueGrowth !== null && stock.revenueGrowth > 0.08) reasons.push(`收入增长 ${(stock.revenueGrowth * 100).toFixed(1)}%`);
  if (stock.operatingMargin !== null && stock.operatingMargin > 0.15) reasons.push(`经营利润率 ${(stock.operatingMargin * 100).toFixed(1)}%`);
  if (stock.freeCashFlowYield !== null && stock.freeCashFlowYield > 0.03) reasons.push(`自由现金流收益率 ${(stock.freeCashFlowYield * 100).toFixed(1)}%`);
  if (stock.returnOnInvestedCapital !== null && stock.returnOnInvestedCapital > 0.12) {
    reasons.push(`ROIC ${(stock.returnOnInvestedCapital * 100).toFixed(1)}%`);
  }
  if (stock.pe && stock.pe > 0 && stock.pe < 45) reasons.push("PE 未明显极端");
  if (stock.earningsDate) reasons.push(`财报日 ${String(stock.earningsDate).slice(0, 10)}`);

  if (presetId === "pullback_watch" && stock.distance50 !== null && stock.distance50 < 0) reasons.push("短期回到50日线下方，适合观察而非追高");
  if (presetId === "unusual_volume" && (!stock.relativeVolume || stock.relativeVolume < 1.2)) risks.push("平均成交量数据不足，放量信号需要人工复核");
  if (stock.pe && stock.pe > 80) risks.push("估值偏高，容错率较低");
  if (stock.revenueGrowth !== null && stock.revenueGrowth < 0) risks.push("收入同比下滑");
  if (stock.freeCashFlow !== null && stock.freeCashFlow < 0) risks.push("自由现金流为负");
  if (stock.debtToEquity !== null && stock.debtToEquity > 2) risks.push("债务/权益偏高");
  if (stock.changesPercentage && stock.changesPercentage > 8) risks.push("短线涨幅较大，追高风险增加");
  if (stock.marketCap && stock.marketCap < 1_000_000_000) risks.push("市值较小，波动和流动性风险更高");

  return {
    reasons: reasons.length ? reasons : ["进入该雷达候选池，需要继续用财报和新闻验证"],
    risks: risks.length ? risks : ["主要风险需要从财报、估值和新闻中继续验证"]
  };
}

function applyPresetFilter(presetId, stocks) {
  if (presetId === "momentum_breakout") {
    return stocks.filter(
      (stock) =>
        stock.technicalReady === true &&
        (stock.marketCap ?? 0) < 500_000_000_000 &&
        (stock.volume ?? 0) > 500_000 &&
        (stock.price ?? 0) > 10 &&
        stock.change20d !== null && stock.change20d > 0 &&
        stock.sma20Distance !== null && stock.sma20Distance > 0 &&
        stock.distance50 !== null && stock.distance50 > 0 &&
        stock.distance200 !== null && stock.distance200 > 0
    );
  }
  if (presetId === "quality_growth") {
    return stocks.filter(
      (stock) =>
        stock.fundamentalReady === true &&
        (stock.marketCap ?? 0) > 10_000_000_000 &&
        stock.netIncome !== null && stock.netIncome > 0 &&
        stock.revenueGrowth !== null && stock.revenueGrowth > 0.1 &&
        stock.netIncomeGrowth !== null && stock.netIncomeGrowth > 0 &&
        (stock.returnOnInvestedCapital > 0.1 || stock.returnOnEquity > 0.15) &&
        stock.freeCashFlow !== null && stock.freeCashFlow > 0 &&
        stock.pe !== null && stock.pe > 5 && stock.pe < 80
    );
  }
  if (presetId === "pullback_watch") {
    return stocks.filter(
      (stock) =>
        stock.technicalReady === true &&
        (stock.marketCap ?? 0) < 800_000_000_000 &&
        (stock.marketCap ?? 0) > 10_000_000_000 &&
        stock.distance200 !== null && stock.distance200 > 0 &&
        stock.distance50 !== null && stock.distance50 > -12 && stock.distance50 < 5 &&
        stock.rsi14 !== null && stock.rsi14 < 60
    );
  }
  if (presetId === "unusual_volume") {
    return stocks.filter(
      (stock) =>
        stock.technicalReady === true &&
        (stock.marketCap ?? 0) < 50_000_000_000 &&
        (stock.volume ?? 0) > 1_000_000 &&
        stock.relativeVolume !== null && stock.relativeVolume > 1.15
    );
  }
  if (presetId === "earnings_watch") {
    return stocks.filter((stock) => stock.earningsDate && (stock.marketCap ?? 0) < 300_000_000_000);
  }
  return stocks;
}

function prefilterBeforeTechnical(presetId, stocks) {
  if (presetId === "momentum_breakout") {
    return stocks.filter(
      (stock) => (stock.marketCap ?? 0) < 500_000_000_000 && (stock.volume ?? 0) > 500_000 && (stock.price ?? 0) > 10
    );
  }
  if (presetId === "quality_growth") {
    return stocks.filter((stock) => (stock.marketCap ?? 0) > 10_000_000_000 && (stock.volume ?? 0) > 300_000);
  }
  if (presetId === "pullback_watch") {
    return stocks.filter(
      (stock) =>
        (stock.marketCap ?? 0) < 800_000_000_000 &&
        (stock.marketCap ?? 0) > 10_000_000_000 &&
        (stock.volume ?? 0) > 800_000
    );
  }
  if (presetId === "unusual_volume") {
    return stocks
      .filter(
        (stock) =>
          (stock.marketCap ?? 0) < 50_000_000_000 &&
          (stock.marketCap ?? 0) > 500_000_000 &&
          (stock.volume ?? 0) > 1_000_000 &&
          (stock.price ?? 0) > 5
      )
      .sort((a, b) => (b.relativeVolume ?? 0) - (a.relativeVolume ?? 0));
  }
  if (presetId === "earnings_watch") {
    return stocks.filter((stock) => (stock.marketCap ?? 0) < 300_000_000_000);
  }
  return stocks;
}

function technicalLimitForPreset(presetId, limit) {
  const requested = Math.max(20, limit * 2);
  if (presetId === "quality_growth") return Math.min(40, requested);
  if (presetId === "unusual_volume") return Math.min(120, Math.max(90, requested));
  return Math.min(70, requested);
}

function fundamentalLimitForScreen(limit) {
  return Math.min(40, Math.max(12, limit * 2));
}

function cacheKey(presetId, limit) {
  return `${presetId}:${limit}`;
}

function getCachedScreen(key) {
  const cached = screenCache.get(key);
  if (!cached || Date.now() - cached.createdAt > SCREEN_CACHE_TTL_MS) return null;
  return {
    ...cached.data,
    dataQuality: {
      ...cached.data.dataQuality,
      cached: true,
      cacheAgeSeconds: Math.round((Date.now() - cached.createdAt) / 1000)
    }
  };
}

function setCachedScreen(key, data) {
  screenCache.set(key, { createdAt: Date.now(), data });
}

async function quoteSymbols(symbols) {
  if (!symbols.length) return [];
  const chunks = [];
  for (let index = 0; index < symbols.length; index += 40) {
    chunks.push(symbols.slice(index, index + 40));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const symbolList = chunk.join(",");
      try {
        const batch = await fmpGet("/batch-quote", { symbols: symbolList });
        if (Array.isArray(batch) && batch.length) return batch;
      } catch {}
      try {
        const legacy = await fmpV3Get(`/quote/${symbolList}`);
        if (Array.isArray(legacy) && legacy.length) return legacy;
      } catch {}
      try {
        const stable = await fmpGet("/quote", { symbol: symbolList });
        return Array.isArray(stable) ? stable : [];
      } catch {
        return [];
      }
    })
  );
  return results.flat();
}

async function loadEarningsWatch(limit) {
  const from = today(0);
  const to = today(21);
  let calendar = [];
  let source = "FMP stable earnings-calendar";
  const errors = [];
  try {
    calendar = await fmpGet("/earnings-calendar", { from, to });
  } catch (error) {
    errors.push(`stable: ${error.message}`);
  }
  if (!Array.isArray(calendar) || !calendar.length) {
    source = "FMP v3 earning_calendar";
    try {
      calendar = await fmpV3Get("/earning_calendar", { from, to });
    } catch (error) {
      errors.push(`v3: ${error.message}`);
      calendar = [];
    }
  }
  calendar = Array.isArray(calendar) ? calendar : [];
  const symbols = [...new Set(calendar.map((row) => row.symbol).filter(Boolean))];
  const calendarBySymbol = new Map(calendar.map((row) => [String(row.symbol || "").toUpperCase(), row]));
  let screenerRows = [];
  try {
    screenerRows = await fmpGet("/company-screener", {
      marketCapMoreThan: 2_000_000_000,
      marketCapLowerThan: 300_000_000_000,
      volumeMoreThan: 500_000,
      priceMoreThan: 10,
      isActivelyTrading: true,
      limit: 10_000
    });
  } catch (error) {
    errors.push(`screener: ${error.message}`);
  }
  screenerRows = Array.isArray(screenerRows) ? screenerRows : [];
  const matchedRows = screenerRows.filter((row) => calendarBySymbol.has(String(row.symbol || "").toUpperCase()));
  const stocks = matchedRows
    .map((row) => {
      const event = calendarBySymbol.get(String(row.symbol || "").toUpperCase());
      return normalizeStock({ ...row, earningsDate: event?.date || null });
    })
    .filter(
      (stock) =>
        stock.symbol &&
        stock.earningsDate &&
        isCommonStock({}, stock) &&
        (stock.price ?? 0) > 10 &&
        (stock.volume === null || stock.volume > 500_000) &&
        (stock.marketCap ?? 0) > 2_000_000_000 &&
        (stock.marketCap ?? 0) < 300_000_000_000
    );
  return {
    stocks,
    meta: {
      from,
      to,
      source,
      calendarRows: calendar.length,
      calendarSymbols: symbols.length,
      sampleSymbols: symbols.slice(0, 8),
      screenerRows: screenerRows.length,
      calendarMatches: matchedRows.length,
      errors
    }
  };
}

export async function runScreen({ presetId, limit: requestedLimit, refresh = false } = {}) {
  const preset = getPreset(presetId);
  const limit = parseLimit(requestedLimit, preset.fmpParams.limit || 60);
  const rawLimit = preset.id === "unusual_volume" ? 500 : Math.max(limit * 6, 300);
  const key = cacheKey(preset.id, limit);

  if (!refresh) {
    const cached = getCachedScreen(key);
    if (cached) {
      return { payload: cached, cacheStatus: "HIT" };
    }
  }

  let raw = preset.id === "earnings_watch"
    ? []
    : await fmpGet("/company-screener", {
      ...preset.fmpParams,
      limit: rawLimit
    });
  const symbols = [...new Set(raw.map((row) => row.symbol).filter(Boolean))];
  const quotes = await quoteSymbols(symbols);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

  let baseStocks = raw
    .map((row) => normalizeStock(row, quoteMap.get(row.symbol)))
    .filter((stock) => stock.symbol && stock.price && isCommonStock(rowFromStock(stock), stock));

  let earningsMeta = null;
  if (preset.id === "earnings_watch") {
    const earningsResult = await loadEarningsWatch(limit);
    baseStocks = earningsResult.stocks;
    earningsMeta = earningsResult.meta;
  }

  const prefilteredStocks = prefilterBeforeTechnical(preset.id, baseStocks);
  if (preset.id !== "earnings_watch") {
    baseStocks = await enrichStocksWithTechnical(
      prefilteredStocks.length ? prefilteredStocks : baseStocks,
      technicalLimitForPreset(preset.id, limit),
      8
    );
  }
  if (preset.id === "quality_growth") {
    baseStocks = await enrichStocksWithFundamentals(baseStocks, fundamentalLimitForScreen(limit), 6);
  }

  let filteredStocks = applyPresetFilter(preset.id, baseStocks);

  const stocks = filteredStocks
    .map((stock) => {
      const strategy = strategyReasons(preset.id, stock);
      return {
        ...stock,
        score: Math.max(0, Math.min(100, Math.round(strategyScore(preset.id, stock)))),
        reasons: strategy.reasons,
        risks: strategy.risks
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const technicalReadyCount = baseStocks.filter((stock) => stock.technicalReady).length;
  const emptyReason = stocks.length
    ? null
    : preset.id === "earnings_watch"
      ? earningsMeta?.calendarRows
        ? `未来21天日历返回 ${earningsMeta.calendarRows} 条，但没有股票同时满足价格、成交量和市值条件。`
        : earningsMeta?.errors?.length
          ? `FMP 财报日历暂不可用：${earningsMeta.errors.join("；")}`
          : "FMP 在未来21天没有返回符合条件的财报事件；未使用普通股票补位。"
      : preset.id === "unusual_volume"
        ? `基础池 ${raw.length} 只，市值/流动性预筛 ${prefilteredStocks.length} 只，取得真实技术数据 ${technicalReadyCount} 只；本次没有股票满足 RVOL > 1.15。`
        : "本次没有股票满足该雷达的全部必需条件。";

  const payload = {
    preset,
    generatedAt: new Date().toISOString(),
    dataQuality: {
      technicalReady: stocks.filter((stock) => stock.technicalReady).length,
      technicalApplicable: preset.id !== "earnings_watch",
      fundamentalReady: stocks.filter((stock) => stock.fundamentalReady).length,
      total: stocks.length,
      pipeline: {
        raw: raw.length,
        prefiltered: prefilteredStocks.length,
        technicalReady: technicalReadyCount,
        matched: stocks.length,
        earnings: earningsMeta
      },
      emptyReason,
      cached: false,
      cacheTtlSeconds: Math.round(SCREEN_CACHE_TTL_MS / 1000),
      note: "仅展示满足全部必需条件的股票；技术指标来自 FMP 历史价格自行计算（至少50条有效收盘价），基本面来自 FMP key metrics 和年度财报。缺失数据不会按命中处理。"
    },
    stocks
  };

  setCachedScreen(key, payload);
  return { payload, cacheStatus: "MISS" };
}

export default async function handler(request, response) {
  try {
    const { payload, cacheStatus } = await runScreen({
      presetId: request.query.preset,
      limit: request.query.limit,
      refresh: request.query.refresh === "1"
    });
    response.setHeader("X-Investment-Radar-Cache", cacheStatus);
    response.status(200).json(payload);
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}

function rowFromStock(stock) {
  return {
    symbol: stock.symbol,
    companyName: stock.name,
    industry: stock.industry
  };
}
