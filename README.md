# MikroTik Maps Monitor

Self-hosted, multi-tenant network monitoring untuk ISP yang menjalankan armada
router **MikroTik**. Memvisualisasikan kesehatan jaringan di atas peta interaktif
(500+ marker), melacak status Netwatch / PPPoE / OLT-ONU secara real-time, dan
mengelola operasional ISP (billing, voucher hotspot, GenieACS/TR-069) dari satu
dashboard.

Dibangun untuk **network engineer** yang sering memantau dari lapangan — UI
mobile-first, dark-only, polling 2 menit, dan alert clarity di layar kecil.

> **Bukan SaaS.** Aplikasi ini self-hosted: Anda deploy di VPS/server sendiri,
> data jaringan tetap di infrastruktur Anda.

---

## ✨ Fitur Utama

| Area | Kemampuan |
| :--- | :--- |
| **Peta Jaringan** | 500+ marker (router, Netwatch host, PPPoE, OLT, ONU), clustering otomatis, garis topologi, satellite dark tiles |
| **Monitoring Aktif** | Polling RouterOS API tiap 2 menit (adaptive scaling), ping latency + packet loss real-time, SNMP traffic |
| **Alerting** | Status change (UP/DOWN), high latency/CPU/memory, deduplication anti-flood, eskalasi |
| **Billing ISP** | Pelanggan, paket, invoice, voucher hotspot, payment gateway (Midtrans/Tripay/Xendit), isolir otomatis |
| **MikHMON Console** | Drop-in replacement MikHMON v3 — hotspot user, voucher, IP binding, walled garden, queue |
| **GenieACS / TR-069** | Inventory ONU, WiFi config, backup/restore, reboot remote |
| **Multi-tenant** | Isolasi data per-ISP, RBAC (superadmin / admin / operator / user) |
| **Portal Pelanggan** | Cek status, voucher aktif, tagihan |

---

## 🖼️ Screenshot / Demo

> _Tambahkan screenshot ke `docs/screenshots/` lalu referensikan di sini._

```
docs/screenshots/
├── map-overview.png        # Peta penuh dengan marker
├── alert-panel.png         # Panel alert + acknowledge
└── mobile-bottomsheet.png  # Tampilan mobile
```

Demo / staging link: _(isi jika ada)_

---

## 🏗️ Arsitektur

Monorepo (npm workspaces) dengan 2 aplikasi:

```
new-monitoring-mikrotik/
├── apps/
│   ├── api/          # Backend — Node.js + Express + Drizzle ORM
│   │   ├── src/
│   │   │   ├── routes/        # HTTP endpoints (per domain)
│   │   │   ├── services/      # Business logic + DB queries (service layer)
│   │   │   ├── lib/           # scheduler, logger, cache, mikrotik, encryption
│   │   │   ├── db/            # Drizzle schema + migrations
│   │   │   ├── middleware/    # auth, rbac, error handling
│   │   │   └── config/        # env.ts (central config, Zod-validated)
│   │   └── dist/             # Build output (tsc)
│   └── web/          # Frontend — React 19 + Vite + Tailwind v4 SPA
│       └── src/
│           ├── components/    # NetworkMap, panels, map, ui
│           ├── pages/         # Routed pages (billing, mikhmon, settings)
│           ├── hooks/         # TanStack Query + useBreakpoint
│           └── lib/           # api client, GoogleMutant (vendored)
├── ecosystem.config.cjs       # PM2 process config (production)
└── package.json               # Workspace root
```

### Stack

- **Frontend**: React 19 + Vite + TailwindCSS v4 (SPA, no SSR/Next.js), TanStack Query v5, Leaflet
- **Backend**: Node.js + Express 4, Drizzle ORM, BullMQ (background queue), pino (logging)
- **Database**: PostgreSQL (+ TimescaleDB untuk time-series metrics)
- **Cache/Queue**: Redis (BullMQ router-sync worker)
- **Auth**: better-auth (session-based, RBAC)
- **Monitoring**: RouterOS API (`node-routeros`), SNMP, GenieACS (TR-069)

### Alur Data (Polling)

1. **Scheduler** (`apps/api/src/lib/scheduler.ts`) — satu file mengontrol semua
   interval polling. Tiap 2 menit (env-configurable via `SCHED_*_MS`) men-enqueue
   router ke BullMQ.
2. **Queue Worker** (`queue.service.ts`) — memproses router secara paralel dengan
   **circuit breaker** + **adaptive back-off**. Guard `shouldEnqueueRouter()`
   mencegah polling ganda untuk router yang sama.
3. **Router Service** — fetch CPU/memory/uptime, interface traffic, sync Netwatch
   (+ active ping latency), PPPoE sessions.
4. **Alerting** — status change & threshold breach → dedup → `alerts` table → UI.

Detail lebih lengkap: [`SYSTEM_ANALYSIS.md`](SYSTEM_ANALYSIS.md) dan
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 🚀 Instalasi & Menjalankan

### Prasyarat

