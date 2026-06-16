import { fmpGet, fmpV3Get, safeNumber } from "./_lib/fmp.js";

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

async function loadPrices(symbol) {
  try {
    return await fmpGet("/historical-price-eod/light", {
      symbol,
      from: new Date(Date.now() - 370 * 86400000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10)
    });
  } catch {
    const legacy = await fmpV3Get(`/historical-price-full/${symbol}`, { timeseries: 260 });
    return legacy.historical || [];
  }
}

export default async function handler(request, response) {
  const symbol = String(request.query.symbol || "").toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Missing symbol" });

  try {
    const prices = (await loadPrices(symbol))
      .filter((row) => row.close)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const closes = prices.map((row) => Number(row.close));
    const latest = closes[0] ?? null;
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const distance = (average) => (latest && average ? ((latest - average) / average) * 100 : null);

    const signals = [
      sma50 && sma200 && sma50 > sma200 ? "50日均线高于200日均线，中期趋势偏强" : null,
      sma20 && latest && latest > sma20 ? "价格站上20日均线，短期动能尚可" : null,
      rsi14 && rsi14 > 70 ? "RSI 高于70，短期追高风险增加" : null,
      rsi14 && rsi14 < 35 ? "RSI 低于35，可能处于回调或超卖区" : null
    ].filter(Boolean);

    response.status(200).json({
      symbol,
      latest: safeNumber(latest),
      sma20,
      sma50,
      sma200,
      sma20Distance: distance(sma20),
      sma50Distance: distance(sma50),
      sma200Distance: distance(sma200),
      rsi14,
      signals,
      history: prices.slice(0, 90).reverse()
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}
