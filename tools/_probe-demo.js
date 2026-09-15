#!/usr/bin/env node
/* _probe-demo.js — 对指定演示做 DOM 级诊断：按钮列表/禁用态/徽标/旁白 的前后变化 */
'use strict';
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9993;
const BASE = 'http://127.0.0.1:8642';
const IDS = ['sorting', 'graphtravel', 'pipeline'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'cslearn-pd-' + Date.now());
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
    await sleep(1500);

    for (const demoId of IDS) {
      console.log('\n########## ' + demoId + ' ##########');
      await evl(`location.hash = '#/demo/${demoId}'`);
      await sleep(2200);
      const dump = () => evl(`(function(){
        var bar=document.querySelector('.dk-bar')||document.body;
        var btns=[].slice.call(bar.querySelectorAll('button')).map(function(b){return (b.textContent.trim()||'[图标]')+(b.disabled?'(禁用)':'');});
        var chips=[].slice.call(bar.querySelectorAll('.chip,.dk-badge')).map(function(c){return c.textContent.trim();});
        var narr=document.querySelector('.dk-narr'); var expl=document.querySelector('.dk-explain');
        return { buttons:btns, chips:chips, narr:(narr?narr.textContent.trim():'').slice(0,120), explain:(expl?expl.textContent.trim():'').slice(0,140) };
      })()`);
      console.log('BEFORE:', JSON.stringify(await dump(), null, 2));
      const clicked = await evl(`(function(){
        var bar=document.querySelector('.dk-bar')||document.body;
        var b=[].slice.call(bar.querySelectorAll('button')).filter(function(x){return x.textContent.indexOf('下一步')>=0 && !x.disabled;})[0];
        if(!b) return 'no enabled next btn';
        b.click(); return 'clicked: '+b.textContent.trim();
      })()`);
      console.log('CLICK :', clicked);
      await sleep(600);
      console.log('AFTER :', JSON.stringify(await dump(), null, 2));
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
