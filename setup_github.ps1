$ErrorActionPreference = "Stop"

function Invoke-GitCommand {
    param (
        [string]$Arguments,
        [string]$LogFile
    )
    Write-Host "Running: git $Arguments"
    $p = Start-Process -FilePath "git" -ArgumentList $Arguments -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" -PassThru -Wait
    if ($p.ExitCode -ne 0) {
        Write-Warning "Git command failed or had output: git $Arguments"
    }
    if (Test-Path $LogFile) { Get-Content $LogFile | Write-Host }
    if (Test-Path "$LogFile.err") { Get-Content "$LogFile.err" | Write-Host }
}

# 1. Check existing remote
Invoke-GitCommand -Arguments "remote -v" -LogFile "git_remote_check.log"

$remoteOutput = Get-Content "git_remote_check.log" -ErrorAction SilentlyContinue 
$targetUrl = "https://github.com/gensterid/mapsnetworkmonitor"

if ($remoteOutput -match "origin") {
    Write-Host "Remote origin exists. Updating..."
    Invoke-GitCommand -Arguments "remote set-url origin $targetUrl" -LogFile "git_remote_set.log"
}
else {
    Write-Host "Remote origin does not exist. Adding..."
    Invoke-GitCommand -Arguments "remote add origin $targetUrl" -LogFile "git_remote_add.log"
}

# 2. Add, Commit, Push
Invoke-GitCommand -Arguments "add ." -LogFile "git_add.log"
Invoke-GitCommand -Arguments "commit -m ""chore: connect to github and sync latest changes""" -LogFile "git_commit.log"
Invoke-GitCommand -Arguments "branch -M main" -LogFile "git_branch.log"
Invoke-GitCommand -Arguments "push -u origin main" -LogFile "git_push.log"

Write-Host "Done."
