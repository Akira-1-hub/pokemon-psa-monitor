@echo off
set TASK_NAME=PSAPokecaMonitor_DailyFetch

echo.
echo Removing scheduled task: %TASK_NAME%
echo.

schtasks /Query /TN "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
    echo  Task does not exist.
    pause
    exit /b 0
)

schtasks /Delete /TN "%TASK_NAME%" /F
if errorlevel 1 (
    echo  [ERROR] Failed to remove task.
) else (
    echo  Task removed successfully.
)
pause
