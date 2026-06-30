@echo off
cd /d "%~dp0.."
git add -A
git commit -m "Full redesign: all 8 screens rebuilt to match Canopy mockup"
git push
echo Done! Deploying now...
pause
