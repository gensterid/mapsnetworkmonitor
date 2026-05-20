# Audit Prompts — System-Wide Review

Daftar prompt siap pakai untuk audit menyeluruh aplikasi MikroTik Monitor.
Dirancang berdasarkan pola bug yang muncul sepanjang development — 80% bug
historis datang dari 4 area utama (data integrity, query layer, frontend cache,
background jobs).

## Cara pakai

1. Pilih satu prompt sesuai prioritas saat itu.
2. Paste ke sesi **Claude Code baru** (atau sesi existing — pastikan working
   directory di root repo).
3. Tunggu eksplorasi agent (~5–15 menit).
4. Hasil: daftar konkret `file:line` + severity + saran fix.
5. **Jangan langsung fix semua dalam 1 sesi** — spawn sesi terpisah per
   kategori HIGH severity untuk implementation yang focused.

## Rekomendasi urutan eksekusi

1. **PROMPT 1** — Data Integrity (paling sering jadi sumber bug)
2. **PROMPT 2** — Backend Query Layer (continuation natural)
3. **PROMPT 4** — Background Jobs (sync issues kelihatan)
4. **PROMPT 3** — Frontend Cache Strategy (bug terbaru)
5. **PROMPT 5** — Security & RBAC (wajib sebelum scale up)
6. **PROMPT 7** — Performance Profiling (sebelum tambah router)
7. **PROMPT 6** — UI/UX Consistency
8. **PROMPT 8** — Observability & Logging
9. **PROMPT 9** — Documentation & Tests

---

## PROMPT 1 — Data Integrity Audit

```
Audit data integrity di aplikasi multi-tenant ISP monitoring (Node.js + Drizzle + PostgreSQL + TimescaleDB). Repo di apps/api/ dan apps/web/.

Pattern yang harus dicari:

1. **Dangling references** — jalankan SQL di Proxmox untuk cari:
   - router_netwatch.linked_onu_id pointing ke ONU yang tidak ada / archived
   - router_netwatch.connected_to_id pointing ke entity yang tidak ada
   - onus.olt_id pointing ke OLT yang tidak ada
   - Semua FK lain tanpa ON DELETE rule yang tegas

2. **Soft-delete consistency** — review onus.archived_at:
   - Apakah semua query GET filter archived_at IS NULL?
   - Apakah ada FK ke onus yang masih reference row archived?
   - Apakah retention untuk archived ONU >60 hari benar-benar dihapus?

3. **Unique constraint gaps** — cari:
   - (router_id, host) duplikat di router_netwatch
   - sn duplikat di onus dengan different router_id
   - name duplikat dalam satu router yang bisa cause merge confusion

4. **Tenant isolation leaks** — review semua repository:
   - Setiap findAll/findById receive dan filter by tenantId?
   - Ada query yang bypass tenantId filter (cross-tenant leak)?

5. **Cascade rules di schema** — review apps/api/src/db/schema/*.ts:
   - Apakah ada FK references() tanpa onDelete?
   - DELETE OLT → apa yang terjadi ke ONU dan related?
   - DELETE router → apa yang terjadi ke netwatch, ONUs, dst?

Output format:
- HIGH/MED/LOW severity per finding
- file:line + SQL query untuk verifikasi di production DB
- Saran fix singkat per finding

Max 30 findings. Sertakan 1 contoh SQL diagnostic per kategori untuk dijalankan di Proxmox.
```

---

## PROMPT 2 — Backend Query Layer Audit

