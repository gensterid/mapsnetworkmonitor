# Rancangan: Fiber Cable Segments (Cara C — Ruas Kabel)

**Status:** 🎯 Rancangan — siap dibangun setelah approval
**Tanggal:** 2026-07-05

## Ringkasan

Objek **Kabel** baru yang bisa digambar bebas di peta, membawa sekumpulan
core (warna TIA-598), dan dirender sebagai garis belang N-core. Fully manual,
fully flexible — kamu gambar kabel apa adanya sesuai lokasi, centang core yang
dibawanya. **Melengkapi** model device-tree (`connectedToId`) yang ada; tidak
menggantikan.

**Kenapa Cara C, bukan model pohon sekarang:** model pohon mengikat core ke
`connectedToId` (tiap device 1 induk) → tak bisa core yang gabung/pisah/merge
bebas. Contoh yang tak bisa digambar pohon: core biru turun di ODP ADY tapi
lanjut lagi bareng oranye di hilir. Cara C: gambar tiap ruas kabel + centang
core-nya → apa pun bisa.

**Kenapa Cara C, bukan Cara B (kabel + tap):** Cara B menambah objek "tap"
(ODP nyadap core di posisi tertentu) + drop line otomatis + trunk menipis
otomatis. Berat (~4–5 hari). Cara C membuang semua otomatisasi itu — cukup
gambar + centang core. ~2.5 hari, dan jadi fondasi kalau nanti mau upgrade ke B.

---

## 1. Konsep

- **Kabel = 1 polyline + daftar core.** Digambar bebas (waypoints), centang core
  mana saja yang dibawanya (mis. `[1,2]` = biru+oranye).
- **Render** = belang N-core (reuse candy-stripe yang sudah ada). 1 core → solid.
- **Core "fleksibel"** — numpang, pisah, gabung, lanjut — semua terwujud karena
  operator menggambar tiap ruas kabel apa adanya. Tidak ada logika otomatis.

```
Contoh (biru turun di ADY tapi lanjut bareng oranye):

PUSAT ══(biru+oranye)══ ADY ══(biru+oranye)══ hilir…
                         ╲
                       (biru) → client        ← 3 ruas kabel, digambar manual
```

Kelanjutan core = gambar ruas kabel berikutnya dengan core yang sama. Tak ada
garis penghubung "hantu" — setiap garis = kabel nyata yang kamu gambar.

---

## 2. Skema data (1 tabel — additive, zero perubahan tabel lama)

```
fiber_cables
├─ id             uuid pk default random
├─ tenant_id      uuid → tenants        (scope multi-tenant WAJIB di tiap query)
├─ router_id      uuid → routers  NULL  (opsional; filter per area router)
├─ name           text            NULL  (mis. "Trunk PUSAT-ADY", "Drop ADY-C1")
├─ path           jsonb                 [[lat,lng],…] rute kabel (≥2 titik)
├─ cores          jsonb                 [1,2] index core TIA-598 yang dibawa
├─ from_device_id uuid            NULL  (opsional anchor ujung awal)
├─ to_device_id   uuid            NULL  (opsional anchor ujung akhir)
├─ notes          text            NULL
└─ created_at / updated_at
```

- `cores` = array index core (1-based) → warna via `coreColor(i)` di
  `apps/web/src/lib/fiberColors.js`.
- `from/to_device_id` opsional: kalau diisi, ujung path bisa **snap** ke
  koordinat device (ikut pindah kalau device digeser). Kalau kosong = mengambang.
- Migration `00XX_fiber_cables.sql`: `CREATE TABLE` + index `tenant_id`,
  `router_id`. WAJIB `--> statement-breakpoint` antar statement + update
  `meta/_journal.json` (dua jebakan silent-fail migration di project ini).

---

## 3. Backend (API) — perlu rebuild `dist/`

```
apps/api/src/
├─ db/schema/cables.ts                 (Drizzle table def)
├─ db/migrations/00XX_fiber_cables.sql
├─ repositories/cable.repository.ts    (findByTenant/Router, create, update, delete)
├─ services/cable.service.ts           (CRUD + validasi + tenant scope)
└─ routes/cable.routes.ts
     GET    /api/cables?routerId=   (list, tenant-scoped)
     POST   /api/cables            (create)
     GET    /api/cables/:id
     PUT    /api/cables/:id        (update path/cores/name)
     DELETE /api/cables/:id
```

- `authMiddleware` + `requireOperator` + `getEffectiveTenantId(req)` (IDOR guard,
  sama seperti route lain — jangan sampai bocor lintas tenant).
- Validasi Zod: `cores` array int 1..96; `path` array pasangan angka ≥2.
- Mount di `app.ts`.
- **Wajib** `npm run build --workspace apps/api` sebelum `pm2 restart monitoring-api`.

