<#  fix-w3.ps1  ───────────────────────────────────────────────
    • Removes any old w3 / w3cli installs
    • Installs @web3-storage/w3up-cli
    • Sets the Pixel-Ninja space as current
    • Creates backend.ucan delegate token
#>

$SPACE_DID   = 'did:key:z6Mkg9BYjDqdY6RFUsFcmTZ5vm3EQRvb1Geimx5DysJ1L6NY'
$UCAN_FILE   = 'backend.ucan'
$DELEGATE    = 'backend'
$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host '=== Cleaning old w3 binaries ===' -ForegroundColor Cyan
npm uninstall -g @web3-storage/w3cli 2>$null | Out-Null
npm uninstall -g @web3-storage/w3up-cli 2>$null | Out-Null

$shim = Join-Path $env:APPDATA 'npm'
Get-ChildItem $shim -Filter 'w3*' -Force -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host '=== Installing @web3-storage/w3up-cli ===' -ForegroundColor Cyan
npm install -g @web3-storage/w3up-cli --silent

$ver = (& w3 --version) -join ''
if ($ver -notmatch '@web3-storage\/w3up-cli') {
  Write-Error "w3up-cli failed to install: $ver"
  exit 1
}
Write-Host "Installed CLI: $ver" -ForegroundColor Green

Write-Host '=== Setting current space ===' -ForegroundColor Cyan
w3 space set-current $SPACE_DID

Write-Host '=== Creating delegate token ===' -ForegroundColor Cyan
w3 space add-delegate --name $DELEGATE --output $UCAN_FILE
if ((Get-Content $UCAN_FILE).Length -eq 0) {
  Write-Error "$UCAN_FILE is empty. Did you click Authorize in the browser?"
  exit 1
}
Write-Host "Delegate token written to $UCAN_FILE" -ForegroundColor Green

Write-Host ''
Write-Host 'Add the following lines to your .env:' -ForegroundColor Yellow
Write-Host "W3SPACE=$SPACE_DID"
Write-Host "W3UCAN=$(Get-Content $UCAN_FILE)"
Write-Host ''
Write-Host 'Restart backend:  node server.js' -ForegroundColor Cyan
