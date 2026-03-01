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
/** 当前倒计时是否为本玩家回合（用于超时时可靠触发自动弃牌） */
let _actionTimerIsMyTurn = false;
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
    loadAudio('button', getButtonSoundUrl());
  }
}

// 相对当前页面的按钮音效 URL，兼容根路径与子路径部署
function getButtonSoundUrl() {
  try {
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    if (!path || path === '/' || path === '/index.html') return 'button.mp3';
    var dir = path.charAt(path.length - 1) === '/' ? path : path.substring(0, path.lastIndexOf('/') + 1);
    return dir + 'button.mp3';
  } catch (e) { return 'button.mp3'; }
}

function playButtonSound() {
  if (soundMuted) return;
  try {
    initAudio();
    var tpl = audioCache.button;
    if (tpl) {
      var a = tpl.cloneNode();
      a.volume = 1;
      a.play().catch(function(err) {
        console.warn('playButtonSound clone failed:', err && err.message);
        try { new Audio(getButtonSoundUrl()).play(); } catch (e2) {}
      });
    } else {
      var url = getButtonSoundUrl();
      var a = new Audio(url);
      a.volume = 1;
      a.play().catch(function(err) {
        console.warn('playButtonSound failed:', url, err && err.message);
      });
    }
  } catch (e) {
    console.warn('playButtonSound error', e);
  }
}

function playSound(type) {
  if (soundMuted) return;
  try {
    initAudio();
    if (type === 'button') {
      playButtonSound();
      return;
    }
    var tpl = audioCache[type];
    if (!tpl) return;
    var audio = tpl.cloneNode();
    audio.play().catch(function(err) {
      console.log('playSound error', type, err && err.message);
    });
  } catch (e) {
    console.log('Audio error:', e);
  }
}

// 全局静音：结算界面喇叭按钮切换，关闭所有按键音效与 BGM
var soundMuted = false;
try {
  soundMuted = localStorage.getItem('poker_sound_muted') === '1';
} catch (e) {}

// BGM 背景音乐：音量 30%，进入房间播放，暂停或离开房间停止
var bgmAudio = null;
var BGM_VOLUME = 0.15;

function getBgmUrl() {
  try {
    var path = (typeof window !== 'undefined' && window.location && window.location.pathname) || '';
    if (!path || path === '/' || path === '/index.html') return 'BGM.mp3';
    var dir = path.charAt(path.length - 1) === '/' ? path : path.substring(0, path.lastIndexOf('/') + 1);
    return dir + 'BGM.mp3';
  } catch (e) { return 'BGM.mp3'; }
}

function startBGM() {
  if (soundMuted) return;
  try {
    if (!bgmAudio) {
      bgmAudio = new Audio(getBgmUrl());
      bgmAudio.loop = true;
      bgmAudio.volume = BGM_VOLUME;
    }
    bgmAudio.currentTime = 0;
    bgmAudio.play().catch(function(err) { console.warn('BGM play failed', err && err.message); });
  } catch (e) { console.warn('startBGM error', e); }
}

function stopBGM() {
  try {
    if (bgmAudio) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
    }
  } catch (e) {}
}

// Socket.IO 连接
const socket = io();

// 本地存储键
const STORAGE_KEY = 'poker_nickname';
const STATS_KEY = 'poker_player_stats';
const LANG_STORAGE_KEY = 'poker_lang';

// 入座最少携带筹码
const MIN_SEAT_CHIPS = 500;

// 当前语言 'zh' | 'en'
let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem(LANG_STORAGE_KEY)) || 'zh';

// 翻译文案（大厅等）
var I18N = {
  appTitle: { zh: '路易斯德州', en: 'Louis Poker' },
  subtitle: { zh: '与好友一起畅玩', en: 'Play with friends' },
  statNickname: { zh: '昵称', en: 'Nickname' },
  statChips: { zh: '筹码', en: 'Chips' },
  statWinRate: { zh: '胜率', en: 'Win rate' },
  statGames: { zh: '场次', en: 'Games' },
  nicknamePlaceholder: { zh: '请输入昵称', en: 'Enter nickname' },
  createRoom: { zh: '创建房间', en: 'Create room' },
  getChips: { zh: '获取筹码', en: 'Get chips' },
  joinRoom: { zh: '加入房间', en: 'Join room' },
  roomCodePlaceholder: { zh: '请输入5位房间号', en: 'Enter 5-digit room code' },
  confirmJoin: { zh: '确认加入', en: 'Confirm' },
  versionPrefix: { zh: '当前版本：', en: 'Version: ' },
  roomLabel: { zh: '房间号:', en: 'Room:' },
  settlementBtn: { zh: '结算', en: 'Settle' },
  dealerTip: { zh: '打赏 50', en: 'Tip 50' },
  settlementSubtitle: { zh: '当前玩家输赢如下', en: 'Current win/loss below' },
  settlementColPlayer: { zh: '玩家', en: 'Player' },
  settlementColChange: { zh: '本局输赢', en: 'Net' },
  settlementColChips: { zh: '当前筹码', en: 'Chips' },
  settlementLogSummary: { zh: '本局操作记录', en: 'Action log' },
  resumeGame: { zh: '恢复游戏', en: 'Resume' },
  leave: { zh: '离开', en: 'Leave' },
  settlementTitlePaused: { zh: '%s暂停游戏', en: '%s paused' },
  settlementTitleEnded: { zh: '游戏已结束', en: 'Game over' },
  someonePaused: { zh: '有人', en: 'Someone' },
  tipMinChips: { zh: '最少携带500筹码才可入座', en: 'Need at least 500 chips to join' },
  joining: { zh: '加入中...', en: 'Joining...' },
  fold: { zh: '弃牌', en: 'Fold' },
  check: { zh: '过牌', en: 'Check' },
  call: { zh: '跟注', en: 'Call' },
  raise: { zh: '加注', en: 'Raise' },
  allIn: { zh: '全下', en: 'All in' },
  startGame: { zh: '开始游戏', en: 'Start game' },
  startGameLoading: { zh: '开始中...', en: 'Starting...' },
  createRoomLoading: { zh: '创建中...', en: 'Creating...' },
  statusWaiting: { zh: '等待玩家加入...', en: 'Waiting for players...' },
  statusWaitingCount: { zh: '等待玩家加入 (%s/5)', en: 'Waiting (%s/5)' },
  statusPreflop: { zh: '翻牌前', en: 'Pre-flop' },
  statusFlop: { zh: '翻牌圈', en: 'Flop' },
  statusTurn: { zh: '转牌圈', en: 'Turn' },
  statusRiver: { zh: '河牌圈', en: 'River' },
  statusShowdown: { zh: '摊牌', en: 'Showdown' },
  statusEnded: { zh: '游戏结束', en: 'Game over' },
  currentBetLabel: { zh: '当前下注: ', en: 'Current bet: ' },
  actionFolded: { zh: '已弃牌', en: 'Folded' },
  actionCheckDisplay: { zh: '看牌', en: 'Check' },
  betLabel: { zh: '下注: ', en: 'Bet: ' },
  callAmount: { zh: '跟注 %s', en: 'Call %s' },
  chipsFloat: { zh: '筹码 ', en: 'Chips ' },
  smallBlind: { zh: '小盲注', en: 'Small blind' },
  bigBlind: { zh: '大盲注', en: 'Big blind' },
  bet: { zh: '下注', en: 'Bet' },
  allInShort: { zh: '全压', en: 'All in' },
  win: { zh: '获胜', en: 'Win' },
  settlementTime: { zh: '时间：', en: 'Time: ' },
  settlementDuration: { zh: '耗时：', en: 'Duration: ' },
  afterBetRemain: { zh: '下注后剩余: ', en: 'After bet: ' },
  chipsUnit: { zh: ' 筹码', en: ' chips' },
  roomCodeCopied: { zh: '房间号已复制: ', en: 'Room code copied: ' },
  errNotConnected: { zh: '未连接服务器，请刷新页面重试', en: 'Not connected. Please refresh.' },
  errEnterNickname: { zh: '请输入昵称', en: 'Enter nickname' },
  errNicknameTooLong: { zh: '昵称最多可输入10个字符', en: 'Nickname at most 10 characters' },
  errEnterNicknameAndRoom: { zh: '请输入昵称和房间号', en: 'Enter nickname and room code' },
  errEnter5DigitRoom: { zh: '请输入5位房间号', en: 'Enter 5-digit room code' },
  errRequestTimeout: { zh: '请求超时，请检查房间号与网络后重试', en: 'Request timeout. Check room code and network.' },
  errJoinFailed: { zh: '加入房间失败', en: 'Join failed' },
  errCreateFailed: { zh: '创建房间失败', en: 'Create room failed' },
  errStartFailed: { zh: '无法开始游戏，请稍后重试', en: 'Cannot start game. Try again later.' },
  errConnectFailed: { zh: '无法连接服务器，请确认地址正确或稍后重试', en: 'Cannot connect. Check address or try later.' },
  aiSuggestedAction: { zh: '建议动作', en: 'Suggested action' },
  applySuggestion: { zh: '采用建议', en: 'Apply' },
  aiReasoningDefault: { zh: 'AI基于当前牌面分析得出的建议', en: 'AI suggestion based on current board' },
  aiAnalyzing: { zh: '分析中...', en: 'Analyzing...' },
  aiAnalyzingBoard: { zh: 'AI正在分析牌面...', en: 'AI analyzing board...' },
  aiSuggest: { zh: 'AI建议', en: 'AI suggest' },
  meLabel: { zh: ' (我)', en: ' (me)' },
  soundOn: { zh: '打开音效', en: 'Sound on' },
  soundOff: { zh: '关闭音效', en: 'Sound off' },
  phraseNiceHand: { zh: '好牌！', en: 'Nice hand!' },
  phraseGgWp: { zh: '打得好，朋友。', en: 'GG WP.' },
  phraseSameOldTrick: { zh: '老套路了？', en: 'Same old trick?' },
  phraseYourTell: { zh: '你暴露马脚了。', en: 'Your tell is showing.' },
  phraseRevengeTime: { zh: '复仇时间到！', en: 'Revenge time!' },
  phraseDontBeNit: { zh: '别那么紧！', en: "Don't be a nit!" },
  phraseReadTellsComePlay: { zh: '我会读牌！来啊，一起打牌', en: "I read tells! Come on, let's play." },
  phraseCategoryGeneral: { zh: '通用', en: 'General' },
  phraseCategoryAction: { zh: '行动', en: 'Action' },
  phraseCategoryComment: { zh: '评论', en: 'Comment' },
  phraseCategorySocial: { zh: '社交', en: 'Social' }
};
const PHRASES = [
  { id: 'niceHand', category: 'general', key: 'phraseNiceHand' },
  { id: 'ggWp', category: 'social', key: 'phraseGgWp' },
  { id: 'sameOldTrick', category: 'comment', key: 'phraseSameOldTrick' },
  { id: 'yourTell', category: 'comment', key: 'phraseYourTell' },
  { id: 'revengeTime', category: 'action', key: 'phraseRevengeTime' },
  { id: 'dontBeNit', category: 'comment', key: 'phraseDontBeNit' },
  { id: 'readTellsComePlay', category: 'social', key: 'phraseReadTellsComePlay' }
];

