[CmdletBinding()]
param(
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$allowedRelativePaths = @('node_modules', 'dist', 'src-tauri\target')

function Get-DirectorySize([string]$Path) {
  $files = Get-ChildItem -LiteralPath $Path -Force -File -Recurse
  return [long]($files | Measure-Object -Property Length -Sum).Sum
}

$targets = foreach ($relativePath in $allowedRelativePaths) {
  $targetPath = Join-Path $repositoryRoot $relativePath
  if (!(Test-Path -LiteralPath $targetPath)) { continue }
  $item = Get-Item -LiteralPath $targetPath -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    Write-Warning "Skipped reparse point: $targetPath"
    continue
  }
  [pscustomobject]@{ Path = $item.FullName; Bytes = Get-DirectorySize $item.FullName }
}

if (!$targets) {
  Write-Host 'No legacy source build artifacts found in this repository.'
  exit 0
}

$targets | Format-Table -AutoSize
$total = [long]($targets | Measure-Object -Property Bytes -Sum).Sum
Write-Host "Total: $total bytes"
Write-Host 'Only source-tree node_modules, dist, and src-tauri\target are eligible. AppData, images, backups, and imported data are never touched.'

if (!$Remove) {
  Write-Host 'Read-only inspection complete. Re-run with -Remove to request deletion.'
  exit 0
}

$confirmation = Read-Host "Type REMOVE to delete the listed source build artifacts"
if ($confirmation -cne 'REMOVE') {
  Write-Host 'Deletion cancelled.'
  exit 1
}

foreach ($target in $targets) {
  $item = Get-Item -LiteralPath $target.Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to delete reparse point: $($target.Path)"
  }
  Remove-Item -LiteralPath $target.Path -Recurse -Force
  Write-Host "Removed $($target.Path)"
}
