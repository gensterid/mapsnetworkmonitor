# Refactoring Plan — mapsnetworkmonitor

**Version**: 1.0
**Date**: 18 Jun 2026
**Status**: 🟡 Planning (belum eksekusi)
**Auditor**: Senior Fullstack Engineer
**Reference**: hasil Phase 1 Audit (lihat session chat — tidak di-archive ke file)

---

## Executive Summary

### Problem Statement

Project `mapsnetworkmonitor` melayani **network engineer ISP kecil** yang mantau ratusan router MikroTik + ribuan PPPoE client. Audit menemukan:

- **2059 baris** monolit `Billing.jsx` dengan **2 Tab function dead** (365 baris orphan)
- **2 route file unmounted** di backend → 6 API call frontend return 404 (backup, diagnostics)
- **42 hooks akses `localStorage` langsung** untuk `active-tenant-id` → tenant switching tidak reactive
- **Map polling 30s tanpa clustering** → tidak scalable untuk 500+ marker (priority utama)
- **`useSnmpTraffic` polling 2 detik** → 3000 req/menit akumulatif di 100 router
- **2 nama folder context**: `context/` + `contexts/` (inkonsistensi struktur)
- **12 theme variants** padahal user butuh dark-only
- **3 hooks dead export** (`useAI`, `useGroups`, `useSocket`)
- **3 page orphan**: `Pppoe.jsx`, `SignUp.jsx`, `Routers.jsx.bak`
- **4 pasangan API endpoint deprecated** (old `/billing/router/*` vs new `/billing/mikrotik/*`)

### Goal

Bersihkan, konsisten, dan siap-scale dengan 4 prinsip:

1. **One source of truth** per concern (color, state, API call, polling interval)
2. **Display-only components** (panels tidak fetch sendiri, markers tanpa business logic)
3. **Single data path** (backend scheduler → DB → REST → React Query → component)
4. **Hapus apa yang tidak diperlukan** (12 theme → 1, 26 mikhmon route → 8, dst)

### Non-Goals (Phase Ini)

- Tidak migrate dari Vite ke Next.js (per constraint user)
- Tidak ganti TanStack Query ke RTK Query
- Tidak rewrite Map dari scratch — incremental optimization
- Tidak rewrite backend — hanya cleanup + mount missing routes

### Konstraints (dari user context memory)

- React 19 + Vite + Tailwind v4 frontend
- Node + Express + Drizzle + PostgreSQL backend
- Deploy: GitHub Actions → VPS (Nginx + PM2)
- Mobile: Capacitor (optional)
- **Dark mode only** (tidak butuh light mode)
- Polling **2 menit** (bukan WebSocket aggressive)
- Target performance: **Map 500+ marker tanpa lag**
- **NO Next.js patterns** (no Server Component, no RSC)

---

## PART A — Struktur Folder Target

### A.1 Current State (Problem)

```
apps/web/src/
├── components/
│   ├── analytics/        (16 file)
│   ├── billing/          (1 file)
│   ├── dashboard/        (?)
│   ├── genieacs/         (4 file)
│   ├── map/              (20 file termasuk NetworkMap.jsx 86KB)
│   ├── mikhmon/          (4 file)
│   ├── router/           (27 file dalam 5 subfolder)
│   ├── search/           (1 file)
│   ├── settings/         (10 file)
│   ├── ui/               (10 file)
│   ├── users/            (1 file)
│   ├── BeliVoucher...    (page-level — wrong location)
│   ├── AppLayout.jsx     (layout)
│   ├── Sidebar.jsx       (layout)
│   └── ... (puluhan file lain campur aduk)
├── pages/                (28 root + 71 nested)
├── hooks/                (29 hook exports)
├── lib/
│   ├── api/services/     ← service files di sini
│   └── ...
├── services/             ← service files JUGA di sini (split-brain)
├── context/              ← ThemeContext
├── contexts/             ← MikhmonContext  (DUPLIKAT FOLDER!)
└── utils/                (tidak terlalu ada)
```

**Masalah utama**:
1. **2 nama folder identik**: `context/` + `contexts/`
2. **Service split-brain**: `lib/api/services/` + `services/`
3. **Components folder campur**: ada page-level (BeliVoucher), layout (AppLayout), feature-domain (router/, billing/)
4. **Tidak ada `types/` folder** (TypeScript types tersebar)
5. **`utils/` underutilized** — helper tersebar di mana-mana
6. **`pages/billing/`, `pages/mikhmon/`** sudah benar, jadi anchor

