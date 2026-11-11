# DUB ARENA - comprobacion e instalacion de herramientas en Windows.
# Uso (PowerShell como administrador, opcional para winget):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1

$ErrorActionPreference = 'Continue'

function Show-Tool {
  param([string]$Name, [string]$Command, [string]$WingetId)
  Write-Host "`n== $Name ==" -ForegroundColor Cyan
  $found = Get-Command $Command -ErrorAction SilentlyContinue
  if ($found) {
    & $Command --version 2>&1 | Select-Object -First 1
    Write-Host "   OK: $($found.Source)" -ForegroundColor Green
  } else {
    Write-Host "   NO INSTALADO. Instala con:" -ForegroundColor Yellow
    Write-Host "   winget install $WingetId"
  }
}

Show-Tool -Name 'Node.js' -Command 'node'  -WingetId 'OpenJS.NodeJS.LTS'
Show-Tool -Name 'npm'     -Command 'npm'   -WingetId 'OpenJS.NodeJS.LTS'
Show-Tool -Name 'Git'     -Command 'git'   -WingetId 'Git.Git'
Show-Tool -Name 'Python'  -Command 'python' -WingetId 'Python.Python.3.11'

Write-Host "`n== FFmpeg ==" -ForegroundColor Cyan
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
if ($ff) {
  ffmpeg -version | Select-Object -First 1
  Write-Host "   OK: $($ff.Source)" -ForegroundColor Green
} else {
  Write-Host "   NO INSTALADO. Opcion recomendada:" -ForegroundColor Yellow
  Write-Host "   winget install Gyan.FFmpeg"
  Write-Host "   Despues cierra y abre la terminal para que el PATH se actualice."
}

Write-Host "`n== Siguiente paso ==" -ForegroundColor Cyan
Write-Host "   1) npm install"
Write-Host "   2) copy .env.example .env"
Write-Host "   3) npm run build:shared"
Write-Host "   4) npm run dev"
Write-Host "   5) (IA) python -m venv ai-venv; ai-venv\Scripts\activate; pip install -r ai-services\requirements.txt; python ai-services\main.py"
