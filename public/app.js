let presets = [];
let presetId = "momentum_breakout";
let selectedSymbol = "";
const snapshotKey = "investment-radar-snapshot";
const deepResearchBaseUrl = "https://stocks.wiseain.com/";
const presetLogic = {
  momentum_breakout: {
    title: "强势突破逻辑",
    text: "必须满足：市值大于 20 亿美元、成交量大于 50 万、股价大于 10 美元，至少有 50 条真实日线，20 日涨幅为正，并同时站上 20/50/200 日均线。满足后再按延续性、相对成交量和距 52 周高点排序。缺失任一必需指标不会入选。"
  },
  quality_growth: {
    title: "优质成长逻辑",
    text: "必须满足：市值大于 100 亿美元、年度营收同比增长超过 10%、净利润同比为正、自由现金流为正、ROIC 超过 10% 或 ROE 超过 15%，且 PE 在 5-80 倍。数据来自 FMP 年报和 TTM 指标，缺失任一必需指标不会入选。"
  },
  pullback_watch: {
    title: "强股回调逻辑",
    text: "必须满足：市值 100亿-8000 亿美元、成交量大于 80 万、至少 50 条真实日线、价格位于 200 日均线上方且距 50 日均线 -12% 至 +5%，RSI14 低于 60。它只表示进入回调观察区，不代表已经止跌。"
  },
  unusual_volume: {
    title: "异常放量逻辑",
    text: "必须满足：市值低于 500 亿美元、成交量大于 100 万、至少 50 条真实日线，且当日成交量超过近 20 日均量的 1.15 倍。它只负责发现异常，后续必须用新闻和财报解释放量原因。"
  },
  earnings_watch: {
    title: "财报观察逻辑",
    text: "优先使用 FMP stable earnings-calendar，并在其为空或不可用时尝试 v3 earning_calendar；范围为未来 21 天，同时要求股价大于 10 美元、成交量大于 50 万、市值 20亿-3000 亿美元。两个日历都没有可靠事件时保持空白，不猜日期，也不用普通股票补位。"
  }
};

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

function summaryUrl(symbol) {
  return `/stock.html?symbol=${encodeURIComponent(symbol)}`;
}

function deepResearchUrl(symbol) {
  return `${deepResearchBaseUrl}?symbol=${encodeURIComponent(symbol)}`;
}

function actionButtons(symbol) {
  return `
    <div class="action-group">
      <a class="action-link secondary-action" href="${summaryUrl(symbol)}" target="_blank" rel="noreferrer" title="查看雷达生成的公司、财务、技术面、新闻和 Markdown 摘要">快速摘要</a>
      <a class="action-link primary-action" href="${deepResearchUrl(symbol)}" target="_blank" rel="noreferrer" title="打开深度工具，并把当前股票代码传过去">深度研判</a>
    </div>
  `;
}

function showMainView(view) {
  show("screen-panel", view === "screen");
  show("history-panel", view === "history");
  show("empty", false);
  const target = view === "history" ? $("history-panel") : $("screen-panel");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
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
  $("screen-logic").innerHTML = `
    <details class="info-toggle">
      <summary>${logic.title}</summary>
      <p>${logic.text}</p>
    </details>
    <details class="info-toggle">
      <summary>评分逻辑</summary>
      <p>单股研究优先级从 50 分起算：市值大、成交活跃、短期价格走强、收入/利润增长、利润率较好、中长期趋势站上均线会加分；RSI 过热、PE 过高、杠杆偏高、市值太小会扣分。评分只用于排序研究优先级，不代表买入或卖出建议。</p>
    </details>
  `;
}

