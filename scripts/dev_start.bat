@echo off
echo Saas Visu - Demarrage backend API
cd /d "%~dp0.."
if not exist venv\Scripts\python.exe (
    echo Creer d'abord le venv: python -m venv venv
    exit /b 1
)
venv\Scripts\python.exe -m pip install -r requirements.txt -q
venv\Scripts\python.exe -m saasvisu.web_api.main
