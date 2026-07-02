@echo off
cd /d "%~dp0.."
echo === Push at %date% %time% === >> src\push.log
git add -A
git commit -m "Auto-DJ fixes: device picker, playlist track counts, auto-start playback, mobile modal" >> src\push.log 2>&1
git push origin main >> src\push.log 2>&1
echo === Done === >> src\push.log