function dataQualityText(dataQuality) {
  if (!dataQuality) return "";
  if (!dataQuality.total) {
    const cache = dataQuality.cached ? `；缓存 ${dataQuality.cacheAgeSeconds || 0}s` : "";
    return `${dataQuality.emptyReason || "本次没有股票满足全部必需条件"}${cache}`;
  }
  const technical = dataQuality.technicalApplicable === false
    ? "技术面：该雷达不读取"
    : `技术面覆盖：${dataQuality.technicalReady}/${dataQuality.total}`;
  const fundamentalReady = Number(dataQuality.fundamentalReady || 0);
  const fundamental =
    fundamentalReady > 0
      ? `基本面覆盖：${fundamentalReady}/${dataQuality.total}`
      : "基本面：列表页未批量读取，单股摘要中读取";
  const cache = dataQuality.cached ? `；缓存 ${dataQuality.cacheAgeSeconds || 0}s` : "";
  return `${technical}；${fundamental}${cache}`;
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

function signedPct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "n/a";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function backtestHorizon(group, horizon) {
  const result = group.horizons?.[horizon];
  if (!result?.samples) return '<span class="muted">等待样本</span>';
  return `<strong>${result.samples} 个</strong><span>平均 ${signedPct(result.averageReturnPct)} · 超额 ${signedPct(result.averageExcessReturnPct)}</span><span>上涨率 ${pct(result.positiveRatePct)}</span>`;
}

let backtestDimension = "rating";

const backtestDimensions = {
  rating: { label: "按评级", column: "评级" },
  sector: { label: "按行业", column: "行业" },
  radar: { label: "按雷达", column: "雷达" }
};

function scoreChange(change) {
  const number = Number(change);
  if (!Number.isFinite(number) || number === 0) return "";
  return ` · 较上次 ${number > 0 ? "+" : ""}${number}`;
}

function renderBacktest(data) {
  const collecting = data.status !== "ready";
  setText("backtest-summary", collecting ? "样本积累中" : `${data.maturedFiveDaySamples || 0} 个 5日样本`);
  if (collecting) {
    setHtml(
      "backtest-content",
      `<p>${data.message || "等待真实收益样本成熟。"} 已保存 ${data.capturedSnapshots || 0} 个评级价格快照；未到期记录不会生成胜率。</p>`
    );
    return;
  }
  const dimension = backtestDimensions[backtestDimension] || backtestDimensions.rating;
  const groups = data.breakdowns?.[backtestDimension] || (backtestDimension === "rating" ? data.groups : []) || [];
  const rows = groups
    .map(
      (group) => `<tr>
        <td><strong>${group.label || group.rating}</strong><span>${group.snapshots} 个评级快照</span></td>
        <td>${backtestHorizon(group, 5)}</td>
        <td>${backtestHorizon(group, 20)}</td>
        <td>${backtestHorizon(group, 60)}</td>
        <td>${signedPct(group.averageMaxDrawdown20Pct)}</td>
      </tr>`
    )
    .join("");
  const tabs = Object.entries(backtestDimensions)
    .map(([key, item]) => `<button type="button" class="backtest-tab ${key === backtestDimension ? "active" : ""}" data-backtest-dimension="${key}">${item.label}</button>`)
    .join("");
  setHtml(
    "backtest-content",
    `<p>收益按评级后第 5/20/60 个交易日计算；超额收益以 SPY 为基准。样本太少时只展示，不据此调整模型。</p>
     <div class="backtest-tabs" aria-label="回测分组">${tabs}</div>
     <div class="table-wrap backtest-table-wrap"><table class="backtest-table">
       <thead><tr><th>${dimension.column}</th><th>5日</th><th>20日</th><th>60日</th><th>20日平均最大回撤</th></tr></thead>
       <tbody>${rows || `<tr><td colspan="5"><strong>等待分组样本</strong><span>新快照开始保存该分组字段后自动出现。</span></td></tr>`}</tbody>
     </table></div>`
  );
  document.querySelectorAll("[data-backtest-dimension]").forEach((button) => {
    button.addEventListener("click", () => {
      backtestDimension = button.dataset.backtestDimension;
      renderBacktest(data);
    });
  });
}

async function loadBacktest() {
  setText("backtest-summary", "加载中");
  try {
    renderBacktest(await getJson("/api/backtest?days=180"));
  } catch (error) {
    setText("backtest-summary", "暂不可用");
    setHtml("backtest-content", `<p>评分验证暂时无法读取：${error.message}</p>`);
  }
}

function renderStocks(data) {
  $("screen-title").textContent = data.preset.name;
  $("screen-time").textContent = `生成时间：${new Date(data.generatedAt).toLocaleString()}`;
  $("data-quality").textContent = dataQualityText(data.dataQuality);
  $("finviz-link").href = data.preset.finvizUrl;
  show("finviz-panel");
  showMainView("screen");
  renderScreenLogic(data.preset);
  renderCounts(data.stocks);
  renderSectorChips(data.stocks);

  $("stock-table").innerHTML = data.stocks.length
    ? data.stocks
      .slice(0, 40)
      .map(
      (stock, index) => `
        <tr class="${selectedSymbol === stock.symbol ? "selected" : ""}">
          <td>${index + 1}</td>
          <td><strong>${stock.symbol}</strong><span>${stock.name || ""}</span>${actionButtons(stock.symbol)}</td>
          <td>${stock.sector || "n/a"}<span>${stock.industry || ""}</span></td>
          <td>${Number.isFinite(stock.price) ? stock.price.toFixed(2) : "n/a"}</td>
          <td class="${Number(stock.changesPercentage) >= 0 ? "green" : "red"}">${pct(stock.changesPercentage)}</td>
          <td class="${Number(stock.change20d) >= 0 ? "green" : "red"}">${pct(stock.change20d)}</td>
          <td>${Number.isFinite(stock.relativeVolume) ? `${stock.relativeVolume.toFixed(1)}x` : "n/a"}</td>
          <td>${money(stock.marketCap)}</td>
          <td><div class="score"><span style="width:${stock.score}%"></span></div>${stock.score}</td>
        </tr>
      `
      )
      .join("")
    : `<tr><td colspan="9"><strong>本次没有命中</strong><span>${data.dataQuality?.emptyReason || "没有股票满足全部必需条件。"}</span></td></tr>`;
}

function renderHistory(data) {
  const latestPresets = data.runSummary?.latestPresetIds || [];
  $("history-meta").textContent = `近 ${data.days} 天数据库共有 ${data.totalRows} 条旧新命中记录；按当前质量规则并截至最新完整快照，采用 ${data.aggregationRows ?? data.totalRows} 条，排除 ${data.excludedRows ?? 0} 条旧版无效或未纳入记录；聚合为 ${data.uniqueCandidates ?? "n/a"} 只去重候选，当前展示 ${data.displayedCandidates ?? (data.candidates || []).length} 只；最新完整快照 ${
    data.runSummary?.latestRunDate || "n/a"
  }；覆盖雷达 ${latestPresets.length ? latestPresets.join(", ") : "n/a"}`;
  renderHistoryCoverage(data);
  const candidates = data.candidates || [];
  $("history-table").innerHTML = candidates.length
    ? candidates
    .map(
      (stock) => `
        <tr>
          <td><strong>${stock.symbol}</strong><span>${stock.name || ""}</span>${actionButtons(stock.symbol)}</td>
          <td>${stock.sector || "n/a"}<span>${stock.industry || ""}</span></td>
          <td>${stock.isNew ? '<span class="badge green-badge">新增</span>' : '<span class="badge">跟踪</span>'}<span>${
            stock.latestPresetCount || stock.presetCount
          } 个雷达：${(stock.latestPresetIds || stock.presetIds || []).join(", ")}</span></td>
          <td>${stock.seenDays || 1} 天<span>${stock.appearances} 条记录；首次 ${stock.firstDate || "n/a"}</span></td>
          <td><div class="score"><span style="width:${stock.averageScore || 0}%"></span></div>${stock.averageScore ?? "n/a"}</td>
          <td class="rating-cell">${
            stock.rating
              ? `<strong>${stock.rating.score ?? "n/a"} · ${stock.rating.researchState || stock.rating.label || "待判断"}</strong><span>优先级 ${stock.rating.label || "待判断"} · 风险 ${stock.rating.risk?.level || "待评估"} · 指标完整度 ${stock.rating.confidence ?? 0}%${scoreChange(stock.rating.change?.score)}</span>`
              : '<strong>等待评级</strong><span>每日雷达完成后自动生成</span>'
          }</td>
          <td>${stock.latestDate || "n/a"}<span>${money(stock.latestMarketCap)}</span></td>
        </tr>
      `
    )
    .join("")
    : `<tr><td colspan="7"><strong>暂无历史候选</strong><span>先等待 Vercel Cron 运行，或手动触发 /api/snapshot 保存一次雷达快照。</span></td></tr>`;

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
    void loadBacktest();
  } catch (error) {
    setError(error.message);
  } finally {
    $("load-history").textContent = "加载历史队列";
    $("load-history").disabled = false;
  }
}

function renderList(id, items) {
  setHtml(id, (items || []).map((item) => `<li>${item}</li>`).join(""));
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

init();
