"use strict";

const ROUTES = {
  overview: {
    label: "Overview",
    title: "Overview · Harbor Deploy",
  },
  deployments: {
    label: "Deployments",
    title: "Deployments · Harbor Deploy",
  },
  settings: {
    label: "Settings",
    title: "Settings · Harbor Deploy",
  },
};

const PROJECTS = {
  "account-portal": "Account Portal",
  "billing-service": "Billing Service",
  "docs-hub": "Docs Hub",
  "edge-router": "Edge Router",
  "email-renderer": "Email Renderer",
  "event-worker": "Event Worker",
};

const BASE_DEPLOYMENTS = [
  {
    id: "dep-0198",
    project: "account-portal",
    branch: "main",
    commit: "8ca09f2",
    environment: "production",
    status: "success",
    duration: "2m 11s",
    timestamp: "4 min ago",
    datetime: "2026-08-27T09:56:00+08:00",
    exactTime: "Aug 27, 2026 · 09:56",
  },
  {
    id: "dep-0197",
    project: "event-worker",
    branch: "feature/retry-policy",
    commit: "2df48b0",
    environment: "preview",
    status: "building",
    duration: "Running",
    timestamp: "9 min ago",
    datetime: "2026-08-27T09:51:00+08:00",
    exactTime: "Aug 27, 2026 · 09:51",
  },
  {
    id: "dep-0196",
    project: "docs-hub",
    branch: "docs/api-reference",
    commit: "91ab7de",
    environment: "preview",
    status: "success",
    duration: "58s",
    timestamp: "17 min ago",
    datetime: "2026-08-27T09:43:00+08:00",
    exactTime: "Aug 27, 2026 · 09:43",
  },
  {
    id: "dep-0195",
    project: "billing-service",
    branch: "main",
    commit: "71c4e90",
    environment: "production",
    status: "failed",
    duration: "1m 08s",
    timestamp: "31 min ago",
    datetime: "2026-08-27T09:29:00+08:00",
    exactTime: "Aug 27, 2026 · 09:29",
  },
  {
    id: "dep-0194",
    project: "account-portal",
    branch: "fix/nav-focus",
    commit: "112e3bf",
    environment: "preview",
    status: "cancelled",
    duration: "—",
    timestamp: "44 min ago",
    datetime: "2026-08-27T09:16:00+08:00",
    exactTime: "Aug 27, 2026 · 09:16",
  },
  {
    id: "dep-0193",
    project: "edge-router",
    branch: "main",
    commit: "039f8d1",
    environment: "staging",
    status: "success",
    duration: "1m 35s",
    timestamp: "1 hr ago",
    datetime: "2026-08-27T08:42:00+08:00",
    exactTime: "Aug 27, 2026 · 08:42",
  },
  {
    id: "dep-0192",
    project: "email-renderer",
    branch: "chore/font-cleanup",
    commit: "a7b901f",
    environment: "preview",
    status: "success",
    duration: "47s",
    timestamp: "2 hrs ago",
    datetime: "2026-08-27T07:58:00+08:00",
    exactTime: "Aug 27, 2026 · 07:58",
  },
  {
    id: "dep-0191",
    project: "billing-service",
    branch: "feature/receipts",
    commit: "e88f2ad",
    environment: "staging",
    status: "success",
    duration: "1m 52s",
    timestamp: "3 hrs ago",
    datetime: "2026-08-27T06:46:00+08:00",
    exactTime: "Aug 27, 2026 · 06:46",
  },
  {
    id: "dep-0190",
    project: "docs-hub",
    branch: "main",
    commit: "51ce7b4",
    environment: "production",
    status: "success",
    duration: "1m 11s",
    timestamp: "4 hrs ago",
    datetime: "2026-08-27T05:32:00+08:00",
    exactTime: "Aug 27, 2026 · 05:32",
  },
  {
    id: "dep-0189",
    project: "event-worker",
    branch: "main",
    commit: "b29a104",
    environment: "production",
    status: "success",
    duration: "2m 03s",
    timestamp: "Yesterday",
    datetime: "2026-08-26T18:08:00+08:00",
    exactTime: "Aug 26, 2026 · 18:08",
  },
  {
    id: "dep-0188",
    project: "account-portal",
    branch: "feature/team-invites",
    commit: "6ea10cc",
    environment: "preview",
    status: "failed",
    duration: "36s",
    timestamp: "Yesterday",
    datetime: "2026-08-26T16:24:00+08:00",
    exactTime: "Aug 26, 2026 · 16:24",
  },
  {
    id: "dep-0187",
    project: "edge-router",
    branch: "hotfix/cache-key",
    commit: "f49d187",
    environment: "production",
    status: "success",
    duration: "1m 29s",
    timestamp: "Yesterday",
    datetime: "2026-08-26T14:11:00+08:00",
    exactTime: "Aug 26, 2026 · 14:11",
  },
  {
    id: "dep-0186",
    project: "email-renderer",
    branch: "feature/digest-layout",
    commit: "4d902ea",
    environment: "staging",
    status: "cancelled",
    duration: "—",
    timestamp: "Yesterday",
    datetime: "2026-08-26T12:39:00+08:00",
    exactTime: "Aug 26, 2026 · 12:39",
  },
  {
    id: "dep-0185",
    project: "billing-service",
    branch: "main",
    commit: "02cc8a4",
    environment: "production",
    status: "success",
    duration: "1m 44s",
    timestamp: "2 days ago",
    datetime: "2026-08-25T17:19:00+08:00",
    exactTime: "Aug 25, 2026 · 17:19",
  },
  {
    id: "dep-0184",
    project: "docs-hub",
    branch: "docs/migration-guide",
    commit: "cf012c7",
    environment: "preview",
    status: "success",
    duration: "54s",
    timestamp: "2 days ago",
    datetime: "2026-08-25T14:47:00+08:00",
    exactTime: "Aug 25, 2026 · 14:47",
  },
  {
    id: "dep-0183",
    project: "event-worker",
    branch: "refactor/queue-client",
    commit: "ca551a8",
    environment: "staging",
    status: "building",
    duration: "Running",
    timestamp: "2 days ago",
    datetime: "2026-08-25T11:08:00+08:00",
    exactTime: "Aug 25, 2026 · 11:08",
  },
  {
    id: "dep-0182",
    project: "account-portal",
    branch: "main",
    commit: "970dd4c",
    environment: "production",
    status: "success",
    duration: "2m 16s",
    timestamp: "3 days ago",
    datetime: "2026-08-24T16:02:00+08:00",
    exactTime: "Aug 24, 2026 · 16:02",
  },
  {
    id: "dep-0181",
    project: "edge-router",
    branch: "feature/request-logs",
    commit: "13fa2bd",
    environment: "preview",
    status: "failed",
    duration: "1m 17s",
    timestamp: "3 days ago",
    datetime: "2026-08-24T10:31:00+08:00",
    exactTime: "Aug 24, 2026 · 10:31",
  },
];

