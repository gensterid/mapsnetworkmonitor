#!/bin/bash

# Proxmox Minimal Error Update Script
# Usage: bash scripts/update-server.sh [--hard-clean]

set -e # Exit on error

HARD_CLEAN=false
if [ "$1" == "--hard-clean" ]; then
    HARD_CLEAN=true
fi

echo "🚀 Starting Minimal Error Update..."

# 1. Check for basic requirements
command -v git >/dev/null 2>&1 || { echo >&2 "❌ Error: git is not installed."; exit 1; }
command -v node >/dev/null 2>&1 || { echo >&2 "❌ Error: node is not installed."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo >&2 "❌ Error: npm is not installed."; exit 1; }

# 2. Clean Git State (Minimal Error Strategy)
echo "📥 Fetching and resetting to origin/main..."
git fetch origin main
git reset --hard origin/main

# 3. Hard Cleanup (if requested or for first-time linux fixes)
if [ "$HARD_CLEAN" = true ]; then
    echo "🧹 Performing Hard Cleanup (Nuclear Option)..."
    find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
    rm -f package-lock.json
    npm cache clean --force
    echo "✅ Cleanup finished."
fi

# 4. Sync Dependencies
echo "📦 Installing/Syncing dependencies..."
# Use --include=optional to ensure native modules like rollup-linux are fetched
npm install --include=optional --no-audit --no-fund

# 5. Database Sync
echo "🗄️ Syncing database schema..."
npm run db:push -w apps/api

# 6. Rebuild Application
echo "🏗️ Rebuilding workspace..."
export NODE_OPTIONS="--max-old-space-size=2048"
npm run build

# 7. Restart Services
echo "🔄 Restarting PM2 services..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 restart all
    echo "✅ PM2 services restarted."
else
    echo "⚠️ PM2 not found, please restart your process manager manually."
fi

echo "✨ Update Complete!"
echo "💡 Tip: Run 'pm2 logs' to check for errors."
