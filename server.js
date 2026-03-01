const express = require('express');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

// 阿里云等环境无 Railway 变量时，从 deploy_version.txt 读取短 hash（部署脚本会写入）
let deployVersionFromFile = '';
try {
  const p = path.join(__dirname, 'deploy_version.txt');
  if (fs.existsSync(p)) {
    deployVersionFromFile = (fs.readFileSync(p, 'utf8') || '').trim().substring(0, 7);
  }
} catch (e) {}

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '.env') });

// 引入AI服务模块
const pokerAI = require('./pokerAI');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 版本信息接口：用于首页显示版本标签（优先 appVersion），以及 Git 信息（Railway/阿里云）
const pkgVersion = (function() {
  try {
    const pkg = require(path.join(__dirname, 'package.json'));
    return (pkg && pkg.version) ? pkg.version : '';
  } catch (e) { return ''; }
})();
app.get('/version', (req, res) => {
  const msg = process.env.RAILWAY_GIT_COMMIT_MESSAGE || '';
  let sha = process.env.RAILWAY_GIT_COMMIT_SHA || '';
  if (!sha && deployVersionFromFile) sha = deployVersionFromFile;
  const branch = process.env.RAILWAY_GIT_BRANCH || '';
  const version =
    msg ||
    (sha ? `commit ${sha.substring(0, 7)}` : 'local-dev');
  res.json({
    appVersion: pkgVersion,
    version,
    branch,
    sha: sha ? sha.substring(0, 7) : '',
  });
});

// 游戏配置
const CONFIG = {
  INITIAL_CHIPS: 1000,
  SMALL_BLIND: 10,
  BIG_BLIND: 20,
  MAX_SEATS: 5,
  ROOM_CODE_LENGTH: 5,
  DEAL_DELAY_MS: 800  // 玩家操作后延迟多久再发下一阶段牌（翻牌/转牌/河牌）
};

// 扑克牌相关
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 房间存储
const rooms = {};

// 表情冷却（玩家ID -> 上次发送时间）
const emoteCooldowns = {};
// 互动短语冷却（玩家ID -> 上次发送时间）
const phraseCooldowns = {};
const PHRASE_COOLDOWN_MS = 3000;
const PHRASE_IDS = ['niceHand', 'ggWp', 'sameOldTrick', 'yourTell', 'revengeTime', 'dontBeNit', 'readTellsComePlay'];

// 玩家最后活跃时间（用于心跳）
const playerLastActive = {};

// 心跳配置
const HEARTBEAT_INTERVAL = 5000;
const DISCONNECT_TIMEOUT = 20000;
const ACTION_TIMEOUT = 10000;

// 生成房间代码
function generateRoomCode() {
  let code;
  do {
    const randomBuffer = crypto.randomBytes(3);
    const randomNumber = randomBuffer.readUIntBE(0, 3);
    code = (randomNumber % 90000 + 10000).toString();
  } while (rooms[code]);
  return code;
}

// 生成一副牌
function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return shuffleDeck(deck);
}

// 洗牌
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const randomBuffer = crypto.randomBytes(4);
    const randomNumber = randomBuffer.readUInt32BE(0);
    const j = randomNumber % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 获取牌的值
function getCardValue(rank) {
  const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return values[rank];
}

// 评估牌型
function evaluateHand(holeCards, communityCards) {
  const allCards = [...holeCards, ...communityCards];
  const hand = findBestHand(allCards);
  return hand;
}

// 找到最佳 5 张牌并返回完整牌型信息（支持皇家同花顺/同花顺等）
function findBestHand(cards) {
  if (cards.length < 5) return null;
  // 7 选 5，枚举所有组合，选择 rank 最优的一手
  const n = cards.length;
  let best = null;

  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const hand = evaluateFiveCards(five);
            if (!best || compareHands(hand, best) > 0) {
              best = hand;
            }
          }
        }
      }
    }
  }
  return best;
}

