<#  setup-w3up.ps1  ─────────────────────────────────────────────
    • Cleans old w3cli
    • Installs @web3-storage/w3up-cli
    • Sets current space
    • Exports backend delegate UCAN → backend.ucan
#>

$ErrorActionPreference = 'Stop'   # bail on first error

# ─── CONFIG ────────────────────────────────────────────────────
$SPACE_DID = 'did:key:z6Mkg9BYjDqdY6RFUsFcmTZ5vm3EQRvb1Geimx5DysJ1L6NY'
$DELEGATE_NAME = 'backend'
$UCAN_FILE = 'backend.ucan'

Write-Host "`n🚿  Uninstalling any old w3cli…" -f Cyan
npm uninstall -g @web3-storage/w3cli 2>$null | Out-Null

Write-Host "🧹  Deleting leftover w3* shims…" -f Cyan
$npmPath = Join-Path $env:APPDATA 'npm'
Get-ChildItem $npmPath -Filter 'w3*' -Force -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$npmPath\node_modules\@web3-storage\w3cli" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "⬇️  Installing @web3-storage/w3up-cli …" -f Cyan
npm install -g @web3-storage/w3up-cli --silent

# Verify install
$w3Ver = (& w3 --version) -join ''
if ($w3Ver -notmatch '@web3-storage\/w3up-cli') {
  Write-Error "w3up-cli failed to install. Aborting."
  exit 1
}
Write-Host "✅ w3 CLI version: $w3Ver" -f Green

Write-Host "`n📌  Setting current space…" -f Cyan
w3 space set-current $SPACE_DID

Write-Host "🎟  Generating delegate UCAN → $UCAN_FILE" -f Cyan
w3 space add-delegate --name $DELEGATE_NAME > $UCAN_FILE
Write-Host "✅ Delegate token written to $UCAN_FILE" -f Green

Write-Host "`n👉  Next steps:" -f Yellow
Write-Host "   1. Open .env and add / replace the lines:"
Write-Host "      W3SPACE=$SPACE_DID"
Write-Host "      W3UCAN=$(Get-Content $UCAN_FILE)"
Write-Host "   2. Restart your backend:  node server.js`n"