### A.2 Target Structure

```
apps/web/src/
├── pages/                ← Halaman utama (route-level component)
│   ├── Dashboard.jsx
│   ├── NetworkMap.jsx
│   ├── Routers.jsx
│   ├── Alerts.jsx
│   ├── Analytics.jsx
│   ├── Settings.jsx
│   ├── billing/         (sudah extracted: PelangganTab, TransaksiTab,
│   │                     PromisesTab, DriftTab, GatewayDefaultsCard)
│   ├── mikhmon/         (sudah well-structured)
│   ├── routers/         (RouterDetails + komponen detail)
│   ├── settings/        (Settings sub-pages)
│   ├── public/          (BeliVoucher, BeliVoucherSukses, CekStatus, Member)
│   └── kiosk/           (KioskView — jarang dipakai, gabung di sini)
│
├── components/
│   ├── ui/              ← Komponen UI generik & primitives
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Badge.jsx
│   │   ├── Modal.jsx
│   │   ├── Input.jsx
│   │   ├── Toggle.jsx
│   │   ├── Skeleton.jsx
│   │   ├── SearchableSelect.jsx
│   │   ├── StatsCard.jsx
│   │   ├── DeleteConfirmationModal.jsx
│   │   ├── LoadingState.jsx       ← BARU (standard)
│   │   ├── ErrorState.jsx         ← BARU (standard)
│   │   ├── EmptyState.jsx         ← BARU (standard)
│   │   └── StatusBadge.jsx        ← BARU (single source color)
│   │
│   ├── map/             ← SEMUA komponen Map (display-only)
│   │   ├── NetworkMap.jsx         (orchestrator, simplified)
│   │   ├── MapContainer.jsx       (Leaflet wrapper + clustering)
│   │   ├── markers/
│   │   │   ├── RouterMarker.jsx   (lightweight, no business logic)
│   │   │   ├── OnuMarker.jsx
│   │   │   ├── PppoeMarker.jsx
│   │   │   └── NetwatchMarker.jsx
│   │   ├── lines/
│   │   │   ├── NetworkLine.jsx    (memoized)
│   │   │   └── ConnectionLine.jsx
│   │   └── overlays/
│   │       ├── MapLegend.jsx
│   │       └── MapFilters.jsx
│   │
│   ├── panels/          ← Sidebar, detail panel, info panel (display-only)
│   │   ├── Sidebar.jsx
│   │   ├── BottomNav.jsx          (mobile)
│   │   ├── DeviceDetailPanel.jsx  (klik marker → ini muncul)
│   │   ├── AlertPanel.jsx
│   │   └── RouterInfoPanel.jsx
│   │
│   ├── charts/          ← Semua grafik (Recharts wrappers)
│   │   ├── CpuChart.jsx
│   │   ├── MemoryChart.jsx
│   │   ├── LatencyChart.jsx
│   │   ├── BandwidthChart.jsx
│   │   └── shared/
│   │       ├── chartTheme.js     (warna konsisten)
│   │       └── tooltipFormat.js
│   │
│   ├── layout/          ← Layout components
│   │   ├── AppLayout.jsx
│   │   ├── PublicLayout.jsx       (untuk halaman publik)
│   │   └── TenantSwitcher.jsx
│   │
│   ├── domain/          ← Domain-specific components (tetap)
│   │   ├── router/      (27 file → consolidate ke 15-20)
│   │   ├── billing/
│   │   ├── mikhmon/
│   │   ├── analytics/
│   │   ├── genieacs/
│   │   ├── settings/
│   │   ├── users/
│   │   └── search/
│   │
│   └── feature/         ← Cross-cutting feature components
│       ├── GlobalSearchModal.jsx
│       └── NotificationToast.jsx
│
├── hooks/               ← Custom hooks (3 dead di-hapus)
│   ├── index.js
│   ├── useRouters.js
│   ├── useBilling.js
│   ├── useDashboard.js
│   ├── useAlerts.js
│   ├── useMap.js                  ← BARU (consolidate Map data hooks)
│   ├── useTenant.js               ← BARU (read dari Zustand store)
│   ├── ... (utility hooks)
│   └── (hapus: useAI, useGroups, useSocket)
│
├── stores/              ← BARU — State global pakai Zustand (1 library, konsisten)
│   ├── tenantStore.js             (replace 42 localStorage reads)
│   ├── themeStore.js              (replace ThemeContext — dark only)
│   ├── mikhmonStore.js            (replace MikhmonContext)
│   └── uiStore.js                 (sidebar collapsed, modal stack, dsb)
│
├── services/            ← Semua pemanggilan API (dipisah dari komponen)
│   ├── apiClient.js               (axios instance with interceptors)
│   ├── routers.service.js
│   ├── billing.service.js
│   ├── alerts.service.js
│   ├── map.service.js
│   ├── analytics.service.js
│   ├── mikhmon.service.js
│   ├── genieacs.service.js
│   ├── auth.service.js
│   └── portal.service.js          (public endpoints)
│
├── types/               ← BARU — TypeScript types/interfaces
│   ├── api.ts                     (response shapes)
│   ├── router.ts                  (Router, NetwatchEntry, Interface)
│   ├── billing.ts                 (Package, Customer, Invoice, Voucher)
│   ├── alert.ts
│   ├── map.ts                     (Marker, Coords, Layer)
│   └── ui.ts                      (props shapes shared)
│
├── utils/               ← Helper functions
│   ├── format.js                  (fmtIDR, fmtDate, fmtDateTime, fmtBytes)
│   ├── color.js                   (statusToColor — single source)
│   ├── coords.js                  (coordinate helpers)
│   ├── debounce.js
│   ├── slugify.js
│   └── validation.js              (isSafeUrl, isValidPhone)
│
├── constants/           ← BARU — Tidak ada hardcoded string
│   ├── strings.js                 (semua label UI)
│   ├── status.js                  (status enums + colors)
│   ├── polling.js                 (semua refetchInterval di sini)
│   ├── routes.js                  (route paths constants)
│   └── api.js                     (endpoint paths constants)
│
├── styles/              ← (tetap)
│   └── index.css
│
└── lib/                 ← Library wrappers / 3rd-party setup
    ├── auth-client.js
    ├── queryClient.js             (TanStack Query setup)
    ├── socket.js                  (Socket.IO setup)
    └── i18n.js                    (kalau perlu)
```

