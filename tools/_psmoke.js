#!/usr/bin/env node
/* ============================================================================
 * _psmoke.js — 「必刷题」板块 CDP 交互冒烟（开发自检用）
 * 用法：先启动服务（node server/server.js），再运行 node tools/_psmoke.js
 * 环境变量：PSMOKE_BASE（默认 http://127.0.0.1:8642）
 * 覆盖：入口渲染 / 筛选 / 答题判分 / 双版本解析切换 / 收藏与本地存储 /
 *       刷新持久化 / 错题本 / 收藏夹 / 统计页 / 随机一题 / 顺序题组 / 移动端 390 宽
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (!CHROME) throw new Error('未找到 Chrome 或 Edge');
const PORT = 9400 + Math.floor(Math.random() * 60);
const BASE = process.env.PSMOKE_BASE || 'http://127.0.0.1:8642';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function main() {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); };
  const profile = path.join(os.tmpdir(), 'pb-smoke-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
  let ws = null; let id = 0; const pending = new Map(); const jsErrors = [];
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) { ready = true; break; } } catch (e) { /* wait */ }
      await sleep(250);
    }
    if (!ready) throw new Error('Chrome CDP 未就绪');
    const tabRes = await fetch('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(BASE + '/#/problems'), { method: 'PUT' });
    const tab = await tabRes.json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = (ev) => {
      let m = null; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
      if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; jsErrors.push((d.text || 'exception') + ' @ ' + (d.url || '')); }
      if (m.method === 'Log.entryAdded' && m.params.entry && m.params.entry.level === 'error') jsErrors.push(m.params.entry.text);
    };
    const send = (method, params) => new Promise((resolve, reject) => {
      const mid = ++id; pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params: params || {} }));
    });
    const evl = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) return undefined;
      return r.result ? r.result.value : undefined;
    };
    const waitFor = async (expr, timeoutMs, label) => {
      const t0 = Date.now();
      while (Date.now() - t0 < timeoutMs) {
        try { const v = await evl(expr); if (v) return v; } catch (e) { /* retry */ }
        await sleep(300);
      }
      throw new Error('等待超时：' + (label || expr));
    };
    const goto = async (hash) => { await evl('location.hash = ' + JSON.stringify(hash)); await sleep(500); };

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    /* 1. 板块入口渲染 */
    await waitFor("document.querySelectorAll('.pb-row').length >= 8", 15000, '题库列表');
    const hubInfo = await evl("(function(){ return { rows: document.querySelectorAll('.pb-row').length, tabs: document.querySelectorAll('.pb-tabs a').length, count: (document.querySelector('.pb-count')||{}).textContent || '', metrics: (document.querySelector('.pb-metrics')||{}).textContent || '' }; })()");
    check('板块入口渲染：列表行、页签、计数与指标条', !!(hubInfo && hubInfo.rows >= 8 && hubInfo.tabs === 4 && /共 \d+ 题/.test(hubInfo.count) && hubInfo.metrics.indexOf('总题数') >= 0), JSON.stringify(hubInfo));

    /* 2. 科目筛选联动 */
    await evl("(function(){ var s=document.querySelector('.pb-f-subject'); s.value='ds'; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()");
    await sleep(450);
    const c1 = await evl("document.querySelector('.pb-count').textContent");
    check('科目筛选生效（数据结构）', /共 \d+ 题/.test(c1), c1);

    /* 3. 打开首题并答错（选 A） */
    await evl("document.querySelector('.pb-row').click();");
    await waitFor("document.querySelector('.pb-quiz') && document.querySelectorAll('.pb-opt').length >= 3", 15000, '单题渲染');
    const qInfo = await evl("(function(){ var s=document.querySelector('.pb-stem'); return { stemLen: s? s.textContent.length:0, opts: document.querySelectorAll('.pb-opt').length }; })()");
    check('单题渲染：题干与选项', !!(qInfo && qInfo.stemLen > 10 && qInfo.opts >= 4), JSON.stringify(qInfo));
    await evl("document.querySelectorAll('.pb-opt')[0].click(); document.querySelector('.pb-submit').click();");
    await waitFor("document.querySelector('.pb-verdict')", 8000, '判分结果');
    const vInfo = await evl("(function(){ var v=document.querySelector('.pb-verdict'); var e=document.querySelector('.pb-exp-body'); return { verdict: v? v.textContent : '' , expLen: e? e.textContent.length : 0 }; })()");
    check('提交后即时判分并展开解析', !!(vInfo && /回答错误|回答正确/.test(vInfo.verdict) && vInfo.expLen > 60), JSON.stringify({ verdict: vInfo && vInfo.verdict ? vInfo.verdict.slice(0, 42) : '', expLen: vInfo && vInfo.expLen }));

    /* 4. 双版本解析切换 */
    const toggleInfo = await evl("(function(){ var btns=document.querySelectorAll('.pb-exp-toggle button'); if(btns.length<2) return {err:'no toggle'}; var before=document.querySelector('.pb-exp-body').textContent; btns[1].click(); var kid=document.querySelector('.pb-exp-body'); return { kidClass: kid.className.indexOf('kid')>=0, changed: kid.textContent !== before, kidLen: kid.textContent.length }; })()");
    check('解析双版本切换（专业版↔宝宝巴士版）', !!(toggleInfo && !toggleInfo.err && toggleInfo.kidClass && toggleInfo.changed && toggleInfo.kidLen > 40), JSON.stringify(toggleInfo));
    await evl("document.querySelectorAll('.pb-exp-toggle button')[0].click();");

    /* 5. 收藏 + 本地存储写入 */
    await evl("document.querySelector('.pb-fav').click();");
    await sleep(350);
    const storeInfo = await evl("(function(){ try { var s=JSON.parse(localStorage.getItem('cslearn.problems.v1')); var ids=Object.keys(s.attempts||{}); var a=s.attempts[ids[0]]; return { n: ids.length, last: a && a.last, fav: (s.fav||[]).length, firstId: ids[0] }; } catch(e){ return {err:String(e)}; } })()");
    check('记录写入 localStorage（答错 + 收藏）', !!(storeInfo && !storeInfo.err && storeInfo.n >= 1 && storeInfo.last === 'no' && storeInfo.fav >= 1), JSON.stringify(storeInfo));

    /* 6. 刷新持久化 */
    await evl('location.reload()');
    await sleep(2500);
    await waitFor("document.querySelector('.pb-quiz')", 15000, '刷新后单题');
    const persistInfo = await evl("(function(){ var chips=[].slice.call(document.querySelectorAll('.pb-qmeta .chip')).map(function(c){return c.textContent;}).join('|'); return { chips: chips, hasPast: chips.indexOf('上次') >= 0 }; })()");
    check('刷新后记录仍在（题卡显示上次结果）', !!(persistInfo && persistInfo.hasPast), JSON.stringify(persistInfo));

    /* 7. 错题本 / 收藏夹 / 统计页 */
    await goto('#/problems/wrong');
    await waitFor("document.querySelector('.pb-list')", 12000, '错题本');
    const wrongInfo = await evl("(function(){ return { rows: document.querySelectorAll('.pb-row').length, hasId: !!document.querySelector('.pb-row[href*=\"pb-ds-001\"]') }; })()");
    check('错题本包含刚答错的题', !!(wrongInfo && wrongInfo.rows >= 1 && wrongInfo.hasId), JSON.stringify(wrongInfo));
    await goto('#/problems/fav');
    await sleep(650);
    const favRows = await evl("document.querySelectorAll('.pb-row').length");
    check('收藏列表包含已收藏题', favRows >= 1, 'rows=' + favRows);
    await goto('#/problems/stats');
    await waitFor("document.querySelector('.pb-statgrid')", 12000, '统计页');
    const statInfo = await evl("(function(){ var nums=[].slice.call(document.querySelectorAll('.pb-statgrid .st-num')).map(function(x){return x.textContent;}); return { numCount: nums.length, subrows: document.querySelectorAll('.pb-subrow').length }; })()");
    check('统计页指标与科目条', !!(statInfo && statInfo.numCount === 6 && statInfo.subrows >= 1), JSON.stringify(statInfo));

    /* 8. 「未做」筛选 + 随机一题 */
    await goto('#/problems');
    await sleep(650);
    await evl("(function(){ var btns=document.querySelectorAll('.pb-status-seg button'); btns[1].click(); return true; })()");
    await sleep(450);
    const newCount = await evl("document.querySelector('.pb-count').textContent");
    check('「未做」筛选生效', /共 \d+ 题/.test(newCount) && !/共 8 题/.test(newCount), newCount);
    await evl("document.querySelector('.pb-random').click();");
    await sleep(900);
    const randInfo = await evl("(function(){ return { hash: location.hash, quiz: !!document.querySelector('.pb-quiz') }; })()");
    check('随机一题进入单题页', !!(randInfo && /#\/problems\/q\/pb-/.test(randInfo.hash) && randInfo.quiz), JSON.stringify(randInfo));

    /* 9. 顺序刷题组（进度 + 下一题） */
    await goto('#/problems');
    await sleep(650);
    await evl("document.querySelector('.pb-start').click();");
    await sleep(900);
    const deck1 = await evl("(function(){ return { hash: location.hash, pos: (document.querySelector('.pb-pos')||{}).textContent || '', quiz: !!document.querySelector('.pb-quiz') }; })()");
    await evl("(function(){ var o=document.querySelectorAll('.pb-opt'); if(o.length){o[0].click();} var s=document.querySelector('.pb-submit'); if(s){s.click();} return true; })()");
    await sleep(450);
    await evl("(function(){ var n=[].slice.call(document.querySelectorAll('.pb-actions button')).find(function(b){return b.textContent.indexOf('下一题')>=0;}); if(n){n.click();} return true; })()");
    await sleep(900);
    const deck2 = await evl("(function(){ return { pos: (document.querySelector('.pb-pos')||{}).textContent || '', quiz: !!document.querySelector('.pb-quiz') }; })()");
    check('顺序刷题：题组进度与下一题导航', !!(deck1 && deck1.hash === '#/problems/do' && /第 \d+ \/ \d+ 题/.test(deck1.pos) && deck1.quiz && deck2 && deck2.quiz && deck2.pos !== deck1.pos), JSON.stringify({ deck1, deck2 }));

    /* 10. 移动端 390 宽 */
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await goto('#/problems/q/pb-ds-002');
    await waitFor("document.querySelector('.pb-quiz')", 12000, '移动端单题');
    const mob = await evl("(function(){ var d=document.documentElement; var q=document.querySelector('.pb-quiz'); return { sw: d.scrollWidth, cw: d.clientWidth, qr: q ? Math.round(q.getBoundingClientRect().right) : -1, opts: document.querySelectorAll('.pb-opt').length }; })()");
    check('移动端 390 宽：阅读区不溢出、选项可点', !!(mob && mob.sw <= mob.cw + 1 && mob.qr <= 391 && mob.opts >= 2), JSON.stringify(mob));
    const mobKid = await evl("(function(){ var o=document.querySelectorAll('.pb-opt'); o[0].click(); var s=document.querySelector('.pb-submit'); s.click(); var btns=document.querySelectorAll('.pb-exp-toggle button'); if(btns.length<2) return {err:'no toggle'}; btns[1].click(); return { kid: document.querySelector('.pb-exp-body').className.indexOf('kid') >= 0 }; })()");
    check('移动端宝宝巴士版切换可用', !!(mobKid && !mobKid.err && mobKid.kid), JSON.stringify(mobKid));

    /* 10b. 三字母科目标签（net/algo/brain）显示完整 */
    await goto('#/problems/q/pb-net-002');
    await waitFor("document.querySelector('.pb-quiz')", 12000, 'net 单题');
    const netChip = await evl("(function(){ return [].slice.call(document.querySelectorAll('.pb-qmeta .chip')).map(function(c){return c.textContent;}).join('|'); })()");
    check('三字母科目标签完整（计算机网络）', /计算机网络/.test(netChip), netChip);

    /* 11. JS 异常 */
    const crit = jsErrors.filter((e) => !/favicon|net::ERR|404/i.test(e));
    check('无 JavaScript 异常', crit.length === 0, crit.slice(0, 5).join(' | '));

  } catch (e) {
    check('测试执行', false, String(e && e.message || e));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* noop */ }
    try { chrome.kill(); } catch (e) { /* noop */ }
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }
  console.log('====== 必刷题 冒烟（CDP） ======');
  results.forEach((r) => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '  —— ' + r.detail)));
  console.log('===============================');
  const pass = results.filter((r) => r.ok).length;
  console.log('通过 ' + pass + ' / 失败 ' + (results.length - pass));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})();
