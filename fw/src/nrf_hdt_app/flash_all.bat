@echo off
setlocal enabledelayedexpansion

:: Flash the _build image to every connected DK.
nrfutil device list > "%TEMP%\hdt_devlist.txt" 2>nul
for /f "usebackq tokens=1" %%S in (`findstr /r /b /c:"[0-9][0-9][0-9][0-9][0-9][0-9]" "%TEMP%\hdt_devlist.txt"`) do (
    echo === Flashing %%S ===
    nrfutil device halt --serial-number %%S >nul 2>&1
    call west flash -d _build -i %%S --erase --no-rebuild --recover
)