### A.3 State Management Decision

**Pilih SATU**: Zustand (rekomendasi)

**Kenapa Zustand, bukan Context**:

| Aspek | Context API | Zustand |
|---|---|---|
| Provider wrapping | Nested, App.jsx jadi tinggi | None — global store |
| Subscribe outside React | Tidak bisa (harus dalam komponen) | Bisa — di interceptor API, kapan saja |
| DX untuk tenant ID di interceptor axios | ❌ Sulit (saat ini pakai localStorage hack) | ✅ `useTenantStore.getState().tenantId` |
| Bundle size | 0 (built-in) | ~3kb |
| Re-render granular | Manual `useMemo` di provider value | Auto-selector (`useStore(s => s.tenantId)`) |
| Test friendly | Sedang | Sangat (store dapat di-mock import) |
| Devtools | None | Redux DevTools bawaan |

**Konkretnya**: 42 hooks yang sekarang baca `localStorage.getItem('active-tenant-id')` bisa langsung diganti:

```js
// Before
const getActiveTenantId = () => localStorage.getItem('active-tenant-id');

// After
import { useTenantStore } from '@/stores/tenantStore';
const tenantId = useTenantStore(s => s.tenantId);
```

Plus di axios interceptor (di luar React):
```js
// services/apiClient.js
import { useTenantStore } from '@/stores/tenantStore';
apiClient.interceptors.request.use(config => {
    const tenantId = useTenantStore.getState().tenantId;
    if (tenantId) config.headers['x-tenant-id'] = tenantId;
    return config;
});
```

Tidak bisa dilakukan dengan Context — interceptor di luar React tree.

### A.4 Migration Mapping (Old → New)

| Sekarang | Target | Catatan |
|---|---|---|
| `src/context/ThemeContext.jsx` | `src/stores/themeStore.js` | Drop ke 1 theme (dark) |
| `src/contexts/MikhmonContext.jsx` | `src/stores/mikhmonStore.js` | Folder `contexts/` hapus |
| `src/lib/api/services/*` + `src/services/*` | `src/services/*` | Konsolidasi 1 lokasi |
| `src/components/map/NetworkMap.jsx` (86KB) | Split: `components/map/MapContainer.jsx` + `components/map/markers/*.jsx` + `components/map/lines/*.jsx` | Reduce file size |
| `src/components/BeliVoucher.jsx` (kalau ada) | `src/pages/public/BeliVoucher.jsx` | Page level |
| `src/pages/Pppoe.jsx`, `SignUp.jsx`, `Routers.jsx.bak` | Hapus | Dead code |
| `src/hooks/useAI.js`, `useGroups.js`, `useSocket.js` | Hapus | Dead export |
| `src/pages/Billing.jsx` 2059 baris | Extract 8 inline tab ke `src/pages/billing/*Tab.jsx` | Mengikuti pola PelangganTab |

