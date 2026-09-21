#!/usr/bin/env node
/* _v12shot.js — v1.2 新内容截图：课程列表 / 两门新课 / 新章节（桌面 + 移动仿真）。 */
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
].find(p => { try { return require('fs').existsSync(p); } catch (e) { return false; } });
if (!CHROME) throw new Error('未找到 Chrome 或 Edge：请调整 tools/_v12shot.js 候选列表');
const PORT = 9253;
const BASE = 'http://127.0.0.1:8642';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots', 'v12');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = path.join(os.tmpdir(), 'cslearn-v12-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  try {
    let ok = false;
    for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ok = true; break; } } catch (e) {} await sleep(250); }
    if (!ok) throw new Error('CDP 未就绪');
    const tab = (await (await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/courses'), { method: 'PUT' })).json());
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = new Map();
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    const send = (method, params) => new Promise((resolve, reject) => { const mid = ++id; pend.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params: params || {} })); });
    const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result ? r.result.value : undefined; };
    await send('Runtime.enable');
    await send('Page.enable');

    const shots = [
      ['courses-list-desktop.png', 1440, 900, false, 1, '#/courses'],
      ['aimath-course-desktop.png', 1440, 900, false, 1, '#/course/aimath'],
      ['interview-course-desktop.png', 1440, 900, false, 1, '#/course/interview'],
      ['aimath-04-chapter-desktop.png', 1440, 900, false, 1, '#/chapter/aimath/aimath-04'],
      ['interview-04-chapter-desktop.png', 1440, 900, false, 1, '#/chapter/interview/interview-04'],
      ['interview-course-mobile.png', 390, 844, true, 2, '#/course/interview'],
    ];
    for (const [name, w, h, mobile, dsf, hash] of shots) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: mobile });
      await evl(`location.hash = '${hash}'`);
      await sleep(2600);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, name), Buffer.from(shot.data, 'base64'));
      console.log('saved:', name, Math.round(fs.statSync(path.join(OUT, name)).size / 1024) + 'KB');
    }
    try { ws.close(); } catch (e) {}
  } catch (e) {
    console.log('ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    try { chrome.kill(); } catch (e) {}
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
