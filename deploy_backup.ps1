<# 
  备用环境（阿里云）一键同步脚本

  功能：
  - 从本机把以下文件同步到阿里云服务器：
      - public/ 目录下所有静态文件
      - server.js
      - pokerAI.js
      - package.json（如有依赖更新时使用）
  - 同步完成后，在远程执行 pm2 重启应用

  前置要求：
  - 本机已配置好到服务器的 SSH 免密登录（authorized_keys）
  - 服务器上已有项目目录结构（如 /home/admin/poker）

  用法（在项目根目录运行）：
      .\deploy_backup.ps1
      .\deploy_backup.ps1 -Server "admin@47.83.184.190" -RemotePath "/home/admin/poker"
#>

param(
    [string]$Server = "admin@47.83.184.190",
    [string]$RemotePath = "/home/admin/poker",
    [string]$Pm2Name = "louis-poker"
)

$ErrorActionPreference = "Stop"
$LocalRoot = $PSScriptRoot

# 若主仓库 public 下有 button.mp3，先复制到当前 public，保证部署时带上
$MainRepoButton = "C:\Users\Administrator\louis-poker-git\public\button.mp3"
if (Test-Path $MainRepoButton) {
    Copy-Item $MainRepoButton -Destination (Join-Path $LocalRoot "public\button.mp3") -Force
    Write-Host "已从主仓库复制 button.mp3 到当前 public" -ForegroundColor Cyan
}

Write-Host "备用环境同步 -> $Server : $RemotePath" -ForegroundColor Cyan

function Invoke-Scp {
    param(
        [string]$Source,
        [string]$Target
    )
    Write-Host "scp $Source -> $Target" -ForegroundColor Yellow
    & scp $Source $Target
}

$TargetPrefix = $Server + ':"' + $RemotePath
$Src = $LocalRoot + '\public\*'
Invoke-Scp -Source $Src -Target ($TargetPrefix + '/public/"')

Invoke-Scp -Source ($LocalRoot + '\server.js') -Target ($TargetPrefix + '/server.js"')

if (Test-Path "$LocalRoot\pokerAI.js") {
    Invoke-Scp -Source ($LocalRoot + '\pokerAI.js') -Target ($TargetPrefix + '/pokerAI.js"')
}
if (Test-Path "$LocalRoot\package.json") {
    Invoke-Scp -Source ($LocalRoot + '\package.json') -Target ($TargetPrefix + '/package.json"')
}

# 写入并同步版本号（与本地当前 commit 一致），便于在服务器上核对
$gitVersion = ""
if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVersion = & git -C $LocalRoot rev-parse --short HEAD 2>$null
}
if ($gitVersion) {
    Set-Content -Path "$LocalRoot\deploy_version.txt" -Value $gitVersion -NoNewline
    Invoke-Scp -Source ($LocalRoot + '\deploy_version.txt') -Target ($TargetPrefix + '/deploy_version.txt"')
    Write-Host "已同步版本标识: $gitVersion" -ForegroundColor Cyan
}

# 不再在服务器上执行 git reset，避免未 push 时用旧代码覆盖刚 scp 上去的新代码。仅重启应用即可。
Write-Host "远程重启应用 ..." -ForegroundColor Yellow
ssh $Server "cd $RemotePath && pm2 restart $Pm2Name"

Write-Host "Done." -ForegroundColor Green

