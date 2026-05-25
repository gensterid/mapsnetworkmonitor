# Audit & Roadmap — Maps Network Monitor

**Last reviewed:** 2026-05-24
**Mode:** Living document — update saat fitur selesai/diubah.

## Legenda Status

| Mark | Arti |
|---|---|
| ✅ | Done — sudah deployed ke production |
| 🟡 | Partial — sebagian elemen sudah ada, masih ada gap |
| ⬜ | Not started |
| ❓ | Perlu verifikasi — mungkin sudah ada tapi belum dikonfirmasi |
| 🔵 | In progress / planned next |

---

## 🔴 SUPERADMIN

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Tenant overview dashboard (revenue, customer count, churn per tenant) | ⬜ | Belum ada |
| 2 | Suspend tenant tanpa delete | ⬜ | Belum ada toggle suspend |
| 3 | Resource quota per tenant (max customers/routers per tier) | ⬜ | Belum ada konsep tier |
| 4 | Cross-tenant audit log (siapa ngapain di tenant mana) | 🟡 | Audit log ada (Phase A3 routes), tapi belum cross-tenant view |
| 5 | Alerting ke superadmin saat tenant critical | 🟡 | Diagnostics dashboard ada (Phase 11), tapi push alert belum |

---

## 🟠 ADMIN (Pemilik ISP)

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Wizard setup ISP pertama kali (paket → router → voucher → notifikasi) | ⬜ | Billing 8 tab masih raw |
| 2 | Payment gateway integration (Midtrans/Xendit/Tripay) | ❓ | Perlu verifikasi |
| 3 | Customer bulk import CSV | ⬜ | Belum ada |
| 4 | Report exportable PDF/Excel | ❓ | Cek Billing → Laporan |
| 5 | WhatsApp template builder dengan preview & variabel | ❓ | Cek Notifications |
| 6 | Voucher analytics (mana laris, expired rate, conversion) | ⬜ | Belum ada |
| 7 | Customer balance/deposit system | ⬜ | Belum ada |
| 8 | Bandwidth quota (FUP, bursting) per customer | ❓ | Cek subscription |

---

## 🟡 OPERATOR (Teknisi Lapangan)

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Global search Cmd+K (customer/router/IP/SN) | ⬜ | Belum ada, Tier 3 di Phase 8 audit |
| 2 | Quick actions di marker map: ping ✅, reboot ONU, restart interface | 🟡 | Ping sudah (Phase 14). Reboot/restart belum |
| 3 | Customer 360° view (1 halaman semua tentang customer) | ⬜ | Sekarang tersebar di 5+ tab |
| 4 | Bulk operations (bulk WA, bulk paket change, bulk reboot) | 🟡 | GenieACS bulk apply ada, lainnya belum |
| 5 | Notes per device/customer | ⬜ | Belum ada |
| 6 | Inline edit di tables (rename customer langsung) | ⬜ | Selalu modal |
| 7 | Mobile offline (PWA cache) | ⬜ | Belum ada service worker |
| 8 | Workflow checklists ("Setup customer baru") | ⬜ | Belum ada |
| 9 | Sticky table headers di halaman list | ✅ | Phase 7 selesai |
| 10 | Mobile responsive penuh | ✅ | Phase 10 selesai |
| 11 | Network Tools Panel (ping/traceroute/port check) | ✅ | Phase 14 selesai |
| 12 | Map delete dialog dengan 3 opsi | ✅ | Phase 13 selesai |
| 13 | Theme aware toggle untuk semua tema | ✅ | Phase 12 selesai |
| 14 | Netwatch sync auto-cleanup + topology orphan handler | ✅ | Phase 15 selesai |
| 15 | Linkage hardening (strict mode untuk router tanpa OLT) | ✅ | Phase 16 selesai |

---

## 🟢 CUSTOMER/USER

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | Member portal extended (speed test, outage history, WiFi status) | 🟡 | Member portal ada, fitur limited |
| 2 | WiFi self-service via ACS (change SSID/password) | ⬜ | Belum ada UI customer |
| 3 | WiFi QR code untuk sharing | ⬜ | Belum ada |
| 4 | Payment history + receipt download PDF | ❓ | Cek Member portal |
| 5 | Outage notification proaktif via WA | ⬜ | Belum ada |
| 6 | Support ticket dari Member portal | ⬜ | Belum ada |
| 7 | Refund/credit request workflow | ⬜ | Belum ada |
| 8 | Cek Status lebih informatif (ETA, reason) | 🟡 | Cek Status ada tapi minim info |

