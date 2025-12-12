@echo off
setlocal

rem Базовая папка проекта (правка под себя)
set "BASE_DIR=C:\queue\"
set "NODE_DIR=%BASE_DIR%my_print_server"

rem Запуск киоска (PowerShell-скрипт)
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%BASE_DIR%start-chrome-kiosk.ps1"

rem Запуск Node-сервера печати
start "" cmd /c "cd /d %NODE_DIR% && npm start"

endlocal
