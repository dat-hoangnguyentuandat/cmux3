# cmux3 remote installer. Downloads the latest release bundle, extracts it to
# %LOCALAPPDATA%\Programs\cmux3 and puts cmux3 on the user PATH.
#
# One-liner:
#   irm https://raw.githubusercontent.com/decolua/cmux3/main/scripts/install.ps1 | iex
#
# Pin a version:
#   $env:CMUX_VERSION="v0.1.0"; irm .../install.ps1 | iex
#
# Override the source repo with $env:CMUX_REPO="owner/name".
$ErrorActionPreference = "Stop"

$repo    = if ($env:CMUX_REPO)    { $env:CMUX_REPO }    else { "decolua/cmux3" }
$version = if ($env:CMUX_VERSION) { $env:CMUX_VERSION } else { "latest" }
$runtime = "win-x64"
$asset   = "cmux3-$runtime.zip"
$dest    = Join-Path $env:LOCALAPPDATA "Programs\cmux3"

Write-Host "Installing cmux3 from $repo ($version)..." -ForegroundColor Cyan

# Resolve the download URL via the GitHub API.
$headers = @{ "User-Agent" = "cmux3-installer"; "Accept" = "application/vnd.github+json" }
if ($version -eq "latest") {
  $api = "https://api.github.com/repos/$repo/releases/latest"
} else {
  $api = "https://api.github.com/repos/$repo/releases/tags/$version"
}

try {
  $release = Invoke-RestMethod -Uri $api -Headers $headers
} catch {
  throw "Could not query GitHub releases for $repo. $($_.Exception.Message)"
}

$dl = ($release.assets | Where-Object { $_.name -eq $asset } | Select-Object -First 1).browser_download_url
if (-not $dl) {
  throw "Release '$($release.tag_name)' has no asset named '$asset'."
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "cmux3-$([guid]::NewGuid().ToString('N')).zip"
Write-Host "Downloading $asset ..." -ForegroundColor DarkGray
Invoke-WebRequest -Uri $dl -OutFile $tmp -Headers @{ "User-Agent" = "cmux3-installer" }

# Stop a running instance so we can overwrite files.
Get-Process cmux3 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 300

if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host "Extracting to $dest ..." -ForegroundColor DarkGray
Expand-Archive -Path $tmp -DestinationPath $dest -Force
Remove-Item -Force $tmp

if (-not (Test-Path (Join-Path $dest "cmux3.exe"))) {
  throw "Install failed: cmux3.exe not found in $dest"
}

# Add to user PATH if missing.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (($userPath -split ";") -notcontains $dest) {
  $newPath = if ([string]::IsNullOrEmpty($userPath)) { $dest } else { "$userPath;$dest" }
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  $env:Path = "$env:Path;$dest"
  Write-Host "Added $dest to your user PATH." -ForegroundColor Green
}

$ver = & (Join-Path $dest "cmux3.exe") version
Write-Host ""
Write-Host "Installed $ver" -ForegroundColor Green
Write-Host "Open a NEW terminal and run:  cmux3" -ForegroundColor Green
