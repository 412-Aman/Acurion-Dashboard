@echo off
rem Start website bridge.bat: connects https://acurion.vercel.app to K7 and the batch API on this computer.
rem Put this file and acurion_bridge.py in the Acurion folder (next to api.py and "Start Acurion.bat").
rem It uses Acurion's own Python environment (the one "Setup Acurion.bat" made) and the Firebase key K7 uses.
rem Leave this window open while the website should reach K7. Close it (or press Ctrl+C) to stop.

setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0" || goto :no_folder
set "PROJECT=%CD%"

set "VENV_PY="
if defined ACURION_VENV set "VENV_PY=%ACURION_VENV%\Scripts\python.exe"
if not defined VENV_PY if exist "%PROJECT%\.venv\Scripts\python.exe" set "VENV_PY=%PROJECT%\.venv\Scripts\python.exe"
if not defined VENV_PY if exist "%PROJECT%\..\.venv\Scripts\python.exe" for %%I in ("%PROJECT%\..\.venv\Scripts\python.exe") do set "VENV_PY=%%~fI"
if not defined VENV_PY (
  echo [Acurion] Acurion's Python environment was not found: run "Setup Acurion.bat" first.
  goto :end
)

if not defined ACURION_FIREBASE_URL set "ACURION_FIREBASE_URL=https://acurion-2bd21-default-rtdb.firebaseio.com"
if not defined ACURION_FIREBASE_CREDENTIALS (
  echo [Acurion] Which Firebase key file should the bridge use? ^(the same one K7 publishes with^)
  set /p "ACURION_FIREBASE_CREDENTIALS=Key file path: "
)
if not exist "%ACURION_FIREBASE_CREDENTIALS%" (
  echo [Acurion] The key file was not found: "%ACURION_FIREBASE_CREDENTIALS%"
  goto :end
)

echo [Acurion] Starting the website bridge. Leave this window open.
"%VENV_PY%" "%PROJECT%\acurion_bridge.py" %*

:end
popd
echo.
pause
endlocal
exit /b

:no_folder
echo [Acurion] The folder of this file cannot be opened: "%~dp0"
pause
exit /b 1
