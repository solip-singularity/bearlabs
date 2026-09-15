#!/usr/bin/env node
/* _mobshot.js — 用 CDP 移动仿真（390x844, dsf2, mobile:true）重拍手机版截图
 * 覆盖 docs/screenshots/<page>-mobile.png（home/chapter/dashboard/practice/demos/demo-sorting）
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9983;
const BASE = 'http://127.0.0.1:8642';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'cslearn-ms-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  try {
    let ok = false;
    for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ok = true; break; } } catch (e) {} await sleep(250); }
    if (!ok) throw new Error('CDP 未就绪');
    const tab = (await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/'), { method: 'PUT' })).json());
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    const send = (method, params) => new Promise((resolve, reject) => { const mid = ++id; pend.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : undefined; };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    const pages = [['#/', 'home'], ['#/chapter/oop/oop-01', 'chapter'], ['#/dashboard', 'dashboard'], ['#/practice', 'practice'], ['#/demos', 'demos'], ['#/demo/sorting', 'demo-sorting']];
    for (const [hash, name] of pages) {
      await evl(`location.hash = '${hash}'`);
      await sleep(2400);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(OUT, name + '-mobile.png');
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
      const size = fs.statSync(file).size;
      console.log('OK ' + name + '-mobile.png  ' + Math.round(size / 1024) + 'KB');
    }
    try { ws.close(); } catch (e) {}
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    try { chrome.kill(); } catch (e) {}
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
