@echo off
cd /d "%~dp0"
start "Milk Farm API" cmd /k "npm run api"
start "Milk Farm Web" cmd /k "npm run dev"
