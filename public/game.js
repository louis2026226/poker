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
  chips: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  winRate: 0
};

// 语言配置（默认中文，可切换英文，后续可扩展更多）
let currentLang = 'zh';
const SUPPORTED_LANGS = ['zh', 'en'];

const I18N = {
  zh: {
    title: '路易斯德州',
    lobbySubtitle: '与好友一起畅玩',
    labelNickname: '昵称',
    labelChips: '金币',
    labelWinRate: '胜率',
    labelGames: '场次',
    placeholderNickname: '请输入昵称',
    placeholderRoomCode: '请输入5位房间号',
    btnCreateRoom: '创建房间',
    btnJoinRoom: '加入房间',
    versionLabel: '版本标签：',
    roomCodeLabel: '房号:',
    btnLeaveRoom: '离开房间',
    dealerTip: '打赏 50',
    btnFold: '弃牌',
    btnCheck: '过牌',
    btnCall: '跟注',
    btnRaise: '加注',
    btnAllIn: '全下',
    btnStartGame: '开始游戏',
    btnStartGameCreating: '开始中...',
    modalTitleRoundEnd: '回合结束',
    btnNewGame: '再来一局',
    totalLabel: '总额：',
    currentBetLabel: '当前下注: ',
    betLabel: '下注: ',
    meSuffix: ' (我)',
    waitingCount: '等待玩家加入 (x/5)',
    timeLabel: '时间：',
    durationLabel: '耗时：',
    previewChips: '下注后剩余: ',
    previewChipsUnit: ' 筹码',
    roomCodeCopied: '房间号已复制: ',
    copyRoomCodeTitle: '点击复制',
    versionLoading: '加载中...',
    versionUnknown: '--',
    createRoomCreating: '创建中...',
    createRoomFail: '创建房间失败',
    joinConfirm: '确认加入',
    joinJoining: '加入中...',
    joinTimeout: '请求超时，请检查房间号与网络后重试',
    joinFail: '加入房间失败',
    connectFail: '无法连接服务器，请确认地址正确或稍后重试',
    enterNickname: '请输入昵称',
    enterNicknameAndRoom: '请输入昵称和房间号',
    enterRoomCode: '请输入5位房间号',
    startGameError: '无法开始游戏，请稍后重试',
    statusMap: {
      waiting: '等待玩家加入...',
      preflop: '翻牌前',
      flop: '翻牌圈',
      turn: '转牌圈',
      river: '河牌圈',
      showdown: '摊牌',
      ended: '游戏结束'
    },
    actionText: {
      fold: '已弃牌',
      check: '看牌',
      call: '跟注',
      raise: '加注',
      'all-in': '全下'
    },
    settlementAction: {
      'small-blind': '小盲注',
      'big-blind': '大盲注',
      bet: '下注',
      raise: '加注',
      call: '跟注',
      check: '过牌',
      fold: '弃牌',
      'all-in': '全压',
      win: '获胜'
    },
    handRanks: {
      'royal-flush': '皇家同花顺',
      'straight-flush': '同花顺',
      'four-of-a-kind': '四条',
      'full-house': '葫芦',
      'flush': '同花',
      'straight': '顺子',
      'three-of-a-kind': '三条'
    },
    dealerPhrases: {
      thanks_boss: '谢谢老板！',
      wish_luck: '祝您手气长红！',
      thanks_tip: '多谢打赏，祝您把把好牌！',
      good_luck: '感谢打赏，好运连连！',
      big_tip: '老板大气！祝您赢大池！',
      kill_today: '谢谢～祝您今晚大杀四方！',
      run_good: '感恩打赏，牌运亨通！'
    }
  },
  en: {
    title: 'Louis Poker',
    lobbySubtitle: 'Play with friends',
    labelNickname: 'Name',
    labelChips: 'Chips',
    labelWinRate: 'Win Rate',
    labelGames: 'Games',
    placeholderNickname: 'Enter nickname',
    placeholderRoomCode: 'Enter 5-digit room code',
    btnCreateRoom: 'Create Room',
    btnJoinRoom: 'Join Room',
    versionLabel: 'Version: ',
    roomCodeLabel: 'Room:',
    btnLeaveRoom: 'Leave Room',
    dealerTip: 'Tip 50',
    btnFold: 'Fold',
    btnCheck: 'Check',
    btnCall: 'Call',
    btnRaise: 'Raise',
    btnAllIn: 'All-in',
    btnStartGame: 'Start Game',
    btnStartGameCreating: 'Starting...',
    modalTitleRoundEnd: 'Round Ended',
    btnNewGame: 'Play Again',
    totalLabel: 'Total: ',
    currentBetLabel: 'Current bet: ',
    betLabel: 'Bet: ',
    meSuffix: ' (Me)',
    waitingCount: 'Waiting for players (x/5)',
    timeLabel: 'Time: ',
    durationLabel: 'Duration: ',
    previewChips: 'Chips after bet: ',
    previewChipsUnit: '',
    roomCodeCopied: 'Room code copied: ',
    copyRoomCodeTitle: 'Click to copy',
    versionLoading: 'Loading...',
    versionUnknown: '--',
    createRoomCreating: 'Creating...',
    createRoomFail: 'Failed to create room',
    joinConfirm: 'Confirm',
    joinJoining: 'Joining...',
    joinTimeout: 'Request timeout. Check room code and network',
    joinFail: 'Failed to join room',
    connectFail: 'Cannot connect to server. Check URL or try again later',
    enterNickname: 'Please enter nickname',
    enterNicknameAndRoom: 'Please enter nickname and room code',
    enterRoomCode: 'Please enter 5-digit room code',
    startGameError: 'Failed to start game. Please try again',
    statusMap: {
      waiting: 'Waiting for players...',
      preflop: 'Preflop',
      flop: 'Flop',
      turn: 'Turn',
      river: 'River',
      showdown: 'Showdown',
      ended: 'Round ended'
    },
    actionText: {
      fold: 'Folded',
      check: 'Check',
      call: 'Call',
      raise: 'Raise',
      'all-in': 'All-in'
    },
    settlementAction: {
      'small-blind': 'SB',
      'big-blind': 'BB',
      bet: 'Bet',
      raise: 'Raise',
      call: 'Call',
      check: 'Check',
      fold: 'Fold',
      'all-in': 'All-in',
      win: 'Win'
    },
    handRanks: {
      'royal-flush': 'Royal Flush',
      'straight-flush': 'Straight Flush',
      'four-of-a-kind': 'Four of a Kind',
      'full-house': 'Full House',
      'flush': 'Flush',
      'straight': 'Straight',
      'three-of-a-kind': 'Three of a Kind'
    },
    dealerPhrases: {
      thanks_boss: 'Thanks, boss!',
      wish_luck: 'Good luck!',
      thanks_tip: 'Thanks for the tip!',
      good_luck: 'Good luck at the tables!',
      big_tip: 'Generous! Win big!',
      kill_today: 'Thanks! Run good tonight!',
      run_good: 'Thanks! Run good!'
    }
  }
};

