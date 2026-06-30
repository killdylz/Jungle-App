@echo off
cd /d "%~dp0.."
git add -A
git commit -m "fix(auto-dj): Spotify batch BPM, Camelot tracking, playlist picker, recommendations fallback; connect Music Hub to live Spotify data"
git push
