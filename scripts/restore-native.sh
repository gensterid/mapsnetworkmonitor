#!/bin/bash

# Native PostgreSQL Restore Helper (Non-Docker)
# Usage: ./scripts/restore-native.sh <backup-file.sql.gz>

if [ -z "$1" ]; then
    echo "Usage: ./scripts/restore-native.sh <backup-file.sql.gz>"
    exit 1
fi

BACKUP_FILE=$1
DB_NAME="mikrotik_monitor"
POSTGRES_USER="postgres"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Error: File $BACKUP_FILE not found."
    exit 1
fi

echo "--- 🛠️ Starting Native Database Restore ---"
echo "Database: $DB_NAME"
echo "Backup File: $BACKUP_FILE"
echo "------------------------------------------"

# Step 1: Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql command not found. Please install postgresql-client."
    exit 1
fi

# Step 2: Stop application (PM2) to avoid locks
echo "1. Stopping PM2 processes to release database locks..."
pm2 stop all &> /dev/null

# Step 3: Reset Database
echo "2. Dropping and creating database: $DB_NAME..."
sudo -u "$POSTGRES_USER" dropdb "$DB_NAME" --if-exists
sudo -u "$POSTGRES_USER" createdb "$DB_NAME"

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to reset database. Check permissions."
    exit 1
fi

# Step 4: Restore Data (Safe path for 1GB+)
echo "3. Restoring data (this may take a few minutes)..."
sudo gunzip -c "$BACKUP_FILE" | sudo -u "$POSTGRES_USER" psql -d "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "------------------------------------------"
    echo "✅ SUCCESS: Database restored successfully!"
    echo "------------------------------------------"
else
    echo "------------------------------------------"
    echo "❌ ERROR: Restore failed. Check output above."
    echo "------------------------------------------"
fi

# Step 5: Start app
echo "4. Restarting PM2 processes..."
pm2 start all &> /dev/null

echo "Done."
