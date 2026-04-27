@echo off
echo ========================================
echo Yillow Project Setup
echo ========================================
echo.

echo Creating virtual environment...
python -m venv venv_yillow
if errorlevel 1 goto error

echo.
echo Activating virtual environment...
call venv_yillow\Scripts\activate.bat
if errorlevel 1 goto error

echo.
echo Installing Python dependencies...
pip install --upgrade pip setuptools wheel > nul 2>&1
pip install -r requirements.txt
if errorlevel 1 goto error

echo.
echo Installing React dependencies...
cd react-app
npm install
if errorlevel 1 goto error
cd ..

echo.
echo Initializing database...
flask db upgrade
if errorlevel 1 goto error

echo.
echo Seeding database with sample data...
flask seed all
if errorlevel 1 goto error

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To run the project:
echo   1. Run: run.bat
echo   OR manually:
echo   2. Terminal 1: venv_yillow\Scripts\activate ^&^& flask run
echo   3. Terminal 2: cd react-app ^&^& npm start
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo ERROR: Setup failed
echo ========================================
pause
exit /b 1
