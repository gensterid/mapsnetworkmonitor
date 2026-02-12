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

$version = "1.0.0" # Hardcoded for first release to ensure stability
$tag = "v$version"

Write-Host "🚀 Creating release $tag..." -ForegroundColor Cyan

Invoke-GitCommand -Arguments "add ." -LogFile "git_add.log"
Invoke-GitCommand -Arguments "commit -m ""chore: prepare release $tag""" -LogFile "git_commit.log"
Invoke-GitCommand -Arguments "tag -a $tag -m ""Release $tag""" -LogFile "git_tag.log"
Invoke-GitCommand -Arguments "push origin main" -LogFile "git_push_main.log"
Invoke-GitCommand -Arguments "push origin $tag" -LogFile "git_push_tag.log"

# Cleanup
Remove-Item git_*.log* -ErrorAction SilentlyContinue

Write-Host "Done."
