export const CURRENT_RATING_MODEL_VERSION = "2026-06-22-v5";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateRatingPayload(payload, expectedSymbol) {
  if (!payload || typeof payload !== "object" || payload.ok !== true) {
    return { ok: false, error: payload?.error || "Rating API returned an invalid response." };
  }
  const errors = [];
  if (payload.symbol !== expectedSymbol) errors.push("symbol mismatch");
  if (finite(payload.rating?.score) === null) errors.push("invalid score");
  if (finite(payload.rating?.confidence) === null) errors.push("invalid confidence");
  if (!payload.rating?.components?.fundamental || !payload.rating?.components?.technical || !payload.rating?.components?.expectation) {
    errors.push("missing rating components");
  }
  if (typeof payload.researchState !== "string" || !payload.researchState) errors.push("missing research state");
  if (!payload.metrics?.risk || finite(payload.metrics.risk.score) === null) errors.push("missing risk metrics");
  if (!payload.sources?.priceAsOf) errors.push("missing price source date");
  return errors.length ? { ok: false, error: `Rating contract failed: ${errors.join(", ")}` } : payload;
}