- **Node.js** ≥ 20
- **PostgreSQL** ≥ 14 (TimescaleDB extension opsional, untuk metrics)
- **Redis** ≥ 6 (background queue)
- Akses RouterOS API ke router MikroTik yang akan dimonitor

### 1. Clone & Install

```bash
git clone https://github.com/gensterid/mapsnetworkmonitor.git
cd mapsnetworkmonitor
npm install          # install semua workspace (root + apps/*)
```

### 2. Konfigurasi Environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — minimal: DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY
# Generate secret:  openssl rand -hex 32
```

Lihat [Environment Variables](#-environment-variables) di bawah.

### 3. Setup Database

```bash
npm run db:migrate                    # apply migrations (Drizzle)
npm run create-admin -w apps/api      # buat user admin pertama
# Opsional: npm run seed:dummy        # data dummy untuk testing
```

### 4. Mode Development

```bash
# Terminal 1 — API (port 3001, hot reload via tsx watch)
npm run dev -w apps/api

# Terminal 2 — Web (port 5173, Vite dev server)
npm run dev -w apps/web
```

Buka `http://localhost:5173`.

### 5. Mode Production (PM2 + Nginx)

```bash
# Build kedua app
npm run build                         # build --workspaces (api + web)

# Jalankan via PM2 (config: ecosystem.config.cjs)
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup                           # auto-start saat boot
```

- `monitoring-api` → `node dist/index.js` di port **3001**
- `monitoring-web` → serve `dist/` statis di port **5173**

Reverse-proxy via Nginx (terminate TLS, route `/api` → 3001, sisanya → 5173).
Panduan deploy & update: [`UPDATE_GUIDE.md`](UPDATE_GUIDE.md),
[`RELEASING.md`](RELEASING.md).

---

## 🔐 Environment Variables

Semua variabel divalidasi terpusat di
[`apps/api/src/config/env.ts`](apps/api/src/config/env.ts) (Zod schema). File
contoh lengkap: [`apps/api/.env.example`](apps/api/.env.example).

### Wajib

| Variable | Deskripsi |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Secret session auth (min 16 char) |
| `ENCRYPTION_KEY` | Key enkripsi kredensial router (32 char plain / 64 char hex) |

### Penting (punya default, override sesuai kebutuhan)

| Variable | Default | Deskripsi |
| :--- | :--- | :--- |
| `PORT` | `3001` | Port API |
| `NODE_ENV` | `development` | `production` di deploy |
| `REDIS_URL` | `redis://localhost:6379` | BullMQ queue |
| `GENIEACS_URL` | `http://localhost:7557` | TR-069 server |
| `CORS_ORIGIN` | — | Origin frontend (mis. `https://monitor.example.com`) |
| `ROUTER_SYNC_CONCURRENCY` | `5` | Paralelisme polling router |
| `SCHED_POLLING_MS` | `120000` | Interval polling utama (2 menit) |
| `ALLOW_PRIVATE_NETWORKS` | `false` | SSRF guard — set `true` hanya jika webhook butuh IP privat |

### Opsional (fitur tambahan)

| Variable | Deskripsi |
| :--- | :--- |
| `GEMINI_API_KEY` | AI diagnosis (Gemini) |
| `GOOGLE_MAPS_API_KEY` | Satellite tiles |
| `SENTRY_DSN` | Error tracking |
| `WEBHOOK_BASE_URL` | URL publik untuk webhook MikroTik |
| `SCHED_*_MS` | Tuning interval scheduler (lihat `.env.example`) |

> Scheduler intervals (`SCHED_POLLING_MS`, `SCHED_OLT_SNMP_MS`, dll.) dan tuning
> queue (`ROUTER_CB_THRESHOLD`, `ADAPTIVE_BASE_MS`) semuanya configurable —
> daftar lengkap di `.env.example`.

---

## 🛠️ Perintah Berguna

```bash
# Database
npm run db:generate -w apps/api     # generate migration dari schema
npm run db:migrate                  # apply migrations
npm run db:studio -w apps/api       # Drizzle Studio (GUI)
npm run db:doctor -w apps/api       # diagnosa kesehatan DB

# Build & quality
npm run build                       # build semua workspace
npx tsc --noEmit                    # typecheck (di apps/api)
npm run lint -w apps/web            # ESLint frontend

# User
npm run create-admin -w apps/api    # buat admin baru
```

---

## 📚 Dokumentasi Lanjutan

| Dokumen | Isi |
| :--- | :--- |
| [`SYSTEM_ANALYSIS.md`](SYSTEM_ANALYSIS.md) | Analisis sistem, data flow, skema DB |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arsitektur detail |
| [`SCALABILITY_REPORT.md`](SCALABILITY_REPORT.md) | Strategi scaling armada besar |
| [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) | Pemecahan masalah umum |
| [`UPDATE_GUIDE.md`](UPDATE_GUIDE.md) | Panduan update produksi |
| [`docs/VPN-SETUP.md`](docs/VPN-SETUP.md) | Setup VPN multi-server |

---

## 📄 Lisensi

ISC — lihat `package.json`.
