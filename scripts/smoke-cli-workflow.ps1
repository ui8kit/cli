param(
  [int]$Port = 4173
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

$registryUrl = "http://127.0.0.1:$Port/r"
$serverDir = Join-Path $rootDir ".workflow/registry"
$coreDir = Join-Path $rootDir ".workflow/ui8kit-core"
$appDir = Join-Path $rootDir ".workflow/vite-app"
$registryOutput = Join-Path $rootDir ".workflow/registry/r"
$server = $null

function Write-Step($text) {
  Write-Host "==> $text" -ForegroundColor Cyan
}

function Stop-Server($proc) {
  if ($null -ne $proc -and -not $proc.HasExited) {
    Write-Step "Stopping local registry server..."
    Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
  }
}

try {
  Write-Step "Installing dependencies (if needed)"
  & npm install

  Write-Step "Building CLI"
  & npm run build

  Write-Step "Scanning registry source"
  & node dist/index.js --cwd $coreDir scan --source src --output src/registry.json

  Write-Step "Rebuilding local registry artifacts"
  if (Test-Path $registryOutput) {
    Remove-Item -Recurse -Force $registryOutput
  }
  & node dist/index.js --cwd $coreDir build src/registry.json --output ../registry/r

  Write-Step "Starting local registry server on port $Port"
  $pythonCommand = "python"
  if (-not (Get-Command "python" -ErrorAction SilentlyContinue) -and (Get-Command "python3" -ErrorAction SilentlyContinue)) {
    $pythonCommand = "python3"
  }
  if (-not (Get-Command $pythonCommand -ErrorAction SilentlyContinue)) {
    Write-Error "python/python3 not found. Install Python to start the local registry server."
    throw
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $pythonCommand
  $startInfo.Arguments = "-m http.server $Port --directory `"$serverDir`""
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true
  $server = New-Object System.Diagnostics.Process
  $server.StartInfo = $startInfo
  [void]$server.Start()
  Start-Sleep -Seconds 1

  Write-Step "Running init against local registry"
  & node dist/index.js --cwd $appDir init --yes --registry-url $registryUrl --strict-cdn

  Write-Step "Installing all components"
  & node dist/index.js --cwd $appDir add --all --registry-url $registryUrl --strict-cdn --registry ui

  Write-Step "Running smoke checks"
  & node dist/index.js --cwd $appDir info --json
  & node dist/index.js --cwd $appDir list --json --registry-url $registryUrl --strict-cdn
  & node dist/index.js --cwd $appDir diff --json --registry-url $registryUrl --strict-cdn
  & node dist/index.js --cwd $appDir add button --dry-run --registry-url $registryUrl --strict-cdn
  & node scripts/get-cdn.js --url $registryUrl --path components/variants/index.json

  Write-Step "Cleaning cache and resetting app state"
  & node dist/index.js --cwd $appDir cache clear
  & node dist/index.js --cwd $appDir reset --yes

  Write-Step "Smoke workflow completed"
} finally {
  Stop-Server $server
}
