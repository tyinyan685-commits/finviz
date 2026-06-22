import test from "node:test";
import assert from "node:assert/strict";
import { summarizeAutomationStatus } from "../api/_lib/automation-status.js";

const now = Date.parse("2026-06-23T10:00:00Z");
const runSummary = { latestRunDate: "2026-06-22", latestPresetCount: 5 };

function ratings(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    run_date: "2026-06-22",
    symbol: `S${index}`,
    model_version: "2026-06-22-v5",
    generated_at: "2026-06-23T02:00:00Z",
    ...overrides
  }));
}

test("reports a complete current-model automation run", () => {
  const status = summarizeAutomationStatus({ runSummary, ratings: ratings(40), candidateCount: 40, expectedPresetCount: 5, now });
  assert.equal(status.status, "healthy");
  assert.equal(status.currentRatingCount, 40);
});

test("treats old-model rows as waiting for refresh", () => {
  const status = summarizeAutomationStatus({
    runSummary,
    ratings: ratings(40, { model_version: "2026-06-22-v4" }),
    candidateCount: 40,
    expectedPresetCount: 5,
    now
  });
  assert.equal(status.status, "waiting_rating");
  assert.match(status.message, /旧模型/);
});

test("allows weekends but marks ratings older than 120 hours stale", () => {
  const status = summarizeAutomationStatus({
    runSummary,
    ratings: ratings(40, { generated_at: "2026-06-17T00:00:00Z" }),
    candidateCount: 40,
    expectedPresetCount: 5,
    now
  });
  assert.equal(status.status, "stale");
  assert.ok(status.ageHours > 120);
});

test("reports partial rating coverage without calling it healthy", () => {
  const status = summarizeAutomationStatus({ runSummary, ratings: ratings(12), candidateCount: 40, expectedPresetCount: 5, now });
  assert.equal(status.status, "partial_rating");
  assert.equal(status.currentRatingCount, 12);
});
