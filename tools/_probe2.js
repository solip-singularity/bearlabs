#!/usr/bin/env node
/* _probe2.js — 章节页渲染诊断（CDP，捕获 chapterView 直接调用的异常） */
'use strict';
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9941;
const BASE = 'http://127.0.0.1:8642';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const profile = path.join(os.tmpdir(), 'cslearn-probe-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ready = true; break; } } catch (e) { /* wait */ }
      await sleep(250);
    }
    if (!ready) throw new Error('Chrome CDP 未就绪');

    const tabRes = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/'), { method: 'PUT' });
    const tab = await tabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pending = new Map();
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

    // 首页加载完成后，直接调用 chapterView
    await sleep(2500);
    const r1 = await evl(`(async function(){
      try {
        var v = await Views.chapterView({ courseId: 'oop', chapterId: 'oop-01' });
        return { ok: true, title: v.title, children: v.el.children.length };
      } catch (e) { return { ok: false, error: String((e && e.stack) || e) }; }
    })()`);
    console.log('direct chapterView:', JSON.stringify(r1, null, 2));

    const r2 = await evl(`(async function(){
      try {
        var c = await Views.Data.course('oop');
        return { ok: true, units: (c.units||[]).length };
      } catch (e) { return { ok: false, error: String((e && e.stack) || e) }; }
    })()`);
    console.log('Data.course:', JSON.stringify(r2, null, 2));

    const r3 = await evl(`(async function(){
      try {
        var ch = await Views.Data.chapter('oop', 'oop-01');
        return { ok: true, id: ch.id, ex: (ch.exercises||[]).length };
      } catch (e) { return { ok: false, error: String((e && e.stack) || e) }; }
    })()`);
    console.log('Data.chapter:', JSON.stringify(r3, null, 2));

    // 再走一次哈希导航，看最终 DOM
    await evl(`location.hash = '#/chapter/oop/oop-01'`);
    await sleep(4000);
    const r4 = await evl(`({ h1: (document.querySelector('.chapter-main h1')||{}).textContent || null,
      viewCh: !!document.querySelector('.view-chapter'),
      appFirst: (document.querySelector('#app') ? document.querySelector('#app').textContent.slice(0,160) : null) })`);
    console.log('after hash nav:', JSON.stringify(r4, null, 2));

    try { ws.close(); } catch (e) { /* noop */ }
  } catch (e) {
    console.log('PROBE ERROR:', e.message);
  } finally {
    try { chrome.kill(); } catch (e) { /* noop */ }
    await sleep(300);
    try { require('fs').rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }
}
main();