---

## PART B — Prinsip UI yang Harus Ditegakkan

### B.1 Single Source untuk Warna Status

**File**: `src/constants/status.js`

```js
// Single source of truth — tidak ada warna status di tempat lain
export const STATUS_COLORS = {
    online:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', ring: 'ring-emerald-500/30', dot: 'bg-emerald-500' },
    offline: { bg: 'bg-red-500/15',     text: 'text-red-400',     ring: 'ring-red-500/30',     dot: 'bg-red-500'     },
    warning: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   ring: 'ring-amber-500/30',   dot: 'bg-amber-500'   },
    unknown: { bg: 'bg-slate-500/15',   text: 'text-slate-400',   ring: 'ring-slate-500/30',   dot: 'bg-slate-500'   },
};

export const ALERT_SEVERITY_COLORS = {
    critical: STATUS_COLORS.offline,
    high:     STATUS_COLORS.warning,
    medium:   STATUS_COLORS.warning,
    low:      STATUS_COLORS.unknown,
    info:     STATUS_COLORS.online,
};
```

**Aturan**:
- Komponen apa pun yang tampilkan status (badge, dot, line, marker) **WAJIB** import dari sini
- Marker `RouterMarker.jsx` ambil warna dengan `getStatusColor(router.status)` utility
- Lint rule (manual review dulu): grep `bg-emerald-` `bg-red-` `bg-amber-` di luar `constants/status.js` → flag PR

**Reusable component**: `components/ui/StatusBadge.jsx`

```jsx
export function StatusBadge({ status, children }) {
    const c = STATUS_COLORS[status] || STATUS_COLORS.unknown;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider font-bold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {children || status}
        </span>
    );
}
```

### B.2 Map Marker = Lightweight, Zero Business Logic

**Aturan**:
- Marker komponen **hanya display** — terima `router`, `status`, `position` sebagai props
- **Tidak boleh** fetch sendiri, hitung status sendiri, atau modify state global
- Status calculation di-derive di parent (`MapContainer.jsx`) atau di-cache di store
- Wajib `React.memo` dengan custom equality (props value, bukan reference)

**Contoh**:
```jsx
// ❌ TIDAK BOLEH — marker fetch dan logic
function RouterMarker({ routerId }) {
    const { data: router } = useQuery(['router', routerId]); // ❌
    const status = router.lastPing > 100 ? 'warning' : 'online'; // ❌
    return <Marker position={[router.lat, router.lng]} />;
}

// ✅ BENAR — display only
function RouterMarker({ name, lat, lng, status }) {
    return (
        <Marker position={[lat, lng]} icon={statusIcon(status)}>
            <Tooltip>{name}</Tooltip>
        </Marker>
    );
}
const arePropsEqual = (a, b) =>
    a.name === b.name && a.lat === b.lat && a.lng === b.lng && a.status === b.status;
export default React.memo(RouterMarker, arePropsEqual);
```

**Marker clustering**: pakai `react-leaflet-markercluster` saat marker > 50.

### B.3 Sidebar / Panel = Display Only, Tidak Fetch Sendiri

**Aturan**:
- Container (page level) yang fetch
- Pass data ke panel via prop
- Panel **TIDAK** import `useQuery` atau service apa pun
- Saat panel butuh action (klik tombol), terima `onAction` callback dari parent

**Contoh**:
```jsx
// ❌ TIDAK BOLEH — panel fetch sendiri
function DeviceDetailPanel({ deviceId }) {
    const { data } = useDevice(deviceId); // ❌
    return <div>{data.name}</div>;
}

// ✅ BENAR — receive data, display only
function DeviceDetailPanel({ device, onClose, onReboot }) {
    return (
        <aside>
            <h2>{device.name}</h2>
            <button onClick={onClose}>Close</button>
            <button onClick={() => onReboot(device.id)}>Reboot</button>
        </aside>
    );
}
```

**Why**: panel tidak tahu context (multi-tenant, filter aktif). Parent tahu, jadi parent fetch.

### B.4 Loading / Error / Empty State Konsisten

