$ErrorActionPreference = "SilentlyContinue"

function Wait-Http($url, $attempts=60, $delayMs=1000) {
  for ($i=0; $i -lt $attempts; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { return $true }
    } catch {}
    Start-Sleep -Milliseconds $delayMs
  }
  return $false
}

function Wait-Tcp($host, $port, $attempts=10, $delayMs=1000) {
  for ($i=0; $i -lt $attempts; $i++) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $iar = $client.BeginConnect($host, $port, $null, $null)
      $ok = $iar.AsyncWaitHandle.WaitOne(1000, $false)
      $client.Close()
      if ($ok) { return $true }
    } catch {}
    Start-Sleep -Milliseconds $delayMs
  }
  return $false
}

Write-Host "[dev-all.ps1] Starting Redis (optional)"
try {
  $redisUrl = $env:REDIS_URL
  if (-not $redisUrl) { $redisUrl = "redis://localhost:6379" }
  $u = [System.Uri]$redisUrl
  $ok = Wait-Tcp $u.Host $u.Port 5 1000
  if ($ok) { Write-Host "[dev-all.ps1] Redis reachable at $redisUrl" }
  else { Write-Warning "[dev-all.ps1] Redis not reachable at $redisUrl. Jobs may not run." }
} catch {}

Write-Host "[dev-all.ps1] Starting server (dev)"
Start-Process -FilePath "npm" -ArgumentList "--prefix", "server", "run", "dev"

Write-Host "[dev-all.ps1] Starting frontend (dev)"
Start-Process -FilePath "npm" -ArgumentList "--prefix", "frontend", "start"

Write-Host "[dev-all.ps1] Starting ML service (uvicorn)"
Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001", "--app-dir", "ml-svc"

Write-Host "[dev-all.ps1] All processes started."

# Health probes
try {
  $server = $env:SERVER_BASE_URL; if (-not $server) { $server = "http://localhost:4010" }
  $ml = $env:ML_BASE_URL; if (-not $ml) { $ml = "http://localhost:5001" }
  $fe = $env:FRONTEND_BASE_URL; if (-not $fe) { $fe = "http://localhost:5173" }
  if (Wait-Http "$server/health" 60 1000) { Write-Host "[dev-all.ps1] Server healthy at $server" } else { Write-Warning "[dev-all.ps1] Server health not confirmed at $server" }
  if (Wait-Http "$ml/models" 30 1000) { Write-Host "[dev-all.ps1] ML healthy at $ml" } else { Write-Warning "[dev-all.ps1] ML health not confirmed at $ml" }
  if (Wait-Http "$fe" 60 1000) { Write-Host "[dev-all.ps1] Frontend responding at $fe" } else { Write-Warning "[dev-all.ps1] Frontend not responding at $fe" }
} catch {}
