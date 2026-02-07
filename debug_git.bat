@echo off
echo Debugging Git Sync > git_debug.log
echo ================= >> git_debug.log
echo [1] Checking Git Version >> git_debug.log
git --version >> git_debug.log 2>&1

echo [2] Checking Remote URL >> git_debug.log
git remote -v >> git_debug.log 2>&1

echo [3] Checking Status >> git_debug.log
git status >> git_debug.log 2>&1

echo [4] Attempting Push >> git_debug.log
git push origin main >> git_debug.log 2>&1

echo [5] Last Commit >> git_debug.log
git log -1 >> git_debug.log 2>&1

echo Done.
