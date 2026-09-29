@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title 抖音对标 - 一键环境初始化

echo ====================================================
echo        抖音对标系统 - 自动环境初始化与依赖安装
echo ====================================================
echo.

:: 1. 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10 或更高版本，并勾选 Add Python to PATH！
    pause
    exit /b 1
)

:: 2. 检查 Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js (推荐 v18 或更高版本)！
    pause
    exit /b 1
)

:: 3. 创建 Python 独立虚拟环境
if not exist ".venv" (
    echo [1/6] 正在创建 Python 虚拟环境 (.venv)...
    python -m venv .venv
) else (
    echo [1/6] Python 虚拟环境已存在，跳过创建。
)

:: 4. 安装 Python 依赖包
echo [2/6] 正在安装 Python 后端依赖包（使用国内镜像加速）...
call .\.venv\Scripts\pip.exe install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

:: 5. 安装 Playwright Chromium 浏览器内核
echo [3/6] 正在下载自动化浏览器组件（存放于项目目录 ms-playwright）...
set "PLAYWRIGHT_BROWSERS_PATH=%~dp0ms-playwright"
call .\.venv\Scripts\playwright.exe install chromium

:: 6. 生成配置文件与初始化数据库
echo [4/6] 正在检查配置文件与初始化数据库...
if not exist "conf.py" (
    copy conf.example.py conf.py >nul
)
if not exist "settings.json" (
    copy settings.example.json settings.json >nul
)
call .\.venv\Scripts\python.exe db/createTable.py

:: 7. 安装前端与桌面端依赖
echo [5/6] 正在安装 Node.js 与桌面端依赖...
call npm install --registry=https://registry.npmmirror.com
call npm --prefix sau_frontend install --registry=https://registry.npmmirror.com

:: 8. 编译前端静态文件
echo [6/6] 正在构建前端界面...
call npm --prefix sau_frontend run build

echo.
echo ====================================================
echo        初始化完成！您可以直接双击运行【抖音对标.bat】
echo ====================================================
echo.
pause
endlocal
