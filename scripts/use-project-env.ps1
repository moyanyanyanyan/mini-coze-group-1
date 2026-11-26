# Dot-source this script: . ./scripts/use-project-env.ps1
# Versions follow feature/gyt/addParsingType's README/.nvmrc and packageManager.
$miniCozeTools = Join-Path $env:LOCALAPPDATA 'minicoze-tools'
$miniCozeNode = Join-Path $miniCozeTools 'node-26.13.1/package/bin'
$miniCozePnpm = Join-Path $miniCozeTools 'pnpm-12.9.1/package/pnpm-native.exe'
if (!(Test-Path -LiteralPath (Join-Path $miniCozeNode 'node.exe')) -or
    !(Test-Path -LiteralPath $miniCozePnpm)) {
    throw 'Install Node 26.13.1 and pnpm 12.9.1 under LOCALAPPDATA/minicoze-tools first; see docs/parsing-merge-2026-11-25.md.'
}
$env:PATH = "$miniCozeNode;$(Join-Path $miniCozeTools 'bin');$env:PATH"
$env:PYTHONUTF8 = '1'
# Workspace-installed esbuild can carry a Low integrity label on Windows.
# Its >1 MiB transform handoff must use scratch files it is allowed to delete.
# Scope permissions to this disposable directory; keep workspace/tool labels intact.
$miniCozeBuildTemp = Join-Path $miniCozeTools 'build-temp'
New-Item -ItemType Directory -Force -Path $miniCozeBuildTemp | Out-Null
$miniCozeSandboxGroup = (Get-Acl $miniCozeBuildTemp).Access |
    Where-Object IdentityReference -like '*\CodexSandboxUsers' |
    Select-Object -First 1 -ExpandProperty IdentityReference
if ($miniCozeSandboxGroup) {
    icacls $miniCozeBuildTemp /grant "${miniCozeSandboxGroup}:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare build scratch permissions.' }
}
icacls $miniCozeBuildTemp /setintegritylevel '(OI)(CI)L' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot set build scratch integrity label.' }
$env:TEMP = $miniCozeBuildTemp
$env:TMP = $miniCozeBuildTemp
node --version
pnpm --version
