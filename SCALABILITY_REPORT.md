# System Scalability Analysis

## 1. Designed Capacity (Adaptive Scaling)
The application is built with **Adaptive Scaling** tiers defined in `scheduler.ts`. It automatically adjusts the polling speed based on the load:

| Total Devices | Update Interval | Stability |
| :--- | :--- | :--- |
| **1 - 50** | Every **30 seconds** | ⚡ **Real-time** (Best Experience) |
| **51 - 200** | Every **60 seconds** | ✅ **Stable** (Standard Use) |
| **201 - 500** | Every **2 minutes** | ⚠️ **Slower** (High Load) |
| **> 500** | Every **5 minutes** | 🐢 **Very Slow** (Not Recommended) |

## 2. The Real Bottleneck: Clients per Router
The number of **Routers** is less critical than the number of **Netwatch/Clients** *inside* each router.

*   **Current Ping Logic**: We recently set `Ping Concurrency = 1` (Serial) to ensure stability.
*   **Time Calculation**:
    *   Average Ping Time: ~50ms
    *   Timeout (Worst Case): 500ms
    *   If a router has **100 Clients**:
        *   Best case: 100 * 50ms = **5 seconds** (OK)
        *   Worst case (many offline): 100 * 500ms = **50 seconds** (Critical)

## 3. Recommended Limits
To keep the application "Stabil" (Server UI responsive, data fits inside 2-minute cycle):

*   **Max Routers**: **~50 - 100 Routers** (Assuming minimal clients each)
*   **Max Total Clients (Netwatch)**: **~500 - 1000 Clients total** across all routers.

**Warning**: If you monitor **>100 clients** on a *single* router, that specific router's updating process may lag significantly.
