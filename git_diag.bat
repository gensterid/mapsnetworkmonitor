@echo off
echo --- GIT DIAGNOSTIC START ---
echo CURRENT DIRECTORY: %CD%
echo --- REMOTE URL ---
git remote -v
echo --- CURRENT BRANCH ---
git branch
echo --- LAST COMMIT ---
git log -1 --oneline
echo --- STATUS ---
git status
echo --- PUSHING ---
git push origin main
echo --- GIT DIAGNOSTIC END ---
