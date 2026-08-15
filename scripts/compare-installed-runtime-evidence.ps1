[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string]$BeforePath,
  [Parameter(Mandatory)] [string]$AfterPath
)

$ErrorActionPreference = 'Stop'
$before = Get-Content -LiteralPath $BeforePath -Raw | ConvertFrom-Json
$after = Get-Content -LiteralPath $AfterPath -Raw | ConvertFrom-Json
$beforePaths = @{}
foreach ($group in $before.monitored.PSObject.Properties) { foreach ($item in $group.Value) { $beforePaths[$item.Path] = $true } }
$allowedRoots = @($after.allowed.installedApplication, $after.allowed.userData, $after.allowed.updaterTemp | ForEach-Object { Split-Path -Parent $_.Path } | Where-Object { $_ } | Sort-Object -Unique)
$unexpected = @()
foreach ($group in $after.monitored.PSObject.Properties) {
  foreach ($item in $group.Value) {
    $allowed = $allowedRoots | Where-Object { $item.Path.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) }
    if (!$beforePaths.ContainsKey($item.Path) -and !$allowed) { $unexpected += $item.Path }
  }
}
if ($unexpected.Count -gt 0) {
  $unexpected | ForEach-Object { Write-Error "Unexpected normal-run file: $_" }
  throw 'Normal runtime created files outside the installer, AppData, or updater temporary locations.'
}
Write-Host 'PASS: no monitored Desktop/Documents/source/home-root files were created by normal runtime.'
