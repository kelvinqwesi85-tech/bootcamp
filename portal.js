const login = document.querySelector("#portal-login");
const app = document.querySelector("#portal-app");
const form = document.querySelector("#portal-form");
const message = document.querySelector("#portal-message");
const storedCode = sessionStorage.getItem("eaglePortalCode") || "";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[character]));
const date = (value) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "-";

async function openPortal(code) {
  const response = await fetch(`/api/portal?code=${encodeURIComponent(code)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Portal could not be opened.");
  sessionStorage.setItem("eaglePortalCode", code);
  login.classList.add("d-none");
  app.classList.remove("d-none");
  document.querySelector("#client-name").textContent = data.client.full_name;
  document.querySelector("#client-contact").textContent = `${data.client.email} · ${data.client.phone}${data.client.organization ? ` · ${data.client.organization}` : ""}`;
  document.querySelector("#bookings").innerHTML = data.bookings.length ? data.bookings.map((item) => `<div class="record"><strong>${escapeHtml(item.service)}${item.package ? ` · ${escapeHtml(item.package)}` : ""}</strong><span>${escapeHtml(item.location)} · ${date(item.start_time)}</span><span>Status: ${escapeHtml(item.status)}</span></div>`).join("") : '<p class="empty">No bookings yet.</p>';
  document.querySelector("#incidents").innerHTML = data.incidents.length ? data.incidents.map((item) => `<div class="record"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span><span>${escapeHtml(item.severity)} · ${date(item.created_at)}</span></div>`).join("") : '<p class="empty">No incident reports.</p>';
  document.querySelector("#invoices").innerHTML = data.invoices.length ? data.invoices.map((item) => `<div class="record"><strong>${escapeHtml(item.currency)} ${(item.amount / 100).toFixed(2)}</strong><span>Due ${escapeHtml(item.due_date)}</span><span>Status: ${escapeHtml(item.status)}</span></div>`).join("") : '<p class="empty">No invoices yet.</p>';
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Loading...";
  try { await openPortal(document.querySelector("#portal-code").value.trim()); }
  catch (error) { message.textContent = error.message; }
});

document.querySelector("#portal-logout").addEventListener("click", () => { sessionStorage.removeItem("eaglePortalCode"); app.classList.add("d-none"); login.classList.remove("d-none"); form.reset(); });
if (storedCode) openPortal(storedCode).catch(() => sessionStorage.removeItem("eaglePortalCode"));
