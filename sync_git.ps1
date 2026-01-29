$ErrorActionPreference = "Stop"
try {
    Write-Output "--- GIT STATUS ---"
    git status
    
    Write-Output "--- GIT ADD ---"
    git add .
    
    Write-Output "--- GIT COMMIT ---"
    git commit -m "fix: apply latest changes and filter packet loss alerts"
    
    Write-Output "--- GIT PUSH ---"
    git push origin main
    
    Write-Output "--- SUCCESS ---"
} catch {
    Write-Output "--- ERROR ---"
    Write-Output $_
    exit 1
}