**3 komponen baru di `components/ui/`**:

```jsx
// LoadingState.jsx — pakai di semua halaman
<LoadingState message="Memuat router..." />

// ErrorState.jsx — pakai di semua halaman
<ErrorState error={err} onRetry={refetch} />

// EmptyState.jsx — pakai di semua list/table
<EmptyState icon={<Wifi />} title="Belum ada router" description="Tambah router baru..." action={...} />
```

**Aturan**: TIDAK ada loading spinner / error message ad-hoc di setiap page. Wajib pakai 3 komponen ini.

### B.5 Tidak Ada Hardcoded String

**File**: `src/constants/strings.js`

```js
export const STRINGS = {
    // Navigation
    NAV_DASHBOARD: 'Dashboard',
    NAV_MAP: 'Network Map',
    NAV_ROUTERS: 'Routers',
    NAV_BILLING: 'Billing',
    NAV_ALERTS: 'Alerts',
    NAV_SETTINGS: 'Settings',

    // Common actions
    ACTION_ADD: 'Tambah',
    ACTION_EDIT: 'Edit',
    ACTION_DELETE: 'Hapus',
    ACTION_SAVE: 'Simpan',
    ACTION_CANCEL: 'Batal',
    ACTION_REFRESH: 'Refresh',

    // Empty states
    EMPTY_ROUTERS_TITLE: 'Belum ada router',
    EMPTY_ROUTERS_DESC: 'Tambah router pertama dari menu Settings → Routers',

    // Status labels
    STATUS_ONLINE: 'Online',
    STATUS_OFFLINE: 'Offline',
    STATUS_WARNING: 'Warning',

    // Error messages
    ERR_FETCH_GENERIC: 'Gagal memuat data. Coba lagi.',
    ERR_NETWORK: 'Tidak dapat terhubung ke server.',

    // Confirmations
    CONFIRM_DELETE: 'Anda yakin ingin menghapus?',
    CONFIRM_ISOLIR: 'Isolir customer ini?',
};
```

**Why**: easy i18n di masa depan, konsistensi label, search-replace simple. Saat ini all-Indonesian, tapi kalau suatu hari operator Anda butuh English, ganti 1 file.

**Plus**: tidak ada `alert('...')` atau `confirm('...')` di kode. Pakai toast + modal komponen.

---

## PART C — Alur Data yang Benar

### C.1 Allowed Data Path

```
┌──────────────────────────────────────────────────────────────────┐
│  BACKEND POLLING LAYER (background, terkontrol)                     │
│                                                                      │
│   scheduler.ts                                                       │
│       ↓                                                              │
│   routerService.refreshRouterStatus() [BullMQ queue]                 │
│       ↓                                                              │
│   ConnectToRouter() — RouterOS API + SNMP                            │
│       ↓                                                              │
│   INSERT INTO PostgreSQL (router_metrics, netwatch, sessions)        │
│                                                                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  REST API LAYER                                                       │
│                                                                       │
│   GET /api/routers       → routerService.getAll()                     │
│   GET /api/map/markers   → mapService.getAllMarkers()                 │
│   GET /api/alerts        → alertService.list()                        │
│   SSE /api/events        → push: alerts_updated, map_update           │
│   WS  socket.io          → traffic_update per-router-room             │
│                                                                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  FRONTEND DATA LAYER (TanStack Query + Zustand)                       │
│                                                                       │
│   services/routers.service.js  → fetch wrapper                        │
│       ↓                                                                │
│   hooks/useRouters.js  → useQuery(['routers'])                        │
│       ↓                                                                │
│   stores/tenantStore.js  → globalState (tenantId untuk header)        │
│                                                                       │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  COMPONENT LAYER (display only)                                       │
│                                                                       │
│   pages/NetworkMap.jsx  (container — orchestrate data + layout)       │
│       ├─ components/map/MapContainer.jsx                              │
│       │      └─ components/map/markers/RouterMarker.jsx (display)     │
│       └─ components/panels/DeviceDetailPanel.jsx (display)            │
│                                                                       │
└──────────────────────────────────────────────────────────────────┘
```

### C.2 Banned Patterns

❌ **Frontend langsung ke RouterOS** — semua route harus lewat API
❌ **Frontend `setInterval(fetch, 30000)`** — pakai `refetchInterval` di TanStack Query
❌ **`fetch()` di dalam komponen** — wajib lewat `services/`
❌ **`localStorage.getItem(...)` di komponen / hook** — pakai Zustand store
❌ **2 hook fetch endpoint yang sama** — single hook source per resource

