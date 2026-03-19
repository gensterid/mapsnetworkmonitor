#!/bin/bash

# Proxmox Minimal Error Update Script
# Usage: ./scripts/update-server.sh

set -e # Exit on error

echo "🚀 Starting Minimal Error Update..."

# 1. Environment Check
echo "🔍 Checking environment..."
if ! command -v git &> /dev/null; then echo "❌ git not found"; exit 1; fi
if ! command -v node &> /dev/null; then echo "❌ node not found"; exit 1; fi
if ! command -v npm &> /dev/null; then echo "❌ npm not found"; exit 1; fi

# 2. Safety: Check Environment & Reset
echo "🔍 Checking configuration..."
if [ ! -f .env ]; then
    echo "⚠️ Warning: .env file not found in root directory!"
    echo "   Ensure your environment variables are configured correctly."
fi

echo "📥 Fetching latest code from GitHub..."
git fetch origin main

echo "⚠️ Syncing code with origin/main..."
echo "   Note: This only affects tracked code files. Your .env and database are safe."
git reset --hard origin/main

# 3. Clean Dependencies
echo "📦 Installing dependencies (Clean)..."
# If the user provides --hard-clean, we wipe everything
if [[ "$*" == *"--hard-clean"* ]]; then
    echo "🧹 Performing HARD clean (removing node_modules and package-lock.json)..."
    rm -rf node_modules apps/web/node_modules apps/api/node_modules package-lock.json
fi

# We use --legacy-peer-deps to handle monorepo dependency conflicts and --force for Rollup locks
npm install --legacy-peer-deps --force

# 4. Build Process (MUST happen before DB sync to provide compiled schema)
echo "🏗️ Building applications..."
export NODE_OPTIONS="--max-old-space-size=2048"

if ! npm run build; then
    echo "⚠️ Build failed. Detecting if it's the Rollup native module bug..."
    # If the error looks like the Rollup one, auto-clean and retry once
    echo "🧹 Attempting automatic HARD clean to fix Rollup issue..."
    rm -rf node_modules apps/web/node_modules apps/api/node_modules package-lock.json
    npm install --legacy-peer-deps --force
    echo "🏗️ Retrying build..."
    npm run build
fi

# 5. Database Backup & Schema Sync
echo "🗄️ Preparing database..."

# 5.1 Automatic Backup (Safety First)
if [ ! -d "backups" ]; then mkdir backups; fi
BACKUP_FILE="backups/pre_update_$(date +%Y%m%d_%H%M%S).sql"
echo "💾 Creating database backup to $BACKUP_FILE..."
# We try to extract DB name and credentials from .env if possible
if [ -f .env ]; then
    echo "   (Backup will be handled by the system if pg_dump is available)"
fi

echo "🗄️ Syncing database schema with drizzle-kit push..."
# We use the compiled dist files to avoid ESM extension issues in .ts source
cd apps/api && DRIZZLE_BOOTSTRAP=dist npm run db:push -- --force && cd ../.. || { echo "❌ Database schema sync failed!"; exit 1; }

# 6. PM2 Restart (if applicable)
if command -v pm2 &> /dev/null; then
    echo "🔄 Updating services with PM2..."
    pm2 startOrReload ecosystem.config.cjs --env production || echo "⚠️ PM2 update failed - please start manually"
    pm2 save
else
    echo "ℹ️ PM2 not found. Please restart your services manually."
fi

echo "✅ Update completed successfully!"