// 对 5 张牌进行牌型评估，返回 { type, category, ranks[], cards[] }
// category 越大牌型越强：0 高牌, 1 一对, 2 两对, 3 三条, 4 顺子, 5 同花, 6 葫芦, 7 四条, 8 同花顺, 9 皇家同花顺
function evaluateFiveCards(cards) {
  const sorted = cards.slice().sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));
  const values = sorted.map(c => getCardValue(c.rank));
  const suits = sorted.map(c => c.suit);

  const counts = {};
  values.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  const byCountThenValue = Object.keys(counts)
    .map(v => ({ value: parseInt(v, 10), count: counts[v] }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.value - a.value;
    });

  const isFlush = suits.every(s => s === suits[0]);
  const uniqueValuesDesc = [...new Set(values)];
  const uniqueValuesAsc = uniqueValuesDesc.slice().sort((a, b) => a - b);

  let isStraight = false;
  let straightHigh = 0;
  // 正常顺子
  if (uniqueValuesAsc.length >= 5) {
    for (let i = 0; i <= uniqueValuesAsc.length - 5; i++) {
      let ok = true;
      for (let j = 0; j < 4; j++) {
        if (uniqueValuesAsc[i + j + 1] !== uniqueValuesAsc[i] + j + 1) {
          ok = false;
          break;
        }
      }
      if (ok) {
        isStraight = true;
        straightHigh = uniqueValuesAsc[i + 4];
      }
    }
  }
  // 处理 A-5 顺子
  if (!isStraight && uniqueValuesDesc.includes(14) &&
      uniqueValuesDesc.includes(5) &&
      uniqueValuesDesc.includes(4) &&
      uniqueValuesDesc.includes(3) &&
      uniqueValuesDesc.includes(2)) {
    isStraight = true;
    straightHigh = 5;
  }

  // 同花顺 / 皇家同花顺
  if (isFlush && isStraight) {
    const flushValues = sorted.map(c => getCardValue(c.rank));
    // 找到同花内部的顺子最高点
    const flushUniqueAsc = [...new Set(flushValues.slice().sort((a, b) => a - b))];
    let fh = 0;
    if (flushUniqueAsc.length >= 5) {
      for (let i = 0; i <= flushUniqueAsc.length - 5; i++) {
        let ok = true;
        for (let j = 0; j < 4; j++) {
          if (flushUniqueAsc[i + j + 1] !== flushUniqueAsc[i] + j + 1) {
            ok = false;
            break;
          }
        }
        if (ok) {
          fh = flushUniqueAsc[i + 4];
        }
      }
    }
    // A-5 同花顺
    if (!fh && flushValues.includes(14) &&
        flushValues.includes(5) &&
        flushValues.includes(4) &&
        flushValues.includes(3) &&
        flushValues.includes(2)) {
      fh = 5;
    }

    const isRoyal = fh === 14;
    return {
      type: isRoyal ? 'royal-flush' : 'straight-flush',
      category: isRoyal ? 9 : 8,
      ranks: [fh],
      cards: sorted
    };
  }

  // 四条
  if (byCountThenValue[0].count === 4) {
    const four = byCountThenValue[0].value;
    const kicker = uniqueValuesDesc.find(v => v !== four) || four;
    return {
      type: 'four-of-a-kind',
      category: 7,
      ranks: [four, kicker],
      cards: sorted
    };
  }

  // 葫芦
  if (byCountThenValue[0].count === 3 && byCountThenValue[1] && byCountThenValue[1].count >= 2) {
    const trip = byCountThenValue[0].value;
    const pair = byCountThenValue[1].value;
    return {
      type: 'full-house',
      category: 6,
      ranks: [trip, pair],
      cards: sorted
    };
  }

  // 同花（比牌用 5 张牌面值从高到低，不用 unique 以便正确比踢脚）
  if (isFlush) {
    return {
      type: 'flush',
      category: 5,
      ranks: values.slice(0, 5),
      cards: sorted
    };
  }

  // 顺子
  if (isStraight) {
    return {
      type: 'straight',
      category: 4,
      ranks: [straightHigh],
      cards: sorted
    };
  }

  // 三条
  if (byCountThenValue[0].count === 3) {
    const trip = byCountThenValue[0].value;
    const kickers = uniqueValuesDesc.filter(v => v !== trip).slice(0, 2);
    return {
      type: 'three-of-a-kind',
      category: 3,
      ranks: [trip, ...kickers],
      cards: sorted
    };
  }

  // 两对
  if (byCountThenValue[0].count === 2 && byCountThenValue[1] && byCountThenValue[1].count === 2) {
    const highPair = Math.max(byCountThenValue[0].value, byCountThenValue[1].value);
    const lowPair = Math.min(byCountThenValue[0].value, byCountThenValue[1].value);
    const kicker = uniqueValuesDesc.find(v => v !== highPair && v !== lowPair) || lowPair;
    return {
      type: 'two-pair',
      category: 2,
      ranks: [highPair, lowPair, kicker],
      cards: sorted
    };
  }

  // 一对
  if (byCountThenValue[0].count === 2) {
    const pair = byCountThenValue[0].value;
    const kickers = uniqueValuesDesc.filter(v => v !== pair).slice(0, 3);
    return {
      type: 'pair',
      category: 1,
      ranks: [pair, ...kickers],
      cards: sorted
    };
  }

  // 高牌
  return {
    type: 'high-card',
    category: 0,
    ranks: uniqueValuesDesc.slice(0, 5),
    cards: sorted
  };
}

/**
 * 比较牌型与平局：>0 hand1 强，<0 hand2 强，0 完全平局（平分彩池）
 * - 不同类型：牌型等级(category)高者胜
 * - 同类型：按 ranks 逐项比较（顺子/同花顺比最大牌；四条/葫芦/三条/两对/一对先比牌组再比踢脚；同花/高牌从大到小逐张比）
 * - A-2-3-4-5 为最小顺子(straightHigh=5)
 * - 五张牌点数与顺序完全一致则返回 0，摊牌时平分该彩池
 */
function compareHands(hand1, hand2) {
  if (!hand1 && !hand2) return 0;
  if (!hand1) return -1;
  if (!hand2) return 1;

  if (hand1.category !== hand2.category) {
    return hand1.category - hand2.category;
  }

  const r1 = hand1.ranks || [];
  const r2 = hand2.ranks || [];
  const len = Math.max(r1.length, r2.length);
  for (let i = 0; i < len; i++) {
    const v1 = r1[i] || 0;
    const v2 = r2[i] || 0;
    if (v1 !== v2) return v1 - v2;
  }
  return 0;
}

