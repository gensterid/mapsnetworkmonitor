$ErrorActionPreference = "Continue"

function Invoke-GitCommand {
    param (
        [string]$Arguments,
        [string]$Name
    )
    $LogFile = "git_$Name.log"
    $ErrFile = "git_$Name.err"
    Write-Host "Running: git $Arguments"
    $p = Start-Process -FilePath "git" -ArgumentList $Arguments -RedirectStandardOutput $LogFile -RedirectStandardError $ErrFile -PassThru -Wait
    
    if (Test-Path $LogFile) {
        $out = Get-Content $LogFile -Raw
        Write-Host "STDOUT ($Name): $out"
    }
    if (Test-Path $ErrFile) {
        $err = Get-Content $ErrFile -Raw
        if ($err) { Write-Host "STDERR ($Name): $err" }
    }
    
    Write-Host "Exit Code ($Name): $($p.ExitCode)"
    return $p.ExitCode
}

Invoke-GitCommand -Arguments "add ." -Name "add"
Invoke-GitCommand -Arguments "commit -m ""fix: v8 ultimate-fix for Netwatch with independent script safety and host normalization""" -Name "commit"
Invoke-GitCommand -Arguments "push origin main" -Name "push"

Write-Host "Sync process finished."
