import { fmpGet, fmpV3Get, optional } from "./_lib/fmp.js";
import { loadTechnical } from "./_lib/technical.js";

export default async function handler(_request, response) {
  try {
    const [stableQuote, v3Quote, profile, technical] = await Promise.all([
      optional(fmpGet("/quote", { symbol: "AAPL" }), null),
      optional(fmpV3Get("/quote/AAPL"), null),
      optional(fmpGet("/profile", { symbol: "AAPL" }), null),
      optional(loadTechnical("AAPL"), null)
    ]);

    const stableFirst = Array.isArray(stableQuote) ? stableQuote[0] : null;
    const v3First = Array.isArray(v3Quote) ? v3Quote[0] : null;
    const profileFirst = Array.isArray(profile) ? profile[0] : null;

    response.status(200).json({
      ok: Boolean(profileFirst && technical?.latest),
      checkedAt: new Date().toISOString(),
      endpoints: {
        stableQuote: {
          ok: Boolean(stableFirst),
          fields: stableFirst ? Object.keys(stableFirst).sort() : []
        },
        v3Quote: {
          ok: Boolean(v3First),
          fields: v3First ? Object.keys(v3First).sort() : []
        },
        profile: {
          ok: Boolean(profileFirst),
          fields: profileFirst ? Object.keys(profileFirst).sort() : []
        },
        historicalTechnical: {
          ok: Boolean(technical?.latest),
          sample: technical
            ? {
                latest: technical.latest,
                change20d: technical.change20d,
                relativeVolume20: technical.relativeVolume20,
                rsi14: technical.rsi14
              }
            : null
        }
      }
    });
  } catch (error) {
    response.status(error.statusCode || 500).json({ ok: false, error: error.message || "Unknown error" });
  }
}