---

## 4. Frontend

### Data
- Hook `useCables(routerId?)` — TanStack Query key `['cables', routerId]`.
  Mutation create/update/delete → optimistic + `invalidateQueries(['cables'])`.
- `services/cable.service.ts` — get/post/put/del.

### Render (layer baru, bisa di-toggle)
- Ekstrak render candy-stripe yang ada jadi helper reusable
  `renderCandy(path, coreIndices)` → N `<Polyline>` dashed offset (1 per core,
  warna `coreColor(i).hex`). Dipakai untuk lineCores lama **dan** objek kabel.
- Tiap kabel: `renderCandy(cable.path, cable.cores)`. `cores.length===1` → solid.
- Klik kabel → popup (nama, daftar core + swatch, panjang via `calculatePathLength`).
- Pane di bawah marker, di atas tile.

### UI menggambar
- **Mode "Gambar Kabel"** (tombol toolbar):
  1. Klik marker device (opsional) → set `from_device_id` + titik awal = koordinatnya.
  2. Klik titik-titik di peta → tambah waypoint (reuse handler klik yang sudah
     dipakai untuk pick-coordinate / edit waypoint).
  3. Klik marker device lain / "Selesai" → set `to_device_id` + titik akhir.
  4. Form kecil: nama + **chip core C1..CN** (pilih core yang dibawa, reuse
     swatch `fiberColors`) → Simpan.
- **Edit Kabel**: klik kabel → "Edit" → geser waypoint via `EditablePath`
  (komponen yang sudah ada untuk "Edit Jalur"), ubah core + nama → Simpan. Hapus.
- **Toggle "Kabel"** di kontrol peta → tampilkan/sembunyikan layer (perf di peta
  500+ marker).

### Koeksistensi
- Kabel = overlay terpisah. Garis device-tree (`connectedToId`) tetap jalan.
  Operator bisa sembunyikan garis device & tampilkan kabel saja, atau dua-duanya.
- Zero dampak ke data koordinat/line/billing existing.

---

## 5. Alur pakai (contoh biru turun ADY tapi lanjut)

1. Toolbar → **Gambar Kabel**. Klik PUSAT → titik belok → klik ADY → Selesai.
   Core = `[C1 biru, C2 oranye]` → Simpan. → **PUSAT→ADY belang 2-core**.
2. Gambar Kabel lagi: ADY → client1. Core = `[C1 biru]`. → **drop biru**.
3. Gambar Kabel: ADY → hilir. Core = `[C1 biru, C2 oranye]`. → **biru lanjut
   bareng oranye**.

Selesai. Semua ruas real, core bebas.

---

## 6. Fase

| Fase | Isi | Estimasi |
|---|---|---|
| **C1** | Skema + migration + API CRUD + hook `useCables` + render kabel sbg candy polyline (tampil kabel yg sudah ada) | ~0.75 hari |
| **C2** | UI "Gambar Kabel" (klik jalur + pilih core + simpan), snap ke device opsional | ~0.75 hari |
| **C3** | Edit/hapus kabel (geser waypoint via EditablePath, ubah core), popup klik | ~0.5 hari |
| **C4** | Toggle layer, poles (label, panjang, snap), rapikan koeksistensi | ~0.5 hari |
| **Total** | | **~2.5 hari** + tes + deploy |

Minimal yang sudah kepakai = **C1 + C2** (~1.5 hari): bisa gambar kabel N-core.

---

## 7. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| UX menggambar polyline di Leaflet | Reuse `EditablePath` + handler pick-coordinate yang sudah ada |
| Performa layer kabel di peta besar | Toggle layer; render candy hanya saat ditampilkan |
| Migration silent-fail | `--> statement-breakpoint` + update `_journal.json` |
| Lupa rebuild API | Checklist deploy: build API + build web + restart dua-duanya + purge Cloudflare |
| 2 kabel menimpa di jalan sama | Jarang (1 kabel = 1 rute fisik dgn semua core-nya); kalau perlu, opsi offset paralel di C4 |

Zero migrasi destruktif; semua additive.

---

## 8. Bukan cakupan v1 (biar tetap sederhana)

- Tak ada tap/drop otomatis (itu Cara B).
- Tak ada "core menipis otomatis" — tiap ruas core-nya digambar manual.
- Tak ada pelacakan kontinuitas core antar kabel (kontinuitas visual via warna
  yang konsisten).
- Tak terhubung ke `connectedToId` device (kabel objek independen).

## 9. Jalur upgrade ke Cara B (kalau nanti perlu)

Tabel `fiber_cables` = fondasi. Cara B tinggal menambah `cable_taps` + render
drop otomatis + core-menipis di atasnya. **Cara C tidak terbuang.**
