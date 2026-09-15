#!/usr/bin/env node
/* _mob.js — 移动端横向溢出精确检测（CDP mobile emulation 390x844）
 * 检查 #/ 、#/chapter/oop/oop-01、#/dashboard、#/practice 的 scrollWidth 与越界元素。
 */
'use strict';
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9971;
const BASE = 'http://127.0.0.1:8642';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'cslearn-mob-' + Date.now());
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
    const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) return { __exc: r.exceptionDetails.text }; return r.result ? r.result.value : undefined; };
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    const pages = [['#/', 'home'], ['#/chapter/oop/oop-01', 'chapter'], ['#/dashboard', 'dashboard'], ['#/practice', 'practice'], ['#/demos', 'demos']];
    for (const [hash, name] of pages) {
      await evl(`location.hash = '${hash}'`);
      await sleep(2200);
      const r = await evl(`(function(){
        var iw = window.innerWidth;
        var sw = document.documentElement.scrollWidth;
        var off = [].slice.call(document.querySelectorAll('body *')).filter(function(el){
          var b = el.getBoundingClientRect();
          return b.right > iw + 1 && b.width > 0;
        }).slice(0, 14).map(function(el){
          var b = el.getBoundingClientRect();
          return el.tagName.toLowerCase() + '.' + String(el.className||'').split(' ').slice(0,2).join('.') + ' right=' + Math.round(b.right) + ' w=' + Math.round(b.width);
        });
        return { innerW: iw, scrollW: sw, overflow: sw > iw + 1, offenders: off };
      })()`);
      console.log('=== ' + name + ' ===');
      console.log(JSON.stringify(r, null, 2));
    }
    try { ws.close(); } catch (e) {}
  } catch (e) {
    console.log('ERROR:', e.message);
  } finally {
    try { chrome.kill(); } catch (e) {}
    await sleep(300);
    try { require('fs').rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
})();
