#!/usr/bin/env node
/* ============================================================================
 * screenshots.js — 多端截图工具（Chrome / Edge headless，零依赖）
 * 用法：node tools/screenshots.js [baseUrl]
 * 前置：本地服务已启动（默认 http://127.0.0.1:8642）
 * 产出：docs/screenshots/<page>-<viewport>.png
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const BASE = process.argv[2] || 'http://127.0.0.1:8642';

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
function findBrowser() {
  for (const c of CANDIDATES) { if (fs.existsSync(c)) return c; }
  throw new Error('未找到 Chrome 或 Edge，可手动装一个或调整路径');
}

const PAGES = [
  ['home', '#/'],
  ['courses', '#/courses'],
  ['chapter', '#/chapter/oop/oop-01'],
  ['demo-sorting', '#/demo/sorting'],
  ['practice', '#/practice'],
  ['dashboard', '#/dashboard'],
];
const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['tablet', 834, 1112],
  ['mobile', 390, 844],
];

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = findBrowser();
  console.log('使用浏览器: ' + browser);
  console.log('基地址: ' + BASE);
  const list = [];
  for (const [page, hash] of PAGES) {
    for (const [vp, w, h] of VIEWPORTS) {
      const file = path.join(OUT, page + '-' + vp + '.png');
      const url = BASE + '/' + hash;
      try {
        execFileSync(browser, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
          '--no-default-browser-check', '--disable-extensions',
          '--force-device-scale-factor=1',
          '--virtual-time-budget=12000',
          '--window-size=' + w + ',' + h,
          '--screenshot=' + file,
          url,
        ], { timeout: 90000, stdio: 'ignore' });
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        console.log('OK   ' + page + ' @ ' + vp + ' -> ' + path.relative(ROOT, file) + ' (' + Math.round(size / 1024) + 'KB)');
        list.push({ page, vp, file, size });
      } catch (e) {
        console.log('FAIL ' + page + ' @ ' + vp + ' —— ' + e.message);
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ base: BASE, at: Date.now(), list }, null, 2));
  console.log('完成。输出目录: ' + path.relative(ROOT, OUT));
}

main();
