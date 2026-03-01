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
