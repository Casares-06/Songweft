@echo off
title Songweft - Spotify Stats
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo No se encuentra el entorno virtual .venv.
    echo Ejecuta primero: python -m venv .venv
    pause
    exit /b 1
)

".venv\Scripts\python.exe" -m streamlit run "app.py"
pause
