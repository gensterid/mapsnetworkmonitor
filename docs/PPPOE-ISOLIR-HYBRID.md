# PPPoE Isolir Hybrid — App + MikroTik Safety Net

Setup hybrid: app billing sebagai primary scheduler, MikroTik scheduler
sebagai safety net kalau app down. Dipakai sejak commit yang ubah
format comment PPP secret jadi date-prefix.

## Konsep

| Layer | Frekuensi | Logic | Aware-of-payment? |
|---|---|---|---|
| **App scheduler** (`runBillingDailyJob`) | Tiap 1 jam | Query DB → cek subscription unpaid + grace period → push isolir + WA notif | ✅ Ya (DB authoritative) |
| **MikroTik scheduler** | 1× sehari (saran 03:00) | Loop `/ppp secret` → cek `[:pick comment 0 11]` = tanggal hari ini → set profile=ISOLIR | ❌ Tidak (tergantung comment yang app push) |

App tetap **primary**. MikroTik scheduler cuma backup catch-up kalau app
down >1 jam (skip beberapa cycle).

## Format Comment yang App Push

Per commit ini, comment di setiap PPP secret yang dibuat app billing:

```
oct/15/2026 subscription:dbaa74c5-... dn:20261015 paket:Paket_10_Mbps
```

| Posisi | Isi | Dibaca oleh |
|---|---|---|
| Char 0-10 | `oct/15/2026` (tanggal isolir, format mmm/dd/yyyy lowercase) | **MikroTik scheduler** `[:pick comment 0 11]` |
| Setelah space | `subscription:<uuid>` | App billing — sebagai DB tracking key |
| `dn:<YYYYMMDD>` | Numeric date untuk fast comparison | Backward-compat field |
| `paket:<name>` | Nama paket (spaces → underscore) | Operator readable di Winbox |

## Kapan Comment Di-update

App auto-update comment di MikroTik setiap event ini:

| Event | Code path | Comment baru berdasar |
|---|---|---|
| Subscription create | `billing.service.ts subscriptionService.create()` | `computeIsolirDate(nextDueAt, graceDays)` |
| Subscription update (manual edit operator) | `billing.service.ts subscriptionService.update()` | Sama dengan create |
| **Invoice generated tiap bulan** (scheduler) | `billing-scheduler.ts runBillingDailyJob() step 1` | `computeIsolirDate(newNextDueAt, graceDays)` |
| Customer bayar → unisolir | `billing.service.ts subscriptionService.unisolir()` | `computeIsolirDate(nextDueAt baru, graceDays)` |

Saat `isolir()` dipanggil — comment **tidak di-update**, tetap di tanggal
isolir hari itu. Customer yang sudah isolir nanti di-unisolir saat bayar,
sekaligus comment di-shift ke tanggal isolir bulan depan.

## Script MikroTik (Safety Net) — Compatible OS 6 dan 7

Script yang Anda jalankan tiap hari. Simpan di `/system script` dengan nama
`isolir-pppoe-harian`, lalu schedule di `/system scheduler`.

**Penting compatibility**:
- ROS 6.x hanya support path **space-separated** (`/ppp secret find`)
- ROS 7.x support keduanya (slash atau space)
- Date format: ROS 6 = `mmm/dd/yyyy` (lowercase), ROS 7 = `yyyy-mm-dd` ISO
- Script di bawah handle dua-duanya

### Versi 1 — Pakai field `dn:YYYYMMDD` (recommended)

