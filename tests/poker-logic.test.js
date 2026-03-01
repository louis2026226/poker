/**
 * 德州扑克胜负与边池逻辑单元测试
 * 运行: node tests/poker-logic.test.js
 * 逻辑与 server.js 中 evaluateHand / compareHands / buildSidePots 保持一致
 */

const assert = require('assert');

// ---------- 与 server 一致的牌面与工具 ----------
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
function getCardValue(rank) {
  const values = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return values[rank];
}
function card(rank, suit) {
  const s = typeof suit === 'string' ? suit : SUITS[suit];
  return { rank, suit: s };
}

// ---------- 5 张牌评估（与 server evaluateFiveCards 一致） ----------
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
  if (uniqueValuesAsc.length >= 5) {
    for (let i = 0; i <= uniqueValuesAsc.length - 5; i++) {
      let ok = true;
      for (let j = 0; j < 4; j++) {
        if (uniqueValuesAsc[i + j + 1] !== uniqueValuesAsc[i] + j + 1) { ok = false; break; }
      }
      if (ok) { isStraight = true; straightHigh = uniqueValuesAsc[i + 4]; break; }
    }
  }
  if (!isStraight && uniqueValuesDesc.includes(14) && [5,4,3,2].every(v => uniqueValuesDesc.includes(v))) {
    isStraight = true;
    straightHigh = 5;
  }
  if (isFlush && isStraight) {
    const flushValues = sorted.map(c => getCardValue(c.rank));
    const flushUniqueAsc = [...new Set(flushValues.slice().sort((a, b) => a - b))];
    let fh = 0;
    if (flushUniqueAsc.length >= 5) {
      for (let i = 0; i <= flushUniqueAsc.length - 5; i++) {
        let ok = true;
        for (let j = 0; j < 4; j++) {
          if (flushUniqueAsc[i + j + 1] !== flushUniqueAsc[i] + j + 1) { ok = false; break; }
        }
        if (ok) { fh = flushUniqueAsc[i + 4]; break; }
      }
    }
    if (!fh && [14,5,4,3,2].every(v => flushValues.includes(v))) fh = 5;
    return { type: fh === 14 ? 'royal-flush' : 'straight-flush', category: fh === 14 ? 9 : 8, ranks: [fh], cards: sorted };
  }
  if (byCountThenValue[0].count === 4) {
    const four = byCountThenValue[0].value;
    const kicker = uniqueValuesDesc.find(v => v !== four) || four;
    return { type: 'four-of-a-kind', category: 7, ranks: [four, kicker], cards: sorted };
  }
  if (byCountThenValue[0].count === 3 && byCountThenValue[1] && byCountThenValue[1].count >= 2) {
    return { type: 'full-house', category: 6, ranks: [byCountThenValue[0].value, byCountThenValue[1].value], cards: sorted };
  }
  if (isFlush) {
    return { type: 'flush', category: 5, ranks: values.slice(0, 5), cards: sorted };
  }
  if (isStraight) {
    return { type: 'straight', category: 4, ranks: [straightHigh], cards: sorted };
  }
  if (byCountThenValue[0].count === 3) {
    const trip = byCountThenValue[0].value;
    const kickers = uniqueValuesDesc.filter(v => v !== trip).slice(0, 2);
    return { type: 'three-of-a-kind', category: 3, ranks: [trip, ...kickers], cards: sorted };
  }
  if (byCountThenValue[0].count === 2 && byCountThenValue[1] && byCountThenValue[1].count === 2) {
    const highPair = Math.max(byCountThenValue[0].value, byCountThenValue[1].value);
    const lowPair = Math.min(byCountThenValue[0].value, byCountThenValue[1].value);
    const kicker = uniqueValuesDesc.find(v => v !== highPair && v !== lowPair) || lowPair;
    return { type: 'two-pair', category: 2, ranks: [highPair, lowPair, kicker], cards: sorted };
  }
  if (byCountThenValue[0].count === 2) {
    const pair = byCountThenValue[0].value;
    const kickers = uniqueValuesDesc.filter(v => v !== pair).slice(0, 3);
    return { type: 'pair', category: 1, ranks: [pair, ...kickers], cards: sorted };
  }
  return { type: 'high-card', category: 0, ranks: uniqueValuesDesc.slice(0, 5), cards: sorted };
}