// 服务端返回的中文文案在英文下的对应（英文版不出现中文）
var SERVER_MSG_EN = {
  '房间不存在': 'Room not found',
  '房间已满': 'Room is full',
  '无法加入房间': 'Cannot join room',
  '只有房主可以开始游戏': 'Only host can start the game',
  '至少需要两名玩家才能开始游戏': 'At least 2 players required to start',
  '游戏已经在进行中': 'Game already in progress',
  '玩家不在房间中': 'Player not in room',
  '筹码不足': 'Insufficient chips',
  '无效的动作': 'Invalid action',
  '只有房主可以重启游戏': 'Only host can restart the game',
  '需要拥有1000金币才可进入': 'You need at least 1000 gold to enter'
};
function translateServerMessage(msg) {
  if (currentLang !== 'en' || !msg || typeof msg !== 'string') return msg;
  return SERVER_MSG_EN[msg] || msg;
}

function applyTranslationsStatic() {
  var dict = I18N[currentLang] || I18N.zh;

  var titleEl = document.getElementById('lobby-title');
  if (titleEl && dict.title) titleEl.textContent = dict.title;

  var subtitle = document.querySelector('.subtitle');
  if (subtitle) subtitle.textContent = dict.lobbySubtitle;

  var statLabels = document.querySelectorAll('#playerStats .stat-item .stat-label');
  if (statLabels[0]) statLabels[0].textContent = dict.labelNickname;
  if (statLabels[1]) statLabels[1].textContent = dict.labelChips;
  if (statLabels[2]) statLabels[2].textContent = dict.labelWinRate;
  if (statLabels[3]) statLabels[3].textContent = dict.labelGames;

  if (nicknameInput) {
    nicknameInput.placeholder = dict.placeholderNickname;
    nicknameInput.setAttribute('aria-label', dict.placeholderNickname);
  }
  var roomCodeInputEl = document.getElementById('roomCode');
  if (roomCodeInputEl && dict.placeholderRoomCode) {
    roomCodeInputEl.placeholder = dict.placeholderRoomCode;
    roomCodeInputEl.setAttribute('aria-label', dict.placeholderRoomCode);
  }

  if (createRoomBtn) createRoomBtn.textContent = dict.btnCreateRoom;
  if (joinRoomBtn) joinRoomBtn.textContent = dict.btnJoinRoom;

  var versionLabelEl = document.getElementById('versionLabel');
  if (versionLabelEl) {
    var versionVal = versionLabelEl.getAttribute('data-version-value');
    if (versionVal !== null && versionVal !== undefined) {
      if (versionVal === '加载中...' || versionVal === 'Loading...') versionVal = dict.versionLoading;
      versionLabelEl.textContent = dict.versionLabel + versionVal;
    }
  }

  var roomCodeLabelEl = document.querySelector('.room-code-label');
  if (roomCodeLabelEl) roomCodeLabelEl.textContent = dict.roomCodeLabel;
  var displayRoomCodeEl = document.getElementById('displayRoomCode');
  if (displayRoomCodeEl && dict.copyRoomCodeTitle) displayRoomCodeEl.setAttribute('title', dict.copyRoomCodeTitle);

  if (leaveRoomBtn) leaveRoomBtn.textContent = dict.btnLeaveRoom;

  var confirmJoinBtnEl = document.getElementById('confirmJoinBtn');
  if (confirmJoinBtnEl) confirmJoinBtnEl.textContent = dict.joinConfirm;

  var dealerTipBtn = document.getElementById('dealerTipBtn');
  if (dealerTipBtn) dealerTipBtn.textContent = dict.dealerTip;

  if (foldBtn) foldBtn.textContent = dict.btnFold;
  if (checkBtn) checkBtn.textContent = dict.btnCheck;
  if (callBtn) callBtn.textContent = dict.btnCall;
  if (raiseBtn) raiseBtn.textContent = dict.btnRaise;
  if (allInBtn) allInBtn.textContent = dict.btnAllIn;
  if (startGameBtn) startGameBtn.textContent = dict.btnStartGame;

  var aiAssistBtnEl = document.getElementById('ai-assist-btn');
  if (aiAssistBtnEl) aiAssistBtnEl.setAttribute('aria-label', currentLang === 'en' ? 'Add bot' : '添加机器人');

  var modalTitle = document.querySelector('#gameOverModal h2');
  if (modalTitle) modalTitle.textContent = dict.modalTitleRoundEnd;

  if (newGameBtn) newGameBtn.textContent = dict.btnNewGame;

  var totalEl = document.getElementById('totalChips');
  if (totalEl) {
    var num = totalEl.getAttribute('data-value') || '0';
    totalEl.textContent = dict.totalLabel + num;
  }

  document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';

  var ariaMap = currentLang === 'en' ? {
    '#lobby': 'Game Lobby',
    '#playerStats': 'Player Stats',
    '#statNickname': 'Nickname',
    '#statChips': 'Chips',
    '#statWinRate': 'Win Rate',
    '#statGames': 'Games Played',
    '.lobby-form': 'Login Form',
    '#createRoomBtn': 'Create Room',
    '#joinRoomBtn': 'Join Room',
    '#versionLabel': 'Version',
    '#joinForm': 'Join Room Form',
    '#confirmJoinBtn': 'Confirm Join',
    '#gameRoom': 'Game Room',
    '#leaveRoomBtn': 'Leave Room',
    '#dealerTipBtn': 'Tip Dealer 50',
    '#dealerImage': 'Dealer',
    '.poker-table': 'Poker Table',
    '.community-area': 'Community Cards & Pot',
    '#communityCards': 'Community Cards',
    '#potIcon': 'Pot',
    '#potAmount': 'Pot Amount',
    '#currentBetDisplay': 'Current Bet',
    '#actionTimer': 'Countdown',
    '#timerText': 'Time Remaining',
    '#actionPanel': 'Action Panel',
    '#raiseAmountPanel': 'Raise Amount',
    '#raiseSlider': 'Raise Amount',
    '#foldBtn': 'Fold',
    '#checkBtn': 'Check',
    '#callBtn': 'Call',
    '#raiseBtn': 'Raise',
    '#allInBtn': 'All-in',
    '#startGameBtn': 'Start Game',
    '#emojiPopupPanel': 'Send Emoji',
    '#seat-0': 'Your Seat',
    '#myCards': 'Your Hand'
  } : null;

  if (ariaMap) {
    Object.keys(ariaMap).forEach(function(sel) {
      var el = document.querySelector(sel);
      if (el) el.setAttribute('aria-label', ariaMap[sel]);
    });
    var srLabel = document.querySelector('label[for="raiseSlider"]');
    if (srLabel) srLabel.textContent = 'Raise amount slider';
  } else {
    var srLabel = document.querySelector('label[for="raiseSlider"]');
    if (srLabel) srLabel.textContent = '加注金额滑块';
  }

  var emojiAriaMap = currentLang === 'en' ? {
    '👍': 'Thumbs Up', '👎': 'Thumbs Down', '😄': 'Happy', '😭': 'Sad',
    '🎉': 'Celebrate', '🤔': 'Thinking', '👏': 'Clap', '🙏': 'Thanks'
  } : {
    '👍': '点赞', '👎': '反对', '😄': '开心', '😭': '哭泣',
    '🎉': '庆祝', '🤔': '思考', '👏': '鼓掌', '🙏': '感谢'
  };
  document.querySelectorAll('.emoji-btn').forEach(function(btn) {
    var emoji = btn.getAttribute('data-emoji');
    if (emoji && emojiAriaMap[emoji]) btn.setAttribute('aria-label', emojiAriaMap[emoji]);
  });

  var seatAriaEn = { 'seat-1': 'Seat 1 - Left', 'seat-2': 'Seat 2 - Left', 'seat-3': 'Seat 3 - Right', 'seat-4': 'Seat 4 - Right' };
  var seatAriaZh = { 'seat-1': '座位1 - 左侧玩家', 'seat-2': '座位2 - 左侧玩家', 'seat-3': '座位3 - 右侧玩家', 'seat-4': '座位4 - 右侧玩家' };
  var seatMap = currentLang === 'en' ? seatAriaEn : seatAriaZh;
  Object.keys(seatMap).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.setAttribute('aria-label', seatMap[id]);
  });
}

