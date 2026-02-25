// 游戏前端逻辑
// 音效系统
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  try {
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'card') {
      // 发牌音效 - 清脆的提示音
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'bet') {
      // 下注音效 - 更低的提示音
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'action') {
      // 操作确认音效
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    }
  } catch (e) {
    console.log('Audio not supported');
  }
}

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

// 从本地存储读取昵称和数据
function loadNickname() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && nicknameInput) {
    nicknameInput.value = saved;
    playerStats.nickname = saved;
  }
  
  // 加载玩家数据
  const savedStats = localStorage.getItem(STATS_KEY);
  if (savedStats) {
    try {
      playerStats = JSON.parse(savedStats);
      updatePlayerStatsDisplay();
    } catch (e) {
      console.log('Failed to load stats');
    }
  }
}

// 保存昵称到本地存储
function saveNickname(nickname) {
  localStorage.setItem(STORAGE_KEY, nickname);
  playerStats.nickname = nickname;
  updatePlayerStatsDisplay();
}

// 保存玩家数据
function savePlayerStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
}

// 更新玩家数据显示
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

// 更新玩家金币
function updatePlayerChips(chips) {
  playerStats.chips = chips;
  savePlayerStats();
  updatePlayerStatsDisplay();
}

// 玩家完成一局游戏
function finishGame(won, finalChips) {
  playerStats.gamesPlayed++;
  if (won) {
    playerStats.gamesWon++;
  }
  playerStats.chips = finalChips;
  // 计算胜率
  playerStats.winRate = playerStats.gamesPlayed >= 10 
    ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100) 
    : 0;
  savePlayerStats();
  updatePlayerStatsDisplay();
}

// DOM 元素
const lobbyPage = document.getElementById('lobby');
const gameRoomPage = document.getElementById('gameRoom');
const nicknameInput = document.getElementById('nickname');
const roomCodeInput = document.getElementById('roomCode');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const confirmJoinBtn = document.getElementById('confirmJoinBtn');
const joinForm = document.getElementById('joinForm');
const displayRoomCode = document.getElementById('displayRoomCode');
const gameStatus = document.getElementById('gameStatus');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const potAmount = document.getElementById('potAmount');
const communityCardsEl = document.getElementById('communityCards');
const currentBetDisplay = document.getElementById('currentBetDisplay');
const dealerButton = document.getElementById('dealerButton');
const actionPanel = document.getElementById('actionPanel');
const actionText = document.getElementById('actionText');
const foldBtn = document.getElementById('foldBtn');
const checkBtn = document.getElementById('checkBtn');
const callBtn = document.getElementById('callBtn');
const raiseBtn = document.getElementById('raiseBtn');
const allInBtn = document.getElementById('allInBtn');
const raiseSlider = document.getElementById('raiseSlider');
const raiseAmountPanel = document.getElementById('raiseAmountPanel');
const raiseAmountDisplay = document.getElementById('raiseAmountDisplay');
const gameOverModal = document.getElementById('gameOverModal');
const settlementList = document.getElementById('settlementList');
const newGameBtn = document.getElementById('newGameBtn');
const myCardsEl = document.getElementById('myCards');

// 游戏状态
let mySocketId = null;
let mySeat = -1;
let currentGameState = null;
let actionTimer = null;  // 倒计时
let actionTimeLeft = 10; // 剩余时间

// 从本地存储读取昵称和数据
function loadNickname() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && nicknameInput) {
    nicknameInput.value = saved;
    playerStats.nickname = saved;
  }
  
  // 加载玩家数据
  const savedStats = localStorage.getItem(STATS_KEY);
  if (savedStats) {
    try {
      playerStats = JSON.parse(savedStats);
    } catch (e) {
      console.log('Failed to load stats');
    }
  }
  
  // 更新显示
  updatePlayerStatsDisplay();
}

// 保存昵称到本地存储
function saveNickname(nickname) {
  localStorage.setItem(STORAGE_KEY, nickname);
  playerStats.nickname = nickname;
  updatePlayerStatsDisplay();
}

// 页面加载完成后读取昵称和数据
document.addEventListener('DOMContentLoaded', function() {
  loadNickname();
});

// 页面切换
function showPage(page) {
  if (page === 'lobby') {
    lobbyPage.classList.remove('hidden');
    gameRoomPage.classList.add('hidden');
  } else {
    lobbyPage.classList.add('hidden');
    gameRoomPage.classList.remove('hidden');
  }
}

