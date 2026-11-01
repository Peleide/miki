# Mise en production : appli historique (branche main) a la racine + GMAO (branche gmao) sous /csp/.
# Usage : .\scripts\deploy-prod.ps1            (build seulement, dans dist/)
#         .\scripts\deploy-prod.ps1 -Deploy    (build puis deploiement Firebase)
param([switch]$Deploy, [string]$MainRef = "origin/main")
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$work = Join-Path (Split-Path -Parent $repo) "miki-main-build"
Set-Location $repo
git fetch -q origin

# 1. Appli historique, telle qu'elle est en prod aujourd'hui
if (Test-Path $work) { git worktree remove --force $work 2>$null; if (Test-Path $work) { Remove-Item -Recurse -Force $work } }
git worktree prune
git worktree add --detach $work $MainRef | Out-Null
Get-ChildItem -Path $repo -Filter ".env*" -File -ErrorAction SilentlyContinue | Copy-Item -Destination $work
Push-Location $work
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci (main) a echoue" }
npx vite build --outDir (Join-Path $repo "dist") --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "build main a echoue" }
Pop-Location

# 2. GMAO sous /csp/
$env:VITE_BASE = "/csp/"
npx vite build --outDir (Join-Path $repo "dist\csp") --emptyOutDir
if ($LASTEXITCODE -ne 0) { throw "build gmao a echoue" }
Remove-Item Env:\VITE_BASE
$manifestPath = Join-Path $repo "dist\csp\manifest.json"
$m = Get-Content $manifestPath -Raw | ConvertFrom-Json
$m.name = "MIKI - Maintenance"; $m.start_url = "/csp/"; $m | Add-Member -NotePropertyName scope -NotePropertyValue "/csp/" -Force
$m.icons | ForEach-Object { $_.src = "/csp/logo.png" }
[IO.File]::WriteAllText($manifestPath, ($m | ConvertTo-Json -Depth 5))

# 3. Fonctions
Push-Location (Join-Path $repo "functions")
npm run build
if ($LASTEXITCODE -ne 0) { throw "build functions a echoue" }
Pop-Location

Write-Host "Racine :" (Select-String -Path (Join-Path $repo "dist\index.html") -Pattern 'assets/index-[^"]+\.js' | ForEach-Object { $_.Matches.Value })
Write-Host "/csp/  :" (Select-String -Path (Join-Path $repo "dist\csp\index.html") -Pattern 'csp/assets/index-[^"]+\.js' | ForEach-Object { $_.Matches.Value })

if ($Deploy) {
  # Uniquement les fonctions GMAO : les fonctions historiques en prod restent celles de main.
  $fns = "gmaoAction,gmaoPublic,gmaoDailyPreventiveScan,gmaoCreateOrganization,gmaoSetPlan,gmaoManageUser" -split "," | ForEach-Object { "functions:$_" }
  firebase deploy --project miki-suivi-materiel --only ("firestore:rules,hosting," + ($fns -join ","))
  if ($LASTEXITCODE -ne 0) { throw "deploiement echoue" }
}
