@echo off
REM DUB ARENA - arranque rapido en Windows (API + web)
cd /d "%~dp0.."
if not exist node_modules (
  echo Instalando dependencias...
  call npm install || goto :error
)
if not exist .env (
  copy .env.example .env
  echo Creado .env a partir de .env.example
)
call npm run build:shared || goto :error
call npm run dev
goto :eof
:error
echo.
echo Ha fallado un paso. Revisa el mensaje anterior.
pause
