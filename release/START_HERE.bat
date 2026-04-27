@echo off
title Interrogating Blacks
echo.
echo ========================================
echo   INTERROGATING BLACKS
echo ========================================
echo.
echo Starting server on http://localhost:3847
echo Your browser should open automatically.
echo.
echo Keep this window open while playing.
echo Close it to shut down the server.
echo.
echo If nothing opens, check interrogating-blacks.log
echo (next to the exe) for errors.
echo ========================================
echo.
"%~dp0InterrogatingBlacks.exe"
echo.
echo Server stopped. Press any key to close...
pause >nul
