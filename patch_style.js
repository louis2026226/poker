const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, 'public', 'style.css');
let s = fs.readFileSync(p, 'utf8');
const old = '.action-timer:not(.hidden) {\n  display: flex;\n}';
const newBlock = '.action-timer:not(.hidden) {\n  display: flex;\n  position: absolute;\n  z-index: 150;\n  pointer-events: none;\n  align-items: center;\n  justify-content: center;\n}';
if (s.indexOf(old) === -1) {
  const old2 = '.action-timer:not(.hidden) {\r\n  display: flex;\r\n}';
  if (s.indexOf(old2) !== -1) {
    s = s.replace(old2, newBlock.replace(/\n/g, '\r\n'));
    console.log('OK CRLF');
  } else {
    console.log('block not found');
    process.exit(1);
  }
} else {
  s = s.replace(old, newBlock);
  console.log('OK LF');
}
fs.writeFileSync(p, s);
