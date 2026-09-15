#!/usr/bin/env node
/* _overflow.js — 多宽度横向溢出检查（1920 / 1440 / 414 / 375）
 * 对首页、关于页、研究所专栏、章节页、进度面板逐一检查 scrollWidth 与越界元素。
 */
'use strict';
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9991;
const BASE = 'http://127.0.0.1:8642';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'cslearn-ovf-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  let bad = 0;
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

    const widths = [1920, 1440, 414, 375];
    const pages = [['#/', 'home'], ['#/about', 'about'], ['#/institute', 'institute'], ['#/chapter/oop/oop-01', 'chapter'], ['#/dashboard', 'dashboard']];
    for (const w of widths) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 });
      for (const [hash, name] of pages) {
        await evl(`location.hash = '${hash}'`);
        await sleep(1600);
        const r = await evl(`(function(){
          var iw = window.innerWidth; var sw = document.documentElement.scrollWidth;
          var off = [].slice.call(document.querySelectorAll('body *')).filter(function(el){
            var b = el.getBoundingClientRect(); return b.right > iw + 1 && b.width > 0;
          }).slice(0, 5).map(function(el){ var b = el.getBoundingClientRect(); return el.tagName.toLowerCase() + '.' + String(el.className||'').split(' ').slice(0,2).join('.') + ' r=' + Math.round(b.right); });
          return { iw: iw, sw: sw, off: off };
        })()`);
        const overflow = r.sw > r.iw + 1;
        if (overflow || (r.off && r.off.length)) { bad++; console.log('OVERFLOW @' + w + ' ' + name + ' -> ' + JSON.stringify(r)); }
        else console.log('OK  @' + w + ' ' + name + ' (scrollW=' + r.sw + ')');
      }
    }
    try { ws.close(); } catch (e) {}
  } catch (e) {
    bad++; console.log('ERROR:', e.message);
  } finally {
    try { chrome.kill(); } catch (e) {}
    await sleep(300);
    try { require('fs').rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(bad ? ('存在 ' + bad + ' 处异常') : '全部宽度无横向溢出');
  process.exit(bad ? 1 : 0);
})();
