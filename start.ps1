# Builds the SPA into wwwroot and runs the single web host (5201).
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Push-Location "$root/web"; npm run build; Pop-Location
dotnet run --project "$root/server/Cmux.Web/Cmux.Web.csproj" --urls http://localhost:5201
