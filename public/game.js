// Louis Poker - 游戏前端逻辑

// ============ 初始化区域 ============
let audioCtx = null;
let mySocketId = null;
let mySeat = -1;
let currentGameState = null;
let actionTimer = null;
let actionTimeLeft = 10;
let emojiLastTime = 0;
const EMOJI_COOLDOWN = 20000;

// 音效系统 - 延迟初始化
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = initAudio();
    if (!ctx) return;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === 'card') {
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);
    } else if (type === 'bet') {
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    } else if (type === 'action') {
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    }
  } catch (e) {
    console.log('Audio error:', e);
  }
}

// Socket.IO 连接
const socket = io();

// 本地存储键
const STORAGE_KEY = 'poker_nickname';
const STATS_KEY = 'poker_player_stats';

// 玩家数据结构
let playerStats = {
  nickname: '',
  chips: 1000,
  gamesPlayed: 0,
  gamesWon: 0,
  winRate: 0
};

// ============ DOM 元素 ============
let lobbyPage, gameRoomPage, nicknameInput, roomCodeInput;
let createRoomBtn, joinRoomBtn, confirmJoinBtn, joinForm;
let displayRoomCode, gameStatus, leaveRoomBtn;
let potAmount, communityCardsEl, currentBetDisplay, dealerButton;
let actionPanel, actionText, foldBtn, checkBtn, callBtn, raiseBtn, allInBtn;
let aiAssistBtn, aiSuggestionPanel, aiSuggestionContent;
let raiseSlider, raiseAmountPanel, raiseAmountDisplay;
let gameOverModal, settlementList, newGameBtn, myCardsEl;

// ============ 初始化函数 ============
function initDOMElements() {
  lobbyPage = document.getElementById('lobby');
  gameRoomPage = document.getElementById('gameRoom');
  nicknameInput = document.getElementById('nickname');
  roomCodeInput = document.getElementById('roomCode');
  createRoomBtn = document.getElementById('createRoomBtn');
  joinRoomBtn = document.getElementById('joinRoomBtn');
  confirmJoinBtn = document.getElementById('confirmJoinBtn');
  joinForm = document.getElementById('joinForm');
  displayRoomCode = document.getElementById('displayRoomCode');
  gameStatus = document.getElementById('gameStatus');
  leaveRoomBtn = document.getElementById('leaveRoomBtn');
  potAmount = document.getElementById('potAmount');
  communityCardsEl = document.getElementById('communityCards');
  currentBetDisplay = document.getElementById('currentBetDisplay');
  dealerButton = document.getElementById('dealerButton');
  actionPanel = document.getElementById('actionPanel');
  actionText = document.getElementById('actionText');
  foldBtn = document.getElementById('foldBtn');
  checkBtn = document.getElementById('checkBtn');
  callBtn = document.getElementById('callBtn');
  raiseBtn = document.getElementById('raiseBtn');
  allInBtn = document.getElementById('allInBtn');
  aiAssistBtn = document.getElementById('ai-assist-btn');
  aiSuggestionPanel = document.getElementById('ai-suggestion-panel');
  aiSuggestionContent = document.getElementById('ai-suggestion-content');
  raiseSlider = document.getElementById('raiseSlider');
  raiseAmountPanel = document.getElementById('raiseAmountPanel');
  raiseAmountDisplay = document.getElementById('raiseAmountDisplay');
  gameOverModal = document.getElementById('gameOverModal');
  settlementList = document.getElementById('settlementList');
  newGameBtn = document.getElementById('newGameBtn');
  myCardsEl = document.getElementById('myCards');
  
  console.log('DOM elements initialized');
  console.log('createRoomBtn:', createRoomBtn);
  console.log('joinRoomBtn:', joinRoomBtn);
}

