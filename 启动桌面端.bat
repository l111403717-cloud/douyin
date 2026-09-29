@echo off
setlocal
cd /d "%~dp0"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
set "SAU_BUNDLED_PLAYWRIGHT_PATH=%~dp0ms-playwright"
title Sunbird OS Desktop
echo ====================================================
echo Starting Sunbird OS Desktop...
echo ====================================================
call npx electron .
endlocal
