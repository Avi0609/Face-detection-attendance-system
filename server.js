const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const ROOT = __dirname;
const DEFAULT_DATA_DIR = path.join(ROOT, "data");
const EMPLOYEES = [
  { id: "EMP-001", name: "Alex Morgan", role: "Product Designer", email: "alex.morgan@company.com" },
  { id: "EMP-002", name: "Jordan Lee", role: "Engineering", email: "jordan.lee@company.com" },
  { id: "EMP-003", name: "Taylor Kim", role: "Marketing", email: "taylor.kim@company.com" },
  { id: "EMP-004", name: "Sam Rivera", role: "Operations", email: "sam.rivera@company.com" },
  { id: "EMP-005", name: "Casey Patel", role: "Engineering", email: "casey.patel@company.com" },
  { id: "EMP-006", name: "Morgan Chen", role: "Customer Success", email: "morgan.chen@company.com" },
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function attendanceRecord(employeeId, now = new Date()) {
  const employee = EMPLOYEES.find((person) => person.id === employeeId);
  const status = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 15)
    ? "Late"
    : "Present";
  return {
    employeeId: employee.id,
    name: employee.name,
    date: todayKey(now),
    time: new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(now),
    status,
    source: "Demo check-in",
  };
}

async function initializeStore(dataFile) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.writeFile(dataFile, `${JSON.stringify({ attendance: [] }, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await fs.readFile(dataFile, "utf8");
    const store = JSON.parse(existing);
    if (!store || !Array.isArray(store.attendance)) {
      throw new Error("Attendance data must be a JSON object with an attendance array.");
    }
  }
}

function createApp(options = {}) {
  const dataFile = options.dataFile || path.join(options.dataDir || DEFAULT_DATA_DIR, "attendance.json");
  let writeQueue = Promise.resolve();
  const app = express();

  async function readStore() {
    const contents = await fs.readFile(dataFile, "utf8");
    const store = JSON.parse(contents);
    if (!store || !Array.isArray(store.attendance)) {
      throw new Error("Attendance data must be a JSON object with an attendance array.");
    }
    return store;
  }

  function updateStore(update) {
    const operation = writeQueue.then(async () => {
      const store = await readStore();
      const result = update(store);
      const temporaryFile = `${dataFile}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporaryFile, `${JSON.stringify(store, null, 2)}\n`, { flag: "wx" });
        await fs.rename(temporaryFile, dataFile);
      } catch (error) {
        await fs.rm(temporaryFile, { force: true }).catch((cleanupError) => {
          console.error("Could not remove a temporary attendance file.", cleanupError);
        });
        throw error;
      }
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb", strict: true }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "attendance-api" });
  });

  app.get("/api/employees", (_request, response) => {
    response.json({ employees: EMPLOYEES });
  });

  app.get("/api/attendance", async (request, response) => {
    const requestedDate = request.query.date || todayKey();
    if (typeof requestedDate !== "string" || !isValidDate(requestedDate)) {
      throw new HttpError(400, "Date must be a valid date in YYYY-MM-DD format.");
    }
    const store = await readStore();
    const attendance = store.attendance
      .filter((record) => record.date === requestedDate)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    response.json({ attendance });
  });

  app.post("/api/attendance", async (request, response) => {
    const { employeeId } = request.body || {};
    if (typeof employeeId !== "string" || !employeeId.trim()) {
      throw new HttpError(400, "employeeId is required.");
    }
    if (!EMPLOYEES.some((employee) => employee.id === employeeId)) {
      throw new HttpError(404, "Employee not found.");
    }
    const now = new Date();
    const record = {
      ...attendanceRecord(employeeId, now),
      createdAt: now.toISOString(),
    };
    const createdRecord = await updateStore((store) => {
      if (store.attendance.some(
        (existing) => existing.employeeId === employeeId && existing.date === record.date,
      )) {
        throw new HttpError(409, "This employee already has a demo check-in today.");
      }
      store.attendance.push(record);
      return record;
    });
    response.status(201).json({ attendance: createdRecord });
  });

  app.get("/", (_request, response) => response.sendFile(path.join(ROOT, "index.html")));
  app.get("/app.js", (_request, response) => response.sendFile(path.join(ROOT, "app.js")));
  app.get("/styles.css", (_request, response) => response.sendFile(path.join(ROOT, "styles.css")));

  app.use((request, _response, next) => next(new HttpError(404, `Route not found: ${request.method} ${request.path}`)));
  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
      return response.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error.status) return response.status(error.status).json({ error: error.message });
    console.error("Attendance API request failed.", error);
    return response.status(500).json({ error: "The server could not complete the request." });
  });

  return app;
}

async function startServer() {
  const dataFile = path.join(process.env.ATTENDANCE_DATA_DIR || DEFAULT_DATA_DIR, "attendance.json");
  await initializeStore(dataFile);
  const app = createApp({ dataFile });
  const port = Number(process.env.PORT || 5000);
  app.listen(port, "127.0.0.1", () => {
    console.log(`Attendance app running at http://127.0.0.1:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Could not start the attendance server.", error);
    process.exitCode = 1;
  });
}

module.exports = { createApp, initializeStore, EMPLOYEES };