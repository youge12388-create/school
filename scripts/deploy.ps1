$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# ---- parse args ----
$NoBrowser = $args -contains "-NoBrowser"
$StartupTask = $args -contains "-Startup"

function Log { param($Msg) Write-Host "[deploy] $Msg" }

# ---- 1. Check Node.js ----
$nodeVersion = & node --version 2>$null
if (-not $nodeVersion) {
  Write-Error "Node.js not found in PATH. Please install Node.js 24+."
  exit 1
}
Log "Node.js $nodeVersion"

# ---- 2. Install dependencies ----
Log "Installing dependencies..."
Set-Location $ProjectRoot
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Write-Error "npm ci failed"; exit 1 }

# ---- 3. Create .env.local if missing ----
if (-not (Test-Path ".env.local")) {
  Log "Creating .env.local from .env.example"
  Copy-Item ".env.example" ".env.local"
}

# ---- 4. Production build ----
Log "Building production bundle..."
npm run build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

# ---- 5. Database migration ----
Log "Running database migration..."
npm run db:migrate
if ($LASTEXITCODE -ne 0) { Write-Error "Migration failed"; exit 1 }

# ---- 6. Start production server ----
$LogDir = Join-Path (Join-Path $ProjectRoot "data") "logs"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

$PidFile   = Join-Path (Join-Path $ProjectRoot "data") ".service.pid"
$StdoutLog = Join-Path $LogDir "service-stdout.log"
$StderrLog = Join-Path $LogDir "service-stderr.log"
$Url = "http://127.0.0.1:3000"

# Stop existing service if any
if (Test-Path $PidFile) {
  $sPid = Get-Content $PidFile -Raw | ForEach-Object { $_.Trim() }
  if ($sPid -match "^\d+$") {
    $proc = Get-Process -Id $sPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq "node") {
      Log "Stopping existing service (PID $oldPid)..."
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
  }
}

Log "Starting production server..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "node"
$psi.Arguments = "node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000"
$psi.WorkingDirectory = $ProjectRoot
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true

# Process inherits environment by default

$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi
$proc.Start() | Out-Null

$proc.Id | Out-File -FilePath $PidFile -Encoding ASCII

$stdoutJob = Start-Job -ScriptBlock { param($Reader, $Path)
  try {
    $sw = New-Object System.IO.StreamWriter -ArgumentList $Path, $true
    $sw.AutoFlush = $true
    $sw.WriteLine("=== Service started at $(Get-Date -Format yyyy-MM-dd HH:mm:ss) ===")
    while (($line = $Reader.ReadLine()) -ne $null) { $sw.WriteLine($line) }
  } catch { }
  $sw.Close()
} -ArgumentList $proc.StandardOutput, $StdoutLog

$stderrJob = Start-Job -ScriptBlock { param($Reader, $Path)
  try {
    $sw = New-Object System.IO.StreamWriter -ArgumentList $Path, $true
    $sw.AutoFlush = $true
    $sw.WriteLine("=== Service started at $(Get-Date -Format yyyy-MM-dd HH:mm:ss) ===")
    while (($line = $Reader.ReadLine()) -ne $null) { $sw.WriteLine($line) }
  } catch { }
  $sw.Close()
} -ArgumentList $proc.StandardError, $StderrLog

# ---- 7. Wait for service ready ----
Log "Waiting for service (PID $($proc.Id))..."
$ready = $false
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 1.5
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "$Url/login" -TimeoutSec 2
    if ([int]$resp.StatusCode -ge 200) { $ready = $true; break }
  } catch { }
}

if (-not $ready) {
  Log "Warning: service did not respond within 30s. Check logs:"
  Log "  stdout: $StdoutLog"
  Log "  stderr: $StderrLog"
} else {
  Log "Service is running at $Url"
}

# ---- 8. Register startup task (optional) ----
if ($StartupTask) {
  $taskName = "高校筛查系统"
  $taskCmd = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", (Join-Path $PSScriptRoot "deploy.ps1"), "-NoBrowser")
  $existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existing) {
    Log "Startup task '$taskName' already exists"
  } else {
    $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($taskCmd -join " ") -WorkingDirectory $ProjectRoot
    $trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Start-Sleep -Milliseconds 200; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force 2>$null | Out-Null
    Log "Startup task '$taskName' registered for user $env:USERNAME"
  }
}

# ---- 9. Open browser ----
if (-not $NoBrowser) {
  Log "Opening browser..."
  Start-Process "$Url/login"
}

Log "Done."
Write-Host ""
Write-Host "  Management: .\scripts\manage-service.ps1 <status|stop|restart|logs>" -ForegroundColor Cyan
Write-Host ""