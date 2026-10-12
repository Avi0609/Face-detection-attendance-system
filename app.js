const content = document.querySelector("#app-content");
const breadcrumb = document.querySelector("#breadcrumb-current");
const toast = document.querySelector("#toast");
let employees = [];
let records = [];
let cameraStream = null;
let toastTimer;
let activeView = "dashboard";
let selectedEmployeeId = "";

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4000);
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
    });
  } catch (error) {
    console.error(`Could not reach ${path}.`, error);
    throw new Error("The attendance server could not be reached. Make sure it is running.");
  }
  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error(`The API returned an invalid response from ${path}.`, error);
    throw new Error("The attendance server returned an invalid response.");
  }
  if (!response.ok) throw new Error(result.error || `The request failed (${response.status}).`);
  return result;
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function employeeFor(id) {
  return employees.find((employee) => employee.id === id);
}

function rowMarkup(record) {
  const employee = employeeFor(record.employeeId);
  if (!employee) return "";
  const status = record.status === "Late" ? "Late" : "Present";
  const badgeClass = status === "Late" ? "badge-late" : "badge-present";
  return `<tr>
    <td><div class="person-cell"><span class="avatar ${employee.color}">${employee.initials}</span><span class="person-name"><strong>${escapeHtml(employee.name)}</strong><small>${escapeHtml(employee.id)}</small></span></div></td>
    <td>${escapeHtml(record.time)}</td>
    <td><span class="badge ${badgeClass}">${status}</span></td>
    <td>${escapeHtml(record.source)}</td>
  </tr>`;
}

function tableMarkup(items, emptyMessage = "No attendance records found.") {
  if (!items.length) return `<div class="empty-state">${emptyMessage}</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Employee</th><th>Check-in</th><th>Status</th><th>Method</th></tr></thead><tbody>${items.map(rowMarkup).join("")}</tbody></table></div>`;
}

