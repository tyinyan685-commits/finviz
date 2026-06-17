let presets = [];
let presetId = "momentum_breakout";
let selectedSymbol = "";
let reportText = "";
const snapshotKey = "investment-radar-snapshot";
const presetLogic = {
  momentum_breakout: {
    title: "强势突破逻辑",
    text: "基础过滤：市值大于 20 亿美元、成交量充足、股价大于 10 美元。排序更重视 20 日涨幅、5 日延续、相对成交量、价格是否站上 50/200 日均线以及是否接近 52 周高点。"
  },
  quality_growth: {
    title: "优质成长逻辑",
    text: "基础过滤：大市值、高流动性、正 EPS 或估值不过度异常。排序额外读取年度财报和 key metrics，重视收入增长、净利润增长、经营利润率、自由现金流收益率、ROIC/ROE、EV/EBITDA 和债务水平。"
  },
  pullback_watch: {
    title: "强股回调逻辑",
    text: "基础过滤：中大型、高流动性股票。排序寻找长期趋势仍在 200 日均线上方、短期靠近或略低于 50 日均线、RSI 没有过热的标的，用来观察回调后的二次机会。"
  },
  unusual_volume: {
    title: "异常放量逻辑",
    text: "基础过滤：中小到中大型、成交量足够活跃的股票。排序重视相对成交量、短期涨跌幅和流动性；这个雷达只负责发现异常，后续必须用新闻和财报解释放量原因。"
  },
  earnings_watch: {
    title: "财报观察逻辑",
    text: "基础过滤：未来两周财报相关候选和流动性合格股票。排序更重视财报日期、近期波动和市值，用来安排研究和风险提醒，不直接代表方向判断。"
  }
};

const $ = (id) => document.getElementById(id);

function show(id, visible = true) {
  $(id).classList.toggle("hidden", !visible);
}

