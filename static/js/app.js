/* ============================================================
   Sales Dashboard — Chart.js + UI logic (with date filter)
   ============================================================ */

const CURRENCY = new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0
});

let DATA = {
  kpis: {}, monthly: [], daily: [], weekday: [],
  recent: [], top_days: [], months: [], updated_at: "",
  date_range: { min: "", max: "" }
};

const el = id => document.getElementById(id);
const startDateInput = el("startDate");
const endDateInput = el("endDate");
const applyBtn = el("applyFilter");
const resetBtn = el("resetFilter");
const filterInfo = el("filterInfo");

function fmt(n) { return CURRENCY.format(Number(n || 0)); }
function rupeeTick(v) { return "\u20B9" + v; }

function themeInit() {
  const btn = el("themeToggle");
  if (!btn) return;
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = saved === "dark" || (saved === null && prefersDark);
  if (isDark) document.documentElement.classList.add("dark");
  btn.addEventListener("click", () => {
    const nowDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", nowDark ? "dark" : "light");
    if (typeof Chart !== "undefined") {
      Chart.instances.forEach((inst) => inst.resize());
    }
  });
}
themeInit();

async function loadData(startDate, endDate) {
  try {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const url = "/api/data?" + params.toString();
    const res = await fetch(url);
    if (!res.ok) throw new Error("API returned " + res.status);
    DATA = await res.json();
  } catch (err) {
    console.error("Failed to load dashboard data:", err);
    const empty = el("emptyState");
    if (empty) empty.style.display = "block";
  }
  return DATA;
}

function initDateInputs() {
  if (!DATA.date_range) return;
  if (startDateInput && DATA.date_range.min) startDateInput.min = DATA.date_range.min;
  if (endDateInput && DATA.date_range.max) endDateInput.max = DATA.date_range.max;
}

function setFilterInfo() {
  const start = startDateInput.value;
  const end = endDateInput.value;
  if (!start && !end) {
    filterInfo.textContent = "Showing all data";
    filterInfo.style.display = "none";
    return;
  }
  let parts = [];
  if (start) parts.push("From: " + start);
  if (end) parts.push("To: " + end);
  filterInfo.textContent = parts.join("  |  ");
  filterInfo.style.display = "inline";
}
function renderKpis() {
  const grid = el("kpiGrid");
  if (!grid) return;
  const kpis = DATA.kpis || {};
  const bestMonth = kpis.best_month || {};
  const bestDay = kpis.best_day || {};
  const cards = [
    {
      cls: "kpi-collection", icon: "&#128176;", color: "#6366f1",
      label: "Total Collection", value: fmt(kpis.total_collection),
      sub: (kpis.n_days || 0) + " working days",
    },
    {
      cls: "kpi-credit", icon: "&#128178;", color: "#10b981",
      label: "Total Credit", value: fmt(kpis.total_credit),
      sub: "Inward amounts",
    },
    {
      cls: "kpi-debit", icon: "&#128179;", color: "#f59e0b",
      label: "Total Debit", value: fmt(kpis.total_debit),
      sub: "Outward amounts",
    },
    {
      cls: "kpi-grand", icon: "&#128173;", color: "#8b5cf6",
      label: "Grand Total", value: fmt(kpis.grand_total),
      sub: "Collection + Credit + Debit",
    },
    {
      cls: "kpi-avg", icon: "&#128336;", color: "#8b5cf6",
      label: "Avg Daily Collection", value: fmt(kpis.avg_daily_collection),
      sub: "Per working day",
    },
    {
      cls: "kpi-bestmonth", icon: "&#127969;", color: "#3b82f6",
      label: "Best Month", value: bestMonth.name || "--",
      sub: fmt(bestMonth.total) + " total",
    },
    {
      cls: "kpi-bestday", icon: "&#128198;", color: "#ec4899",
      label: "Best Day", value: (bestDay.date ? bestDay.date : "--"),
      sub: bestDay.day || "",
    },
    {
      cls: "kpi-days", icon: "&#128200;", color: "#10b981",
      label: "Working Days", value: String(kpis.n_days || 0),
      sub: "Days with records",
    },
  ];

  grid.innerHTML = cards.map((c) => `
    <div class="kpi-card ${c.cls}">
      <div class="card-icon" style="background:${c.color}22; color:${c.color}">${c.icon}</div>
      <div class="label">${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>
  `).join("");
}
const CHART_COLORS = {
  collection: "rgba(99, 102, 241, 1)",
  credit: "rgba(16, 185, 129, 1)",
  debit: "rgba(245, 158, 11, 1)",
  total: "rgba(139, 92, 246, 1)",
};

function destroyCharts() {
  if (typeof Chart === "undefined") return;
  const instances = Chart.instances;
  if (!instances) return;
  // Chart.js v4 stores instances in a Map
  if (typeof instances.forEach === "function") {
    instances.forEach((inst) => { try { inst.destroy(); } catch (e) {} });
  } else {
    Object.values(instances).forEach((inst) => { try { inst.destroy(); } catch (e) {} });
  }
}

