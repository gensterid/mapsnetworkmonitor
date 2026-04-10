# Panduan Sinkronisasi Database (Production -> Development)

Dokumen ini menjelaskan cara memindahkan database dari server Proxmox (Production) ke Laptop (Development), terutama untuk file berukuran besar (>1GB).

## ⚠️ Peringatan Penting
Untuk file berukuran besar (1GB+), **JANGAN** gunakan tombol **Upload & Restore** di Web UI karena akan menyebabkan timeout dan memory crash. Gunakan jalur Command Line (CLI) di bawah ini.

---

## Prasyarat
- PostgreSQL Tools (`pg_dump`, `psql`, `dropdb`, `createdb`) terinstal di laptop Anda.
- Akses SSH ke server Proxmox.

---

## Langkah 1: Ambil File Backup dari Production

1.  Buka Dashboard di browser, masuk ke menu **Database Management**.
2.  Di tabel **Backup History**, temukan file terbaru (dengan label `AUTO`).
3.  Klik ikon **Download** (panah ke bawah) untuk mendownload file `.sql.gz` ke laptop Anda.

*Alternatif (Jika download di browser lambat):*
Gunakan SCP di terminal laptop Anda:
```bash
scp root@IP_PROXMOX:/opt/app/apps/api/backups/NAMA_FILE.sql.gz ./
```

---

## Langkah 2: Ekstrak dan Persiapan Database Lokal

Pindahkan file tersebut ke folder proyek Anda, lalu jalankan perintah berikut di terminal (PowerShell/Bash):

1.  **Ekstrak file:**
    ```bash
    gunzip NAMA_FILE.sql.gz
    ```
    *(Ganti `NAMA_FILE` dengan nama file yang Anda download)*

2.  **Hapus & Buat Ulang DB Lokal (Pastikan API Lokal mati):**
    ```powershell
    dropdb -U postgres mikrotik_monitor --if-exists
    createdb -U postgres mikrotik_monitor
    ```

---

## Langkah 3: Restore Data via CLI (Sangat Aman untuk 1GB+)

Jangan gunakan browser. Gunakan perintah ini untuk memasukkan data 1GB+ secara stabil:
```powershell
psql -U postgres -d mikrotik_monitor -f NAMA_FILE.sql
```

---

## Langkah 4: Penyelarasan Encryption Key (RE-ENCRYPT)

Karena `ENCRYPTION_KEY` di laptop dan Proxmox berbeda, password router yang di-restore tidak bisa langsung dibaca. Anda perlu menjalankan skrip otomatis ini:

1.  Buka terminal di folder proyek.
2.  Jalankan perintah re-enkripsi:
    ```powershell
    # Masuk ke folder API
    cd apps/api
    
    # Jalankan skrip re-enkripsi
    npx tsx src/scripts/re-encrypt-db.ts
    ```
3.  **Tindakan**: Masukkan `ENCRYPTION_KEY` milik server Proxmox saat diminta.
4.  **Selesai**: Password sekarang sudah bisa dibaca oleh laptop Anda.

---

## Ringkasan Alur Cepat
Jika Anda ingin cara otomatis yang menggabungkan semua langkah di atas, gunakan skrip PowerShell yang sudah saya siapkan:
```powershell
.\scripts\sync-prod-db.ps1
```
*(Skrip ini sudah saya modifikasi untuk mendukung database besar dan re-enkripsi otomatis).*

---

> [!TIP]
> **Data Mapping Aman?**
> Ya, semua data mapping (ODP, Garis, Waypoints) tersimpan dalam SQL ini dan akan muncul sempurna di laptop Anda setelah proses ini selesai.

---

## Proxmox Ke Proxmox (Production -> Development)

Jika Anda ingin memindahkan data antar VM/LXC di Proxmox, ikuti langkah ini agar lebih cepat (langsung antar server tanpa lewat laptop):

### 1. Di VM Production
Jalankan backup untuk mendapatkan file terkompresi:
```bash
bash scripts/backup-db.sh
# Catat nama filenya, misal: backup_20240310.sql.gz
```

### 2. Di VM Development
Tarik file tersebut menggunakan SCP (Ganti `IP_PRODUCTION` dengan IP server asli):
```bash
scp root@IP_PRODUCTION:/opt/app/backup_20240310.sql.gz ./
```

### 3. Restore di VM Development
Gunakan script restore:
```bash
bash scripts/restore-db.sh backup_20240310.sql.gz
```

### 4. Sinkronisasi Encryption Key
Jika password router tidak bisa terbaca di aplikasi Dev, selaraskan key:
1. Pastikan `ENCRYPTION_KEY` di `.env` VM Dev sudah sama dengan VM Prod.
2. Atau jalankan re-enkripsi jika ingin tetap menggunakan key yang berbeda:
   ```bash
   cd apps/api
   export PROD_ENCRYPTION_KEY="isikan_key_prod_disini"
   npx tsx src/scripts/re-encrypt-db.ts
   ```

---

## Proxmox Native (Tanpa Docker)

Jika PostgreSQL diinstal langsung di Proxmox (LXC atau VM) tanpa Docker, ikuti langkah ini:

### 1. Persiapan Terminal
Pastikan Anda berada di user root atau user dengan akses `sudo`. Masuk ke folder aplikasi Anda.

### 2. Jalankan Script Restore Native
Saya telah membuatkan script khusus untuk skenario Non-Docker:
```bash
# Pastikan script bisa dieksekusi
chmod +x scripts/restore-native.sh

# Jalankan restore (Ganti NAMA_FILE dengan file backup Anda)
./scripts/restore-native.sh path/ke/NAMA_FILE.sql.gz
```

### 3. Keunggulan Metode Ini (Safe Restore)
- **Tanpa Downtime Lama**: Script otomatis mematikan PM2 sebentar untuk melepas "lock" database, lalu menghidupkannya lagi.
- **Hemat RAM**: Menggunakan sistem Unix Pipe (`gunzip | psql`) sehingga file 1GB tidak perlu diekstrak ke disk dan tidak membebani memori.
- **Izin User Aman**: Menggunakan `sudo -u postgres` untuk memastikan database dikelola oleh user yang tepat.

---

> [!CAUTION]
> **Database Locked?**
> Jika muncul error "database is being accessed by other users", pastikan semua proses PM2 sudah mati: `pm2 kill` lalu jalankan ulang script restore.
