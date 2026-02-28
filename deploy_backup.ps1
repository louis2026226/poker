param(
    [string]$Server = "admin@47.83.184.190",
    [string]$RemotePath = "/home/admin/poker",
    [string]$Pm2Name = "louis-poker"
)

$ErrorActionPreference = "Stop"
$LocalRoot = $PSScriptRoot

Write-Host "Sync to backup server: $Server : $RemotePath" -ForegroundColor Cyan

$gitSha = git rev-parse --short HEAD 2>$null
if ($gitSha) {
    Set-Content -Path "$LocalRoot\.version" -Value $gitSha.Trim() -NoNewline
    Write-Host "Version: $gitSha" -ForegroundColor Gray
}

Write-Host "scp public/* -> server" -ForegroundColor Yellow
scp "$LocalRoot\public\*" "${Server}:${RemotePath}/public/"

Write-Host "scp server.js -> server" -ForegroundColor Yellow
scp "$LocalRoot\server.js" "${Server}:${RemotePath}/server.js"

if (Test-Path "$LocalRoot\.version") {
    scp "$LocalRoot\.version" "${Server}:${RemotePath}/.version"
}
if (Test-Path "$LocalRoot\pokerAI.js") {
    scp "$LocalRoot\pokerAI.js" "${Server}:${RemotePath}/pokerAI.js"
}
if (Test-Path "$LocalRoot\package.json") {
    scp "$LocalRoot\package.json" "${Server}:${RemotePath}/package.json"
}

Write-Host "Restart pm2: $Pm2Name" -ForegroundColor Yellow
ssh $Server "cd $RemotePath && pm2 restart $Pm2Name"

Write-Host "Done." -ForegroundColor Green