function showMainView(view) {
  show("screen-panel", view === "screen");
  show("history-panel", view === "history");
  show("empty", false);
  show("details", false);
  show("research", false);
  const target = view === "history" ? $("history-panel") : $("screen-panel");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setError(message) {
  $("error").textContent = message || "";
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

function renderPresets() {
  $("preset-list").innerHTML = presets
    .map(
      (preset) => `
        <button class="preset ${preset.id === presetId ? "active" : ""}" data-preset="${preset.id}">
          <span>${preset.name}</span>
          <small>${preset.description}</small>
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      presetId = button.dataset.preset;
      renderPresets();
      runScreen();
    });
  });
}

function renderCounts(stocks) {
  const current = stocks.map((stock) => stock.symbol);
  const saved = localStorage.getItem(`${snapshotKey}:${presetId}`);
  const previous = saved ? JSON.parse(saved) : [];
  const previousSet = new Set(previous);
  const currentSet = new Set(current);
  const added = current.filter((symbol) => !previousSet.has(symbol));
  const stayed = current.filter((symbol) => previousSet.has(symbol));
  const removed = previous.filter((symbol) => !currentSet.has(symbol));

  $("count-total").textContent = current.length;
  $("count-added").textContent = added.length;
  $("count-stayed").textContent = stayed.length;
  $("count-removed").textContent = removed.length;
  localStorage.setItem(`${snapshotKey}:${presetId}`, JSON.stringify(current));
}

function renderSectorChips(stocks) {
  const counts = new Map();
  stocks.forEach((stock) => counts.set(stock.sector, (counts.get(stock.sector) || 0) + 1));
  $("sector-chips").innerHTML = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sector, count]) => `<span class="chip">${sector} ${count}</span>`)
    .join("");
}

function renderScreenLogic(preset) {
  const logic = presetLogic[preset.id] || {
    title: "筛选逻辑",
    text: "先做基础股票池过滤，再结合价格、成交量、技术面和可用基本面计算研究优先级。"
  };
  $("screen-logic").innerHTML = `<strong>${logic.title}</strong><span>${logic.text}</span>`;
}

function renderHistoryCoverage(data) {
  const latestPresetIds = new Set(data.runSummary?.latestPresetIds || []);
  const missingPresets = presets.filter((preset) => !latestPresetIds.has(preset.id));
  const total = presets.length || latestPresetIds.size;
  const covered = latestPresetIds.size;
  const complete = total > 0 && covered >= total;

  $("history-coverage").innerHTML = `
    <div>
      <strong>快照覆盖 ${covered}/${total}</strong>
      <span>${complete ? "最新快照已覆盖全部雷达。" : `暂缺：${missingPresets.map((preset) => preset.name).join("、") || "无"}`}</span>
    </div>
    <span class="badge ${complete ? "green-badge" : "warn-badge"}">${complete ? "完整" : "等待快照"}</span>
  `;
}

function renderStocks(data) {
  $("screen-title").textContent = data.preset.name;
  $("screen-time").textContent = `生成时间：${new Date(data.generatedAt).toLocaleString()}`;
  $("data-quality").textContent = data.dataQuality
    ? `技术面覆盖：${data.dataQuality.technicalReady}/${data.dataQuality.total}；基本面覆盖：${data.dataQuality.fundamentalReady || 0}/${data.dataQuality.total}${
        data.dataQuality.cached ? `；缓存 ${data.dataQuality.cacheAgeSeconds || 0}s` : ""
      }`
    : "";
  $("finviz-link").href = data.preset.finvizUrl;
  show("finviz-panel");
  showMainView("screen");
  renderScreenLogic(data.preset);
  renderCounts(data.stocks);
  renderSectorChips(data.stocks);

  $("stock-table").innerHTML = data.stocks
    .slice(0, 40)
    .map(
      (stock, index) => `
        <tr class="${selectedSymbol === stock.symbol ? "selected" : ""}">
          <td>${index + 1}</td>
          <td><strong>${stock.symbol}</strong><span>${stock.name || ""}</span></td>
          <td>${stock.sector || "n/a"}<span>${stock.industry || ""}</span></td>
          <td>${Number.isFinite(stock.price) ? stock.price.toFixed(2) : "n/a"}</td>
          <td class="${Number(stock.changesPercentage) >= 0 ? "green" : "red"}">${pct(stock.changesPercentage)}</td>
          <td class="${Number(stock.change20d) >= 0 ? "green" : "red"}">${pct(stock.change20d)}</td>
          <td>${Number.isFinite(stock.relativeVolume) ? `${stock.relativeVolume.toFixed(1)}x` : "n/a"}</td>
          <td>${money(stock.marketCap)}</td>
          <td>${Number.isFinite(stock.pe) ? stock.pe.toFixed(1) : "n/a"}</td>
          <td><div class="score"><span style="width:${stock.score}%"></span></div>${stock.score}</td>
          <td><button class="ghost" data-analyze="${stock.symbol}">分析</button></td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-analyze]").forEach((button) => {
    button.addEventListener("click", () => analyzeStock(button.dataset.analyze));
  });
}

function renderHistory(data) {
  const latestPresets = data.runSummary?.latestPresetIds || [];
  $("history-meta").textContent = `近 ${data.days} 天；原始记录 ${data.totalRows} 条；最新快照 ${
    data.runSummary?.latestRunDate || "n/a"
  }；覆盖雷达 ${latestPresets.length ? latestPresets.join(", ") : "n/a"}`;
  renderHistoryCoverage(data);
  const candidates = data.candidates || [];
  $("history-table").innerHTML = candidates.length
    ? candidates
    .map(
      (stock) => `
        <tr>
          <td><strong>${stock.symbol}</strong><span>${stock.name || ""}</span></td>
          <td>${stock.sector || "n/a"}<span>${stock.industry || ""}</span></td>
          <td>${stock.isNew ? '<span class="badge green-badge">新增</span>' : '<span class="badge">跟踪</span>'}<span>${
            stock.latestPresetCount || stock.presetCount
          } 个雷达：${(stock.latestPresetIds || stock.presetIds || []).join(", ")}</span></td>
          <td>${stock.seenDays || 1} 天<span>${stock.appearances} 条记录；首次 ${stock.firstDate || "n/a"}</span></td>
          <td><div class="score"><span style="width:${stock.averageScore || 0}%"></span></div>${stock.averageScore ?? "n/a"}</td>
          <td>${stock.latestDate || "n/a"}<span>${money(stock.latestMarketCap)}</span></td>
          <td><button class="ghost" data-analyze="${stock.symbol}">分析</button></td>
        </tr>
      `
    )
    .join("")
    : `<tr><td colspan="7"><strong>暂无历史候选</strong><span>先等待 Vercel Cron 运行，或手动触发 /api/snapshot 保存一次雷达快照。</span></td></tr>`;

  document.querySelectorAll("#history-table [data-analyze]").forEach((button) => {
    button.addEventListener("click", () => analyzeStock(button.dataset.analyze));
  });
  showMainView("history");
}