// 事件监听
createRoomBtn.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    alert('请输入昵称');
    return;
  }
  saveNickname(nickname); // 保存昵称
  socket.emit('createRoom', nickname, (response) => {
    if (response.success) {
      mySocketId = socket.id;
      mySeat = response.player.seat;
      displayRoomCode.textContent = response.roomCode;
      showPage('game');
    } else {
      alert('创建房间失败');
    }
  });
});

joinRoomBtn.addEventListener('click', () => {
  joinForm.classList.remove('hidden');
});

confirmJoinBtn.addEventListener('click', () => {
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

  saveNickname(nickname); // 保存昵称

  socket.emit('joinRoom', roomCode, nickname, (response) => {
    if (response.success) {
      mySocketId = socket.id;
      mySeat = response.player.seat;
      displayRoomCode.textContent = response.roomCode;
      showPage('game');
    } else {
      alert(response.message || '加入房间失败');
    }
  });
});

leaveRoomBtn.addEventListener('click', () => {
  window.location.reload();
});

// 操作按钮 - 每次点击都停止倒计时
function stopTimerBeforeAction() {
  stopActionTimer();
}

foldBtn.addEventListener('click', () => {
  stopTimerBeforeAction();
  playSound('action'); // 操作音效
  socket.emit('playerAction', 'fold', 0, handleActionResponse);
});

checkBtn.addEventListener('click', () => {
  stopTimerBeforeAction();
  playSound('action'); // 操作音效
  socket.emit('playerAction', 'check', 0, handleActionResponse);
});

callBtn.addEventListener('click', () => {
  stopTimerBeforeAction();
  playSound('bet'); // 下注音效
  socket.emit('playerAction', 'call', 0, handleActionResponse);
});

raiseBtn.addEventListener('click', () => {
  stopTimerBeforeAction();
  playSound('bet'); // 下注音效
  const amount = parseInt(raiseSlider.value);
  socket.emit('playerAction', 'raise', amount, handleActionResponse);
});

allInBtn.addEventListener('click', () => {
  stopTimerBeforeAction();
  playSound('bet'); // 下注音效
  socket.emit('playerAction', 'all-in', 0, handleActionResponse);
});

raiseSlider.addEventListener('input', (e) => {
  raiseAmountDisplay.textContent = e.target.value;
});

newGameBtn.addEventListener('click', () => {
  gameOverModal.classList.add('hidden');
  window.location.reload();
});

function handleActionResponse(response) {
  if (!response.success) {
    alert(response.message || '操作失败');
  }
}

// Socket 事件监听
socket.on('roomUpdate', (gameState) => {
  updateGameState(gameState);
});

socket.on('gameState', (gameState) => {
  updateGameState(gameState);
});

socket.on('playerLeft', (data) => {
  gameStatus.textContent = `${data.nickname} 离开了房间`;
});

function updateGameState(gameState) {
  currentGameState = gameState;

  // 更新游戏状态显示
  updateGameStatus(gameState);

  // 更新底池
  potAmount.textContent = gameState.pot;

  // 更新当前下注
  if (gameState.currentBet > 0) {
    currentBetDisplay.textContent = `当前下注: ${gameState.currentBet}`;
  } else {
    currentBetDisplay.textContent = '';
  }

  // 更新公共牌
  renderCommunityCards(gameState.communityCards);

  // 更新座位
  renderSeats(gameState);

  // 更新庄家按钮位置
  updateDealerButton(gameState);

  // 更新操作面板
  updateActionPanel(gameState);
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
    gameStatus.textContent = `等待玩家加入 (${playerCount}/5)`;
  } else {
    gameStatus.textContent = statusMap[gameState.gameState] || gameState.gameState;
  }
}

function renderCommunityCards(cards) {
  if (cards.length > 0) {
    playSound('card'); // 发牌音效
  }
  communityCardsEl.innerHTML = '';
  cards.forEach(card => {
    const cardEl = createCardElement(card);
    communityCardsEl.appendChild(cardEl);
  });
}

