@echo off
setlocal enabledelayedexpansion

set "ANTHROPIC_AUTH_TOKEN=sk-0682111942e57645-2d86db-bc79fcbe"
set "ANTHROPIC_BASE_URL=http://localhost:20129/v1"
set "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1"

:: ------------------------------------------------------------
:: 1. Проверка, запущен ли уже OmniRoute (по порту)
:: ------------------------------------------------------------
echo Checking if OmniRoute is already running...
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 20129); $tcp.Dispose(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% equ 0 (
    echo OmniRoute is already running.
    goto :omniroute_ready
)

:: ------------------------------------------------------------
:: 2. Запуск OmniRoute (в новом окне)
:: ------------------------------------------------------------
echo OmniRoute not running. Starting...
start "" omniroute

:: ------------------------------------------------------------
:: 3. Бесконечное ожидание открытия порта
:: ------------------------------------------------------------
:wait_loop
echo Waiting for OmniRoute to start...
powershell -Command "Start-Sleep -Seconds 1"
powershell -Command "try { $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.Connect('localhost', 20129); $tcp.Dispose(); exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 goto :wait_loop

:omniroute_ready
echo OmniRoute is ready.

:: ------------------------------------------------------------
:: 4. Выбор модели
:: ------------------------------------------------------------
echo.
echo Available models:
echo 1) oc/deepseek-v4-flash-free
echo 2) kr/glm-5
echo 3) kr/claude-sonnet-4.5
echo 4) Custom...
set /p choice="Select model (1-4): "

if "%choice%"=="1" set "ANTHROPIC_MODEL=oc/deepseek-v4-flash-free"
if "%choice%"=="2" set "ANTHROPIC_MODEL=kr/glm-5"
if "%choice%"=="3" set "ANTHROPIC_MODEL=kr/claude-sonnet-4.5"
if "%choice%"=="4" (
    set /p custom="Enter model name: "
    set "ANTHROPIC_MODEL=!custom!"
)

:: ------------------------------------------------------------
:: 5. Запуск Claude
:: ------------------------------------------------------------
echo.
echo Starting Claude Code with model: %ANTHROPIC_MODEL%
claude

endlocal