async function runScreen() {
  $("run-screen").textContent = "扫描中...";
  $("run-screen").disabled = true;
  setError("");
  try {
    const data = await getJson(`/api/screen?preset=${encodeURIComponent(presetId)}`);
    selectedSymbol = data.stocks[0]?.symbol || "";
    renderStocks(data);
  } catch (error) {
    setError(error.message);
  } finally {
    $("run-screen").textContent = "运行筛选";
    $("run-screen").disabled = false;
  }
}

async function loadHistory() {
  $("load-history").textContent = "加载中...";
  $("load-history").disabled = true;
  setError("");
  try {
    const data = await getJson("/api/history?days=30&limit=30");
    renderHistory(data);
  } catch (error) {
    setError(error.message);
  } finally {
    $("load-history").textContent = "加载历史队列";
    $("load-history").disabled = false;
  }
}

function renderList(id, items) {
  $(id).innerHTML = (items || []).map((item) => `<li>${item}</li>`).join("");
}

async function analyzeStock(symbol) {
  if (!symbol) return;
  selectedSymbol = symbol;
  setError("");
  show("details", false);
  show("research", false);
  try {
    const [analysis, technical, reportResponse] = await Promise.all([
      getJson(`/api/analyze?symbol=${encodeURIComponent(symbol)}`),
      getJson(`/api/technical?symbol=${encodeURIComponent(symbol)}`),
      fetch(`/api/report?symbol=${encodeURIComponent(symbol)}`)
    ]);
    reportText = await reportResponse.text();

    $("detail-title").textContent = `${symbol} 研究摘要`;
    $("company-description").textContent = analysis.profile?.description || "暂无公司描述。";
    $("detail-score").textContent = `${analysis.score?.score ?? "n/a"}/100`;
    $("detail-revenue-growth").textContent = ratioPct(analysis.financials?.revenueGrowth);
    $("detail-gross-margin").textContent = ratioPct(analysis.financials?.grossMargin);
    $("detail-fcf").textContent = money(analysis.financials?.freeCashFlow);
    renderList("reason-list", analysis.score?.reasons || []);
    renderList("risk-list", analysis.score?.risks || []);

    $("tech-latest").textContent = technical.latest ?? "n/a";
    $("tech-sma20").textContent = `${pct(technical.sma20Distance)}`;
    $("tech-sma50").textContent = `${pct(technical.sma50Distance)}`;
    $("tech-rsi").textContent = Number.isFinite(technical.rsi14) ? technical.rsi14.toFixed(1) : "n/a";
    renderList("tech-signals", technical.signals || []);

    $("news-list").innerHTML = (analysis.news || [])
      .slice(0, 6)
      .map(
        (item) => `
          <a href="${item.url || "#"}" target="_blank" rel="noreferrer">
            <span>${item.publishedDate ? String(item.publishedDate).slice(0, 10) : ""}</span>
            ${item.title || "Untitled"}
          </a>
        `
      )
      .join("");
    $("report-text").textContent = reportText;
    show("details");
    show("research");
  } catch (error) {
    setError(error.message);
  }
}

async function init() {
  try {
    const data = await getJson("/api/presets");
    presets = data.presets || [];
    renderPresets();
  } catch (error) {
    setError(error.message);
  }
}

$("run-screen").addEventListener("click", runScreen);
$("load-history").addEventListener("click", loadHistory);
$("copy-report").addEventListener("click", async () => {
  if (!reportText) return;
  await navigator.clipboard.writeText(reportText);
  $("copy-report").textContent = "已复制";
  setTimeout(() => {
    $("copy-report").textContent = "复制";
  }, 1200);
});

init();
