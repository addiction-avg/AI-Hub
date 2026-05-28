param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,
  [string]$Container = "ai-relay-postgres-1",
  [string]$Database = "ai_relay",
  [string]$User = "ai_relay"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupPath)) {
  throw "Backup file not found: $BackupPath"
}

Get-Content -Encoding Byte -Path $BackupPath | docker exec -i $Container pg_restore -U $User -d $Database --clean --if-exists

Write-Host "Restore completed from $BackupPath"
