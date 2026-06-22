import { safeNumber } from "./fmp.js";

export const BACKTEST_HORIZONS = [5, 20, 60];

export function normalizePriceRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({ date: String(row.date || "").slice(0, 10), close: safeNumber(row.close ?? row.price ?? row.adjClose) }))
    .filter((row) => row.date && row.close !== null && row.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function firstIndexOnOrAfter(rows, date) {
  return rows.findIndex((row) => row.date >= date);
}

function percentChange(current, initial) {
  return current > 0 && initial > 0 ? ((current - initial) / initial) * 100 : null;
}

function maxDrawdown(entryPrice, rows) {
  if (!(entryPrice > 0) || !rows.length) return null;
  let peak = entryPrice;
  let drawdown = 0;
  for (const row of rows) {
    peak = Math.max(peak, row.close);
    drawdown = Math.min(drawdown, ((row.close - peak) / peak) * 100);
  }
  return drawdown;
}

export function evaluateRatingSnapshot(snapshot, priceRows, benchmarkRows, horizons = BACKTEST_HORIZONS) {
  const stock = normalizePriceRows(priceRows);
  const benchmark = normalizePriceRows(benchmarkRows);
  const entryPrice = safeNumber(snapshot.entryPrice);
  const entryDate = snapshot.priceAsOf || snapshot.runDate;
  const stockIndex = firstIndexOnOrAfter(stock, entryDate);
  const benchmarkIndex = firstIndexOnOrAfter(benchmark, entryDate);
  if (!(entryPrice > 0) || stockIndex < 0 || benchmarkIndex < 0) return null;

  const outcomes = {};
  for (const horizon of horizons) {
    const stockFuture = stock[stockIndex + horizon];
    const benchmarkEntry = benchmark[benchmarkIndex];
    const benchmarkFuture = benchmark[benchmarkIndex + horizon];
    if (!stockFuture || !benchmarkEntry || !benchmarkFuture) {
      outcomes[horizon] = null;
      continue;
    }
    const stockReturn = percentChange(stockFuture.close, entryPrice);
    const benchmarkReturn = percentChange(benchmarkFuture.close, benchmarkEntry.close);
    outcomes[horizon] = {
      date: stockFuture.date,
      returnPct: stockReturn,
      benchmarkReturnPct: benchmarkReturn,
      excessReturnPct: stockReturn - benchmarkReturn
    };
  }

  return {
    ...snapshot,
    entryDate,
    outcomes,
    maxDrawdown20Pct: maxDrawdown(entryPrice, stock.slice(stockIndex + 1, stockIndex + 21))
  };
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function median(values) {
  const valid = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[middle] : (valid[middle - 1] + valid[middle]) / 2;
}

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export function summarizeEvaluations(
  evaluations,
  horizons = BACKTEST_HORIZONS,
  groupValues = (evaluation) => [evaluation.rating || "未分类"]
) {
  const groups = new Map();
  for (const evaluation of evaluations.filter(Boolean)) {
    const keys = Array.from(new Set((groupValues(evaluation) || []).filter(Boolean)));
    for (const key of keys) {
      const group = groups.get(key) || [];
      group.push(evaluation);
      groups.set(key, group);
    }
  }

  return Array.from(groups.entries()).map(([label, samples]) => ({
    label,
    rating: label,
    snapshots: samples.length,
    averageScore: rounded(average(samples.map((sample) => Number(sample.score)))),
    averageMaxDrawdown20Pct: rounded(average(samples.map((sample) => sample.maxDrawdown20Pct))),
    horizons: Object.fromEntries(
      horizons.map((horizon) => {
        const outcomes = samples.map((sample) => sample.outcomes[horizon]).filter(Boolean);
        const returns = outcomes.map((outcome) => outcome.returnPct);
        const excess = outcomes.map((outcome) => outcome.excessReturnPct);
        return [
          horizon,
          {
            samples: outcomes.length,
            averageReturnPct: rounded(average(returns)),
            medianReturnPct: rounded(median(returns)),
            positiveRatePct: outcomes.length ? rounded((returns.filter((value) => value > 0).length / outcomes.length) * 100) : null,
            averageExcessReturnPct: rounded(average(excess)),
            excessWinRatePct: outcomes.length ? rounded((excess.filter((value) => value > 0).length / outcomes.length) * 100) : null
          }
        ];
      })
    )
  }));
}
