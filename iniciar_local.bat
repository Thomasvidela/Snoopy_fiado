@echo off
title Sistema Libreta de Fiados - Despensa Familiar
echo ========================================================
echo    Iniciando Sistema de Libreta de Fiados (Local)
echo ========================================================
echo.
cd /d "%~dp0"

set PYTHONPATH=backend
if not defined DATABASE_URL set DATABASE_URL=sqlite:///./fiados.db

echo Servidor disponible en:
echo   - Local: http://localhost:8000
echo   - Documentacion API: http://localhost:8000/docs
echo.
echo Presione Ctrl+C para detener el servidor.
echo ========================================================

backend\.venv\Scripts\uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
