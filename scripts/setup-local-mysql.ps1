# Creates local MySQL database + app user, applies schema, migrates JSON data, updates .env.local
# Usage:
#   powershell -ExecutionPolicy Bypass -File ./scripts/setup-local-mysql.ps1 -RootPassword "YOUR_ROOT_PASSWORD"
# Optional:
#   -DbPassword "custom_app_password"  (default: local_esign_pass)
#   -SkipMigrate

param(
  [Parameter(Mandatory = $true)]
  [string]$RootPassword,

  [string]$DbHost = "127.0.0.1",
  [int]$DbPort = 3306,
  [string]$DbName = "valliani_esign",
  [string]$DbUser = "esign_user",
  [string]$DbPassword = "local_esign_pass",
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
$mysql = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if (-not (Test-Path $mysql)) {
  throw "mysql.exe not found at $mysql"
}

$rootDir = Split-Path $PSScriptRoot -Parent
$schemaPath = Join-Path $PSScriptRoot "schema-mysql.sql"
if (-not (Test-Path $schemaPath)) {
  throw "Missing schema: $schemaPath"
}

Write-Host "Creating database '$DbName' and user '$DbUser'..."

$bootstrapSql = @"
CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DbUser'@'localhost' IDENTIFIED BY '$DbPassword';
CREATE USER IF NOT EXISTS '$DbUser'@'127.0.0.1' IDENTIFIED BY '$DbPassword';
ALTER USER '$DbUser'@'localhost' IDENTIFIED BY '$DbPassword';
ALTER USER '$DbUser'@'127.0.0.1' IDENTIFIED BY '$DbPassword';
GRANT ALL PRIVILEGES ON ``$DbName``.* TO '$DbUser'@'localhost';
GRANT ALL PRIVILEGES ON ``$DbName``.* TO '$DbUser'@'127.0.0.1';
FLUSH PRIVILEGES;
"@

$bootstrapFile = Join-Path $env:TEMP "valliani-esign-bootstrap.sql"
Set-Content -Path $bootstrapFile -Value $bootstrapSql -Encoding UTF8

& $mysql -u root "-p$RootPassword" -h $DbHost -P $DbPort --protocol=TCP -e "SOURCE $($bootstrapFile.Replace('\','/'))"
if ($LASTEXITCODE -ne 0) {
  # Fallback: pipe SQL via stdin (SOURCE path can be flaky on Windows)
  $bootstrapSql | & $mysql -u root "-p$RootPassword" -h $DbHost -P $DbPort --protocol=TCP
  if ($LASTEXITCODE -ne 0) { throw "Failed to create database/user. Check root password." }
}

Write-Host "Applying schema..."
Get-Content $schemaPath -Raw | & $mysql -u root "-p$RootPassword" -h $DbHost -P $DbPort --protocol=TCP $DbName
if ($LASTEXITCODE -ne 0) { throw "Schema apply failed." }

$envLocal = Join-Path $rootDir ".env.local"
$dbBlock = @"

# --- MySQL (written by scripts/setup-local-mysql.ps1) ---
DATABASE_HOST=$DbHost
DATABASE_PORT=$DbPort
DATABASE_USER=$DbUser
DATABASE_PASSWORD=$DbPassword
DATABASE_NAME=$DbName
"@

if (Test-Path $envLocal) {
  $existing = Get-Content $envLocal -Raw
  $existing = [regex]::Replace($existing, "(?ms)^# --- MySQL.*?^DATABASE_NAME=.*?\r?\n", "")
  $existing = [regex]::Replace($existing, "(?m)^DATABASE_(HOST|PORT|USER|PASSWORD|NAME)=.*\r?\n", "")
  Set-Content -Path $envLocal -Value ($existing.TrimEnd() + "`r`n" + $dbBlock.TrimStart() + "`r`n") -Encoding UTF8
} else {
  Set-Content -Path $envLocal -Value $dbBlock.TrimStart() -Encoding UTF8
}

Write-Host "Updated .env.local with DATABASE_*"

if (-not $SkipMigrate) {
  Write-Host "Migrating JSON data/ into MySQL..."
  $env:DATABASE_HOST = $DbHost
  $env:DATABASE_PORT = "$DbPort"
  $env:DATABASE_USER = $DbUser
  $env:DATABASE_PASSWORD = $DbPassword
  $env:DATABASE_NAME = $DbName
  Push-Location $rootDir
  try {
    npx --yes tsx scripts/migrate-json-to-mysql.ts
    if ($LASTEXITCODE -ne 0) { throw "Migration failed." }
  } finally {
    Pop-Location
  }
}

Write-Host ""
Write-Host "Done. Restart 'npm run dev', then login with:"
Write-Host "  email:    contracts@valliani.app"
Write-Host "  password: ChangeMe123!  (from .env.local ADMIN_PASSWORD)"
Write-Host "MySQL app user: $DbUser / $DbPassword  db=$DbName"
