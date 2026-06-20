# OutreachPro - Start All Services
# Run this script from: c:\Users\DELL\Desktop\email-automation-system

Write-Host ""
Write-Host "=== OutreachPro Backend Startup ===" -ForegroundColor Cyan
Write-Host ""

# Start Django Backend in background
Write-Host "[1/2] Starting Django Backend on port 8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\django_backend'; venv\Scripts\python manage.py runserver 8000"

Start-Sleep -Seconds 2

# Start Next.js Frontend in background
Write-Host "[2/2] Starting Next.js Frontend on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev"

Write-Host ""
Write-Host "Both servers are starting!" -ForegroundColor Green
Write-Host "  -> Django API:  http://localhost:8000/api/" -ForegroundColor White
Write-Host "  -> App:         http://localhost:3000" -ForegroundColor White
Write-Host ""
