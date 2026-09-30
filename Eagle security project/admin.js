const loginPanel = document.querySelector("#login-panel");
const dashboardPanel = document.querySelector("#dashboard-panel");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const dashboardClock = document.querySelector("#dashboard-clock");
const lastUpdated = document.querySelector("#last-updated");
let adminKey = sessionStorage.getItem("eagleAdminKey") || "";
let refreshTimer;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "'": "&#039;",
  '"': "&quot;",
}[character]));

const formatDate = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";

async function adminFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "x-admin-key": adminKey, ...(options.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request failed.");
  return result;
}

function renderDashboard(data) {
  document.querySelector("#client-count").textContent = data.stats.clients;
  document.querySelector("#worker-count").textContent = data.stats.workers;
  document.querySelector("#active-count").textContent = data.stats.clockedIn;

  document.querySelector("#clients-table").innerHTML = data.clients.length ? data.clients.map((client) => `<tr><td><strong>${escapeHtml(client.full_name)}</strong><span class="muted">${escapeHtml(client.address)}</span></td><td>${escapeHtml(client.organization || "Private client")}</td><td>${escapeHtml(client.email)}<span class="muted">${escapeHtml(client.phone)}</span></td><td><strong>${escapeHtml(client.portal_code || "-")}</strong></td><td>${formatDate(client.created_at)}</td></tr>`).join("") : '<tr><td colspan="5" class="empty">No clients added yet.</td></tr>';
  document.querySelectorAll(".client-options").forEach((select) => {
    select.innerHTML = '<option value="">Unassigned</option>' + data.clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.full_name)}</option>`).join("");
  });

  const activeWorkers = new Set(data.attendance.filter((entry) => !entry.clock_out).map((entry) => entry.worker_id));
  document.querySelector("#workers-table").innerHTML = data.workers.length ? data.workers.map((worker) => {
    const clockedIn = activeWorkers.has(worker.id);
    return `<tr><td><strong>${escapeHtml(worker.full_name)}</strong><span class="muted">${escapeHtml(worker.emergency_contact || "No emergency contact")}</span></td><td>${escapeHtml(worker.role)}<span class="muted">${escapeHtml(worker.employee_code)}</span></td><td>${escapeHtml(worker.email)}<span class="muted">${escapeHtml(worker.phone)}</span></td><td><span class="status-pill ${clockedIn ? "" : "off"}">${clockedIn ? "On site" : "Off site"}</span><button class="attendance-action" data-worker-id="${escapeHtml(worker.id)}" data-attendance-action="${clockedIn ? "clock-out" : "clock-in"}">${clockedIn ? "Clock out" : "Clock in"}</button></td></tr>`;
  }).join("") : '<tr><td colspan="4" class="empty">No workers added yet.</td></tr>';
  document.querySelectorAll(".worker-options").forEach((select) => {
    select.innerHTML = '<option value="">Unassigned</option>' + data.workers.map((worker) => `<option value="${escapeHtml(worker.id)}">${escapeHtml(worker.full_name)} · ${escapeHtml(worker.employee_code)}</option>`).join("");
  });

  document.querySelector("#attendance-table").innerHTML = data.attendance.length ? data.attendance.map((entry) => `<tr><td><strong>${escapeHtml(entry.full_name)}</strong><span class="muted">${escapeHtml(entry.role)} / ${escapeHtml(entry.employee_code)}</span></td><td>${formatDate(entry.clock_in)}</td><td>${formatDate(entry.clock_out)}</td><td><span class="status-pill ${entry.clock_out ? "off" : ""}">${entry.clock_out ? "Complete" : "Active shift"}</span></td></tr>`).join("") : '<tr><td colspan="4" class="empty">No attendance records yet.</td></tr>';
  document.querySelector("#bookings-table").innerHTML = data.bookings.length ? data.bookings.map((booking) => `<tr><td><strong>${escapeHtml(booking.service)}</strong><span class="muted">${escapeHtml(booking.package)}</span></td><td>${escapeHtml(booking.client_name || "Unassigned")}<span class="muted">${escapeHtml(booking.location)}</span></td><td>${formatDate(booking.start_time)}<span class="muted">to ${formatDate(booking.end_time)}</span></td><td><span class="status-pill ${booking.status === "completed" ? "" : "off"}">${escapeHtml(booking.status)}</span></td></tr>`).join("") : '<tr><td colspan="4" class="empty">No bookings yet.</td></tr>';
  document.querySelector("#incidents-table").innerHTML = data.incidents.length ? data.incidents.map((incident) => `<tr><td><strong>${escapeHtml(incident.title)}</strong><span class="muted">${escapeHtml(incident.description)}</span></td><td>${escapeHtml(incident.client_name || "Unassigned")}</td><td>${escapeHtml(incident.severity)}</td><td>${escapeHtml(incident.status)}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">No incidents yet.</td></tr>';
  document.querySelector("#invoices-table").innerHTML = data.invoices.length ? data.invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.client_name || "Unassigned")}</td><td><strong>${escapeHtml(invoice.currency)} ${(invoice.amount / 100).toFixed(2)}</strong></td><td>${escapeHtml(invoice.due_date)}</td><td>${escapeHtml(invoice.status)}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">No invoices yet.</td></tr>';
  lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