const METRICS = {
  all: {
    successful: "142",
    buildTime: "2m 14s",
    previews: 6,
    failed: "3",
    successTrend: "+12%",
    timeTrend: "18s faster",
    previewTrend: "+2 today",
    failedTrend: "−2",
  },
  production: {
    successful: "62",
    buildTime: "2m 31s",
    previews: 1,
    failed: "1",
    successTrend: "+8%",
    timeTrend: "11s faster",
    previewTrend: "Stable",
    failedTrend: "−1",
  },
  preview: {
    successful: "71",
    buildTime: "1m 42s",
    previews: 4,
    failed: "2",
    successTrend: "+16%",
    timeTrend: "24s faster",
    previewTrend: "+2 today",
    failedTrend: "No change",
  },
  staging: {
    successful: "9",
    buildTime: "1m 56s",
    previews: 1,
    failed: "0",
    successTrend: "+1 build",
    timeTrend: "7s faster",
    previewTrend: "Stable",
    failedTrend: "None",
  },
};

const ACTIVITY = {
  all: [
    { label: "Aug 21", short: "Fri", success: 12, failed: 1, cancelled: 0 },
    { label: "Aug 22", short: "Sat", success: 15, failed: 0, cancelled: 1 },
    { label: "Aug 23", short: "Sun", success: 9, failed: 2, cancelled: 1 },
    { label: "Aug 24", short: "Mon", success: 18, failed: 1, cancelled: 0 },
    { label: "Aug 25", short: "Tue", success: 14, failed: 3, cancelled: 0 },
    { label: "Aug 26", short: "Wed", success: 16, failed: 0, cancelled: 2 },
    { label: "Aug 27", short: "Thu", success: 20, failed: 1, cancelled: 0 },
  ],
  production: [
    { label: "Aug 21", short: "Fri", success: 5, failed: 0, cancelled: 0 },
    { label: "Aug 22", short: "Sat", success: 7, failed: 0, cancelled: 0 },
    { label: "Aug 23", short: "Sun", success: 4, failed: 1, cancelled: 0 },
    { label: "Aug 24", short: "Mon", success: 8, failed: 0, cancelled: 0 },
    { label: "Aug 25", short: "Tue", success: 6, failed: 1, cancelled: 0 },
    { label: "Aug 26", short: "Wed", success: 8, failed: 0, cancelled: 1 },
    { label: "Aug 27", short: "Thu", success: 10, failed: 0, cancelled: 0 },
  ],
  preview: [
    { label: "Aug 21", short: "Fri", success: 6, failed: 1, cancelled: 0 },
    { label: "Aug 22", short: "Sat", success: 7, failed: 0, cancelled: 1 },
    { label: "Aug 23", short: "Sun", success: 4, failed: 1, cancelled: 1 },
    { label: "Aug 24", short: "Mon", success: 9, failed: 1, cancelled: 0 },
    { label: "Aug 25", short: "Tue", success: 7, failed: 2, cancelled: 0 },
    { label: "Aug 26", short: "Wed", success: 7, failed: 0, cancelled: 1 },
    { label: "Aug 27", short: "Thu", success: 9, failed: 1, cancelled: 0 },
  ],
  staging: [
    { label: "Aug 21", short: "Fri", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 22", short: "Sat", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 23", short: "Sun", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 24", short: "Mon", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 25", short: "Tue", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 26", short: "Wed", success: 1, failed: 0, cancelled: 0 },
    { label: "Aug 27", short: "Thu", success: 1, failed: 0, cancelled: 0 },
  ],
};

const DEFAULT_SETTINGS = Object.freeze({
  projectName: "Harbor Console",
  projectSlug: "harbor-console",
  productionBranch: "main",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  runtime: "node-22",
  notifyFailures: true,
  notifyProduction: true,
  notifyPreviews: false,
});

const SETTINGS_STORAGE_KEY = "harbor-deploy-settings-v1";
const PAGE_SIZE = 6;

const app = document.querySelector("#app");
const viewLabel = document.querySelector("#view-label");
const routeStatus = document.querySelector("#route-status");
const toastRegion = document.querySelector("#toast-region");
const modalRoot = document.querySelector("#modal-root");

const state = {
  route: "overview",
  overviewEnvironment: "all",
  deploymentFilters: {
    search: "",
    status: "all",
    environment: "all",
    page: 1,
  },
  settings: loadSettings(),
  userDeployments: [],
  nextDeploymentNumber: 199,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function optionSelected(value, current) {
  return value === current ? " selected" : "";
}

function checked(value) {
  return value ? " checked" : "";
}

function loadSettings() {
  try {
    const saved = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!saved) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };

    const merged = { ...DEFAULT_SETTINGS };
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      if (typeof parsed[key] === typeof DEFAULT_SETTINGS[key]) {
        merged[key] = parsed[key];
      }
    });
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function allDeployments() {
  return [...state.userDeployments, ...BASE_DEPLOYMENTS];
}

