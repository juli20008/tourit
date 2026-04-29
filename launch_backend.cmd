@echo off
cd /d C:\Users\Hrana\OneDrive\MiaSoft\tourit
set FLASK_APP=app
set FORCE_LOCAL_DB=1
.\venv_yillow\Scripts\python.exe -m flask --app app run
