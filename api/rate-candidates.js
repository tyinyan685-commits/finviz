import { supabaseRequest } from "./_lib/supabase.js";

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
      presets: new Set(),
      radarScore: 0
    };
    current.presets.add(row.preset_id);
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

async function loadRating(symbol) {
  const base = (process.env.RATING_API_BASE || DEFAULT_RATING_API_BASE).replace(/\/$/, "");
  const response = await fetch(`${base}/api/rating?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(25000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `Rating API failed: ${response.status}`);
  return data;
}

function ratingRow(runDate, candidate, payload) {
  const rating = payload.rating || {};
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
    generated_at: payload.generatedAt || new Date().toISOString(),
    radar_preset_count: candidate.presets.length,
    radar_presets: candidate.presets,
    metrics: payload.metrics || {}
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
        select: "symbol,name,preset_id,score",
        run_date: `eq.${runDate}`,
        order: "score.desc"
      }
    });
    const currentCandidates = groupCandidates(rows);
    let candidates = currentCandidates.slice(0, limit);
    if (candidates.length < limit) {
      const recentRows = await supabaseRequest("/radar_candidates", {
        params: {
          select: "symbol,name,preset_id,score",
          run_date: `gte.${daysBefore(runDate, 30)}`,
          and: `(run_date.lte.${runDate})`,
          order: "run_date.desc,score.desc",
          limit: 1000
        }
      });
      candidates = fillCandidates(currentCandidates, groupCandidates(recentRows), limit);
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

    return response.status(200).json({
      ok: true,
      runDate,
      presetCoverage: new Set(latestRuns.filter((run) => run.run_date === runDate).map((run) => run.preset_id)).size,
      latestSnapshotCandidates: currentCandidates.length,
      historicalFill,
      requested: candidates.length,
      saved: ratingRows.length,
      failed: errors.length,
      errors
    });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
