@echo off
setlocal
cd /d "%~dp0"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
set "SAU_BUNDLED_PLAYWRIGHT_PATH=%~dp0ms-playwright"
title Sunbird OS Web
echo ====================================================
echo Starting Sunbird OS Web Service...
echo ====================================================
start "Sunbird OS Backend" /D "%~dp0" "%~dp0.venv\Scripts\python.exe" sau_koubo_server.py
start "Sunbird OS Frontend" /D "%~dp0" cmd /c "npm run frontend:dev"
timeout /t 3 >nul
start http://localhost:5173
endlocal