### C.3 Polling Interval Sentralisasi

**File**: `src/constants/polling.js`

```js
export const POLLING_INTERVAL = {
    // High-frequency (10-30 detik) — real-time critical
    ALERTS_UNREAD: 10_000,        // badge count
    SNMP_TRAFFIC:  30_000,        // ✅ NAIK dari 2s (audit finding) — gunakan WebSocket jika butuh real-time

    // Medium (1-2 menit) — match user requirement
    ROUTERS_LIST:  120_000,       // 2 menit (sesuai priority)
    NETWATCH_ALL:  120_000,       // 2 menit
    DASHBOARD_STATS: 60_000,
    METRICS:       120_000,
    PPP_SESSIONS:  120_000,

    // Low (5+ menit) — jarang berubah
    SETTINGS:      300_000,
    PACKAGES:      300_000,
    USERS:         300_000,
    BANDWIDTH_HISTORY: 600_000,

    // Manual only (no auto-refetch)
    AUDIT_LOGS:    null,
    INVOICES:      null,
};
```

**Aturan**: hook **WAJIB** import dari sini:

```js
// useRouters.js
import { POLLING_INTERVAL } from '@/constants/polling';

export function useRouters() {
    return useQuery({
        queryKey: ['routers'],
        queryFn: () => routersService.getAll(),
        refetchInterval: POLLING_INTERVAL.ROUTERS_LIST,  // ← single source
    });
}
```

**Plus**: dokumentasikan **kenapa** interval segitu (CPU load? Real-time need? Backend rate limit?).

---

## PART D — Fitur yang Dihapus / Disembunyikan

### D.1 Hard Delete (dead code, tidak dipakai)

| Item | Lokasi | Alasan | Effort hapus |
|---|---|---|---|
| `pages/Routers.jsx.bak` | 1020 baris file `.bak` | Backup file, git history sudah cukup | 1 detik |
| `pages/Pppoe.jsx` | Page orphan | Tidak ter-route, tidak ter-import | 1 detik |
| `pages/SignUp.jsx` | Page orphan | Tidak ter-route, no signup flow needed (operator pakai admin) | 1 detik |
| `pages/AnimationDemo.jsx` | Dev-only | Tidak ter-route untuk production | 1 detik |
| `hooks/useAI.js` + export | Dead export | No call site | 5 detik |
| `hooks/useGroups.js` + export | Dead export | Replaced by `useSettings` | 5 detik |
| `hooks/useSocket.js` + export | Dead export | Replaced by `useRealtimeTraffic` | 5 detik |
| `pages/Billing.jsx` lines 87-169 (`CustomersTab`) | Dead function 83 baris | Replaced by `PelangganTab` | 1 menit |
| `pages/Billing.jsx` lines 380-661 (`SubscriptionsTab`) | Dead function 282 baris | Replaced by `TransaksiTab` | 1 menit |

**Total hapus**: ~1400 baris dead code.

### D.2 Simplify (consolidate kompleksitas)

| Item | Tindakan | Alasan |
|---|---|---|
| **12 Theme Variants** | Hapus 11, sisakan Dark Luxury saja | User confirm dark-only. Hapus: `.theme-cyberpunk`, `.theme-emerald`, `.theme-arctic`, `.theme-slate`, `.theme-spacex`, `.theme-holographic`, `.theme-enterprise` (light), `.theme-aurora`, `.theme-mission`, `.theme-daylight` (light), `.theme-nordic` |
| **Theme Switcher UI di Settings** | Hapus dropdown picker | Tidak relevan kalau dark-only |
| **26 nested Mikhmon route** | Audit mana yang jarang dipakai, gabung yg sejenis | mis. `mikhmon/hotspot/server-profiles` + `mikhmon/hotspot/profiles` bisa jadi 1 tab dengan sub-section |
| **16 modal component berbeda** | Refactor pakai compound pattern dari 1 base `Modal.jsx` | Konsisten behavior + maintenance |
| **Sidebar dengan 20+ menu item** | Group ke category collapsible | Operator butuh scan cepat, bukan scroll panjang |

### D.3 Hide (sembunyikan dari menu utama, tetap accessible)

