@echo off
cd /d "%~dp0.."
echo Staging all changes...
git add -A
echo Committing...
git commit -m "Canopy theme + 4-screen mockup upgrade"
echo Pushing to GitHub...
git push
echo.
echo Done! Site deploys in ~60 seconds at:
echo https://killdylz.github.io/Jungle-App/
echo.
pause