// PokerRoom 类
class PokerRoom {
  constructor(roomCode, hostId) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.players = {};
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.playerBets = {};
    this.gameState = 'waiting';
    this.dealerSeat = -1;
    this.currentPlayerSeat = -1;
    this.currentBet = 0;
    this.smallBlindSeat = -1;
    this.bigBlindSeat = -1;
    this.locked = false;
    this.handStartTime = null;
    this.handActions = [];
    this.paused = false;
  }

  canJoin() {
    return Object.keys(this.players).length < CONFIG.MAX_SEATS && !this.locked;
  }

  lockRoom() {
    if (Object.keys(this.players).length >= CONFIG.MAX_SEATS) {
      this.locked = true;
    }
  }

  unlockRoom() {
    this.locked = false;
  }

  addPlayer(socketId, nickname, isBot = false, initialChips = null) {
    const seat = this.findEmptySeat();
    if (seat === -1) return null;
    const chips = (typeof initialChips === 'number' && initialChips > 0)
      ? initialChips
      : CONFIG.INITIAL_CHIPS;
    this.players[socketId] = {
      socketId,
      nickname,
      seat,
      chips,
      hand: [],
      bet: 0,
      folded: false,
      allIn: false,
      action: null,
      isBot
    };
    return this.players[socketId];
  }

  findEmptySeat() {
    const seats = new Set(Object.values(this.players).map(p => p.seat));
    for (let i = 0; i < CONFIG.MAX_SEATS; i++) {
      if (!seats.has(i)) return i;
    }
    return -1;
  }

  removePlayer(socketId) {
    delete this.players[socketId];
  }

  transferHost() {
    const playerIds = Object.keys(this.players);
    if (playerIds.length > 0) {
      this.hostId = playerIds[0];
      return this.hostId;
    }
    return null;
  }

  startNewHand() {
    this.deck = createDeck();  // 每手牌全新 52 张并洗牌，不复用上局牌堆
    this.communityCards = [];
    this.pot = 0;
    this.playerBets = {};
    this.currentBet = 0;
    this.gameState = 'preflop';
    this.handStartTime = Date.now();
    this.handActions = [];

    const activePlayers = Object.values(this.players).filter(p => p.chips > 0);
    if (activePlayers.length < 2) {
      this.gameState = 'waiting';
      return;
    }

    // 发底牌：标准德州每人 2 张私有牌，每圈发一张、共 2 圈
    activePlayers.forEach(p => {
      p.hand = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.action = null;
      this.playerBets[p.socketId] = 0;
    });
    for (let round = 0; round < 2; round++) {
      for (const p of activePlayers) {
        p.hand.push(this.deck.pop());
      }
    }

    const seats = activePlayers.map(p => p.seat).sort((a, b) => a - b);
    // 庄家顺序：第一手用最小座位号，其后从上一手庄家顺时针找下一个仍有筹码的玩家
    if (this.dealerSeat === -1) {
      this.dealerSeat = seats[0];
    } else {
      const idx = seats.indexOf(this.dealerSeat);
      const nextIdx = idx === -1 ? 0 : (idx + 1) % seats.length;
      this.dealerSeat = seats[nextIdx];
    }
    
    // 2人游戏：庄家是小盲，大盲是另一家；3+人游戏：庄家左侧第一个是小盲，再左侧是大盲
    if (seats.length === 2) {
      const dealerIndex = seats.indexOf(this.dealerSeat);
      const otherIndex = (dealerIndex + 1) % 2;
      this.smallBlindSeat = this.dealerSeat;          // 庄家也是小盲
      this.bigBlindSeat = seats[otherIndex];          // 另一家是大盲
      this.currentPlayerSeat = this.bigBlindSeat;     // 大盲先行
    } else {
      const dealerIndex = seats.indexOf(this.dealerSeat);
      const smallIndex = (dealerIndex + 1) % seats.length;
      const bigIndex = (dealerIndex + 2) % seats.length;
      const firstIndex = (dealerIndex + 3) % seats.length;
      this.smallBlindSeat = seats[smallIndex];
      this.bigBlindSeat = seats[bigIndex];
      this.currentPlayerSeat = seats[firstIndex];
    }
    
    // 执行大小盲下注
    const smallBlindPlayer = Object.values(this.players).find(p => p.seat === this.smallBlindSeat);
    const bigBlindPlayer = Object.values(this.players).find(p => p.seat === this.bigBlindSeat);
    if (smallBlindPlayer) {
      this.playerBet(smallBlindPlayer, CONFIG.SMALL_BLIND);
      this.logHandAction(smallBlindPlayer, 'small-blind', CONFIG.SMALL_BLIND);
    }
    if (bigBlindPlayer) {
      this.playerBet(bigBlindPlayer, CONFIG.BIG_BLIND);
      this.logHandAction(bigBlindPlayer, 'big-blind', CONFIG.BIG_BLIND);
    }

    // 记录本手开始时每人筹码，用于结算时计算 netChange
    this.chipsAtStartOfHand = {};
    Object.values(this.players).forEach(p => { this.chipsAtStartOfHand[p.socketId] = p.chips; });

    io.to(this.roomCode).emit('gameState', this.getGameState());

    // 如果首轮就轮到机器人，自动执行机器人操作
    this.handleBotTurn();
  }

  playerBet(player, amount) {
    const actualBet = Math.min(amount, player.chips);
    player.bet += actualBet;
    player.chips -= actualBet;
    this.playerBets[player.socketId] = player.bet;
    if (player.bet > this.currentBet) {
      this.currentBet = player.bet;
    }
    this.pot += actualBet;
    if (player.chips === 0) {
      player.allIn = true;
    }
  }

  logHandAction(player, type, amount) {
    if (!this.handActions) this.handActions = [];
    this.handActions.push({
      nickname: player.nickname,
      action: type,
      amount: amount || 0,
      timestamp: Date.now()
    });
  }

  playerAction(socketId, action, amount) {
    if (this.paused) return false;
    const player = this.players[socketId];
    if (!player || player.seat !== this.currentPlayerSeat) return false;

    switch (action) {
      case 'fold':
        player.folded = true;
        this.logHandAction(player, 'fold', 0);
        break;
      case 'check':
        const currentBet = player.bet;
        if (currentBet < this.currentBet) return false;
        this.logHandAction(player, 'check', 0);
        break;
      case 'call':
        const toCall = this.currentBet - player.bet;
        this.playerBet(player, toCall);
        this.logHandAction(player, 'call', toCall);
        playSound('bet');
        break;
      case 'raise':
        const raiseAmount = amount - player.bet;
        if (raiseAmount <= 0 || raiseAmount > player.chips) return false;
        this.playerBet(player, raiseAmount);
        this.logHandAction(player, 'raise', raiseAmount);
        playSound('bet');
        break;
      case 'all-in':
        const allInAmount = player.chips;
        this.playerBet(player, allInAmount);
        this.logHandAction(player, 'all-in', allInAmount);
        playSound('bet');
        break;
    }

    player.action = action;
    playSound('action');
    return true;
  }

  nextAction() {
    if (this.paused) return;
    // 存活玩家（未弃牌），用于判断是否只剩一人
    // 注意：这里不能排除已 all-in 或筹码为 0 的玩家，因为他们仍然在本局中有获胜可能
    const alivePlayers = Object.values(this.players).filter(p => !p.folded);

    // 如果只剩1个存活玩家，直接判定该玩家获胜
    if (alivePlayers.length <= 1) {
      if (alivePlayers.length === 1) {
        alivePlayers[0].chips += this.pot;
      }
      this.gameState = 'ended';
      io.to(this.roomCode).emit('gameState', this.getGameState());
      const hadBust = this.emitGameOverIfBust();
      if (!hadBust) this.emitGameOver([]);

      setTimeout(() => {
        const playersWithChips = Object.values(this.players).filter(p => p.chips > 0);
        if (playersWithChips.length >= 2) this.startNewHand();
      }, 1500);
      return;
    }

    // 仍然可以行动的玩家（未弃牌、未全下、还有筹码），按座位顺序以便正确轮转
    const activePlayers = Object.values(this.players)
      .filter(p => !p.folded && !p.allIn && p.chips > 0)
      .sort((a, b) => a.seat - b.seat);

    // 若没有任何玩家可以继续行动（都全下或弃牌），每隔 DEAL_DELAY_MS 发一档公共牌直到摊牌
    if (activePlayers.length === 0) {
      const room = this;
      const delayMs = CONFIG.DEAL_DELAY_MS || 800;
      function scheduleNextDeal() {
        setTimeout(() => {
          if (room.paused) return;
          room.advancePhase();
          io.to(room.roomCode).emit('gameState', room.getGameState());
          if (room.gameState !== 'showdown' && room.gameState !== 'ended') {
            scheduleNextDeal();
          }
        }, delayMs);
      }
      scheduleNextDeal();
      return;
    }

    const currentIndex = activePlayers.findIndex(p => p.seat === this.currentPlayerSeat);
    let nextIndex = (currentIndex + 1 + activePlayers.length) % activePlayers.length;
    let attempts = 0;
    while (attempts < activePlayers.length) {
      this.currentPlayerSeat = activePlayers[nextIndex].seat;
      if (!activePlayers[nextIndex].folded && !activePlayers[nextIndex].allIn && activePlayers[nextIndex].chips > 0) break;
      nextIndex = (nextIndex + 1) % activePlayers.length;
      attempts++;
    }

    if (this.shouldAdvancePhase()) {
      const room = this;
      const delayMs = CONFIG.DEAL_DELAY_MS || 800;
      setTimeout(() => {
        if (room.paused) return;
        room.advancePhase();
        if (room.gameState !== 'ended' && room.gameState !== 'waiting') {
          io.to(room.roomCode).emit('gameState', room.getGameState());
          room.handleBotTurn();
        }
      }, delayMs);
      return;
    }

    io.to(this.roomCode).emit('gameState', this.getGameState());

    // 如果轮到机器人玩家，自动执行机器人操作
    this.handleBotTurn();
  }

  handleBotTurn() {
    // 查找当前行动座位是否为机器人
    const botPlayer = Object.values(this.players).find(p => 
      p.isBot &&
      p.seat === this.currentPlayerSeat &&
      !p.folded &&
      !p.allIn &&
      p.chips > 0
    );

    if (!botPlayer) return;

    // 模拟思考时间（1-9秒随机），让机器人更有“犹豫感”
    const thinkTime = 1000 + Math.floor(Math.random() * 8000);

    setTimeout(() => {
      if (this.paused) return;
      // 再次确认仍然轮到该机器人且游戏仍在进行
      if (
        this.gameState === 'waiting' ||
        this.gameState === 'ended' ||
        this.currentPlayerSeat !== botPlayer.seat ||
        botPlayer.folded ||
        botPlayer.allIn ||
        botPlayer.chips <= 0
      ) {
        return;
      }

      const gameState = {
        pot: this.pot,
        currentBet: this.currentBet,
        communityCards: this.communityCards,
        gameState: this.gameState,
        playerChips: botPlayer.chips,
        playerPosition: botPlayer.seat
      };

      // 使用规则决策获得一个基础动作
      const ruleDecision = pokerAI.getRuleBasedDecision(gameState, botPlayer);
      let action = ruleDecision.action || 'check';
      let amount = 0;

       // 基于手牌强度加入一些随机行为，让机器人更真实
       const handStrength = pokerAI.evaluateHandStrength(botPlayer.hand || [], this.communityCards || []);
       const toCall = (this.currentBet || 0) - (botPlayer.bet || 0);
       const rand = Math.random();

       // 强牌时有一定概率直接全下（在有底池/有人下注时更常见）
       if (handStrength >= 0.7 && botPlayer.chips > 0) {
         if (this.currentBet > 0 && rand < 0.25) {
           action = 'all-in';
         } else if (rand < 0.1) {
           action = 'all-in';
         }
       }

       // 弱牌时有一定概率直接弃牌（即使本来是跟注/过牌），制造“怂”的感觉
       if (handStrength <= 0.3 && toCall > 0 && rand < 0.25) {
         action = 'fold';
       }

      switch (action) {
        case 'fold':
          amount = 0;
          break;
        case 'check':
          amount = 0;
          break;
        case 'call':
          // 服务器端会根据当前注自动计算跟注金额，这里填 0 即可
          amount = 0;
          break;
        case 'raise': {
          // 将规则决策转换为合法的总下注额
          const minRaiseTotal = Math.max(this.currentBet * 2, CONFIG.BIG_BLIND);
          const maxTotal = botPlayer.bet + botPlayer.chips;
          const suggestedTotal = this.currentBet + CONFIG.BIG_BLIND;
          const targetTotal = Math.min(maxTotal, Math.max(minRaiseTotal, suggestedTotal));

          if (targetTotal <= botPlayer.bet) {
            // 如果无法满足最小加注要求，退化为跟注或过牌
            const toCall = this.currentBet - (botPlayer.bet || 0);
            if (toCall > 0 && toCall <= botPlayer.chips) {
              action = 'call';
              amount = 0;
            } else {
              action = 'check';
              amount = 0;
            }
          } else {
            amount = targetTotal;
          }
          break;
        }
        case 'all-in':
          amount = (botPlayer.bet || 0) + botPlayer.chips;
          break;
        default:
          action = 'check';
          amount = 0;
      }

      const success = this.playerAction(botPlayer.socketId, action, amount);
      if (success) {
        io.to(this.roomCode).emit('gameState', this.getGameState());
        this.nextAction();
      }
    }, thinkTime);
  }

  shouldAdvancePhase() {
    const activePlayers = Object.values(this.players).filter(p => !p.folded && !p.allIn);
    if (activePlayers.length <= 1) return true;

    const allBet = activePlayers.every(p => p.bet === this.currentBet);
    return allBet;
  }

  /** 发公共牌前烧一张牌（丢弃，不放入 communityCards） */
  burnCard() {
    if (this.deck.length > 0) this.deck.pop();
  }

  /**
   * 公共牌标准流程：翻牌前烧 1 张 → 发 3 张；转牌前烧 1 张 → 发 1 张；河牌前烧 1 张 → 发 1 张。
   * 发下一档公共牌前若只剩 1 位未弃牌玩家，直接摊牌不再发牌。
   */
  advancePhase() {
    const stillIn = Object.values(this.players).filter(p => !p.folded);
    if (stillIn.length < 2) {
      this.gameState = 'showdown';
      this.determineWinner();
      return;
    }

    switch (this.gameState) {
      case 'preflop':
        this.gameState = 'flop';
        this.burnCard();
        for (let i = 0; i < 3; i++) this.communityCards.push(this.deck.pop());
        break;
      case 'flop':
        this.gameState = 'turn';
        this.burnCard();
        this.communityCards.push(this.deck.pop());
        break;
      case 'turn':
        this.gameState = 'river';
        this.burnCard();
        this.communityCards.push(this.deck.pop());
        break;
      case 'river':
        this.gameState = 'showdown';
        this.determineWinner();
        return;
    }
    // 只重置当前街道的下注目标，不清空 p.bet（本局总投入，摊牌时用于边池计算）
    this.currentBet = 0;
  }

  /**
   * 边池计算（严格按递归层级）：
   * 1. 将未弃牌玩家按本局投入 p.bet 从少到多得到各档 level
   * 2. 主池：最小档 × 投入>=该档的人数；参与者为所有投入>=该档的玩家
   * 3. 后续边池：每档 (level - 上一档) × 投入>=该档的人数，参与者为投入>=该档的玩家
   * 4. 分配时从最小池开始，在该池参与者中比牌，胜者得该池；多人牌力相同则平分
   * 例：A(10) B(25) C(25) D(40) → 主池40(A,B,C,D)、边池1:45(B,C,D)、边池2:15(D)
   */
  buildSidePots() {
    const activePlayers = Object.values(this.players).filter(p => !p.folded);
    if (activePlayers.length === 0) return [];
    const levels = [...new Set(activePlayers.map(p => p.bet))].filter(b => b > 0).sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;
    for (const level of levels) {
      const eligible = activePlayers.filter(p => p.bet >= level);
      const amount = (level - prevLevel) * eligible.length;
      if (amount > 0) pots.push({ amount, eligible });
      prevLevel = level;
    }
    return pots;
  }

  /** 在 eligible 玩家中按牌力选出赢家（可并列），返回 [player, ...] */
  getWinnersForEligible(eligiblePlayers) {
    if (eligiblePlayers.length === 0) return [];
    if (eligiblePlayers.length === 1) return eligiblePlayers;
    const withHands = eligiblePlayers.map(p => ({
      player: p,
      hand: evaluateHand(p.hand || [], this.communityCards || [])
    })).sort((a, b) => compareHands(b.hand, a.hand));
    const winners = [withHands[0].player];
    for (let i = 1; i < withHands.length; i++) {
      if (compareHands(withHands[i].hand, withHands[0].hand) === 0) {
        winners.push(withHands[i].player);
      }
    }
    return winners;
  }

  determineWinner() {
    const activePlayers = Object.values(this.players).filter(p => !p.folded);
    if (activePlayers.length === 1) {
      activePlayers[0].chips += this.pot;
      this.endHand();
      return;
    }

    let sidePots = this.buildSidePots();
    // 边池为空但底池>0（异常：如 bet 被误清空）时，将整池按牌力分给未弃牌玩家
    if (sidePots.length === 0 && this.pot > 0) {
      const winners = this.getWinnersForEligible(activePlayers);
      const amount = this.pot;
      if (winners.length === 1) {
        winners[0].chips += amount;
      } else {
        const winAmount = Math.floor(amount / winners.length);
        const remainder = amount % winners.length;
        winners.forEach((winner, index) => {
          winner.chips += winAmount + (index < remainder ? 1 : 0);
        });
      }
      this.gameState = 'ended';
      io.to(this.roomCode).emit('gameState', this.getGameState());
      const hadBust = this.emitGameOverIfBust();
      if (this._manualSettlement) {
        this.emitGameOver([]);
        this._manualSettlement = false;
        return;
      }
      if (!hadBust) {
        setTimeout(() => {
          const playersWithChips = Object.values(this.players).filter(p => p.chips > 0);
          if (playersWithChips.length >= 2) this.startNewHand();
        }, 1500);
      }
      return;
    }

    for (const { amount, eligible } of sidePots) {
      const winners = this.getWinnersForEligible(eligible);
      if (winners.length === 1) {
        winners[0].chips += amount;
      } else {
        const winAmount = Math.floor(amount / winners.length);
        const remainder = amount % winners.length;
        winners.forEach((winner, index) => {
          winner.chips += winAmount + (index < remainder ? 1 : 0);
        });
      }
    }

    this.gameState = 'ended';
    io.to(this.roomCode).emit('gameState', this.getGameState());
    const hadBust = this.emitGameOverIfBust();

    if (this._manualSettlement) {
      this.emitGameOver([]);
      this._manualSettlement = false;
      return;
    }
    if (!hadBust) {
      setTimeout(() => {
        const playersWithChips = Object.values(this.players).filter(p => p.chips > 0);
        if (playersWithChips.length >= 2) {
          this.startNewHand();
        }
      }, 1500);
    }
  }

  endHand() {
    this.gameState = 'ended';
    io.to(this.roomCode).emit('gameState', this.getGameState());
    this.emitGameOverIfBust();
    if (this._manualSettlement) {
      this.emitGameOver([]);
      this._manualSettlement = false;
    }
  }

  /** 仅暂停游戏并弹出结算界面，不结束本局、不摊牌。pausedByNickname 为点击结算的玩家昵称，会广播给全房间所有人同时弹窗并显示「某某暂停游戏」。 */
  pauseForSettlement(pausedByNickname) {
    this.paused = true;
    const results = Object.values(this.players).map(p => ({
      nickname: p.nickname,
      netChange: (this.chipsAtStartOfHand && this.chipsAtStartOfHand[p.socketId] != null)
        ? (p.chips - this.chipsAtStartOfHand[p.socketId])
        : 0,
      finalChips: p.chips
    }));
    const actions = Array.isArray(this.handActions) ? this.handActions.slice() : [];
    const startTs = this.handStartTime || (actions.length ? actions[0].timestamp : Date.now());
    const actionsWithTime = actions.map(a => ({
      ...a,
      elapsedSeconds: Math.max(0, Math.floor((a.timestamp - startTs) / 1000))
    }));
    io.to(this.roomCode).emit('gamePaused', {
      results,
      actions: actionsWithTime,
      meta: { paused: true },
      pausedBy: pausedByNickname || ''
    });
    io.to(this.roomCode).emit('gameState', this.getGameState());
  }

  /** 手动结算：暂停本局并弹出结算界面（不自动开下一局） */
  settleNow() {
    if (this.gameState === 'waiting' || this.gameState === 'ended') {
      if (!this.chipsAtStartOfHand) this.chipsAtStartOfHand = {};
      Object.values(this.players).forEach(p => {
        this.chipsAtStartOfHand[p.socketId] = p.chips;
      });
      this.emitGameOver([]);
      return;
    }
    this._manualSettlement = true;
    // 补发公共牌时也按规则烧牌：翻牌前烧1发3，转牌前烧1发1，河牌前烧1发1
    while (this.communityCards.length < 5 && this.deck.length > 0) {
      this.burnCard();
      const need = Math.min(5 - this.communityCards.length, this.communityCards.length === 0 ? 3 : 1);
      for (let i = 0; i < need && this.deck.length > 0; i++) this.communityCards.push(this.deck.pop());
    }
    this.gameState = 'showdown';
    io.to(this.roomCode).emit('gameState', this.getGameState());
    this.determineWinner();
  }

  emitGameOverIfBust() {
    if (!this.chipsAtStartOfHand) return false;
    const bustedPlayers = Object.values(this.players).filter(p =>
      this.chipsAtStartOfHand[p.socketId] != null &&
      this.chipsAtStartOfHand[p.socketId] > 0 &&
      p.chips === 0
    );
    if (bustedPlayers.length === 0) return false;
    this.emitGameOver(bustedPlayers);
    return true;
  }

  emitGameOver(bustedPlayers = []) {
    const now = new Date();
    const durationSeconds = this.handStartTime
      ? Math.max(0, Math.floor((Date.now() - this.handStartTime) / 1000))
      : 0;

    const results = Object.values(this.players).map(p => ({
      nickname: p.nickname,
      netChange: p.chips - (this.chipsAtStartOfHand && this.chipsAtStartOfHand[p.socketId] != null ? this.chipsAtStartOfHand[p.socketId] : p.chips),
      finalChips: p.chips
    }));

    const winners = results.filter(r => r.netChange > 0);

    let actions = Array.isArray(this.handActions) ? this.handActions.slice() : [];
    winners.forEach(w => {
      const player = Object.values(this.players).find(p => p.nickname === w.nickname);
      actions.push({
        nickname: w.nickname,
        action: 'win',
        amount: w.netChange,
        timestamp: Date.now()
      });
    });

    const startTs = this.handStartTime || (actions.length ? actions[0].timestamp : Date.now());
    actions = actions.map(a => ({
      ...a,
      elapsedSeconds: Math.max(0, Math.floor((a.timestamp - startTs) / 1000))
    }));

    const roomClosed = bustedPlayers.length > 0;
    io.to(this.roomCode).emit('gameOver', {
      results,
      actions,
      roomClosed,
      meta: {
        endedAt: now.toISOString(),
        durationSeconds,
        winners: winners.map(w => w.nickname),
        busted: bustedPlayers.map(p => p.nickname)
      }
    });

    if (roomClosed) {
      const roomCode = this.roomCode;
      Object.keys(this.players).forEach((socketId) => {
        const s = io.sockets.sockets.get(socketId);
        if (s) {
          s.leave(roomCode);
          delete s.roomCode;
        }
      });
      delete rooms[roomCode];
    }
  }

  getGameState() {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      gameState: this.gameState,
      paused: this.paused,
      pot: this.pot,
      currentBet: this.currentBet,
      communityCards: this.communityCards,
      dealerSeat: this.dealerSeat,
      currentPlayerSeat: this.currentPlayerSeat,
      config: CONFIG,
      players: Object.values(this.players)
    };
  }
}

