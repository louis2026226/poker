#!/usr/bin/env bash

# 简单的一键部署脚本：
# 1. 提交当前代码到 GitHub
# 2. 触发 Railway 从 GitHub 自动部署
#
# 用法（在项目根目录运行）：
#   ./deploy.sh "本次提交说明"
# 如果不传说明，将使用默认提交信息。

set -e

TARGET_BRANCH=${BRANCH:-main}
MSG=${1:-"chore: update poker app"}

echo "目标远程分支：$TARGET_BRANCH"

echo "=== Git 状态 ==="
git status

echo
echo ">>> 添加所有改动到暂存区 ..."
git add .

echo ">>> 提交：$MSG"
git commit -m "$MSG" || echo "（没有改动需要提交或提交失败）"

echo ">>> 推送当前提交到远程 origin/$TARGET_BRANCH ..."
git push origin HEAD:"$TARGET_BRANCH"

echo
echo "✅ 已推送到 GitHub，如已在 Railway 绑定该仓库并开启自动部署，稍等片刻即可完成上线。"

