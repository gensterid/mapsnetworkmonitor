$ErrorActionPreference = "Stop"

function Run-GitCommand {
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

Run-GitCommand -Arguments "add ." -LogFile "git_add.log"
Run-GitCommand -Arguments "commit -m ""feat: add new themes and fix satellite dark map mode""" -LogFile "git_commit.log"
Run-GitCommand -Arguments "push origin main" -LogFile "git_push.log"

Write-Host "Push completed successfully."
