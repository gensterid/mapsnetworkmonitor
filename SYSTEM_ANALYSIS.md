# System Analysis & Documentation

> Last updated: 2026-06 — refreshed after the backend refactoring pass
> (central env config, env-tunable scheduler, service-layer extraction,
> structured logging). See [§5 Recent Refactoring](#5-recent-refactoring) for the delta.

## 1. System Overview
**MikroTik Maps Monitor** is a full-stack, self-hosted, multi-tenant network
monitoring application designed to visualize and track the health of MikroTik
routers and their connected clients (Netwatch / PPPoE / OLT-ONU).

### Technology Stack
- **Frontend**: React 19 (Vite) + TailwindCSS v4 (SPA, dark-only, mobile-first)
- **Backend**: Node.js + Express 4 + Drizzle ORM
- **Database**: PostgreSQL (+ TimescaleDB for time-series metrics)
- **Queue / Cache**: Redis + BullMQ (background router-sync worker)
- **Auth**: better-auth (session-based, RBAC)
- **Monitoring**: Active polling via RouterOS API (`node-routeros`), SNMP, GenieACS (TR-069)

## 2. Architecture & Data Flow

### Data Collection Workflow
The system uses an **active polling mechanism** controlled by a single scheduler
file (`apps/api/src/lib/scheduler.ts`), executed via a **BullMQ background queue**.

1.  **Scheduler Loop** (`lib/scheduler.ts`):
    - One file owns all polling intervals. Every interval is **env-configurable**
      via `SCHED_*_MS` variables (default `SCHED_POLLING_MS=120000` → 2 minutes).
    - An "Adaptive Scaling" tier adjusts the interval based on device count to
      prevent overload on large fleets.
    - On startup it logs all active intervals for operator visibility.

2.  **Queue Worker** (`services/queue.service.ts`):
    - Routers are enqueued to BullMQ and processed in parallel
      (`ROUTER_SYNC_CONCURRENCY`, default 5).
    - **Race guard**: `shouldEnqueueRouter()` skips a router that is still in a
      circuit-breaker-open or adaptive back-off state, so a slow/failing router
      is never double-polled.
    - **Circuit breaker** (`ROUTER_CB_THRESHOLD` / `ROUTER_CB_COOLDOWN_MS`) opens
      after N consecutive failures; **adaptive back-off** exponentially delays
      re-enqueue of recently-failed routers.
    - Per-router timing is logged: `✅ Polling router X... done in 1.23s`
      (auto-escalated to INFO when > 5s, so slow boxes surface in logs).

3.  **Router Polling (`router.service.ts`)**:
    For each router, the system performs the following in parallel:
    - **Health Check**: Fetches CPU, Memory, Disk, Uptime, and Voltage.
    - **Interface Stats**: Fetches traffic rates (TX/RX) for all interfaces.
    - **Netwatch Sync**:
        - Syncs `/tool/netwatch` status (UP/DOWN) from the router.
        - **Active Latency Check**: The backend initiates a custom Ping (`/ping`) to every Netwatch host to measure real-time latency and packet loss.
    - **PPPoE Sessions**: Fetches active sessions (`/interface/pppoe-server/server/print`) to track online users.

4.  **Alerting Logic**:
    - **Status Changes**: Triggers when a device changes from UP -> DOWN (or vice versa).
    - **Performance Issues**: Triggers when:
        - Latency > 100ms
        - Packet Loss > 0%
        - CPU/Memory usage exceeds thresholds (e.g., >80%).
    - **Deduplication**: Alerts are grouped to prevent flooding (e.g., "High Latency" won't trigger 100 times/minute).

## 3. Database Schema (Storage)

The application stores data in a **PostgreSQL** database.

### Core Tables
| Table Name | Description | Key Data Stored |
| :--- | :--- | :--- |
| **`routers`** | Router inventory | IP, Credentials, Location (Lat/Lng), Status |
| **`router_metrics`** | Time-series health data | CPU Load, Free Memory, Voltage, Temperature |
| **`router_netwatch`** | Monitored IP Devices | Host IP, Status (Up/Down), **Latency**, Packet Loss, Lat/Lng |
| **`pppoe_sessions`** | User Sessions | Username, IP Address, Session ID, Uptime, Lat/Lng |
| **`alerts`** | Event Log | Type (e.g. `netwatch_down`, `high_cpu`), Severity, Message |

## 4. Analysis Logic

### Latency & Issues
- **Latency** is measured by the backend explicitly pinging the target IP *through* the MikroTik router (using the API).
- **Issues** are generated when these measurements exceed defined safety thresholds.
- **Visuals**: The map uses the `status` from `router_netwatch` and `pppoe_sessions` to color-code markers (Green=Online, Red=Offline, Yellow=Issue/Latency).

### Usage & Scalability
- **Concurrency**: Operations are limited (e.g., serial pinging) to ensure stability on low-resource routers.
- **History**: `router_metrics` grows over time to allow historical graphing of router health.

## 5. Recent Refactoring

A backend refactoring pass (2026-06) hardened configuration, scheduling,
logging, and the query layer without changing runtime behavior. Delta summary:

### Configuration (`config/env.ts`)
- All **45** environment variables are now centrally declared and Zod-validated
  in one schema — previously ~26 were read via raw `process.env.X` with no
  validation. Security-critical secrets (`JWT_SECRET`, `SESSION_SECRET`,
  `PORTAL_TOKEN_SECRET`, etc.) now fail startup if missing/insecure in production.
- `apps/api/.env.example` is the canonical, in-sync reference for all variables.

### Scheduler (`lib/scheduler.ts` + `services/queue.service.ts`)
- 13 hardcoded polling intervals → env-tunable `SCHED_*_MS` (defaults unchanged).
- Per-router timing logs (`done in 1.23s`, SLOW flag > 5s).
- Queue tunables (circuit breaker, adaptive back-off, backpressure) moved from
  raw `process.env` to the validated config.

### API & Logging
- Production `console.*` calls removed (→ pino structured logger with secret
  redaction).
- Standard response envelope helper added (`lib/api-response.ts`):
  `{ success, data, error?, timestamp }` + `asyncHandler` wrapper + `ErrorCode`
  constants. New routes use it; existing routes migrate incrementally.

### Query Layer & Indexes
- The heaviest endpoint (`/api/map/layout`, polled ~every 30s) now delegates all
  DB access to `services/map.service.ts` with **column-subset SELECTs** (no
  `SELECT *`, ~36-53% payload reduction) and parallel `Promise.all` fetch.
- Added tenant-scoped indexes (`0055_map_tenant_indexes.sql`) on `olts` and
  `onus` (`tenant_id`, composite `tenant_id + parent_id/router_id`).

### Map Status Counter
- The floating status counter and filter chips now aggregate **all device types**
  (router + Netwatch host + PPPoE session), not just routers — counts and filter
  results now match what is rendered on the map.

### Dependency Hygiene
- Removed 10 unused dependencies (verified via depcheck + import-only grep +
  build pass): `routeros-api` (dead duplicate of `node-routeros`), `bcrypt`,
  `nodemailer`, `ssh2` (+ types) on the API; `leaflet.gridlayer.googlemutant`
  (vendored copy used instead), `react-hook-form`, `tailwind-merge` on the web.

> Outstanding (intentionally deferred, non-breaking): migrating the remaining
> ~23 routes to the service layer, per-route adoption of the response envelope
> (requires frontend coordination), and an unused-endpoint audit.
