@echo off
cd /d "%~dp0.."
git add -A
git commit -m "Add Music Hub, Schedule Board, Member Mobile, Brand Studio - Analytics upgraded"
git push
echo Done! Deploying now...
pause
