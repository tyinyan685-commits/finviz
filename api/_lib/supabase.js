const SUPABASE_REST_SUFFIX = "/rest/v1";

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function requireSupabaseConfig() {
  if (!hasSupabaseConfig()) {
    const error = new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.");
    error.statusCode = 500;
    throw error;
  }
}

export async function supabaseRequest(path, options = {}) {
  requireSupabaseConfig();
  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, "");
  const url = new URL(`${baseUrl}${SUPABASE_REST_SUFFIX}${path}`);
  Object.entries(options.params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase request failed: ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}
