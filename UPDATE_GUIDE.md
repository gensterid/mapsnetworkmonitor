# Panduan Update di Proxmox / Server Linux

Ikuti langkah-langkah berikut untuk meng-update aplikasi di server Proxmox (LXC/VM) Anda.

## 1. Masuk ke Server
Akses terminal server via SSH atau Console Proxmox.

## 2. Masuk ke Direktori Project
```bash
cd /path/to/folder/project
# Contoh: cd /var/www/mikrotik-monitor
```

## 3. Ambil Update dari GitHub
```bash
git pull origin main
```
*Pastikan tidak ada error conflict.*

## 4. Install Dependencies (Penting!)
Karena ada perubahan code, sebaiknya pastikan dependencies terinstall.
```bash
npm install
```

## 5. Update Database
Kita baru saja menambahkan kolom `lastKnownLatency`. Jalankan migrasi:
```bash
npm run db:migrate -w apps/api
```
*Jika command ini error atau belum setup migrate di prod, Anda bisa gunakan `npm run db:push -w apps/api` (tapi hati-hati di production).*

## 6. Build Ulang Aplikasi
```bash
npm run build
```

## 7. Restart Service (PM2)
Jika menggunakan PM2 untuk menjalankan aplikasi:
```bash
pm2 restart all
# Atau restart spesifik service api dan web
pm2 restart api
pm2 restart web
```

## Cek Logs (Opsional)
Pastikan tidak ada error startup:
```bash
pm2 logs
```
