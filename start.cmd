@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Follow README.md to create the Python environment first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -c "import flask" >nul 2>&1
if errorlevel 1 (
  echo Python or Flask is unavailable. Follow the setup steps in README.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" launcher.py --open-browser
if errorlevel 1 pause
