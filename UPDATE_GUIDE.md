# Panduan Update di Proxmox (Minimal Error)

Ikuti langkah-langkah berikut untuk meng-update aplikasi di server Proxmox Anda dengan risiko error minimal.

## 1. Cara Update Otomatis (Minim Error)
Ini adalah cara yang direkomendasikan untuk menghindari error build atau conflict.

```bash
# Masuk ke folder project
cd /path/to/folder/project

# Jalankan script update otomatis
chmod +x scripts/update-server.sh
./scripts/update-server.sh
```

> [!IMPORTANT]
> Script ini akan melakukan `git reset --hard`. Jika Anda memiliki perubahan code yang dibuat langsung di server, perubahan tersebut akan **DIHAPUS**. Pastikan sudah di-backup atau di-commit.

## 2. Langkah Manual (Jika script gagal)
Jika Anda ingin melakukannya langkah demi langkah:

### 2.1. Masuk ke Server
Akses terminal server via SSH atau Console Proxmox.

### 2.2. Masuk ke Direktori Project
```bash
cd /path/to/folder/project
# Contoh: cd /var/www/mikrotik-monitor
```

## 3. Jalankan Update Otomatis (Rekomendasi)
Kami telah menyediakan script untuk menangani pull, reset conflict, install dependencies, dan build dalam satu command:

```bash
bash scripts/update-server.sh
```

> [!IMPORTANT]
> Script ini akan melakukan `git reset --hard`. Jika Anda memiliki perubahan code yang dibuat langsung di server, perubahan tersebut akan **DIHAPUS**. Pastikan sudah di-backup atau di-commit.

## 4. Troubleshooting (Jika Ada Masalah)

### Jika RAM Server Kecil
Jika proses `npm run build` berhenti tiba-tiba, kemungkinan server kehabisan RAM. Script sudah mencoba menambah limit ke 2GB, tapi pastikan server Anda minimal memiliki 2GB RAM atau Swap.

### Cek Status Service
Gunakan PM2 untuk melihat apakah aplikasi running normal:
```bash
pm2 list
pm2 logs
```

### Reset Manual (Hard Reset)
Jika script tetap error karena git conflict:
```bash
git fetch --all
git reset --hard origin/main
npm install
npm run build
pm2 restart all
```
