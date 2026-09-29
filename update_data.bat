@echo off
title Actualizar datos de Songweft
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo No se encuentra el entorno virtual .venv.
    pause
    exit /b 1
)

set "SONGWEFT_ZIP=%~1"
if not defined SONGWEFT_ZIP (
    set /p "SONGWEFT_ZIP=Ruta completa del ZIP de Spotify: "
)

if not exist "%SONGWEFT_ZIP%" (
    echo No se encuentra el ZIP indicado.
    pause
    exit /b 1
)

".venv\Scripts\python.exe" "src\process_data.py" --zip "%SONGWEFT_ZIP%"
pause