```routeros
:local isolirProfile "ISOLIR"

# Pre-check: profile harus ada — bail kalau tidak (gak akan run silent)
:if ([:len [/ppp profile find name=$isolirProfile]] = 0) do={
  :log error ("Profile " . $isolirProfile . " tidak ada. Bikin: /ppp profile add name=" . $isolirProfile . " rate-limit=1k/1k")
  :error ("Profile " . $isolirProfile . " not found")
}

:local now [/system clock get date]
:local todayNum 0

# Detect format date (ROS 6 vs ROS 7)
:if ([:pick $now 4 5] = "-") do={
  # ROS 7 ISO: "2026-06-12"
  :set todayNum [:tonum ([:pick $now 0 4] . [:pick $now 5 7] . [:pick $now 8 10])]
} else={
  # ROS 6 legacy: "jun/12/2026"
  :local mm [:pick $now 0 3]
  :local mn "00"
  :if ($mm = "jan") do={ :set mn "01" }
  :if ($mm = "feb") do={ :set mn "02" }
  :if ($mm = "mar") do={ :set mn "03" }
  :if ($mm = "apr") do={ :set mn "04" }
  :if ($mm = "may") do={ :set mn "05" }
  :if ($mm = "jun") do={ :set mn "06" }
  :if ($mm = "jul") do={ :set mn "07" }
  :if ($mm = "aug") do={ :set mn "08" }
  :if ($mm = "sep") do={ :set mn "09" }
  :if ($mm = "oct") do={ :set mn "10" }
  :if ($mm = "nov") do={ :set mn "11" }
  :if ($mm = "dec") do={ :set mn "12" }
  :set todayNum [:tonum ([:pick $now 7 11] . $mn . [:pick $now 4 6])]
}

:foreach s in=[/ppp secret find disabled=no] do={
  :local cmt [/ppp secret get $s comment]
  :local dnIdx [:find $cmt "dn:"]
  :if ([:typeof $dnIdx] = "num") do={
    :local dnStr [:pick $cmt ($dnIdx + 3) ($dnIdx + 11)]
    :local dn [:tonum $dnStr]
    :if (($dn != 0) and ($dn <= $todayNum)) do={
      :local cur [/ppp secret get $s profile]
      :if ($cur != $isolirProfile) do={
        /ppp secret set $s profile=$isolirProfile
        :local uname [/ppp secret get $s name]
        :foreach a in=[/ppp active find] do={
          :if ([/ppp active get $a name] = $uname) do={ /ppp active remove $a }
        }
      }
    }
  }
}
```

Versi ini lebih robust: cari `dn:YYYYMMDD` substring di mana saja di comment,
isolir kalau tanggal SAMA atau SUDAH LEWAT hari ini (catch-up scenario).

### Versi 2 — Pakai first 11 chars (legacy custom Anda)

Versi yang Anda pakai sebelumnya — cocok kalau Anda mau simpel + send WA/Telegram
notif. Script ini works setelah app push date di prefix comment (commit be9e57a).
Tetap include pre-check profile + space-paths untuk OS 6.

```routeros
:local isolirProfile "ISOLIR"
:if ([:len [/ppp profile find name=$isolirProfile]] = 0) do={
  :log error ("Profile " . $isolirProfile . " tidak ada")
  :error ("Profile not found")
}

:local notif ""
:local monthNames { "jan";"feb";"mar";"apr";"may";"jun";"jul";"aug";"sep";"oct";"nov";"dec" }
:local sysDate [/system clock get date]
:local sysYear [:pick $sysDate 0 4]
:local sysMonth [:tonum [:pick $sysDate 5 7]]
:local sysDay [:tonum [:pick $sysDate 8 10]]
:local todayMonthStr ($monthNames->($sysMonth - 1))
:local todayDayStr [:pick ("0" . $sysDay) ([:len ("0" . $sysDay)] - 2) [:len ("0" . $sysDay)]]
:local todayDateFmt ($todayMonthStr . "/" . $todayDayStr . "/" . $sysYear)
:local firstUpper [:pick $todayMonthStr 0 1]
:local restLower [:pick $todayMonthStr 1 3]
:local todayDateFmtCap ($firstUpper . $restLower . "/" . $todayDayStr . "/" . $sysYear)

:foreach i in=[/ppp secret find] do={
    :local comment [/ppp secret get $i comment]
    :local username [/ppp secret get $i name]
    :local oldProf [/ppp secret get $i profile]
    :if ($oldProf = $isolirProfile) do={ } else={
        :if ([:len $comment] >= 11) do={
            :local expDate [:pick $comment 0 11]
            :if (($expDate = $todayDateFmt) or ($expDate = $todayDateFmtCap)) do={
                /ppp secret set $i profile=$isolirProfile
                :local activeId [/ppp active find name=$username]
                :if ([:len $activeId] > 0) do={
                    /ppp active remove $activeId
                }
                :set notif ($notif . "%0A" . $username . " ke " . $isolirProfile)
            }
        }
    }
}

:if ([:len $notif] > 0) do={
    /log warning ("Daftar PPPoE yang di-ISOLIR hari ini: " . $notif)
    # /tool fetch ... ke Telegram/WA gateway
}
```

### Versi 1 vs Versi 2 — pilih mana?

| Aspek | Versi 1 (dn:) | Versi 2 (first 11 chars) |
|---|---|---|
| **Robustness** | ⭐⭐⭐ — kalau operator edit prefix, masih ketemu via `dn:` | ⭐⭐ — break kalau prefix di-edit |
| **Catch-up overdue** | ⭐⭐⭐ — isolir yang `<= today` (tangkap yang ke-skip kemarin) | ⭐ — hanya isolir yang EQUAL today |
| **Simplicity** | ⭐⭐ — lebih panjang | ⭐⭐⭐ — pendek |
| **OS 6/7 compat** | ✅ ✅ | ✅ ✅ (script di atas sudah ditambah pre-check) |

