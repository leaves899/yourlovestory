[CmdletBinding()]
param(
  [string]$NodeVersion
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$versionFile = Join-Path $projectRoot '.nvmrc'

if ([string]::IsNullOrWhiteSpace($NodeVersion)) {
  $NodeVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
}

if ($NodeVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "Invalid Node.js version: $NodeVersion"
}

$runtimeRoot = Join-Path $projectRoot '.runtime'
$archiveName = "node-v$NodeVersion-win-x64.zip"
$archivePath = Join-Path $runtimeRoot $archiveName
$installRoot = Join-Path $runtimeRoot "node-v$NodeVersion-win-x64"
$nodePath = Join-Path $installRoot 'node.exe'
$npmPath = Join-Path $installRoot 'npm.cmd'
$downloadUrl = "https://nodejs.org/dist/v$NodeVersion/$archiveName"
$checksumsUrl = "https://nodejs.org/dist/v$NodeVersion/SHASUMS256.txt"

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $archivePath)) {
  Write-Host "Downloading project-local Node.js $NodeVersion..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
}

$checksumLine = (Invoke-WebRequest -Uri $checksumsUrl -UseBasicParsing).Content -split "`r?`n" |
  Where-Object { $_ -match "\s$([regex]::Escape($archiveName))$" } |
  Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($checksumLine)) {
  throw "SHA-256 checksum not found for $archiveName"
}

$expectedHash = (($checksumLine.Trim() -split '\s+')[0]).ToUpperInvariant()
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToUpperInvariant()

if ($actualHash -ne $expectedHash) {
  throw "Node.js archive checksum mismatch: expected $expectedHash, got $actualHash"
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  Write-Host "Extracting project-local Node.js $NodeVersion..."
  Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimeRoot -Force
}

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw "Node.js extraction failed: $nodePath"
}

if (-not (Test-Path -LiteralPath $npmPath)) {
  throw "npm extraction failed: $npmPath"
}

Write-Host "Project-local Node.js environment is ready: $installRoot"
& $nodePath --version
& $npmPath --version