function getCurrentLang() {
  return currentLang;
}

function i18n(key) {
  var t = I18N[key];
  return (t && t[currentLang]) ? t[currentLang] : key;
}

function i18nF(key) {
  var s = i18n(key);
  for (var i = 1; i < arguments.length; i++) s = String(s).replace('%s', arguments[i]);
  return s;
}

function setCurrentLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh';
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch (e) {}
}

function applyLang() {
  var lang = getCurrentLang();
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var t = I18N[key];
    if (t && t[lang]) el.textContent = t[lang];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    var key = el.getAttribute('data-i18n-placeholder');
    var t = I18N[key];
    if (t && t[lang]) el.placeholder = t[lang];
  });
  var versionEl = document.getElementById('versionLabel');
  if (versionEl) {
    var sha = versionEl.getAttribute('data-version-sha') || '';
    versionEl.textContent = i18n('versionPrefix') + sha;
  }
  setSettlementModalTitle();
  if (gameRoomPage && !gameRoomPage.classList.contains('hidden') && currentGameState) {
    updateGameStatus(currentGameState);
    updateGameState(currentGameState);
  }
}

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
let displayRoomCode, gameStatus, leaveRoomBtn, settlementBtn;
let potAmount, communityCardsEl, currentBetDisplay;
let actionPanel, actionText, foldBtn, checkBtn, callBtn, raiseBtn, allInBtn;
let aiAssistBtn, aiSuggestionPanel, aiSuggestionContent, startGameBtn;
let raiseSlider, raiseAmountPanel, raiseAmountDisplay;
let gameOverModal, settlementList, resumeGameBtn, myCardsEl;
/** 最近一次结算数据，用于结算弹窗内实时刷新 */
var _lastSettlementData = null;
/** 结算弹窗来源：'paused' = 点击结算暂停，'ended' = 有人破产等游戏结束 */
var _settlementReason = 'ended';
/** 点击结算暂停时，发起暂停的玩家昵称（用于标题「某某暂停游戏」） */
var _pausedByNickname = '';
/** 当前连胜场次，仅自己可见的 WIN / WIN x2 等 */
var winStreakCount = 0;

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
  settlementBtn = document.getElementById('settlementBtn');
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
  aiSuggestionPanel = document.getElementById('ai-suggestion-panel');
  aiSuggestionContent = document.getElementById('ai-suggestion-content');
  raiseSlider = document.getElementById('raiseSlider');
  raiseAmountPanel = document.getElementById('raiseAmountPanel');
  raiseAmountDisplay = document.getElementById('raiseAmountDisplay');
  gameOverModal = document.getElementById('gameOverModal');
  settlementList = document.getElementById('settlementList');
  resumeGameBtn = document.getElementById('resumeGameBtn');
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

// 主界面筹码数字滚动动画（增加时从旧值滚到新值）
function animateStatChips(fromVal, toVal) {
  var chipsEl = document.getElementById('statChips');
  if (!chipsEl) return;
  var start = typeof fromVal === 'number' ? fromVal : (parseInt(chipsEl.textContent, 10) || 0);
  var end = typeof toVal === 'number' ? toVal : start;
  if (start === end) {
    chipsEl.textContent = end;
    return;
  }
  var duration = 280;
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var t = Math.min(1, elapsed / duration);
    t = 1 - Math.pow(1 - t, 2);
    var current = Math.round(start + (end - start) * t);
    chipsEl.textContent = current;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updatePlayerStatsDisplay(opts) {
  const statsPanel = document.getElementById('playerStats');
  const nicknameEl = document.getElementById('statNickname');
  const chipsEl = document.getElementById('statChips');
  const winRateEl = document.getElementById('statWinRate');
  const gamesEl = document.getElementById('statGames');
  const skipChips = opts && opts.skipChips;
  const chipsAnimate = opts && opts.chipsAnimate;
  const chipsFrom = opts && opts.chipsFrom;
  const chipsTo = opts && opts.chipsTo;

  if (statsPanel && playerStats.nickname) {
    statsPanel.classList.remove('hidden');
    if (nicknameEl) nicknameEl.textContent = playerStats.nickname;
    if (chipsAnimate && chipsEl && typeof chipsFrom === 'number' && typeof chipsTo === 'number') {
      animateStatChips(chipsFrom, chipsTo);
    } else if (!skipChips && chipsEl) {
      chipsEl.textContent = playerStats.chips;
    }
    if (winRateEl) winRateEl.textContent = playerStats.winRate + '%';
    if (gamesEl) gamesEl.textContent = playerStats.gamesPlayed;
  }
}

function updatePlayerChips(chips) {
  var chipsEl = document.getElementById('statChips');
  var prev = (chipsEl && parseInt(chipsEl.textContent, 10)) || 0;
  playerStats.chips = chips;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
  } catch (e) {}
  if (chips > prev) {
    updatePlayerStatsDisplay({ skipChips: true, chipsAnimate: true, chipsFrom: prev, chipsTo: chips });
  } else {
    updatePlayerStatsDisplay();
  }
}

