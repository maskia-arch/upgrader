@echo off
title Spotify Premium Upgrade - Local Admin Dashboard
echo Starting local Admin Dashboard...

cd admin-dashboard

:: Check if any of the environment files exist
set "ENV_FILE="
if exist .env.local set "ENV_FILE=.env.local"
if exist env.local set "ENV_FILE=env.local"
if exist .env.local.txt set "ENV_FILE=.env.local.txt"
if exist env.local.txt set "ENV_FILE=env.local.txt"
if exist .env set "ENV_FILE=.env"

if "%ENV_FILE%"=="" (
    echo [WARNING] No environment configuration file found in admin-dashboard directory!
    echo Please copy .env.local.example to .env.local and configure your keys first.
    pause
    exit /b 1
)

:: If the file is not named exactly .env.local, rename it for consistency
if not "%ENV_FILE%"==".env.local" (
    echo [INFO] Normalizing %ENV_FILE% to .env.local...
    rename "%ENV_FILE%" .env.local
)

:: Default port is 3000
set "PORT=3000"

:: Parse PORT from .env.local
for /f "usebackq tokens=1,2 delims==" %%i in (".env.local") do (
    set "key=%%i"
    set "val=%%j"
    setlocal enabledelayedexpansion
    set "key=!key: =!"
    if "!key!"=="PORT" (
        set "val=!val: =!"
        for /f "delims=" %%x in ("!val!") do (
            endlocal
            set "PORT=%%x"
        )
    ) else (
        endlocal
    )
)

:: Check if node_modules are installed, if not run npm install
if not exist node_modules (
    echo [INFO] node_modules folder not found. Installing dependencies...
    call npm install
)

:: Start the local server
echo [INFO] Launching Admin Dashboard...
start http://localhost:%PORT%
call npm start
pause
