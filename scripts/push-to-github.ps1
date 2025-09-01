# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/push-to-github.ps1 -RepoName stock-mcp-suite -User kanchankapila [-Private $true] [-Token <PAT>]

param(
  [Parameter(Mandatory=$true)][string]$RepoName,
  [string]$User = "kanchankapila",
  [bool]$Private = $true,
  [string]$Token
)

if (-not $Token) { $Token = $env:GITHUB_TOKEN }
if (-not $Token) { Write-Error "Missing GitHub token. Pass -Token or set GITHUB_TOKEN."; exit 1 }

$Headers = @{ Authorization = "token $Token"; 'User-Agent' = 'repo-setup-script' }

# Create repo under the authenticated user account
$body = @{ name = $RepoName; private = $Private; has_issues = $true; has_projects = $false; has_wiki = $false; auto_init = $false; default_branch = 'main' } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri "https://api.github.com/user/repos" -Headers $Headers -Body $body
if (-not $resp.clone_url) { Write-Error "Failed to create repo. Response: $($resp | ConvertTo-Json -Depth 5)"; exit 1 }

$remoteUrl = "https://github.com/$User/$RepoName.git"
$authUrl = "https://$User:$Token@github.com/$User/$RepoName.git"

Write-Host "[push] Remote: $remoteUrl"

# Ensure we are in repo root
$gitTop = (git rev-parse --show-toplevel 2>$null)
if (-not $gitTop) { Write-Error "Not inside a git repository"; exit 1 }
Set-Location $gitTop

# Push branches using one-time authenticated URL (avoid saving token in remote)
git push $authUrl main:main
git push $authUrl develop:develop 2>$null

# Set clean remote and upstreams
if (-not (git remote 2>$null | Select-String -SimpleMatch "origin")) {
  git remote add origin $remoteUrl
}
git branch --set-upstream-to=origin/main main 2>$null
git branch --set-upstream-to=origin/develop develop 2>$null

Write-Host "[done] Repo pushed: $remoteUrl"

