$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "[1/4] التحقق من node_modules..."
if (-not (Test-Path -Path "node_modules")) {
  Write-Host "node_modules غير موجود. يتم تنفيذ npm install..."
  npm install
}

Write-Host "[2/4] التحقق من seed script..."
$pkg = Get-Content -Raw -Path "package.json" | ConvertFrom-Json
if ($pkg.scripts.PSObject.Properties.Name -contains 'seed') {
  Write-Host "تشغيل npm run seed..."
  npm run seed
}

Write-Host "[3/4] فتح المتصفح..."
Start-Process "http://localhost:3000"

Write-Host "[4/4] تشغيل التطبيق..."
npm start