@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
call npm ci
if errorlevel 1 exit /b 1
call npm start
pause
