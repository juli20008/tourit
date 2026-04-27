@echo off
echo ========================================
echo Yillow Project - Running
echo ========================================
echo.
echo Starting Flask backend (http://localhost:5000)...
echo.

call venv_yillow\Scripts\activate.bat
flask run
