@echo off
setlocal
cd /d "%~dp0"

echo [1/4] Checking node_modules...
if not exist node_modules (
  echo node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo npm install failed
    exit /b 1
  )
)

echo [2/4] Checking seed script...
findstr /C:"\"seed\"" package.json >nul
if %errorlevel%==0 (
  echo Running npm run seed...
  call npm run seed
)

echo [3/4] Opening browser...
start "" "http://localhost:3000"

echo [4/4] Starting app...
call npm start