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

function operationSummary(financials) {
  const revenueGrowth = Number(financials.revenueGrowth);
  const netIncomeGrowth = Number(financials.netIncomeGrowth);

  if (!Number.isFinite(revenueGrowth) && !Number.isFinite(netIncomeGrowth)) {
    return "经营状况：当前财报数据不完整，建议先看最近一份年报或季报，确认收入来源、盈利质量和管理层指引。";
  }
  if (revenueGrowth > 0.05 && netIncomeGrowth > 0.05) {
    return "经营状况：最近年度收入和盈利同步改善，业务动能较好，下一步重点看这种增长是否来自主营业务并能否延续。";
  }
  if (revenueGrowth > 0.05 && netIncomeGrowth <= 0.05) {
    return "经营状况：收入端仍有增长，但盈利改善不明显，下一步要重点核对成本、费用和价格压力。";
  }
  if (revenueGrowth <= 0.05 && netIncomeGrowth > 0.05) {
    return "经营状况：收入增长不强，但盈利有所改善，可能来自费用控制、产品结构或一次性因素，需要继续拆解质量。";
  }
  if (revenueGrowth < -0.05 || netIncomeGrowth < -0.05) {
    return "经营状况：最近年度增长或盈利出现压力，适合先作为观察对象，重点查明是周期性波动还是公司竞争力变化。";
  }
  return "经营状况：最近年度整体变化不大，短期更需要结合新闻、行业周期和技术面确认是否有新的催化。";
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

  return `主营业务：${name} 属于 ${sector} 板块、${industry} 行业，主要上市地为 ${exchange}，注册/运营地区为 ${country}${employeeText}${lineText}。${operationSummary(financials)}`;
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
