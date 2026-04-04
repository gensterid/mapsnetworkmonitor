#!/bin/bash

# Database Restore Helper for Mikrotik Monitor (Proxmox)
# Usage: ./restore-db.sh /path/to/backup.sql.gz

DB_CONTAINER="mikrotik-monitor-db"
DB_NAME="mikrotik_monitor"
DB_USER="postgres"

if [ -z "$1" ]; then
    echo "Usage: ./restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: File $BACKUP_FILE not found."
    exit 1
fi

echo "--- Starting Database Restore ---"
echo "Target Container: $DB_CONTAINER"
echo "Target Database: $DB_NAME"
echo "Backup File: $BACKUP_FILE"
echo "--------------------------------"

# Step 1: Copy file to container
echo "1. Copying file to container..."
docker cp "$BACKUP_FILE" "$DB_CONTAINER:/tmp/restore.sql.gz"

# Step 2: Restore
echo "2. Restoring data (this may take a few minutes for $BACKUP_FILE)..."
docker exec -it "$DB_CONTAINER" sh -c "gunzip -c /tmp/restore.sql.gz | psql -U $DB_USER -d $DB_NAME"

if [ $? -eq 0 ]; then
    echo "--------------------------------"
    echo "SUCCESS: Database restored successfully!"
    echo "--------------------------------"
else
    echo "--------------------------------"
    echo "ERROR: Restore failed. Please check logs."
    echo "--------------------------------"
fi

# Step 3: Cleanup
docker exec -it "$DB_CONTAINER" rm /tmp/restore.sql.gz