function heading(title, description, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${formatToday()}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function dashboardMarkup() {
  const presentCount = records.length;
  const lateCount = records.filter((record) => record.status === "Late").length;
  const attendanceRate = employees.length ? Math.round((presentCount / employees.length) * 100) : 0;
  const stats = [
    { label: "Present today", value: presentCount, foot: "Recorded check-ins today", icon: "✓", color: "green" },
    { label: "Late arrivals", value: lateCount, foot: "Across all teams", icon: "◷", color: "amber" },
    { label: "Total employees", value: employees.length, foot: "Active team members", icon: "♙", color: "blue" },
    { label: "Attendance rate", value: `${attendanceRate}%`, foot: "Of active employees", icon: "↗", color: "" },
  ];
  const employeeOptions = employees.map((employee) =>
    `<option value="${escapeHtml(employee.id)}" ${employee.id === selectedEmployeeId ? "selected" : ""}>${escapeHtml(employee.name)} · ${escapeHtml(employee.id)}</option>`
  ).join("");
  const cameraActive = Boolean(cameraStream);
  return `${heading("Good morning", "Here’s what’s happening with your team today.",
    '<button class="button" type="button" data-action="export"><span class="button-icon" aria-hidden="true">↓</span> Export report</button>')}
    <section class="stats-grid" aria-label="Attendance summary">${stats.map((stat) => `
      <article class="stat-card"><div class="stat-top"><span>${stat.label}</span><span class="stat-icon ${stat.color}">${stat.icon}</span></div>
      <div class="stat-number">${stat.value}</div><div class="stat-foot">${stat.foot}</div></article>`).join("")}</section>
    <div class="main-grid">
      <section class="panel">
        <div class="panel-header"><div><h2 class="panel-title">Today’s attendance</h2><p class="panel-subtitle">A live overview of team check-ins</p></div><a class="text-link" href="#" data-view="attendance">View all →</a></div>
        ${tableMarkup(records.slice(0, 5))}
        <div class="table-footer"><span>Showing ${Math.min(records.length, 5)} of ${records.length} check-ins</span><a class="text-link" href="#" data-view="attendance">See attendance log</a></div>
      </section>
      <section class="panel camera-panel">
        <div class="panel-header"><div><h2 class="panel-title">Quick check-in</h2><p class="panel-subtitle">Preview your camera or record a demo check-in</p></div><span class="stat-icon">⌁</span></div>
        <div class="camera-body">
          <div class="camera-frame ${cameraActive ? "camera-live" : ""}" id="camera-frame">
            <video id="camera-video" autoplay muted playsinline aria-label="Live camera preview"></video>
            <div class="camera-placeholder"><span class="camera-symbol" aria-hidden="true">◎</span><strong>Camera is turned off</strong><span>Start the camera to preview your webcam</span></div>
            <div class="camera-overlay" aria-hidden="true"></div>
          </div>
          <div class="camera-status"><span id="camera-status">${cameraActive ? "Your camera is ready" : "Camera not connected"}</span><span class="live-label" id="live-label" ${cameraActive ? "" : "hidden"}>Camera live</span></div>
          <label class="sr-only" for="employee-select">Employee for demo check-in</label>
          <select class="select-input" id="employee-select" style="width:100%;margin-bottom:9px">${employeeOptions}</select>
          <div class="camera-actions">
            <button class="button" type="button" data-action="camera">${cameraActive ? "Stop camera" : "Start camera"}</button>
            <button class="button button-primary" type="button" data-action="checkin" ${records.some((record) => record.employeeId === selectedEmployeeId) ? "disabled" : ""}>Record demo check-in</button>
          </div>
          <p class="demo-note">Demo mode: the webcam is preview-only and does not detect or recognize faces. Check-ins are recorded for the selected employee and saved by the Express API.</p>
        </div>
      </section>
    </div>`;
}

function attendanceMarkup() {
  return `${heading("Attendance log", "Review today’s check-ins.",
    '<button class="button" type="button" data-action="export"><span class="button-icon" aria-hidden="true">↓</span> Export CSV</button>')}
    <section class="panel table-panel"><div class="panel-header"><div><h2 class="panel-title">Today’s check-ins</h2><p class="panel-subtitle">${formatToday()} · ${records.length} records</p></div>
    <div class="filter-row"><input class="search-input" id="attendance-search" type="search" placeholder="Search employees..." aria-label="Search employees"><select class="select-input" id="status-filter" aria-label="Filter by status"><option value="all">All statuses</option><option value="Present">Present</option><option value="Late">Late</option></select></div>
    </div><div id="attendance-table">${tableMarkup(records)}</div></section>`;
}

function peopleMarkup() {
  return `${heading("People", "Your team directory.",
    `<span class="button" aria-label="Employee count">${employees.length} team members</span>`)}
    <section class="people-grid">${employees.map((employee) => `<article class="panel person-card">
      <div class="person-card-top"><span class="avatar ${employee.color}">${employee.initials}</span><div><h3>${escapeHtml(employee.name)}</h3><p>${escapeHtml(employee.role)}</p></div></div>
      <div class="person-card-meta"><span>${escapeHtml(employee.id)}</span><span>${escapeHtml(employee.email)}</span></div>
    </article>`).join("")}</section>`;
}

function reportsMarkup() {
  const rate = employees.length ? Math.round((records.length / employees.length) * 100) : 0;
  return `${heading("Reports", "A summary of attendance today.")}
    <section class="report-grid">
      <article class="panel report-card"><span>Check-ins recorded</span><strong>${records.length}</strong><small>Today · all teams</small></article>
      <article class="panel report-card"><span>Attendance rate</span><strong>${rate}%</strong><small>Based on ${employees.length} active employees</small></article>
      <article class="panel report-card"><span>Late arrivals</span><strong>${records.filter((record) => record.status === "Late").length}</strong><small>Today · all teams</small></article>
    </section>
    <div class="report-callout"><strong>Demo attendance</strong><br>Check-ins are submitted to the Express REST API and saved in a local JSON file. The camera preview does not perform face recognition.</div>`;
}

function render(view = "dashboard", preserveCamera = false) {
  activeView = view;
  const stream = preserveCamera ? cameraStream : null;
  if (!preserveCamera) stopCamera();
  const views = {
    dashboard: { label: "Overview", markup: dashboardMarkup },
    attendance: { label: "Attendance", markup: attendanceMarkup },
    people: { label: "People", markup: peopleMarkup },
    reports: { label: "Reports", markup: reportsMarkup },
  };
  const selected = views[view] || views.dashboard;
  breadcrumb.textContent = selected.label;
  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  content.innerHTML = selected.markup();
  if (stream && view === "dashboard") {
    document.querySelector("#camera-video").srcObject = stream;
  }
  if (view === "attendance") bindAttendanceFilters();
}

function bindAttendanceFilters() {
  const search = document.querySelector("#attendance-search");
  const filter = document.querySelector("#status-filter");
  const table = document.querySelector("#attendance-table");
  const update = () => {
    const query = search.value.trim().toLowerCase();
    const status = filter.value;
    const filtered = records.filter((record) => {
      const employee = employeeFor(record.employeeId);
      return employee &&
        `${employee.name} ${employee.id}`.toLowerCase().includes(query) &&
        (status === "all" || record.status === status);
    });
    table.innerHTML = tableMarkup(filtered, "No check-ins match your search.");
  };
  search.addEventListener("input", update);
  filter.addEventListener("change", update);
}

async function refreshData(preserveCamera = false) {
  const [employeeResponse, attendanceResponse] = await Promise.all([
    api("/api/employees"),
    api(`/api/attendance?date=${encodeURIComponent(todayKey())}`),
  ]);
  employees = employeeResponse.employees.map((employee, index) => ({
    ...employee,
    initials: employee.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    color: ["avatar-purple", "avatar-blue", "avatar-green", "avatar-orange", "avatar-pink", "avatar-slate"][index % 6],
  }));
  records = attendanceResponse.attendance;
  if (!employeeFor(selectedEmployeeId)) selectedEmployeeId = employees[0]?.id || "";
  render(activeView, preserveCamera);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Camera preview is unavailable. Open this app on localhost or HTTPS.", true);
    return;
  }
  const button = document.querySelector('[data-action="camera"]');
  button.disabled = true;
  button.textContent = "Connecting…";
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    if (!document.querySelector("#camera-video") || activeView !== "dashboard") {
      stopCamera();
      return;
    }
    document.querySelector("#camera-video").srcObject = cameraStream;
    document.querySelector("#camera-frame").classList.add("camera-live");
    document.querySelector("#camera-status").textContent = "Your camera is ready";
    document.querySelector("#live-label").hidden = false;
    button.textContent = "Stop camera";
    button.disabled = false;
  } catch (error) {
    console.error("Could not start camera preview.", error);
    button.disabled = false;
    button.textContent = "Start camera";
    const message = error.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in browser settings and try again."
      : error.name === "NotFoundError"
        ? "No camera was found on this device."
        : "Could not start the camera. Check that it is connected and not in use.";
    showToast(message, true);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  const video = document.querySelector("#camera-video");
  if (video) video.srcObject = null;
  const frame = document.querySelector("#camera-frame");
  if (frame) frame.classList.remove("camera-live");
  const status = document.querySelector("#camera-status");
  if (status) status.textContent = "Camera not connected";
  const liveLabel = document.querySelector("#live-label");
  if (liveLabel) liveLabel.hidden = true;
  const cameraButton = document.querySelector('[data-action="camera"]');
  if (cameraButton) {
    cameraButton.disabled = false;
    cameraButton.textContent = "Start camera";
  }
}