function projectName(slug) {
  return PROJECTS[slug] || slug;
}

function getRouteFromHash() {
  const candidate = window.location.hash.replace(/^#\/?/, "").split(/[?&]/)[0];
  return Object.prototype.hasOwnProperty.call(ROUTES, candidate)
    ? candidate
    : "overview";
}

function updateNavigation(route) {
  document.querySelectorAll(".nav-link").forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function renderRoute({ announce = true } = {}) {
  const route = getRouteFromHash();
  state.route = route;
  closeOpenModal();

  if (route === "overview") app.innerHTML = overviewTemplate();
  if (route === "deployments") app.innerHTML = deploymentsTemplate();
  if (route === "settings") app.innerHTML = settingsTemplate();

  document.title = ROUTES[route].title;
  viewLabel.textContent = ROUTES[route].label;
  updateNavigation(route);

  if (announce) {
    routeStatus.textContent = `${ROUTES[route].label} view loaded`;
  }
}

function overviewTemplate() {
  const environment = state.overviewEnvironment;
  const metric = { ...METRICS[environment] };
  const createdBuilding = state.userDeployments.filter(
    (deployment) =>
      deployment.status === "building" &&
      (environment === "all" || deployment.environment === environment),
  ).length;
  metric.previews += createdBuilding;

  const recent = allDeployments()
    .filter(
      (deployment) =>
        environment === "all" || deployment.environment === environment,
    )
    .slice(0, 6);

  return `
    <section class="page" aria-labelledby="overview-title">
      <header class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Deployment workspace</span>
          <h1 id="overview-title" tabindex="-1">Northstar workspace</h1>
          <p>Monitor delivery health, inspect recent releases, and start a new deployment from one place.</p>
        </div>
        <div class="header-actions">
          <label class="sr-only" for="overview-environment">Environment scope</label>
          <select class="select-control compact-select" id="overview-environment" data-control="overview-environment">
            <option value="all"${optionSelected("all", environment)}>All environments</option>
            <option value="production"${optionSelected("production", environment)}>Production</option>
            <option value="preview"${optionSelected("preview", environment)}>Preview</option>
            <option value="staging"${optionSelected("staging", environment)}>Staging</option>
          </select>
          <button class="button button-primary" type="button" data-action="new-deployment">
            <span class="button-glyph" aria-hidden="true">+</span>
            New deployment
          </button>
        </div>
      </header>

      <section class="metric-grid" aria-label="Deployment metrics">
        ${metricCard("Successful builds", metric.successful, "SB", "success", metric.successTrend, "vs. last 30 days")}
        ${metricCard("Median build time", metric.buildTime, "BT", "", metric.timeTrend, "vs. last 30 days")}
        ${metricCard("Active previews", String(metric.previews), "AP", "preview", metric.previewTrend, "across all projects")}
        ${metricCard("Failed builds", metric.failed, "FB", "failed", metric.failedTrend, "vs. last 30 days", true)}
      </section>

      <section class="overview-grid" aria-label="Deployment activity overview">
        ${activityTemplate(environment)}
        ${activitySummaryTemplate(environment)}
      </section>

      <section class="panel" aria-labelledby="recent-deployments-title">
        <div class="card-heading">
          <div>
            <h2 id="recent-deployments-title">Recent deployments</h2>
            <p>The latest activity${environment === "all" ? " across every environment" : ` in ${escapeHtml(environment)}`}.</p>
          </div>
          <a class="button button-quiet" href="#/deployments">View all <span aria-hidden="true">→</span></a>
        </div>
        ${deploymentTable(recent)}
        <div class="table-footer">
          <span>Showing ${recent.length} most recent deployments</span>
          <span>Updated just now</span>
        </div>
      </section>
    </section>
  `;
}

function metricCard(label, value, mark, markClass, trend, comparison, negative = false) {
  return `
    <article class="metric-card">
      <div class="metric-top">
        <span class="metric-label">${escapeHtml(label)}</span>
        <span class="metric-mark ${escapeHtml(markClass)}" aria-hidden="true">${escapeHtml(mark)}</span>
      </div>
      <strong class="metric-value">${escapeHtml(value)}</strong>
      <div class="metric-meta">
        <span class="metric-trend${negative ? " negative" : ""}">${escapeHtml(trend)}</span>
        <span>${escapeHtml(comparison)}</span>
      </div>
    </article>
  `;
}

function activityTemplate(environment) {
  const data = ACTIVITY[environment];
  const totals = sumActivity(data);
  const largestDay = Math.max(...data.map((day) => day.success + day.failed + day.cancelled));
  const scopeLabel = environment === "all" ? "all environments" : environment;
  const accessibleSummary = data
    .map(
      (day) =>
        `${day.label}: ${day.success} successful, ${day.failed} failed, and ${day.cancelled} cancelled`,
    )
    .join(". ");

  const bars = data
    .map((day, index) => {
      const dayTotal = day.success + day.failed + day.cancelled;
      const height = Math.max(8, Math.round((dayTotal / largestDay) * 100));
      const segments = [
        day.success > 0
          ? `<span class="bar-segment success" style="flex-grow: ${day.success}" aria-hidden="true"></span>`
          : "",
        day.failed > 0
          ? `<span class="bar-segment failed" style="flex-grow: ${day.failed}" aria-hidden="true"></span>`
          : "",
        day.cancelled > 0
          ? `<span class="bar-segment cancelled" style="flex-grow: ${day.cancelled}" aria-hidden="true"></span>`
          : "",
      ].join("");

      return `
        <div class="bar-column" aria-label="${escapeHtml(day.label)}: ${day.success} successful, ${day.failed} failed, ${day.cancelled} cancelled">
          <div class="bar-track">
            <div class="bar-fill" style="height: ${height}%; animation-delay: ${index * 0.04}s">
              ${segments}
            </div>
          </div>
          <span class="bar-label" aria-hidden="true">${escapeHtml(day.short)}</span>
        </div>
      `;
    })
    .join("");

  return `
    <figure class="panel" aria-labelledby="activity-title" aria-describedby="activity-description">
      <figcaption class="card-heading">
        <div>
          <h2 id="activity-title">Seven-day activity</h2>
          <p>Daily deployment outcomes for ${escapeHtml(scopeLabel)}.</p>
        </div>
        <div class="card-heading-actions">
          <div class="legend" aria-label="Chart legend">
            <span class="legend-item"><span class="legend-dot success" aria-hidden="true"></span>Success</span>
            <span class="legend-item"><span class="legend-dot failed" aria-hidden="true"></span>Failed</span>
            <span class="legend-item"><span class="legend-dot cancelled" aria-hidden="true"></span>Cancelled</span>
          </div>
          <span class="activity-total">
            <strong>${totals.total}</strong>
            <span>deployments</span>
          </span>
        </div>
      </figcaption>
      <div class="panel-body">
        <p id="activity-description" class="sr-only">${escapeHtml(accessibleSummary)}.</p>
        <div class="activity-chart" role="img" aria-label="Stacked bar chart of deployment outcomes from August 21 through August 27">
          <div class="chart-grid" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          ${bars}
        </div>
      </div>
    </figure>
  `;
}

function activitySummaryTemplate(environment) {
  const activity = ACTIVITY[environment];
  const totals = sumActivity(activity);
  const successRate = totals.total
    ? Math.round((totals.success / totals.total) * 100)
    : 0;
  const busiestDay = activity.reduce((busiest, day) => {
    const busiestTotal = busiest.success + busiest.failed + busiest.cancelled;
    const dayTotal = day.success + day.failed + day.cancelled;
    return dayTotal > busiestTotal ? day : busiest;
  }, activity[0]);

  return `
    <section class="panel activity-summary" aria-labelledby="signals-title">
      <div class="card-heading">
        <div>
          <h2 id="signals-title">Delivery signals</h2>
          <p>A compact read on this week.</p>
        </div>
      </div>
      <div class="panel-body summary-list">
        <div class="summary-item">
          <span>Success rate<small>Completed without errors</small></span>
          <strong>${successRate}%</strong>
        </div>
        <div class="summary-item">
          <span>Busiest day<small>Highest deployment volume</small></span>
          <strong>${escapeHtml(busiestDay.short)}</strong>
        </div>
        <div class="summary-item">
          <span>Queue health<small>Current median wait</small></span>
          <strong>12s</strong>
        </div>
      </div>
    </section>
  `;
}

function sumActivity(data) {
  return data.reduce(
    (totals, day) => {
      totals.success += day.success;
      totals.failed += day.failed;
      totals.cancelled += day.cancelled;
      totals.total += day.success + day.failed + day.cancelled;
      return totals;
    },
    { success: 0, failed: 0, cancelled: 0, total: 0 },
  );
}

function deploymentsTemplate() {
  const filters = state.deploymentFilters;

  return `
    <section class="page" aria-labelledby="deployments-title">
      <header class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Release history</span>
          <h1 id="deployments-title" tabindex="-1">Deployments</h1>
          <p>Search and filter releases across the Northstar workspace.</p>
        </div>
        <div class="header-actions">
          <button class="button button-primary" type="button" data-action="new-deployment">
            <span class="button-glyph" aria-hidden="true">+</span>
            New deployment
          </button>
        </div>
      </header>

      <section class="panel filter-panel" aria-labelledby="filters-title">
        <h2 id="filters-title" class="sr-only">Deployment filters</h2>
        <div class="filters">
          <div class="field">
            <label for="deployment-search">Search deployments</label>
            <div class="search-wrap">
              <input
                class="text-control"
                id="deployment-search"
                type="search"
                autocomplete="off"
                placeholder="Project, branch, or commit"
                value="${escapeHtml(filters.search)}"
                data-control="deployment-search"
              />
            </div>
          </div>
          <div class="field">
            <label for="status-filter">Status</label>
            <select class="select-control" id="status-filter" data-control="status-filter">
              <option value="all"${optionSelected("all", filters.status)}>All statuses</option>
              <option value="success"${optionSelected("success", filters.status)}>Success</option>
              <option value="building"${optionSelected("building", filters.status)}>Building</option>
              <option value="cancelled"${optionSelected("cancelled", filters.status)}>Cancelled</option>
              <option value="failed"${optionSelected("failed", filters.status)}>Failed</option>
            </select>
          </div>
          <div class="field">
            <label for="environment-filter">Environment</label>
            <select class="select-control" id="environment-filter" data-control="environment-filter">
              <option value="all"${optionSelected("all", filters.environment)}>All environments</option>
              <option value="production"${optionSelected("production", filters.environment)}>Production</option>
              <option value="preview"${optionSelected("preview", filters.environment)}>Preview</option>
              <option value="staging"${optionSelected("staging", filters.environment)}>Staging</option>
            </select>
          </div>
          <button class="button button-quiet clear-filter" type="button" data-action="clear-filters">Clear filters</button>
        </div>
      </section>

      <section class="panel" aria-labelledby="deployment-results-title">
        <h2 id="deployment-results-title" class="sr-only">Deployment results</h2>
        <div id="deployment-results">${deploymentResultsTemplate()}</div>
      </section>
    </section>
  `;
}

function getFilteredDeployments() {
  const { search, status, environment } = state.deploymentFilters;
  const query = search.trim().toLowerCase();

  return allDeployments().filter((deployment) => {
    const searchable = [
      deployment.id,
      deployment.project,
      projectName(deployment.project),
      deployment.branch,
      deployment.commit,
      deployment.environment,
      deployment.status,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchable.includes(query);
    const matchesStatus = status === "all" || deployment.status === status;
    const matchesEnvironment =
      environment === "all" || deployment.environment === environment;
    return matchesSearch && matchesStatus && matchesEnvironment;
  });
}

function deploymentResultsTemplate() {
  const filtered = getFilteredDeployments();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.deploymentFilters.page = Math.min(state.deploymentFilters.page, totalPages);
  const currentPage = state.deploymentFilters.page;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const currentRows = filtered.slice(startIndex, startIndex + PAGE_SIZE);
  const start = filtered.length ? startIndex + 1 : 0;
  const end = Math.min(startIndex + PAGE_SIZE, filtered.length);
  const total = allDeployments().length;

  const activeFilterCount = [
    state.deploymentFilters.search.trim() !== "",
    state.deploymentFilters.status !== "all",
    state.deploymentFilters.environment !== "all",
  ].filter(Boolean).length;

  return `
    <div class="filter-summary" id="deployment-result-summary" role="status" tabindex="-1">
      <span><strong>${filtered.length}</strong> matching deployment${filtered.length === 1 ? "" : "s"}</span>
      <span>${activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : "No active filters"}</span>
    </div>
    ${
      currentRows.length
        ? deploymentTable(currentRows)
        : `<div class="empty-state">
            <span class="empty-mark" aria-hidden="true">0</span>
            <h2>No deployments found</h2>
            <p>Try a different project name, branch, commit, status, or environment.</p>
            <button class="button button-secondary" type="button" data-action="clear-filters">Clear filters</button>
          </div>`
    }
    <div class="table-footer">
      <span>Showing ${start}–${end} of ${filtered.length} results · ${total} total</span>
      ${paginationTemplate(currentPage, totalPages, filtered.length)}
    </div>
  `;
}

function paginationTemplate(currentPage, totalPages, resultCount) {
  if (!resultCount) return "<span>No pages</span>";

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .map(
      (page) => `
        <button
          class="page-button${page === currentPage ? " current" : ""}"
          type="button"
          data-page="${page}"
          aria-label="Page ${page}"
          ${page === currentPage ? 'aria-current="page" disabled' : ""}
        >${page}</button>
      `,
    )
    .join("");

  return `
    <nav class="pagination" aria-label="Deployment result pages">
      <button class="page-button" type="button" data-page="${currentPage - 1}" aria-label="Previous page" ${currentPage === 1 ? "disabled" : ""}>←</button>
      <span class="pagination-pages">${pages}</span>
      <button class="page-button" type="button" data-page="${currentPage + 1}" aria-label="Next page" ${currentPage === totalPages ? "disabled" : ""}>→</button>
    </nav>
  `;
}

function deploymentTable(deployments) {
  return `
    <div class="table-scroll">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Branch</th>
            <th scope="col">Commit</th>
            <th scope="col">Environment</th>
            <th scope="col">Status</th>
            <th scope="col">Duration</th>
            <th scope="col">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${deployments.map(deploymentRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function deploymentRow(deployment) {
  return `
    <tr>
      <td data-label="Project">
        <span class="cell-main">
          <strong>${escapeHtml(projectName(deployment.project))}</strong>
          <small>${escapeHtml(deployment.id)}</small>
        </span>
      </td>
      <td data-label="Branch"><span class="branch-name">${escapeHtml(deployment.branch)}</span></td>
      <td data-label="Commit"><code class="commit-code">${escapeHtml(deployment.commit)}</code></td>
      <td data-label="Environment"><span class="environment-name">${escapeHtml(titleCase(deployment.environment))}</span></td>
      <td data-label="Status"><span class="status-badge ${escapeHtml(deployment.status)}">${escapeHtml(deployment.status)}</span></td>
      <td data-label="Duration"><span class="duration-value">${escapeHtml(deployment.duration)}</span></td>
      <td data-label="Timestamp">
        <span class="cell-main">
          <time class="timestamp-value" datetime="${escapeHtml(deployment.datetime)}">${escapeHtml(deployment.timestamp)}</time>
          <span class="timestamp-exact">${escapeHtml(deployment.exactTime)}</span>
        </span>
      </td>
    </tr>
  `;
}

function settingsTemplate() {
  const settings = state.settings;

  return `
    <section class="page" aria-labelledby="settings-title">
      <header class="page-header">
        <div class="page-heading">
          <span class="eyebrow">Project configuration</span>
          <h1 id="settings-title" tabindex="-1">Settings</h1>
          <p>Manage project identity, build defaults, runtime, and local notification preferences.</p>
        </div>
      </header>

      <form class="settings-form" id="settings-form">
        <div class="settings-layout">
          <div class="settings-main">
            <section class="settings-card" aria-labelledby="identity-title">
              <h2 id="identity-title">Project identity</h2>
              <p>These details identify the project throughout the workspace.</p>
              <div class="form-grid">
                <div class="field">
                  <label for="project-name">Project name</label>
                  <input class="text-control" id="project-name" name="projectName" value="${escapeHtml(settings.projectName)}" required maxlength="48" />
                </div>
                <div class="field">
                  <label for="project-slug">Project slug</label>
                  <input class="text-control code-input" id="project-slug" name="projectSlug" value="${escapeHtml(settings.projectSlug)}" required maxlength="48" pattern="[a-z0-9-]+" aria-describedby="slug-hint" />
                  <span class="input-hint" id="slug-hint">Lowercase letters, numbers, and hyphens.</span>
                </div>
                <div class="field field-full">
                  <label for="production-branch">Default production branch</label>
                  <input class="text-control code-input" id="production-branch" name="productionBranch" value="${escapeHtml(settings.productionBranch)}" required maxlength="80" pattern="[A-Za-z0-9._/-]+" />
                </div>
              </div>
            </section>

            <section class="settings-card" aria-labelledby="build-title">
              <h2 id="build-title">Build and runtime</h2>
              <p>Commands run locally in this static showcase; no service is contacted.</p>
              <div class="form-grid">
                <div class="field field-full">
                  <label for="build-command">Build command</label>
                  <input class="text-control code-input" id="build-command" name="buildCommand" value="${escapeHtml(settings.buildCommand)}" required maxlength="120" />
                </div>
                <div class="field">
                  <label for="output-directory">Output directory</label>
                  <input class="text-control code-input" id="output-directory" name="outputDirectory" value="${escapeHtml(settings.outputDirectory)}" required maxlength="80" />
                </div>
                <div class="field">
                  <label for="runtime-version">Runtime version</label>
                  <select class="select-control" id="runtime-version" name="runtime">
                    <option value="node-20"${optionSelected("node-20", settings.runtime)}>Node.js 20.x</option>
                    <option value="node-22"${optionSelected("node-22", settings.runtime)}>Node.js 22.x</option>
                    <option value="node-24"${optionSelected("node-24", settings.runtime)}>Node.js 24.x</option>
                    <option value="bun-1.2"${optionSelected("bun-1.2", settings.runtime)}>Bun 1.2</option>
                  </select>
                </div>
              </div>
            </section>
          </div>

          <aside class="settings-side" aria-label="Notification and reset settings">
            <section class="settings-card" aria-labelledby="notifications-title">
              <h2 id="notifications-title">Notifications</h2>
              <p>Choose which deployment events should surface in this browser.</p>
              <div class="switch-list">
                ${switchTemplate("notify-failures", "notifyFailures", "Failed deployments", "Alert when a build exits with an error.", settings.notifyFailures)}
                ${switchTemplate("notify-production", "notifyProduction", "Production releases", "Confirm successful production deployments.", settings.notifyProduction)}
                ${switchTemplate("notify-previews", "notifyPreviews", "Preview ready", "Alert when a preview environment is ready.", settings.notifyPreviews)}
              </div>
            </section>

            <section class="settings-card danger-zone" aria-labelledby="danger-title">
              <h2 id="danger-title">Danger zone</h2>
              <p>This local-only action restores the showcase to its original sample state.</p>
              <div class="danger-action">
                <div>
                  <strong>Reset workspace demo</strong>
                  <span>Clear saved settings and session deployments.</span>
                </div>
                <button class="button button-danger" type="button" data-action="reset-workspace">Reset demo</button>
              </div>
            </section>
          </aside>
        </div>

        <div class="settings-footer">
          <span class="settings-status" id="settings-status" role="status">Settings are up to date</span>
          <div class="form-actions">
            <button class="button button-secondary" type="button" data-action="discard-settings">Discard changes</button>
            <button class="button button-primary" type="submit">Save settings</button>
          </div>
        </div>
      </form>
    </section>
  `;
}

function switchTemplate(id, name, label, description, isChecked) {
  return `
    <label class="switch-row" for="${id}">
      <span class="switch-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(description)}</span>
      </span>
      <span class="switch">
        <input id="${id}" name="${name}" type="checkbox" role="switch"${checked(isChecked)} />
        <span class="switch-track" aria-hidden="true"></span>
      </span>
    </label>
  `;
}

function updateDeploymentResults({ focusSummary = false } = {}) {
  const results = document.querySelector("#deployment-results");
  if (!results) return;
  results.innerHTML = deploymentResultsTemplate();
  if (focusSummary) {
    document.querySelector("#deployment-result-summary")?.focus();
  }
}

function clearFilters() {
  state.deploymentFilters = {
    search: "",
    status: "all",
    environment: "all",
    page: 1,
  };
  const search = document.querySelector("#deployment-search");
  const status = document.querySelector("#status-filter");
  const environment = document.querySelector("#environment-filter");
  if (search) search.value = "";
  if (status) status.value = "all";
  if (environment) environment.value = "all";
  updateDeploymentResults({ focusSummary: true });
}

function setSettingsStatus(type, message) {
  const status = document.querySelector("#settings-status");
  if (!status) return;
  status.classList.remove("unsaved", "saved");
  if (type) status.classList.add(type);
  status.textContent = message;
}

function saveSettings(form) {
  const formData = new FormData(form);
  const nextSettings = {
    projectName: String(formData.get("projectName") || "").trim(),
    projectSlug: String(formData.get("projectSlug") || "").trim(),
    productionBranch: String(formData.get("productionBranch") || "").trim(),
    buildCommand: String(formData.get("buildCommand") || "").trim(),
    outputDirectory: String(formData.get("outputDirectory") || "").trim(),
    runtime: String(formData.get("runtime") || DEFAULT_SETTINGS.runtime),
    notifyFailures: formData.has("notifyFailures"),
    notifyProduction: formData.has("notifyProduction"),
    notifyPreviews: formData.has("notifyPreviews"),
  };

  state.settings = nextSettings;
  let persisted = true;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  } catch {
    persisted = false;
  }

  setSettingsStatus("saved", persisted ? "Saved in this browser" : "Saved for this tab");
  showToast(persisted ? "Project settings saved" : "Settings saved for this tab");
}

function openNewDeployment() {
  closeOpenModal();
  const defaultEnvironment =
    state.overviewEnvironment === "all" ? "preview" : state.overviewEnvironment;

  modalRoot.innerHTML = `
    <dialog class="modal" id="new-deployment-dialog" aria-labelledby="new-deployment-title">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Create release</span>
          <h2 id="new-deployment-title">New deployment</h2>
          <p>Queue a deployment in this local showcase.</p>
        </div>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close new deployment dialog">×</button>
      </div>
      <form class="modal-form" id="new-deployment-form">
        <div class="field">
          <label for="deployment-project">Project</label>
          <select class="select-control" id="deployment-project" name="project">
            ${Object.entries(PROJECTS)
              .map(([slug, name]) => `<option value="${escapeHtml(slug)}">${escapeHtml(name)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label for="deployment-branch">Branch</label>
          <input class="text-control code-input" id="deployment-branch" name="branch" value="main" required maxlength="80" pattern="[A-Za-z0-9._/-]+" />
        </div>
        <div class="field">
          <label for="deployment-environment">Environment</label>
          <select class="select-control" id="deployment-environment" name="environment">
            <option value="preview"${optionSelected("preview", defaultEnvironment)}>Preview</option>
            <option value="staging"${optionSelected("staging", defaultEnvironment)}>Staging</option>
            <option value="production"${optionSelected("production", defaultEnvironment)}>Production</option>
          </select>
        </div>
        <p class="confirmation-copy">The deployment will be added as <strong>building</strong>. This demo does not run commands or contact a remote service.</p>
        <div class="modal-actions">
          <button class="button button-secondary" type="button" data-action="close-modal">Cancel</button>
          <button class="button button-primary" type="submit">Start deployment</button>
        </div>
      </form>
    </dialog>
  `;

  showDialog(document.querySelector("#new-deployment-dialog"));
}

function createDeployment(form) {
  const formData = new FormData(form);
  const project = String(formData.get("project") || "account-portal");
  const branch = String(formData.get("branch") || "main").trim();
  const environment = String(formData.get("environment") || "preview");
  const deploymentNumber = state.nextDeploymentNumber++;

  state.userDeployments.unshift({
    id: `dep-0${deploymentNumber}`,
    project,
    branch,
    commit: "queued",
    environment,
    status: "building",
    duration: "Running",
    timestamp: "Just now",
    datetime: "2026-08-27T10:00:00+08:00",
    exactTime: "Aug 27, 2026 · 10:00",
  });

  closeOpenModal();
  renderRoute({ announce: false });
  showToast(`${projectName(project)} deployment queued`);
}

function openResetDialog() {
  closeOpenModal();
  modalRoot.innerHTML = `
    <dialog class="modal" id="reset-dialog" aria-labelledby="reset-title">
      <div class="modal-header">
        <div>
          <span class="eyebrow">Local reset</span>
          <h2 id="reset-title">Reset workspace demo?</h2>
          <p>This clears settings saved by Harbor Deploy in this browser.</p>
        </div>
        <button class="modal-close" type="button" data-action="close-modal" aria-label="Close reset dialog">×</button>
      </div>
      <form class="modal-form" id="reset-form">
        <p class="modal-copy">Any deployments created during this session will also be removed. The original sample data stays available.</p>
        <div class="field">
          <label for="reset-confirmation">Type <strong>Northstar</strong> to confirm</label>
          <input class="text-control" id="reset-confirmation" name="confirmation" autocomplete="off" required data-control="reset-confirmation" />
        </div>
        <div class="modal-actions">
          <button class="button button-secondary" type="button" data-action="close-modal">Cancel</button>
          <button class="button button-danger" id="confirm-reset" type="submit" disabled>Reset demo</button>
        </div>
      </form>
    </dialog>
  `;

  showDialog(document.querySelector("#reset-dialog"));
}

function resetWorkspace() {
  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // The in-memory reset below still keeps the local showcase usable.
  }
  state.settings = { ...DEFAULT_SETTINGS };
  state.userDeployments = [];
  state.overviewEnvironment = "all";
  state.deploymentFilters = {
    search: "",
    status: "all",
    environment: "all",
    page: 1,
  };
  closeOpenModal();
  renderRoute({ announce: false });
  showToast("Workspace demo reset");
}

function showDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
  dialog.addEventListener(
    "close",
    () => {
      if (modalRoot.contains(dialog)) modalRoot.replaceChildren();
    },
    { once: true },
  );
}

function closeOpenModal() {
  const dialog = modalRoot.querySelector("dialog");
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === "function") {
    dialog.close();
  }
  modalRoot.replaceChildren();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  toastRegion.replaceChildren(toast);
  window.setTimeout(() => {
    if (toastRegion.contains(toast)) toast.remove();
  }, 3600);
}

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    if (action === "new-deployment") openNewDeployment();
    if (action === "close-modal") closeOpenModal();
    if (action === "clear-filters") clearFilters();
    if (action === "discard-settings") {
      state.settings = loadSettings();
      renderRoute({ announce: false });
      showToast("Unsaved changes discarded");
    }
    if (action === "reset-workspace") openResetDialog();
  }

  const pageTarget = event.target.closest("[data-page]");
  if (pageTarget && !pageTarget.disabled) {
    const nextPage = Number(pageTarget.dataset.page);
    if (Number.isInteger(nextPage) && nextPage > 0) {
      state.deploymentFilters.page = nextPage;
      updateDeploymentResults({ focusSummary: true });
    }
  }

  if (event.target?.tagName === "DIALOG" && event.target.open) {
    const bounds = event.target.getBoundingClientRect();
    const outside =
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom;
    if (outside) event.target.close();
  }
});

