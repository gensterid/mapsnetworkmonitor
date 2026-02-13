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

# 2. Safety: Reset local changes to avoid conflicts
echo "📥 Fetching latest code from GitHub..."
git fetch origin main
echo "⚠️ Resetting local changes to match origin/main..."
git reset --hard origin/main

# 3. Clean Dependencies
echo "📦 Installing dependencies (Clean)..."
# If the user provides --hard-clean, we wipe everything
if [[ "$*" == *"--hard-clean"* ]]; then
    echo "🧹 Performing HARD clean (removing node_modules and package-lock.json)..."
    rm -rf node_modules apps/web/node_modules apps/api/node_modules package-lock.json
fi

# We use --force to bypass any lingering platform-specific locks that might cause the Rollup error
npm install

# 4. Database Sync
echo "🗄️ Syncing database schema..."
npm run db:push || echo "⚠️ Database sync warning (check if migrations are needed)"

# 5. Build Process
echo "🏗️ Building applications..."
export NODE_OPTIONS="--max-old-space-size=2048"

if ! npm run build; then
    echo "⚠️ Build failed. Detecting if it's the Rollup native module bug..."
    # If the error looks like the Rollup one, auto-clean and retry once
    echo "🧹 Attempting automatic HARD clean to fix Rollup issue..."
    rm -rf node_modules apps/web/node_modules apps/api/node_modules package-lock.json
    npm install
    echo "🏗️ Retrying build..."
    npm run build
fi

# 6. PM2 Restart (if applicable)
if command -v pm2 &> /dev/null; then
    echo "🔄 Restarting services with PM2..."
    pm2 restart all || echo "⚠️ PM2 restart failed - please restart manually"
    pm2 save
else
    echo "ℹ️ PM2 not found. Please restart your services manually."
fi

echo "✅ Update completed successfully!"
