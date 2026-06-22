import { supabaseRequest } from "./_lib/supabase.js";
import { validateRatingPayload } from "./_lib/rating-contract.js";

const DEFAULT_RATING_API_BASE = "https://stocks.wiseain.com";

function checkCronSecret(request) {
  if (!process.env.CRON_SECRET) return;
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : request.query.secret;
  if (token !== process.env.CRON_SECRET) {
    const error = new Error("Unauthorized rating sync request.");
    error.statusCode = 401;
    throw error;
  }
}

function groupCandidates(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.symbol) || {
      symbol: row.symbol,
      name: row.name,
      sector: row.sector || null,
      industry: row.industry || null,
      presets: new Set(),
      radarScore: 0
    };
    current.presets.add(row.preset_id);
    current.sector ||= row.sector || null;
    current.industry ||= row.industry || null;
    current.radarScore = Math.max(current.radarScore, Number(row.score) || 0);
    grouped.set(row.symbol, current);
  }
  return Array.from(grouped.values())
    .map((item) => ({ ...item, presets: Array.from(item.presets).sort() }))
    .sort((a, b) => b.presets.length - a.presets.length || b.radarScore - a.radarScore);
}

function bestCoveredRunDate(runs) {
  const coverage = new Map();
  for (const run of runs) {
    const presets = coverage.get(run.run_date) || new Set();
    presets.add(run.preset_id);
    coverage.set(run.run_date, presets);
  }
  return Array.from(coverage.entries())
    .sort((a, b) => b[1].size - a[1].size || b[0].localeCompare(a[0]))[0]?.[0] || null;
}

function daysBefore(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function fillCandidates(primary, fallback, limit) {
  const selected = new Map(primary.slice(0, limit).map((candidate) => [candidate.symbol, candidate]));
  for (const candidate of fallback) {
    if (selected.size >= limit) break;
    if (!selected.has(candidate.symbol)) selected.set(candidate.symbol, candidate);
  }
  return Array.from(selected.values());
}

function passesCurrentQualityRules(row) {
  if (row.preset_id === "unusual_volume") {
    return row.metrics?.technicalReady === true && Number(row.relative_volume) > 1.15;
  }
  if (row.preset_id === "earnings_watch") {
    return Boolean(
      row.metrics?.earningsDate ||
      (Array.isArray(row.reasons) && row.reasons.some((reason) => String(reason).startsWith("财报日 ")))
    );
  }
  return true;
}

async function loadRating(symbol) {
  const base = (process.env.RATING_API_BASE || DEFAULT_RATING_API_BASE).replace(/\/$/, "");
  const response = await fetch(`${base}/api/rating?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Rating API failed: ${response.status}`);
  const validated = validateRatingPayload(data, symbol);
  if (!validated.ok) throw new Error(validated.error);
  return validated;
}

function ratingRow(runDate, candidate, payload) {
  const rating = payload.rating || {};
  const generatedAt = payload.generatedAt || new Date().toISOString();
  return {
    run_date: runDate,
    symbol: candidate.symbol,
    name: payload.name || candidate.name || null,
    score: rating.score ?? null,
    rating: rating.rating || null,
    rating_en: rating.ratingEn || null,
    confidence: rating.confidence ?? null,
    fundamental_score: rating.components?.fundamental?.score ?? null,
    technical_score: rating.components?.technical?.score ?? null,
    sentiment_score: rating.components?.sentiment?.score ?? null,
    model_version: rating.modelVersion || null,
    generated_at: generatedAt,
    radar_preset_count: candidate.presets.length,
    radar_presets: candidate.presets,
    metrics: {
      ...(payload.metrics || {}),
      snapshot: {
        price: payload.metrics?.technical?.latest ?? payload.price ?? null,
        currency: payload.currency || null,
        priceAsOf: payload.sources?.priceAsOf || null,
        priceSource: payload.metrics?.technical?.latest != null ? "FMP historical EOD" : "FMP quote fallback",
        capturedAt: generatedAt,
        modelVersion: rating.modelVersion || null,
        researchState: payload.researchState || rating.rating || null,
        sector: candidate.sector || null,
        industry: candidate.industry || null,
        radars: candidate.presets
      }
    }
  };
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
    checkCronSecret(request);
    const limit = Math.max(1, Math.min(40, Number(request.query.limit || 40)));
    const requestedDate = request.query.date || null;
    const latestRuns = await supabaseRequest("/radar_runs", {
      params: {
        select: "run_date,preset_id",
        ...(requestedDate ? { run_date: `eq.${requestedDate}` } : {}),
        order: "run_date.desc,preset_id.asc",
        limit: 50
      }
    });
    const runDate = requestedDate || bestCoveredRunDate(latestRuns);
    if (!runDate) return response.status(404).json({ ok: false, error: "No radar snapshot found." });

    const rows = await supabaseRequest("/radar_candidates", {
      params: {
        select: "symbol,name,sector,industry,preset_id,score,relative_volume,reasons,metrics",
        run_date: `eq.${runDate}`,
        order: "score.desc"
      }
    });
    const currentCandidates = groupCandidates(rows.filter(passesCurrentQualityRules));
    let candidates = currentCandidates.slice(0, limit);
    if (candidates.length < limit) {
      const recentRows = await supabaseRequest("/radar_candidates", {
        params: {
          select: "symbol,name,sector,industry,preset_id,score,relative_volume,reasons,metrics",
          run_date: `gte.${daysBefore(runDate, 30)}`,
          and: `(run_date.lte.${runDate})`,
          order: "run_date.desc,score.desc",
          limit: 1000
        }
      });
      candidates = fillCandidates(
        currentCandidates,
        groupCandidates(recentRows.filter(passesCurrentQualityRules)),
        limit
      );
    }
    const historicalFill = Math.max(0, candidates.length - Math.min(currentCandidates.length, limit));
    const errors = [];
    const completed = await mapConcurrent(candidates, 5, async (candidate) => {
      try {
        return ratingRow(runDate, candidate, await loadRating(candidate.symbol));
      } catch (error) {
        errors.push({ symbol: candidate.symbol, error: error.message });
        return null;
      }
    });
    const ratingRows = completed.filter(Boolean);
    if (ratingRows.length) {
      await supabaseRequest("/stock_ratings?on_conflict=run_date,symbol", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: ratingRows
      });
    }

    const result = {
      ok: true,
      runDate,
      presetCoverage: new Set(latestRuns.filter((run) => run.run_date === runDate).map((run) => run.preset_id)).size,
      latestSnapshotCandidates: currentCandidates.length,
      historicalFill,
      requested: candidates.length,
      saved: ratingRows.length,
      failed: errors.length,
      errors
    };
    console.info("[rating-sync]", JSON.stringify(result));
    return response.status(200).json(result);
  } catch (error) {
    return response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