document.addEventListener("input", (event) => {
  const control = event.target.dataset?.control;
  if (control === "deployment-search") {
    state.deploymentFilters.search = event.target.value;
    state.deploymentFilters.page = 1;
    updateDeploymentResults();
  }

  if (control === "reset-confirmation") {
    const button = document.querySelector("#confirm-reset");
    if (button) button.disabled = event.target.value !== "Northstar";
  }

  if (event.target.closest("#settings-form")) {
    setSettingsStatus("unsaved", "Unsaved changes");
  }
});

document.addEventListener("change", (event) => {
  const control = event.target.dataset?.control;
  if (control === "overview-environment") {
    state.overviewEnvironment = event.target.value;
    renderRoute({ announce: false });
  }
  if (control === "status-filter") {
    state.deploymentFilters.status = event.target.value;
    state.deploymentFilters.page = 1;
    updateDeploymentResults();
  }
  if (control === "environment-filter") {
    state.deploymentFilters.environment = event.target.value;
    state.deploymentFilters.page = 1;
    updateDeploymentResults();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "settings-form") {
    event.preventDefault();
    if (event.target.reportValidity()) saveSettings(event.target);
  }
  if (event.target.id === "new-deployment-form") {
    event.preventDefault();
    if (event.target.reportValidity()) createDeployment(event.target);
  }
  if (event.target.id === "reset-form") {
    event.preventDefault();
    const confirmation = new FormData(event.target).get("confirmation");
    if (confirmation === "Northstar") resetWorkspace();
  }
});

window.addEventListener("hashchange", () => renderRoute());

const initialRouteCandidate = window.location.hash
  .replace(/^#\/?/, "")
  .split(/[?&]/)[0];
if (!Object.prototype.hasOwnProperty.call(ROUTES, initialRouteCandidate)) {
  window.history.replaceState(null, "", "#/overview");
}
renderRoute({ announce: false });
