@echo off
title Update MediXtract Schema Editor
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ===================================================
echo       MediXtract Schema Editor - Updater
echo ===================================================
echo.

:: Check for PowerShell
where powershell >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PowerShell is required to update the program.
    echo Please install PowerShell or update via Git manually.
    pause
    exit /b 1
)

:: Run the update script
powershell -ExecutionPolicy Bypass -File "tools\update_program.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] The update process encountered a problem.
    pause
) else (
    echo.
    echo Done! The program has been updated to the latest version.
    echo Your 'projects' folder was kept safe.
    echo.
    pause
)
