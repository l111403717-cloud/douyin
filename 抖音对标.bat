@echo off
setlocal
cd /d "%~dp0"
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
set "SAU_BUNDLED_PLAYWRIGHT_PATH=%~dp0ms-playwright"
title 抖音对标
echo ====================================================
echo 正在启动 抖音对标...
echo ====================================================
call npx electron .
endlocal