function loadNickname() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && nicknameInput) {
    nicknameInput.value = saved;
    playerStats.nickname = saved;
  }
  
  const savedStats = localStorage.getItem(STATS_KEY);
  if (savedStats) {
    try {
      playerStats = JSON.parse(savedStats);
    } catch (e) {
      console.log('Failed to load stats');
    }
  }
  updatePlayerStatsDisplay();
}

function saveNickname(nickname) {
  localStorage.setItem(STORAGE_KEY, nickname);
  playerStats.nickname = nickname;
  updatePlayerStatsDisplay();
}

function updatePlayerStatsDisplay() {
  const statsPanel = document.getElementById('playerStats');
  const nicknameEl = document.getElementById('statNickname');
  const chipsEl = document.getElementById('statChips');
  const winRateEl = document.getElementById('statWinRate');
  const gamesEl = document.getElementById('statGames');
  
  if (statsPanel && playerStats.nickname) {
    statsPanel.classList.remove('hidden');
    if (nicknameEl) nicknameEl.textContent = playerStats.nickname;
    if (chipsEl) chipsEl.textContent = playerStats.chips;
    if (winRateEl) winRateEl.textContent = playerStats.winRate + '%';
    if (gamesEl) gamesEl.textContent = playerStats.gamesPlayed;
  }
}

function updatePlayerChips(chips) {
  playerStats.chips = chips;
  localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
  updatePlayerStatsDisplay();
}

function finishGame(won, finalChips) {
  playerStats.gamesPlayed++;
  if (won) {
    playerStats.gamesWon++;
  }
  playerStats.chips = finalChips;
  playerStats.winRate = playerStats.gamesPlayed >= 10 
    ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100) 
    : 0;
  localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
  updatePlayerStatsDisplay();
}

function showPage(page) {
  if (page === 'lobby') {
    lobbyPage.classList.remove('hidden');
    gameRoomPage.classList.add('hidden');
  } else {
    lobbyPage.classList.add('hidden');
    gameRoomPage.classList.remove('hidden');
  }
}

