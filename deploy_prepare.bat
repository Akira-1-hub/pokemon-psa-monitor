@echo off
title PSA Pokeca Monitor - Deploy Preparation

set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo ================================================
echo  Deploy Preparation
echo ================================================
echo.
echo This script will:
echo   1. Update data (fetch.py)
echo   2. Export JSON (export_json.py)
echo   3. Commit to git (optional)
echo.

choice /C YN /M "Run fetch.py to update all data (may take 10+ min)?"
if errorlevel 2 (
    echo Skipping fetch.
    goto export
)

echo.
echo --- Running fetch.py ---
python fetch.py
if errorlevel 1 (
    echo [WARN] fetch.py exited with error. Continuing anyway.
)

:export
echo.
echo --- Running export_json.py ---
python export_json.py
if errorlevel 1 (
    echo [ERROR] export_json.py failed.
    pause
    exit /b 1
)

echo.
choice /C YN /M "Commit and push to git for Vercel auto-deploy?"
if errorlevel 2 goto skip_git

git add products.csv frontend/public/data/
git commit -m "Update data %DATE% %TIME%"
git push
if errorlevel 1 (
    echo [WARN] git push failed. Check your git remote.
)

:skip_git
echo.
echo ================================================
echo  Done!
echo ================================================
echo.
echo Static JSON files: frontend\public\data\
echo Local preview    : cd frontend ^&^& npm run preview
echo.
pause
