import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRatingSnapshot, summarizeEvaluations } from "../api/_lib/backtest.js";

function prices(start, count, step = 1) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, "0")}`,
    close: start + index * step
  }));
}

test("evaluates trading-day returns against SPY", () => {
  const result = evaluateRatingSnapshot(
    { runDate: "2026-01-01", symbol: "TEST", entryPrice: 100, rating: "积极关注", score: 75 },
    prices(100, 25, 2),
    prices(100, 25, 1),
    [5, 20]
  );
  assert.equal(result.outcomes[5].returnPct, 10);
  assert.equal(result.outcomes[5].benchmarkReturnPct, 5);
  assert.equal(result.outcomes[5].excessReturnPct, 5);
  assert.equal(result.outcomes[20].returnPct, 40);
});

test("does not invent outcomes before a horizon matures", () => {
  const result = evaluateRatingSnapshot(
    { runDate: "2026-01-01", symbol: "TEST", entryPrice: 100 },
    prices(100, 6, 1),
    prices(100, 6, 1),
    [5, 20]
  );
  assert.ok(result.outcomes[5]);
  assert.equal(result.outcomes[20], null);
});

test("summarizes only matured samples", () => {
  const evaluations = [
    { rating: "积极关注", score: 70, maxDrawdown20Pct: -4, outcomes: { 5: { returnPct: 10, excessReturnPct: 5 } } },
    { rating: "积极关注", score: 80, maxDrawdown20Pct: -6, outcomes: { 5: { returnPct: -2, excessReturnPct: -3 } } }
  ];
  const [summary] = summarizeEvaluations(evaluations, [5]);
  assert.equal(summary.averageScore, 75);
  assert.equal(summary.horizons[5].samples, 2);
  assert.equal(summary.horizons[5].positiveRatePct, 50);
  assert.equal(summary.averageMaxDrawdown20Pct, -5);
});
