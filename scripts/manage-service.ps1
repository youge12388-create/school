$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PidFile   = Join-Path (Join-Path $ProjectRoot "data") ".service.pid"
$LogDir    = Join-Path (Join-Path $ProjectRoot "data") "logs"
$StdoutLog = Join-Path $LogDir "service-stdout.log"
$StderrLog = Join-Path $LogDir "service-stderr.log"
$Url = "http://127.0.0.1:3000"

function Get-ServicePid {
  if (-not (Test-Path $PidFile)) { return $null }
  $sPid = Get-Content $PidFile -Raw | ForEach-Object { $_.Trim() }
  if ($sPid -match "^\d+$") { return [int]$sPid }
  return $null
}

function Get-ServiceProcess {
  $sPid = Get-ServicePid
  if (-not $sPid) { return $null }
  try { return Get-Process -Id $sPid -ErrorAction Stop } catch { return $null }
}

function Show-Status {
  $proc = Get-ServiceProcess
  if ($proc) {
    $uptime = (Get-Date) - $proc.StartTime
    Write-Host "Status: RUNNING" -ForegroundColor Green
    Write-Host "  PID:    $($proc.Id)"
    Write-Host "  Port:   3000"
    Write-Host "  URL:    $Url"
    Write-Host "  Start:  $($proc.StartTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host "  Uptime: $($uptime.Days)d $($uptime.Hours)h $($uptime.Minutes)m"
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri "$Url/login" -TimeoutSec 3
      Write-Host "  HTTP:   $([int]$resp.StatusCode) ($($resp.StatusDescription))" -ForegroundColor Green
    } catch { Write-Host "  HTTP:   unreachable" -ForegroundColor Red }
  } else {
    Write-Host "Status: STOPPED" -ForegroundColor Yellow
  }
}

function Stop-Service {
  $proc = Get-ServiceProcess
  if (-not $proc) { Write-Host "Service is not running"; return }
  Write-Host "Stopping service (PID $($proc.Id))..."
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
  Write-Host "Stopped." -ForegroundColor Yellow
  Get-Job -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Running" } | Stop-Job -ErrorAction SilentlyContinue | Out-Null
}

function Show-Logs {
  param([switch]$Tail, [int]$Lines = 50)
  if (-not (Test-Path $StdoutLog)) {
    Write-Host "No stdout log found." -ForegroundColor Yellow
  } else {
    Write-Host "=== stdout (last $Lines lines) ===" -ForegroundColor Cyan
    if ($Tail) { Get-Content $StdoutLog -Tail $Lines } else { Get-Content $StdoutLog }
  }
  Write-Host ""
  if (-not (Test-Path $StderrLog)) {
    Write-Host "No stderr log found." -ForegroundColor Yellow
  } else {
    $stderrSize = (Get-Item $StderrLog).Length
    Write-Host "=== stderr ($([math]::Round($stderrSize / 1KB)) KB) ===" -ForegroundColor Cyan
    if ($Tail) { Get-Content $StderrLog -Tail $Lines } else { Get-Content $StderrLog }
  }
}

function Show-Info {
  Write-Host "=== Deployment Info ===" -ForegroundColor Cyan
  Write-Host "  Root:   $ProjectRoot"
  Write-Host "  Node:   $(node --version 2>$null)"
  Write-Host "  NPM:    $(npm --version 2>$null)"
  Write-Host "  PidFile: $PidFile"
  Write-Host "  LogDir:  $LogDir"
  Write-Host ""
  $dbFile = Join-Path (Join-Path $ProjectRoot "data") "app.db"
  if (Test-Path $dbFile) {
    $size = [math]::Round(((Get-Item $dbFile).Length / 1KB))
    $modified = (Get-Item $dbFile).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss")
    Write-Host "  Database: $dbFile ($size KB, modified $modified)"
  } else {
    Write-Host "  Database: not found (run deploy first)" -ForegroundColor Yellow
  }
  $buildIdFile = Join-Path (Join-Path $ProjectRoot ".next") "BUILD_ID"
  if (Test-Path $buildIdFile) {
    $buildId = (Get-Content $buildIdFile -Raw).Trim()
    Write-Host "  Build:   $buildId"
  } else {
    Write-Host "  Build:   not built yet" -ForegroundColor Yellow
  }
}

# ---- Main ----
$cmd = $args[0]
if (-not $cmd) { $cmd = "status" }

switch ($cmd.ToLower()) {
  "status"  { Show-Status }
  "stop"    { Stop-Service }
  "restart" { Stop-Service; & (Join-Path $PSScriptRoot "deploy.ps1") -NoBrowser }
  "logs"    { Show-Logs -Tail }
  "log"     { Show-Logs -Tail }
  "cat"     { Show-Logs }
  "info"    { Show-Info }
  default {
    Write-Host "Usage: .\scripts\manage-service.ps1 <command>" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  status   Show service status (default)"
    Write-Host "  stop     Stop the service"
    Write-Host "  restart  Stop and re-deploy"
    Write-Host "  logs     Show last 50 lines of logs"
    Write-Host "  cat      Show full logs"
    Write-Host "  info     Show deployment info"
  }
}