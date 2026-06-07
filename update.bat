@echo off
chcp 65001 > nul
title PSA Data Update
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo ================================================
echo   PSA Data Update - DAILY (prices only, fast)
echo ================================================
echo.
echo Updates prices/rankings. Takes about 4 minutes.
echo (For PSA population counts, use update_full.bat weekly)
echo.

echo [1/3] Fetching prices (snkrdunk, fast diff)...
python fetch.py --skip-pokeca
if errorlevel 1 (
    echo.
    echo [ERROR] fetch.py failed. See messages above.
    pause
    exit /b 1
)

echo.
echo [2/3] Exporting JSON for the website...
python export_json.py
if errorlevel 1 (
    echo.
    echo [ERROR] export_json.py failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Uploading to GitHub...
git add frontend/public/data/ products.csv
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "chore: data update %date%"
    git push
    echo.
    echo ================================================
    echo   DONE! Pushed to GitHub.
    echo   Website refreshes in 2-3 min:
    echo   https://akira-1-hub.github.io/pokemon-psa-monitor/
    echo ================================================
) else (
    echo.
    echo ================================================
    echo   DONE! No price changes since last update.
    echo ================================================
)
echo.
pause
