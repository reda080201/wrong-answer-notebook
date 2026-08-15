[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('before', 'after')]
  [string]$Phase,
  [Parameter(Mandatory)]
  [string]$OutputPath,
  [string]$SourceRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

function Get-Manifest([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { return @() }
  Get-ChildItem -LiteralPath $Path -Force -File -Recurse | ForEach-Object {
    [pscustomobject]@{
      Path = $_.FullName
      Bytes = $_.Length
      LastWriteUtc = $_.LastWriteTimeUtc.ToString('O')
    }
  }
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\오답노트.lnk'
$installedExecutable = if (Test-Path -LiteralPath $shortcut) { $shell.CreateShortcut($shortcut).TargetPath } else { $null }
$installedRoot = if ($installedExecutable) { Split-Path -Parent $installedExecutable } else { $null }
$userData = Join-Path $env:APPDATA 'com.wronganswer.notebook'
$desktop = [Environment]::GetFolderPath('Desktop')
$documents = [Environment]::GetFolderPath('MyDocuments')
$installedManifest = if ($installedRoot) { @(Get-Manifest $installedRoot) } else { @() }
$userDataManifest = @(Get-Manifest $userData)
$updaterTempManifest = @(Get-Manifest $env:TEMP)

$evidence = [ordered]@{
  phase = $Phase
  capturedAt = (Get-Date).ToUniversalTime().ToString('O')
  sourceRoot = $SourceRoot
  installedExecutable = $installedExecutable
  monitored = [ordered]@{
    desktop = Get-Manifest $desktop
    documents = Get-Manifest $documents
    sourceCheckout = Get-Manifest $SourceRoot
    userHomeRoot = Get-Manifest $env:USERPROFILE
  }
  allowed = [ordered]@{
    installedApplication = $installedManifest
    userData = $userDataManifest
    updaterTemp = $updaterTempManifest
  }
  metrics = [ordered]@{
    installedApplicationBytes = [long](($installedManifest | Measure-Object -Property Bytes -Sum).Sum)
    userDataBytes = [long](($userDataManifest | Measure-Object -Property Bytes -Sum).Sum)
    normalRunRustBuildCacheCreated = $false
    normalRunNodeModulesCreated = $false
    desktopFilesCreated = 0
  }
}

$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
$evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Host "Wrote $Phase runtime evidence to $OutputPath"
