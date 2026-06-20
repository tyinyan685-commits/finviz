import { supabaseRequest } from "./_lib/supabase.js";

function validSymbol(value) {
  return /^[A-Z0-9.=\-]{1,20}$/.test(value);
}

export default async function handler(request, response) {
  const symbol = String(request.query.symbol || "").trim().toUpperCase();
  if (!validSymbol(symbol)) return response.status(400).json({ ok: false, error: "Invalid symbol" });

  try {
    const rows = await supabaseRequest("/stock_ratings", {
      params: {
        select: "run_date,metrics",
        symbol: `eq.${symbol}`,
        order: "run_date.desc",
        limit: 120
      }
    });
    const samples = rows
      .map((row) => ({
        date: row.run_date,
        epsEstimate: Number(row.metrics?.fundamentals?.epsEstimate),
        estimateDate: row.metrics?.fundamentals?.estimateDate || null
      }))
      .filter((row) => Number.isFinite(row.epsEstimate) && row.epsEstimate > 0);

    response.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    return response.status(200).json({
      ok: true,
      symbol,
      samples,
      source: "Supabase daily rating snapshots",
      policy: "Only historical FMP analyst EPS estimates are returned; no values are interpolated."
    });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
