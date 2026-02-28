const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'public', 'game.js');
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = `    var dealerBtn = document.getElementById('dealerTipBtn');
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
`;

const newBlock = `    if (!tableEl) return;

    var tableRect = tableEl.getBoundingClientRect();
    var potDisplay = tableEl.querySelector('.pot-display');
    var bandHeight = 50;
    var bandWidth = 120;
    var bandTopAbs, leftAbs, rightAbs, bandBottomAbs;
    if (potDisplay) {
      var potRect = potDisplay.getBoundingClientRect();
      bandTopAbs = potRect.bottom + 10;
      bandBottomAbs = bandTopAbs + bandHeight;
      var centerX = (potRect.left + potRect.right) / 2;
      leftAbs = centerX - bandWidth / 2;
      rightAbs = centerX + bandWidth / 2;
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
    var w = Math.max(20, (rightAbs - leftAbs) - inset * 2);
    var h = Math.max(20, (bandBottomAbs - bandTopAbs) - inset * 2);
    var targetLeft = leftAbs + inset;
    var targetTop = bandTopAbs + inset;

    var selfPlayer = nextState.players.find(function(p) { return p.socketId === mySocketId; });
    var mySeatIndex = selfPlayer ? selfPlayer.seat : 0;
`;

if (s.indexOf(oldBlock) === -1) {
  console.log('oldBlock not found');
  process.exit(1);
}
s = s.replace(oldBlock, newBlock);
s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s);
console.log('animatePotChips: OK');
