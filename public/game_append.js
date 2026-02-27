 i < gameState.players.length; i++) {
    if (gameState.players[i].socketId === mySocketId) {
      myPlayer = gameState.players[i];
      break;
    }
  }
  
  if (!myPlayer) return;
  
  var isMyTurn = gameState.currentPlayerSeat === myPlayer.seat;
  
  if (!isMyTurn) {
    actionText.textContent = '等待其他玩家...';
    disableAllButtons();
    stopActionTimer();
    return;
  }
  
  startActionTimer();
  
  var currentBet = myPlayer.bet || 0;
  var toCall = gameState.currentBet - currentBet;
  
  actionText.textContent = '请选择操作';
  
  foldBtn.disabled = false;
  
  if (toCall === 0) {
    checkBtn.disabled = false;
    checkBtn.style.display = 'inline-block';
    callBtn.disabled = true;
    callBtn.style.display = 'none';
    checkBtn.textContent = '过牌';
  } else {
    checkBtn.disabled = true;
    checkBtn.style.display = 'none';
    callBtn.disabled = false;
    callBtn.style.display = 'inline-block';
    callBtn.textContent = '跟注 ' + toCall;
  }
  
  var minRaise = Math.max(gameState.currentBet * 2, gameState.config.BIG_BLIND);
  var maxRaise = myPlayer.chips + currentBet;
  raiseSlider.min = minRaise;
  raiseSlider.max = maxRaise;
  raiseSlider.value = minRaise;
  raiseAmountDisplay.textContent = minRaise;
  
  raiseBtn.disabled = myPlayer.chips < minRaise;
  allInBtn.disabled = false;
  
  if (toCall > 0 && currentBet === gameState.currentBet) {
    raiseBtn.disabled = true;
  }
}

function disableAllButtons() {
  foldBtn.disabled = true;
  checkBtn.disabled = true;
  callBtn.disabled = true;
  raiseBtn.disabled = true;
  allInBtn.disabled = true;
}

// 更新 AI+1 按钮（仅房主在等待开局时可用）
function updateBotButton(gameState) {
  if (!aiAssistBtn) return;

  const myPlayer = gameState.players.find(function(p) { return p.socketId === mySocketId; });
  if (!myPlayer) {
    aiAssistBtn.disabled = true;
    return;
  }

  const maxSeats = gameState.config && gameState.config.MAX_SEATS ? gameState.config.MAX_SEATS : 5;
  const totalPlayers = gameState.players.length;

  // 只有房主、房间未开始且座位未满时可以添加机器人
  const canAddBot =
    socket.id === gameState.hostId &&
    gameState.gameState === 'waiting' &&
    totalPlayers < maxSeats;

  aiAssistBtn.disabled = !canAddBot;
}

// ============ 倒计时 ============
function startActionTimer() {
  stopActionTimer();
  actionTimeLeft = 10;
  
  var timerEl = document.getElementById('actionTimer');
  var timerText = document.getElementById('timerText');
  var timerProgress = document.querySelector('.timer-progress');
  
  if (timerEl) {
    timerEl.classList.remove('hidden');
  }
  
  actionTimer = setInterval(function() {
    actionTimeLeft--;
    if (timerText) {
      timerText.textContent = actionTimeLeft;
    }
    if (timerProgress) {
      var progress = (actionTimeLeft / 10) * 100;
      timerProgress.style.strokeDashoffset = (100 - progress).toString();
    }
    
    if (actionTimeLeft <= 0) {
      stopActionTimer();
      socket.emit('playerAction', 'fold', 0, function(response) {
        if (!response.success) {
          console.log('自动弃牌:', response.message);
        }
      });
    }
  }, 1000);
}

function stopActionTimer() {
  if (actionTimer) {
    clearInterval(actionTimer);
    actionTimer = null;
  }
  var timerEl = document.getElementById('actionTimer');
  if (timerEl) {
    timerEl.classList.add('hidden');
  }
}

// ============ 表情功能 ============
function setupEmojiButtons() {
  var popupPanel = document.getElementById('emojiPopupPanel');
  if (popupPanel) {
    var emojiBtns = popupPanel.querySelectorAll('.emoji-btn');
    emojiBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var now = Date.now();
        if (now - emojiLastTime < EMOJI_COOLDOWN) {
          return;
        }
        
        var emoji = btn.dataset.emoji;
        socket.emit('emote', emoji);
        emojiLastTime = now;
        
        popupPanel.style.display = 'none';
        
        var myPlayer = null;
        if (currentGameState && currentGameState.players) {
          for (var i = 0; i < currentGameState.players.length; i++) {
            if (currentGameState.players[i].socketId === mySocketId) {
              myPlayer = currentGameState.players[i];
              break;
            }
          }
        }
        if (myPlayer) {
          showEmoji(myPlayer.seat, emoji);
        }
      });
    });
  }
}

function showEmoji(seat, emoji) {
  var seatEl = document.getElementById('seat-' + seat);
  if (!seatEl) return;
  
  var emojiDisplay = document.getElementById('emojiDisplay');
  var popup = document.createElement('div');
  popup.className = 'emoji-popup';
  popup.textContent = emoji;
  
  var rect = seatEl.getBoundingClientRect();
  popup.style.left = (rect.left + rect.width / 2 - 24) + 'px';
  popup.style.top = (rect.top - 20) + 'px';
  
  emojiDisplay.appendChild(popup);
  
  setTimeout(function() {
    popup.remove();
  }, 3000);
}

