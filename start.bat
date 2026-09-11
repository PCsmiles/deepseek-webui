@echo off
chcp 65001 >nul
cd /d "%~dp0"
title DeepSeek Chat UI

echo.
echo   ==========================================
echo     DeepSeek Local Chat UI
echo   ==========================================
echo.

set PY=python
where python >nul 2>nul
if errorlevel 1 goto NOPYTHON

rem ---- already running? just open the browser, do NOT start a 2nd server ----
set OLDPORT=8765
if exist "data\port.txt" set /p OLDPORT=<"data\port.txt"
%PY% -c "import socket,sys;s=socket.socket();s.settimeout(0.6);sys.exit(0 if s.connect_ex(('127.0.0.1',int(sys.argv[1])))==0 else 1)" %OLDPORT% >nul 2>nul
if not errorlevel 1 goto ALREADYRUN

rem ---- check dependencies, install if missing ----
%PY% -c "import fastapi, uvicorn, httpx" >nul 2>nul
if errorlevel 1 goto INSTALL
goto ASSETS

:INSTALL
echo   First run: installing Python packages (via Tsinghua mirror)...
echo.
%PY% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
if errorlevel 1 goto PIPFAIL
echo.

:ASSETS
rem ---- download frontend libs once (Markdown / code highlight / math) ----
if not exist "static\vendor\marked.min.js" (
  echo   Downloading frontend render libraries for offline use...
  %PY% install_assets.py
  echo.
)

echo   Starting server, browser will open automatically...
echo   (Keep this window open. Press Ctrl+C to stop.)
echo.

set PYTHONUNBUFFERED=1
%PY% server.py %*

echo.
echo   Server stopped.
pause
exit /b 0

:ALREADYRUN
echo   Server is ALREADY running on port %OLDPORT%.
echo   Opening the browser - nothing else to do.
echo   (You can close this window; the server keeps running in its own window.)
start "" "http://127.0.0.1:%OLDPORT%/"
ping -n 3 127.0.0.1 >nul
exit /b 0

:NOPYTHON
echo   [ERROR] "python" not found.
echo           Install Python and check "Add python.exe to PATH" during setup.
echo.
pause
exit /b 1

:PIPFAIL
echo.
echo   [ERROR] Failed to install packages. Check your network, then run:
echo           python -m pip install -r requirements.txt
echo.
pause
exit /b 1