```
Audit query layer di apps/api/src/repositories/ dan apps/api/src/services/.

Fokus:

1. **COALESCE priority** — cari semua COALESCE di query repositories. Untuk tiap: tentukan mana sumber otoritatif (apakah yang user edit, atau yang auto-sync). Flag yang priorityNya salah.

2. **Complex LEFT JOIN dengan subquery** — cari pattern `.leftJoin(... sql\`SELECT ... WHERE ...\`)` yang bisa lambat atau merge salah:
   - apakah subquery LIMIT 1 punya ORDER BY yang deterministik?
   - apakah ada possibility cross-tenant match?

3. **Field serialization consistency** — untuk setiap entity (router, netwatch, onu, olt):
   - GET endpoint return field apa saja
   - PUT/POST accept field apa saja
   - Apakah ada field yang GET return tapi PUT tidak accept (operator tidak bisa edit field yang dia lihat) — atau sebaliknya

4. **N+1 patterns** — cari pattern `forEach (await db.select...)` atau `Promise.all(items.map(async item => db.select(...)))` di service layer. Bisa di-batch?

5. **Slow query candidates** — review:
   - Query tanpa index pada column filter
   - Query yang join >3 tabel
   - Query yang return semua row tanpa LIMIT untuk list endpoint

Output: file:line + masalah + saran (rewrite ke prepared statement, tambah index, batch dengan inArray, dst). Sertakan EXPLAIN ANALYZE command yang user bisa jalankan untuk verifikasi.
```

---

## PROMPT 3 — Frontend Cache Strategy Audit

```
Audit React Query cache strategy di apps/web/src/. Aplikasi pakai TanStack Query v5.

Pattern problematik yang harus dicari:

1. **Optimistic update shape mismatch** — untuk setiap `useMutation` dengan `onMutate`:
   - Tarik shape dari useQuery yang queryKey-nya sama
   - Bandingkan: apakah onMutate setQueryData patch dengan shape yang sama?
   - Khusus cari: flat array vs nested array, snake_case vs camelCase, string vs number untuk numeric fields

2. **Query key consistency** — list semua queryKey yang dipakai:
   - Cari naming inconsistent: `['onus-map']` vs `['onus', 'map']` vs `['onusMap']`
   - Untuk tiap key, list semua tempat yang invalidate — apakah konsisten?
   - Ada query yang ter-fetch tapi tidak pernah di-invalidate setelah relevant mutation?

3. **staleTime + refetchInterval combo**:
   - Konflik: staleTime > refetchInterval = refetch jalan tapi pakai cached
   - Refetch interval terlalu sering (<10s) untuk data yang jarang berubah?
   - Refetch terlalu jarang (>5 min) untuk data yang user edit?

4. **Race conditions**:
   - cancelQueries dipanggil sebelum optimistic? (kalau tidak, refetch in-flight bisa overwrite)
   - onSuccess invalidate + onError rollback — apakah context preserved benar?

5. **Memory leaks**:
   - useQuery di komponen yang sering mount/unmount tanpa enabled gate
   - subscribe ke event/socket tanpa cleanup di useEffect return

Output: file:line + masalah + fix. Khusus highlight mutation yang berinteraksi dengan map (drag, archive, delete) — karena ini area dengan banyak bug terbaru.
```

---

## PROMPT 4 — Background Jobs Audit

```
Audit semua background task di apps/api/src/lib/scheduler.ts dan service yang dipanggil olehnya.

Fokus:

1. **Failure isolation** — untuk setiap setInterval task:
   - Try/catch di outer level?
   - Failure di satu router bikin batch gagal seluruhnya?
   - Logging meaningful kalau gagal (bukan cuma generic "sync failed")?

2. **Idempotency**:
   - Task bisa di-run 2× tanpa duplikat insert atau side-effect ganda?
   - Webhook re-config yang bug sebelumnya — pattern serupa di sync lain?

3. **Concurrency dengan user action**:
   - User edit data X, sync pull data X dari source, siapa menang?
   - Ada lock/optimistic concurrency check?

4. **Resource cleanup**:
   - Connection MikroTik di-release sesudah pakai?
   - Redis subscriber di-dispose saat process exit?
   - Memory yang ter-akumulasi (mis. Map global yang grow tanpa cleanup)?

5. **Backpressure**:
   - Kalau sync lambat dan interval kembali fire, di-skip atau di-stack?
   - BullMQ queue depth monitoring?

6. **Stuck detection**:
   - Setiap polling cycle punya max duration timeout?
   - Logging kalau cycle >N detik?

Output untuk tiap task: nama task, interval, failure mode sekarang, severity bug yang mungkin, fix saran. Total ~10-15 task.
```

---

## PROMPT 5 — Security & RBAC Audit

```
Audit security & authorization di aplikasi monitoring multi-tenant.

Fokus:

1. **Tenant isolation** — untuk SETIAP route di apps/api/src/routes/:
   - Apakah pakai getEffectiveTenantId(req)?
   - Apakah service di-call dengan tenantId filter?
   - Apakah ada endpoint yang bisa diakses cross-tenant?
   - Cek juga: superadmin behavior — boleh akses semua tenant, tapi apakah harus ada warning?

2. **RBAC consistency**:
   - Untuk setiap route, list role yang required (admin/operator/user/superadmin)
   - Cek apakah UI tampilkan tombol yang aksi-nya butuh role lebih tinggi (UI permits, backend rejects)
   - Cek apakah ada destructive endpoint (DELETE, drop) yang cuma butuh requireOperator (mungkin harusnya requireAdmin)

3. **SQL injection vectors**:
   - Cari `sql.raw(`...${var}...`)` — variable di-sanitize?
   - Template literal `sql\`... ${var} ...\`` — Drizzle handle? Atau ada yang concat manual?
   - User input yang masuk ke ORDER BY column name?

4. **XSS/Output sanitization**:
   - Frontend render data dari DB — ada yang pakai dangerouslySetInnerHTML?
   - Notes/comment field yang bisa diisi user — di-render apa adanya?

5. **Secret management**:
   - Cek log: apakah ada plain-text secret yang muncul (token, password)?
   - Encryption key rotation: prosedur ada?
   - Webhook secret: regenerate flow ada?

6. **Rate limiting**:
   - Endpoint yang public-facing (login, member, cek status) — rate limit?
   - Endpoint yang expensive (AI, GenieACS) — rate limit?
   - Cek apps/api/src/config/security.ts untuk konfigurasi

Output: matriks endpoint × required role × tenant scope check. HIGH severity: cross-tenant leak. MED: missing rate limit. LOW: stylistic.
```

---

## PROMPT 6 — UI/UX Consistency Audit

```
Audit konsistensi UI/UX di apps/web/src/. Aplikasi pakai Tailwind + 8 theme (CSS variables).

Pattern yang harus dicari:

1. **Theme breakage** — kasus seperti SpaceX (white --primary):
   - Semua `text-white` di atas `bg-primary` — sudah pakai `text-[var(--on-primary)]`?
   - Semua `bg-slate-*` hardcoded yang seharusnya pakai theme-aware var
   - Semua toggle/switch — sudah pakai komponen <Toggle>?

2. **Loading & error states** — untuk setiap useQuery/useMutation:
   - Ada loading spinner saat fetch?
   - Ada error UI saat fetch gagal?
   - Ada empty state saat data kosong?

3. **Responsive breakpoints**:
   - Cari `grid-cols-N` tanpa breakpoint (cramped di mobile)
   - Cari `w-[Npx]` atau `max-w-[Npx]` hardcoded
   - Modal tanpa max-h-[90vh] overflow-y-auto
   - Tabel tanpa overflow-x-auto wrapper

4. **Accessibility**:
   - Button tanpa aria-label kalau cuma icon
   - Input tanpa label / autoComplete attribute
   - Focus ring visible di semua interactive element
   - Color contrast (penting di dark theme)

5. **Form UX**:
   - Field optional vs required jelas?
   - Validation error tampil dekat field, bukan global?
   - Disabled state saat saving?
   - Field optional bisa dikosongkan kembali (lihat issue SearchableSelect)?

6. **Confirmation dialogs**:
   - window.confirm masih dipakai? Replace dengan modal?
   - Destructive action (delete) punya 2-step confirmation?

Output: ranked HIGH/MED/LOW per page atau component. Estimasi effort fix per item. Total ~30-50 finding.
```

---

## PROMPT 7 — Performance Profiling

```
Profiling performance & identifikasi bottleneck di aplikasi monitoring.

Fokus:

1. **DB performance** — jalankan di production Proxmox:
   - Top 10 query terlama (pg_stat_statements)
   - Tabel terbesar dengan growth rate
   - Index unused (pg_stat_user_indexes idx_scan = 0)
   - Hypertable TimescaleDB: compression policy ada? chunk size sesuai?

2. **API endpoint** — instrument middleware:
   - Endpoint dengan p95 > 1 detik
   - Endpoint dengan request count tertinggi (apakah perlu cache?)
   - Endpoint yang sering timeout

3. **Frontend bundle**:
   - Total bundle size (target <500KB main chunk)
   - Library terbesar (apakah dipakai semuanya?)
   - Code-splitting opportunities (page-level lazy load)
   - Image/asset yang tidak dioptimasi

4. **Background jobs**:
   - Sync cycle duration trend
   - Queue depth trend (BullMQ)
   - Memory growth selama proses jalan

5. **Network**:
   - Request size berlebih (mengirim seluruh row untuk update 1 field)
   - Polling interval vs websocket alternative
   - GZIP/Brotli aktif di nginx?

Output: prioritized list dengan dampak (latency saved, MB saved, % reduction) dan effort.
```

---

## PROMPT 8 — Observability & Logging Audit

```
Audit logging dan observability di apps/api/src/.

Fokus:

1. **Log noise** — analisis pm2 logs 1 jam terakhir:
   - Top 10 error message paling sering muncul — apakah benar-benar perlu ERROR atau bisa diturunkan ke WARN?
   - Repetitive log dari single source (loop spam)
   - Stack trace yang dibuang setiap N detik

2. **Log structure**:
   - Setiap log line punya context (routerId, tenantId, userId) — atau cuma message?
   - Log level konsisten (jangan info untuk hal yang gagal)
   - Sensitive data tidak ter-log (password, token)

3. **Audit trail** — destructive action:
   - Delete router/onu/netwatch — siapa, kapan, before/after state?
   - Update credential — siapa, kapan?
   - Bulk action — siapa, scope?

4. **Metrics gap**:
   - Apakah ada metric untuk: polling success rate per router, netwatch sync duration, queue throughput?
   - Diagnostics dashboard (Settings → Diagnostics) cover semua?

5. **Error tracking**:
   - Sentry atau similar terpasang?
   - Error yang tidak di-handle (uncaught promise rejection) ter-log?
   - Frontend error (toast, console) ter-laporkan?

Output: list noise yang bisa dikurangi, missing audit, missing metrics. Prioritize by frequency.
```

---

## PROMPT 9 — Documentation & Test Coverage

```
Audit dokumentasi dan test coverage.

Fokus:

1. **CLAUDE.md** atau README:
   - Setup dev environment dijelaskan?
   - Arsitektur high-level (apa yang ada di apps/api vs apps/web)?
   - Cara deploy ke Proxmox?
   - Convention coding yang penting (mis. cache invalidation pattern, optimistic update pattern)?

2. **API documentation**:
   - Apakah ada list endpoint (Swagger/OpenAPI)?
   - Schema request/response per endpoint?
   - Authentication required di-dokumentasi?

3. **Operational runbook** — untuk skenario:
   - Backup & restore DB
   - Rotate ENCRYPTION_KEY (yang sebelumnya saya bilang complex)
   - Tambah router baru ke fleet
   - Investigate alert false positive
   - Recovery dari Redis down
   - Recovery dari OLT password bocor

4. **Test coverage** — cari di apps/api/__tests__/ apps/api/src/tests/ apps/web/src/__tests__/:
   - Critical path: login, drag marker, archive/delete entity, webhook flow
   - Integration test: full request-response cycle
   - Unit test: edge case di transformer/serializer
   - Test ratio: backend vs frontend

5. **Migration documentation**:
   - Migration list di apps/api/src/db/migrations/ — ada README/notes?
   - Roll-back plan per migration?
   - Production deployment notes (yang butuh manual run)?

Output: gap analysis per kategori. Prioritas: critical path test paling urgent (ketika kita refactor sering bikin bug).
```

---

## Catatan eksekusi

- **Hemat token**: jangan minta semua audit dalam 1 sesi. Spawn sesi per kategori.
- **Verifikasi sebelum fix**: hasil audit adalah daftar kandidat — sampling dulu sebelum bulk action.
- **Update file ini** kalau ada pattern bug baru yang muncul setelah audit — supaya prompt mencakup learning future.
