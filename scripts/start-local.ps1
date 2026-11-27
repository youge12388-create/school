param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "open-local.ps1") -Port $Port -NoBrowser
