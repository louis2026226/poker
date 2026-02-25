const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 游戏配置
const CONFIG = {
  INITIAL_CHIPS: 1000,
  SMALL_BLIND: 10,
  BIG_BLIND: 20,
  MAX_SEATS: 5,
  ROOM_CODE_LENGTH: 5
};

// 扑克牌相关
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 房间存储
const rooms = {};

// 生成房间代码
function generateRoomCode() {
  let code;
  do {
    code = Math.floor(10000 + Math.random() * 90000).toString();
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
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
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

// 找到最佳牌型
function findBestHand(cards) {
  if (cards.length < 5) return null;

  // 按花色分组
  const suits = {};
  cards.forEach(card => {
    if (!suits[card.suit]) suits[card.suit] = [];
    suits[card.suit].push(card);
  });

  // 检查同花
  for (const suit in suits) {
    if (suits[suit].length >= 5) {
      const flushCards = suits[suit].sort((a, b) => getCardValue(b.rank) - getCardValue(a.rank));
      const straight = findStraight(flushCards.map(c => getCardValue(c.rank)));
      if (straight) {
        if (straight === 14) return { type: 'royal-flush', value: straight, cards: flushCards.slice(0, 5) };
        return { type: 'straight-flush', value: straight, cards: flushCards.slice(0, 5) };
      }
      return { type: 'flush', value: getCardValue(flushCards[0].rank), cards: flushCards.slice(0, 5) };
    }
  }

  // 检查顺子
  const values = [...new Set(cards.map(c => getCardValue(c.rank)))].sort((a, b) => b - a);
  const straight = findStraight(values);
  if (straight) {
    return { type: 'straight', value: straight, cards: [] };
  }

  // 检查四条
  const counts = {};
  cards.forEach(card => {
    const v = getCardValue(card.rank);
    counts[v] = (counts[v] || 0) + 1;
  });

  const fourOfAKind = Object.keys(counts).filter(v => counts[v] === 4);
  if (fourOfAKind.length > 0) {
    const fourValue = parseInt(fourOfAKind[0]);
    const kicker = Math.max(...Object.keys(counts).filter(v => parseInt(v) !== fourValue).map(v => parseInt(v)));
    return { type: 'four-of-a-kind', value: fourValue, kicker, cards: [] };
  }

  // 检查葫芦
  const threes = Object.keys(counts).filter(v => counts[v] === 3);
  const pairs = Object.keys(counts).filter(v => counts[v] === 2);
  if (threes.length > 0 && (pairs.length > 0 || threes.length > 1)) {
    const threeValue = parseInt(threes[0]);
    let pairValue = 0;
    if (threes.length > 1) {
      pairValue = parseInt(threes[1]);
    } else if (pairs.length > 0) {
      pairValue = parseInt(pairs[0]);
    }
    return { type: 'full-house', value: threeValue, secondValue: pairValue, cards: [] };
  }

  // 检查三条
  if (threes.length > 0) {
    const threeValue = parseInt(threes[0]);
    const kickers = Object.keys(counts)
      .filter(v => parseInt(v) !== threeValue)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .slice(0, 2)
      .map(v => parseInt(v));
    return { type: 'three-of-a-kind', value: threeValue, kickers, cards: [] };
  }

  // 检查两对
  if (pairs.length >= 2) {
    const pairValues = pairs.map(v => parseInt(v)).sort((a, b) => b - a);
    const kicker = Math.max(...Object.keys(counts).filter(v => !pairs.includes(v)).map(v => parseInt(v)));
    return { type: 'two-pairs', value: pairValues[0], secondValue: pairValues[1], kicker, cards: [] };
  }

  // 检查一对
  if (pairs.length > 0) {
    const pairValue = parseInt(pairs[0]);
    const kickers = Object.keys(counts)
      .filter(v => parseInt(v) !== pairValue)
      .sort((a, b) => parseInt(b) - parseInt(a))
      .slice(0, 3)
      .map(v => parseInt(v));
    return { type: 'one-pair', value: pairValue, kickers, cards: [] };
  }

  // 高牌
  const topCards = values.slice(0, 5);
  return { type: 'high-card', value: topCards[0], kickers: topCards.slice(1), cards: [] };
}

// 找顺子
function findStraight(values) {
  if (values.includes(14) && values.includes(2) && values.includes(3) && values.includes(4) && values.includes(5)) {
    return 5; // A-2-3-4-5
  }
  for (let i = 0; i <= values.length - 5; i++) {
    let isStraight = true;
    for (let j = 0; j < 4; j++) {
      if (values[i + j] !== values[i + j + 1] + 1) {
        isStraight = false;
        break;
      }
    }
    if (isStraight) return values[i];
  }
  return null;
}

// 比较牌型
function compareHands(hand1, hand2) {
  const typeOrder = ['royal-flush', 'straight-flush', 'four-of-a-kind', 'full-house', 'flush', 'straight', 'three-of-a-kind', 'two-pairs', 'one-pair', 'high-card'];
  const t1 = typeOrder.indexOf(hand1.type);
  const t2 = typeOrder.indexOf(hand2.type);
  if (t1 !== t2) return t1 < t2 ? 1 : -1;
  if (hand1.value !== hand2.value) return hand1.value > hand2.value ? 1 : -1;
  if (hand1.secondValue !== hand2.secondValue) return hand1.secondValue > hand2.secondValue ? 1 : -1;
  if (hand1.kicker !== hand2.kicker) return hand1.kicker > hand2.kicker ? 1 : -1;
  if (hand1.kickers && hand2.kickers) {
    for (let i = 0; i < hand1.kickers.length; i++) {
      if (hand1.kickers[i] !== hand2.kickers[i]) {
        return hand1.kickers[i] > hand2.kickers[i] ? 1 : -1;
      }
    }
  }
  return 0;
}

// 获取牌型名称
function getHandTypeName(type) {
  const names = {
    'royal-flush': '皇家同花顺',
    'straight-flush': '同花顺',
    'four-of-a-kind': '四条',
    'full-house': '葫芦',
    'flush': '同花',
    'straight': '顺子',
    'three-of-a-kind': '三条',
    'two-pairs': '两对',
    'one-pair': '一对',
    'high-card': '高牌'
  };
  return names[type] || type;
}

// 房间类
class PokerRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = {};
    this.seats = [null, null, null, null, null]; // 5个座位
    this.gameState = 'waiting'; // waiting, preflop, flop, turn, river, showdown, ended
    this.deck = [];
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.dealerSeat = 0;
    this.currentPlayerSeat = 0;
    this.playerBets = {};
    this.playerHands = {};
    this.playerActions = {};
    this.lastRaiseSeat = -1;
    this.gameHistory = [];
  }

  addPlayer(socketId, nickname) {
    // 找到第一个空座位
    const seatIndex = this.seats.findIndex(s => s === null);
    if (seatIndex === -1) return null;

    const player = {
      socketId,
      nickname,
      chips: CONFIG.INITIAL_CHIPS,
      seat: seatIndex,
      folded: false,
      allIn: false
    };

    this.players[socketId] = player;
    this.seats[seatIndex] = socketId;
    return player;
  }

  removePlayer(socketId) {
    const player = this.players[socketId];
    if (!player) return;

    this.seats[player.seat] = null;
    delete this.players[socketId];

    // 如果是游戏中的玩家，标记为放弃
    if (this.gameState !== 'waiting') {
      player.folded = true;
      this.players[socketId] = player;
    }
  }

  getActivePlayers() {
    return Object.values(this.players).filter(p => !p.folded && p.chips > 0);
  }

  getPlayersInOrder(startSeat) {
    const result = [];
    let seat = startSeat;
    for (let i = 0; i < 5; i++) {
      const socketId = this.seats[seat];
      if (socketId && this.players[socketId]) {
        result.push(this.players[socketId]);
      }
      seat = (seat + 1) % 5;
    }
    return result;
  }

  getPlayerBySeat(seat) {
    const socketId = this.seats[seat];
    return socketId ? this.players[socketId] : null;
  }

  startNewHand() {
    // 检查是否有人输光
    for (const socketId in this.players) {
      if (this.players[socketId].chips <= 0) {
        this.endGame();
        return;
      }
    }

    // 至少需要2个玩家才能开始
    const activePlayers = Object.values(this.players).filter(p => p.chips > 0);
    if (activePlayers.length < 2) {
      this.gameState = 'waiting';
      return;
    }

    this.deck = createDeck();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.currentBet = 0;
    this.playerBets = {};
    this.playerHands = {};
    this.playerActions = {};
    this.lastRaiseSeat = -1;

    // 分配庄家
    if (this.dealerSeat === -1 || !this.getPlayerBySeat(this.dealerSeat)) {
      this.dealerSeat = this.seats.findIndex(s => s !== null);
    } else {
      // 找到下一个有玩家的座位
      let next = (this.dealerSeat + 1) % 5;
      while (!this.seats[next]) {
        next = (next + 1) % 5;
      }
      this.dealerSeat = next;
    }

    // 发牌
    for (const socketId in this.players) {
      const player = this.players[socketId];
      player.folded = false;
      player.allIn = false;
      this.playerHands[socketId] = [this.deck.pop(), this.deck.pop()];
    }

    // 确定小盲和大盲位置
    const dealer = this.getPlayerBySeat(this.dealerSeat);
    if (!dealer) {
      this.gameState = 'waiting';
      return;
    }

    const players = this.getPlayersInOrder(this.dealerSeat).filter(p => p.chips > 0);
    if (players.length < 2) {
      this.gameState = 'waiting';
      return;
    }

    // 小盲
    const sbPlayer = players[0];
    const sbAmount = Math.min(CONFIG.SMALL_BLIND, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    this.playerBets[sbPlayer.socketId] = sbAmount;
    this.pot += sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;

    // 大盲
    const bbPlayer = players[1];
    const bbAmount = Math.min(CONFIG.BIG_BLIND, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    this.playerBets[bbPlayer.socketId] = bbAmount;
    this.pot += bbAmount;
    this.currentBet = bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;

    this.lastRaiseSeat = bbPlayer.seat;
    this.currentPlayerSeat = players[players.length > 2 ? 2 : 0].seat;

    this.gameState = 'preflop';
    io.to(this.roomCode).emit('gameState', this.getGameState());
  }

  playerAction(socketId, action, amount = 0) {
    const player = this.players[socketId];
    if (!player || player.seat !== this.currentPlayerSeat) return false;

    const currentBet = this.playerBets[socketId] || 0;
    const toCall = this.currentBet - currentBet;

    switch (action) {
      case 'fold':
        player.folded = true;
        this.playerActions[socketId] = 'fold';
        break;

      case 'check':
        if (toCall > 0) return false;
        this.playerActions[socketId] = 'check';
        break;

      case 'call':
        const callAmount = Math.min(toCall, player.chips);
        player.chips -= callAmount;
        this.playerBets[socketId] = currentBet + callAmount;
        this.pot += callAmount;
        if (player.chips === 0) player.allIn = true;
        this.playerActions[socketId] = 'call';
        if (callAmount < toCall) {
          // 玩家全跟
          const sidePot = toCall - callAmount;
          this.pot -= sidePot;
          this.sidePots.push({ amount: sidePot, players: Object.keys(this.playerBets) });
        }
        break;

      case 'raise':
        const raiseAmount = Math.max(amount, this.currentBet * 2);
        const totalBet = raiseAmount;
        const actualRaise = Math.min(totalBet - currentBet, player.chips);
        player.chips -= actualRaise;
        this.playerBets[socketId] = currentBet + actualRaise;
        this.pot += actualRaise;
        this.currentBet = this.playerBets[socketId];
        if (player.chips === 0) player.allIn = true;
        this.playerActions[socketId] = 'raise';
        this.lastRaiseSeat = player.seat;
        break;

      case 'all-in':
        const allInAmount = player.chips;
        player.chips = 0;
        player.allIn = true;
        const newTotalBet = currentBet + allInAmount;
        this.playerBets[socketId] = newTotalBet;
        this.pot += allInAmount;
        if (newTotalBet > this.currentBet) {
          this.currentBet = newTotalBet;
          this.lastRaiseSeat = player.seat;
        }
        this.playerActions[socketId] = 'all-in';
        break;
    }

    return true;
  }

  nextAction() {
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) {
      this.resolveShowdown();
      return;
    }

    // 检查是否所有玩家都已行动
    let allActed = true;
    for (const socketId in this.players) {
      if (!this.players[socketId].folded && this.players[socketId].chips > 0 && !this.playerActions[socketId]) {
        allActed = false;
        break;
      }
    }

    if (allActed) {
      // 检查是否需要开牌
      const betsEqual = Object.values(this.playerBets).every(b => b === this.currentBet || this.players[Object.keys(this.playerBets).find(sid => this.playerBets[sid] === b)]?.folded);
      
      if (betsEqual || activePlayers.length === 1) {
        this.nextStreet();
        return;
      }
    }

    // 找到下一个行动的玩家
    let nextSeat = (this.currentPlayerSeat + 1) % 5;
    let attempts = 0;
    while (attempts < 5) {
      const nextPlayer = this.getPlayerBySeat(nextSeat);
      if (nextPlayer && !nextPlayer.folded && nextPlayer.chips > 0 && !this.playerActions[nextPlayer.socketId]) {
        this.currentPlayerSeat = nextSeat;
        io.to(this.roomCode).emit('gameState', this.getGameState());
        return;
      }
      nextSeat = (nextSeat + 1) % 5;
      attempts++;
    }

    // 如果没有玩家可以行动，进入下一轮
    this.nextStreet();
  }

  nextStreet() {
    // 清理已放弃的玩家
    for (const socketId in this.players) {
      if (this.players[socketId].folded) {
        delete this.playerHands[socketId];
      }
    }

    const activePlayers = this.getActivePlayers();
    if (activePlayers.length === 0) {
      this.resolveShowdown();
      return;
    }

    // 检查是否只剩一个玩家
    if (activePlayers.length === 1) {
      this.awardPot([activePlayers[0]]);
      return;
    }

    // 重置行动
    this.playerActions = {};
    this.currentBet = 0;
    this.lastRaiseSeat = -1;

    switch (this.gameState) {
      case 'preflop':
        this.communityCards = [this.deck.pop(), this.deck.pop(), this.deck.pop()];
        this.gameState = 'flop';
        // 从庄家左边的第一个玩家开始
        const firstToAct = (this.dealerSeat + 1) % 5;
        this.currentPlayerSeat = firstToAct;
        break;

      case 'flop':
        this.communityCards.push(this.deck.pop());
        this.gameState = 'turn';
        const turnFirst = (this.dealerSeat + 1) % 5;
        this.currentPlayerSeat = turnFirst;
        break;

      case 'turn':
        this.communityCards.push(this.deck.pop());
        this.gameState = 'river';
        const riverFirst = (this.dealerSeat + 1) % 5;
        this.currentPlayerSeat = riverFirst;
        break;

      case 'river':
        this.resolveShowdown();
        return;
    }

    io.to(this.roomCode).emit('gameState', this.getGameState());
  }

  resolveShowdown() {
    this.gameState = 'showdown';

    const playersWithHands = [];
    for (const socketId in this.playerHands) {
      const player = this.players[socketId];
      if (!player.folded) {
        const hand = evaluateHand(this.playerHands[socketId], this.communityCards);
        playersWithHands.push({ player, hand });
      }
    }

    // 比较牌型，确定赢家
    playersWithHands.sort((a, b) => compareHands(b.hand, a.hand));

    const winners = [playersWithHands[0]];
    for (let i = 1; i < playersWithHands.length; i++) {
      if (compareHands(playersWithHands[i].hand, winners[0].hand) === 0) {
        winners.push(playersWithHands[i]);
      }
    }

    this.awardPot(winners.map(w => w.player));
  }

  awardPot(winners) {
    const totalPot = this.pot + Object.values(this.playerBets).reduce((a, b) => a + b, 0);
    const winAmount = Math.floor(totalPot / winners.length);

    winners.forEach(winner => {
      winner.chips += winAmount;
    });

    this.gameState = 'ended';
    io.to(this.roomCode).emit('gameState', this.getGameState());

    // 延迟开始下一局
    setTimeout(() => {
      this.startNewHand();
    }, 3000);
  }

  endGame() {
    this.gameState = 'ended';
    
    // 计算每个玩家的输赢
    const results = [];
    for (const socketId in this.players) {
      const player = this.players[socketId];
      results.push({
        nickname: player.nickname,
        finalChips: player.chips,
        netChange: player.chips - CONFIG.INITIAL_CHIPS
      });
    }

    // 按输赢排序
    results.sort((a, b) => b.netChange - a.netChange);

    io.to(this.roomCode).emit('gameOver', { results });
  }

  getGameState() {
    const playersArray = [];
    for (const socketId in this.players) {
      const p = this.players[socketId];
      playersArray.push({
        socketId,
        nickname: p.nickname,
        chips: p.chips,
        seat: p.seat,
        folded: p.folded,
        allIn: p.allIn,
        bet: this.playerBets[socketId] || 0,
        hand: this.playerHands[socketId] || [],
        action: this.playerActions[socketId]
      });
    }

    return {
      roomCode: this.roomCode,
      gameState: this.gameState,
      communityCards: this.communityCards,
      pot: this.pot,
      currentBet: this.currentBet,
      dealerSeat: this.dealerSeat,
      currentPlayerSeat: this.currentPlayerSeat,
      lastRaiseSeat: this.lastRaiseSeat,
      players: playersArray,
      config: CONFIG
    };
  }
}

// Socket.io 处理
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // 创建房间
  socket.on('createRoom', (nickname, callback) => {
    const roomCode = generateRoomCode();
    const room = new PokerRoom(roomCode);
    rooms[roomCode] = room;

    const player = room.addPlayer(socket.id, nickname);
    socket.join(roomCode);
    socket.roomCode = roomCode; // 设置玩家所在的房间

    callback({ success: true, roomCode, player: { ...player, isHost: true } });
    io.to(roomCode).emit('roomUpdate', room.getGameState());
  });

  // 加入房间
  socket.on('joinRoom', (roomCode, nickname, callback) => {
    const room = rooms[roomCode];
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }

    const activeCount = Object.keys(room.players).length;
    if (activeCount >= CONFIG.MAX_SEATS) {
      callback({ success: false, message: '房间已满' });
      return;
    }

    const player = room.addPlayer(socket.id, nickname);
    if (!player) {
      callback({ success: false, message: '无法加入房间' });
      return;
    }

    socket.join(roomCode);
    socket.roomCode = roomCode; // 设置玩家所在的房间

    callback({ success: true, roomCode, player: { ...player, isHost: false } });
    io.to(roomCode).emit('roomUpdate', room.getGameState());

    // 如果人数>=2且游戏未开始，自动开始
    const activePlayers = Object.values(room.players).filter(p => p.chips > 0);
    if (activePlayers.length >= 2 && room.gameState === 'waiting') {
      room.startNewHand();
    }
  });

  // 玩家动作
  socket.on('playerAction', (action, amount, callback) => {
    const room = rooms[socket.roomCode];
    if (!room) {
      callback({ success: false, message: '房间不存在' });
      return;
    }

    const success = room.playerAction(socket.id, action, amount);
    if (success) {
      io.to(room.roomCode).emit('gameState', room.getGameState());
      room.nextAction();
      callback({ success: true });
    } else {
      callback({ success: false, message: '无效的动作' });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    
    // 查找玩家所在的房间
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room.players[socket.id]) {
        const player = room.players[socket.id];
        room.removePlayer(socket.id);
        
        io.to(roomCode).emit('playerLeft', { nickname: player.nickname });
        
        // 如果房间空了，删除房间
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomCode];
        } else {
          io.to(roomCode).emit('roomUpdate', room.getGameState());
          
          // 如果游戏进行中但玩家不够，重新开始
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

  // 存储socket所在的房间
  socket.roomCode = null;
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
