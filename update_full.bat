@echo off
chcp 65001 > nul
title PSA Data Update - FULL
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"

echo ================================================
echo   PSA Data Update - FULL (prices + PSA counts)
echo ================================================
echo.
echo Updates EVERYTHING incl. PSA population counts and
echo full price history. Takes about 8-10 minutes.
echo Run this once a week.
echo.

echo [1/3] Fetching all data (snkrdunk + pokeca, full)...
python fetch.py --full
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
    git commit -m "chore: full data update %date%"
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
    echo   DONE! No changes since last update.
    echo ================================================
)
echo.
pause
