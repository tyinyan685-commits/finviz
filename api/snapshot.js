import { presets } from "./_lib/presets.js";
import { supabaseRequest } from "./_lib/supabase.js";
import { runScreen } from "./screen.js";

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function checkCronSecret(request) {
  if (!process.env.CRON_SECRET) return;
  const auth = request.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : request.query.secret;
  if (token !== process.env.CRON_SECRET) {
    const error = new Error("Unauthorized snapshot request.");
    error.statusCode = 401;
    throw error;
  }
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function candidateRow(run, stock, index) {
  return {
    run_id: run.id,
    run_date: run.run_date,
    preset_id: run.preset_id,
    symbol: stock.symbol,
    name: stock.name || null,
    sector: stock.sector || null,
    industry: stock.industry || null,
    exchange: stock.exchange || null,
    rank: index + 1,
    score: numeric(stock.score),
    price: numeric(stock.price),
    changes_percentage: numeric(stock.changesPercentage),
    change_20d: numeric(stock.change20d),
    relative_volume: numeric(stock.relativeVolume),
    market_cap: numeric(stock.marketCap),
    pe: numeric(stock.pe),
    reasons: stock.reasons || [],
    risks: stock.risks || [],
    metrics: {
      technicalReady: Boolean(stock.technicalReady),
      fundamentalReady: Boolean(stock.fundamentalReady),
      revenueGrowth: stock.revenueGrowth ?? null,
      netIncomeGrowth: stock.netIncomeGrowth ?? null,
      operatingMargin: stock.operatingMargin ?? null,
      freeCashFlowYield: stock.freeCashFlowYield ?? null,
      financialCurrency: stock.financialCurrency ?? null,
      returnOnInvestedCapital: stock.returnOnInvestedCapital ?? null,
      evToEbitda: stock.evToEbitda ?? null,
      distance50: stock.distance50 ?? null,
      distance200: stock.distance200 ?? null,
      rsi14: stock.rsi14 ?? null,
      distanceFromHigh52Week: stock.distanceFromHigh52Week ?? null
    }
  };
}

async function savePresetSnapshot(preset, limit, runDate) {
  const { payload } = await runScreen({ presetId: preset.id, limit, refresh: true });
  const [run] = await supabaseRequest("/radar_runs?on_conflict=run_date,preset_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [
      {
        run_date: runDate,
        preset_id: preset.id,
        preset_name: preset.name,
        generated_at: payload.generatedAt,
        stock_count: payload.stocks.length,
        data_quality: payload.dataQuality
      }
    ]
  });

  await supabaseRequest("/radar_candidates", {
    method: "DELETE",
    params: {
      run_date: `eq.${runDate}`,
      preset_id: `eq.${preset.id}`
    },
    prefer: "return=minimal"
  });

  const rows = payload.stocks.map((stock, index) => candidateRow(run, stock, index));
  if (rows.length) {
    await supabaseRequest("/radar_candidates", {
      method: "POST",
      prefer: "return=minimal",
      body: rows
    });
  }

  return {
    presetId: preset.id,
    presetName: preset.name,
    stockCount: rows.length,
    generatedAt: payload.generatedAt
  };
}

export default async function handler(request, response) {
  try {
    checkCronSecret(request);
    const requestedPreset = request.query.preset || "all";
    const limit = Number(request.query.limit || 30);
    const runDate = request.query.date || todayUtc();
    const selectedPresets =
      requestedPreset === "all" ? presets : presets.filter((preset) => preset.id === requestedPreset);

    if (!selectedPresets.length) {
      response.status(400).json({ error: `Unknown preset: ${requestedPreset}` });
      return;
    }

    const results = [];
    for (const preset of selectedPresets) {
      results.push(await savePresetSnapshot(preset, limit, runDate));
    }

    response.status(200).json({
      ok: true,
      runDate,
      presetCount: results.length,
      results
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