// Socket.IO 连接
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('heartbeat', () => {
    playerLastActive[socket.id] = Date.now();
  });

  socket.on('createRoom', (nicknameOrPayload, callback) => {
    const roomCode = generateRoomCode();
    const room = new PokerRoom(roomCode, socket.id);
    rooms[roomCode] = room;

    const isPayload = nicknameOrPayload && typeof nicknameOrPayload === 'object';
    const playerName = isPayload ? (nicknameOrPayload.nickname || '玩家') : (nicknameOrPayload || '玩家');
    const initialChips = isPayload && typeof nicknameOrPayload.chips === 'number' ? nicknameOrPayload.chips : null;
    const player = room.addPlayer(socket.id, playerName, false, initialChips);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    callback({ success: true, roomCode, player: { ...player, isHost: true } });
    io.to(roomCode).emit('roomUpdate', room.getGameState());
  });

  socket.on('joinRoom', (roomCode, nicknameOrPayload, callback) => {
    const room = rooms[roomCode];
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }

    if (!room.canJoin()) {
      callback({ success: false, message: '房间已满' });
      return;
    }

    const isPayload = nicknameOrPayload && typeof nicknameOrPayload === 'object';
    const playerName = isPayload ? (nicknameOrPayload.nickname || '玩家') : (nicknameOrPayload || '玩家');
    const initialChips = isPayload && typeof nicknameOrPayload.chips === 'number' ? nicknameOrPayload.chips : null;
    const player = room.addPlayer(socket.id, playerName, false, initialChips);
    if (!player) {
      callback({ success: false, message: '无法加入房间' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode;
    room.lockRoom();

    const isHost = socket.id === room.hostId;
    callback({ success: true, roomCode, player: { ...player, isHost } });
    io.to(roomCode).emit('roomUpdate', room.getGameState());
  });

  // 添加机器人玩家（仅房主可用）
  socket.on('addBot', () => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    // 仅房主可以添加机器人，且只能在等待开局时添加
    if (room.hostId !== socket.id || room.gameState !== 'waiting') return;

    const currentPlayers = Object.values(room.players);
    if (currentPlayers.length >= CONFIG.MAX_SEATS) return;

    const roomCode = room.roomCode;
    const botNames = ['AI-小王', 'AI-小李', 'AI-小张', 'AI-小刘', 'AI-小陈'];
    const existingBots = currentPlayers.filter(p => p.isBot).length;
    const botName = botNames[existingBots % botNames.length];
    const botId = `BOT_${roomCode}_${Date.now()}_${existingBots}_${Math.floor(Math.random() * 1000)}`;

    room.addPlayer(botId, botName, true);

    io.to(roomCode).emit('roomUpdate', room.getGameState());
  });

  // 房主手动开始游戏（首局）
  socket.on('startGame', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room) {
      if (callback) callback({ success: false, message: '房间不存在' });
      return;
    }

    if (room.hostId !== socket.id) {
      if (callback) callback({ success: false, message: '只有房主可以开始游戏' });
      return;
    }

    const activePlayers = Object.values(room.players).filter(p => p.chips > 0);
    if (activePlayers.length < 2) {
      if (callback) callback({ success: false, message: '至少需要两名玩家才能开始游戏' });
      return;
    }

    if (room.gameState !== 'waiting' && room.gameState !== 'ended') {
      if (callback) callback({ success: false, message: '游戏已经在进行中' });
      return;
    }

    room.startNewHand();
    if (callback) callback({ success: true, gameState: room.getGameState() });
  });

  socket.on('playerAction', (action, amount, callback) => {
    const room = rooms[socket.roomCode];
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }

    const player = room.players[socket.id];
    const success = room.playerAction(socket.id, action, amount);
    if (success) {
      io.to(room.roomCode).emit('gameState', room.getGameState());
      if (action === 'all-in' && player) {
        io.to(room.roomCode).emit('emote', {
          playerId: socket.id,
          nickname: player.nickname,
          emoji: 'ALL IN !!!',
          seat: player.seat,
          autoTrigger: true
        });
      }
      room.nextAction();
      callback({ success: true });
    } else {
      callback({ success: false, message: '无效的动作' });
    }
  });

  // AI建议事件 - 获取AI决策辅助
  socket.on('getAISuggestion', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }

    const player = room.players[socket.id];
    if (!player) {
      callback({ success: false, message: '玩家不在房间中' });
      return;
    }

    // 构建游戏状态
    const gameState = {
      pot: room.pot,
      currentBet: room.currentBet,
      communityCards: room.communityCards,
      gameState: room.gameState,
      playerChips: player.chips,
      playerPosition: player.seat
    };

    // 获取AI决策（优先使用API，如果失败则使用规则决策）
    pokerAI.getAIDecision(gameState, socket.id).then(decision => {
      callback({
        success: true,
        decision: decision
      });
    }).catch(err => {
      // API失败时使用本地规则决策
      const ruleDecision = pokerAI.getRuleBasedDecision(gameState, player);
      callback({
        success: true,
        decision: {
          action: ruleDecision.action,
          amount: ruleDecision.amount,
          reasoning: ruleDecision.reasoning,
          isLocal: true
        }
      });
    });
  });

  socket.on('emote', (emoji) => {
    const room = rooms[socket.roomCode];
    if (!room) return;

    const now = Date.now();
    if (emoteCooldowns[socket.id] && now - emoteCooldowns[socket.id] < EMOJI_COOLDOWN) return;

    emoteCooldowns[socket.id] = now;
    const player = room.players[socket.id];
    if (player) {
      io.to(room.roomCode).emit('emote', {
        playerId: socket.id,
        nickname: player.nickname,
        emoji: emoji,
        seat: player.seat
      });
    }
  });

  socket.on('sendPhrase', (payload) => {
    const room = rooms[socket.roomCode];
    if (!room) return;
    const phraseId = payload && payload.phraseId;
    if (!phraseId || !PHRASE_IDS.includes(phraseId)) return;
    const now = Date.now();
    if (phraseCooldowns[socket.id] && now - phraseCooldowns[socket.id] < PHRASE_COOLDOWN_MS) return;
    phraseCooldowns[socket.id] = now;
    const fromPlayer = room.players[socket.id];
    if (!fromPlayer) return;
    io.to(room.roomCode).emit('phrase', {
      fromSocketId: socket.id,
      fromNickname: fromPlayer.nickname,
      fromSeat: fromPlayer.seat,
      phraseId: phraseId
    });
  });

  socket.on('restartGame', (callback) => {
    const room = rooms[socket.roomCode];
    if (!room || room.hostId !== socket.id) {
      callback({ success: false, message: '只有房主可以重启游戏' });
      return;
    }
    if (room.paused) {
      callback({ success: false, message: '游戏已暂停，请点击恢复游戏' });
      return;
    }

    Object.values(room.players).forEach(p => {
      p.chips = CONFIG.INITIAL_CHIPS;
    });

    room.startNewHand();
    callback({ success: true, gameState: room.getGameState() });
  });

  socket.on('leaveRoom', (callback) => {
    const roomCode = socket.roomCode;
    const room = roomCode ? rooms[roomCode] : null;
    if (!room || !room.players[socket.id]) {
      if (typeof callback === 'function') callback({ success: false, finalChips: null });
      return;
    }
    const player = room.players[socket.id];
    const finalChips = player.chips;
    const wasHost = socket.id === room.hostId;
    room.removePlayer(socket.id);
    delete socket.roomCode;
    socket.leave(roomCode);
    if (wasHost) {
      const newHostId = room.transferHost();
      if (newHostId) io.to(roomCode).emit('hostChanged', { newHostId });
    }
    room.unlockRoom();
    io.to(roomCode).emit('playerLeft', { nickname: player.nickname });
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomCode];
    } else {
      io.to(roomCode).emit('roomUpdate', room.getGameState());
      if (room.gameState !== 'waiting' && room.gameState !== 'ended') {
        const activePlayers = Object.values(room.players).filter(p => p.chips > 0);
        if (activePlayers.length < 2) {
          room.gameState = 'waiting';
          io.to(roomCode).emit('gameState', room.getGameState());
        }
      }
    }
    if (typeof callback === 'function') callback({ success: true, finalChips });
  });

  socket.on('requestSettlement', (callback) => {
    const roomCode = socket.roomCode;
    const room = roomCode ? rooms[roomCode] : null;
    if (!room || !room.players[socket.id]) {
      if (typeof callback === 'function') callback({ success: false, error: '未在房间内' });
      return;
    }
    const pausedByNickname = (room.players[socket.id] && room.players[socket.id].nickname) ? room.players[socket.id].nickname.trim() : '';
    room.pauseForSettlement(pausedByNickname);
    if (typeof callback === 'function') callback({ success: true });
  });

  socket.on('resumeGame', (callback) => {
    const roomCode = socket.roomCode;
    const room = roomCode ? rooms[roomCode] : null;
    if (!room || !room.players[socket.id]) {
      if (typeof callback === 'function') callback({ success: false, message: '未在房间内' });
      return;
    }
    if (!room.paused) {
      if (typeof callback === 'function') callback({ success: false, message: '游戏未暂停' });
      return;
    }
    room.paused = false;
    io.to(roomCode).emit('gameState', room.getGameState());
    if (typeof callback === 'function') callback({ success: true, gameState: room.getGameState() });
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room.players[socket.id]) {
        const player = room.players[socket.id];
        const wasHost = socket.id === room.hostId;
        room.removePlayer(socket.id);
        if (wasHost) {
          const newHostId = room.transferHost();
          if (newHostId) {
            io.to(roomCode).emit('hostChanged', { newHostId });
          }
        }
        room.unlockRoom();
        io.to(roomCode).emit('playerLeft', { nickname: player.nickname });
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomCode];
        } else {
          io.to(roomCode).emit('roomUpdate', room.getGameState());
          if (room.gameState !== 'waiting' && room.gameState !== 'ended') {
            const activePlayers = Object.values(room.players).filter(p => p.chips > 0);
            if (activePlayers.length < 2) {
              room.gameState = 'waiting';
              io.to(roomCode).emit('gameState', room.getGameState());
            }
          }
        }
        break;
      }
    }
  });
});

// 播放音效函数（服务端简单实现）
function playSound(type) {
  // 服务端不需要实际播放音效，只需记录
  console.log('Sound:', type);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
