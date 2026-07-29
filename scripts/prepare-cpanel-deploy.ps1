$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

Write-Host "Building production bundle..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$buildStamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$stampPath = Join-Path $root "BUILD_STAMP.txt"
Set-Content -Path $stampPath -Value $buildStamp -NoNewline -Encoding ascii
Write-Host "BUILD_STAMP: $buildStamp"

$zipName = "company-esign-cpanel.zip"
$zipPath = Join-Path $root $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$include = @(
  ".next",
  "public",
  "src",
  "data",
  "storage",
  "scripts",
  "server.js",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "next-env.d.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "CPANEL-ENV.txt",
  "CPANEL-UPLOAD-README.txt",
  "BUILD_STAMP.txt"
)

Write-Host "Staging deploy files..."
$stage = Join-Path $root "tmp\cpanel-staging"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

foreach ($item in $include) {
  $source = Join-Path $root $item
  if (-not (Test-Path $source)) { continue }
  $target = Join-Path $stage $item
  if ($item -eq ".next") {
    robocopy $source $target /E /XD dev cache /NFL /NDL /NJH /NJS /NC /NS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Failed to stage .next folder." }
  } else {
    $targetParent = Split-Path -Parent $target
    if ($targetParent -and -not (Test-Path $targetParent)) {
      New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    }
    Copy-Item $source $target -Recurse -Force
  }
}

Write-Host "Creating Linux-compatible $zipName ..."
# Compress-Archive uses backslashes; Linux unzip cannot match .next/*
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($stage.Length).TrimStart("\", "/")
    $entryName = $relative -replace "\\", "/"
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $_.FullName,
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    )
  }
} finally {
  $zip.Dispose()
}

Remove-Item $stage -Recurse -Force

$hasNext = $false
$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $hasNext = ($check.Entries | Where-Object { $_.FullName -like ".next/*" -or $_.FullName -eq ".next/BUILD_ID" } | Measure-Object).Count -gt 0
} finally {
  $check.Dispose()
}

if (-not $hasNext) {
  throw "ZIP is missing .next/ - aborting."
}

Write-Host ""
Write-Host "Done: $zipPath"
Write-Host "Verified: .next/ is inside the ZIP (Linux paths)."
Write-Host "Upload to cPanel, FULL extract, then RESTART Node.js app."
Write-Host "IMPORTANT: Do NOT replace server data/ and storage/ folders."
