$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Push-Location -LiteralPath (Join-Path $projectRoot 'frontend')
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }

$running = $false
$backendResponding = $false
try {
    $health = Invoke-RestMethod 'http://127.0.0.1:8080/api/v1/health' -TimeoutSec 3
    $backendResponding = $health.native_ready -eq $true
    if ($backendResponding -and $health.version -ne '2.0.0') {
        throw 'A previous backend version is running. Stop it with Ctrl+C and run start-web.ps1 again.'
    }
    $page = Invoke-WebRequest 'http://127.0.0.1:8080/' -UseBasicParsing -TimeoutSec 3
    $running = $health.native_ready -eq $true -and $health.version -eq '2.0.0' -and $page.Content.Contains('id="root"')
} catch { }
if ($backendResponding -and -not $running) {
    throw 'An older backend is running on port 8080. Stop it with Ctrl+C, then run start-web.ps1 again.'
}
Write-Host 'Crypto App: http://127.0.0.1:8080'
if ($running) {
    Write-Host 'The existing local backend is already serving this web app.'
} else {
    Push-Location -LiteralPath (Join-Path $projectRoot 'backend')
    try { & .\start.ps1 } finally { Pop-Location }
}