function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'zh';
  currentLang = lang;
  try {
    localStorage.setItem('poker_lang', currentLang);
  } catch (e) {}
  applyTranslationsStatic();
  if (currentGameState) {
    updateGameStatus(currentGameState);
  }
}

function initLanguage() {
  var saved = null;
  try {
    saved = localStorage.getItem('poker_lang');
  } catch (e) {}
  if (saved && SUPPORTED_LANGS.includes(saved)) {
    currentLang = saved;
  }
  applyTranslationsStatic();
}

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

  var langBtn = document.getElementById('langToggleBtn');
  if (langBtn) {
    langBtn.addEventListener('click', function() {
      setLanguage(currentLang === 'zh' ? 'en' : 'zh');
    });
  }

  if (nicknameInput) {
    nicknameInput.addEventListener('blur', function() {
      var name = nicknameInput.value.trim();
      if (name && name !== playerStats.nickname) {
        playerStats.nickname = name;
        fetchPlayerGold(name);
      }
    });
  }
}

function loadNickname() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && nicknameInput) {
    nicknameInput.value = saved;
    playerStats.nickname = saved;
    fetchPlayerGold(saved);
  }
}

function saveNickname(nickname) {
  localStorage.setItem(STORAGE_KEY, nickname);
  playerStats.nickname = nickname;
}

