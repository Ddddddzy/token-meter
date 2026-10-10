@echo off
setlocal
echo Token Meter - deploy and enable sign-in startup
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" -AutoStart -StartNow
if errorlevel 1 (
  echo.
  echo Deployment failed. Read the error above; startup was not reported as ready.
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)
echo.
echo Ready. Token Meter is in the system tray, including hidden tray icons.
echo It will start for this user at the next sign-in.
if /i not "%~1"=="--no-pause" pause
exit /b 0
