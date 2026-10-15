# Iniciar Servidor Local Monolítico (FastAPI + React compilado)
$env:PYTHONPATH = "backend"
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "sqlite:///./fiados.db"
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host "   Iniciando Sistema de Libreta de Fiados (Local)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Green
Write-Host "Servidor disponible en: http://localhost:8000" -ForegroundColor Yellow
Write-Host "Documentacion Swagger:  http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host "Presione Ctrl+C para detener."
Write-Host "========================================================"

& "backend\.venv\Scripts\uvicorn.exe" app.main:app --host 0.0.0.0 --port 8000
