@echo off
cd /d "%~dp0.."
git log --oneline -10 > "%~dp0git-log.txt" 2>&1
echo === Finding good commit === >> "%~dp0git-log.txt"
git show d513ecb:src/App.jsx > "%~dp0App-recovered.jsx" 2>> "%~dp0git-log.txt"
echo === DONE === >> "%~dp0git-log.txt"
