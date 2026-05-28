param(
  [string]$Container = "ai-relay-postgres-1",
  [string]$Database = "ai_relay",
  [string]$User = "ai_relay",
  [string]$OutputDir = "data/backups"
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputPath = Join-Path $OutputDir "$Database-$timestamp.dump"

docker exec $Container pg_dump -U $User -d $Database -Fc | Set-Content -Encoding Byte -Path $outputPath

Write-Host "Backup written to $outputPath"
