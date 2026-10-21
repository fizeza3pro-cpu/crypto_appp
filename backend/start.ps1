$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nativeToolchain = 'C:\msys64\ucrt64\bin'
if ((Test-Path -LiteralPath (Join-Path $nativeToolchain 'libcrypto-3-x64.dll')) -and
    ($env:PATH -split ';') -notcontains $nativeToolchain) {
    $env:PATH = $nativeToolchain + ';' + $env:PATH
}
$pythonCandidates = @('.venv\Scripts\python.exe', '.venv\bin\python.exe')
$backendPython = $pythonCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $backendPython) { throw 'Python environment missing. Follow README.md to create .venv.' }
$nativeBinary = 'build\crypto-cli.exe'
$needsBuild = -not (Test-Path -LiteralPath $nativeBinary)
if (-not $needsBuild) {
    $binaryTimestamp = (Get-Item -LiteralPath $nativeBinary).LastWriteTimeUtc
    $needsBuild = @(Get-ChildItem -LiteralPath 'native' -File | Where-Object { $_.LastWriteTimeUtc -gt $binaryTimestamp }).Count -gt 0
}
if ($needsBuild) {
    & $backendPython scripts\build.py
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $backendPython run.py
exit $LASTEXITCODE