| Item | Tindakan | Alasan |
|---|---|---|
| **KioskView** | Hapus dari Sidebar, akses via direct URL | Hanya 1-2 operator pakai |
| **AnimationDemo** | Hapus jika exists | Dev-only |
| **Tenants page** | Akses cuma untuk superadmin (gate by role) | Operator biasa tidak perlu |
| **VPN Servers settings** | Akses cuma untuk superadmin | Konfigurasi infrastruktur, bukan daily-use |
| **Audit Logs** | Tetap visible, tapi pindah ke Settings menu (bukan main nav) | Compliance/forensic — jarang dibuka |
| **Notification Groups** | Pindah ke Settings | Setup awal, jarang diubah |

### D.4 Backend Endpoint Cleanup

| Endpoint | Tindakan | Alasan |
|---|---|---|
| `/api/billing/router/:id/ppp-profiles` | Mark deprecated, hapus next major | Replaced by `/api/billing/mikrotik/:routerId/ppp-profiles` |
| `/api/billing/router/:id/isolir-firewall` + `/setup` | Mark deprecated, hapus | Replaced by `/api/billing/mikrotik/:routerId/isolir-setup` |
| `POST /api/routers/:id/test-connection` | Hapus | Duplikat `/api/routers/test-connection` |
| `POST /api/routers/:id/traffic/snmp` | Audit dulu, hapus jika orphan | No caller, purpose unclear |
| `GET /api/search/*` | Audit dulu, mungkin un-finished feature | No grep result |
| Double mount `/users` di `routes/index.ts:47-48` | Fix — pindah salah satu ke `/users/routers` | Express shadowing bug |
| `/api/ai/*` (ai.routes.ts) | Hapus atau document use case | No clear integration |

### D.5 Tidak Dihapus Tapi Perlu Refactor

| Item | Tindakan | Alasan |
|---|---|---|
| `NetworkMap.jsx` (86KB, 1999 baris) | **Split** ke beberapa file di `components/map/` | Terlalu besar, banyak responsibility |
| `Billing.jsx` (2059 baris) | Extract 8 inline tabs ke `pages/billing/*` | Mengikuti pola yg sudah ada |
| `useRouters.js` (60+ exports) | Pertimbangkan split ke `useRouters.js`, `useRouterMetrics.js`, `useRouterInterfaces.js` | Single file terlalu padat |
| `useBilling.js` (40+ exports) | Sama — split per domain (packages, customers, invoices) | Maintainability |

---

## Execution Strategy (Phase 2)

### Phase 2A — Quick Wins (Fix + Cleanup)
**Estimated effort**: ~3 jam
1. Mount `backup.routes.ts` + `diagnostics.routes.ts` (2 menit, fix 404 critical)
2. Hapus dead pages: `Routers.jsx.bak`, `Pppoe.jsx`, `SignUp.jsx`, `AnimationDemo.jsx`
3. Hapus dead hooks: `useAI`, `useGroups`, `useSocket` (+ remove dari `hooks/index.js` export)
4. Hapus dead functions di `Billing.jsx`: `CustomersTab`, `SubscriptionsTab` (~365 baris)
5. Konsolidasi `context/` + `contexts/` jadi `stores/` (rename + import path update)

### Phase 2B — Folder Restructure
**Estimated effort**: ~6 jam
1. Buat folder baru: `components/map/`, `components/panels/`, `components/charts/`, `components/layout/`, `stores/`, `services/`, `types/`, `constants/`
2. Pindahkan file ke folder yang sesuai (banyak `import` update — pakai TS path mapping `@/`)
3. Konsolidasi `lib/api/services/` + `services/` → single `services/`
4. Hapus 11 theme variants di `index.css`, sisakan Dark Luxury

### Phase 2C — Single Source of Truth
**Estimated effort**: ~4 jam
1. Buat `constants/status.js` (color tokens)
2. Buat `constants/polling.js` (semua refetchInterval)
3. Buat `constants/strings.js` (semua label)
4. Buat `components/ui/StatusBadge.jsx`, `LoadingState.jsx`, `ErrorState.jsx`, `EmptyState.jsx`
5. Refactor 5 page utama (Dashboard, NetworkMap, Routers, Alerts, Billing) untuk pakai constants + standard components

### Phase 2D — State Migration ke Zustand
**Estimated effort**: ~4 jam
1. Install `zustand` (^4.5)
2. Buat `stores/tenantStore.js`, `themeStore.js`, `mikhmonStore.js`, `uiStore.js`
3. Refactor 42 hooks: replace `localStorage.getItem('active-tenant-id')` jadi `useTenantStore`
4. Update axios interceptor pakai store getter
5. Hapus `ThemeContext.jsx`, `MikhmonContext.jsx`