function fetchPlayerGold(nickname) {
  if (!nickname) return;
  fetch('/api/player/' + encodeURIComponent(nickname))
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data && data.success) {
        playerStats.chips = data.gold;
        playerStats.gamesPlayed = data.gamesPlayed || 0;
        playerStats.gamesWon = data.gamesWon || 0;
        playerStats.winRate = playerStats.gamesPlayed >= 10
          ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100) : 0;
        updatePlayerStatsDisplay();
      }
    })
    .catch(function() {});
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
  updatePlayerStatsDisplay();
}

function finishGame(won, finalChips) {
  playerStats.chips = finalChips;
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

  applyTranslationsStatic();
}

// ============ 事件监听 ============
function setupEventListeners() {
  // 创建房间
  if (createRoomBtn) {
    createRoomBtn.addEventListener('click', function() {
      playSound('button');
      console.log('Create room clicked');
      var dict = I18N[currentLang] || I18N.zh;
      if (!socket.connected) {
        alert(dict.connectFail);
        return;
      }
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        alert(dict.enterNickname);
        return;
      }
      saveNickname(nickname);
      createRoomBtn.disabled = true;
      createRoomBtn.textContent = dict.createRoomCreating;
      var timeout = setTimeout(function() {
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = dict.btnCreateRoom;
        alert(dict.joinTimeout);
      }, 15000);
      socket.emit('createRoom', nickname, function(response) {
        clearTimeout(timeout);
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = dict.btnCreateRoom;
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(translateServerMessage(response && response.message ? response.message : dict.createRoomFail));
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
      var dict = I18N[currentLang] || I18N.zh;
      if (!socket.connected) {
        alert(dict.connectFail);
        return;
      }
      const nickname = nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim();
      if (!nickname || !roomCode) {
        alert(dict.enterNicknameAndRoom);
        return;
      }
      if (roomCode.length !== 5) {
        alert(dict.enterRoomCode);
        return;
      }
      saveNickname(nickname);
      confirmJoinBtn.disabled = true;
      confirmJoinBtn.textContent = dict.joinJoining;
      var timeout = setTimeout(function() {
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = dict.joinConfirm;
        alert(dict.joinTimeout);
      }, 15000);
      socket.emit('joinRoom', roomCode, nickname, function(response) {
        clearTimeout(timeout);
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = dict.joinConfirm;
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(translateServerMessage(response && response.message ? response.message : dict.joinFail));
        }
      });
    });
  }
  
  // 离开房间
  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', function() {
      playSound('button');
      socket.emit('leaveRoom', function() {
        location.reload();
      });
      setTimeout(function() { location.reload(); }, 500);
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
      var dict = I18N[currentLang] || I18N.zh;
      startGameBtn.textContent = dict.btnStartGameCreating || dict.btnStartGame;
      socket.emit('startGame', function(response) {
        if (!response || !response.success) {
          startGameBtn.disabled = false;
          var dictFail = I18N[currentLang] || I18N.zh;
          startGameBtn.textContent = dictFail.btnStartGame;
          alert(translateServerMessage(response && response.message ? response.message : dictFail.startGameError));
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
  var dict = I18N[currentLang] || I18N.zh;
  if (createRoomBtn) { createRoomBtn.disabled = false; createRoomBtn.textContent = dict.btnCreateRoom; }
  if (confirmJoinBtn) { confirmJoinBtn.disabled = false; confirmJoinBtn.textContent = dict.joinConfirm; }
});
socket.on('connect_error', function(err) {
  console.log('Connect error:', err.message);
  var dict = I18N[currentLang] || I18N.zh;
  alert(dict.connectFail);
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
  var dict = I18N[currentLang] || I18N.zh;
  var phrase = '';
  if (data.phraseKey && dict.dealerPhrases && dict.dealerPhrases[data.phraseKey] !== undefined) {
    phrase = dict.dealerPhrases[data.phraseKey];
  } else if (data.phrase) {
    phrase = data.phrase;
  }
  el.textContent = phrase;
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

      var dict = I18N[currentLang] || I18N.zh;
      var actionTextMap = dict.settlementAction;

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
      if (timeStr) metaParts.push(dict.timeLabel + timeStr);
      if (durationStr) metaParts.push(dict.durationLabel + durationStr);

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
  
  var dict = I18N[currentLang] || I18N.zh;
  if (gameState.currentBet > 0) {
    currentBetDisplay.textContent = dict.currentBetLabel + gameState.currentBet;
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

  // 同步总额显示
  updateTotalChipsDisplay(gameState);
}

function updateDealerTipButton(gameState) {
  var btn = document.getElementById('dealerTipBtn');
  if (!btn) return;
  var myPlayer = gameState && gameState.players ? gameState.players.find(function(p) { return p.socketId === mySocketId; }) : null;
  btn.disabled = !myPlayer || myPlayer.chips < 50;
}

function updateTotalChipsDisplay(gameState) {
  try {
    var el = document.getElementById('totalChips');
    if (!el || !gameState || !gameState.players) return;
    var myPlayer = gameState.players.find(function(p) { return p.socketId === mySocketId; });
    if (!myPlayer) return;
    var total = myPlayer.chips || 0;
    el.setAttribute('data-value', total);
    var dict = I18N[currentLang] || I18N.zh;
    el.textContent = dict.totalLabel + total;
  } catch (e) {
    console.log('updateTotalChipsDisplay error', e);
  }
}

function updateGameStatus(gameState) {
  var dict = I18N[currentLang] || I18N.zh;
  var statusMap = dict.statusMap;

  const playerCount = gameState.players.length;
  if (gameState.gameState === 'waiting') {
    gameStatus.textContent = (dict.waitingCount || statusMap.waiting).replace('x', playerCount);
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

      var dict = I18N[currentLang] || I18N.zh;
      var handRanks = dict.handRanks || {};
      var label = handRanks[best.type] || null;
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

function updateChipTargetDebug(leftAbs, topAbs, rightAbs, bottomAbs, tableRect) {
  try {
    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;
    var debugEl = document.getElementById('chipTargetDebug');
    if (!debugEl) {
      debugEl = document.createElement('div');
      debugEl.id = 'chipTargetDebug';
      debugEl.className = 'chip-target-debug';
      tableEl.appendChild(debugEl);
    }
    var leftRel = leftAbs - tableRect.left;
    var topRel = topAbs - tableRect.top;
    var width = Math.max(0, rightAbs - leftAbs);
    var height = Math.max(0, bottomAbs - topAbs);
    debugEl.style.left = leftRel + 'px';
    debugEl.style.top = topRel + 'px';
    debugEl.style.width = width + 'px';
    debugEl.style.height = height + 'px';
  } catch (e) {
    console.log('updateChipTargetDebug error', e);
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
    var dealerBtn = document.getElementById('dealerTipBtn');
    if (!tableEl || !dealerBtn) return;

    var selfPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = selfPlayer ? selfPlayer.seat : 0;

    var tableRect = tableEl.getBoundingClientRect();
    var dRect = dealerBtn.getBoundingClientRect();

    var isMobile = window.innerWidth && (window.innerWidth <= 900 || window.innerHeight > window.innerWidth);

    // 桌面基础：高度 150，宽度 220，中心在打赏按钮下方 100px
    var bandHeight = 150;
    var bandWidth = 220;

    // 手机端：高度和宽度各减少 100px（150->50, 220->120）
    if (isMobile) {
      bandHeight = Math.max(50, 150 - 100);
      bandWidth = Math.max(80, 220 - 100);
    }

    var bandHalfH = bandHeight / 2;
    var bandHalfW = bandWidth / 2;

    // 垂直位置：桌面保持 150px；手机再往上提到 80px，进一步远离公共牌
    var offsetY = isMobile ? 80 : 150;
    var bandTopAbs = dRect.bottom + offsetY;
    var bandBottomAbs = bandTopAbs + bandHeight;
    if (bandTopAbs < tableRect.top) {
      var shift = tableRect.top - bandTopAbs;
      bandTopAbs += shift;
      bandBottomAbs += shift;
    }
    if (bandBottomAbs > tableRect.bottom) {
      var shift2 = bandBottomAbs - tableRect.bottom;
      bandTopAbs -= shift2;
      bandBottomAbs -= shift2;
    }

    // 目标水平范围：以打赏按钮中心为轴，宽度固定（桌面 220 / 手机 120）
    var centerXAbs = (dRect.left + dRect.right) / 2;
    var leftAbs = centerXAbs - bandHalfW;
    var rightAbs = centerXAbs + bandHalfW;
    if (leftAbs < tableRect.left) leftAbs = tableRect.left;
    if (rightAbs > tableRect.right) rightAbs = tableRect.right;

    updateChipTargetDebug(leftAbs, bandTopAbs, rightAbs, bandBottomAbs, tableRect);

    // 目标区向内收缩，保证 20px 筹码完全落在白框内（大小盲及所有下注统一落在此区）
    var inset = 12;
    var w = Math.max(20, (rightAbs - leftAbs) - inset * 2);
    var h = Math.max(20, (bandBottomAbs - bandTopAbs) - inset * 2);
    var targetLeft = leftAbs + inset;
    var targetTop = bandTopAbs + inset;

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
            var targetXAbs = targetLeft + Math.random() * w;
            var targetYAbs = targetTop + Math.random() * h;
            var targetXRel = targetXAbs - tableRect.left;
            var targetYRel = targetYAbs - tableRect.top;
            var dx = targetXRel - startLeft;
            var dy = targetYRel - startTop;
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
    
    var dict = I18N[currentLang] || I18N.zh;
    var displayName = player.nickname + (player.socketId === mySocketId ? (dict.meSuffix || ' (我)') : '');
    // 👑 标记庄家：始终跟随当前 dealerSeat，而不是房主
    if (typeof gameState.dealerSeat === 'number' && player.seat === gameState.dealerSeat) {
      displayName += ' 👑';
    }
    nameEl.innerHTML = displayName;
    chipsEl.innerHTML = '<span class=\"chip-icon\"></span>' + player.chips;
    
    if (player.bet > 0) {
      betEl.textContent = dict.betLabel + player.bet;
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
  var dict = I18N[currentLang] || I18N.zh;
  var actions = dict.actionText;
  return actions[action] || action;
}

// 更新行动倒计时光圈位置（放在当前行动玩家头像上方）
function updateActionTimerPosition(gameState) {
  var timerEl = document.getElementById('actionTimer');
  if (!timerEl) return;

  if (gameState.currentPlayerSeat == null || gameState.currentPlayerSeat === -1 ||
      gameState.gameState === 'waiting' || gameState.gameState === 'ended') {
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
  timerEl.classList.remove('hidden');
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
    var dict = I18N[currentLang] || I18N.zh;
    checkBtn.textContent = dict.btnCheck;
  } else {
    checkBtn.disabled = true;
    checkBtn.style.display = 'none';
    callBtn.disabled = false;
    callBtn.style.display = 'inline-block';
    callBtn.textContent = dict.btnCall + ' ' + toCall;
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
        var dict = I18N[currentLang] || I18N.zh;
        startGameBtn.textContent = dict.btnStartGame;
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
  
  var timerTextEl = document.getElementById('timerText');
  var progressCircle = document.querySelector('.timer-progress');
  var circumference = progressCircle ? 2 * Math.PI * 16 : 100;
  if (progressCircle) {
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = '0';
  }
  if (timerTextEl) timerTextEl.textContent = '12';

  actionTimer = setInterval(function() {
    actionTimeLeft -= 0.02;
    var ratio = Math.max(0, Math.min(1, actionTimeLeft / 12));

    if (countdownInfoEl) {
      var deg = Math.floor(ratio * 360);
      countdownInfoEl.style.setProperty('--timer-deg', deg + 'deg');
    }

    if (timerTextEl) timerTextEl.textContent = Math.ceil(Math.max(0, actionTimeLeft));
    if (progressCircle) {
      progressCircle.style.strokeDashoffset = ((1 - ratio) * circumference) + '';
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

  if (countdownSeatEl) {
    countdownSeatEl.classList.remove('countdown-active');
  }
  if (countdownInfoEl) {
    countdownInfoEl.style.removeProperty('--timer-deg');
  }
  countdownSeatEl = null;
  countdownInfoEl = null;

  var timerEl = document.getElementById('actionTimer');
  if (timerEl) timerEl.classList.add('hidden');
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
  
  var dict = I18N[currentLang] || I18N.zh;
  previewChips.innerHTML = dict.previewChips + '<span class="' + (remainingChips < 0 ? 'text-danger' : 'text-success') + '">' + remainingChips + '</span>' + dict.previewChipsUnit;
}

// ============ 复制房间号 ============
function copyRoomCode() {
  playSound('button');
  var roomCode = document.getElementById('displayRoomCode').textContent;
  if (roomCode && roomCode !== '-----') {
    var dict = I18N[currentLang] || I18N.zh;
    var msg = (dict.roomCodeCopied || '房间号已复制: ') + roomCode;
    navigator.clipboard.writeText(roomCode).then(function() {
      alert(msg);
    }).catch(function() {
      var input = document.createElement('input');
      input.value = roomCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert(msg);
    });
  }
}

// （AI 建议功能已移除）

function loadVersionLabel() {
  try {
    var el = document.getElementById('versionLabel');
    if (!el) return;
    var dict = I18N[currentLang] || I18N.zh;
    var val = dict.versionLoading || '加载中...';
    el.setAttribute('data-version-value', val);
    el.textContent = dict.versionLabel + val;
    fetch('/version')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        var v = (data && data.sha) ? data.sha.substring(0, 7) : (data && data.version ? data.version : (dict.versionLoading || ''));
        el.setAttribute('data-version-value', v);
        el.textContent = dict.versionLabel + v;
      })
      .catch(function() {
        var el2 = document.getElementById('versionLabel');
        var d = I18N[currentLang] || I18N.zh;
        if (el2) {
          el2.setAttribute('data-version-value', d.versionUnknown || '--');
          el2.textContent = d.versionLabel + (d.versionUnknown || '--');
        }
      });
  } catch (e) {}
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing...');
  initDOMElements();
  initLanguage();
  loadNickname();
  setupEventListeners();
  setupEmojiButtons();
  startHeartbeat();
  loadVersionLabel();
  showPage('lobby');
  console.log('Initialization complete');
});
