import { supabaseRequest } from "./_lib/supabase.js";
import { summarizeRatingChange } from "./_lib/rating-change.js";

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function avg(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (!numbers.length) return null;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function dateDiffDays(start, end) {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86400000));
}

function summarizeRuns(runs) {
  const coverageByDate = new Map();
  runs.forEach((run) => {
    const presets = coverageByDate.get(run.run_date) || new Set();
    presets.add(run.preset_id);
    coverageByDate.set(run.run_date, presets);
  });
  const latestRunDate =
    Array.from(coverageByDate.entries())
      .sort((a, b) => b[1].size - a[1].size || b[0].localeCompare(a[0]))[0]?.[0] || "";
  const newestRunDate = runs.reduce((latest, run) => (run.run_date > latest ? run.run_date : latest), "");
  const latestRuns = runs
    .filter((run) => run.run_date === latestRunDate)
    .sort((a, b) => a.preset_id.localeCompare(b.preset_id));

  return {
    latestRunDate: latestRunDate || null,
    newestRunDate: newestRunDate || null,
    latestPresetIds: latestRuns.map((run) => run.preset_id),
    latestPresetCount: latestRuns.length,
    totalRuns: runs.length,
    runs: runs.map((run) => ({
      runDate: run.run_date,
      presetId: run.preset_id,
      presetName: run.preset_name,
      stockCount: run.stock_count,
      generatedAt: run.generated_at
    }))
  };
}

function summarize(rows, latestRunDate) {
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
      runDates: new Set(),
      latestPresetIds: new Set(),
      scores: [],
      latest: row
    };

    current.appearances += 1;
    current.presetIds.add(row.preset_id);
    current.runDates.add(row.run_date);
    if (Number.isFinite(Number(row.score))) current.scores.push(Number(row.score));
    if (row.run_date < current.firstDate) current.firstDate = row.run_date;
    if (row.run_date >= current.latestDate) {
      current.latestDate = row.run_date;
      current.latest = row;
    }
    bySymbol.set(row.symbol, current);
  });

  bySymbol.forEach((item) => {
    rows
      .filter((row) => row.symbol === item.symbol && row.run_date === item.latestDate)
      .forEach((row) => item.latestPresetIds.add(row.preset_id));
  });

  return Array.from(bySymbol.values())
    .map((item) => {
      const presetIds = Array.from(item.presetIds).sort();
      const latestPresetIds = Array.from(item.latestPresetIds).sort();
      const averageScore = avg(item.scores);
      const ageDays = latestRunDate ? dateDiffDays(item.firstDate, latestRunDate) : 0;
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
        latestPresetCount: latestPresetIds.length,
        presetIds,
        latestPresetIds,
        seenDays: item.runDates.size,
        ageDays,
        isNew: Boolean(latestRunDate && item.firstDate === latestRunDate),
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
      if (Number(b.isNew) !== Number(a.isNew)) return Number(b.isNew) - Number(a.isNew);
      if (b.latestPresetCount !== a.latestPresetCount) return b.latestPresetCount - a.latestPresetCount;
      if (b.presetCount !== a.presetCount) return b.presetCount - a.presetCount;
      if (b.appearances !== a.appearances) return b.appearances - a.appearances;
      return (b.averageScore || 0) - (a.averageScore || 0);
    });
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

export default async function handler(request, response) {
  try {
    const days = Math.max(1, Math.min(120, Number(request.query.days || 30)));
    const limit = Math.max(1, Math.min(100, Number(request.query.limit || 30)));
    const since = daysAgo(days);
    const [runs, rows, ratings] = await Promise.all([
      supabaseRequest("/radar_runs", {
        params: {
          select: "run_date,preset_id,preset_name,stock_count,generated_at",
          run_date: `gte.${since}`,
          order: "run_date.desc,preset_id.asc"
        }
      }),
      supabaseRequest("/radar_candidates", {
        params: {
          select:
            "run_date,preset_id,symbol,name,sector,industry,exchange,rank,score,price,changes_percentage,change_20d,relative_volume,market_cap,pe,reasons,risks,metrics",
          run_date: `gte.${since}`,
          order: "run_date.desc,score.desc"
        }
      }),
      supabaseRequest("/stock_ratings", {
        params: {
          select:
            "run_date,symbol,score,rating,rating_en,confidence,fundamental_score,technical_score,sentiment_score,model_version,generated_at,metrics",
          run_date: `gte.${since}`,
          order: "run_date.desc,score.desc"
        }
      })
    ]);

    const runSummary = summarizeRuns(runs);
    const eligibleRatings = ratings.filter(
      (rating) => !runSummary.latestRunDate || rating.run_date <= runSummary.latestRunDate
    );
    const latestRatingBySymbol = new Map();
    const previousRatingBySymbol = new Map();
    eligibleRatings.forEach((rating) => {
      const latest = latestRatingBySymbol.get(rating.symbol);
      if (!latest) {
        latestRatingBySymbol.set(rating.symbol, rating);
      } else if (!previousRatingBySymbol.has(rating.symbol) && rating.run_date < latest.run_date) {
        previousRatingBySymbol.set(rating.symbol, rating);
      }
    });
    const eligibleRows = rows.filter(
      (row) =>
        (!runSummary.latestRunDate || row.run_date <= runSummary.latestRunDate) &&
        passesCurrentQualityRules(row)
    );
    const summarizedCandidates = summarize(eligibleRows, runSummary.latestRunDate)
      .map((candidate) => {
        const rating = latestRatingBySymbol.get(candidate.symbol);
        const previousRating = previousRatingBySymbol.get(candidate.symbol);
        return rating
          ? {
              ...candidate,
              rating: {
                runDate: rating.run_date,
                score: rating.score,
                label: rating.rating,
                labelEn: rating.rating_en,
                confidence: rating.confidence,
                fundamentalScore: rating.fundamental_score,
                technicalScore: rating.technical_score,
                sentimentScore: rating.sentiment_score,
                modelVersion: rating.model_version,
                generatedAt: rating.generated_at,
                researchState: rating.metrics?.snapshot?.researchState || null,
                risk: rating.metrics?.risk || null,
                change: summarizeRatingChange(rating, previousRating)
              }
            }
          : candidate;
      })
      .sort((a, b) => {
        const aScore = Number(a.rating?.score);
        const bScore = Number(b.rating?.score);
        const aRated = Number.isFinite(aScore);
        const bRated = Number.isFinite(bScore);
        if (aRated !== bRated) return bRated - aRated;
        if (aRated && bScore !== aScore) return bScore - aScore;
        return 0;
      });
    const candidates = summarizedCandidates.slice(0, limit);
    response.status(200).json({
      ok: true,
      days,
      generatedAt: new Date().toISOString(),
      totalRows: rows.length,
      aggregationRows: eligibleRows.length,
      excludedRows: rows.length - eligibleRows.length,
      uniqueCandidates: summarizedCandidates.length,
      displayedCandidates: candidates.length,
      ratingRows: eligibleRatings.length,
      runSummary,
      candidates
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
