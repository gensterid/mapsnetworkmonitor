$local = git rev-parse HEAD
$remoteLines = git ls-remote origin main
$remote = $remoteLines -split "`t" | Select-Object -First 1
"Local Commit: $local" | Out-File sync_status.txt
"Remote Commit: $remote" | Out-File sync_status.txt -Append

if ($local -eq $remote) {
    "Result: FULLY SYNCED" | Out-File sync_status.txt -Append
}
else {
    "Result: MISMATCH (Local ahead or behind)" | Out-File sync_status.txt -Append
}