async function recordDemoCheckin(button) {
  const employeeId = document.querySelector("#employee-select").value;
  button.disabled = true;
  try {
    const result = await api("/api/attendance", {
      method: "POST",
      body: JSON.stringify({ employeeId }),
    });
    await refreshData(true);
    showToast(`Demo check-in recorded for ${result.attendance.name}.`);
  } catch (error) {
    console.error("Could not record demo attendance.", error);
    showToast(error.message, true);
    button.disabled = records.some((record) => record.employeeId === employeeId);
  }
}

function exportCsv() {
  const rows = [["Employee ID", "Employee", "Date", "Check-in", "Status", "Method"],
    ...records.map((record) => [
      record.employeeId, record.name, record.date, record.time, record.status, record.source,
    ])];
  const csv = rows.map((row) =>
    row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-${todayKey()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("change", (event) => {
  if (event.target.matches("#employee-select")) {
    selectedEmployeeId = event.target.value;
    const button = document.querySelector('[data-action="checkin"]');
    if (button) button.disabled = records.some((record) => record.employeeId === selectedEmployeeId);
  }
});

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    event.preventDefault();
    render(viewButton.dataset.view);
    return;
  }
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  if (actionButton.dataset.action === "camera") {
    if (cameraStream) stopCamera();
    else startCamera();
  } else if (actionButton.dataset.action === "checkin") {
    recordDemoCheckin(actionButton);
  } else if (actionButton.dataset.action === "export") {
    exportCsv();
  } else if (actionButton.dataset.action === "retry") {
    initialize();
  }
});

window.addEventListener("pagehide", stopCamera);

async function initialize() {
  try {
    await refreshData();
  } catch (error) {
    console.error("Could not initialize attendance app.", error);
    content.innerHTML = `<section class="panel empty-state"><strong>Could not load the attendance server.</strong><p>${escapeHtml(error.message)}</p><p>Start the Express API with <code>npm start</code> and open <code>http://127.0.0.1:5000</code>.</p><button class="button button-primary" type="button" data-action="retry">Retry connection</button></section>`;
    showToast(error.message, true);
  }
}

initialize();
