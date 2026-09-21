#!/usr/bin/env node
/* ============================================================================
 * _pshot.js — 「必刷题」板块截图（桌面 + 移动仿真）
 * 用法：先启动服务（node server/server.js），再运行 node tools/_pshot.js
 * 产出：docs/screenshots/problems/*.png
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME) throw new Error('未找到 Chrome 或 Edge');
const PORT = 9256;
const BASE = process.env.PSHOT_BASE || 'http://127.0.0.1:8642';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', 'problems');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(os.tmpdir(), 'pb-shot-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  try {
    let ok = false;
    for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ok = true; break; } } catch (e) { /* wait */ } await sleep(250); }
    if (!ok) throw new Error('CDP 未就绪');
    const tab = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/problems'), { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    const send = (method, params) => new Promise((resolve, reject) => { const mid = ++id; pend.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : undefined; };
    const wait = async (expr, timeoutMs) => { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { try { const v = await evl(expr); if (v) return v; } catch (e) { /* retry */ } await sleep(300); } throw new Error('wait timeout: ' + expr); };
    const shoot = async (name) => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(OUT, name);
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('saved:', name, Math.round(fs.statSync(f).size / 1024) + 'KB');
    };
    await send('Runtime.enable');
    await send('Page.enable');

    /* 1. 桌面 · 题库主页 */
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await evl("location.hash = '#/problems'");
    await wait("document.querySelectorAll('.pb-row').length >= 5", 15000);
    await sleep(700);
    await shoot('problems-hub-desktop.png');

    /* 2. 桌面 · 单题（答错 + 专业版解析） */
    await evl("document.querySelector('.pb-row').click();");
    await wait("document.querySelector('.pb-quiz') && document.querySelectorAll('.pb-opt').length >= 3", 15000);
    await evl("(function(){ document.querySelectorAll('.pb-opt')[0].click(); document.querySelector('.pb-submit').click(); return true; })()");
    await wait("document.querySelector('.pb-verdict')", 8000);
    await sleep(400);
    await evl("(function(){ var v=document.querySelector('.pb-verdict'); v.scrollIntoView({block:'start'}); return true; })()");
    await sleep(600);
    await shoot('problems-quiz-desktop.png');

    /* 3. 桌面 · 宝宝巴士版解析 */
    await evl("(function(){ document.querySelectorAll('.pb-exp-toggle button')[1].click(); return true; })()");
    await sleep(500);
    await shoot('problems-quiz-kid-desktop.png');

    /* 4. 桌面 · 统计页 */
    await evl("location.hash = '#/problems/stats'");
    await wait("document.querySelector('.pb-statgrid')", 12000);
    await sleep(700);
    await shoot('problems-stats-desktop.png');

    /* 5. 桌面 · 错题本 */
    await evl("location.hash = '#/problems/wrong'");
    await sleep(900);
    await shoot('problems-wrong-desktop.png');

    /* 6. 移动端 · 题库主页 */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await evl("location.hash = '#/problems'");
    await sleep(1200);
    await shoot('problems-hub-mobile.png');

    /* 7. 移动端 · 单题（宝宝巴士版解析） */
    await evl("document.querySelector('.pb-row').click();");
    await wait("document.querySelector('.pb-quiz') && document.querySelectorAll('.pb-opt').length >= 2", 15000);
    await evl("(function(){ document.querySelectorAll('.pb-opt')[0].click(); var s=document.querySelector('.pb-submit'); if(s) s.click(); return true; })()");
    await sleep(500);
    await evl("(function(){ var t=document.querySelectorAll('.pb-exp-toggle button'); if(t.length>1) t[1].click(); var v=document.querySelector('.pb-verdict'); if(v) v.scrollIntoView({block:'start'}); return true; })()");
    await sleep(700);
    await shoot('problems-quiz-mobile.png');

    try { ws.close(); } catch (e) { /* noop */ }
  } catch (e) {
    console.log('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    try { chrome.kill(); } catch (e) { /* noop */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }
})();
