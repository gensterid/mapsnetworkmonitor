@echo off
set PORT=3001
echo Starting API on port 3001...
cd apps\api
start /B npm run dev > ..\..\api_v5.log 2>&1
cd ..\web
echo Starting Web on port 5173...
start /B npm run dev > ..\..\web_v5.log 2>&1
echo Done.
