import test from "node:test";
import assert from "node:assert/strict";
import { validateRatingPayload } from "../api/_lib/rating-contract.js";

function payload() {
  return {
    ok: true,
    symbol: "TEST",
    researchState: "持有观察",
    rating: { score: 60, confidence: 80, components: { fundamental: {}, technical: {}, expectation: {} } },
    metrics: { risk: { score: 10 } },
    sources: { priceAsOf: "2026-06-18" }
  };
}

test("accepts a complete rating before database persistence", () => {
  const value = payload();
  assert.equal(validateRatingPayload(value, "TEST"), value);
});

test("rejects incomplete ratings before database persistence", () => {
  const value = payload();
  delete value.sources.priceAsOf;
  const result = validateRatingPayload(value, "TEST");
  assert.equal(result.ok, false);
  assert.match(result.error, /price source date/);
});
