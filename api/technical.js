import { loadTechnical } from "./_lib/technical.js";

export default async function handler(request, response) {
  const symbol = String(request.query.symbol || "").toUpperCase();
  if (!symbol) return response.status(400).json({ error: "Missing symbol" });

  try {
    const technical = await loadTechnical(symbol);

    const signals = [
      technical.sma50 && technical.sma200 && technical.sma50 > technical.sma200 ? "50日均线高于200日均线，中期趋势偏强" : null,
      technical.sma20 && technical.latest && technical.latest > technical.sma20 ? "价格站上20日均线，短期动能尚可" : null,
      technical.rsi14 && technical.rsi14 > 70 ? "RSI 高于70，短期追高风险增加" : null,
      technical.rsi14 && technical.rsi14 < 35 ? "RSI 低于35，可能处于回调或超卖区" : null
    ].filter(Boolean);

    response.status(200).json({
      symbol,
      ...technical,
      signals,
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}
