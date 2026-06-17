import { fmpGet, fmpV3Get, optional, safeNumber } from "./_lib/fmp.js";
import { getPreset } from "./_lib/presets.js";
import { scoreStock } from "./_lib/scoring.js";
import { enrichStocksWithTechnical } from "./_lib/technical.js";

const ETFS_AND_FUNDS = /\b(etf|fund|trust|index|proshares|ishares|vanguard|spdr|invesco|direxion|ark |yieldmax)\b/i;

function today(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
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
  return !ETFS_AND_FUNDS.test(name);
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
      45 +
      Math.min(25, Math.max(0, stock.change20d ?? change) * 1.3) +
      Math.min(10, Math.max(0, stock.change5d ?? 0) * 2) +
      Math.min(18, Math.max(0, relVol - 1) * 8) +
      volumeBonus +
      ((stock.distanceFromHigh52Week ?? -100) > -8 ? 10 : 0) +
      ((stock.distance50 ?? 0) > 0 ? 8 : -8) +
      ((stock.distance200 ?? 0) > 0 ? 8 : -8) +
      marketCapBonus
    );
  }

  if (presetId === "quality_growth") {
    return (
      45 +
      (stock.eps && stock.eps > 0 ? 18 : -12) +
      (stock.pe && stock.pe > 8 && stock.pe < 45 ? 16 : 0) +
      (stock.pe && stock.pe >= 45 && stock.pe < 80 ? 4 : 0) +
      ((stock.distance200 ?? 0) > 0 ? 8 : 0) +
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
      volumeBonus +
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
  if (stock.pe && stock.pe > 0 && stock.pe < 45) reasons.push("PE 未明显极端");
  if (stock.earningsDate) reasons.push(`财报日 ${String(stock.earningsDate).slice(0, 10)}`);

  if (presetId === "pullback_watch" && stock.distance50 !== null && stock.distance50 < 0) reasons.push("短期回到50日线下方，适合观察而非追高");
  if (presetId === "unusual_volume" && (!stock.relativeVolume || stock.relativeVolume < 1.2)) risks.push("平均成交量数据不足，放量信号需要人工复核");
  if (stock.pe && stock.pe > 80) risks.push("估值偏高，容错率较低");
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
        (stock.marketCap ?? 0) < 500_000_000_000 &&
        (stock.volume ?? 0) > 500_000 &&
        (stock.price ?? 0) > 10 &&
        (stock.change20d === null || stock.change20d > 0) &&
        (stock.distance50 === null || stock.distance50 > 0) &&
        (stock.distance200 === null || stock.distance200 > 0)
    );
  }
  if (presetId === "quality_growth") {
    return stocks.filter(
      (stock) =>
        (stock.marketCap ?? 0) > 10_000_000_000 &&
        (stock.eps === null || stock.eps > 0) &&
        (!stock.pe || (stock.pe > 5 && stock.pe < 80))
    );
  }
  if (presetId === "pullback_watch") {
    return stocks.filter(
      (stock) =>
        (stock.marketCap ?? 0) < 800_000_000_000 &&
        (stock.marketCap ?? 0) > 10_000_000_000 &&
        (stock.distance200 === null || stock.distance200 > 0) &&
        (stock.distance50 === null || (stock.distance50 > -12 && stock.distance50 < 5)) &&
        (stock.rsi14 === null || stock.rsi14 < 65)
    );
  }
  if (presetId === "unusual_volume") {
    return stocks.filter(
      (stock) =>
        (stock.marketCap ?? 0) < 50_000_000_000 &&
        (stock.volume ?? 0) > 1_000_000 &&
        (stock.relativeVolume === null || stock.relativeVolume > 1.15 || Math.abs(stock.change5d ?? stock.changesPercentage ?? 0) > 4)
    );
  }
  if (presetId === "earnings_watch") {
    return stocks.filter((stock) => (stock.marketCap ?? 0) < 300_000_000_000);
  }
  return stocks;
}

async function quoteSymbols(symbols) {
  if (!symbols.length) return [];
  const chunks = [];
  for (let index = 0; index < symbols.length; index += 80) {
    chunks.push(symbols.slice(index, index + 80));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const symbolList = chunk.join(",");
      try {
        return await fmpV3Get(`/quote/${symbolList}`);
      } catch {
        return fmpGet("/quote", { symbol: symbolList });
      }
    })
  );
  return results.flat();
}

async function loadEarningsWatch(limit) {
  const calendar = await optional(
    fmpGet("/earnings-calendar", {
      from: today(0),
      to: today(14)
    }),
    []
  );
  const symbols = [...new Set(calendar.map((row) => row.symbol).filter(Boolean))].slice(0, Math.max(limit * 4, 120));
  const quotes = await quoteSymbols(symbols);
  const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));
  return calendar
    .map((row) => normalizeStock({ symbol: row.symbol, earningsDate: row.date }, quoteMap.get(row.symbol)))
    .filter((stock) => stock.symbol && stock.price && stock.marketCap && stock.marketCap > 500_000_000);
}

export default async function handler(request, response) {
  const preset = getPreset(request.query.preset);
  const limit = Number(request.query.limit || preset.fmpParams.limit || 60);
  const rawLimit = preset.id === "unusual_volume" ? 500 : Math.max(limit * 6, 300);

  try {
    let raw =
      preset.id === "earnings_watch"
        ? []
        : await fmpGet("/company-screener", {
            ...preset.fmpParams,
            limit: rawLimit
          });
    if (preset.id === "earnings_watch") {
      raw = await fmpGet("/company-screener", {
        ...preset.fmpParams,
        limit: rawLimit
      });
    }
    const symbols = [...new Set(raw.map((row) => row.symbol).filter(Boolean))];
    const quotes = await quoteSymbols(symbols);
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

    let baseStocks = raw
      .map((row) => normalizeStock(row, quoteMap.get(row.symbol)))
      .filter((stock) => stock.symbol && stock.price && isCommonStock(rowFromStock(stock), stock));

    if (preset.id === "earnings_watch") {
      const earningsStocks = await loadEarningsWatch(limit);
      if (earningsStocks.length) baseStocks = earningsStocks;
    }

    baseStocks = await enrichStocksWithTechnical(baseStocks, preset.id === "quality_growth" ? 35 : 60, 8);

    let filteredStocks = applyPresetFilter(preset.id, baseStocks);
    if (preset.id === "unusual_volume" && !filteredStocks.length) {
      filteredStocks = baseStocks.filter((stock) => (stock.marketCap ?? 0) < 300_000_000_000 && (stock.volume ?? 0) > 1_000_000);
    }
    if (!filteredStocks.length) filteredStocks = baseStocks;

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

    response.status(200).json({ preset, generatedAt: new Date().toISOString(), stocks });
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
