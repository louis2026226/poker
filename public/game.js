// Louis Poker - 游戏前端逻辑

// ============ 初始化区域 ============
// 音效缓存：通过 <audio> 标签播放筹码/发牌等音效
let audioCache = {
  card: null,
  bet: null,
  action: null,
  win: null,
  over: null,
  button: null
};
let audioCtx = null;
let mySocketId = null;
let mySeat = -1;
let currentGameState = null;
let actionTimer = null;
let countdownSeatEl = null;
let countdownInfoEl = null;
let actionTimeLeft = 12;
let emojiLastTime = 0;
const EMOJI_COOLDOWN = 20000;

// 音效系统 - 简单的 <audio> 预加载与播放
function loadAudio(name, url) {
  try {
    var audio = new Audio(url);
    audio.preload = 'auto';
    audioCache[name] = audio;
  } catch (e) {
    console.log('loadAudio error', name, e);
  }
}

function initAudio() {
  // 在第一次需要时懒加载音效文件
  if (!audioCache.card) {
    loadAudio('card', '/card.mp3');
  }
  if (!audioCache.bet) {
    loadAudio('bet', '/chip.mp3');
  }
  if (!audioCache.action) {
    loadAudio('action', '/chip.mp3');
  }
  if (!audioCache.win) {
    loadAudio('win', '/win.mp3');
  }
  if (!audioCache.over) {
    loadAudio('over', '/over.mp3');
  }
  if (!audioCache.button) {
    loadAudio('button', '/butten.mp3');
  }
}