function createCardElement(card, faceUp = true) {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';

  if (!faceUp) {
    cardEl.classList.add('back');
    return cardEl;
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  if (isRed) {
    cardEl.classList.add('red');
  } else {
    cardEl.classList.add('black');
  }

  cardEl.innerHTML = `
    <span class="suit top-left">${card.suit}</span>
    <span class="rank">${card.rank}</span>
    <span class="suit bottom-right">${card.suit}</span>
  `;

  return cardEl;
}

function renderSeats(gameState) {
  // 清除所有座位状态
  for (let i = 0; i < 5; i++) {
    const seatEl = document.getElementById(`seat-${i}`);
    if (seatEl) {
      seatEl.classList.remove('active', 'folded', 'all-in', 'winner');
      const playerInfo = seatEl.querySelector('.player-info');
      const playerCards = seatEl.querySelector('.player-cards');
      const playerBet = seatEl.querySelector('.player-bet');
      const playerStatus = seatEl.querySelector('.player-status');

      if (playerInfo) playerInfo.querySelector('.player-name').textContent = '';
      if (playerInfo) playerInfo.querySelector('.player-chips').textContent = '';
      if (playerCards) playerCards.innerHTML = '';
      if (playerBet) playerBet.textContent = '';
      if (playerStatus) playerStatus.textContent = '';
    }
  }

  // 重新渲染座位（按照视角调整：玩家永远在底部）
  const myPlayer = gameState.players.find(p => p.socketId === mySocketId);
  const mySeatIndex = myPlayer ? myPlayer.seat : 0;

  gameState.players.forEach(player => {
    // 计算显示位置（相对于玩家的座位）
    let displaySeat = (player.seat - mySeatIndex + 5) % 5;
    const seatEl = document.getElementById(`seat-${displaySeat}`);
    if (!seatEl) return;

    // 玩家信息
    const nameEl = seatEl.querySelector('.player-name');
    const chipsEl = seatEl.querySelector('.player-chips');
    const cardsEl = seatEl.querySelector('.player-cards');
    const betEl = seatEl.querySelector('.player-bet');
    const statusEl = seatEl.querySelector('.player-status');

    nameEl.textContent = player.nickname + (player.socketId === mySocketId ? ' (我)' : '');
    chipsEl.textContent = `💰 ${player.chips}`;

    // 下注
    if (player.bet > 0) {
      betEl.textContent = `下注: ${player.bet}`;
    }

    // 状态
    if (player.socketId === mySocketId && currentGameState?.gameState !== 'waiting') {
      if (player.action) {
        statusEl.textContent = getActionText(player.action);
      }
    }

    // 座位状态
    if (player.socketId === gameState.currentPlayerSeat) {
      seatEl.classList.add('active');
    }
    if (player.folded) {
      seatEl.classList.add('folded');
    }
    if (player.allIn) {
      seatEl.classList.add('all-in');
    }

    // 渲染手牌
    if (player.hand && player.hand.length > 0) {
      if (player.socketId === mySocketId) {
        // 显示自己的牌（正面朝上）
        player.hand.forEach(card => {
          cardsEl.appendChild(createCardElement(card, true));
        });
      } else if (gameState.gameState === 'showdown' || gameState.gameState === 'ended') {
        // 摊牌时显示其他玩家的牌
        player.hand.forEach(card => {
          cardsEl.appendChild(createCardElement(card, true));
        });
      } else {
        // 其他情况显示牌背
        for (let i = 0; i < 2; i++) {
          cardsEl.appendChild(createCardElement({}, false));
        }
      }
    } else if (gameState.gameState !== 'waiting') {
      // 游戏进行中但没牌，显示牌背
      for (let i = 0; i < 2; i++) {
        cardsEl.appendChild(createCardElement({}, false));
      }
    }
  });
}

function getActionText(action) {
  const actions = {
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

  const myPlayer = gameState.players.find(p => p.socketId === mySocketId);
  const mySeatIndex = myPlayer ? myPlayer.seat : 0;
  const displaySeat = (gameState.dealerSeat - mySeatIndex + 5) % 5;

  const seatEl = document.getElementById(`seat-${displaySeat}`);
  if (seatEl) {
    const rect = seatEl.getBoundingClientRect();
    const tableRect = document.querySelector('.poker-table').getBoundingClientRect();
    dealerButton.style.display = 'flex';
    dealerButton.style.left = (rect.left - tableRect.left + rect.width / 2 - 15) + 'px';
    dealerButton.style.top = (rect.bottom - tableRect.top + 5) + 'px';
  }
}

function updateActionPanel(gameState) {
  const myPlayer = gameState.players.find(p => p.socketId === mySocketId);

  if (!myPlayer) {
    actionPanel.classList.add('hidden');
    stopActionTimer();
    return;
  }

  actionPanel.classList.remove('hidden');

  // 检查是否轮到我行动
  const isMyTurn = myPlayer.seat === gameState.currentPlayerSeat;
  const gameActive = gameState.gameState !== 'waiting' && gameState.gameState !== 'showdown' && gameState.gameState !== 'ended';

  if (!gameActive) {
    actionText.textContent = gameState.gameState === 'waiting' ? '等待更多玩家...' : '游戏进行中...';
    disableAllButtons();
    stopActionTimer();
    return;
  }

  if (!isMyTurn) {
    actionText.textContent = '等待其他玩家...';
    disableAllButtons();
    stopActionTimer();
    return;
  }

  // 轮到我行动，启动10秒倒计时
  startActionTimer();

  // 计算需要跟注的金额
  const currentBet = myPlayer.bet || 0;
  const toCall = gameState.currentBet - currentBet;

  // 更新操作按钮状态
  actionText.textContent = '请选择操作';

  foldBtn.disabled = false;
  
  if (toCall === 0) {
    // 可以过牌 - 只显示过牌按钮
    checkBtn.disabled = false;
    checkBtn.style.display = 'inline-block';
    callBtn.disabled = true;
    callBtn.style.display = 'none';
    checkBtn.textContent = '过牌';
  } else {
    // 需要跟注 - 只显示跟注按钮
    checkBtn.disabled = true;
    checkBtn.style.display = 'none';
    callBtn.disabled = false;
    callBtn.style.display = 'inline-block';
    callBtn.textContent = `跟注 ${toCall}`;
  }

  // 更新加注范围
  const minRaise = Math.max(gameState.currentBet * 2, gameState.config.BIG_BLIND);
  const maxRaise = myPlayer.chips + currentBet;
  raiseSlider.min = minRaise;
  raiseSlider.max = maxRaise;
  raiseSlider.value = minRaise;
  raiseAmountDisplay.textContent = minRaise;

  raiseBtn.disabled = myPlayer.chips < minRaise;
  allInBtn.disabled = false;

  // 如果当前下注等于玩家下注，显示加注
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

// 游戏结束弹窗
socket.on('gameOver', (data) => {
  const results = data.results;
  
  settlementList.innerHTML = '';
  
  results.forEach((result, index) => {
    const item = document.createElement('div');
    item.className = 'settlement-item';
    
    if (result.netChange > 0) {
      item.classList.add('winner');
    } else if (result.netChange < 0) {
      item.classList.add('loser');
    }
    
    // 如果是我，统计战绩
    if (result.nickname === playerStats.nickname) {
      finishGame(result.netChange > 0, result.finalChips);
    }
    
    const netText = result.netChange > 0 ? `+${result.netChange}` : result.netChange;
    
    item.innerHTML = `
      <span class="settlement-nickname">${result.nickname}</span>
      <span class="settlement-amount ${result.netChange >= 0 ? 'positive' : 'negative'}">${netText}</span>
    `;
    
    settlementList.appendChild(item);
  });
  
  gameOverModal.classList.remove('hidden');
});

// 倒计时功能
function startActionTimer() {
  stopActionTimer(); // 先停止之前的计时器
  actionTimeLeft = 10;
  const timerEl = document.getElementById('actionTimer');
  const timerText = document.getElementById('timerText');
  const timerProgress = document.querySelector('.timer-progress');
  
  if (!timerEl) return;
  
  timerEl.classList.remove('hidden');
  
  // 更新倒计时显示
  if (timerText) timerText.textContent = actionTimeLeft;
  if (timerProgress) {
    timerProgress.style.strokeDasharray = '100';
    timerProgress.style.strokeDashoffset = '0';
  }
  
  actionTimer = setInterval(() => {
    actionTimeLeft--;
    
    if (timerText) timerText.textContent = actionTimeLeft;
    
    // 更新圆形进度条
    if (timerProgress) {
      const progress = (actionTimeLeft / 10) * 100;
      timerProgress.style.strokeDashoffset = (100 - progress).toString();
    }
    
    if (actionTimeLeft <= 0) {
      // 时间到，自动弃牌
      stopActionTimer();
      socket.emit('playerAction', 'fold', 0, (response) => {
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
  const timerEl = document.getElementById('actionTimer');
  if (timerEl) {
    timerEl.classList.add('hidden');
  }
}

// 初始状态
showPage('lobby');
