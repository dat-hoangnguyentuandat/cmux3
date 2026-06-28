# Builds the cmux3 launcher (plus the web host + CLI) and puts "cmux3" on PATH.
#
#   ./install.ps1            # build Release, install for current user
#   ./install.ps1 -NoBuild   # skip build, just (re)install PATH entry
#
# After install, open a new terminal and run:  cmux3
param([switch]$NoBuild)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not $NoBuild) {
  Write-Host "Building cmux3 (launcher + web host + CLI)..." -ForegroundColor Cyan
  # Build the SPA so the web host can serve the UI.
  Push-Location "$root/web"
  try {
    if (-not (Test-Path "$root/web/node_modules")) { npm install }
    npm run build
  } finally { Pop-Location }

  dotnet publish "$root/server/Cmux.Launcher/Cmux.Launcher.csproj" -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "$root/dist" | Out-Host
  dotnet publish "$root/server/Cmux.Web/Cmux.Web.csproj"           -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "$root/dist" | Out-Host
  dotnet publish "$root/server/Cmux.Cli/Cmux.Cli.csproj"           -c Release -r win-x64 --self-contained true -p:PublishSingleFile=false -o "$root/dist" | Out-Host
}

$dist = Join-Path $root "dist"
if (-not (Test-Path (Join-Path $dist "cmux3.exe"))) {
  throw "cmux3.exe not found in $dist. Run without -NoBuild first."
}

# Add the dist folder to the user PATH if it is not already there.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $dist) {
  $newPath = if ([string]::IsNullOrEmpty($userPath)) { $dist } else { "$userPath;$dist" }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Write-Host "Added $dist to your user PATH." -ForegroundColor Green
} else {
  Write-Host "$dist already on PATH." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Done. Open a NEW terminal and run:  cmux3" -ForegroundColor Green

