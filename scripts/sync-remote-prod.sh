#!/bin/bash

# Sync Remote Production Database (to this Dev VM)
# Usage: ./scripts/sync-remote-prod.sh <PRODUCTION_IP> [PRODUCTION_USER]

if [ -z "$1" ]; then
    echo "Usage: ./scripts/sync-remote-prod.sh <PRODUCTION_IP> [PRODUCTION_USER]"
    echo "Example: ./scripts/sync-remote-prod.sh 192.168.1.100 root"
    exit 1
fi

PROD_IP=$1
PROD_USER=${2:-"root"}
PROD_DIR="/opt/app" # ADJUST THIS TO YOUR ACTUAL PROD PATH
LOCAL_DIR=$(pwd)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="sync_dump_$TIMESTAMP.sql.gz"

echo "--- 🚀 Starting Remote Database Sync ---"
echo "Production: $PROD_USER@$PROD_IP"
echo "----------------------------------------"

# 1. Trigger Backup on Production
echo "1. Creating backup on Production server..."
ssh "$PROD_USER@$PROD_IP" "cd $PROD_DIR && bash scripts/backup-db.sh $FILENAME"

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to create backup on production."
    exit 1
fi

# 2. Transfer to Local
echo "2. Transferring file to this VM..."
scp "$PROD_USER@$PROD_IP:$PROD_DIR/$FILENAME" "$LOCAL_DIR/"

if [ $? -ne 0 ]; then
    echo "❌ Error: File transfer failed."
    exit 1
fi

# 3. Restore Locally
echo "3. Restoring to local database container..."
bash scripts/restore-db.sh "$FILENAME"

if [ $? -ne 0 ]; then
    echo "❌ Error: Restore failed."
    exit 1
fi

# 4. Cleanup
echo "4. Cleaning up temporary files..."
rm "$FILENAME"
ssh "$PROD_USER@$PROD_IP" "rm $PROD_DIR/$FILENAME"

echo "----------------------------------------"
echo "✅ SUCCESS: Database has been synced!"
echo "Next step: Run 'npx tsx src/scripts/re-encrypt-db.ts' in apps/api if passwords don't work."
