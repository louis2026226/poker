/**
 * 本地规则 Poker AI：仅用于机器人决策，不调用外部服务
 */

function evaluateHandStrength(holeCards, communityCards) {
  if (!holeCards || holeCards.length < 2) return 0;
  
  const allCards = [...holeCards, ...communityCards];
  const ranks = allCards.map(c => c.rank);
  const suits = allCards.map(c => c.suit);
  
  // 统计每种rank和suit的数量
  const rankCounts = {};
  const suitCounts = {};
  
  ranks.forEach(r => {
    rankCounts[r] = (rankCounts[r] || 0) + 1;
  });
  
  suits.forEach(s => {
    suitCounts[s] = (suitCounts[s] || 0) + 1;
  });
  
  // 简单的手牌评估
  let strength = 0.1; // 基础强度
  
  // 对子
  const pairs = Object.values(rankCounts).filter(c => c >= 2).length;
  if (pairs === 1) strength += 0.3;
  if (pairs >= 2) strength += 0.4;
  
  // 同花
  const flushSuit = Object.values(suitCounts).find(s => s >= 5 || (s >= 4 && communityCards.length >= 3));
  if (flushSuit) strength += 0.5;
  
  // 高牌（A、K、Q）
  const highCards = ranks.filter(r => ['A', 'K', 'Q', 'J'].includes(r)).length;
  strength += highCards * 0.05;
  
  // 顺子可能
  if (communityCards.length >= 3) {
    strength += 0.1;
  }
  
  return Math.min(strength, 1.0);
}

/**
 * 获取基于规则的简单决策（不依赖外部API）
 * @param {Object} gameState - 游戏状态
 * @param {Object} player - 玩家信息
 * @returns {Object} - 决策结果
 */
function getRuleBasedDecision(gameState, player) {
  const communityCards = gameState.communityCards || [];
  const handStrength = evaluateHandStrength(player.hand || [], communityCards);
  const currentBet = player.bet || 0;
  const toCall = (gameState.currentBet || 0) - currentBet;
  const playerChips = player.chips || 0;
  
  // 非常保守的策略
  if (handStrength < 0.3) {
    // 弱牌，看注或弃牌
    if (toCall === 0) {
      return { action: 'check', amount: 0, reasoning: '弱牌过牌' };
    } else if (toCall > playerChips * 0.3) {
      return { action: 'fold', amount: 0, reasoning: '弱牌，弃牌' };
    } else {
      return { action: 'call', amount: toCall, reasoning: '弱牌跟注' };
    }
  }
  
  // 中等强度
  if (handStrength < 0.6) {
    if (toCall === 0) {
      return { action: 'check', amount: 0, reasoning: '中等强度过牌' };
    } else if (toCall <= playerChips * 0.5) {
      return { action: 'call', amount: toCall, reasoning: '中等强度跟注' };
    } else {
      return { action: 'fold', amount: 0, reasoning: '中强牌但加注太高，弃牌' };
    }
  }
  
  // 强牌
  if (handStrength >= 0.6) {
    if (toCall === 0) {
      // 无人下注，可以加注
      const raiseAmount = Math.min(gameState.currentBet * 2 || 40, playerChips);
      return { action: 'raise', amount: raiseAmount, reasoning: '强牌加注' };
    } else if (toCall < playerChips * 0.7) {
      return { action: 'raise', amount: toCall + (playerChips * 0.3), reasoning: '强牌反加' };
    } else {
      return { action: 'all-in', amount: playerChips, reasoning: '强牌全下' };
    }
  }
  
  return { action: 'check', amount: 0, reasoning: '默认过牌' };
}

module.exports = {
  getRuleBasedDecision,
  evaluateHandStrength
};
