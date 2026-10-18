# Puts the sandbox's own Node beside this repository, then hands over to
# sandbox.mjs, which installs everything else. It uses only Windows' own curl
# and tar, so nothing of the machine's own setup is involved.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File runner\bootstrap.ps1

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$sandbox = Join-Path (Split-Path -Parent $repo) 'sandbox'
$pins = Get-Content -Raw (Join-Path $PSScriptRoot 'pins.json') | ConvertFrom-Json
$node = Join-Path $sandbox 'node'
$downloads = Join-Path $sandbox 'downloads'
New-Item -ItemType Directory -Force -Path $node, $downloads | Out-Null
Set-Location $sandbox

if (-not (Test-Path (Join-Path $node 'node.exe'))) {
  $zip = Join-Path $downloads $pins.node.file
  if (-not (Test-Path $zip)) {
    & "$env:SystemRoot\System32\curl.exe" -fsSL --retry 3 -o $zip $pins.node.url
    if ($LASTEXITCODE) { throw "download failed: $($pins.node.url)" }
  }
  if ((Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $pins.node.sha256) { throw "checksum mismatch: $zip" }
  & "$env:SystemRoot\System32\tar.exe" -xf $zip --strip-components 1 -C $node
  if ($LASTEXITCODE) { throw "unpacking failed: $zip" }
}

& (Join-Path $node 'node.exe') (Join-Path $PSScriptRoot 'sandbox.mjs') setup
exit $LASTEXITCODE
