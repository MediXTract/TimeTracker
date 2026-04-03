@echo off
setlocal

:: 1. SETTINGS
set "APP_NAME=TimeTracker"
set "PORT=2604"
set "ICON_RELATIVE_PATH=assets\images\logos\LOGO_TimeTracker_Circular.ico"
set "SHORTCUT_NAME=%APP_NAME%.lnk"

:: 2. DETECT MODE
:: If run with --serve, it starts the web server.
:: Otherwise, it creates the shortcut.
if "%1"=="--serve" goto :SERVE

:: 3. CREATE MODE (Default)
:: The script is in /assets/documents/
:: Root is two levels up
for %%i in ("%~dp0..\..") do set "ROOT_DIR=%%~fi"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

set "SHORTCUT_PATH=%ROOT_DIR%\%SHORTCUT_NAME%"
set "ICON_PATH=%ROOT_DIR%\%ICON_RELATIVE_PATH%"
set "SCRIPT_PATH=%~f0"

echo.
echo ========================================================
echo  %APP_NAME% Shortcut Creator
echo ========================================================
echo.
echo  Root Directory: %ROOT_DIR%
echo  Shortcut:       %SHORTCUT_NAME%
echo.
echo Creating shortcut in root...

:: Create the shortcut pointing back to this script with the --serve flag
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$s = $ws.CreateShortcut('%SHORTCUT_PATH%'); " ^
  "$s.TargetPath = '%SCRIPT_PATH%'; " ^
  "$s.Arguments = '--serve'; " ^
  "$s.WorkingDirectory = '%ROOT_DIR%'; " ^
  "$s.IconLocation = '%ICON_PATH%'; " ^
  "$s.Description = 'Start %APP_NAME%'; " ^
  "$s.Save()"

echo.
echo ========================================================
echo  SUCCESS!
echo.
echo  1. The '%APP_NAME%' shortcut has been created in:
echo     %ROOT_DIR%
echo.
echo  2. Double-click that shortcut to launch the app.
echo.
echo ========================================================
echo.
pause
exit /b

:SERVE
:: SERVER LOGIC
:: The script is in /assets/documents/
for %%i in ("%~dp0..\..") do set "ROOT_DIR=%%~fi"

title %APP_NAME% Local Server
setlocal enabledelayedexpansion
cd /d "%ROOT_DIR%"

echo.
echo ========================================================
echo  %APP_NAME% is running at: http://localhost:%PORT%
echo  Serving folder: !cd!
echo ========================================================
echo.
echo  [!] Keep this window open to keep the server running.
echo.

:: Run the server in a new window to prevent blocking the script
:: Using npx -y serve to ensure it runs without prompts
echo Starting server...
start /b "" npx -y serve -p %PORT% .

:: Wait a moment for the server to initialize (2 seconds)
timeout /t 2 /nobreak >nul

:: Open the browser once the server is likely ready
start "" "http://localhost:%PORT%"

:: Keep the window open and wait for user to close it
echo.
echo ========================================================
echo  SERVER READY
echo  Press Ctrl+C in this window to stop the server later.
echo ========================================================
pause >nul

if %errorlevel% neq 0 (
   echo.
   echo Error: Failed to start server. Ensure Node.js is installed.
   pause
)

