const FMP_BASE = "https://financialmodelingprep.com/stable";
const FMP_V3_BASE = "https://financialmodelingprep.com/api/v3";

export function apiKey() {
  if (!process.env.FMP_API_KEY) {
    const error = new Error("Missing FMP_API_KEY. Add it in Vercel Project Settings > Environment Variables.");
    error.statusCode = 500;
    throw error;
  }
  return process.env.FMP_API_KEY;
}

export async function fmpGet(path, params = {}, base = FMP_BASE) {
  const url = new URL(`${base}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  url.searchParams.set("apikey", apiKey());

  const response = await fetch(url);
  if (!response.ok) {
    const error = new Error(`FMP request failed: ${response.status} ${response.statusText}`);
    error.statusCode = response.status;
    throw error;
  }
  const data = await response.json();
  if (data && typeof data === "object" && data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }
  return data;
}

export function fmpV3Get(path, params = {}) {
  return fmpGet(path, params, FMP_V3_BASE);
}

export async function optional(promise, fallback) {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

export function safeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
