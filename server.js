const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const dataDirectory = path.join(root, "data");
const requestsFile = path.join(dataDirectory, "requests.json");
const databaseFile = path.join(dataDirectory, "eagle.sqlite");
const port = Number(process.env.PORT) || 3000;
const adminKey = process.env.EAGLE_ADMIN_KEY || "eagle-local-admin";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

fsSync.mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databaseFile);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    portal_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL,
    employee_code TEXT NOT NULL UNIQUE,
    emergency_contact TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    clock_in TEXT NOT NULL,
    clock_out TEXT,
    notes TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    service TEXT NOT NULL,
    package TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    assigned_worker_id TEXT REFERENCES workers(id) ON DELETE SET NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES clients(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GHS',
    status TEXT NOT NULL DEFAULT 'draft',
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

try {
  database.exec("ALTER TABLE clients ADD COLUMN portal_code TEXT");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS clients_portal_code ON clients(portal_code)");
} catch (error) {
  if (!error.message.includes("duplicate column name")) throw error;
}

async function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendCsv(response, filename, rows) {
  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  response.end(csv);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000)
        reject(new Error("Request body is too large."));
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function saveRequest(payload) {
  await fs.mkdir(dataDirectory, { recursive: true });
  let requests = [];
  try {
    requests = JSON.parse(await fs.readFile(requestsFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const requestRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: payload.name.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.trim(),
    service: payload.service.trim(),
    package: typeof payload.package === "string" ? payload.package.trim() : "",
    message: payload.message.trim(),
  };
  requests.push(requestRecord);
  await fs.writeFile(requestsFile, JSON.stringify(requests, null, 2));
  return requestRecord;
}

function hasAdminAccess(request) {
  return request.headers["x-admin-key"] === adminKey;
}

function requiredText(payload, fields) {
  return fields.find(
    (field) => typeof payload[field] !== "string" || !payload[field].trim(),
  );
}

function adminSummary() {
  return {
    clients: database
      .prepare("SELECT * FROM clients ORDER BY created_at DESC")
      .all(),
    workers: database
      .prepare("SELECT * FROM workers ORDER BY created_at DESC")
      .all(),
    attendance: database
      .prepare(
        `SELECT attendance.*, workers.full_name, workers.role, workers.employee_code
         FROM attendance JOIN workers ON workers.id = attendance.worker_id
         ORDER BY attendance.clock_in DESC`,
      )
      .all(),
    bookings: database
      .prepare(
        `SELECT bookings.*, clients.full_name AS client_name, workers.full_name AS worker_name
         FROM bookings LEFT JOIN clients ON clients.id = bookings.client_id
         LEFT JOIN workers ON workers.id = bookings.assigned_worker_id
         ORDER BY bookings.start_time ASC`,
      )
      .all(),
    incidents: database
      .prepare(
        `SELECT incidents.*, clients.full_name AS client_name
         FROM incidents LEFT JOIN clients ON clients.id = incidents.client_id
         ORDER BY incidents.created_at DESC`,
      )
      .all(),
    invoices: database
      .prepare(
        `SELECT invoices.*, clients.full_name AS client_name
         FROM invoices LEFT JOIN clients ON clients.id = invoices.client_id
         ORDER BY invoices.created_at DESC`,
      )
      .all(),
  };
}

async function handleAdminApi(request, response, url) {
  if (!hasAdminAccess(request)) {
    return sendJson(response, 401, { error: "Admin access required." });
  }

  try {
    if (url.pathname === "/api/admin/summary" && request.method === "GET") {
      const summary = adminSummary();
      return sendJson(response, 200, {
        ...summary,
        stats: {
          clients: summary.clients.length,
          workers: summary.workers.length,
          clockedIn: summary.attendance.filter((entry) => !entry.clock_out)
            .length,
        },
      });
    }

    if (url.pathname === "/api/admin/export" && request.method === "GET") {
      const exportType = url.searchParams.get("type");
      if (exportType === "attendance") {
        const rows = database.prepare(`SELECT workers.full_name, workers.employee_code, attendance.clock_in, attendance.clock_out FROM attendance JOIN workers ON workers.id = attendance.worker_id ORDER BY attendance.clock_in DESC`).all();
        return sendCsv(response, "eagle-attendance.csv", [["Worker", "Employee code", "Clock in", "Clock out"], ...rows.map((row) => [row.full_name, row.employee_code, row.clock_in, row.clock_out])]);
      }
      if (exportType === "bookings") {
        const rows = database.prepare(`SELECT service, package, location, start_time, end_time, status FROM bookings ORDER BY start_time DESC`).all();
        return sendCsv(response, "eagle-bookings.csv", [["Service", "Package", "Location", "Start", "End", "Status"], ...rows.map((row) => [row.service, row.package, row.location, row.start_time, row.end_time, row.status])]);
      }
      return sendJson(response, 400, { error: "Unsupported export type." });
    }

    if (request.method !== "POST") {
      return sendJson(response, 405, { error: "Method not allowed." });
    }

    const payload = JSON.parse(await readRequestBody(request));
    if (url.pathname === "/api/admin/clients") {
      const missingField = requiredText(payload, [
        "fullName",
        "email",
        "phone",
      ]);
      if (missingField)
        return sendJson(response, 400, {
          error: `${missingField} is required.`,
        });
      const client = {
        id: crypto.randomUUID(),
        fullName: payload.fullName.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone.trim(),
        organization: String(payload.organization || "").trim(),
        address: String(payload.address || "").trim(),
        notes: String(payload.notes || "").trim(),
        portalCode: `EAGLE-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        createdAt: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO clients
           (id, full_name, email, phone, organization, address, notes, portal_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          client.id,
          client.fullName,
          client.email,
          client.phone,
          client.organization,
          client.address,
          client.notes,
          client.portalCode,
          client.createdAt,
        );
      return sendJson(response, 201, client);
    }

    if (url.pathname === "/api/admin/workers") {
      const missingField = requiredText(payload, [
        "fullName",
        "email",
        "phone",
        "role",
        "employeeCode",
      ]);
      if (missingField)
        return sendJson(response, 400, {
          error: `${missingField} is required.`,
        });
      const worker = {
        id: crypto.randomUUID(),
        fullName: payload.fullName.trim(),
        email: payload.email.trim().toLowerCase(),
        phone: payload.phone.trim(),
        role: payload.role.trim(),
        employeeCode: payload.employeeCode.trim().toUpperCase(),
        emergencyContact: String(payload.emergencyContact || "").trim(),
        status: "active",
        createdAt: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO workers
           (id, full_name, email, phone, role, employee_code, emergency_contact, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          worker.id,
          worker.fullName,
          worker.email,
          worker.phone,
          worker.role,
          worker.employeeCode,
          worker.emergencyContact,
          worker.status,
          worker.createdAt,
        );
      return sendJson(response, 201, worker);
    }

    if (url.pathname === "/api/admin/attendance/clock-in") {
      const missingField = requiredText(payload, ["workerId"]);
      if (missingField)
        return sendJson(response, 400, { error: "workerId is required." });
      const worker = database
        .prepare("SELECT id FROM workers WHERE id = ?")
        .get(payload.workerId);
      if (!worker) return sendJson(response, 404, { error: "Worker not found." });
      const openShift = database
        .prepare(
          "SELECT id FROM attendance WHERE worker_id = ? AND clock_out IS NULL",
        )
        .get(payload.workerId);
      if (openShift)
        return sendJson(response, 409, { error: "Worker is already clocked in." });
      const clockIn = new Date().toISOString();
      const result = database
        .prepare(
          "INSERT INTO attendance (worker_id, clock_in, notes) VALUES (?, ?, ?)",
        )
        .run(payload.workerId, clockIn, String(payload.notes || "").trim());
      return sendJson(response, 201, { id: result.lastInsertRowid, clockIn });
    }

    if (url.pathname === "/api/admin/attendance/clock-out") {
      const missingField = requiredText(payload, ["workerId"]);
      if (missingField)
        return sendJson(response, 400, { error: "workerId is required." });
      const shift = database
        .prepare(
          "SELECT id FROM attendance WHERE worker_id = ? AND clock_out IS NULL",
        )
        .get(payload.workerId);
      if (!shift)
        return sendJson(response, 409, { error: "Worker is not clocked in." });
      const clockOut = new Date().toISOString();
      database
        .prepare("UPDATE attendance SET clock_out = ? WHERE id = ?")
        .run(clockOut, shift.id);
      return sendJson(response, 200, { id: shift.id, clockOut });
    }

    if (url.pathname === "/api/admin/bookings") {
      const missingField = requiredText(payload, [
        "service",
        "location",
        "startTime",
        "endTime",
      ]);
      if (missingField)
        return sendJson(response, 400, { error: `${missingField} is required.` });
      const booking = {
        id: crypto.randomUUID(),
        clientId: String(payload.clientId || "").trim() || null,
        service: payload.service.trim(),
        package: String(payload.package || "").trim(),
        location: payload.location.trim(),
        startTime: payload.startTime.trim(),
        endTime: payload.endTime.trim(),
        status: "pending",
        assignedWorkerId: String(payload.assignedWorkerId || "").trim() || null,
        notes: String(payload.notes || "").trim(),
        createdAt: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO bookings
           (id, client_id, service, package, location, start_time, end_time, status, assigned_worker_id, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          booking.id,
          booking.clientId,
          booking.service,
          booking.package,
          booking.location,
          booking.startTime,
          booking.endTime,
          booking.status,
          booking.assignedWorkerId,
          booking.notes,
          booking.createdAt,
        );
      return sendJson(response, 201, booking);
    }

    if (url.pathname === "/api/admin/incidents") {
      const missingField = requiredText(payload, ["title", "description"]);
      if (missingField)
        return sendJson(response, 400, { error: `${missingField} is required.` });
      const incident = {
        id: crypto.randomUUID(),
        clientId: String(payload.clientId || "").trim() || null,
        title: payload.title.trim(),
        description: payload.description.trim(),
        severity: String(payload.severity || "medium").trim(),
        status: "open",
        createdAt: new Date().toISOString(),
      };
      database
        .prepare(
          `INSERT INTO incidents (id, client_id, title, description, severity, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          incident.id,
          incident.clientId,
          incident.title,
          incident.description,
          incident.severity,
          incident.status,
          incident.createdAt,
        );
      return sendJson(response, 201, incident);
    }

    if (url.pathname === "/api/admin/invoices") {
      const missingField = requiredText(payload, ["amount", "dueDate"]);
      if (missingField)
        return sendJson(response, 400, { error: `${missingField} is required.` });
      const invoice = {
        id: crypto.randomUUID(),
        clientId: String(payload.clientId || "").trim() || null,
        amount: Math.round(Number(payload.amount) * 100),
        currency: String(payload.currency || "GHS").trim().toUpperCase(),
        status: "draft",
        dueDate: payload.dueDate.trim(),
        createdAt: new Date().toISOString(),
      };
      if (!Number.isFinite(invoice.amount) || invoice.amount < 0)
        return sendJson(response, 400, { error: "A valid amount is required." });
      database
        .prepare(
          `INSERT INTO invoices (id, client_id, amount, currency, status, due_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          invoice.id,
          invoice.clientId,
          invoice.amount,
          invoice.currency,
          invoice.status,
          invoice.dueDate,
          invoice.createdAt,
        );
      return sendJson(response, 201, invoice);
    }

    return sendJson(response, 404, { error: "Admin route not found." });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return sendJson(response, 409, { error: "Employee code already exists." });
    }
    return sendJson(response, 400, { error: "The admin request could not be processed." });
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return sendJson(response, 200, { status: "ok" });
  }
  if (url.pathname === "/api/portal" && request.method === "GET") {
    const portalCode = url.searchParams.get("code");
    if (!portalCode) return sendJson(response, 400, { error: "Portal code is required." });
    const client = database
      .prepare("SELECT id, full_name, email, phone, organization, address FROM clients WHERE portal_code = ?")
      .get(portalCode.trim().toUpperCase());
    if (!client) return sendJson(response, 401, { error: "Portal code not found." });
    return sendJson(response, 200, {
      client,
      bookings: database.prepare("SELECT * FROM bookings WHERE client_id = ? ORDER BY start_time DESC").all(client.id),
      incidents: database.prepare("SELECT * FROM incidents WHERE client_id = ? ORDER BY created_at DESC").all(client.id),
      invoices: database.prepare("SELECT * FROM invoices WHERE client_id = ? ORDER BY created_at DESC").all(client.id),
    });
  }
  if (url.pathname.startsWith("/api/admin/")) {
    return handleAdminApi(request, response, url);
  }
  if (url.pathname !== "/api/requests" || request.method !== "POST") {
    return sendJson(response, 404, { error: "API route not found." });
  }

  try {
    const payload = JSON.parse(await readRequestBody(request));
    const requiredFields = ["name", "email", "phone", "service", "message"];
    const missingField = requiredFields.find(
      (field) => typeof payload[field] !== "string" || !payload[field].trim(),
    );
    if (missingField)
      return sendJson(response, 400, { error: `${missingField} is required.` });
    if (!/^\S+@\S+\.\S+$/.test(payload.email.trim()))
      return sendJson(response, 400, { error: "A valid email is required." });
    const savedRequest = await saveRequest(payload);
    return sendJson(response, 201, {
      id: savedRequest.id,
      message: "Request received.",
    });
  } catch (error) {
    return sendJson(response, 400, {
      error: "The request could not be processed.",
    });
  }
}

async function serveStatic(response, url) {
  const decodedPath = decodeURIComponent(url.pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type":
        mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(file);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`,
  );
  if (url.pathname.startsWith("/api/"))
    return handleApi(request, response, url);
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    response.end("Method not allowed");
    return;
  }
  return serveStatic(response, url);
});

server.listen(port, () =>
  console.log(`Eagle server running at http://localhost:${port}`),
);
