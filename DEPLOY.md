# 部署与同步说明

## 一、推荐：配置 SSH 密钥（一次性，之后不用输密码）

### 1. 在本机生成密钥（若已有 `~/.ssh/id_rsa.pub` 可跳过）

在 **PowerShell** 中执行：

```powershell
ssh-keygen -t rsa -b 4096 -f "$env:USERPROFILE\.ssh\id_rsa" -N '""'
```

（直接回车则无密码，或输入密码短语）

### 2. 把公钥放到服务器

**方式 A：用 ssh-copy-id（若已安装 Git for Windows，可用）**

```powershell
type $env:USERPROFILE\.ssh\id_rsa.pub | ssh admin@47.83.184.190 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

会提示输入一次服务器密码，成功后以后 scp/ssh 不再要密码。

**方式 B：手动粘贴（适合阿里云等）**

1. 本机查看公钥并复制全文：
   ```powershell
   type $env:USERPROFILE\.ssh\id_rsa.pub
   ```
2. 用阿里云「远程连接」登录服务器，执行：
   ```bash
   mkdir -p ~/.ssh
   chmod 700 ~/.ssh
   nano ~/.ssh/authorized_keys
   ```
3. 把本机复制的公钥粘贴进去，保存退出。
4. 执行：`chmod 600 ~/.ssh/authorized_keys`

### 3. 测试免密登录

```powershell
ssh admin@47.83.184.190
```

能直接登录则配置成功。

---

## 二、一键同步（部署脚本）

配置好 SSH 密钥后，在项目目录 **tla** 下执行：

```powershell
.\deploy.ps1
```

会同步 `public/` 下所有文件和 `server.js` 到服务器。  
若服务器用户/路径不同，可指定：

```powershell
.\deploy.ps1 -Server "admin@47.83.184.190" -RemotePath "/home/admin/poker"
```

同步后在服务器执行重启：

```bash
cd /home/admin/poker && pm2 restart louis-poker
```

若希望脚本自动重启，可编辑 `deploy.ps1`，取消最后两行注释。

---

## 三、可选：用 Git 同步（服务器需能访问你的仓库）

1. 在服务器上项目目录拉取最新代码：
   ```bash
   cd /home/admin/poker
   git pull
   pm2 restart louis-poker
   ```
2. 本机改完代码后先提交并推送到远程（GitHub/GitLab 等），再在服务器执行上面两条命令。

适合多人协作或已有 Git 流程时使用。
