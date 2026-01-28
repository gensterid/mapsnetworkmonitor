# System Analysis & Documentation

## 1. System Overview
**MikroTik Maps Monitor** is a full-stack network monitoring application designed to visualize and track the health of MikroTik routers and their connected clients (Netwatch/PPPoE).

### Technology Stack
- **Frontend**: React (Vite) + TailwindCSS
- **Backend**: Node.js (Express)
- **Database**: PostgreSQL (managed via Drizzle ORM)
- **Monitoring**: Active polling via RouterOS API

## 2. Architecture & Data Flow

### Data Collection Workflow
The system uses an **active polling mechanism** scheduled by the backend (`scheduler.ts`).

1.  **Scheduler Loop**:
    - Runs every **2 minutes** (default) to poll all active routers.
    - An "Adaptive Scaling" mechanism adjusts this interval based on the number of devices to prevent overload.

2.  **Router Polling (`router.service.ts`)**:
    For each router, the system performs the following in parallel:
    - **Health Check**: Fetches CPU, Memory, Disk, Uptime, and Voltage.
    - **Interface Stats**: Fetches traffic rates (TX/RX) for all interfaces.
    - **Netwatch Sync**:
        - Syncs `/tool/netwatch` status (UP/DOWN) from the router.
        - **Active Latency Check**: The backend initiates a custom Ping (`/ping`) to every Netwatch host to measure real-time latency and packet loss.
    - **PPPoE Sessions**: Fetches active sessions (`/interface/pppoe-server/server/print`) to track online users.

3.  **Alerting Logic**:
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
