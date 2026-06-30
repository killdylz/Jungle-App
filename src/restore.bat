@echo off
cd /d "%~dp0.."
git checkout HEAD -- src/App.jsx > "%~dp0restore.log" 2>&1
echo DONE >> "%~dp0restore.log"