function initCharts() {
  destroyCharts();

  const monthly = DATA.monthly || [];
  const weekday = DATA.weekday || [];

  const textColor = getComputedStyle(document.documentElement).color || "#0f172a";
  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "top", labels: { color: textColor, padding: 20, usePointStyle: true } },
      title: { display: false },
    },
  };

  new Chart(el("trendChart"), {
    type: "line",
    data: {
      labels: monthly.map((m) => m.month),
      datasets: [{
        label: "Total", data: monthly.map((m) => m.total),
        borderColor: CHART_COLORS.total, backgroundColor: CHART_COLORS.total + "15",
        borderWidth: 3, pointRadius: 4, pointHoverRadius: 6, fill: true, tension: 0.35,
      }],
    },
    options: { ...commonOpts, scales: { y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { callback: rupeeTick } } } },
  });

  new Chart(el("mixChart"), {
    type: "bar",
    data: {
      labels: monthly.map((m) => m.month),
      datasets: [
        { label: "Collection", data: monthly.map((m) => m.collection), backgroundColor: CHART_COLORS.collection },
        { label: "Credit", data: monthly.map((m) => m.credit), backgroundColor: CHART_COLORS.credit },
        { label: "Debit", data: monthly.map((m) => m.debit), backgroundColor: CHART_COLORS.debit },
      ],
    },
    options: {
      ...commonOpts,
      scales: { x: { stacked: false, grid: { display: false } }, y: { beginAtZero: true, stacked: false, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { callback: rupeeTick } } },
    },
  });

  const maxTotal = Math.max(...weekday.map((w) => w.total), 0);
  new Chart(el("weekdayChart"), {
    type: "bar",
    data: {
      labels: weekday.map((w) => w.day),
      datasets: [{
        label: "Total", data: weekday.map((w) => w.total),
        backgroundColor: weekday.map((w) => (w.total === maxTotal ? "#10b981" : CHART_COLORS.collection)),
        borderRadius: 6,
      }],
    },
    options: {
      ...commonOpts,
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { callback: rupeeTick } } },
    },
  });

  new Chart(el("monthlyBarChart"), {
    type: "bar",
    data: {
      labels: monthly.map((m) => m.month),
      datasets: [{
        label: "Total", data: monthly.map((m) => m.total),
        backgroundColor: ["#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#8b5cf6", "#ec4899", "#a855f7"],
        borderRadius: 6,
      }],
    },
    options: {
      ...commonOpts,
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.04)" }, ticks: { callback: rupeeTick } } },
    },
  });
}
function renderTable(id, rows, cols) {
  const table = el(id);
  if (!table) return;
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = rows.map((r) => `
    <tr>
      ${cols.map((c) => {
        let v = r[c.key];
        if (c.money) return `<td class="num">${fmt(v)}</td>`;
        return `<td>${v}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

function renderTables() {
  const monthly = DATA.monthly || [];
  const recent = DATA.recent || [];
  const top = DATA.top_days || [];

  renderTable("monthlyTable", monthly, [
    { key: "month", money: false }, { key: "days", money: false },
    { key: "collection", money: true }, { key: "credit", money: true },
    { key: "debit", money: true }, { key: "total", money: true }, { key: "avg_daily", money: true },
  ]);
  renderTable("recentTable", recent, [
    { key: "date", money: false }, { key: "day", money: false },
    { key: "collection", money: true }, { key: "credit", money: true },
    { key: "debit", money: true }, { key: "total", money: true },
  ]);
  renderTable("topTable", top, [
    { key: "date", money: false }, { key: "day", money: false },
    { key: "collection", money: true }, { key: "credit", money: true },
    { key: "debit", money: true }, { key: "total", money: true },
  ]);
}

function setUpdated() {
  const v = el("updatedVal");
  if (v && DATA.updated_at) v.textContent = DATA.updated_at;
}

async function refreshDashboard() {
  await loadData(startDateInput.value || undefined, endDateInput.value || undefined);
  setFilterInfo();
  initDateInputs();
  renderKpis();
  renderTables();   // tables render independently of charts
  setUpdated();

  // Charts in try-catch so a chart error never hides tables/KPIs
  try {
    initCharts();
  } catch (err) {
    console.error("Chart rendering error:", err);
  }

  const empty = el("emptyState");
  const hasData = DATA.kpis && Object.keys(DATA.kpis).length > 0;
  if (empty) empty.style.display = hasData ? "none" : "block";
}

window.addEventListener("DOMContentLoaded", async () => {
  await refreshDashboard();
});

// Button listeners attached at module level (elements exist since script is at end of body)
applyBtn.addEventListener("click", refreshDashboard);
resetBtn.addEventListener("click", () => {
  startDateInput.value = "";
  endDateInput.value = "";
  setFilterInfo();
  refreshDashboard();
});



