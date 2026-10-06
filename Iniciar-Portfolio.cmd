@echo off
cd /d "%~dp0"
if not exist "node_modules\next\dist\bin\next" (
  call npm ci
  if errorlevel 1 exit /b 1
)
node scripts/iniciar.mjs
pause
