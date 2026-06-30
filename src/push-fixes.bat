@echo off
cd /d "%~dp0.."
echo === Push attempt %date% %time% === > "%~dp0push.log"
git add -A >> "%~dp0push.log" 2>&1
git commit -m "fix(theme): --on-accent CSS var, button text contrast for Pulse/Atelier, body bg syncs with skin, smooth button transitions" >> "%~dp0push.log" 2>&1
git push origin main >> "%~dp0push.log" 2>&1
echo === Done === >> "%~dp0push.log"
