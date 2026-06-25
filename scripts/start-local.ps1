$ErrorActionPreference = "Stop"
Set-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
}

npm run db:migrate
npm run dev
