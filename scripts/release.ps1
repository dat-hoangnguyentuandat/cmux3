# Builds a self-contained cmux3 release bundle for distribution.
#
#   ./scripts/release.ps1                  # -> dist/cmux3-win-x64.zip
#   ./scripts/release.ps1 -Runtime win-x64
#
# The bundle contains cmux3.exe (launcher), cmux-web.exe (host + SPA in
# wwwroot) and cmux.exe (CLI). It needs no .NET runtime or Node on the target
# machine. Upload the resulting zip as a GitHub Release asset.
param(
  [string]$Runtime = "win-x64"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $root "dist/cmux3-$Runtime"
$zip   = Join-Path $root "dist/cmux3-$Runtime.zip"

Write-Host "Building SPA..." -ForegroundColor Cyan
Push-Location "$root/web"
try {
  if (-not (Test-Path "$root/web/node_modules")) { npm ci }
  npm run build
} finally { Pop-Location }

if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$common = @(
  "-c", "Release",
  "-r", $Runtime,
  "--self-contained", "true",
  "-p:PublishSingleFile=false",
  "-o", $stage
)

Write-Host "Publishing web host..." -ForegroundColor Cyan
dotnet publish "$root/server/Cmux.Web/Cmux.Web.csproj" @common | Out-Host

Write-Host "Publishing CLI..." -ForegroundColor Cyan
dotnet publish "$root/server/Cmux.Cli/Cmux.Cli.csproj" @common | Out-Host

Write-Host "Publishing launcher..." -ForegroundColor Cyan
dotnet publish "$root/server/Cmux.Launcher/Cmux.Launcher.csproj" @common | Out-Host

if (-not (Test-Path (Join-Path $stage "cmux3.exe"))) {
  throw "Build failed: cmux3.exe missing from $stage"
}

Write-Host "Zipping bundle..." -ForegroundColor Cyan
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path "$stage/*" -DestinationPath $zip

$size = "{0:N1} MB" -f ((Get-Item $zip).Length / 1MB)
Write-Host ""
Write-Host "Created $zip ($size)" -ForegroundColor Green
Write-Host "Upload it to a GitHub Release, e.g.:" -ForegroundColor DarkGray
Write-Host "  gh release create v0.1.0 `"$zip`" --title v0.1.0 --notes `"cmux3 0.1.0`"" -ForegroundColor DarkGray
