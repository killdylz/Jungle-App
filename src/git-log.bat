@echo off
cd /d "%~dp0.."
git log --oneline -8 > "%~dp0git-log.txt" 2>&1
echo === %time% === >> "%~dp0git-log.txt"
