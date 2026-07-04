@echo off
cd /d C:\Users\dylan\jungle-app
echo [1/3] Staging changes...
git add -A
echo [2/3] Committing...
git commit -m "Fix B0: decode double UTF-8 mojibake + restore truncated App() function"
echo [3/3] Pushing to GitHub...
git push
echo.
echo Done! GitHub Actions will build and deploy in ~60 seconds.
echo Check: https://killdylz.github.io/Jungle-App/
pause
