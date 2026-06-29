$repoPath = "C:\Users\dylan\jungle-app"
$logFile  = "$repoPath\auto-deploy.log"
$gitCmd = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $gitCmd) { foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe","C:\Program Files\Git\cmd\git.exe")) { if (Test-Path $p) { $gitCmd = $p; break } } }
function Log($m) { $l="[$(Get-Date -f 'yyyy-MM-dd HH:mm:ss')] $m"; Write-Host $l; Add-Content $logFile $l -Encoding UTF8 }
Set-Location $repoPath
Log "=== Auto-deploy started | git: $gitCmd ==="
$remote = & $gitCmd remote get-url origin 2>$null; Log "Remote: $remote"
while ($true) {
    Start-Sleep -Seconds 5
    try {
        Set-Location $repoPath
        $st = & $gitCmd status --porcelain 2>&1
        if (-not $st) { continue }
        Log "Changes: $($st -join ', ')"
        & $gitCmd add . 2>&1 | Out-Null
        $ts = Get-Date -f "yyyy-MM-dd HH:mm:ss"
        $co = & $gitCmd commit -m "Auto-deploy: $ts" 2>&1
        if ($LASTEXITCODE -ne 0) { if ($co -match "nothing to commit") { continue }; Log "Commit failed: $co"; continue }
        Log "Committed: $ts"
        $po = & $gitCmd push 2>&1
        if ($LASTEXITCODE -ne 0) { Log "Push FAILED: $po" } else { Log "Pushed OK — GitHub Actions building now" }
    } catch { Log "Error: $_" }
}
