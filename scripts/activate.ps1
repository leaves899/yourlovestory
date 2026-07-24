$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$versionFile = Join-Path $projectRoot '.nvmrc'
$nodeVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
$nodeHome = Join-Path $projectRoot ".runtime\node-v$nodeVersion-win-x64"
$nodePath = Join-Path $nodeHome 'node.exe'

if (-not (Test-Path -LiteralPath $nodePath)) {
  & (Join-Path $PSScriptRoot 'setup-node-env.ps1') -NodeVersion $nodeVersion
}

$env:YOURCRUSH_NODE_HOME = $nodeHome
$env:Path = "$nodeHome;$env:Path"

Write-Host "Activated yourcrush project-local Node.js environment: $nodeVersion"
node --version
npm --version
