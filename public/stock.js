let reportText = "";

const $ = (id) => document.getElementById(id);

function show(id, visible = true) {
  const element = $(id);
  if (element) element.classList.toggle("hidden", !visible);
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function setHtml(id, value) {
  const element = $(id);
  if (element) element.innerHTML = value;
}

function setError(message) {
  setText("error", message || "");
  show("error", Boolean(message));
}

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  const abs = Math.abs(number);
  if (abs >= 1_000_000_000_000) return `$${(number / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
  return `$${number.toFixed(0)}`;
}

function pct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(1)}%` : "n/a";
}

function ratioPct(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : "n/a";
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function renderList(id, items) {
  setHtml(id, (items || []).map((item) => `<li>${item}</li>`).join(""));
}

function symbolFromUrl() {
  return new URLSearchParams(window.location.search).get("symbol")?.toUpperCase() || "";
}

async function loadStock() {
  const symbol = symbolFromUrl();
  if (!symbol) {
    show("loading", false);
    setError("URL 缺少 symbol 参数。");
    return;
  }

  document.title = `${symbol} Research`;
  setText("stock-title", `${symbol} Research`);
  setError("");

  try {
    const [analysisResult, technicalResult, reportResult] = await Promise.allSettled([
      getJson(`/api/analyze?symbol=${encodeURIComponent(symbol)}&ts=${Date.now()}`),
      getJson(`/api/technical?symbol=${encodeURIComponent(symbol)}&ts=${Date.now()}`),
      fetch(`/api/report?symbol=${encodeURIComponent(symbol)}&ts=${Date.now()}`)
    ]);

    if (analysisResult.status !== "fulfilled") throw analysisResult.reason;
    const analysis = analysisResult.value;
    const technical = technicalResult.status === "fulfilled" ? technicalResult.value : {};
    const reportResponse = reportResult.status === "fulfilled" ? reportResult.value : null;
    reportText = reportResponse?.ok ? await reportResponse.text() : "报告暂时不可用。";

    setText("detail-title", `${symbol} 研究摘要`);
    setText("company-description", analysis.profile?.description || "暂无公司描述。");
    setText("detail-score", `${analysis.score?.score ?? "n/a"}/100`);
    setText("detail-pe", Number.isFinite(analysis.financials?.pe) ? analysis.financials.pe.toFixed(1) : "n/a");
    setText("detail-revenue-growth", ratioPct(analysis.financials?.revenueGrowth));
    setText("detail-gross-margin", ratioPct(analysis.financials?.grossMargin));
    setText("detail-fcf", money(analysis.financials?.freeCashFlow));
    renderList("reason-list", analysis.score?.reasons || []);
    renderList("risk-list", analysis.score?.risks || []);

    setText("tech-latest", technical.latest ?? "n/a");
    setText("tech-sma20", pct(technical.sma20Distance));
    setText("tech-sma50", pct(technical.sma50Distance));
    setText("tech-rsi", Number.isFinite(technical.rsi14) ? technical.rsi14.toFixed(1) : "n/a");
    renderList("tech-signals", technical.signals || []);

    setHtml(
      "news-list",
      (analysis.news || [])
        .slice(0, 6)
        .map(
          (item) => `
            <a href="${item.url || "#"}" target="_blank" rel="noreferrer">
              <span>${item.publishedDate ? String(item.publishedDate).slice(0, 10) : ""}</span>
              ${item.title || "Untitled"}
            </a>
          `
        )
        .join("")
    );
    setText("report-text", reportText);
    show("loading", false);
    show("summary");
    show("research");
  } catch (error) {
    show("loading", false);
    setError(error.message);
  }
}

$("copy-report").addEventListener("click", async () => {
  if (!reportText) return;
  await navigator.clipboard.writeText(reportText);
  setText("copy-report", "已复制");
  setTimeout(() => setText("copy-report", "复制"), 1200);
});

loadStock();
