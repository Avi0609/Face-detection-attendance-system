const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createApp, initializeStore } = require("../server");

async function startTestServer(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "attendance-api-"));
  const dataFile = path.join(directory, "attendance.json");
  await initializeStore(dataFile);
  const server = createApp({ dataFile }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("serves the frontend and API health status", async (t) => {
  const baseUrl = await startTestServer(t);

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Attendly — Face Attendance/);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok", service: "attendance-api" });
});

test("lists employees and validates attendance dates", async (t) => {
  const baseUrl = await startTestServer(t);

  const employeesResponse = await fetch(`${baseUrl}/api/employees`);
  const employees = await employeesResponse.json();
  assert.equal(employees.employees.length, 6);

  const invalidDate = await fetch(`${baseUrl}/api/attendance?date=2026-02-30`);
  assert.equal(invalidDate.status, 400);
  assert.deepEqual(await invalidDate.json(), {
    error: "Date must be a valid date in YYYY-MM-DD format.",
  });
});

test("records and persists one demo check-in per employee per day", async (t) => {
  const baseUrl = await startTestServer(t);
  const payload = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employeeId: "EMP-001" }) };
  const [first, concurrent] = await Promise.all([
    fetch(`${baseUrl}/api/attendance`, payload),
    fetch(`${baseUrl}/api/attendance`, payload),
  ]);
  const responses = [first, concurrent].sort((left, right) => left.status - right.status);
  assert.equal(responses[0].status, 201);
  assert.equal(responses[1].status, 409);
  assert.match((await responses[1].json()).error, /already has a demo check-in today/);

  const recorded = await responses[0].json();
  assert.equal(recorded.attendance.employeeId, "EMP-001");
  assert.equal(recorded.attendance.source, "Demo check-in");

  const list = await fetch(`${baseUrl}/api/attendance?date=${recorded.attendance.date}`);
  const result = await list.json();
  assert.equal(result.attendance.length, 1);
  assert.equal(result.attendance[0].employeeId, "EMP-001");
});

test("rejects missing and unknown employee IDs", async (t) => {
  const baseUrl = await startTestServer(t);
  const post = (body) => fetch(`${baseUrl}/api/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const missing = await post({});
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: "employeeId is required." });

  const unknown = await post({ employeeId: "EMP-999" });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "Employee not found." });
});
