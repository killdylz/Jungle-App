@echo off
cd /d "%~dp0.."
git log --oneline -5 > "%~dp0git-log.txt" 2>&1
git diff HEAD --stat >> "%~dp0git-log.txt" 2>&1
echo === DONE === >> "%~dp0git-log.txt"
