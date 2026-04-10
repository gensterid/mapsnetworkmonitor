# Sync Production Database to Local Development
# This script automates: SSH Backup -> SCP Transfer -> Local Restore

# Configuration - Update these to match your Proxmox setup
$PROXMOX_IP = "192.168.1.100" # <-- GANTI DENGAN IP PROXMOX ANDA
$PROXMOX_USER = "root"        # <-- USER SSH (BIASANYA root)
$DB_NAME = "mikrotik_monitor"
$LOCAL_DB_USER = "postgres"

# Temporary file paths
$REMOTE_BACKUP_PATH = "/tmp/production_sync.sql"
$LOCAL_BACKUP_PATH = "./production_sync.sql"

Write-Host "🚀 Memulai sinkronisasi database dari Production ke Lokal..." -ForegroundColor Cyan

# 1. Trigger Backup di Proxmox
Write-Host "📡 [1/4] Membuat backup di Proxmox (Production)..." -ForegroundColor Yellow
# Menggunakan pg_dump langsung (Non-Docker)
$backup_cmd = "pg_dump -U postgres $DB_NAME > $REMOTE_BACKUP_PATH"
ssh "$PROXMOX_USER@$PROXMOX_IP" $backup_cmd

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Gagal membuat backup di server. Pastikan SSH dan Docker berjalan." -ForegroundColor Red
    exit
}

# 2. Transfer file ke Lokal
Write-Host "📥 [2/4] Mentransfer file backup ke laptop..." -ForegroundColor Yellow
scp "${PROXMOX_USER}@${PROXMOX_IP}:${REMOTE_BACKUP_PATH}" "$LOCAL_BACKUP_PATH"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Gagal mentransfer file." -ForegroundColor Red
    exit
}

# 3. Persiapan Database Lokal
Write-Host "🧹 [3/4] Menghapus dan membuat ulang database lokal ($DB_NAME)..." -ForegroundColor Yellow
Write-Host "   (Pastikan aplikasi API lokal sudah dimatikan agar tidak ada error 'database in use')" -ForegroundColor Gray

try {
    dropdb -U $LOCAL_DB_USER $DB_NAME --if-exists
    createdb -U $LOCAL_DB_USER $DB_NAME
} catch {
    Write-Host "❌ Gagal mereset database. Pastikan PostgreSQL Tools terinstal di Path Windows." -ForegroundColor Red
    exit
}

# 4. Restore Data
Write-Host "💾 [4/4] Memasukkan data ke database lokal..." -ForegroundColor Yellow
psql -U $LOCAL_DB_USER -d $DB_NAME -f $LOCAL_BACKUP_PATH

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Gagal melakukan restore data." -ForegroundColor Red
    exit
}

# 5. Re-Encryption (Cross-Key Support)
Write-Host "🔐 [OPTIONAL] Menyelaraskan ENCRYPTION_KEY..." -ForegroundColor Cyan
$prod_key = Read-Host "Masukkan ENCRYPTION_KEY server Production (kosongkan jika sama dengan lokal)"

if ($prod_key) {
    Write-Host "🔄 Re-encrypting passwords for local use..." -ForegroundColor Yellow
    $env:PROD_ENCRYPTION_KEY = $prod_key
    # Run using tsx from apps/api
    Set-Location apps/api
    npx tsx src/scripts/re-encrypt-db.ts
    Set-Location ../..
}

Write-Host "✅ Sinkronisasi SELESAI!" -ForegroundColor Green
Write-Host "   Data sudah selaras dan password sudah bisa dibaca lokal." -ForegroundColor Cyan

# Cleanup
Write-Host "🧹 Membersihkan file temporary..." -ForegroundColor Gray
Remove-Item $LOCAL_BACKUP_PATH -ErrorAction SilentlyContinue
ssh "$PROXMOX_USER@$PROXMOX_IP" "rm $REMOTE_BACKUP_PATH"
