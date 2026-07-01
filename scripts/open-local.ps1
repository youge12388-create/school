$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OpenUrl = "http://127.0.0.1:3000/dashboard"
$HealthUrl = "http://127.0.0.1:3000/login"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
    return [int]$response.StatusCode -ge 200
  } catch {
    return $false
  }
}

function Start-ProductionServer {
  $DataDir = Join-Path $ProjectRoot "data"
  $LogDir = Join-Path $DataDir "logs"
  if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

  $PidFile = Join-Path $DataDir ".service.pid"
  $StdoutLog = Join-Path $LogDir "service-stdout.log"
  $StderrLog = Join-Path $LogDir "service-stderr.log"

  $proc = Start-Process `
    -FilePath "node" `
    -WorkingDirectory $ProjectRoot `
    -ArgumentList @(
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3000"
    ) `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -WindowStyle Hidden `
    -PassThru

  $proc.Id | Out-File -FilePath $PidFile -Encoding ASCII
}

# First: open if the app is already running.
if (Test-AppReady) {
  Start-Process $OpenUrl
  exit 0
}

# Second: if a production build exists, start it directly without rebuilding.
$Built = Test-Path (Join-Path (Join-Path $ProjectRoot ".next") "BUILD_ID")
if ($Built) {
  Start-ProductionServer
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if (Test-AppReady) { break }
    Start-Sleep -Seconds 1
  }
  Start-Process $OpenUrl
  exit 0
}

# Fallback: dev mode.
$StartScript = Join-Path $PSScriptRoot "start-local.ps1"
Start-Process `
  -FilePath "powershell.exe" `
  -WorkingDirectory $ProjectRoot `
  -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$StartScript`""
  ) `
  -WindowStyle Minimized

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  if (Test-AppReady) { break }
  Start-Sleep -Seconds 2
}

Start-Process $OpenUrl