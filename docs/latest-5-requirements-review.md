# 最近 5 条需求梳理与逻辑核对

## 一、5 条需求摘要

| # | 需求 | 实现要点 |
|---|------|----------|
| 1 | 主界面筹码增加时做滚动数字效果 | 大厅/主界面筹码增加时（包括本局结束、获取筹码）用 `animateStatChips` 滚动到目标值 |
| 2 | 房间内：离开→「离开」，左侧绿色「结算」；点结算暂停游戏并弹结算界面 | 按钮文案与布局；`requestSettlement` → 服务端只暂停不结束，广播 `gamePaused`，所有人弹窗 |
| 3 | 结算界面：暂停+实时输赢、「再来一局」→「恢复游戏」、布局优化 | 表格三列、标题/副标题、操作记录折叠；恢复游戏按钮；弹窗打开时用 `gameState`/`roomUpdate` 刷新筹码 |
| 4 | 结算只暂停不结束；标题「游戏已暂停」/「游戏已结束」；恢复 vs 再来一局 | `pauseForSettlement` 不摊牌；`_settlementReason` 控制标题；暂停时 `resumeGame`，结束时 `restartGame` |
| 5 | 玩家 A 点结算后，所有玩家同时弹结算界面，标题为「玩家A暂停游戏」 | 服务端 `gamePaused` 带 `pausedBy`，客户端 `_pausedByNickname` 拼标题 |

---

## 二、逻辑是否冲突

- **结算 vs 结束**：已明确拆分。点「结算」只走 `pauseForSettlement`（不调用 `settleNow`），不摊牌、不结束本局；有人破产等才走 `emitGameOver` → `gameOver`，标题「游戏已结束」。无冲突。
- **恢复 vs 再来一局**：按 `_settlementReason` 分支——`paused` 发 `resumeGame`（只清 `paused`），`ended` 发 `restartGame`（可开始下一局）。服务端 `restartGame` 在 `room.paused` 时直接报错，避免误用。无冲突。
- **全房间同时弹窗**：`gamePaused` 用 `io.to(roomCode).emit`，房间内所有人（含点击结算的人）同时收到并弹窗，标题用 `pausedBy` 显示「某某暂停游戏」。无冲突。
- **双端 paused 一致**：服务端 `paused` 置位后禁止 `playerAction`、`nextAction`、机器人回合；客户端 `gameState.paused` 时禁用操作按钮、隐藏行动计时器、不启动倒计时。无冲突。

**结论：未发现逻辑冲突。**

---

## 三、代码是否已精确执行

### 需求 1：主界面筹码滚动

- `animateStatChips(fromVal, toVal)` 已实现（game.js）。
- `updatePlayerStatsDisplay(opts)` 支持 `chipsAnimate/chipsFrom/chipsTo`，在 `updatePlayerChips` 和 `finishGame` 中，当筹码增加时传入并触发滚动。
- **结论：已按需求实现。**

### 需求 2：离开 + 绿色结算，点结算暂停并弹窗

- index.html：`leaveRoomBtn` 文案「离开」，左侧 `settlementBtn` 绿色「结算」。
- game.js：`settlementBtn` 点击 `socket.emit('requestSettlement')`。
- server.js：`requestSettlement` 只调用 `room.pauseForSettlement(pausedByNickname)`，不调用 `settleNow()`；`pauseForSettlement` 置 `paused`、发 `gamePaused` + `gameState`。
- **结论：已按需求实现。**

### 需求 3：结算界面（暂停+实时、恢复游戏、布局）

- 表格三列（玩家/本局输赢/当前筹码）、副标题、操作记录 `<details>`、`resumeGameBtn` 文案「恢复游戏」已存在。
- 实时刷新：`refreshSettlementModalIfOpen` 在收到 `gameState`/`roomUpdate` 时更新列表；原先仅在 `gameState === 'ended' || 'waiting'` 时刷新，**暂停时 `gameState` 仍为 preflop/flop 等导致不刷新，已修复为「暂停时也刷新」**（`gameState.paused` 时同样进入刷新逻辑）。
- **结论：已按需求实现，并修复暂停下的实时刷新。**

### 需求 4：只暂停不结束、标题、恢复/再来一局

- 服务端：仅 `pauseForSettlement`，不摊牌；`emitGameOver` 仅在有破产等时由 `emitGameOverIfBust` 触发。
- 客户端：`setSettlementModalTitle()` 根据 `_settlementReason` 显示「游戏已结束」或「某某暂停游戏」；`resumeGameBtn` 根据 `_settlementReason === 'paused'` 发 `resumeGame` 否则发 `restartGame`。
- 服务端：`resumeGame` 清 `paused` 并广播 `gameState`；`restartGame` 在 `room.paused` 时返回错误。
- **结论：已按需求实现。**

### 需求 5：全房间同时弹窗、标题「玩家A暂停游戏」

- 服务端：`requestSettlement` 取当前玩家昵称传入 `pauseForSettlement(pausedByNickname)`，`gamePaused`  payload 含 `pausedBy: pausedByNickname`。
- 客户端：`gamePaused` 里设置 `_pausedByNickname = data.pausedBy`，`setSettlementModalTitle()` 在暂停时显示 `(_pausedByNickname || '有人') + '暂停游戏'`。
- **结论：已按需求实现。**

---

## 四、本次修复

- **refreshSettlementModalIfOpen**：原条件 `gameState.gameState !== 'ended' && gameState.gameState !== 'waiting'` 在暂停时（state 仍为 preflop/flop 等）会直接 return，导致暂停期间不刷新。已改为在 **`gameState.paused` 为 true 时也执行刷新**，保证「结算界面打开时实时显示当前玩家输赢」在暂停场景下也生效。

---

## 五、小结

- 5 条需求的逻辑已全部落地，未发现冲突。
- 代码行为与需求一致；唯一补丁为：**暂停状态下结算弹窗的实时刷新**（`refreshSettlementModalIfOpen` 在 `paused` 时也刷新列表）。
