/**
 * Poker AI 服务 - Coding Plan API 集成
 * 用于获取AI决策来辅助游戏
 */

const axios = require('axios');
const path = require('path');

// 加载环境变量
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.CODING_PLAN_API_KEY || '';
const API_URL = 'https://api.codingplan.com/v1/poker/decision';

// API超时时间（毫秒）
const API_TIMEOUT = 5000;

/**
 * 将扑克牌转换为API需要的格式
 * @param {Array} cards - 扑克牌数组 [{suit: '♠', rank: 'A'}]
 * @returns {Array} - 转换后的数组 ['As']
 */
function formatCards(cards) {
  if (!cards || !Array.isArray(cards)) return [];
  
  const suitMap = {
    '♠': 's',  // spades
    '♥': 'h',  // hearts
    '♦': 'd',  // diamonds
    '♣': 'c'   // clubs
  };
  
  return cards.map(card => {
    const suit = suitMap[card.suit] || card.suit;
    return card.rank + suit;
  });
}

/**
 * 获取AI决策
 * @param {Object} gameState - 游戏状态
 * @param {string} playerId - 玩家ID
 * @returns {Promise<Object>} - AI决策结果
 */
async function getAIDecision(gameState, playerId) {
  if (!API_KEY) {
    return getDefaultDecision(gameState);
  }
  try {
    // 构建请求数据
    const requestData = {
      player_id: playerId,
      pot: gameState.pot || 0,
      current_bet: gameState.currentBet || 0,
      community_cards: formatCards(gameState.communityCards || []),
      player_chips: gameState.playerChips || 1000,
      position: gameState.playerPosition || 0,
      game_phase: gameState.gameState || 'preflop'
    };
    
    // 发送请求到Coding Plan API
    const response = await axios.post(API_URL, requestData, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: API_TIMEOUT
    });
    
    if (response.data && response.data.decision) {
      return {
        success: true,
        action: response.data.decision.action || 'check',
        amount: response.data.decision.amount || 0,
        confidence: response.data.decision.confidence || 0.5,
        reasoning: response.data.decision.reasoning || ''
      };
    }
    
    // 如果返回格式不符合预期，使用默认决策
    return getDefaultDecision(gameState);
    
  } catch (error) {
    console.error('AI决策获取失败:', error.message);
    // API失败时返回默认决策
    return getDefaultDecision(gameState);
  }
}

/**
 * 获取默认决策（当API不可用时）
 * @param {Object} gameState - 游戏状态
 * @returns {Object} - 默认决策
 */
function getDefaultDecision(gameState) {
  const communityCards = gameState.communityCards || [];
  const hasCommunityCards = communityCards.length > 0;
  
  // 简单策略：没有公共牌时保守，有牌时根据情况加注
  if (!hasCommunityCards) {
    return {
      success: true,
      action: 'call',
      amount: 0,
      confidence: 0.3,
      reasoning: '默认策略：preflop阶段跟注'
    };
  } else if (communityCards.length >= 3) {
    // 有公共牌时可以考虑加注
    return {
      success: true,
      action: 'check',
      amount: 0,
      confidence: 0.4,
      reasoning: '默认策略：过牌观察'
    };
  }
  
  return {
    success: true,
    action: 'check',
    amount: 0,
    confidence: 0.3,
    reasoning: '默认策略：过牌'
  };
}

/**
 * 评估当前手牌强度
 * @param {Array} holeCards - 玩家手牌
 * @param {Array} communityCards - 公共牌
 * @returns {number} - 手牌强度 (0-1)
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
  getAIDecision,
  getRuleBasedDecision,
  evaluateHandStrength,
  formatCards
};