### Phase 2E — Map Performance Overhaul
**Estimated effort**: ~6 jam
1. Split `NetworkMap.jsx` jadi `MapContainer.jsx` + markers/ + lines/ + overlays/
2. Apply `React.memo` + custom equality ke semua marker
3. Tambah marker clustering (`react-leaflet-markercluster` atau alternative)
4. Migrate `useNetwatchAll` polling → Socket.IO subscription
5. Konsolidasi `useSnmpTraffic` polling 2s → WebSocket atau hapus jika tidak critical
6. Lazy load marker icons (sprite atau on-demand)

### Phase 2F — Feature Pruning
**Estimated effort**: ~3 jam
1. Hapus Theme picker UI di Settings
2. Gate Tenants + VPN Servers ke superadmin only
3. Pindah Notification Groups + Audit Logs ke Settings sub-menu
4. Audit Mikhmon nested route, consolidate yang serupa
5. Mark deprecated old API endpoints (`/billing/router/*`)

### Total Effort
~26 jam (rough estimate, 3-4 hari focused work).

---

## Rollback Plan

Setiap phase = **1 commit** dengan summary jelas. Kalau salah satu phase break:
- `git revert <sha>` mengembalikan phase
- Setiap phase di-test dengan: `npm run build` + manual smoke test di `/`, `/map`, `/billing`, `/routers`
- Phase 2E (Map) butuh test extra: load 100+ marker di local dev, profile dengan Chrome DevTools

## Risk & Mitigation

| Risk | Mitigation |
|---|---|
| Massive folder restructure → banyak `import` break | Pakai TS path alias `@/*` konsisten. Setiap file move → langsung update import via VSCode rename refactor |
| Zustand migration → 42 hook butuh refactor | Buat helper `useTenantId()` (thin wrapper) supaya semua hook ganti 1 baris. Migrate batch 10 hook per commit |
| Hapus 11 theme variant → operator yang sudah pakai theme spesifik kehilangan setting | Default `:root` sudah Dark Luxury. Setting localStorage `app-theme` tetap ada tapi diabaikan. No data loss |
| Map clustering → marker behavior berubah | Test dengan dataset real (~100 router) sebelum rollout |
| Dead code delete → kalau ternyata ada caller eksternal | Audit dengan grep + `npx ts-prune` (mendeteksi unused exports) sebelum hapus |

---

## Success Criteria

Setelah Phase 2 selesai, project harus:

- ✅ **Folder konsisten**: 1 nama folder per concern, no `context/` + `contexts/` duplikasi
- ✅ **Single source of truth**: 1 file untuk status color, polling interval, label
- ✅ **`Billing.jsx` < 200 baris** (cuma root component + tab dispatch)
- ✅ **`NetworkMap.jsx` < 300 baris** (orchestrator + container)
- ✅ **No `localStorage.getItem` di komponen / hook** (semua via Zustand)
- ✅ **No hardcoded label string**
- ✅ **Map load 500 marker tanpa lag** (FPS > 30 di Chrome DevTools)
- ✅ **Build clean**: `tsc --noEmit` + `vite build` no warning
- ✅ **No 404 dari frontend call**: semua API mounted properly
- ✅ **1 theme aktif**: Dark Luxury, no theme picker

---

## Yang TIDAK Termasuk Phase 2

- Migrate ke Next.js (per user constraint)
- Migrate dari TanStack Query
- E2E test suite (terpisah, Phase 3)
- Internationalization (label sudah Indonesian + constants ready untuk i18n future)
- Backend service refactor (cuma cleanup endpoint, no service rewrite)
- Database schema migration (no breaking change di schema)

---

## Approval Required

Sebelum eksekusi, butuh approval untuk:

1. **Hapus 1400 baris dead code** — OK dengan operator? (data tidak akan hilang, cuma kode)
2. **Hapus 11 theme variant** — operator yang sudah pakai `.theme-cyberpunk` dst. akan revert ke default. OK?
3. **Install Zustand** (`~3kb`) — OK tambah dependency baru?
4. **Refactor 42 hooks** untuk pakai store — risiko regression. Phasing 10 hook per commit untuk minimize.
5. **Split `NetworkMap.jsx` 86KB → multi-file** — ada risiko Map break sebentar. Smoke test wajib.

Tunggu confirm dari Anda sebelum mulai Phase 2A.