function playSound(type) {
  try {
    initAudio();
    var tpl = audioCache[type];
    if (!tpl) return;
    // 发牌音效用同一元素重播，便于在用户手势解锁后连续播放多声
    if (type === 'card') {
      tpl.currentTime = 0;
      tpl.play().catch(function(err) {
        console.log('playSound error', type, err && err.message);
      });
      return;
    }
    var audio = tpl.cloneNode();
    audio.play().catch(function(err) {
      console.log('playSound error', type, err && err.message);
    });
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
let potAmount, communityCardsEl, currentBetDisplay;
let actionPanel, actionText, foldBtn, checkBtn, callBtn, raiseBtn, allInBtn;
let aiAssistBtn, startGameBtn;
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
  actionPanel = document.getElementById('actionPanel');
  actionText = document.getElementById('actionText');
  foldBtn = document.getElementById('foldBtn');
  checkBtn = document.getElementById('checkBtn');
  callBtn = document.getElementById('callBtn');
  raiseBtn = document.getElementById('raiseBtn');
  allInBtn = document.getElementById('allInBtn');
  aiAssistBtn = document.getElementById('ai-assist-btn');
  startGameBtn = document.getElementById('startGameBtn');
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
  var bgmEl = document.getElementById('bgmAudio');
  if (page === 'lobby') {
    lobbyPage.classList.remove('hidden');
    gameRoomPage.classList.add('hidden');
    if (bgmEl) {
      bgmEl.pause();
      bgmEl.currentTime = 0;
      bgmEl.removeEventListener('ended', window._bgmEndedHandler);
    }
  } else {
    lobbyPage.classList.add('hidden');
    gameRoomPage.classList.remove('hidden');
    initAudio();
    if (bgmEl) {
      bgmEl.volume = 0.3;
      try { bgmEl.load(); } catch (e) {}
      if (!window._bgmEndedHandler) {
        window._bgmEndedHandler = function() {
          setTimeout(function() {
            if (!gameRoomPage || gameRoomPage.classList.contains('hidden')) return;
            var el = document.getElementById('bgmAudio');
            if (el) {
              el.volume = 0.3;
              el.currentTime = 0;
              el.play().catch(function() {});
            }
          }, 3000);
        };
      }
      bgmEl.addEventListener('ended', window._bgmEndedHandler);
      bgmEl.play().catch(function() {});
      if (!window._bgmClickUnlock) {
        window._bgmClickUnlock = true;
        function tryPlayBgm() {
          var el = document.getElementById('bgmAudio');
          if (el && gameRoomPage && !gameRoomPage.classList.contains('hidden') && el.paused) {
            el.volume = 0.3;
            el.play().catch(function() {});
          }
        }
        gameRoomPage.addEventListener('click', tryPlayBgm, { once: true });
        document.addEventListener('click', function docBgm() {
          tryPlayBgm();
          document.removeEventListener('click', docBgm);
        }, { once: true });
      }
    }
  }
}

// ============ 事件监听 ============
function setupEventListeners() {
  // 创建房间
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', function() {
      playSound('button');
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
      playSound('button');
      console.log('Join room clicked');
      joinForm.classList.remove('hidden');
    });
  }
  
  // 确认加入
  if (confirmJoinBtn) {
    confirmJoinBtn.addEventListener('click', function() {
      playSound('button');
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
      playSound('button');
      location.reload();
    });
  }
  
  // 再来一局
  if (newGameBtn) {
    newGameBtn.addEventListener('click', function() {
      playSound('button');
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
      playSound('button');
      socket.emit('playerAction', 'fold', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (checkBtn) {
    checkBtn.addEventListener('click', function() {
      playSound('button');
      socket.emit('playerAction', 'check', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (callBtn) {
    callBtn.addEventListener('click', function() {
      playSound('bet');
      socket.emit('playerAction', 'call', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (raiseBtn) {
    raiseBtn.addEventListener('click', function() {
      playSound('bet');
      const amount = parseInt(raiseSlider.value);
      socket.emit('playerAction', 'raise', amount, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  if (allInBtn) {
    allInBtn.addEventListener('click', function() {
      playSound('bet');
      if (currentGameState && currentGameState.players) {
        var myP = currentGameState.players.find(function(p) { return p.socketId === mySocketId; });
        if (myP) {
          var mySeatIdx = myP.seat;
          var myDisplaySeat = (myP.seat - mySeatIdx + 5) % 5;
          showAllInFloatAtSeat(myDisplaySeat);
        }
      }
      socket.emit('playerAction', 'all-in', 0, function(response) {
        if (!response.success) console.log(response.message);
      });
    });
  }
  
  // AI+1 按钮：添加一个机器人玩家
  if (aiAssistBtn) {
    aiAssistBtn.addEventListener('click', function() {
      playSound('button');
      socket.emit('addBot');
    });
  }

  // 打赏荷官：每次 50 筹码，荷官随机说感谢/祝福
  var dealerTipBtn = document.getElementById('dealerTipBtn');
  if (dealerTipBtn) {
    dealerTipBtn.addEventListener('click', function() {
      playSound('button');
      if (dealerTipBtn.disabled) return;
      dealerTipBtn.disabled = true;
      socket.emit('dealerTip', function(res) {
        dealerTipBtn.disabled = false;
        if (res && !res.success) console.log(res.message);
      });
    });
  }

  // 开始游戏按钮：仅房主在等待开局且人数足够时可用
  if (startGameBtn) {
    startGameBtn.addEventListener('click', function() {
      playSound('button');
      playSound('card');
      startGameBtn.disabled = true;
      startGameBtn.textContent = '开始中...';
      socket.emit('startGame', function(response) {
        if (!response || !response.success) {
          startGameBtn.disabled = false;
          startGameBtn.textContent = '开始游戏';
          alert(response && response.message ? response.message : '无法开始游戏，请稍后重试');
        } else {
          // 开始游戏成功后隐藏按钮，等下一次牌局结束/等待时再由 updateBotButton 控制显示
          startGameBtn.classList.add('hidden');
        }
      });
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

  var prevState = currentGameState;

  if (gameState.gameState === 'preflop' && (!prevState || prevState.gameState === 'ended' || prevState.gameState === 'waiting')) {
    _lastCommunityCardsLength = 0;
    clearPotFlyChips();
  }
  if (_lastGameStateForPot) {
    animatePotChips(_lastGameStateForPot, gameState);
  }

  // 仅在从 waiting/ended 进入 preflop 时标记为新一手，用于控制发牌动画只播放一次
  _isNewDealPreflop = gameState.gameState === 'preflop' &&
    (!prevState || prevState.gameState === 'waiting' || prevState.gameState === 'ended');

  currentGameState = gameState;
  updateGameState(gameState);
  showAllInFloats(prevState, gameState);
  _lastGameStateForPot = gameState;

  if (gameState.gameState === 'ended' && prevState && prevState.pot > 0) {
    animatePotToWinners(prevState, gameState);
  }

  // 利用 gameState 的变化在本地统计金币 / 场次 / 胜率
  updateLocalStatsOnGameEnd(prevState, gameState);
});

socket.on('roomUpdate', function(gameState) {
  console.log('Room update received');
  if (gameState.gameState === 'preflop' && (!currentGameState || currentGameState.gameState === 'ended' || currentGameState.gameState === 'waiting')) {
    _lastCommunityCardsLength = 0;
  }
  if (currentGameState && gameState && gameState.pot > currentGameState.pot) {
    playBetSoundIfSomeoneElseBet(currentGameState, gameState);
  }
  var prevForAllIn = currentGameState;
  // roomUpdate 不触发新一手发牌动画，避免与 gameState 重复
  _isNewDealPreflop = false;
  currentGameState = gameState;
  updateGameState(gameState);
  showAllInFloats(prevForAllIn, gameState);
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

socket.on('dealerSay', function(data) {
  var el = document.getElementById('dealerSpeech');
  if (!el) return;
  el.textContent = data.phrase || '';
  el.classList.add('dealer-speech-visible');
  clearTimeout(dealerSpeechTimer);
  dealerSpeechTimer = setTimeout(function() {
    el.classList.remove('dealer-speech-visible');
    el.textContent = '';
  }, 2500);
});
var dealerSpeechTimer = null;

socket.on('gameOver', function(data) {
  const results = data.results || [];
  const meta = data.meta || {};
  const actions = data.actions || [];
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
  
  // 行为记录：本局所有玩家的行为按时间线记录
  try {
    var logEl = document.getElementById('settlementLog');
    if (logEl) {
      var lines = [];

      var actionTextMap = {
        'small-blind': '小盲注',
        'big-blind': '大盲注',
        'bet': '下注',
        'raise': '加注',
        'call': '跟注',
        'check': '过牌',
        'fold': '弃牌',
        'all-in': '全压',
        'win': '获胜'
      };

      actions.forEach(function(a, idx) {
        var label = actionTextMap[a.action] || a.action;
        var amt = (typeof a.amount === 'number' && a.amount !== 0) ? a.amount : '';
        var sec = (typeof a.elapsedSeconds === 'number') ? a.elapsedSeconds : null;
        var secText = sec != null ? (sec + 'S') : '';
        var parts = [];
        parts.push((idx + 1) + '.');
        parts.push(a.nickname || '');
        if (label) {
          parts.push(label + (amt !== '' ? amt : ''));
        }
        if (secText) {
          parts.push(secText);
        }
        lines.push(parts.join('/'));
      });

      var timeStr = '';
      if (meta.endedAt) {
        var endedDate = new Date(meta.endedAt);
        timeStr = endedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }

      var durationStr = '';
      if (typeof meta.durationSeconds === 'number') {
        durationStr = formatDuration(meta.durationSeconds);
      }

      var metaParts = [];
      if (timeStr) metaParts.push('时间：' + timeStr);
      if (durationStr) metaParts.push('耗时：' + durationStr);

      logEl.innerHTML =
        '<div>' + lines.join('<br>') + '</div>' +
        (metaParts.length ? '<div class=\"settlement-log-meta\">' + metaParts.join('　') + '</div>' : '');
    }
  } catch (e) {
    console.log('render settlement log error', e);
  }

  // 结算弹窗音效
  playSound('over');

  // 如果自己本局赢了筹码，播放胜利音效（只播一次）
  try {
    var meWin = results.some(function(r) {
      return r && r.nickname === playerStats.nickname && typeof r.netChange === 'number' && r.netChange > 0;
    });
    if (meWin) {
      playSound('win');
    }
  } catch (e) {
    console.log('play win sound error', e);
  }

  // 赢得筹码的玩家头上飘：筹码图 + 赢得数量
  showRoundResultFloats(results);
  gameOverModal.classList.remove('hidden');
});

function formatDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds < 0) totalSeconds = 0;
  var h = Math.floor(totalSeconds / 3600);
  var m = Math.floor((totalSeconds % 3600) / 60);
  var s = totalSeconds % 60;
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  if (h > 0) {
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  return pad(m) + ':' + pad(s);
}

// 每局结束后，赢得筹码的玩家头上飘：筹码图 + 赢得数量（如 筹码图+300）
function showRoundResultFloats(results) {
  try {
    if (!results || !results.length) return;
    if (!currentGameState || !currentGameState.players) return;

    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;

    var myPlayer = currentGameState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;

    // 只处理赢家（netChange > 0），按赢得多少从大到小
    var winners = results.filter(function(r) { return typeof r.netChange === 'number' && r.netChange > 0; });
    var sorted = winners.slice().sort(function(a, b) { return b.netChange - a.netChange; });

    sorted.forEach(function(result, idx) {
      var delta = result.netChange;
      var player = currentGameState.players.find(function(p) { return p.nickname === result.nickname; });
      if (!player) return;

      var displaySeat = (player.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;

      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var rect = avatarEl.getBoundingClientRect();
      var tableRect = tableEl.getBoundingClientRect();

      // 赢家头上飘：筹码图 + 数量（如 +300）
      var floatEl = document.createElement('div');
      floatEl.className = 'round-result-float';
      floatEl.innerHTML = '<span class="chip-icon round-float-chip"></span><span class="round-float-amount">+' + delta + '</span>';

      floatEl.style.left = (rect.left - tableRect.left + rect.width / 2) + 'px';
      floatEl.style.top = (rect.top - tableRect.top - 12) + 'px';

      tableEl.appendChild(floatEl);

      setTimeout(function() {
        floatEl.remove();
      }, 2000);
    });
  } catch (e) {
    console.log('showRoundResultFloats error', e);
  }
}

/** 在指定展示座位号（0-4）上飘一次黄色 ALL IN */
function showAllInFloatAtSeat(displaySeat) {
  var tableEl = document.querySelector('.poker-table');
  if (!tableEl) return;
  var seatEl = document.getElementById('seat-' + displaySeat);
  if (!seatEl) return;
  var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
  var rect = avatarEl.getBoundingClientRect();
  var tableRect = tableEl.getBoundingClientRect();
  var floatEl = document.createElement('div');
  floatEl.className = 'all-in-float';
  floatEl.textContent = 'ALL IN';
  floatEl.style.left = (rect.left - tableRect.left + rect.width / 2) + 'px';
  floatEl.style.top = (rect.top - tableRect.top - 8) + 'px';
  tableEl.appendChild(floatEl);
  setTimeout(function() { floatEl.remove(); }, 2300);
}

/** 有人刚全下时，在该玩家头上飘黄色 ALL IN（外发光、上飘、停留约 1 秒后消失） */
function showAllInFloats(prevState, nextState) {
  try {
    if (!nextState || !nextState.players) return;
    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;
    var myPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;
    var prevById = {};
    if (prevState && prevState.players) {
      prevState.players.forEach(function(p) { if (p && p.socketId) prevById[p.socketId] = p; });
    }
    nextState.players.forEach(function(p) {
      if (!p || !p.allIn) return;
      var prev = prevById[p.socketId];
      if (prev && prev.allIn) return;
      if (p.socketId === mySocketId) return;
      var displaySeat = (p.seat - mySeatIndex + 5) % 5;
      showAllInFloatAtSeat(displaySeat);
    });
  } catch (e) {
    console.log('showAllInFloats error', e);
  }
}

// 使用 gameState 变化在本地更新主页统计（金币 / 胜率 / 场次）
function updateLocalStatsOnGameEnd(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    if (!mySocketId) return;

    // 只在状态从非 ended 变为 ended 时统计一局
    if (prevState.gameState === 'ended' || nextState.gameState !== 'ended') return;
    if (!prevState.players || !nextState.players) return;

    var prevPlayer = prevState.players.find(function(p) { return p.socketId === mySocketId; });
    var currPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    if (!prevPlayer || !currPlayer) return;

    var prevChips = prevPlayer.chips || 0;
    var currChips = currPlayer.chips || 0;
    var netChange = currChips - prevChips;

    finishGame(netChange > 0, currChips);
  } catch (e) {
    console.log('updateLocalStatsOnGameEnd error', e);
  }
}

var _lastPot = null;

// ============ 游戏逻辑 ============
function updateGameState(gameState) {
  updateGameStatus(gameState);
  var newPot = gameState.pot;
  if (potAmount) potAmount.textContent = newPot;
  var potIconEl = document.getElementById('potIcon');
  if (potIconEl && typeof newPot === 'number' && _lastPot !== null && _lastPot !== newPot) {
    potIconEl.classList.remove('pot-icon-pop');
    void potIconEl.offsetWidth;
    potIconEl.classList.add('pot-icon-pop');
    setTimeout(function() { potIconEl.classList.remove('pot-icon-pop'); }, 400);
  }
  _lastPot = newPot;
  
  if (gameState.currentBet > 0) {
    currentBetDisplay.textContent = '当前下注: ' + gameState.currentBet;
  } else {
    currentBetDisplay.textContent = '';
  }
  
  renderCommunityCards(gameState.communityCards);
  renderSeats(gameState);
  showBigHandBadges(gameState);
  updateActionPanel(gameState);
  updateBotButton(gameState);
  updateDealerTipButton(gameState);
  updateActionTimerPosition(gameState);
  startActionTimer(gameState);
}

function updateDealerTipButton(gameState) {
  var btn = document.getElementById('dealerTipBtn');
  if (!btn) return;
  var myPlayer = gameState && gameState.players ? gameState.players.find(function(p) { return p.socketId === mySocketId; }) : null;
  btn.disabled = !myPlayer || myPlayer.chips < 50;
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
var _lastGameStateForPot = null;
var _isNewDealPreflop = false;

function renderCommunityCards(cards) {
  if (cards.length > _lastCommunityCardsLength) {
    playSound('card');
  }
  communityCardsEl.innerHTML = '';
  cards.forEach(function(card, index) {
    var isNewCard = index >= _lastCommunityCardsLength;
    var cardEl = createCardElement(card, true, {
      flyIn: isNewCard,
      flyDelay: isNewCard ? (index - _lastCommunityCardsLength) * 80 : 0,
      extraClass: 'card-board'
    });
    communityCardsEl.appendChild(cardEl);
  });
  _lastCommunityCardsLength = cards.length;
}

// 根据玩家手牌 + 公共牌判断是否为大牌，并在头像上方飘出对应文字
function showBigHandBadges(gameState) {
  try {
    if (!gameState || !gameState.communityCards || gameState.communityCards.length < 3) return;
    if (gameState.gameState !== 'showdown' && gameState.gameState !== 'ended') return;
    if (!currentGameState || !currentGameState.players) return;

    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;

    // 清理旧的提示
    var oldBadges = tableEl.querySelectorAll('.hand-badge');
    oldBadges.forEach(function(el) { el.remove(); });

    var myPlayer = currentGameState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;

    currentGameState.players.forEach(function(p) {
      if (!p || !p.hand || p.hand.length < 2) return;
      var best = clientFindBestHand(p.hand, gameState.communityCards || []);
      if (!best) return;

      var label = null;
      switch (best.type) {
        case 'royal-flush':
          label = '皇家同花顺';
          break;
        case 'straight-flush':
          label = '同花顺';
          break;
        case 'four-of-a-kind':
          label = '四条';
          break;
        case 'full-house':
          label = '葫芦';
          break;
        case 'flush':
          label = '同花';
          break;
        case 'straight':
          label = '顺子';
          break;
        case 'three-of-a-kind':
          label = '三条';
          break;
        default:
          break;
      }
      if (!label) return;

      var displaySeat = (p.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;

      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var rect = avatarEl.getBoundingClientRect();
      var tableRect = tableEl.getBoundingClientRect();

      var badge = document.createElement('div');
      badge.className = 'hand-badge';
      badge.textContent = label;
      badge.style.left = (rect.left - tableRect.left + rect.width / 2) + 'px';
      badge.style.top = (rect.top - tableRect.top - 24) + 'px';

      tableEl.appendChild(badge);
    });
  } catch (e) {
    console.log('showBigHandBadges error', e);
  }
}

// 客户端评估最佳 5 张牌的大牌类型（与服务端逻辑对应的简化版）
function clientGetCardValue(rank) {
  var map = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return map[rank] || 0;
}

function clientEvaluateFiveCards(cards) {
  var sorted = cards.slice().sort(function(a, b) {
    return clientGetCardValue(b.rank) - clientGetCardValue(a.rank);
  });
  var values = sorted.map(function(c) { return clientGetCardValue(c.rank); });
  var suits = sorted.map(function(c) { return c.suit; });

  var counts = {};
  values.forEach(function(v) { counts[v] = (counts[v] || 0) + 1; });
  var byCountThenValue = Object.keys(counts)
    .map(function(v) { return { value: parseInt(v, 10), count: counts[v] }; })
    .sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return b.value - a.value;
    });

  var isFlush = suits.every(function(s) { return s === suits[0]; });
  var uniqueDesc = Array.from(new Set(values));
  var uniqueAsc = uniqueDesc.slice().sort(function(a, b) { return a - b; });

  var isStraight = false;
  var straightHigh = 0;
  if (uniqueAsc.length >= 5) {
    for (var i = 0; i <= uniqueAsc.length - 5; i++) {
      var ok = true;
      for (var j = 0; j < 4; j++) {
        if (uniqueAsc[i + j + 1] !== uniqueAsc[i] + j + 1) {
          ok = false;
          break;
        }
      }
      if (ok) {
        isStraight = true;
        straightHigh = uniqueAsc[i + 4];
      }
    }
  }
  // A-5 顺子
  if (!isStraight &&
      uniqueDesc.indexOf(14) !== -1 &&
      uniqueDesc.indexOf(5) !== -1 &&
      uniqueDesc.indexOf(4) !== -1 &&
      uniqueDesc.indexOf(3) !== -1 &&
      uniqueDesc.indexOf(2) !== -1) {
    isStraight = true;
    straightHigh = 5;
  }

  // 同花顺 / 皇家同花顺
  if (isFlush && isStraight) {
    var isRoyal = straightHigh === 14;
    return {
      type: isRoyal ? 'royal-flush' : 'straight-flush',
      category: isRoyal ? 9 : 8
    };
  }

  // 四条
  if (byCountThenValue[0].count === 4) {
    return { type: 'four-of-a-kind', category: 7 };
  }

  // 葫芦
  if (byCountThenValue[0].count === 3 && byCountThenValue[1] && byCountThenValue[1].count >= 2) {
    return { type: 'full-house', category: 6 };
  }

  // 同花
  if (isFlush) {
    return { type: 'flush', category: 5 };
  }

  // 顺子
  if (isStraight) {
    return { type: 'straight', category: 4 };
  }

  // 三条
  if (byCountThenValue[0].count === 3) {
    return { type: 'three-of-a-kind', category: 3 };
  }

  // 其它情况不用提示
  return { type: 'other', category: 0 };
}

function clientFindBestHand(holeCards, communityCards) {
  var cards = (holeCards || []).concat(communityCards || []);
  if (cards.length < 5) return null;
  var n = cards.length;
  var best = null;

  for (var a = 0; a < n - 4; a++) {
    for (var b = a + 1; b < n - 3; b++) {
      for (var c = b + 1; c < n - 2; c++) {
        for (var d = c + 1; d < n - 1; d++) {
          for (var e = d + 1; e < n; e++) {
            var five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            var hand = clientEvaluateFiveCards(five);
            if (!best || hand.category > best.category) {
              best = hand;
            }
          }
        }
      }
    }
  }
  return best;
}

function createCardElement(card, faceUp, options) {
  options = options || {};
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  if (options.extraClass) {
    cardEl.classList.add(options.extraClass);
  }
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

// 检测是否有“他人（含 AI）”下注导致底池增加，若有则播放下注音效
function playBetSoundIfSomeoneElseBet(prevState, nextState) {
  if (!prevState || !nextState || !prevState.players || !nextState.players) return;
  if (typeof prevState.pot !== 'number' || typeof nextState.pot !== 'number') return;
  if (nextState.pot <= prevState.pot) return;
  var prevById = {};
  var prevBySeat = {};
  prevState.players.forEach(function(p) {
    if (!p) return;
    if (p.socketId) prevById[p.socketId] = p;
    if (typeof p.seat === 'number') prevBySeat[p.seat] = p;
  });
  var someoneElseBet = false;
  nextState.players.forEach(function(p) {
    if (!p || p.socketId === mySocketId) return;
    var prev = prevById[p.socketId] || (typeof p.seat === 'number' ? prevBySeat[p.seat] : null);
    if (!prev) return;
    if (p.bet > prev.bet || p.chips < prev.chips) someoneElseBet = true;
  });
  if (someoneElseBet) playSound('bet');
}

function clearPotFlyChips() {
  try {
    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;
    var chips = tableEl.querySelectorAll('.chip-fly-pot');
    chips.forEach(function(el) { el.remove(); });
  } catch (e) {
    console.log('clearPotFlyChips error', e);
  }
}

function animatePotChips(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    if (!prevState.players || !nextState.players) return;
    if (typeof prevState.pot !== 'number' || typeof nextState.pot !== 'number') return;
    if (nextState.pot <= prevState.pot) return; // 底池没变就不飞筹码

    playBetSoundIfSomeoneElseBet(prevState, nextState);

    var tableEl = document.querySelector('.poker-table');
    var communityEl = document.getElementById('communityCards');
    if (!tableEl || !communityEl) return;

    var selfPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = selfPlayer ? selfPlayer.seat : 0;

    var tableRect = tableEl.getBoundingClientRect();
    var cRect = communityEl.getBoundingClientRect();

    // 目标垂直范围：公共牌顶部往上 150px 内随机
    var bandBottomAbs = cRect.top;
    var bandTopAbs = cRect.top - 150;
    if (bandTopAbs < tableRect.top) bandTopAbs = tableRect.top;
    if (bandBottomAbs - bandTopAbs < 20) bandBottomAbs = bandTopAbs + 20;

    // 目标水平范围：公共牌区域左右各预留 10px
    var leftAbs = cRect.left + 10;
    var rightAbs = cRect.right - 10;
    if (rightAbs <= leftAbs) {
      leftAbs = cRect.left;
      rightAbs = cRect.right;
    }

    var prevById = {};
    prevState.players.forEach(function(p) {
      if (p && p.socketId) prevById[p.socketId] = p;
    });

    nextState.players.forEach(function(p) {
      if (!p || !p.socketId) return;
      var prev = prevById[p.socketId];
      if (!prev) return;

      var prevBet = prev.bet || 0;
      var currBet = p.bet || 0;
      var prevChips = prev.chips || 0;
      var currChips = p.chips || 0;

      var betIncreased = currBet > prevBet;
      var chipsDecreased = currChips < prevChips;

      if (!betIncreased && !chipsDecreased) return; // 没有新下注

      var displaySeat = (p.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;

      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var fromRect = avatarEl.getBoundingClientRect();

      var startLeft = fromRect.left - tableRect.left + fromRect.width / 2 - 10;
      var startTop = fromRect.top - tableRect.top + fromRect.height / 2 - 10;

      var chipCount = 1;
      if (p.action === 'all-in') {
        chipCount = 2 + Math.floor(Math.random() * 2); // 2 或 3 个筹码
      }

      for (var i = 0; i < chipCount; i++) {
        (function() {
          var chipEl = document.createElement('div');
          chipEl.className = 'chip-fly chip-fly-pot';
          chipEl.style.left = startLeft + 'px';
          chipEl.style.top = startTop + 'px';
          tableEl.appendChild(chipEl);

          requestAnimationFrame(function() {
            var targetXAbs = leftAbs + Math.random() * (rightAbs - leftAbs);
            var targetYAbs = bandTopAbs + Math.random() * (bandBottomAbs - bandTopAbs);
            var targetXRel = targetXAbs - tableRect.left;
            var targetYRel = targetYAbs - tableRect.top;
            var dx = targetXRel - startLeft;
            var dy = targetYRel - startTop;
            var jitterX = (Math.random() - 0.5) * 6;
            var jitterY = (Math.random() - 0.5) * 4;
            dx += jitterX;
            dy += jitterY;
            chipEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          });
        })();
      }
    });
  } catch (e) {
    console.log('animatePotChips error', e);
  }
}

/** 局结束：底池筹码从中间飞向获胜者头像，停留 1.5 秒后移除（下一局由服务端约 2 秒后发牌） */
function animatePotToWinners(prevState, nextState) {
  try {
    if (!prevState || !nextState || nextState.gameState !== 'ended') return;
    var pot = prevState.pot;
    if (typeof pot !== 'number' || pot <= 0) return;
    if (!prevState.players || !nextState.players) return;

    var prevBySocketId = {};
    prevState.players.forEach(function(p) {
      if (p && p.socketId) prevBySocketId[p.socketId] = p;
    });
    var winners = nextState.players.filter(function(p) {
      var prevP = prevBySocketId[p.socketId];
      return prevP && (p.chips || 0) > (prevP.chips || 0);
    });
    if (winners.length === 0) return;

    var tableEl = document.querySelector('.poker-table');
    var potArea = document.querySelector('.pot-display') || document.getElementById('potIcon');
    if (!tableEl || !potArea) return;

    var tableRect = tableEl.getBoundingClientRect();
    var potRect = potArea.getBoundingClientRect();
    var centerX = potRect.left - tableRect.left + potRect.width / 2;
    var centerY = potRect.top - tableRect.top + potRect.height / 2;

    var myPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;

    var chipsPerWinner = 5;
    var durationMs = 500;
    var stayMs = 1500;

    winners.forEach(function(winner) {
      var displaySeat = (winner.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;
      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var avatarRect = avatarEl.getBoundingClientRect();
      var targetX = avatarRect.left - tableRect.left + avatarRect.width / 2 - 10;
      var targetY = avatarRect.top - tableRect.top + avatarRect.height / 2 - 10;
      var dx = targetX - centerX;
      var dy = targetY - centerY;

      for (var i = 0; i < chipsPerWinner; i++) {
        var chipEl = document.createElement('div');
        chipEl.className = 'chip-fly chip-fly-to-winner';
        chipEl.style.left = (centerX - 10) + 'px';
        chipEl.style.top = (centerY - 10) + 'px';
        chipEl.style.transition = 'transform ' + (durationMs / 1000) + 's ease-out, opacity ' + (durationMs / 1000) + 's ease-out';
        tableEl.appendChild(chipEl);
        requestAnimationFrame(function() {
          chipEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        });
        setTimeout(function() {
          chipEl.remove();
        }, durationMs + stayMs);
      }
    });
  } catch (e) {
    console.log('animatePotToWinners error', e);
  }
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

  // 发牌顺序计数器：用于控制 preflop 时每张牌的动画延迟，实现一张张顺时针发牌的效果
  var dealIndex = 0;
  var handFlyIn = _isNewDealPreflop && gameState.gameState === 'preflop';
  if (handFlyIn) playSound('card');

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
    // 👑 标记庄家：始终跟随当前 dealerSeat，而不是房主
    if (typeof gameState.dealerSeat === 'number' && player.seat === gameState.dealerSeat) {
      displayName += ' 👑';
    }
    nameEl.innerHTML = displayName;
    chipsEl.innerHTML = '<span class=\"chip-icon\"></span>' + player.chips;
    
    if (player.bet > 0) {
      betEl.textContent = '下注: ' + player.bet;
    }
    
    var gameStateValue = currentGameState ? currentGameState.gameState : 'waiting';
    if (player.action) {
      if (player.action === 'all-in') {
        statusEl.textContent = '';
      } else if (player.socketId === mySocketId && gameStateValue !== 'waiting') {
        statusEl.textContent = getActionText(player.action);
      }
    }
    
    if (player.seat === gameState.currentPlayerSeat) {
      seatEl.classList.add('active');
    }
    if (player.folded) {
      seatEl.classList.add('folded');
    }
    if (player.allIn) {
      seatEl.classList.add('all-in');
    }
    
    if (player.hand && player.hand.length > 0) {
      if (player.socketId === mySocketId) {
        player.hand.forEach(function(card, idx) {
          var delay = handFlyIn ? dealIndex * 120 : 0;
          cardsEl.appendChild(createCardElement(card, true, {
            flyIn: handFlyIn,
            flyDelay: delay,
            extraClass: 'card-my'
          }));
          if (handFlyIn) setTimeout(function() { playSound('card'); }, delay);
          dealIndex++;
        });
      } else if (gameState.gameState === 'showdown' || gameState.gameState === 'ended') {
        player.hand.forEach(function(card) {
          cardsEl.appendChild(createCardElement(card, true));
        });
      } else {
        for (var i = 0; i < 2; i++) {
          var delayBack = handFlyIn ? dealIndex * 120 : 0;
          cardsEl.appendChild(createCardElement({}, false, { flyIn: handFlyIn, flyDelay: delayBack }));
          if (handFlyIn) setTimeout(function() { playSound('card'); }, delayBack);
          dealIndex++;
        }
      }
    } else if (gameState.gameState !== 'waiting') {
      for (var i = 0; i < 2; i++) {
        var delayBack2 = handFlyIn ? dealIndex * 120 : 0;
        cardsEl.appendChild(createCardElement({}, false, { flyIn: handFlyIn, flyDelay: delayBack2 }));
        if (handFlyIn) setTimeout(function() { playSound('card'); }, delayBack2);
        dealIndex++;
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

// 更新行动倒计时光圈位置（放在当前行动玩家头像上方）
function updateActionTimerPosition(gameState) {
  var timerEl = document.getElementById('actionTimer');
  if (!timerEl) return;

  if (gameState.currentPlayerSeat == null || gameState.currentPlayerSeat === -1) {
    timerEl.classList.add('hidden');
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
  var displaySeat = (gameState.currentPlayerSeat - mySeatIndex + 5) % 5;

  var seatEl = document.getElementById('seat-' + displaySeat);
  var tableEl = document.querySelector('.poker-table');
  if (!seatEl || !tableEl) {
    timerEl.classList.add('hidden');
    return;
  }

  var rect = seatEl.getBoundingClientRect();
  var avatarEl = seatEl.querySelector('.player-avatar');
  if (avatarEl) {
    rect = avatarEl.getBoundingClientRect();
  }
  var tableRect = tableEl.getBoundingClientRect();

  timerEl.style.left = (rect.left - tableRect.left + rect.width / 2 - 16) + 'px';
  timerEl.style.top = (rect.top - tableRect.top + rect.height / 2 - 16) + 'px';
}

function updateActionPanel(gameState) {
  var myPlayer = null;
  for (var i = 0; i < gameState.players.length; i++) {
    if (gameState.players[i].socketId === mySocketId) {
      myPlayer = gameState.players[i];
      break;
    }
  }
  
  if (!myPlayer) {
    disableAllButtons();
    return;
  }

  // 已弃牌、全下或筹码为 0 时不再显示操作
  if (myPlayer.folded || myPlayer.chips <= 0 || gameState.gameState === 'ended') {
    disableAllButtons();
    return;
  }

  var isMyTurn = gameState.currentPlayerSeat === myPlayer.seat;
  
  if (!isMyTurn) {
    actionText.textContent = '';
    disableAllButtons();
    return;
  }

  if (raiseAmountPanel) raiseAmountPanel.classList.remove('hidden');
  var currentBet = myPlayer.bet || 0;
  var toCall = gameState.currentBet - currentBet;
  
  actionText.textContent = '';
  
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
  if (raiseAmountPanel) raiseAmountPanel.classList.add('hidden');
}

// 更新 AI+1 按钮（仅房主在等待开局时可用）
function updateBotButton(gameState) {
  if (!aiAssistBtn) return;

  const myPlayer = gameState.players.find(function(p) { return p.socketId === mySocketId; });
  if (!myPlayer) {
    aiAssistBtn.disabled = true;
    if (startGameBtn) startGameBtn.disabled = true;
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

  // 开始游戏按钮：房主且人数 >= 2 且在 waiting/ended 状态
  if (startGameBtn) {
    const activePlayers = gameState.players.filter(function(p) { return p.chips > 0; });
    const canStart =
      socket.id === gameState.hostId &&
      activePlayers.length >= 2 &&
      (gameState.gameState === 'waiting' || gameState.gameState === 'ended');

    if (gameState.gameState === 'waiting' || gameState.gameState === 'ended') {
      startGameBtn.classList.toggle('hidden', !canStart);
      startGameBtn.disabled = !canStart;
      if (canStart) {
        startGameBtn.textContent = '开始游戏';
      }
    } else {
      startGameBtn.classList.add('hidden');
    }
  }
}

// ============ 倒计时 ============
function startActionTimer(gameState) {
  stopActionTimer();

  if (!gameState ||
      gameState.currentPlayerSeat == null ||
      gameState.currentPlayerSeat === -1 ||
      gameState.gameState === 'waiting' ||
      gameState.gameState === 'ended') {
    return;
  }

  actionTimeLeft = 12;

  // 找到当前行动玩家对应的座位与外框，用于绘制顺时针进度条
  countdownSeatEl = null;
  countdownInfoEl = null;

  try {
    var myPlayer = null;
    if (gameState.players && gameState.players.length) {
      for (var i = 0; i < gameState.players.length; i++) {
        if (gameState.players[i].socketId === mySocketId) {
          myPlayer = gameState.players[i];
          break;
        }
      }
    }
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;
    var displaySeat = (gameState.currentPlayerSeat - mySeatIndex + 5) % 5;
    var seatEl = document.getElementById('seat-' + displaySeat);
    if (seatEl) {
      var infoEl = seatEl.querySelector('.player-info');
      if (infoEl) {
        // 确保进度条容器存在
        var ring = infoEl.querySelector('.seat-timer-ring');
        if (!ring) {
          ring = document.createElement('div');
          ring.className = 'seat-timer-ring';
          infoEl.appendChild(ring);
        }
        countdownSeatEl = seatEl;
        countdownInfoEl = infoEl;
        seatEl.classList.add('countdown-active');
        infoEl.style.setProperty('--timer-deg', '360deg');
      }
    }
  } catch (e) {
    console.log('startActionTimer find seat error', e);
  }
  
  // 0.02 秒一跳，视觉更顺滑
  actionTimer = setInterval(function() {
    actionTimeLeft -= 0.02;
    // 更新玩家外框顺时针进度条
    if (countdownInfoEl) {
      var ratio = Math.max(0, Math.min(1, actionTimeLeft / 12));
      var deg = Math.floor(ratio * 360);
      countdownInfoEl.style.setProperty('--timer-deg', deg + 'deg');
    }

    if (actionTimeLeft <= 0) {
      stopActionTimer();

      // 只有当前行动玩家的客户端在超时时自动弃牌
      var myPlayer = null;
      if (currentGameState && currentGameState.players) {
        for (var i = 0; i < currentGameState.players.length; i++) {
          if (currentGameState.players[i].socketId === mySocketId) {
            myPlayer = currentGameState.players[i];
            break;
          }
        }
      }
      var isMyTurn = myPlayer &&
        currentGameState &&
        currentGameState.currentPlayerSeat === myPlayer.seat &&
        !myPlayer.folded &&
        myPlayer.chips > 0 &&
        currentGameState.gameState !== 'ended';

      if (isMyTurn) {
        socket.emit('playerAction', 'fold', 0, function(response) {
          if (!response.success) {
            console.log('自动弃牌:', response.message);
          }
        });
      }
    }
  }, 20);
}

function stopActionTimer() {
  if (actionTimer) {
    clearInterval(actionTimer);
    actionTimer = null;
  }

  // 清理外框进度条高亮
  if (countdownSeatEl) {
    countdownSeatEl.classList.remove('countdown-active');
  }
  if (countdownInfoEl) {
    countdownInfoEl.style.removeProperty('--timer-deg');
  }
  countdownSeatEl = null;
  countdownInfoEl = null;
}

// ============ 表情功能 ============
function setupEmojiButtons() {
  var popupPanel = document.getElementById('emojiPopupPanel');
  if (popupPanel) {
    var emojiBtns = popupPanel.querySelectorAll('.emoji-btn');
    emojiBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        playSound('button');
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
  playSound('button');
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

// （AI 建议功能已移除）

function loadVersionLabel() {
  try {
    var el = document.getElementById('versionLabel');
    if (!el) return;
    fetch('/version')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var text = '版本标签：';
        if (data && data.sha) {
          text += data.sha.substring(0, 7);
        } else if (data && data.version) {
          text += data.version;
        } else {
          text += '加载中...';
        }
        el.textContent = text;
      })
      .catch(function() {
        var el2 = document.getElementById('versionLabel');
        if (el2) el2.textContent = '版本标签：--';
      });
  } catch (e) {}
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing...');
  initDOMElements();
  loadNickname();
  setupEventListeners();
  setupEmojiButtons();
  startHeartbeat();
  loadVersionLabel();
  showPage('lobby');
  console.log('Initialization complete');
});
