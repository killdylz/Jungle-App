@echo off
cd /d "%~dp0.."
echo Forcing fresh GitHub Actions build...
git commit --allow-empty -m "Force rebuild: Canopy theme + 4-screen redesign"
git push
echo.
echo GitHub Actions triggered. Watch progress at:
echo https://github.com/killdylz/Jungle-App/actions
echo.
echo Site will be live at:
echo https://killdylz.github.io/Jungle-App/
echo.
pause
