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

function businessLines(description) {
  const text = String(description || "").toLowerCase();
  const matches = [
    ["smartphone", "智能手机"],
    ["iphone", "智能手机"],
    ["personal computer", "个人电脑"],
    ["mac", "个人电脑"],
    ["tablet", "平板电脑"],
    ["ipad", "平板电脑"],
    ["wearable", "可穿戴设备"],
    ["watch", "可穿戴设备"],
    ["accessories", "配件"],
    ["cloud", "云服务"],
    ["software", "软件"],
    ["subscription", "订阅服务"],
    ["advertising", "广告业务"],
    ["payment", "支付/金融服务"],
    ["semiconductor", "半导体"],
    ["chip", "芯片"],
    ["data center", "数据中心"],
    ["artificial intelligence", "人工智能"],
    ["e-commerce", "电商"],
    ["retail", "零售"],
    ["pharmaceutical", "医药"],
    ["biotechnology", "生物科技"],
    ["bank", "银行金融"],
    ["insurance", "保险"],
    ["energy", "能源"],
    ["oil", "油气"],
    ["restaurant", "餐饮"],
    ["streaming", "流媒体"],
    ["game", "游戏"]
  ];
  return [...new Set(matches.filter(([keyword]) => text.includes(keyword)).map(([, label]) => label))].slice(0, 6);
}

function trendText(value, positiveText, negativeText, flatText = "基本持平") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "数据暂缺";
  if (number > 0.05) return positiveText;
  if (number < -0.05) return negativeText;
  return flatText;
}

function companySummaryCn(analysis) {
  const profile = analysis.profile || {};
  const quote = analysis.quote || {};
  const financials = analysis.financials || {};
  const name = profile.companyName || quote.name || analysis.symbol || "该公司";
  const sector = profile.sector || "未分类板块";
  const industry = profile.industry || "未分类行业";
  const country = profile.country || "未知地区";
  const exchange = profile.exchange || quote.exchange || "未知交易所";
  const employees = Number(profile.fullTimeEmployees);
  const employeeText = Number.isFinite(employees) ? `，约有 ${employees.toLocaleString()} 名员工` : "";
  const lines = businessLines(profile.description);
  const lineText = lines.length ? `，简介中提到的业务包括${lines.join("、")}` : "";
  const revenueTrend = trendText(financials.revenueGrowth, "收入保持增长", "收入出现下滑");
  const incomeTrend = trendText(financials.netIncomeGrowth, "净利润改善", "净利润承压");
  const grossMargin = Number(financials.grossMargin);
  const operatingMargin = Number(financials.operatingMargin);
  const marginText =
    Number.isFinite(grossMargin) && Number.isFinite(operatingMargin)
      ? `毛利率约 ${ratioPct(grossMargin)}，经营利润率约 ${ratioPct(operatingMargin)}`
      : "利润率数据暂缺";
  const fcfText = Number.isFinite(Number(financials.freeCashFlow))
    ? `自由现金流约 ${money(financials.freeCashFlow)}`
    : "自由现金流数据暂缺";
  const debtText = Number.isFinite(Number(financials.debtToEquity))
    ? `债务/权益约 ${Number(financials.debtToEquity).toFixed(2)}`
    : "杠杆数据暂缺";
  const scoreText = analysis.score?.score ? `当前研究优先级为 ${analysis.score.score}/100` : "当前研究优先级暂缺";

  return `主营业务：${name} 属于 ${sector} 板块、${industry} 行业，主要上市地为 ${exchange}，注册/运营地区为 ${country}${employeeText}${lineText}。经营状况：最近年度表现显示，${revenueTrend}，${incomeTrend}；${marginText}，${fcfText}，${debtText}；${scoreText}。`;
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
