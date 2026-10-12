# Face detection attendance system

This project includes a responsive attendance dashboard and a Node.js + Express REST API. **Attendance check-ins are demos, not face recognition.** The webcam only provides a live preview; the check-in action records the employee selected in the dashboard and does not analyze camera images.

## Run locally

1. Install Node.js 18 or newer.
2. Install the dependencies and start the server:

   ```powershell
   npm install
   npm start
   ```

3. Open <http://127.0.0.1:5000>. Allow camera access if you want the webcam preview; check-ins work independently.

The app creates `data/attendance.json` to persist check-in records. Set `ATTENDANCE_DATA_DIR` to change its storage directory, or `PORT` to change the port. The server binds to `127.0.0.1` by default.

## REST API

All endpoints return JSON:

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Check server status |
| `GET` | `/api/employees` | List example employees |
| `GET` | `/api/attendance?date=YYYY-MM-DD` | List check-ins for a date; defaults to today |
| `POST` | `/api/attendance` | Record a demo check-in |

Create a check-in with JSON:

```json
{ "employeeId": "EMP-001" }
```

Employees can check in only once per day. Attendance is marked **Late** after 9:15 AM server local time. The sample employee directory is defined in `server.js`; replace it with your organization's data before use.

## Tests

Run `npm test` to test the API, request validation, and duplicate check-in handling.