function finishGame(won, finalChips) {
  playerStats.gamesPlayed++;
  if (won) playerStats.gamesWon++;
  playerStats.chips = finalChips;
  playerStats.winRate = playerStats.gamesPlayed >= 10
    ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100)
    : 0;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(playerStats));
  } catch (e) {}
  var chipsEl = document.getElementById('statChips');
  var prev = (chipsEl && parseInt(chipsEl.textContent, 10)) || 0;
  if (finalChips > prev) {
    updatePlayerStatsDisplay({ chipsAnimate: true, chipsFrom: prev, chipsTo: finalChips });
  } else {
    updatePlayerStatsDisplay();
  }
}

function showPage(page) {
  var phraseBtn = document.getElementById('phraseBubbleBtn');
  if (page === 'lobby') {
    lobbyPage.classList.remove('hidden');
    gameRoomPage.classList.add('hidden');
    if (phraseBtn) phraseBtn.classList.add('hidden');
    closePhrasePanel();
    closePhraseWheel();
    stopBGM();
  } else {
    lobbyPage.classList.add('hidden');
    gameRoomPage.classList.remove('hidden');
    if (phraseBtn) phraseBtn.classList.remove('hidden');
    startBGM();
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
        alert(i18n('errNotConnected'));
        return;
      }
      const nickname = nicknameInput.value.trim();
      if (!nickname) {
        alert(i18n('errEnterNickname'));
        return;
      }
      if (nickname.length > 10) {
        alert(i18n('errNicknameTooLong'));
        return;
      }
      if ((playerStats.chips || 0) < MIN_SEAT_CHIPS) {
        alert(i18n('tipMinChips'));
        return;
      }
      saveNickname(nickname);
      createRoomBtn.disabled = true;
      createRoomBtn.textContent = i18n('createRoomLoading');
      var timeout = setTimeout(function() {
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = i18n('createRoom');
        alert(i18n('errRequestTimeout'));
      }, 15000);
      socket.emit('createRoom', { nickname: nickname, chips: playerStats.chips }, function(response) {
        clearTimeout(timeout);
        createRoomBtn.disabled = false;
        createRoomBtn.textContent = i18n('createRoom');
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(response && response.message ? response.message : i18n('errCreateFailed'));
        }
      });
    });
  }
  
  // 获取筹码：每次点击加 1000
  var getChipsBtn = document.getElementById('getChipsBtn');
  if (getChipsBtn) {
    getChipsBtn.addEventListener('click', function() {
      playSound('button');
      updatePlayerChips((playerStats.chips || 0) + 1000);
    });
  }

  // 加入房间按钮：点击时先判定筹码是否至少 500
  if (joinRoomBtn) {
    joinRoomBtn.addEventListener('click', function() {
      playSound('button');
      if ((playerStats.chips || 0) < MIN_SEAT_CHIPS) {
        alert(i18n('tipMinChips'));
        return;
      }
      joinForm.classList.remove('hidden');
    });
  }
  
  // 确认加入
  if (confirmJoinBtn) {
    confirmJoinBtn.addEventListener('click', function() {
      playSound('button');
      console.log('Confirm join clicked');
      if (!socket.connected) {
        alert(i18n('errNotConnected'));
        return;
      }
      const nickname = nicknameInput.value.trim();
      const roomCode = roomCodeInput.value.trim();
      
      if (!nickname || !roomCode) {
        alert(i18n('errEnterNicknameAndRoom'));
        return;
      }
      if (nickname.length > 10) {
        alert(i18n('errNicknameTooLong'));
        return;
      }
      if (roomCode.length !== 5) {
        alert(i18n('errEnter5DigitRoom'));
        return;
      }
      if ((playerStats.chips || 0) < MIN_SEAT_CHIPS) {
        alert(i18n('tipMinChips'));
        return;
      }
      saveNickname(nickname);
      confirmJoinBtn.disabled = true;
      confirmJoinBtn.textContent = i18n('joining');
      var timeout = setTimeout(function() {
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = i18n('confirmJoin');
        alert(i18n('errRequestTimeout'));
      }, 15000);
      socket.emit('joinRoom', roomCode, { nickname: nickname, chips: playerStats.chips }, function(response) {
        clearTimeout(timeout);
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.textContent = i18n('confirmJoin');
        if (response && response.success) {
          mySocketId = socket.id;
          mySeat = response.player.seat;
          displayRoomCode.textContent = response.roomCode;
          showPage('game');
        } else {
          alert(response && response.message ? response.message : i18n('errJoinFailed'));
        }
      });
    });
  }
  
  // 语言切换（中/EN）
  var langToggleBtn = document.getElementById('langToggleBtn');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', function() {
      setCurrentLang(getCurrentLang() === 'en' ? 'zh' : 'en');
      applyLang();
    });
  }

  function doLeaveRoom() {
    stopBGM();
    winStreakCount = 0;
    updateWinStreakBadge();
    socket.emit('leaveRoom', function(res) {
      var chips = (res && res.success && typeof res.finalChips === 'number')
        ? res.finalChips
        : (function() {
            if (currentGameState && currentGameState.players) {
              var me = currentGameState.players.find(function(p) { return p.socketId === mySocketId; });
              if (me && typeof me.chips === 'number') return me.chips;
            }
            return null;
          })();
      if (typeof chips === 'number') updatePlayerChips(chips);
      location.reload();
    });
  }

  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', function() {
      playSound('button');
      doLeaveRoom();
    });
  }

  if (settlementBtn) {
    settlementBtn.addEventListener('click', function() {
      playSound('button');
      socket.emit('requestSettlement', function(res) {
        if (res && res.success) {
          // 服务端会发 gameOver，由 gameOver 逻辑弹结算界面
        } else if (res && res.error) {
          alert(res.error);
        }
      });
    });
  }

  var leaveRoomFromModalBtn = document.getElementById('leaveRoomFromModalBtn');
  if (leaveRoomFromModalBtn) {
    leaveRoomFromModalBtn.addEventListener('click', function() {
      playSound('button');
      gameOverModal.classList.add('hidden');
      doLeaveRoom();
    });
  }

  var soundToggleBtn = document.getElementById('soundToggleBtn');
  if (soundToggleBtn) {
    updateSoundToggleIcon();
    soundToggleBtn.addEventListener('click', function() {
      soundMuted = !soundMuted;
      try { localStorage.setItem('poker_sound_muted', soundMuted ? '1' : '0'); } catch (e) {}
      updateSoundToggleIcon();
      if (soundMuted) stopBGM();
    });
  }
  
  // 恢复游戏：若为暂停则恢复当前局，若为结束则开始下一局
  if (resumeGameBtn) {
    resumeGameBtn.addEventListener('click', function() {
      playSound('button');
      gameOverModal.classList.add('hidden');
      if (_settlementReason === 'paused') {
        socket.emit('resumeGame', function(response) {
          if (response && response.success && response.gameState) {
            currentGameState = response.gameState;
            updateGameState(currentGameState);
            startBGM();
          } else if (response && response.message) {
            alert(response.message);
          }
        });
      } else {
        var myChips = (currentGameState && currentGameState.players)
          ? (currentGameState.players.find(function(p) { return p.socketId === mySocketId; }) || {}).chips
          : playerStats.chips;
        if (typeof myChips !== 'number' || myChips < MIN_SEAT_CHIPS) {
          alert(i18n('tipMinChips'));
          return;
        }
        socket.emit('restartGame', function(response) {
          if (response.success) {
            currentGameState = response.gameState;
            updateGameState(currentGameState);
            startBGM();
          }
        });
      }
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
      playSound('button');
      socket.emit('addBot');
    });
  }

  // 开始游戏按钮：仅房主在等待开局且人数足够时可用
  if (startGameBtn) {
    startGameBtn.addEventListener('click', function() {
      startGameBtn.disabled = true;
      startGameBtn.textContent = i18n('startGameLoading');
      socket.emit('startGame', function(response) {
        if (!response || !response.success) {
          startGameBtn.disabled = false;
          startGameBtn.textContent = i18n('startGame');
          alert(response && response.message ? response.message : i18n('errStartFailed'));
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
  if (confirmJoinBtn) confirmJoinBtn.disabled = false;
  applyLang();
});
socket.on('connect_error', function(err) {
  console.log('Connect error:', err.message);
  alert(i18n('errConnectFailed'));
});

socket.on('gameState', function(gameState) {
  console.log('Game state received');

  var prevState = currentGameState;
  var isNewDeal = gameState.gameState === 'preflop' && (!prevState || prevState.gameState === 'ended' || prevState.gameState === 'waiting');

  if (isNewDeal) {
    _lastCommunityCardsLength = 0;
  }
  /* 牌局结束或新一局开始时清空白色线框内停留的筹码 */
  if (gameState.gameState === 'ended' || isNewDeal) {
    clearPotChips();
  }
  if (_lastGameStateForPot) {
    animatePotChips(_lastGameStateForPot, gameState);
  }

  /* 开局大小盲：筹码先飞到白色筹码区，停留 1 秒后再更新状态与发牌并开始倒计时 */
  var potIncreased = _lastGameStateForPot && typeof gameState.pot === 'number' && gameState.pot > ((_lastGameStateForPot.pot) || 0);
  if (isNewDeal && potIncreased) {
    var delayMs = 500 + 1000;
    setTimeout(function() {
      _isNewDealPreflop = true;
      currentGameState = gameState;
      if (gameState.players) {
        var me = gameState.players.find(function(p) { return p.socketId === mySocketId; });
        if (me && typeof me.chips === 'number') {
          playerStats.chips = me.chips;
          try { localStorage.setItem(STATS_KEY, JSON.stringify(playerStats)); } catch (e) {}
        }
      }
      updateGameState(gameState);
      _lastGameStateForPot = gameState;
      updateLocalStatsOnGameEnd(prevState, gameState);
    }, delayMs);
    return;
  }

  _isNewDealPreflop = isNewDeal;
  currentGameState = gameState;
  if (gameState.players) {
    var me = gameState.players.find(function(p) { return p.socketId === mySocketId; });
    if (me && typeof me.chips === 'number') {
      playerStats.chips = me.chips;
      try { localStorage.setItem(STATS_KEY, JSON.stringify(playerStats)); } catch (e) {}
    }
  }
  updateGameState(gameState);
  _lastGameStateForPot = gameState;
  updateLocalStatsOnGameEnd(prevState, gameState);
  refreshSettlementModalIfOpen(gameState);
});

socket.on('roomUpdate', function(gameState) {
  console.log('Room update received');
  if (gameState.gameState === 'preflop' && (!currentGameState || currentGameState.gameState === 'ended' || currentGameState.gameState === 'waiting')) {
    _lastCommunityCardsLength = 0;
  }
  _isNewDealPreflop = false;
  currentGameState = gameState;
  updateGameState(gameState);
  refreshSettlementModalIfOpen(gameState);
});

/** 结算弹窗打开时，用最新房间状态刷新玩家当前筹码（实时显示）。暂停状态下也刷新，以便有人离开等时更新列表。 */
function refreshSettlementModalIfOpen(gameState) {
  if (!gameOverModal || gameOverModal.classList.contains('hidden') || !_lastSettlementData || !_lastSettlementData.results) return;
  if (!gameState.paused && gameState.gameState !== 'ended' && gameState.gameState !== 'waiting') return;
  if (!gameState.players || !gameState.players.length) return;
  gameState.players.forEach(function(p) {
    var r = _lastSettlementData.results.find(function(x) { return (x.nickname || '') === (p.nickname || ''); });
    if (r) r.finalChips = p.chips;
  });
  renderSettlementList(_lastSettlementData.results);
}

socket.on('playerLeft', function(data) {
  console.log('Player left:', data.nickname);
});

socket.on('hostChanged', function(data) {
  console.log('Host changed:', data.newHostId);
});

socket.on('emote', function(data) {
  showEmoji(data.seat, data.emoji);
});

socket.on('phrase', function(data) {
  var myPlayer = currentGameState && currentGameState.players ? currentGameState.players.find(function(p) { return p.socketId === mySocketId; }) : null;
  var mySeatIndex = myPlayer ? myPlayer.seat : 0;
  var displaySeat = (data.fromSeat - mySeatIndex + 5) % 5;
  var phrase = PHRASES.find(function(p) { return p.id === data.phraseId; });
  var text = phrase ? i18n(phrase.key) : data.phraseId;
  var showNickname = data.fromSocketId !== mySocketId ? data.fromNickname : null;
  showPhraseBubble(displaySeat, text, showNickname, 2500);
});

/** 渲染结算列表（表格行），支持传入结果数组，用于 gameOver 与实时刷新 */
function renderSettlementList(results) {
  if (!settlementList) return;
  settlementList.innerHTML = '';
  (results || []).forEach(function(r) {
    var tr = document.createElement('tr');
    if (r.netChange > 0) tr.classList.add('winner');
    else if (r.netChange < 0) tr.classList.add('loser');
    var netText = (typeof r.netChange === 'number' && r.netChange > 0) ? '+' + r.netChange : (r.netChange || 0);
    var changeCls = (r.netChange >= 0) ? 'positive' : 'negative';
    tr.innerHTML =
      '<td class="col-nickname">' + (r.nickname || '') + '</td>' +
      '<td class="col-change ' + changeCls + '">' + netText + '</td>' +
      '<td class="col-chips">' + (r.finalChips != null ? r.finalChips : '-') + '</td>';
    settlementList.appendChild(tr);
  });
}

/** 根据 _settlementReason 与 _pausedByNickname 设置结算弹窗标题与副标题，并控制「恢复游戏」按钮显隐（仅暂停时显示）。使用当前语言。 */
function setSettlementModalTitle() {
  var titleEl = document.getElementById('settlementModalTitle');
  var subEl = document.getElementById('settlementModalSubtitle');
  if (titleEl) {
    if (_settlementReason === 'paused') {
      var who = _pausedByNickname || i18n('someonePaused');
      titleEl.textContent = i18nF('settlementTitlePaused', who);
    } else {
      titleEl.textContent = i18n('settlementTitleEnded');
    }
  }
  if (subEl) subEl.textContent = i18n('settlementSubtitle');
  if (resumeGameBtn) resumeGameBtn.style.display = _settlementReason === 'paused' ? '' : 'none';
  updateSoundToggleIcon();
}

/** 更新连胜标识（仅自己可见）：WIN / WIN x2 / WIN x3…，中断则隐藏 */
function updateWinStreakBadge() {
  var el = document.getElementById('winStreakBadge');
  if (!el) return;
  if (winStreakCount >= 1) {
    el.textContent = winStreakCount === 1 ? 'WIN' : 'WIN x' + winStreakCount;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
  } else {
    el.classList.add('hidden');
    el.setAttribute('aria-hidden', 'true');
  }
}

function updateSoundToggleIcon() {
  var btn = document.getElementById('soundToggleBtn');
  if (!btn) return;
  btn.textContent = soundMuted ? '\u{1F507}' : '\u{1F50A}';
  btn.setAttribute('aria-label', soundMuted ? i18n('soundOn') : i18n('soundOff'));
  btn.title = soundMuted ? i18n('soundOn') : i18n('soundOff');
}

/** 渲染结算弹窗内的操作记录区域 */
function renderSettlementLog(actions, meta) {
  try {
    var logEl = document.getElementById('settlementLog');
    if (!logEl) return;
    var lines = [];
    var actionTextMap = {
      'small-blind': i18n('smallBlind'),
      'big-blind': i18n('bigBlind'),
      'bet': i18n('bet'),
      'raise': i18n('raise'),
      'call': i18n('call'),
      'check': i18n('check'),
      'fold': i18n('fold'),
      'all-in': i18n('allInShort'),
      'win': i18n('win')
    };
    (actions || []).forEach(function(a, idx) {
      var label = actionTextMap[a.action] || a.action;
      var amt = (typeof a.amount === 'number' && a.amount !== 0) ? (' ' + a.amount) : '';
      var sec = (typeof a.elapsedSeconds === 'number') ? a.elapsedSeconds : null;
      var secText = sec != null ? (' ' + sec + 's') : '';
      lines.push((idx + 1) + ' ' + a.nickname + ' ' + label + amt + secText);
    });
    var timeStr = '';
    if (meta && meta.endedAt) {
      var endedDate = new Date(meta.endedAt);
      timeStr = endedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    var durationStr = '';
    if (meta && typeof meta.durationSeconds === 'number') {
      durationStr = formatDuration(meta.durationSeconds);
    }
    var metaParts = [];
    if (timeStr) metaParts.push(i18n('settlementTime') + timeStr);
    if (durationStr) metaParts.push(i18n('settlementDuration') + durationStr);
    logEl.innerHTML =
      '<div>' + lines.join('<br>') + '</div>' +
      (metaParts.length ? '<div class="settlement-log-meta">' + metaParts.join('　') + '</div>' : '');
  } catch (e) {
    console.log('render settlement log error', e);
  }
}

socket.on('gamePaused', function(data) {
  stopBGM();
  _settlementReason = 'paused';
  _pausedByNickname = (data.pausedBy && String(data.pausedBy).trim()) ? String(data.pausedBy).trim() : '';
  var results = data.results || [];
  var actions = data.actions || [];
  var meta = data.meta || {};
  _lastSettlementData = { results: results.slice(), meta: meta, actions: actions };
  setSettlementModalTitle();
  renderSettlementList(results);
  renderSettlementLog(actions, meta);
  gameOverModal.classList.remove('hidden');
});

socket.on('gameOver', function(data) {
  _settlementReason = 'ended';
  const results = data.results || [];
  const meta = data.meta || {};
  const actions = data.actions || [];
  _lastSettlementData = { results: results.slice(), meta: meta, actions: actions };

  results.forEach(function(result) {
    var myNick = (playerStats.nickname || '').trim();
    var resNick = (result.nickname || '').trim();
    if (resNick && myNick && resNick === myNick) {
      finishGame(result.netChange > 0, result.finalChips);
    }
  });

  setSettlementModalTitle();
  renderSettlementList(results);
  renderSettlementLog(actions, meta);
  if (resumeGameBtn) resumeGameBtn.style.display = 'none';

  playSound('over');
  try {
    var meWin = results.some(function(r) {
      return r && r.nickname === playerStats.nickname && typeof r.netChange === 'number' && r.netChange > 0;
    });
    if (meWin) {
      playSound('win');
      winStreakCount++;
    } else {
      winStreakCount = 0;
    }
    updateWinStreakBadge();
  } catch (e) {}

  showRoundResultFloats(results);
  setTimeout(function() {
    gameOverModal.classList.remove('hidden');
  }, 2000);
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

// 每局结束后在头像上飘出筹码变化文字
function showRoundResultFloats(results) {
  try {
    if (!results || !results.length) return;
    if (!currentGameState || !currentGameState.players) return;

    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;

    var myPlayer = currentGameState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = myPlayer ? myPlayer.seat : 0;

    // 仅胜者：按赢的筹码从大到小排序，筹码飞到胜者头上并显示「筹码+数字」
    var sorted = results.slice()
      .filter(function(r) { return typeof r.netChange === 'number' && r.netChange > 0; })
      .sort(function(a, b) { return (b.netChange || 0) - (a.netChange || 0); });

    sorted.forEach(function(result, idx) {
      var delta = typeof result.netChange === 'number' ? result.netChange : 0;
      // 按昵称匹配到当前局内的玩家
      var player = currentGameState.players.find(function(p) { return p.nickname === result.nickname; });
      if (!player) return;

      var displaySeat = (player.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;

      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var rect = avatarEl.getBoundingClientRect();
      var tableRect = tableEl.getBoundingClientRect();

      var chipZone = document.getElementById('chipLandingZone');
      var centerLeft = tableRect.width / 2 - 10;
      var centerTop = tableRect.height / 2 - 10;
      if (chipZone) {
        var zoneRect = chipZone.getBoundingClientRect();
        centerLeft = (zoneRect.left - tableRect.left + zoneRect.width / 2) - 10;
        centerTop = (zoneRect.top - tableRect.top + zoneRect.height / 2) - 10;
      }

      var chipEl = document.createElement('div');
      chipEl.className = 'chip-fly';
      chipEl.style.left = centerLeft + 'px';
      chipEl.style.top = centerTop + 'px';
      tableEl.appendChild(chipEl);

      // 使用微小延迟区分多名赢家的飞行起点
      setTimeout(function() {
        var dx = rect.left - tableRect.left + rect.width / 2 - centerLeft;
        var dy = rect.top - tableRect.top + rect.height / 2 - centerTop;
        chipEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        chipEl.style.opacity = '0';
      }, 50 + idx * 80);

      setTimeout(function() {
        chipEl.remove();
      }, 700 + idx * 80);

      // 同时保留原来的文字浮动提示
      var floatEl = document.createElement('div');
      floatEl.className = 'round-result-float';

      var sign = delta > 0 ? '+' : '';
      floatEl.textContent = i18n('chipsFloat') + sign + delta;
      if (delta < 0) {
        floatEl.classList.add('negative');
      }

      floatEl.style.left = (rect.left - tableRect.left + rect.width / 2) + 'px';
      floatEl.style.top = (rect.top - tableRect.top - 10) + 'px';

      tableEl.appendChild(floatEl);

      setTimeout(function() {
        floatEl.remove();
      }, 1900);
    });
  } catch (e) {
    console.log('showRoundResultFloats error', e);
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

// 底池数字滚动动画（增加时从旧值滚到新值）
function animatePotAmount(fromVal, toVal) {
  if (!potAmount) return;
  var start = typeof fromVal === 'number' ? fromVal : (parseInt(potAmount.textContent, 10) || 0);
  var end = typeof toVal === 'number' ? toVal : start;
  if (start === end) {
    potAmount.textContent = end;
    return;
  }
  var duration = 280;
  var startTime = null;
  function step(timestamp) {
    if (!startTime) startTime = timestamp;
    var elapsed = timestamp - startTime;
    var t = Math.min(1, elapsed / duration);
    t = 1 - Math.pow(1 - t, 2);
    var current = Math.round(start + (end - start) * t);
    potAmount.textContent = current;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ============ 游戏逻辑 ============
function updateGameState(gameState) {
  updateGameStatus(gameState);
  var prevPot = parseInt(potAmount.textContent, 10) || 0;
  var newPot = typeof gameState.pot === 'number' ? gameState.pot : 0;
  if (newPot > prevPot) {
    animatePotAmount(prevPot, newPot);
  } else {
    potAmount.textContent = newPot;
  }
  
  if (gameState.currentBet > 0) {
    currentBetDisplay.textContent = i18n('currentBetLabel') + gameState.currentBet;
  } else {
    currentBetDisplay.textContent = '';
  }
  
  // 模拟真实发牌节奏：下注/过牌后停顿 0.8 秒再发下一街的公共牌
  var newCardsLen = (gameState.communityCards && gameState.communityCards.length) || 0;
  var prevCardsLen = _lastCommunityCardsLength;
  if (newCardsLen > prevCardsLen) {
    setTimeout(function() {
      renderCommunityCards(gameState.communityCards);
    }, 800);
  } else {
    renderCommunityCards(gameState.communityCards);
  }
  renderSeats(gameState);
  showBigHandBadges(gameState);
  updateActionPanel(gameState);
  updateBotButton(gameState);
  updateActionTimerPosition(gameState);
  startActionTimer(gameState);
}

function updateGameStatus(gameState) {
  const statusKeyMap = {
    'waiting': 'statusWaiting',
    'preflop': 'statusPreflop',
    'flop': 'statusFlop',
    'turn': 'statusTurn',
    'river': 'statusRiver',
    'showdown': 'statusShowdown',
    'ended': 'statusEnded'
  };
  const playerCount = gameState.players.length;
  if (gameState.gameState === 'waiting') {
    gameStatus.textContent = i18nF('statusWaitingCount', playerCount);
  } else {
    var key = statusKeyMap[gameState.gameState];
    gameStatus.textContent = key ? i18n(key) : gameState.gameState;
  }
}

var _lastCommunityCardsLength = 0;
var _lastGameStateForPot = null;
var _isNewDealPreflop = false;

function renderCommunityCards(cards) {
  communityCardsEl.innerHTML = '';
  cards.forEach(function(card, index) {
    var isNewCard = index >= _lastCommunityCardsLength;
    var delay = isNewCard ? (index - _lastCommunityCardsLength) * 80 : 0;
    var cardEl = createCardElement(card, true, {
      flyIn: isNewCard,
      flyDelay: delay,
      extraClass: 'card-board'
    });
    communityCardsEl.appendChild(cardEl);
    if (isNewCard) {
      scheduleCardFlyFromDealer(cardEl, delay);
      (function(d) { setTimeout(function() { playSound('card'); }, d); })(delay);
    }
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
    cardEl.classList.add('card-fly-from-dealer');
    cardEl.style.opacity = '0';
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

// 从荷官图片中间飞入：先定位到荷官中心再动画到牌位
function runCardFlyFromDealer(cardEl) {
  var dealerEl = document.querySelector('.dealer-image');
  if (!dealerEl || !cardEl) return;
  var dealerRect = dealerEl.getBoundingClientRect();
  var dealerCenterX = dealerRect.left + dealerRect.width / 2;
  var dealerCenterY = dealerRect.top + dealerRect.height / 2;
  var cardRect = cardEl.getBoundingClientRect();
  var cardCenterX = cardRect.left + cardRect.width / 2;
  var cardCenterY = cardRect.top + cardRect.height / 2;
  var dx = dealerCenterX - cardCenterX;
  var dy = dealerCenterY - cardCenterY;
  cardEl.style.transition = 'none';
  cardEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0.2)';
  cardEl.style.opacity = '0';
  cardEl.offsetHeight;
  cardEl.style.transition = 'transform 0.45s ease-out, opacity 0.25s ease-out';
  cardEl.style.transform = 'translate(0,0) scale(1)';
  cardEl.style.opacity = '1';
  setTimeout(function() {
    cardEl.style.transition = '';
    cardEl.classList.remove('card-fly-from-dealer');
  }, 460);
}

function scheduleCardFlyFromDealer(cardEl, delayMs) {
  if (!cardEl || !delayMs) {
    if (cardEl) runCardFlyFromDealer(cardEl);
    return;
  }
  setTimeout(function() { runCardFlyFromDealer(cardEl); }, delayMs);
}

// 清空白色线框内停留的筹码（牌局结束或新一局开始时调用）
function clearPotChips() {
  var tableEl = document.querySelector('.poker-table');
  if (!tableEl) return;
  var chips = tableEl.querySelectorAll('.chip-fly-pot');
  for (var i = 0; i < chips.length; i++) chips[i].remove();
}

// 下注飞筹码：从有新增下注的玩家头像飞到白色筹码区，停留在框内直到牌局结束。跟注1个、加注2个、全下3个。
function animatePotChips(prevState, nextState) {
  try {
    if (!prevState || !nextState) return;
    if (!prevState.players || !nextState.players) return;
    if (typeof prevState.pot !== 'number' || typeof nextState.pot !== 'number') return;
    if (nextState.pot <= prevState.pot) return;

    var potIconEl = document.getElementById('potIcon');
    if (potIconEl) {
      potIconEl.classList.remove('pot-icon-pop');
      potIconEl.offsetHeight;
      potIconEl.classList.add('pot-icon-pop');
      setTimeout(function() { potIconEl.classList.remove('pot-icon-pop'); }, 400);
    }

    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;

    var tableRect = tableEl.getBoundingClientRect();
    var chipZone = document.getElementById('chipLandingZone');
    var bandHeight = 50;
    var bandWidth = 120;
    var bandTopAbs, leftAbs, rightAbs, bandBottomAbs;
    if (chipZone) {
      var zoneRect = chipZone.getBoundingClientRect();
      bandTopAbs = zoneRect.top;
      bandBottomAbs = zoneRect.bottom;
      leftAbs = zoneRect.left;
      rightAbs = zoneRect.right;
    } else {
      bandTopAbs = tableRect.top + tableRect.height * 0.45;
      bandBottomAbs = bandTopAbs + bandHeight;
      leftAbs = tableRect.left + tableRect.width / 2 - bandWidth / 2;
      rightAbs = leftAbs + bandWidth;
    }
    leftAbs = Math.max(tableRect.left, leftAbs);
    rightAbs = Math.min(tableRect.right, rightAbs);
    bandTopAbs = Math.max(tableRect.top, bandTopAbs);
    bandBottomAbs = Math.min(tableRect.bottom, bandBottomAbs);
    var inset = 12;
    var targetW = Math.max(20, (rightAbs - leftAbs) - inset * 2);
    var targetH = Math.max(20, (bandBottomAbs - bandTopAbs) - inset * 2);
    var targetLeft = leftAbs + inset;
    var targetTop = bandTopAbs + inset;

    var prevById = {};
    prevState.players.forEach(function(p) {
      if (p && p.socketId) prevById[p.socketId] = p;
    });
    var selfPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = selfPlayer ? selfPlayer.seat : 0;

    var playerIndex = 0;
    nextState.players.forEach(function(p) {
      if (!p || !p.socketId) return;
      var prev = prevById[p.socketId];
      if (!prev) return;
      var prevBet = prev.bet || 0;
      var currBet = p.bet || 0;
      var prevChips = prev.chips || 0;
      var currChips = p.chips || 0;
      if (currBet <= prevBet && currChips >= prevChips) return;

      (function(idx) {
        setTimeout(function() { playSound('bet'); }, idx * 120);
      })(playerIndex);
      playerIndex++;

      var displaySeat = (p.seat - mySeatIndex + 5) % 5;
      var seatEl = document.getElementById('seat-' + displaySeat);
      if (!seatEl) return;
      var avatarEl = seatEl.querySelector('.player-avatar') || seatEl;
      var fromRect = avatarEl.getBoundingClientRect();
      var startLeft = fromRect.left - tableRect.left + fromRect.width / 2 - 10;
      var startTop = fromRect.top - tableRect.top + fromRect.height / 2 - 10;

      var action = p.action || '';
      var chipCount = (action === 'all-in') ? 3 : (action === 'raise') ? 2 : 1;
      for (var i = 0; i < chipCount; i++) {
        (function() {
          var chipEl = document.createElement('div');
          chipEl.className = 'chip-fly chip-fly-pot';
          chipEl.style.left = startLeft + 'px';
          chipEl.style.top = startTop + 'px';
          tableEl.appendChild(chipEl);
          requestAnimationFrame(function() {
            var targetXAbs = targetLeft + Math.random() * targetW;
            var targetYAbs = targetTop + Math.random() * targetH;
            var targetXRel = targetXAbs - tableRect.left;
            var targetYRel = targetYAbs - tableRect.top;
            var dx = targetXRel - startLeft;
            var dy = targetYRel - startTop;
            chipEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            chipEl.style.opacity = '0.9';
          });
          /* 筹码停留在白色线框内，牌局结束或新局时由 clearPotChips() 清空 */
        })();
      }
    });
  } catch (e) {
    console.log('animatePotChips error', e);
  }
}

function renderSeats(gameState) {
  // 清除所有座位状态
  for (var i = 0; i < 5; i++) {
    var seatEl = document.getElementById('seat-' + i);
    if (seatEl) {
      seatEl.classList.remove('active', 'folded', 'all-in', 'winner', 'my-seat', 'other-seat', 'in-game');
      seatEl.classList.add('empty');
      delete seatEl.dataset.socketId;

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
    seatEl.dataset.socketId = player.socketId || '';

    var nameEl = seatEl.querySelector('.player-name');
    var chipsEl = seatEl.querySelector('.player-chips');
    var cardsEl = seatEl.querySelector('.player-cards');
    var betEl = seatEl.querySelector('.player-bet');
    var statusEl = seatEl.querySelector('.player-status');
    
    var displayName = player.nickname + (player.socketId === mySocketId ? i18n('meLabel') : '');
    // 👑 标记庄家：始终跟随当前 dealerSeat，而不是房主
    if (typeof gameState.dealerSeat === 'number' && player.seat === gameState.dealerSeat) {
      displayName += ' 👑';
    }
    nameEl.innerHTML = displayName;
    chipsEl.innerHTML = '<span class=\"chip-icon\"></span>' + player.chips;
    
    if (player.bet > 0) {
      betEl.textContent = i18n('betLabel') + player.bet;
    }
    
    var gameStateValue = currentGameState ? currentGameState.gameState : 'waiting';
    if (player.socketId === mySocketId && gameStateValue !== 'waiting') {
      if (player.action) {
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
    
    var handFlyIn = _isNewDealPreflop && gameState.gameState === 'preflop';
    if (player.hand && player.hand.length > 0) {
      if (player.socketId === mySocketId) {
        player.hand.forEach(function(card, idx) {
          var delay = handFlyIn ? dealIndex * 120 : 0;
          var cardEl = createCardElement(card, true, {
            flyIn: handFlyIn,
            flyDelay: delay,
            extraClass: 'card-my'
          });
          cardsEl.appendChild(cardEl);
          if (handFlyIn) {
            scheduleCardFlyFromDealer(cardEl, delay);
            (function(d) { setTimeout(function() { playSound('card'); }, d); })(delay);
          }
          dealIndex++;
        });
      } else if (gameState.gameState === 'showdown' || gameState.gameState === 'ended') {
        player.hand.forEach(function(card) {
          cardsEl.appendChild(createCardElement(card, true));
        });
      } else {
        var otherHandCount = (player.hand && player.hand.length) ? player.hand.length : 2;
        for (var i = 0; i < otherHandCount; i++) {
          var delayBack = handFlyIn ? dealIndex * 120 : 0;
          var cardEl = createCardElement({}, false, { flyIn: handFlyIn, flyDelay: delayBack });
          cardsEl.appendChild(cardEl);
          if (handFlyIn) {
            scheduleCardFlyFromDealer(cardEl, delayBack);
            (function(d) { setTimeout(function() { playSound('card'); }, d); })(delayBack);
          }
          dealIndex++;
        }
      }
    } else if (gameState.gameState !== 'waiting') {
      for (var i = 0; i < 2; i++) {
        var delayBack2 = handFlyIn ? dealIndex * 120 : 0;
        var cardEl = createCardElement({}, false, { flyIn: handFlyIn, flyDelay: delayBack2 });
        cardsEl.appendChild(cardEl);
        if (handFlyIn) {
          scheduleCardFlyFromDealer(cardEl, delayBack2);
          (function(d) { setTimeout(function() { playSound('card'); }, d); })(delayBack2);
        }
        dealIndex++;
      }
    }
  });
}

function getActionText(action) {
  var keyMap = { 'fold': 'actionFolded', 'check': 'actionCheckDisplay', 'call': 'call', 'raise': 'raise', 'all-in': 'allIn' };
  var key = keyMap[action];
  return key ? i18n(key) : action;
}

// 更新行动倒计时光圈位置（放在当前行动玩家头像上方）
function updateActionTimerPosition(gameState) {
  var timerEl = document.getElementById('actionTimer');
  if (!timerEl) return;

  if (gameState.paused || gameState.currentPlayerSeat == null || gameState.currentPlayerSeat === -1 ||
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

  // 游戏暂停或已弃牌、全下、筹码为 0、本局已结束时不显示操作
  if (gameState.paused || myPlayer.folded || myPlayer.chips <= 0 || gameState.gameState === 'ended') {
    disableAllButtons();
    if (raiseAmountPanel) raiseAmountPanel.classList.add('hidden');
    return;
  }

  var isMyTurn = gameState.currentPlayerSeat === myPlayer.seat;
  
  if (!isMyTurn) {
    actionText.textContent = '';
    disableAllButtons();
    if (raiseAmountPanel) raiseAmountPanel.classList.add('hidden');
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
    checkBtn.textContent = i18n('check');
  } else {
    checkBtn.disabled = true;
    checkBtn.style.display = 'none';
    callBtn.disabled = false;
    callBtn.style.display = 'inline-block';
    callBtn.textContent = i18nF('callAmount', toCall);
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

  // 开始游戏按钮：仅房主在「等待开局」时显示，每把结束后不弹出（不在此处显示）
  if (startGameBtn) {
    const activePlayers = gameState.players.filter(function(p) { return p.chips > 0; });
    const canStart =
      socket.id === gameState.hostId &&
      activePlayers.length >= 2 &&
      gameState.gameState === 'waiting';

    if (gameState.gameState === 'waiting') {
      startGameBtn.classList.toggle('hidden', !canStart);
      startGameBtn.disabled = !canStart;
      if (canStart) startGameBtn.textContent = i18n('startGame');
    } else {
      startGameBtn.classList.add('hidden');
    }
  }
}

// ============ 倒计时 ============
function startActionTimer(gameState) {
  stopActionTimer();

  if (!gameState ||
      gameState.paused ||
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
  var progressCircle = document.querySelector('#actionTimer .timer-progress');
  var circumference = progressCircle ? 2 * Math.PI * 16 : 100;
  if (progressCircle) {
    progressCircle.style.strokeDasharray = circumference;
    progressCircle.style.strokeDashoffset = '0';
  }
  if (timerTextEl) timerTextEl.textContent = '12';
  _actionTimerIsMyTurn = !!(myPlayer && gameState.currentPlayerSeat === myPlayer.seat);

  actionTimer = setInterval(function() {
    actionTimeLeft -= 0.02;
    var ratio = Math.max(0, Math.min(1, actionTimeLeft / 12));
    var urgent = actionTimeLeft <= 5 && actionTimeLeft > 0;

    if (countdownInfoEl) {
      var deg = Math.floor(ratio * 360);
      countdownInfoEl.style.setProperty('--timer-deg', deg + 'deg');
    }
    if (countdownSeatEl) {
      if (urgent) countdownSeatEl.classList.add('timer-urgent');
      else countdownSeatEl.classList.remove('timer-urgent');
    }
    var timerEl = document.getElementById('actionTimer');
    if (timerEl) {
      if (urgent) timerEl.classList.add('timer-urgent');
      else timerEl.classList.remove('timer-urgent');
    }
    if (timerTextEl) timerTextEl.textContent = Math.ceil(Math.max(0, actionTimeLeft));
    if (progressCircle) {
      progressCircle.style.strokeDashoffset = ((1 - ratio) * circumference) + '';
    }

    if (actionTimeLeft <= 0) {
      var wasMyTurn = _actionTimerIsMyTurn;
      var state = currentGameState;
      var sid = mySocketId;
      stopActionTimer();
      _actionTimerIsMyTurn = false;

      if (!wasMyTurn || !state || !sid || !socket.connected) return;

      var myPlayer = null;
      if (state.players) {
        for (var i = 0; i < state.players.length; i++) {
          if (state.players[i].socketId === sid) {
            myPlayer = state.players[i];
            break;
          }
        }
      }
      var isMyTurn = myPlayer &&
        state.currentPlayerSeat === myPlayer.seat &&
        !myPlayer.folded &&
        myPlayer.chips > 0 &&
        state.gameState !== 'ended' &&
        !state.paused;

      if (isMyTurn) {
        socket.emit('playerAction', 'fold', 0, function(response) {
          if (!response.success) {
            console.log('自动弃牌:', response.message);
          }
        });
      }
    }
  }, 20);

  // 倒计时开始后显示 #actionTimer（startActionTimer 开头调用了 stopActionTimer 会把它隐藏，这里再显示）
  var timerEl = document.getElementById('actionTimer');
  if (timerEl) timerEl.classList.remove('hidden');
}

function stopActionTimer() {
  _actionTimerIsMyTurn = false;
  if (actionTimer) {
    clearInterval(actionTimer);
    actionTimer = null;
  }
  if (countdownSeatEl) {
    countdownSeatEl.classList.remove('countdown-active', 'timer-urgent');
  }
  var timerEl = document.getElementById('actionTimer');
  if (timerEl) timerEl.classList.remove('timer-urgent');
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

function showPhraseBubble(displaySeat, text, fromNickname, durationMs) {
  var seatEl = document.getElementById('seat-' + displaySeat);
  var container = document.getElementById('phraseBubbleContainer');
  if (!seatEl || !container) return;
  var rect = seatEl.getBoundingClientRect();
  var popup = document.createElement('div');
  popup.className = 'phrase-bubble-popup';
  popup.textContent = (fromNickname ? fromNickname + ': ' : '') + text;
  popup.style.left = (rect.left + rect.width / 2) + 'px';
  popup.style.top = (rect.top - 52) + 'px';
  popup.style.transform = 'translateX(-50%)';
  container.appendChild(popup);
  var duration = typeof durationMs === 'number' ? durationMs : 2500;
  setTimeout(function() {
    popup.classList.add('fade-out');
    setTimeout(function() { popup.remove(); }, 320);
  }, duration);
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

// ============ 互动短语 ============
var phrasePanelCategory = 'general';
var phraseWheelTargetSocketId = null;
var phraseLongPressTimer = null;
var phraseLongPressTargetSocketId = null;

function openPhrasePanel() {
  var panel = document.getElementById('phrasePanel');
  if (!panel) return;
  panel.classList.remove('hidden');
  renderPhraseListAll();
}

function closePhrasePanel() {
  var panel = document.getElementById('phrasePanel');
  if (panel) panel.classList.add('hidden');
}

function closePhraseWheel() {
  var wheel = document.getElementById('phraseWheel');
  if (wheel) {
    wheel.classList.add('hidden');
    wheel.innerHTML = '';
  }
  phraseWheelTargetSocketId = null;
}

function renderPhraseListAll() {
  var listEl = document.getElementById('phraseList');
  if (!listEl) return;
  listEl.innerHTML = '';
  PHRASES.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phrase-item-btn';
    btn.textContent = i18n(p.key);
    btn.dataset.phraseId = p.id;
    btn.addEventListener('click', function() {
      playSound('button');
      socket.emit('sendPhrase', { phraseId: p.id });
      closePhrasePanel();
    });
    listEl.appendChild(btn);
  });
}

function openPhraseWheel(toSocketId) {
  phraseWheelTargetSocketId = toSocketId;
  var wheel = document.getElementById('phraseWheel');
  if (!wheel) return;
  wheel.classList.remove('hidden');
  wheel.innerHTML = '';
  PHRASES.forEach(function(p) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'phrase-item-btn';
    btn.textContent = i18n(p.key);
    btn.dataset.phraseId = p.id;
    btn.addEventListener('click', function() {
      playSound('button');
      socket.emit('sendPhrase', { phraseId: p.id });
      closePhraseWheel();
    });
    wheel.appendChild(btn);
  });
}

function setupPhraseUI() {
  var phraseBtn = document.getElementById('phraseBubbleBtn');
  var panelClose = document.getElementById('phrasePanelClose');
  var panel = document.getElementById('phrasePanel');
  if (phraseBtn) phraseBtn.addEventListener('click', function() { playSound('button'); openPhrasePanel(); });
  if (panelClose) panelClose.addEventListener('click', closePhrasePanel);
  var gameRoom = document.getElementById('gameRoom');
  if (gameRoom) {
    gameRoom.addEventListener('mousedown', function(e) {
      var seat = e.target.closest('.seat.other-seat');
      if (!seat) return;
      var sid = seat.dataset.socketId;
      if (!sid) return;
      phraseLongPressTargetSocketId = sid;
      phraseLongPressTimer = setTimeout(function() {
        phraseLongPressTimer = null;
        openPhraseWheel(sid);
      }, 500);
    });
    gameRoom.addEventListener('mouseup', function() { clearPhraseLongPress(); });
    gameRoom.addEventListener('mouseleave', function() { clearPhraseLongPress(); });
  }
  document.addEventListener('touchstart', function(e) {
    var seat = e.target.closest('.seat.other-seat');
    if (!seat) return;
    var sid = seat.dataset.socketId;
    if (!sid) return;
    phraseLongPressTargetSocketId = sid;
    phraseLongPressTimer = setTimeout(function() {
      phraseLongPressTimer = null;
      openPhraseWheel(sid);
    }, 500);
  }, { passive: true });
  document.addEventListener('touchend', function() { clearPhraseLongPress(); });
  document.addEventListener('touchcancel', function() { clearPhraseLongPress(); });
}

function clearPhraseLongPress() {
  if (phraseLongPressTimer) {
    clearTimeout(phraseLongPressTimer);
    phraseLongPressTimer = null;
  }
  phraseLongPressTargetSocketId = null;
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
  
  previewChips.innerHTML = i18n('afterBetRemain') + '<span class="' + (remainingChips < 0 ? 'text-danger' : 'text-success') + '">' + remainingChips + '</span>' + i18n('chipsUnit');
}

// ============ 复制房间号 ============
function copyRoomCode() {
  var roomCode = document.getElementById('displayRoomCode').textContent;
  if (roomCode && roomCode !== '-----') {
    navigator.clipboard.writeText(roomCode).then(function() {
      alert(i18n('roomCodeCopied') + roomCode);
    }).catch(function() {
      var input = document.createElement('input');
      input.value = roomCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert(i18n('roomCodeCopied') + roomCode);
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
  aiAssistBtn.innerHTML = '<span class="ai-icon">🤖</span><span>' + i18n('aiAnalyzing') + '</span>';
  
  aiSuggestionPanel.classList.remove('hidden');
  aiSuggestionContent.innerHTML = '<div class="ai-loading"><div class="ai-spinner"></div><span class="ai-loading-text">' + i18n('aiAnalyzingBoard') + '</span></div>';
  
  // 请求AI建议
  socket.emit('getAISuggestion', function(response) {
    aiAssistBtn.disabled = false;
    aiAssistBtn.classList.remove('loading');
    aiAssistBtn.innerHTML = '<span class="ai-icon">🤖</span><span>' + i18n('aiSuggest') + '</span>';
    
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
      actionText = i18n('fold');
      actionClass = 'fold';
      break;
    case 'check':
      actionText = i18n('check');
      actionClass = 'check';
      break;
    case 'call':
      actionText = i18n('call');
      actionClass = 'call';
      break;
    case 'raise':
      actionText = i18n('raise');
      actionClass = 'raise';
      break;
    case 'all-in':
      actionText = i18n('allIn');
      actionClass = 'all-in';
      break;
    default:
      actionText = decision.action ? (I18N[decision.action] && I18N[decision.action][getCurrentLang()] ? I18N[decision.action][getCurrentLang()] : decision.action) : i18n('check');
      actionClass = 'check';
  }
  
  var reasoning = decision.reasoning || i18n('aiReasoningDefault');
  
  var html = '<div class="ai-action-result">' +
    '<div class="ai-action-label">' + i18n('aiSuggestedAction') + '</div>' +
    '<div class="ai-action-value ' + actionClass + '">' + actionText + '</div>' +
    '</div>' +
    '<div class="ai-reasoning">' + reasoning + '</div>' +
    '<div style="text-align: center; margin-top: 10px;">' +
    '<button class="btn btn-primary" onclick="applyAISuggestion(\'' + decision.action + '\')">' + i18n('applySuggestion') + '</button>' +
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

function loadVersionLabel() {
  try {
    var el = document.getElementById('versionLabel');
    if (!el) return;
    fetch('/version')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data) {
          var ver = (data.appVersion && String(data.appVersion).trim()) || (data.sha && data.sha.length >= 7 ? data.sha.substring(0, 7) : '') || (data.version || '');
          el.setAttribute('data-version-sha', ver || '');
          applyLang();
        }
      })
      .catch(function() {});
  } catch (e) {}
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing...');
  initDOMElements();
  loadNickname();
  setupEventListeners();
  setupEmojiButtons();
  setupPhraseUI();
  startHeartbeat();
  applyLang();
  loadVersionLabel();
  // 提前预加载按钮音效，便于首击能响
  if (typeof getButtonSoundUrl === 'function') {
    loadAudio('button', getButtonSoundUrl());
  }
  showPage('lobby');
  console.log('Initialization complete');
});
