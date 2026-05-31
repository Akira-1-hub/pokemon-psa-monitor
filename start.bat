@echo off
title PSA Pokeca Market Monitor Launcher

REM Add Node.js to PATH (no restart needed)
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ================================================
echo  PSA Pokeca Market Monitor - Launcher
echo ================================================
echo.

REM --- 1. Port check ---
echo [check] Checking ports 8000 / 5173 ...
netstat -ano | findstr "LISTENING" | findstr -E ":8000 :5173" > nul
if not errorlevel 1 (
    echo.
    echo  [ERROR] Port 8000 or 5173 is already in use.
    echo  Please close existing processes and retry.
    echo.
    pause
    exit /b 1
)

REM --- 2. Python check ---
echo [check] Checking Python ...
where python > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python not found. Install from https://www.python.org/
    pause
    exit /b 1
)

REM --- 3. Node.js check ---
echo [check] Checking Node.js ...
where node > nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found at C:\Program Files\nodejs\
    pause
    exit /b 1
)

REM --- 4. node_modules check ---
if not exist "%~dp0frontend\node_modules" (
    echo [install] Running npm install ...
    cd /d "%~dp0frontend"
    call npm install
    if errorlevel 1 (
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)

echo.
echo ================================================
echo  Starting servers ...
echo ================================================
echo.

REM --- 5. Start backend (new window) ---
start "PSA Backend [port 8000]" cmd /k "chcp 65001 > nul && cd /d %~dp0 && echo === FastAPI Backend === && python backend\main.py"

REM --- 6. Wait ---
timeout /t 3 /nobreak > nul

REM --- 7. Start frontend (new window) ---
start "PSA Frontend [port 5173]" cmd /k "chcp 65001 > nul && set PATH=C:\Program Files\nodejs;%%PATH%% && cd /d %~dp0frontend && echo === Vite Dev Server === && npm run dev"

REM --- 8. Wait for servers ---
timeout /t 5 /nobreak > nul

REM --- 9. Open browser ---
start "" "http://localhost:5173"

echo.
echo ================================================
echo  Started!
echo ================================================
echo.
echo  Frontend: http://localhost:5173
echo  API docs: http://localhost:8000/docs
echo.
echo  Close the 2 opened windows to stop.
echo.
pause
