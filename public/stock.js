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

function companySummaryCn(analysis) {
  const profile = analysis.profile || {};
  const quote = analysis.quote || {};
  const name = profile.companyName || quote.name || analysis.symbol || "该公司";
  const sector = profile.sector || "未分类板块";
  const industry = profile.industry || "未分类行业";
  const country = profile.country || "未知地区";
  const exchange = profile.exchange || quote.exchange || "未知交易所";
  const employees = Number(profile.fullTimeEmployees);
  const employeeText = Number.isFinite(employees) ? `，约有 ${employees.toLocaleString()} 名员工` : "";
  const ipoText = profile.ipoDate ? `，上市日期为 ${profile.ipoDate}` : "";
  const websiteText = profile.website ? `。官网：${profile.website}` : "。";

  return `${name} 属于 ${sector} 板块、${industry} 行业，主要上市地为 ${exchange}，注册/运营地区为 ${country}${employeeText}${ipoText}${websiteText}`;
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
    setText("company-summary-cn", companySummaryCn(analysis));
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

    const news = analysis.news || [];
    setText(
      "news-note",
      news.length
        ? `来自 ${analysis.newsMeta?.source || "FMP 新闻接口"}，最近返回 ${analysis.newsMeta?.count ?? news.length} 条。`
        : analysis.newsMeta?.emptyReason || "FMP 当前没有返回新闻。"
    );
    setHtml(
      "news-list",
      news.length
        ? news
            .slice(0, 6)
            .map(
              (item) => `
                <a href="${item.url || "#"}" target="_blank" rel="noreferrer">
                  <span>${item.publishedDate ? String(item.publishedDate).slice(0, 10) : ""}${item.publisher ? ` · ${item.publisher}` : ""}</span>
                  ${item.title || item.text || "Untitled"}
                </a>
              `
            )
            .join("")
        : `<div class="empty-inline">暂无新闻。可能是 FMP 此股票近期没有新闻、套餐未覆盖该新闻端点，或该端点暂时没有返回数据。</div>`
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
