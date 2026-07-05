# Jungle App - manual, on-demand deploy.
# Run this ONLY when all your changes are ready. It commits everything and
# pushes once, which triggers the GitHub Actions build + Pages deploy.
# It does NOT watch or auto-commit in the background.
param([string]$Message = "")
$repoPath = "C:\Users\dylan\jungle-app"
$gitCmd = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $gitCmd) { foreach ($p in @("$env:ProgramFiles\Git\cmd\git.exe","C:\Program Files\Git\cmd\git.exe")) { if (Test-Path $p) { $gitCmd = $p; break } } }
Set-Location $repoPath
$st = & $gitCmd status --porcelain
if (-not $st) { Write-Host "Nothing to deploy - working tree is clean." -ForegroundColor Yellow; exit 0 }
Write-Host "Changes to deploy:" -ForegroundColor Cyan
$st | ForEach-Object { Write-Host "  $_" }
if (-not $Message) { $Message = "Deploy: $(Get-Date -f 'yyyy-MM-dd HH:mm:ss')" }
& $gitCmd add -A
& $gitCmd commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed (nothing staged?)." -ForegroundColor Red; exit 1 }
& $gitCmd push
if ($LASTEXITCODE -ne 0) { Write-Host "Push FAILED." -ForegroundColor Red; exit 1 }
Write-Host "Pushed. GitHub Actions is building now - live in ~1-2 min." -ForegroundColor Green