function toggleEmojiPanel() {
  var panel = document.getElementById('emojiPopupPanel');
  if (panel) {
    if (panel.style.display === 'none') {
      panel.style.display = 'flex';
      setTimeout(function() {
        panel.style.display = 'none';
      }, 3000);
    } else {
      panel.style.display = 'none';
    }
  }
}

// ============ 心跳 ============
function startHeartbeat() {
  setInterval(function() {
    socket.emit('heartbeat');
  }, 5000);
}

// ============ 预览功能 ============
function showBetPreview() {
  var slider = document.getElementById('raiseSlider');
  var previewChips = document.getElementById('previewChips');
  var myPlayer = currentGameState ? currentGameState.players.find(function(p) { return p.socketId === mySocketId; }) : null;
  
  if (!slider || !previewChips || !myPlayer) return;
  
  var betAmount = parseInt(slider.value);
  var currentBet = myPlayer.bet || 0;
  var callAmount = currentGameState ? currentGameState.currentBet - currentBet : 0;
  var totalBet = callAmount + betAmount;
  var remainingChips = myPlayer.chips - totalBet;
  
  previewChips.innerHTML = '下注后剩余: <span class="' + (remainingChips < 0 ? 'text-danger' : 'text-success') + '">' + remainingChips + '</span> 筹码';
}

// ============ 复制房间号 ============
function copyRoomCode() {
  var roomCode = document.getElementById('displayRoomCode').textContent;
  if (roomCode && roomCode !== '-----') {
    navigator.clipboard.writeText(roomCode).then(function() {
      alert('房间号已复制: ' + roomCode);
    }).catch(function() {
      var input = document.createElement('input');
      input.value = roomCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert('房间号已复制: ' + roomCode);
    });
  }
}

// ============ AI建议功能 ============
function requestAISuggestion() {
  if (!aiAssistBtn || !aiSuggestionPanel || !aiSuggestionContent) {
    console.log('AI elements not found');
    return;
  }
  
  // 显示加载状态
  aiAssistBtn.disabled = true;
  aiAssistBtn.classList.add('loading');
  aiAssistBtn.innerHTML = '<span class="ai-icon">🤖</span><span>分析中...</span>';
  
  aiSuggestionPanel.classList.remove('hidden');
  aiSuggestionContent.innerHTML = '<div class="ai-loading"><div class="ai-spinner"></div><span class="ai-loading-text">AI正在分析牌面...</span></div>';
  
  // 请求AI建议
  socket.emit('getAISuggestion', function(response) {
    aiAssistBtn.disabled = false;
    aiAssistBtn.classList.remove('loading');
    aiAssistBtn.innerHTML = '<span class="ai-icon">🤖</span><span>AI建议</span>';
    
    if (response && response.success && response.decision) {
      displayAISuggestion(response.decision);
    } else {
      showAIError(response?.message || '获取建议失败');
    }
  });
}

function displayAISuggestion(decision) {
  var actionText = '';
  var actionClass = '';
  
  switch (decision.action) {
    case 'fold':
      actionText = '弃牌 (Fold)';
      actionClass = 'fold';
      break;
    case 'check':
      actionText = '过牌 (Check)';
      actionClass = 'check';
      break;
    case 'call':
      actionText = '跟注 (Call)';
      actionClass = 'call';
      break;
    case 'raise':
      actionText = '加注 (Raise)';
      actionClass = 'raise';
      break;
    case 'all-in':
      actionText = '全下 (All In)';
      actionClass = 'all-in';
      break;
    default:
      actionText = decision.action || '过牌';
      actionClass = 'check';
  }
  
  var reasoning = decision.reasoning || 'AI基于当前牌面分析得出的建议';
  
  var html = '<div class="ai-action-result">' +
    '<div class="ai-action-label">建议动作</div>' +
    '<div class="ai-action-value ' + actionClass + '">' + actionText + '</div>' +
    '</div>' +
    '<div class="ai-reasoning">' + reasoning + '</div>' +
    '<div style="text-align: center; margin-top: 10px;">' +
    '<button class="btn btn-primary" onclick="applyAISuggestion(\'' + decision.action + '\')">采用建议</button>' +
    '</div>';
  
  if (aiSuggestionContent) {
    aiSuggestionContent.innerHTML = html;
  }
}

function applyAISuggestion(action) {
  console.log('Applying AI suggestion:', action);
  
  // 关闭建议面板
  closeAISuggestion();
  
  // 根据建议执行动作
  switch (action) {
    case 'fold':
      if (foldBtn && !foldBtn.disabled) {
        foldBtn.click();
      }
      break;
    case 'check':
      if (checkBtn && !checkBtn.disabled) {
        checkBtn.click();
      }
      break;
    case 'call':
      if (callBtn && !callBtn.disabled) {
        callBtn.click();
      }
      break;
    case 'raise':
      if (raiseBtn && !raiseBtn.disabled) {
        raiseBtn.click();
      }
      break;
    case 'all-in':
      if (allInBtn && !allInBtn.disabled) {
        allInBtn.click();
      }
      break;
  }
}

function closeAISuggestion() {
  if (aiSuggestionPanel) {
    aiSuggestionPanel.classList.add('hidden');
  }
}

function showAIError(message) {
  if (aiSuggestionContent) {
    aiSuggestionContent.innerHTML = '<div class="ai-error">' + message + '</div>';
  }
  
  // 3秒后自动关闭
  setTimeout(function() {
    closeAISuggestion();
  }, 3000);
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing...');
  initDOMElements();
  loadNickname();
  setupEventListeners();
  setupEmojiButtons();
  startHeartbeat();
  showPage('lobby');
  console.log('Initialization complete');
});
