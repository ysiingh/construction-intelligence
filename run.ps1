$env:Path = "C:\Program Files\nodejs;" + [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "Starting Construction Intelligence" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
Write-Host "[1/2] Starting Backend (FastAPI on http://127.0.0.1:8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root'; & '.\.venv\Scripts\python.exe' -m uvicorn app:app --reload --port 8000"

Write-Host "[2/2] Starting Frontend (React Vite on http://localhost:5173)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; `$env:Path = 'C:\Program Files\nodejs;' + `$env:Path; npm.cmd run dev"

Write-Host "========================================================" -ForegroundColor Green
Write-Host "Servers started in separate windows!" -ForegroundColor Green
Write-Host "Frontend App:    http://localhost:5173" -ForegroundColor White
Write-Host "Backend API Doc: http://localhost:8000/docs" -ForegroundColor White
Write-Host "Backend Health:  http://localhost:8000/api/health" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
