[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$OpenUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$OpenUrl/login"
$RuntimeDir = Join-Path $ProjectRoot "data\local-runtime"
$MarkerPath = Join-Path $RuntimeDir "server.json"

if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot ".env.local"))) {
  throw "缺少 .env.local。请先配置本地数据库路径；已有数据库需先备份并确认迁移。"
}

function Get-OwnedServer {
  if (-not (Test-Path -LiteralPath $MarkerPath)) { return $null }
  try {
    $marker = Get-Content -LiteralPath $MarkerPath -Raw | ConvertFrom-Json
    if ($marker.ProjectRoot -ne $ProjectRoot -or $marker.Port -ne $Port -or $marker.Mode -ne "development") { return $null }
    $running = Get-Process -Id $marker.ProcessId -ErrorAction Stop
    $started = [DateTimeOffset]::Parse($marker.StartedAtUtc).UtcDateTime
    if ($running.StartTime.ToUniversalTime().Ticks -ne $started.Ticks) { return $null }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($running.Id)"
    if ($processInfo.CommandLine -notmatch 'node_modules[\\/]next[\\/]dist[\\/]bin[\\/]next.*\bdev\b') { return $null }
    return $running
  } catch { return $null }
}

$server = Get-OwnedServer
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
  $listenerProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if (-not $server -or ($listener.OwningProcess -ne $server.Id -and $listenerProcess.ParentProcessId -ne $server.Id)) {
    throw "端口 $Port 已由其他服务占用，未复用或停止该服务。请先检查占用，或通过 -Port 指定其他端口。"
  }
}

if (-not $server) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodeCandidates = @(
    $(if ($nodeCommand) { $nodeCommand.Source }),
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
  )
  $nodePath = $nodeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if (-not $nodePath) { throw "未找到 Node.js 24。" }
  $nodeVersion = & $nodePath --version
  if ($nodeVersion -notmatch '^v24\.') { throw "需要 Node.js 24，当前版本为 $nodeVersion。" }
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules\next\dist\bin\next"))) {
    throw "缺少项目依赖。请先在当前项目目录安装匹配锁文件的依赖。"
  }

  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
  $startOptions = @{
    FilePath = $nodePath
    WorkingDirectory = $ProjectRoot
    ArgumentList = @("node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "$Port")
    RedirectStandardOutput = (Join-Path $RuntimeDir "stdout.log")
    RedirectStandardError = (Join-Path $RuntimeDir "stderr.log")
    WindowStyle = "Hidden"
    PassThru = $true
  }
  $server = Start-Process @startOptions
  @{
    ProjectRoot = $ProjectRoot
    Port = $Port
    Mode = "development"
    ProcessId = $server.Id
    StartedAtUtc = $server.StartTime.ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $MarkerPath -Encoding utf8
}

$ready = $false
$deadline = (Get-Date).AddSeconds(45)
while ((Get-Date) -lt $deadline) {
  $server.Refresh()
  if ($server.HasExited) { throw "本地服务已退出，请检查 $RuntimeDir\stderr.log。" }
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 5
    if ([int]$response.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw "本地服务尚未就绪，请检查 $RuntimeDir 下的日志。" }

Write-Output "项目目录：$ProjectRoot"
Write-Output "本地预览：$OpenUrl"
if (-not $NoBrowser) { Start-Process $OpenUrl }
