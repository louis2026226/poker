# 部署与同步说明

**重要：** 本地/仓库的修改**不会自动**更新到服务器或 Railway，需要您自己执行部署（见下方「一键同步」或 Git push / Railway 自动部署）。部署后主页版本标签会显示 `package.json` 的 `version`（如 1.0.2）；若仍显示 `742f26e` 等 commit 短码，说明线上仍是旧代码，请重新部署。

**为什么 Cursor 里执行 `git push` 会失败？**  
推送用的是 SSH（`git@github.com:...`）。在 Cursor 自动化/代理终端里执行命令时，用的是**该环境的 Shell**，通常**拿不到你本机已登录的 SSH 密钥**（或 ssh-agent），所以连 GitHub 时会在 22 端口被关闭，报 `Connection closed by ... port 22`。你本机 PowerShell/CMD 里「Railway 和 GitHub 都正常连接」是因为那里才加载了你的密钥。因此 **Railway 部署需要你在本机终端执行一次 `git push origin main`**；阿里云部署可由 Cursor 执行 `deploy_backup.ps1`（脚本里用的是你本机配置的到阿里云的 SSH）。

### 部署到 Railway（请在本机终端执行）

在**您自己的** PowerShell 或 CMD 中（不要在 Cursor 的自动化终端里）执行：

```powershell
cd C:\Users\Administrator\.cursor\worktrees\louis-poker-git\poker-repo
git push origin main
```

推送成功后，Railway 会自动从 GitHub 拉取并部署。若仓库绑定的分支不是 `main`，把 `main` 改成对应分支名。

---

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