async function loadDashboard() {
  const data = await adminFetch("/api/admin/summary");
  renderDashboard(data);
}

function showDashboard() {
  loginPanel.classList.add("d-none");
  dashboardPanel.classList.remove("d-none");
  loadDashboard().catch((error) => {
    sessionStorage.removeItem("eagleAdminKey");
    adminKey = "";
    dashboardPanel.classList.add("d-none");
    loginPanel.classList.remove("d-none");
    loginMessage.textContent = error.message;
  });
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadDashboard().catch(() => {}), 5000);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  adminKey = document.querySelector("#admin-key").value;
  loginMessage.textContent = "Checking access...";
  try {
    await adminFetch("/api/admin/summary");
    sessionStorage.setItem("eagleAdminKey", adminKey);
    showDashboard();
  } catch (error) {
    loginMessage.textContent = "Access denied. Check the admin key and try again.";
  }
});

document.querySelector("#logout-button").addEventListener("click", () => {
  sessionStorage.removeItem("eagleAdminKey");
  adminKey = "";
  clearInterval(refreshTimer);
  dashboardPanel.classList.add("d-none");
  loginPanel.classList.remove("d-none");
  loginForm.reset();
});

document.querySelectorAll("[data-open-form]").forEach((button) => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.openForm}`).classList.toggle("is-open");
}));

document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", async () => {
  const response = await fetch(`/api/admin/export?type=${button.dataset.export}`, { headers: { "x-admin-key": adminKey } });
  if (!response.ok) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = `eagle-${button.dataset.export}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}));

document.querySelectorAll(".entity-form").forEach((form) => form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  const message = form.querySelector(".form-message");
  button.disabled = true;
  button.textContent = "Saving...";
  message.textContent = "";
  try {
    await adminFetch(form.dataset.endpoint, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset();
    message.className = "form-message text-success";
    message.textContent = "Saved.";
    await loadDashboard();
  } catch (error) {
    message.className = "form-message";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    const labels = { clients: "Save client", workers: "Save worker", bookings: "Save booking", incidents: "Save incident", invoices: "Save invoice" };
    button.textContent = labels[form.dataset.endpoint.split("/").pop()] || "Save record";
  }
}));

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-attendance-action]");
  if (!button) return;
  button.disabled = true;
  try {
    await adminFetch(`/api/admin/attendance/${button.dataset.attendanceAction}`, { method: "POST", body: JSON.stringify({ workerId: button.dataset.workerId }) });
    await loadDashboard();
  } catch (error) {
    window.alert(error.message);
    button.disabled = false;
  }
});

setInterval(() => { dashboardClock.textContent = new Date().toLocaleString([], { dateStyle: "full", timeStyle: "medium" }); }, 1000);
if (adminKey) showDashboard();
