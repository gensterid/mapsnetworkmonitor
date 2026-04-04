#!/bin/bash

# Database Backup Helper for Mikrotik Monitor (Proxmox)
# Usage: ./backup-db.sh [output-name.sql.gz]

DB_CONTAINER="mikrotik-monitor-db"
DB_NAME="mikrotik_monitor"
DB_USER="postgres"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_FILE=${1:-"backup_$TIMESTAMP.sql.gz"}

echo "--- Starting Database Backup ---"
echo "Source Container: $DB_CONTAINER"
echo "Source Database: $DB_NAME"
echo "Output File: $OUTPUT_FILE"
echo "--------------------------------"

# Run backup within container and pipe to host
echo "1. Performing GZip dump (this may take a few minutes for $DB_NAME)..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)
    echo "--------------------------------"
    echo "SUCCESS: Backup completed!"
    echo "File Location: $(pwd)/$OUTPUT_FILE"
    echo "File Size: $SIZE"
    echo "--------------------------------"
else
    echo "--------------------------------"
    echo "ERROR: Backup failed. Please check logs."
    echo "--------------------------------"
fi
