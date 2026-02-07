$ErrorActionPreference = "Stop"

function Invoke-GitCommand {
    param (
        [string]$Arguments,
        [string]$LogFile
    )
    Write-Host "Running: git $Arguments"
    $p = Start-Process -FilePath "git" -ArgumentList $Arguments -RedirectStandardOutput $LogFile -RedirectStandardError "$LogFile.err" -PassThru -Wait
    if ($p.ExitCode -ne 0) {
        Write-Error "Git command failed: git $Arguments. See $LogFile and $LogFile.err"
        Get-Content "$LogFile.err" | Write-Host
        exit $p.ExitCode
    }
    Get-Content $LogFile | Write-Host
}

Invoke-GitCommand -Arguments "add ." -LogFile "git_add.log"
Invoke-GitCommand -Arguments "commit -m ""chore: update push script to follow PS standards""" -LogFile "git_commit.log"
Invoke-GitCommand -Arguments "push origin main" -LogFile "git_push.log"

Remove-Item git_*.log* -ErrorAction SilentlyContinue
Write-Host "GitHub synchronization verified and completed."
