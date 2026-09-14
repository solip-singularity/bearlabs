'use strict';
/* _reshoot.js — 重拍指定页面截图（不含任何删除操作，直接覆盖写入） */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://127.0.0.1:8642';

const TARGETS = [
  ['dashboard', '#/dashboard', 'desktop', 1440, 900],
  ['dashboard', '#/dashboard', 'tablet', 834, 1112],
  ['dashboard', '#/dashboard', 'mobile', 390, 844],
  ['practice', '#/practice', 'desktop', 1440, 900],
  ['practice', '#/practice', 'tablet', 834, 1112],
  ['practice', '#/practice', 'mobile', 390, 844],
  ['chapter', '#/chapter/oop/oop-01', 'tablet', 834, 1112],
];

function launch(url, file, w, h, profile) {
  return new Promise((resolve) => {
    execFile(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--disable-breakpad', '--disable-extensions',
      '--user-data-dir=' + profile,
      '--force-device-scale-factor=1',
      '--virtual-time-budget=12000',
      '--window-size=' + w + ',' + h,
      '--screenshot=' + file,
      url,
    ], { timeout: 90000 }, () => resolve());
  });
}

function waitSize(file, ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function poll() {
      let s = 0;
      try { s = fs.statSync(file).size; } catch (e) { /* not yet */ }
      if (s > 2000) {
        // 稳定判定：两次间隔大小一致
        setTimeout(() => {
          let s2 = 0;
          try { s2 = fs.statSync(file).size; } catch (e) { /* ignore */ }
          if (s2 === s && s2 > 2000) return resolve(s2);
          poll();
        }, 600);
        return;
      }
      if (Date.now() - t0 > ms) return resolve(s);
      setTimeout(poll, 500);
    })();
  });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of TARGETS) {
    const name = t[0]; const hash = t[1]; const vp = t[2]; const w = t[3]; const h = t[4];
    const file = path.join(OUT, name + '-' + vp + '.png');
    const profile = 'C:\\Users\\Public\\cslearn-shots\\rr-' + name + '-' + vp;
    await launch(BASE + '/' + hash, file, w, h, profile);
    const size = await waitSize(file, 30000);
    console.log(name + ' @ ' + vp + ' => ' + size + ' bytes');
  }
  console.log('RESHOOT-DONE');
}

main();
