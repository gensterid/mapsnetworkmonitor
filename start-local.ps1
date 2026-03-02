# Start API
Write-Host "Starting API..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "run dev" -WorkingDirectory "apps\api"

# Start Web
Write-Host "Starting Web..." -ForegroundColor Green
Start-Process -NoNewWindow -FilePath "npm.cmd" -ArgumentList "run dev -- --port 5173" -WorkingDirectory "apps\web"

Write-Host "Both applications are starting in the background." -ForegroundColor Cyan
Write-Host "API: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Web: http://localhost:5173" -ForegroundColor Cyan
