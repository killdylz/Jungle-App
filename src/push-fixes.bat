@echo off
cd /d "%~dp0.."
git add -A
git commit -m "feat(dashboard): operator dashboard with KPIs, schedule, Jungle Intelligence, Auto-DJ widget"
git push origin main
