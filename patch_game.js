const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'public', 'game.js');
let s = fs.readFileSync(p, 'utf8');
// normalize to \n for matching
const origCRLF = /\r\n/.test(s);
if (origCRLF) s = s.replace(/\r\n/g, '\n');

// 1) animatePotChips: remove dealerBtn dependency
const old1 = `    var tableEl = document.querySelector('.poker-table');
    var dealerBtn = document.getElementById('dealerTipBtn');
    var potDisplay = document.querySelector('.pot-display');
    if (!tableEl || !dealerBtn) return;

    var tableRect = tableEl.getBoundingClientRect();
    var dRect = dealerBtn.getBoundingClientRect();
    var potRect = potDisplay ? potDisplay.getBoundingClientRect() : { top: tableRect.bottom, left: 0, right: 0 };

    var bandHeight = 120;
    var bandWidth = 200;
    var offsetY = 80;
    var bandTopAbs = dRect.bottom + offsetY;
    var bandBottomAbs = bandTopAbs + bandHeight;
    if (bandBottomAbs > potRect.top - 30) {
      bandBottomAbs = Math.max(bandTopAbs + 50, potRect.top - 30);
      bandTopAbs = bandBottomAbs - bandHeight;
    }
    var centerXAbs = (dRect.left + dRect.right) / 2;
    var leftAbs = centerXAbs - bandWidth / 2;
    var rightAbs = centerXAbs + bandWidth / 2;
    leftAbs = Math.max(tableRect.left, leftAbs);
    rightAbs = Math.min(tableRect.right, rightAbs);
    bandTopAbs = Math.max(tableRect.top, bandTopAbs);
    bandBottomAbs = Math.min(tableRect.bottom, bandBottomAbs);
    var inset = 12;
    var targetW = Math.max(20, (rightAbs - leftAbs) - inset * 2);
    var targetH = Math.max(20, (bandBottomAbs - bandTopAbs) - inset * 2);
    var targetLeft = leftAbs + inset;
    var targetTop = bandTopAbs + inset;`;

const new1 = `    var tableEl = document.querySelector('.poker-table');
    if (!tableEl) return;

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
    var targetW = Math.max(20, (rightAbs - leftAbs) - inset * 2);
    var targetH = Math.max(20, (bandBottomAbs - bandTopAbs) - inset * 2);
    var targetLeft = leftAbs + inset;
    var targetTop = bandTopAbs + inset;`;

if (s.indexOf(old1) !== -1) {
  s = s.replace(old1, new1);
  console.log('animatePotChips: OK');
} else {
  console.log('animatePotChips: block not found');
}

// 2) startActionTimer: show timer at end
const old2 = '  }, 20);\n}\n\nfunction stopActionTimer()';
const new2 = '  }, 20);\n\n  var timerEl = document.getElementById(\'actionTimer\');\n  if (timerEl) timerEl.classList.remove(\'hidden\');\n}\n\nfunction stopActionTimer()';
if (s.indexOf(old2) !== -1) {
  s = s.replace(old2, new2);
  console.log('startActionTimer: OK');
} else {
  console.log('startActionTimer: block not found');
}

if (origCRLF) s = s.replace(/\n/g, '\r\n');
fs.writeFileSync(p, s);
