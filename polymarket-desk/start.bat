@echo off
rem One-click launcher for Windows: double-click this file.
cd /d "%~dp0"
if not exist .venv (
  echo First run: setting up, takes about a minute...
  python -m venv .venv
  .venv\Scripts\pip install -q -r requirements.txt
  if not exist .env copy .env.example .env >nul
)
set PY=.venv\Scripts\python
:menu
echo.
echo   Polymarket Desk
echo   1) Scan for arbitrage
echo   2) Best liquidity-reward markets
echo   3) Watch whale trades (live)
echo   4) Analyze a wallet
echo   5) Run paper-trading bot
echo   6) Show positions / PnL
echo   7) Backtest favorites (0.90-0.98)
echo   8) Backtest longshots (0.02-0.15)
echo   q) Quit
set /p c=  Choose: 
if "%c%"=="1" %PY% -m desk arb
if "%c%"=="2" %PY% -m desk rewards
if "%c%"=="3" %PY% -m desk whales --follow
if "%c%"=="4" goto wallet
if "%c%"=="5" %PY% -m desk bot
if "%c%"=="6" %PY% -m desk positions --settle
if "%c%"=="7" %PY% -m desk backtest --low 0.90 --high 0.98
if "%c%"=="8" %PY% -m desk backtest --low 0.02 --high 0.15
if /i "%c%"=="q" exit /b
goto menu
:wallet
set /p w=  Wallet address: 
%PY% -m desk wallet %w%
goto menu
