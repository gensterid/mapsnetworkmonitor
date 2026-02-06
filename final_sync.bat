@echo off
echo --- FINAL SYNC START ---
git add apps/web/src/components/map/AnimatedPath.jsx
git add apps/web/src/components/map/animationStyles.js
git commit -m "fix(map): implement seamless pulse synchronization and unique keyframes for production"
git push origin main
echo --- FINAL SYNC END ---
