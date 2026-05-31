@echo off
REM ============================================================
REM   PSA Pokeca Monitor - Daily Auto Update Installer
REM   Registers a Windows Scheduled Task that runs fetch.py daily
REM ============================================================

set TASK_NAME=PSAPokecaMonitor_DailyFetch
set RUN_TIME=03:00

echo.
echo ================================================
echo  Daily Auto-Update Setup
echo ================================================
echo.
echo  Task name : %TASK_NAME%
echo  Run time  : %RUN_TIME% (every day)
echo  Script    : %~dp0fetch.py
echo.

choice /C YN /M "Register the scheduled task?"
if errorlevel 2 (
    echo Cancelled.
    pause
    exit /b 0
)

REM Delete existing task if present
schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo Removing existing task...
    schtasks /Delete /TN "%TASK_NAME%" /F >nul
)

REM Create new task
schtasks /Create ^
    /TN "%TASK_NAME%" ^
    /TR "python \"%~dp0fetch.py\"" ^
    /SC DAILY ^
    /ST %RUN_TIME% ^
    /F

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to register task.
    echo You may need to run this BAT as Administrator.
    pause
    exit /b 1
)

echo.
echo ================================================
echo  Success!
echo ================================================
echo.
echo  Task registered.
echo  fetch.py will run at %RUN_TIME% every day (PC must be on).
echo.
echo  Check / modify : taskschd.msc -^> Task Scheduler Library
echo  To remove later: schedule_uninstall.bat
echo.
pause
