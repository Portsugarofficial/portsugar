param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('Save','Verify')]
  [string]$Mode,
  [string]$BaselinePath = 'migration/frontend-sha256-baseline.txt'
)
$ErrorActionPreference = 'Stop'
$protected = @(
  'index.html',
  'about.html',
  'contact.html',
  'privacy-policy.html',
  'terms-of-use.html',
  'assets/styles.css',
  'favicon.ico'
)
$assetRoot = Join-Path (Get-Location) 'assets'
if (Test-Path $assetRoot) {
  $protected += Get-ChildItem -Path $assetRoot -File -Recurse | ForEach-Object {
    [System.IO.Path]::GetRelativePath((Get-Location).Path, $_.FullName).Replace('\','/')
  }
}
$protected = $protected | Sort-Object -Unique
$hashes = foreach ($relative in $protected) {
  if (-not (Test-Path -LiteralPath $relative -PathType Leaf)) {
    throw "Protected file is missing: $relative"
  }
  $fileHash = Get-FileHash -LiteralPath $relative -Algorithm SHA256
  "$($fileHash.Hash.ToLowerInvariant())  $relative"
}
$baselineDir = Split-Path -Parent $BaselinePath
if ($baselineDir -and -not (Test-Path $baselineDir)) {
  New-Item -ItemType Directory -Path $baselineDir -Force | Out-Null
}
if ($Mode -eq 'Save') {
  $hashes | Set-Content -LiteralPath $BaselinePath -Encoding ascii
  Write-Host "Saved SHA-256 baseline for $($hashes.Count) protected files to $BaselinePath"
  Write-Host 'Save this baseline before backend work. Do not regenerate it after changes.'
  exit 0
}
if (-not (Test-Path -LiteralPath $BaselinePath -PathType Leaf)) {
  throw "Baseline not found: $BaselinePath. Run -Mode Save on the approved original checkout first."
}
$expected = Get-Content -LiteralPath $BaselinePath | Where-Object { $_.Trim() }
$expectedMap = @{}
foreach ($line in $expected) {
  if ($line -match '^([0-9a-fA-F]{64})\s+(.+)$') { $expectedMap[$Matches[2]] = $Matches[1].ToLowerInvariant() }
}
$currentMap = @{}
foreach ($line in $hashes) {
  if ($line -match '^([0-9a-fA-F]{64})\s+(.+)$') { $currentMap[$Matches[2]] = $Matches[1].ToLowerInvariant() }
}
$problems = @()
foreach ($path in $expectedMap.Keys) {
  if (-not $currentMap.ContainsKey($path)) { $problems += "MISSING: $path"; continue }
  if ($expectedMap[$path] -ne $currentMap[$path]) { $problems += "CHANGED: $path" }
}
foreach ($path in $currentMap.Keys) {
  if (-not $expectedMap.ContainsKey($path)) { $problems += "UNEXPECTED PROTECTED FILE: $path" }
}
if ($problems.Count) {
  $problems | ForEach-Object { Write-Error $_ }
  throw "Frontend freeze verification FAILED."
}
Write-Host "PASS: SHA-256 matches for $($currentMap.Count) protected files."
