#!/usr/bin/env node
/* screenshots.js — 多端实测截图（desktop 1440x900 / tablet 834x1112 / mobile 390x844）
 * 用法：node tools/screenshots.js [baseUrl]
 * 输出：docs/screenshots/<page>-<viewport>.png + index.json
 * 加固：每次调用独立 user-data-dir；产出 <2KB 自动重试一次；调用间隔 400ms。
 */
'use strict';
const fs = require('fs');
const os = require('os');
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

function syncSleep(ms) { const a = new Int32Array(new SharedArrayBuffer(4)); Atomics.wait(a, 0, 0, ms); }

function attemptShoot(browser, url, file, w, h) {
  const profile = path.join(os.tmpdir(), 'cslearn-shot-' + Date.now() + '-' + Math.floor(Math.random() * 1e5));
  try {
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--no-default-browser-check', '--disable-extensions',
      '--user-data-dir=' + profile,
      '--force-device-scale-factor=1',
      '--virtual-time-budget=15000',
      '--window-size=' + w + ',' + h,
      '--screenshot=' + file,
      url,
    ], { timeout: 90000, stdio: 'ignore' });
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

function shoot(browser, url, file, w, h) {
  let size = 0;
  try { size = attemptShoot(browser, url, file, w, h); } catch (e) { size = -1; }
  if (size < 2048) {
    try { fs.rmSync(file, { force: true }); } catch (e) { /* noop */ }
    syncSleep(600);
    try { size = attemptShoot(browser, url, file, w, h); } catch (e) { size = -1; }
  }
  return size;
}

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
      const size = shoot(browser, url, file, w, h);
      const status = size >= 2048 ? 'OK  ' : 'WARN';
      console.log(status + ' ' + page + ' @ ' + vp + ' -> ' + path.relative(ROOT, file) + ' (' + Math.round(size / 1024) + 'KB)');
      list.push({ page, vp, file: path.relative(ROOT, file), size });
      syncSleep(400);
    }
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ base: BASE, at: Date.now(), list }, null, 2));
  const warn = list.filter((x) => x.size < 2048).length;
  console.log('完成。共 ' + list.length + ' 张，异常 ' + warn + ' 张。输出目录: ' + path.relative(ROOT, OUT));
  process.exit(warn ? 1 : 0);
}

main();
