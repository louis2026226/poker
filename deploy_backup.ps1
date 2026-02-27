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

Write-Host "备用环境同步 -> $Server : $RemotePath" -ForegroundColor Cyan

function Invoke-Scp {
    param(
        [string]$Source,
        [string]$Target
    )
    Write-Host "scp $Source -> $Target" -ForegroundColor Yellow
    scp $Source $Target
}

# 同步 public 目录（整目录上传）
Invoke-Scp -Source "`"$LocalRoot\public\*`"" -Target "$Server:`"$RemotePath/public/`""

# 同步 server.js
Invoke-Scp -Source "`"$LocalRoot\server.js`"" -Target "$Server:`"$RemotePath/server.js`""

# 同步 pokerAI.js（如存在）
if (Test-Path "$LocalRoot\pokerAI.js") {
    Invoke-Scp -Source "`"$LocalRoot\pokerAI.js`"" -Target "$Server:`"$RemotePath/pokerAI.js`""
}

# 同步 package.json（可选：确保依赖版本一致）
if (Test-Path "$LocalRoot\package.json") {
    Invoke-Scp -Source "`"$LocalRoot\package.json`"" -Target "$Server:`"$RemotePath/package.json`""
}

Write-Host "远程重启 pm2 应用 $Pm2Name ..." -ForegroundColor Yellow
ssh $Server "cd $RemotePath && pm2 restart $Pm2Name"

Write-Host "✅ 备用环境同步完成。" -ForegroundColor Green

