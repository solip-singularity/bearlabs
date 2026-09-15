#!/usr/bin/env node
/* _footcheck.js — 页脚专项检查：图标加载、链接与「滚动到底部」截图取证 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9985;
const BASE = 'http://127.0.0.1:8642';
const OUT = path.resolve(__dirname, '..', 'docs', 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'cslearn-foot-' + Date.now());
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
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await evl(`location.hash = '#/institute'`);
    await sleep(2200);
    const r1 = await evl(`(function(){
      var imgs = [].slice.call(document.querySelectorAll('.sitefoot img'));
      var links = [].slice.call(document.querySelectorAll('.sitefoot a'));
      return {
        iconCount: imgs.length,
        icons: imgs.map(function(i){ return { src: i.getAttribute('src'), loaded: i.naturalWidth > 0, w: i.naturalWidth }; }),
        linkCount: links.length,
        hasInstitute: links.some(function(a){ return (a.getAttribute('href')||'').indexOf('#/institute')>=0; }),
        hasAbout: links.some(function(a){ return (a.getAttribute('href')||'').indexOf('#/about')>=0; }),
        hasOfficial: links.some(function(a){ return (a.getAttribute('href')||'').indexOf('caa-ins.org')>=0 && a.getAttribute('target')==='_blank'; })
      };
    })()`);
    console.log('footer check:', JSON.stringify(r1, null, 2));

    await evl(`window.scrollTo(0, document.body.scrollHeight)`);
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, 'institute-footer-desktop.png'), Buffer.from(shot.data, 'base64'));
    console.log('saved: docs/screenshots/institute-footer-desktop.png');

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