// ============ 事件监听 ============
function setupEventListeners() {
  // 创建房间
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', function() {
      console.log('Create room clicked');
      if (!socket.connected) {
        alert('未连接服务器，请刷新页面重试');
        return;
      }
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        alert('请输入昵称');
        return;
      }
      saveNickname(nickname);
      createRoomBtn.disabled = true;
      createRoomBtn.textContent = '创建中...';
      var timeout = setTimeout(function() {
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = '创建房间';
        alert('请求超时，请检查网络后重试');
      }, 15000);
      socket.emit('createRoom', nickname, function(response) {
        clearTimeout(timeout);
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = '创建房间';
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(response && response.message ? response.message : '创建房间失败');
        }
      });
    });
  }
  
  // 加入房间按钮
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', function() {
      console.log('Join room clicked');
      joinForm.classList.remove('hidden');
    });
  }
  
  // 确认加入
  if (confirmJoinBtn) {
    confirmJoinBtn.addEventListener('click', function() {
      console.log('Confirm join clicked');
      if (!socket.connected) {
        alert('未连接服务器，请刷新页面重试');
        return;
      }
      const nickname = nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim();
      
      if (!nickname || !roomCode) {
        alert('请输入昵称和房间号');
        return;
      }
      
      if (roomCode.length !== 5) {
        alert('请输入5位房间号');
        return;
      }
      
      saveNickname(nickname);
      confirmJoinBtn.disabled = true;
      confirmJoinBtn.textContent = '加入中...';
      var timeout = setTimeout(function() {
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = '确认加入';
        alert('请求超时，请检查房间号与网络后重试');
      }, 15000);
      socket.emit('joinRoom', roomCode, nickname, function(response) {
        clearTimeout(timeout);
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = '确认加入';
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(response && response.message ? response.message : '加入房间失败');
        }
      });
    });
  }
  
  // 离开房间
  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', function() {
      location.reload();
    });
  }
  
  // 再来一局
  if (newGameBtn) {
    newGameBtn.addEventListener('click', function() {
      gameOverModal.classList.add('hidden');
      socket.emit('restartGame', function(response) {
        if (response.success) {
          currentGameState = response.gameState;
          updateGameState(currentGameState);
        }
      });
    });
  }
  
  // 操作按钮
  if (foldBtn) {
    foldBtn.addEventListener('click', function() {
      socket.emit('playerAction', 'fold', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (checkBtn) {
    checkBtn.addEventListener('click', function() {
      socket.emit('playerAction', 'check', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (callBtn) {
    callBtn.addEventListener('click', function() {
      socket.emit('playerAction', 'call', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (raiseBtn) {
    raiseBtn.addEventListener('click', function() {
      const amount = parseInt(raiseSlider.value);
      socket.emit('playerAction', 'raise', amount, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (allInBtn) {
    allInBtn.addEventListener('click', function() {
      socket.emit('playerAction', 'all-in', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  // AI+1 按钮：添加一个机器人玩家
  if (aiAssistBtn) {
    aiAssistBtn.addEventListener('click', function() {
      socket.emit('addBot');
    });
  }
  
  // 滑块数值
  if (raiseSlider) {
    raiseSlider.addEventListener('input', function() {
      raiseAmountDisplay.textContent = this.value;
    });
  }
}

// ============ Socket.IO 事件 ============
socket.on('connect', function() {
  console.log('Connected to server');
});
socket.on('disconnect', function(reason) {
  console.log('Disconnected:', reason);
  if (createRoomBtn) createRoomBtn.disabled = false;
  if (createRoomBtn) createRoomBtn.textContent = '创建房间';
  if (confirmJoinBtn) confirmJoinBtn.disabled = false;
  if (confirmJoinBtn) confirmJoinBtn.textContent = '确认加入';
});
socket.on('connect_error', function(err) {
  console.log('Connect error:', err.message);
  alert('无法连接服务器，请确认地址正确或稍后重试');
});

socket.on('gameState', function(gameState) {
  console.log('Game state received');
  if (gameState.gameState === 'preflop' && (!currentGameState || currentGameState.gameState === 'ended' || currentGameState.gameState === 'waiting')) {
    _lastCommunityCardsLength = 0;
  }
  currentGameState = gameState;
  updateGameState(gameState);
});

socket.on('roomUpdate', function(gameState) {
  console.log('Room update received');
  if (gameState.gameState === 'preflop' && (!currentGameState || currentGameState.gameState === 'ended' || currentGameState.gameState === 'waiting')) {
    _lastCommunityCardsLength = 0;
  }
  currentGameState = gameState;
  updateGameState(gameState);
});

socket.on('playerLeft', function(data) {
  console.log('Player left:', data.nickname);
});

socket.on('hostChanged', function(data) {
  console.log('Host changed:', data.newHostId);
});

socket.on('emote', function(data) {
  showEmoji(data.seat, data.emoji);
});

socket.on('gameOver', function(data) {
  const results = data.results;
  settlementList.innerHTML = '';
  
  results.forEach(function(result) {
    const item = document.createElement('div');
    item.className = 'settlement-item';
    
    if (result.netChange > 0) {
      item.classList.add('winner');
    } else if (result.netChange < 0) {
      item.classList.add('loser');
    }
    
    if (result.nickname === playerStats.nickname) {
      finishGame(result.netChange > 0, result.finalChips);
    }
    
    const netText = result.netChange > 0 ? '+' + result.netChange : result.netChange;
    item.innerHTML = '<span class="settlement-nickname">' + result.nickname + '</span><span class="settlement-amount ' + (result.netChange >= 0 ? 'positive' : 'negative') + '">' + netText + '</span>';
    settlementList.appendChild(item);
  });
  
  gameOverModal.classList.remove('hidden');
});

// ============ 游戏逻辑 ============
function updateGameState(gameState) {
  updateGameStatus(gameState);
  potAmount.textContent = gameState.pot;
  
  if (gameState.currentBet > 0) {
    currentBetDisplay.textContent = '当前下注: ' + gameState.currentBet;
  } else {
    currentBetDisplay.textContent = '';
  }
  
  renderCommunityCards(gameState.communityCards);
  renderSeats(gameState);
  updateDealerButton(gameState);
  updateActionPanel(gameState);
  updateBotButton(gameState);
}

function updateGameStatus(gameState) {
  const statusMap = {
    'waiting': '等待玩家加入...',
    'preflop': '翻牌前',
    'flop': '翻牌圈',
    'turn': '转牌圈',
    'river': '河牌圈',
    'showdown': '摊牌',
    'ended': '游戏结束'
  };
  
  const playerCount = gameState.players.length;
  if (gameState.gameState === 'waiting') {
    gameStatus.textContent = '等待玩家加入 (' + playerCount + '/5)';
  } else {
    gameStatus.textContent = statusMap[gameState.gameState] || gameState.gameState;
  }
}

var _lastCommunityCardsLength = 0;

function renderCommunityCards(cards) {
  if (cards.length > 0) {
    playSound('card');
  }
  communityCardsEl.innerHTML = '';
  cards.forEach(function(card, index) {
    var isNewCard = index >= _lastCommunityCardsLength;
    var cardEl = createCardElement(card, true, {
      flyIn: isNewCard,
      flyDelay: isNewCard ? (index - _lastCommunityCardsLength) * 80 : 0
    });
    communityCardsEl.appendChild(cardEl);
  });
  _lastCommunityCardsLength = cards.length;
}

function createCardElement(card, faceUp, options) {
  options = options || {};
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  if (options.flyIn) {
    cardEl.classList.add('card-fly-in');
    if (options.flyDelay != null) {
      cardEl.style.animationDelay = (options.flyDelay / 1000) + 's';
    }
  }
  
  if (!faceUp || !card.rank) {
    cardEl.classList.add('back');
    return cardEl;
  }
  
  if (card.suit === '♥' || card.suit === '♦') {
    cardEl.classList.add('red');
  } else {
    cardEl.classList.add('black');
  }
  
  cardEl.innerHTML = '<span class="suit top-left">' + card.suit + '</span><span class="rank">' + card.rank + '</span><span class="suit bottom-right">' + card.suit + '</span>';
  
  return cardEl;
}

function renderSeats(gameState) {
  // 清除所有座位状态
  for (var i = 0; i < 5; i++) {
    var seatEl = document.getElementById('seat-' + i);
    if (seatEl) {
      seatEl.classList.remove('active', 'folded', 'all-in', 'winner', 'my-seat', 'other-seat', 'in-game');
      seatEl.classList.add('empty');
      
      var nameEl = seatEl.querySelector('.player-name');
      var chipsEl = seatEl.querySelector('.player-chips');
      var betEl = seatEl.querySelector('.player-bet');
      var statusEl = seatEl.querySelector('.player-status');
      var cardsEl = seatEl.querySelector('.player-cards');
      
      if (nameEl) nameEl.textContent = '';
      if (chipsEl) chipsEl.textContent = '';
      if (betEl) betEl.textContent = '';
      if (statusEl) statusEl.textContent = '';
      if (cardsEl) cardsEl.innerHTML = '';
    }
  }
  
  // 游戏进行中时添加in-game类
  if (gameState.gameState !== 'waiting' && gameState.gameState !== 'ended') {
    for (var i = 0; i < 5; i++) {
      var seatEl = document.getElementById('seat-' + i);
      if (seatEl) {
        seatEl.classList.add('in-game');
      }
    }
  }
  
  var myPlayer = null;
  for (var i = 0; i < gameState.players.length; i++) {
    if (gameState.players[i].socketId === mySocketId) {
      myPlayer = gameState.players[i];
      break;
    }
  }
  var mySeatIndex = myPlayer ? myPlayer.seat : 0;
  
  gameState.players.forEach(function(player) {
    var displaySeat = (player.seat - mySeatIndex + 5) % 5;
    var seatEl = document.getElementById('seat-' + displaySeat);
    if (!seatEl) return;
    
    seatEl.classList.remove('empty');
    
    if (player.socketId === mySocketId) {
      seatEl.classList.add('my-seat');
    } else {
      seatEl.classList.add('other-seat');
    }
    
    var nameEl = seatEl.querySelector('.player-name');
    var chipsEl = seatEl.querySelector('.player-chips');
    var cardsEl = seatEl.querySelector('.player-cards');
    var betEl = seatEl.querySelector('.player-bet');
    var statusEl = seatEl.querySelector('.player-status');
    
    var displayName = player.nickname + (player.socketId === mySocketId ? ' (我)' : '');
    if (gameState.hostId && player.socketId === gameState.hostId) {
      displayName += ' 👑';
    }
    nameEl.innerHTML = displayName;
    chipsEl.textContent = '💰 ' + player.chips;
    
    if (player.bet > 0) {
      betEl.textContent = '下注: ' + player.bet;
    }
    
    var gameStateValue = currentGameState ? currentGameState.gameState : 'waiting';
    if (player.socketId === mySocketId && gameStateValue !== 'waiting') {
      if (player.action) {
        statusEl.textContent = getActionText(player.action);
      }
    }
    
    if (player.socketId === gameState.currentPlayerSeat) {
      seatEl.classList.add('active');
    }
    if (player.folded) {
      seatEl.classList.add('folded');
    }
    if (player.allIn) {
      seatEl.classList.add('all-in');
    }
    
    var handFlyIn = gameState.gameState === 'preflop';
    if (player.hand && player.hand.length > 0) {
      if (player.socketId === mySocketId) {
        player.hand.forEach(function(card, idx) {
          cardsEl.appendChild(createCardElement(card, true, { flyIn: handFlyIn, flyDelay: idx * 60 }));
        });
      } else if (gameState.gameState === 'showdown' || gameState.gameState === 'ended') {
        player.hand.forEach(function(card) {
          cardsEl.appendChild(createCardElement(card, true));
        });
      } else {
        for (var i = 0; i < 2; i++) {
          cardsEl.appendChild(createCardElement({}, false, { flyIn: handFlyIn, flyDelay: i * 60 }));
        }
      }
    } else if (gameState.gameState !== 'waiting') {
      for (var i = 0; i < 2; i++) {
        cardsEl.appendChild(createCardElement({}, false, { flyIn: handFlyIn, flyDelay: i * 60 }));
      }
    }
  });
}

function getActionText(action) {
  var actions = {
    'fold': '已弃牌',
    'check': '看牌',
    'call': '跟注',
    'raise': '加注',
    'all-in': '全下'
  };
  return actions[action] || action;
}

function updateDealerButton(gameState) {
  if (gameState.dealerSeat === -1 || gameState.gameState === 'waiting') {
    dealerButton.style.display = 'none';
    return;
  }
  
  var myPlayer = null;
  for (var i = 0; i < gameState.players.length; i++) {
    if (gameState.players[i].socketId === mySocketId) {
      myPlayer = gameState.players[i];
      break;
    }
  }
  var mySeatIndex = myPlayer ? myPlayer.seat : 0;
  var displaySeat = (gameState.dealerSeat - mySeatIndex + 5) % 5;
  
  var seatEl = document.getElementById('seat-' + displaySeat);
  if (seatEl) {
    var rect = seatEl.getBoundingClientRect();
    var tableRect = document.querySelector('.poker-table').getBoundingClientRect();
    dealerButton.style.display = 'flex';
    dealerButton.style.left = (rect.left - tableRect.left + rect.width / 2 - 15) + 'px';
    dealerButton.style.top = (rect.top - tableRect.top - 20) + 'px';
  }
}

function updateActionPanel(gameState) {
  var myPlayer = null;
  for (var i = 0; i < gameState.players.length; i++) {
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
