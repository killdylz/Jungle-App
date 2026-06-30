@echo off
cd /d "%~dp0.."
echo === Push attempt %date% %time% === > "%~dp0push.log"
git status >> "%~dp0push.log" 2>&1
git add -A >> "%~dp0push.log" 2>&1
git commit -m "feat(dashboard): operator dashboard with KPIs, schedule, Jungle Intelligence, Auto-DJ widget" >> "%~dp0push.log" 2>&1
git push origin main >> "%~dp0push.log" 2>&1
echo === Done === >> "%~dp0push.log"
