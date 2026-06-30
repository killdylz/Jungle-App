@echo off
cd /d "%~dp0.."
git log --oneline -5 > "%~dp0git-log.txt" 2>&1
git diff HEAD -- src/App.jsx >> "%~dp0git-log.txt" 2>&1
echo "---DONE---" >> "%~dp0git-log.txt"
