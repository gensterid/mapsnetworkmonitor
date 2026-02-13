#!/bin/bash

# Proxmox Minimal Error Update Script
# Usage: bash scripts/update-server.sh

set -e # Exit on error

echo "🚀 Starting Minimal Error Update..."

# 1. Check for basic requirements
command -v git >/dev/null 2>&1 || { echo >&2 "❌ Error: git is not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo >&2 "❌ Error: node is not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo >&2 "❌ Error: npm is not installed."; exit 1; }

# 2. Clean Git State (Minimal Error Strategy)
echo "📥 Fetching and resetting to origin/main..."
git fetch origin main
# Hard reset ensures no local conflicts block the update
git reset --hard origin/main

# 3. Sync Dependencies
echo "📦 Installing/Syncing dependencies..."
npm install --no-audit --no-fund

# 4. Database Sync
echo "🗄️ Syncing database schema..."
npm run db:push -w apps/api

# 5. Rebuild Application
echo "🏗️ Rebuilding workspace..."
# Increase memory limit for Node if on low-RAM VPS/LXC
export NODE_OPTIONS="--max-old-space-size=2048"
npm run build

# 6. Restart Services
echo "🔄 Restarting PM2 services..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 restart all
    echo "✅ PM2 services restarted."
else
    echo "⚠️ PM2 not found, please restart your process manager manually."
fi

echo "✨ Update Complete!"
echo "💡 Tip: Run 'pm2 logs' to check for errors."
