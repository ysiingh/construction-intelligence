@echo off
setlocal
set "PATH=C:\Program Files\nodejs;%PATH%"

echo ========================================================
echo Starting Construction Intelligence
echo ========================================================
echo [1/2] Launching Backend on http://127.0.0.1:8000 ...
start "Construction Intelligence - Backend" cmd /k "cd /d %~dp0 && .\.venv\Scripts\python.exe -m uvicorn app:app --reload --port 8000"

echo [2/2] Launching Frontend on http://localhost:5173 ...
start "Construction Intelligence - Frontend" cmd /k "cd /d %~dp0\frontend && set PATH=C:\Program Files\nodejs;%%PATH%% && npm.cmd run dev"

echo ========================================================
echo Both servers started in separate windows!
echo - Web App: http://localhost:5173
echo - API Docs: http://localhost:8000/docs
echo ========================================================
pause
