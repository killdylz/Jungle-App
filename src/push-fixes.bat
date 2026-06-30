@echo off
cd /d "%~dp0.."
echo === Push attempt %date% %time% === >> push.log
git status >> push.log 2>&1
git add -A >> push.log 2>&1
git commit -m "feat(dashboard): operator dashboard with KPIs, schedule, Jungle Intelligence, Auto-DJ widget" >> push.log 2>&1
git push origin main >> push.log 2>&1
echo === Done === >> push.log
