$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Url = "http://127.0.0.1:3000/login"

function Test-AppReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return [int]$response.StatusCode -ge 200
  } catch {
    return $false
  }
}

# First: check if production service already running
if (Test-AppReady) {
  Start-Process $Url
  exit 0
}

# Second: try production deploy (if already built)
$Built = Test-Path (Join-Path $ProjectRoot ".next" "BUILD_ID")
$DeployScript = Join-Path $PSScriptRoot "deploy.ps1"

if ($Built -and (Test-Path $DeployScript)) {
  & $DeployScript -NoBrowser
  exit 0
}

# Fallback: dev mode
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

Start-Process $Url