# MLN Catalogs - instalacao no Windows.
# Uso:  irm https://raw.githubusercontent.com/adsmarlon/mln-catalogs/main/instalar.ps1 | iex
# Instala tudo dentro da pasta do usuario. Nao precisa de administrador.

$ErrorActionPreference = "Stop"
$NodeVer = "v24.20.0"
$Repo    = "adsmarlon/mln-catalogs"
$Destino = Join-Path $env:LOCALAPPDATA "MLN Catalogs"
$App     = Join-Path $Destino "app"
$NodeDir = Join-Path $Destino "node"
$Atalho  = Join-Path ([Environment]::GetFolderPath("Desktop")) "MLN Catalogs.bat"

Write-Host ""
Write-Host "  +--------------------------------+"
Write-Host "  |        MLN  CATALOGS           |"
Write-Host "  |        instalacao              |"
Write-Host "  +--------------------------------+"
Write-Host ""

function Falhar($msg) { Write-Host ""; Write-Host "  [X] $msg" -ForegroundColor Red; Write-Host ""; exit 1 }

# ---------- 1. Node ----------
$NodeBin = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) {
  try {
    $maior = [int](& node -p "process.versions.node.split('.')[0]")
    if ($maior -ge 18) { $NodeBin = $cmd.Source }
  } catch {}
}
$NodeExe = Join-Path $NodeDir "node.exe"
if (Test-Path $NodeExe) { $NodeBin = $NodeExe }

if (-not $NodeBin) {
  Write-Host "  > Baixando o Node.js (~36 MB)..."
  New-Item -ItemType Directory -Force -Path $Destino | Out-Null
  $zip = Join-Path $env:TEMP "mln-node.zip"
  $tmp = Join-Path $env:TEMP "mln-node"
  try {
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/node-$NodeVer-win-x64.zip" -OutFile $zip -UseBasicParsing
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    Move-Item $src $NodeDir
    Remove-Item $zip -Force
  } catch { Falhar "Nao consegui baixar o Node.js. Verifique sua internet." }
  $NodeBin = $NodeExe
  Write-Host "  [ok] Node.js instalado"
} else {
  Write-Host "  [ok] Node.js ja estava aqui"
}

$NodePath = Split-Path $NodeBin -Parent
$env:PATH = "$NodePath;$env:PATH"
$Npm = Join-Path $NodePath "npm.cmd"
if (-not (Test-Path $Npm)) { $Npm = "npm" }

# ---------- 2. baixa o aplicativo ----------
Write-Host "  > Baixando o aplicativo..."
$tgz = Join-Path $env:TEMP "mln-app.tar.gz"
$out = Join-Path $env:TEMP "mln-app"
try {
  Invoke-WebRequest -Uri "https://codeload.github.com/$Repo/tar.gz/refs/heads/main" -OutFile $tgz -UseBasicParsing
  if (Test-Path $out) { Remove-Item $out -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  tar -xzf $tgz -C $out
} catch { Falhar "Nao consegui baixar o aplicativo." }

$origem = Get-ChildItem $out -Directory -Recurse -Filter "app" | Select-Object -First 1
if (-not $origem) { Falhar "Pacote do aplicativo em formato inesperado." }

New-Item -ItemType Directory -Force -Path $App | Out-Null
Copy-Item -Path (Join-Path $origem.FullName "*") -Destination $App -Recurse -Force
Remove-Item $tgz, $out -Recurse -Force -ErrorAction SilentlyContinue

# ---------- 3. dependencias ----------
Write-Host "  > Instalando dependencias (pode levar 1-2 minutos)..."
Push-Location $App
& $Npm install --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; Falhar "Falha ao instalar as dependencias." }
Write-Host "  > Preparando o aplicativo..."
& $Npm run build | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; Falhar "Falha ao preparar o aplicativo." }
Pop-Location

# ---------- 4. atalho ----------
@"
@echo off
title MLN Catalogs
set "PATH=$NodePath;%PATH%"
cd /d "$App"
echo.
echo   MLN Catalogs esta iniciando...
echo   Para fechar o programa, feche esta janela.
echo.
start /b cmd /c "npm run start"
timeout /t 6 /nobreak >nul
start "" http://localhost:3100
pause
"@ | Set-Content -Path $Atalho -Encoding ASCII

Write-Host ""
Write-Host "  [ok] Instalado." -ForegroundColor Green
Write-Host ""
Write-Host "  Um atalho `"MLN Catalogs`" foi criado na sua Area de Trabalho."
Write-Host "  E por ele que voce abre o programa daqui pra frente."
Write-Host ""
