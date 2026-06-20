import { fmpGet, fmpV3Get, optional, safeNumber } from "./fmp.js";

function sma(values, period) {
  if (values.length < period) return null;
  return values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = 0; index < period; index += 1) {
    const diff = values[index] - values[index + 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function pctChange(current, prior) {
  return current && prior ? ((current - prior) / prior) * 100 : null;
}

function distance(current, average) {
  return current && average ? ((current - average) / average) * 100 : null;
}

export async function loadPrices(symbol, days = 370) {
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const stable = await optional(fmpGet("/historical-price-eod/light", { symbol, from, to }), null);
  if (Array.isArray(stable) && stable.length) return stable;

  const legacy = await optional(fmpV3Get(`/historical-price-full/${symbol}`, { timeseries: 260 }), {});
  return legacy.historical || [];
}

export function calculateTechnical(prices) {
  const rows = prices
    .map((row) => ({
      ...row,
      close: safeNumber(row.close ?? row.price ?? row.adjClose)
    }))
    .filter((row) => row.close !== null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const closes = rows.map((row) => Number(row.close));
  const volumes = rows.map((row) => safeNumber(row.volume)).filter((value) => value !== null);
  const latest = closes[0] ?? null;
  const latestVolume = volumes[0] ?? null;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const avgVolume20 = sma(volumes, 20);
  const high52Week = closes.length ? Math.max(...closes.slice(0, Math.min(252, closes.length))) : null;

  return {
    observationCount: rows.length,
    latest: safeNumber(latest),
    sma20,
    sma50,
    sma200,
    sma20Distance: distance(latest, sma20),
    sma50Distance: distance(latest, sma50),
    sma200Distance: distance(latest, sma200),
    rsi14: rsi(closes, 14),
    change1d: pctChange(closes[0], closes[1]),
    change5d: pctChange(closes[0], closes[5]),
    change20d: pctChange(closes[0], closes[20]),
    change60d: pctChange(closes[0], closes[60]),
    avgVolume20,
    relativeVolume20: latestVolume && avgVolume20 ? latestVolume / avgVolume20 : null,
    high52Week,
    distanceFromHigh52Week: distance(latest, high52Week),
    history: rows.slice(0, 90).reverse()
  };
}

export async function loadTechnical(symbol) {
  return calculateTechnical(await loadPrices(symbol));
}

export async function enrichStocksWithTechnical(stocks, maxCount = 50, concurrency = 8) {
  const selected = stocks.slice(0, maxCount);
  let cursor = 0;
  const enriched = new Map();

  async function worker() {
    while (cursor < selected.length) {
      const stock = selected[cursor];
      cursor += 1;
      const technical = await optional(loadTechnical(stock.symbol), null);
      if (technical?.observationCount >= 50) enriched.set(stock.symbol, technical);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));

  return stocks.map((stock) => {
    const technical = enriched.get(stock.symbol);
    if (!technical) return stock;
    return {
      ...stock,
      price: technical.latest ?? stock.price,
      changesPercentage: technical.change1d ?? stock.changesPercentage,
      avgVolume: technical.avgVolume20 ?? stock.avgVolume,
      relativeVolume: technical.relativeVolume20 ?? stock.relativeVolume,
      priceAvg50: technical.sma50 ?? stock.priceAvg50,
      priceAvg200: technical.sma200 ?? stock.priceAvg200,
      distance50: technical.sma50Distance ?? stock.distance50,
      distance200: technical.sma200Distance ?? stock.distance200,
      sma20Distance: technical.sma20Distance,
      rsi14: technical.rsi14,
      change5d: technical.change5d,
      change20d: technical.change20d,
      change60d: technical.change60d,
      distanceFromHigh52Week: technical.distanceFromHigh52Week,
      technicalReady: technical.observationCount >= 50,
      technicalObservationCount: technical.observationCount
    };
  });
}
