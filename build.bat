@echo off
echo Installing esbuild...
call npm install esbuild --save-dev
if %errorlevel% neq 0 (
    echo Failed to install esbuild
    pause
    exit /b 1
)

echo.
echo Building plugin with esbuild...
call npx esbuild main.ts --bundle --external:obsidian --external:electron --outfile=main.js --format=cjs --platform=node
if %errorlevel% neq 0 (
    echo Build failed
    pause
    exit /b 1
)

echo.
echo Build completed successfully!
echo Output: main.js
pause
