import { evaluateRatingSnapshot, summarizeEvaluations } from "./_lib/backtest.js";
import { loadPrices } from "./_lib/technical.js";
import { supabaseRequest } from "./_lib/supabase.js";

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

export default async function handler(request, response) {
  try {
    const days = Math.max(30, Math.min(365, Number(request.query.days || 180)));
    const rows = await supabaseRequest("/stock_ratings", {
      params: {
        select: "run_date,symbol,score,rating,model_version,radar_presets,metrics",
        run_date: `gte.${daysAgo(days)}`,
        order: "run_date.asc,symbol.asc",
        limit: 2000
      }
    });
    const snapshots = rows
      .map((row) => ({
        runDate: row.run_date,
        symbol: row.symbol,
        score: row.score,
        rating: row.rating,
        modelVersion: row.model_version,
        entryPrice: row.metrics?.snapshot?.price ?? null,
        priceAsOf: row.metrics?.snapshot?.priceAsOf ?? null,
        sector: row.metrics?.snapshot?.sector ?? null,
        industry: row.metrics?.snapshot?.industry ?? null,
        radars: Array.isArray(row.radar_presets) ? row.radar_presets : []
      }))
      .filter((row) => Number(row.entryPrice) > 0);

    if (!snapshots.length) {
      return response.status(200).json({
        ok: true,
        status: "collecting",
        generatedAt: new Date().toISOString(),
        capturedSnapshots: 0,
        message: "评级价格快照从当前版本开始积累；至少 5 个交易日后才会出现首批结果。",
        groups: []
      });
    }

    const symbols = Array.from(new Set(snapshots.map((snapshot) => snapshot.symbol)));
    const [benchmarkRows, symbolResults] = await Promise.all([
      loadPrices("SPY", days + 120),
      mapConcurrent(symbols, 5, async (symbol) => ({ symbol, rows: await loadPrices(symbol, days + 120) }))
    ]);
    const pricesBySymbol = new Map(symbolResults.map((result) => [result.symbol, result.rows]));
    const evaluations = snapshots
      .map((snapshot) => evaluateRatingSnapshot(snapshot, pricesBySymbol.get(snapshot.symbol) || [], benchmarkRows))
      .filter(Boolean);
    const groups = summarizeEvaluations(evaluations);
    const sectorGroups = summarizeEvaluations(evaluations, undefined, (evaluation) => evaluation.sector ? [evaluation.sector] : []);
    const radarGroups = summarizeEvaluations(evaluations, undefined, (evaluation) => evaluation.radars || []);
    const maturedFiveDaySamples = groups.reduce((sum, group) => sum + (group.horizons?.[5]?.samples || 0), 0);

    response.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=43200");
    return response.status(200).json({
      ok: true,
      status: maturedFiveDaySamples > 0 ? "ready" : "collecting",
      generatedAt: new Date().toISOString(),
      benchmark: "SPY",
      capturedSnapshots: snapshots.length,
      evaluatedSnapshots: evaluations.length,
      maturedFiveDaySamples,
      message: maturedFiveDaySamples > 0 ? null : "价格快照已开始保存，等待首批样本满 5 个交易日。",
      groups,
      breakdowns: { rating: groups, sector: sectorGroups, radar: radarGroups },
      dataPolicy: "以快照 priceAsOf 对应的真实收盘价为入口，使用之后第 5/20/60 个交易日真实收盘价；旧记录缺少入口价格或分组字段时排除，不进行回填或插值。"
    });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Backtest failed" });
  }
}
