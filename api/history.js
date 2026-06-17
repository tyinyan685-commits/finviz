import { supabaseRequest } from "./_lib/supabase.js";

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function avg(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function summarize(rows) {
  const bySymbol = new Map();
  rows.forEach((row) => {
    const current = bySymbol.get(row.symbol) || {
      symbol: row.symbol,
      name: row.name,
      sector: row.sector,
      industry: row.industry,
      exchange: row.exchange,
      firstDate: row.run_date,
      latestDate: row.run_date,
      appearances: 0,
      presetIds: new Set(),
      presetDates: new Map(),
      scores: [],
      latest: row
    };

    current.appearances += 1;
    current.presetIds.add(row.preset_id);
    current.presetDates.set(row.preset_id, row.run_date);
    if (Number.isFinite(Number(row.score))) current.scores.push(Number(row.score));
    if (row.run_date < current.firstDate) current.firstDate = row.run_date;
    if (row.run_date >= current.latestDate) {
      current.latestDate = row.run_date;
      current.latest = row;
    }
    bySymbol.set(row.symbol, current);
  });

  return Array.from(bySymbol.values())
    .map((item) => {
      const presetIds = Array.from(item.presetIds).sort();
      const averageScore = avg(item.scores);
      return {
        symbol: item.symbol,
        name: item.name,
        sector: item.sector,
        industry: item.industry,
        exchange: item.exchange,
        firstDate: item.firstDate,
        latestDate: item.latestDate,
        appearances: item.appearances,
        presetCount: presetIds.length,
        presetIds,
        averageScore: averageScore === null ? null : Math.round(averageScore),
        latestScore: item.latest.score,
        latestPrice: item.latest.price,
        latestMarketCap: item.latest.market_cap,
        latestReasons: item.latest.reasons || [],
        latestRisks: item.latest.risks || [],
        metrics: item.latest.metrics || {}
      };
    })
    .sort((a, b) => {
      if (b.presetCount !== a.presetCount) return b.presetCount - a.presetCount;
      if (b.appearances !== a.appearances) return b.appearances - a.appearances;
      return (b.averageScore || 0) - (a.averageScore || 0);
    });
}

export default async function handler(request, response) {
  try {
    const days = Math.max(1, Math.min(120, Number(request.query.days || 30)));
    const limit = Math.max(1, Math.min(100, Number(request.query.limit || 30)));
    const rows = await supabaseRequest("/radar_candidates", {
      params: {
        select:
          "run_date,preset_id,symbol,name,sector,industry,exchange,rank,score,price,changes_percentage,change_20d,relative_volume,market_cap,pe,reasons,risks,metrics",
        run_date: `gte.${daysAgo(days)}`,
        order: "run_date.desc,score.desc"
      }
    });

    const candidates = summarize(rows).slice(0, limit);
    response.status(200).json({
      ok: true,
      days,
      generatedAt: new Date().toISOString(),
      totalRows: rows.length,
      candidates
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
