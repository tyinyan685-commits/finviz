import { fmpGet, safeNumber } from "./_lib/fmp.js";
import { getPreset } from "./_lib/presets.js";
import { scoreStock } from "./_lib/scoring.js";

export default async function handler(request, response) {
  const preset = getPreset(request.query.preset);
  const limit = Number(request.query.limit || preset.fmpParams.limit || 60);

  try {
    const raw = await fmpGet("/company-screener", { ...preset.fmpParams, limit });
    const symbols = raw
      .map((row) => row.symbol)
      .filter(Boolean)
      .slice(0, limit)
      .join(",");

    const quotes = symbols ? await fmpGet("/quote", { symbol: symbols }) : [];
    const quoteMap = new Map(quotes.map((quote) => [quote.symbol, quote]));

    const stocks = raw.slice(0, limit).map((row) => {
      const quote = quoteMap.get(row.symbol) || {};
      const marketCap = safeNumber(quote.marketCap ?? row.marketCap);
      const volume = safeNumber(quote.volume ?? row.volume);
      const changesPercentage = safeNumber(quote.changesPercentage);
      const score = scoreStock({
        marketCap,
        volume,
        changesPercentage,
        pe: safeNumber(quote.pe),
        price: safeNumber(quote.price ?? row.price),
        eps: safeNumber(quote.eps)
      });

      return {
        symbol: row.symbol,
        name: quote.name ?? row.companyName ?? row.symbol,
        sector: row.sector ?? "Unknown",
        industry: row.industry ?? "Unknown",
        exchange: row.exchangeShortName ?? row.exchange ?? "",
        price: safeNumber(quote.price ?? row.price),
        change: safeNumber(quote.change),
        changesPercentage,
        volume,
        avgVolume: safeNumber(quote.avgVolume),
        marketCap,
        pe: safeNumber(quote.pe),
        eps: safeNumber(quote.eps),
        score: score.score,
        reasons: score.reasons,
        risks: score.risks
      };
    });

    stocks.sort((a, b) => b.score - a.score);
    response.status(200).json({ preset, generatedAt: new Date().toISOString(), stocks });
  } catch (error) {
    response.status(error.statusCode || 500).json({ error: error.message || "Unknown error" });
  }
}