function findBestHand(cards) {
  if (cards.length < 5) return null;
  const n = cards.length;
  let best = null;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const hand = evaluateFiveCards(five);
            if (!best || compareHands(hand, best) > 0) best = hand;
          }
        }
      }
    }
  }
  return best;
}

function evaluateHand(holeCards, communityCards) {
  const allCards = [...(holeCards || []), ...(communityCards || [])];
  return findBestHand(allCards);
}

function compareHands(hand1, hand2) {
  if (!hand1 && !hand2) return 0;
  if (!hand1) return -1;
  if (!hand2) return 1;
  if (hand1.category !== hand2.category) return hand1.category - hand2.category;
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

/** 边池计算：参与玩家按投入从少到多分层，每层彩池的参与者为投入>=该层的玩家 */
function calculateSidePots(activePlayers) {
  if (activePlayers.length === 0) return [];
  const levels = [...new Set(activePlayers.map(p => p.bet))].filter(b => b > 0).sort((a, b) => a - b);
  const pots = [];
  let prevLevel = 0;
  for (const level of levels) {
    const eligible = activePlayers.filter(p => p.bet >= level);
    const amount = (level - prevLevel) * eligible.length;
    if (amount > 0) pots.push({ amount, level, eligible });
    prevLevel = level;
  }
  return pots;
}

// ---------- 测试 ----------
function runTests() {
  console.log('=== compareHands 牌型比较 ===');
  const rf = evaluateFiveCards([card('A',0), card('K',0), card('Q',0), card('J',0), card('10',0)]);
  const sf = evaluateFiveCards([card('K',0), card('Q',0), card('J',0), card('10',0), card('9',0)]);
  assert.strictEqual(rf.category, 9);
  assert.strictEqual(sf.category, 8);
  assert.strictEqual(compareHands(rf, sf), 1);
  assert.strictEqual(compareHands(sf, rf), -1);

  const wheel = evaluateFiveCards([card('A',0), card('5',1), card('4',2), card('3',0), card('2',1)]);
  const sixHigh = evaluateFiveCards([card('6',0), card('5',1), card('4',2), card('3',0), card('2',1)]);
  assert.strictEqual(wheel.type, 'straight');
  assert.strictEqual(wheel.ranks[0], 5);
  assert.strictEqual(compareHands(sixHigh, wheel), 1);
  assert.strictEqual(compareHands(wheel, sixHigh), -1);

  const pair9 = evaluateFiveCards([card('9',0), card('9',1), card('A',2), card('K',0), card('7',1)]);
  const pair9lower = evaluateFiveCards([card('9',0), card('9',1), card('A',2), card('Q',0), card('7',1)]);
  assert.strictEqual(compareHands(pair9, pair9lower), 1);
  assert.strictEqual(compareHands(pair9lower, pair9), -1);

  console.log('=== evaluateHand 7 选 5 ===');
  const hole = [card('A',0), card('K',0)];
  const board = [card('Q',0), card('J',0), card('10',0), card('2',1), card('3',2)];
  const best = evaluateHand(hole, board);
  assert.strictEqual(best.type, 'royal-flush');
  assert.strictEqual(best.category, 9);

  const hole2 = [card('5',0), card('4',0)];
  const board2 = [card('3',0), card('2',0), card('A',0), card('K',1), card('Q',2)];
  const best2 = evaluateHand(hole2, board2);
  assert.strictEqual(best2.type, 'straight-flush');
  assert.strictEqual(best2.ranks[0], 5);

  console.log('=== calculateSidePots 边池 ===');
  const players = [
    { id: 'A', bet: 100 },
    { id: 'B', bet: 200 },
    { id: 'C', bet: 200 }
  ];
  const pots = calculateSidePots(players);
  assert.strictEqual(pots.length, 2);
  assert.strictEqual(pots[0].amount, 300);
  assert.strictEqual(pots[0].eligible.length, 3);
  assert.strictEqual(pots[1].amount, 200);
  assert.strictEqual(pots[1].eligible.length, 2);
  assert.strictEqual(pots[0].amount + pots[1].amount, 500);

  const players2 = [
    { id: 'A', bet: 50 },
    { id: 'B', bet: 50 },
    { id: 'C', bet: 50 }
  ];
  const pots2 = calculateSidePots(players2);
  assert.strictEqual(pots2.length, 1);
  assert.strictEqual(pots2[0].amount, 150);
  assert.strictEqual(pots2[0].eligible.length, 3);

  console.log('=== 同花比踢脚（5 张牌面值） ===');
  const flush1 = evaluateFiveCards([card('A',0), card('K',0), card('9',0), card('7',0), card('3',0)]);
  const flush2 = evaluateFiveCards([card('A',0), card('K',0), card('8',0), card('7',0), card('3',0)]);
  assert.strictEqual(flush1.category, 5);
  assert.strictEqual(flush1.ranks.length, 5);
  assert.strictEqual(compareHands(flush1, flush2), 1);

  console.log('=== 边池实例：A(10) B(25) C(25) D(40) ===');
  const fourPlayers = [
    { id: 'A', bet: 10 },
    { id: 'B', bet: 25 },
    { id: 'C', bet: 25 },
    { id: 'D', bet: 40 }
  ];
  const pots4 = calculateSidePots(fourPlayers);
  assert.strictEqual(pots4.length, 3);
  assert.strictEqual(pots4[0].amount, 40, '主池 10×4=40');
  assert.strictEqual(pots4[0].eligible.length, 4);
  assert.strictEqual(pots4[1].amount, 45, '边池1 (25-10)×3=45');
  assert.strictEqual(pots4[1].eligible.length, 3);
  assert.strictEqual(pots4[2].amount, 15, '边池2 (40-25)×1=15');
  assert.strictEqual(pots4[2].eligible.length, 1);
  assert.strictEqual(pots4[0].amount + pots4[1].amount + pots4[2].amount, 100);

  console.log('=== 牌型顺序：同花 > 顺子 > 一对 > 高牌 ===');
  const handFlush = evaluateFiveCards([card('K',0), card('Q',0), card('J',0), card('9',0), card('2',0)]);
  const handStraight = evaluateFiveCards([card('10',1), card('9',2), card('8',0), card('7',1), card('6',2)]);
  const handPair = evaluateFiveCards([card('A',0), card('A',1), card('K',2), card('Q',0), card('J',1)]);
  const handHigh = evaluateFiveCards([card('K',0), card('Q',1), card('J',2), card('9',0), card('2',1)]);
  assert.ok(compareHands(handFlush, handStraight) > 0);
  assert.ok(compareHands(handFlush, handPair) > 0);
  assert.ok(compareHands(handStraight, handPair) > 0);
  assert.ok(compareHands(handPair, handHigh) > 0);

  console.log('=== 同类型比踢脚 ===');
  const pair10AK = evaluateFiveCards([card('10',0), card('10',1), card('A',2), card('K',0), card('7',1)]);
  const pair10AQ = evaluateFiveCards([card('10',0), card('10',1), card('A',2), card('Q',0), card('7',1)]);
  assert.ok(compareHands(pair10AK, pair10AQ) > 0, '一对：同对10，踢脚 A-K-7 胜 A-Q-7');
  const pair10A73 = evaluateFiveCards([card('10',0), card('10',1), card('A',2), card('7',0), card('3',1)]);
  const pair10A72 = evaluateFiveCards([card('10',0), card('10',1), card('A',2), card('7',0), card('2',1)]);
  assert.ok(compareHands(pair10A73, pair10A72) > 0, '一对：第三踢脚 3 胜 2');

  const twoPairKK99A = evaluateFiveCards([card('K',0), card('K',1), card('9',2), card('9',0), card('A',1)]);
  const twoPairKK99Q = evaluateFiveCards([card('K',0), card('K',1), card('9',2), card('9',0), card('Q',1)]);
  assert.ok(compareHands(twoPairKK99A, twoPairKK99Q) > 0, '两对：同两对，踢脚 A 胜 Q');

  const trip8AK = evaluateFiveCards([card('8',0), card('8',1), card('8',2), card('A',0), card('K',1)]);
  const trip8AQ = evaluateFiveCards([card('8',0), card('8',1), card('8',2), card('A',0), card('Q',1)]);
  assert.ok(compareHands(trip8AK, trip8AQ) > 0, '三条：同三条8，踢脚 A-K 胜 A-Q');

  const highAKJ92 = evaluateFiveCards([card('A',0), card('K',1), card('J',2), card('9',0), card('2',1)]);
  const highAKJ82 = evaluateFiveCards([card('A',0), card('K',1), card('J',2), card('8',0), card('2',1)]);
  assert.ok(compareHands(highAKJ92, highAKJ82) > 0, '高牌：第四张 9 胜 8');

  const straight10 = evaluateFiveCards([card('10',0), card('9',1), card('8',2), card('7',0), card('6',1)]);
  const straight9 = evaluateFiveCards([card('9',0), card('8',1), card('7',2), card('6',0), card('5',1)]);
  assert.ok(compareHands(straight10, straight9) > 0, '顺子：10 高顺胜 9 高顺');

  console.log('=== 平局平分 ===');
  const sameBoard = [card('A',0), card('K',1), card('Q',2), card('J',0), card('10',1)];
  const royal1 = evaluateFiveCards(sameBoard);
  const royal2 = evaluateFiveCards(sameBoard.slice());
  assert.strictEqual(compareHands(royal1, royal2), 0, '同一副五张牌：完全平局');

  const pairKK1 = evaluateFiveCards([card('K',0), card('K',1), card('A',2), card('Q',0), card('J',1)]);
  const pairKK2 = evaluateFiveCards([card('K',2), card('K',3), card('A',0), card('Q',1), card('J',2)]);
  assert.strictEqual(compareHands(pairKK1, pairKK2), 0, '同对 K、同踢脚 A-Q-J：平局');

  const wheel1 = evaluateFiveCards([card('A',0), card('5',1), card('4',2), card('3',0), card('2',1)]);
  const wheel2 = evaluateFiveCards([card('5',0), card('4',1), card('3',2), card('2',0), card('A',1)]);
  assert.strictEqual(compareHands(wheel1, wheel2), 0, 'A-2-3-4-5 顺子与另一组 A-5 顺子：平局');

  const potForSplit = 100;
  const splitWinners = 2;
  const winAmount = Math.floor(potForSplit / splitWinners);
  const remainder = potForSplit % splitWinners;
  assert.strictEqual(winAmount, 50);
  assert.strictEqual(remainder, 0);
  const chipsEach = winAmount + (remainder > 0 ? 1 : 0);
  assert.strictEqual(chipsEach * splitWinners, potForSplit, '平分彩池：100 池 2 人各得 50');

  const potOdd = 101;
  const winOdd = Math.floor(potOdd / 2);
  const remOdd = potOdd % 2;
  assert.strictEqual(winOdd, 50);
  assert.strictEqual(remOdd, 1);
  assert.strictEqual(winOdd + (0 < remOdd ? 1 : 0) + winOdd, 101, '平分彩池：101 池 2 人得 50+51');

  console.log('所有测试通过');
}

runTests();