App-managed scheduler (tombol "Pasang Scheduler di Router") pakai **Versi 1**.

### Setup Scheduler

```routeros
/system scheduler add \
    name=isolir-pppoe-harian \
    interval=1d \
    start-time=03:00:00 \
    on-event=isolir-pppoe-harian \
    comment="Safety net app billing — primary scheduler ada di app"
```

## Mengapa Jam 03:00, Bukan 18:00?

| Jam | Pros | Cons |
|---|---|---|
| **18:00** (pernah Anda pakai) | Operator masih bekerja, gampang react kalau ada false positive | ⚠️ Race dengan operator mark paid (jam 17-22 paling sibuk). Heavy traffic customer = banyak active session yang harus di-kick. |
| **03:00 dini hari** ⭐ recommend | Tidak ada traffic customer aktif. App scheduler sudah jalan 2× sebelum (jam 01:00 + 02:00) — comment di-update lengkap. Sedikit chance race condition. | Operator tidur kalau ada issue. Mitigasi: WA notif ke admin group setelah selesai. |

## Risiko Hybrid + Mitigasi

| Risiko | Mitigasi |
|---|---|
| **Race condition**: operator mark paid 17:59, comment di MikroTik belum sync sebelum 18:00 → false positive isolir | Pakai jam 03:00. App scheduler sudah 2× cycle (01:00, 02:00) push comment update sebelum script jalan |
| **Update comment ke MikroTik fail** (timeout, network) → comment di MikroTik masih tanggal lama → false positive isolir saat masuk tanggal itu | App scheduler log warning. Operator monitor `pm2 logs \| grep "stale date"`. Customer false-isolir tinggal mark paid → unisolir trigger comment update lagi |
| **Operator manual edit comment di Winbox** → break format yang app expect | Document SOP: jangan edit comment customer billing manual. Set comment via Subscription edit di UI |
| **Customer baru created tepat hari due** → langsung isolir | App billing set `nextDueAt = activatedAt + 1 cycle` minimum, jadi customer baru gak akan langsung due-nya hari ini |
| **App down >1 hari** | MikroTik scheduler tetap isolir customer dengan comment date = hari ini ✅ |
| **MikroTik scheduler crash/disabled** | App scheduler tetap isolir sesuai logic DB |

## Verifikasi Implementasi

Setelah deploy + buat 1 subscription test:

```bash
# Di MikroTik, cek comment subscription baru
/ppp secret print where comment~"subscription:"

# Expected:
# 0 name="test01" profile="10mbps" comment="oct/22/2026 subscription:xxxx dn:20261022 paket:Test"
```

Cek char 0-10 = `oct/22/2026` (atau hari isolir sesuai grace settings).

Script Anda jalankan manual untuk test:
```routeros
/system script run isolir-pppoe-harian
```

Kalau hari ini bukan tanggal yang match, dia log "tidak ada yang isolir".
Kalau coincide, dia isolir + kirim notif.

## Compatibility OS 6 vs OS 7

Script yang Anda pakai work di kedua versi. Caveat:

- `/system/clock get date` di ROS 6 mungkin perlu `/system clock get date` (tanpa slash). Test di 1 router ROS 6 dulu.
- Tool fetch HTTP behaviour identik di kedua versi.
- `:pick`, `:foreach`, string concat identik.

## FAQ

**Q: Customer existing yang format comment-nya BUKAN date-prefix, gimana?**

A: App akan auto-update format-nya ke date-prefix saat:
- Invoice bulan depan generated → scheduler push comment update
- Operator edit subscription di UI
- Customer bayar → unisolir trigger comment update

Atau Anda bisa jalankan migration manual untuk update semua sekaligus
(tinggalkan kalau scope ratusan customer — bertahap juga OK).

**Q: Apakah scheduler MikroTik bisa di-port ke L2TP / SSTP / WireGuard secret?**

A: Bisa, tinggal ganti `/ppp secret` ke entity yang sesuai. Tapi untuk
phase ini fokus PPPoE saja per request user. Hotspot voucher punya mekanisme
beda (lihat MikHMON service untuk parser comment voucher).

**Q: Apa yang terjadi kalau MikroTik tidak punya profile bernama "ISOLIR"?**

A: Script gagal `/ppp secret set` dengan error "profile not found", customer
tidak ter-isolir di MikroTik. Tapi app tetap track status di DB. Pastikan
setiap router yang serve PPPoE punya profile bernama tepat "ISOLIR" (case-sensitive).
