#!/usr/bin/env node
/* demos-check.js — 交互演示全量走查（CDP，逐个验证加载/单步/旁白/重置）
 * 用法：node tools/demos-check.js [baseUrl]
 * 前置：本地服务已启动；对每个 manifest 中的演示：
 *   已落盘 -> 打开 #/demo/<id>，验证 .dk-shell 渲染、点击「下一步」后旁白更新、点击「重置」按钮可用；
 *   未落盘 -> 标记 MISSING（不计失败，交付前应清零）。
 * 产出：docs/demos-check.json
 */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9951 + Math.floor(Math.random() * 20);
const BASE = process.argv[2] || 'http://127.0.0.1:8642';
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'demos-check.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'demos', 'manifest.json'), 'utf8'));
  const results = [];

  const profile = path.join(os.tmpdir(), 'cslearn-dc-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null; let id = 0; const pending = new Map();
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ready = true; break; } } catch (e) { /* wait */ }
      await sleep(250);
    }
    if (!ready) throw new Error('Chrome CDP 未就绪');
    const tabRes = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/'), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    };
    const send = (method, params) => new Promise((resolve, reject) => {
      const mid = ++id; pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    const evl = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return { __exc: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text };
      return r.result ? r.result.value : undefined;
    };
    await send('Runtime.enable');
    await sleep(1500);

    for (const d of manifest.demos) {
      const jsFile = path.join(ROOT, 'js', 'demos', d.id + '.js');
      const metaFile = path.join(ROOT, 'content', 'demos', d.id + '.json');
      if (!fs.existsSync(jsFile)) { results.push({ id: d.id, status: 'MISSING', detail: 'js 未落盘' }); continue; }
      if (!fs.existsSync(metaFile)) { results.push({ id: d.id, status: 'NO-META', detail: 'meta 缺失' }); }
      const r = await evl(`(async function(){
        try {
          location.hash = '#/demo/${d.id}';
          await new Promise(function(res){setTimeout(res,1500);});
          var shell=document.querySelector('.dk-shell');
          if(!shell) return {ok:false, detail:'no .dk-shell'};
          var bar=document.querySelector('.dk-bar');
          function snap(){ var cs=[].slice.call(bar.querySelectorAll('.chip,.dk-badge')).map(function(c){return c.textContent.trim();}).join('|'); var n=document.querySelector('.dk-narr'); return cs+'::'+(n?n.textContent.trim():''); }
          var btns=[].slice.call(bar.querySelectorAll('button'));
          var nextBtn=btns.filter(function(b){return b.textContent.indexOf('下一步')>=0;})[0];
          var resetBtn=btns.filter(function(b){return b.textContent.indexOf('重置')>=0;})[0];
          if(!nextBtn || !resetBtn) return {ok:false, detail:'no next/reset btn'};
          resetBtn.click();
          await new Promise(function(res){setTimeout(res,450);});
          var s0=snap();
          nextBtn.click();
          await new Promise(function(res){setTimeout(res,650);});
          var s1=snap();
          resetBtn.click();
          await new Promise(function(res){setTimeout(res,350);});
          var s2=snap();
          return {ok: s1!==s0 && s2===s0, s0:s0.slice(0,60), s1:s1.slice(0,60),
                  hasRange:!!bar.querySelector("input[type='range']"), hasSelect:!!bar.querySelector('select')};
        } catch(e){ return {ok:false, detail:String(e&&e.message||e)}; }
      })()`);
      results.push({ id: d.id, status: r && r.ok ? 'PASS' : 'FAIL', detail: JSON.stringify(r).slice(0, 220) });
    }
    try { ws.close(); } catch (e) { /* noop */ }
  } catch (e) {
    results.push({ id: '*', status: 'ERROR', detail: String(e && e.message || e) });
  } finally {
    try { chrome.kill(); } catch (e) { /* noop */ }
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }

  console.log('====== 演示走查 ======');
  results.forEach((r) => console.log((r.status === 'PASS' ? 'PASS  ' : r.status + '  ') + r.id + (r.status === 'PASS' ? '' : '  ' + r.detail)));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR' || r.status === 'NO-META').length;
  const missing = results.filter((r) => r.status === 'MISSING').length;
  console.log('通过 ' + pass + ' / 失败 ' + fail + ' / 未落盘 ' + missing);
  fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), base: BASE, results }, null, 2));
  process.exit(fail ? 1 : 0);
}
main();
