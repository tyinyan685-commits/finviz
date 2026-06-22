import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRatingChange } from "../api/_lib/rating-change.js";

test("explains component, EPS, risk, state and new-event changes", () => {
  const previous = {
    run_date: "2026-06-18", score: 72, rating: "积极关注",
    fundamental_score: 70, technical_score: 80, sentiment_score: 50,
    metrics: {
      snapshot: { researchState: "优先研究" },
      fundamentals: { epsEstimate: 10, estimateDate: "2027-12-31" },
      risk: { level: "中" },
      expectation: { news: { matchedEvents: [] } }
    }
  };
  const current = {
    run_date: "2026-06-19", score: 65, rating: "持有观察",
    fundamental_score: 66, technical_score: 68, sentiment_score: 55,
    metrics: {
      snapshot: { researchState: "高风险等待" },
      fundamentals: { epsEstimate: 9.5, estimateDate: "2027-12-31" },
      risk: { level: "高" },
      expectation: { news: { matchedEvents: [{ title: "Company cuts guidance", direction: "negative", url: "https://example.com/a" }] } }
    }
  };
  const change = summarizeRatingChange(current, previous);
  assert.equal(change.score, -7);
  assert.ok(change.reasons.includes("研究状态：优先研究 → 高风险等待"));
  assert.ok(change.reasons.includes("技术面 -12"));
  assert.ok(change.reasons.includes("EPS预测下调 5.0%"));
  assert.equal(change.reasons.length, 4);
});

test("does not compare EPS estimates from different forecast periods", () => {
  const change = summarizeRatingChange(
    { run_date: "2026-06-19", metrics: { fundamentals: { epsEstimate: 12, estimateDate: "2028-12-31" } } },
    { run_date: "2026-06-18", metrics: { fundamentals: { epsEstimate: 10, estimateDate: "2027-12-31" } } }
  );
  assert.equal(change.reasons.some((reason) => reason.startsWith("EPS预测")), false);
});
