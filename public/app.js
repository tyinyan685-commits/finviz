let presets = [];
let presetId = "momentum_breakout";
let selectedSymbol = "";
let reportText = "";
const snapshotKey = "investment-radar-snapshot";

const $ = (id) => document.getElementById(id);

function show(id, visible = true) {
  $(id).classList.toggle("hidden", !visible);
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
  show("screen-panel");
  show("empty", false);
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
$("copy-report").addEventListener("click", async () => {
  if (!reportText) return;
  await navigator.clipboard.writeText(reportText);
  $("copy-report").textContent = "已复制";
  setTimeout(() => {
    $("copy-report").textContent = "复制";
  }, 1200);
});

init();
