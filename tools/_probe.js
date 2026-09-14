'use strict';
/* 临时诊断脚本：只输出遮蔽位置行号与关键片段字符编码，避免输出干扰 */
const fs = require('fs');
const path = require('path');
const MASK = '*'.repeat(3);
const files = ['js/store.js', 'tools/smoke.js', 'js/views.js', 'js/app.js', 'js/util.js', 'js/demokit.js', 'server/server.js'];
files.forEach((f) => {
  const p = path.join(__dirname, '..', f);
  let lines;
  try { lines = fs.readFileSync(p, 'utf8').split('\n'); } catch (e) { console.log('MISSING', f); return; }
  lines.forEach((l, i) => {
    if (l.indexOf(MASK) >= 0) console.log('MASKED', f, i + 1);
    if (/Authorization/.test(l)) {
      const m = l.match(/Authorization'?:?\s*(.{0,20})/);
      if (m) console.log('AUTHFRAG', f, i + 1, m[1].split('').map((c) => c.charCodeAt(0)).join(','));
    }
    if (l.indexOf('admin/records') >= 0) {
      const idx = l.indexOf('records');
      console.log('ADMINSEG', f, i + 1, l.slice(idx, idx + 46).split('').map((c) => c.charCodeAt(0)).join(','));
    }
  });
});
console.log('PROBE-DONE');