---

## ⚪ CROSS-CUTTING (Semua Persona)

| # | Item | Status | Catatan |
|---|---|---|---|
| 1 | 2FA untuk admin/superadmin | ⬜ | Belum ada |
| 2 | Audit log visible di UI (bukan cuma backend log) | 🟡 | `/api/settings/audit-logs` ada (Phase A3), UI belum |
| 3 | Error messages actionable (bukan generic "Failed") | ⬜ | Banyak yang masih generic |
| 4 | Real-time updates extend ke alerts/status | 🟡 | WebSocket ada untuk traffic, alerts masih polling |
| 5 | Empty states + onboarding tooltips | ⬜ | Saran di Phase 10 |
| 6 | Performance audit (slow query, pagination defaults) | 🟡 | Index Phase 2 ada (migration 0033), perlu profile ulang |
| 7 | Public REST API + webhook keluar untuk integrasi | ⬜ | Belum ada API key untuk eksternal |
| 8 | Backup automation (S3/cloud scheduled) | 🟡 | Manual backup ada di Maintenance, schedule belum |
| 9 | Internationalization konsisten (pilih ID primary + EN) | ⬜ | Campuran sekarang |
| 10 | In-app documentation (help button per page) | 🟡 | "Panduan Sistem" tab ada di Settings, contextual help belum |

---

## 🎯 PRIORITAS NEXT (top 5 high-impact)

1. **Customer 360° view** (Operator) — productivity ×3
2. **Global search Cmd+K** (Operator) — navigasi ×5
3. **2FA admin/superadmin** (Cross-cutting) — security baseline
4. **WhatsApp outage notification proaktif** (Customer) — turunkan komplain
5. **Payment gateway integration** (Admin) — auto-reconcile jam operator

---

## 📝 Phase Recap (yang sudah selesai)

| Phase | Topic | Commit Reference |
|---|---|---|
| 1 | Security & Bug Fix initial | — |
| 2 | Performance indexes | Migration 0033 |
| 3 | Plan A1-A8 hardening | — |
| 4 | OLT diagnostic fault fix | — |
| 5 | Architecture documentation | docs/ARCHITECTURE.md |
| 6 | Proxmox health check | — |
| 7 | Sticky table headers | `5ac1049` |
| 8 | UX Navigation audit (advisory) | — (saran tertulis) |
| 9 | Smart netwatch auto-heal + IP history | partial — `linked_onu_id` infra ada |
| 10 | Mobile UX finalization | multiple commits |
| 11 | Diagnostics health analysis + auto-fix | — |
| 12 | Theme-aware toggle | — |
| 13 | Map delete reliability + DB hygiene | — |
| 14 | Network Tools Panel | — |
| 15 | Netwatch sync cleanup safety | `c9b453d` |
| 16 | Linkage hardening (strict mode) | `8fb75db` |
| Hot | ODP-ONU JOIN bypass | `4b5200c` |
| Hot | Linkage skip ODP entries | `d25ddec` |
| 17 | OLT sync: clear stale lastDownReason + sticky archive + unarchive endpoint | `47aeb01` |
| 18 | OLT sync: propagate name update from OLT to DB (skip ONT-XXXX placeholder) | `86cb4b7` |
| 19 | OLT sync: fallback to device.description when name empty (HSGQ vendor compat) | `3eb8515` |
| 20 | getOnus(): filter archived in DB-fallback + HSGQ debug log toggle | `f59e2e4` |
| 21 | getOnus(): propagate name + clear stale lastDownReason in UPDATE path | `d16f17f` |

---

## Cara update file ini

1. Saat fitur selesai → ganti ⬜/🟡 menjadi ✅, tambahkan ke "Phase Recap" dengan commit hash
2. Saat ada item baru ditemukan → tambah row dengan status ⬜
3. Saat next priority berubah → update section "🎯 PRIORITAS NEXT"
4. Tanggal di header → update setiap revisi besar

File ini di-track di git, jadi history audit ada di `git log docs/AUDIT-ROADMAP.md`.
