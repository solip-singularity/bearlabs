#!/usr/bin/env node
/* ============================================================================
 * e2e.js — 端到端交互测试（无第三方依赖，Chrome DevTools Protocol）
 * 覆盖：章节渲染 / 双讲解切换 / 习题提交与判分 / 进度与错题记录 /
 *       刷新后数据不丢 / 演示动画单步与重置 / 练习中心 / 进度面板 / 搜索
 * 用法：先启动服务（node server/server.js），再运行 node tools/e2e.js
 * 产出：docs/e2e-report.json （各步骤结果与证据）
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333 + Math.floor(Math.random() * 30);
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8642';
const OUT = path.resolve(__dirname, '..', 'docs', 'e2e-report.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail: detail == null ? '' : String(detail) }); };

  const profile = path.join(os.tmpdir(), 'cslearn-e2e-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--remote-debugging-port=' + PORT, 'about:blank',
  ], { stdio: 'ignore' });

  let ws = null; let id = 0; const pending = new Map(); const jsErrors = [];
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
    const goto = async (hash) => { await evl('location.hash = ' + JSON.stringify(hash)); await sleep(400); };

    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');

    /* ── 1. 首页渲染 ── */
    await waitFor("document.querySelector('.hero h1') && document.querySelectorAll('.course-card').length >= 3", 15000, '首页');
    const courseCards = await evl("document.querySelectorAll('.course-card').length");
    check('首页渲染：hero 与课程卡片 ≥3', courseCards >= 3, 'courseCards=' + courseCards);

    /* ── 2. 章节页渲染（金标准章节 oop-01） ── */
    await goto('#/chapter/oop/oop-01');
    await waitFor("document.querySelector('.chapter-main h1')", 15000, '章节页');
    const chTitle = await evl("document.querySelector('.chapter-main h1').textContent");
    const proSecs = await evl("document.querySelectorAll('.track[data-track=\"pro\"] .track-section').length");
    const quizCount = await evl("document.querySelectorAll('.quiz-item').length");
    check('章节页渲染：标题/专业版节数/题数', !!chTitle && proSecs >= 4 && quizCount === 10, JSON.stringify({ chTitle, proSecs, quizCount }));

    /* ── 3. 双讲解切换（节数一致 + 切换生效 + 切回恢复） ── */
    const kidInfo = await evl(`(function(){
      var btns=[].slice.call(document.querySelectorAll('.trackbar .segmented button'));
      var proBtn=btns.find(function(b){return b.textContent.indexOf('专业')>=0;});
      var kid=btns.find(function(b){return b.textContent.indexOf('小孩')>=0;});
      if(!kid || !proBtn) return {err:'no track buttons'};
      var proSecsBefore=document.querySelectorAll('.track[data-track="pro"] .track-section').length;
      kid.click();
      var kidSecs=document.querySelectorAll('.track[data-track="kid"] .track-section').length;
      proBtn.click();
      var proSecsAfter=document.querySelectorAll('.track[data-track="pro"] .track-section').length;
      return {proSecsBefore:proSecsBefore, kidSecs:kidSecs, proSecsAfter:proSecsAfter};
    })()`);
    check('双讲解切换：小孩版节数=专业版节数，切回恢复', kidInfo && kidInfo.kidSecs === kidInfo.proSecsBefore && kidInfo.kidSecs >= 4 && kidInfo.proSecsAfter === kidInfo.proSecsBefore, JSON.stringify(kidInfo));

    /* ── 4. 习题提交与判分（选第一个选择题，点第一个选项提交） ── */
    const quizResult = await evl(`(function(){
      var items=[].slice.call(document.querySelectorAll('.quiz-item'));
      var it=items.filter(function(x){return x.querySelector('.quiz-options');})[0];
      if(!it) return {err:'no choice item'};
      var id=it.getAttribute('data-id');
      var opt=it.querySelectorAll('.quiz-option')[0];
      opt.click();
      var sub=[].slice.call(it.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('提交')>=0;});
      sub.click();
      var status=it.querySelector('.quiz-status');
      var solOpen=it.querySelector('.quiz-solution-wrap');
      return {id:id, status:status?status.textContent:'', solutionOpen: solOpen? solOpen.open:null};
    })()`);
    check('习题提交并即时判分', !!(quizResult && quizResult.status && quizResult.status.length > 0), JSON.stringify(quizResult));

    /* ── 5. 存储写入验证（localStorage 结构化记录） ── */
    const storeCheck = await evl(`(function(){
      var key=Object.keys(localStorage).find(function(k){return k.indexOf('cslearn')>=0;});
      if(!key) return {err:'no store'};
      var s=JSON.parse(localStorage.getItem(key));
      var exIds=Object.keys(s.exercises||{});
      var chs=Object.keys(s.chapters||{});
      return {key:key, exCount:exIds.length, chCount:chs.length, sample:exIds.length? s.exercises[exIds[0]] : null};
    })()`);
    check('答题与章节访问已写入本地存储', storeCheck && storeCheck.exCount >= 1 && storeCheck.chCount >= 1, JSON.stringify(storeCheck));

    /* ── 6. 标记完成 + 刷新持久化 ── */
    const before = await evl(`(function(){
      var btn=[].slice.call(document.querySelectorAll('.trackbar button')).find(function(b){return b.textContent.indexOf('标记')>=0||b.textContent.indexOf('完成')>=0;});
      if(btn && btn.textContent.indexOf('标记')>=0){ btn.click(); }
      var key=Object.keys(localStorage).find(function(k){return k.indexOf('cslearn')>=0;});
      var s=JSON.parse(localStorage.getItem(key));
      return {completed: !!(s.chapters['oop-01'] && s.chapters['oop-01'].completed)};
    })()`);
    await evl('location.reload()');
    await sleep(2500);
    await waitFor("document.querySelector('.chapter-main h1')", 20000, '刷新后的章节页');
    const after = await evl(`(function(){
      var key=Object.keys(localStorage).find(function(k){return k.indexOf('cslearn')>=0;});
      var s=JSON.parse(localStorage.getItem(key));
      var done=!!(s.chapters['oop-01'] && s.chapters['oop-01'].completed);
      var quizCount=document.querySelectorAll('.quiz-item').length;
      return {completed: done, quizCount: quizCount};
    })()`);
    check('标记完成且刷新后数据不丢', before && before.completed && after && after.completed && after.quizCount === 10, JSON.stringify({ before, after }));

    /* ── 7. 进度面板 ── */
    await goto('#/dashboard');
    await waitFor("document.querySelectorAll('.stat-tile').length >= 4", 15000, '进度面板');
    const dashInfo = await evl(`(function(){
      var tiles=[].slice.call(document.querySelectorAll('.stat-tile')).map(function(t){return t.textContent;});
      var rows=document.querySelectorAll('.course-progress-row').length;
      return {tiles:tiles, rows:rows};
    })()`);
    check('进度面板：指标卡 ≥4 且课程进度行 ≥1', dashInfo && dashInfo.tiles.length >= 4 && dashInfo.rows >= 1, JSON.stringify(dashInfo));

    /* ── 8. 练习中心 ── */
    await goto('#/practice');
    await waitFor("document.querySelector('.practice-toolbar')", 15000, '练习中心');
    const practice = await evl(`(function(){
      var run=[].slice.call(document.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('开始练习')>=0;});
      run.click();
      return {clicked:true};
    })()`);
    await sleep(1500);
    const practiceItems = await evl("document.querySelectorAll('.quiz-item').length");
    check('练习中心加载题目', !!(practice && practice.clicked) && practiceItems >= 10, 'items=' + practiceItems);

    /* ── 9. 演示：排序可视化交互（下一步 / 重置 / 旁白） ── */
    await goto('#/demo/sorting');
    await waitFor("document.querySelector('.dk-shell') && document.querySelector('.dk-bar')", 20000, '演示页');
    await sleep(800);
    const demoInfo = await evl(`(async function(){
      var bar=document.querySelector('.dk-bar');
      function snap(){ var cs=[].slice.call(bar.querySelectorAll('.chip,.dk-badge')).map(function(c){return c.textContent;}).join('|'); var n=document.querySelector('.dk-narr'); return cs+'::'+(n?n.textContent.trim():''); }
      var nextBtn=[].slice.call(bar.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('下一步')>=0;});
      var resetBtn=[].slice.call(bar.querySelectorAll('button')).find(function(b){return b.textContent.indexOf('重置')>=0;});
      if(!nextBtn || !resetBtn) return {err:'no btns'};
      resetBtn.click();
      await new Promise(function(res){setTimeout(res,400);});
      var s0=snap();
      nextBtn.click();
      await new Promise(function(res){setTimeout(res,600);});
      var s1=snap();
      resetBtn.click();
      await new Promise(function(res){setTimeout(res,300);});
      var s2=snap();
      var narr=document.querySelector('.dk-narr');
      return { changed: s1!==s0, restored: s2===s0, narrShown: !!narr, s0:s0.slice(0,70), s1:s1.slice(0,70) };
    })()`);
    check('演示：单步前进→旁白显示→重置', !!(demoInfo && demoInfo.changed && demoInfo.restored && demoInfo.narrShown), JSON.stringify(demoInfo));

    /* ── 10. 搜索 ── */
    await goto('#/');
    await waitFor("document.querySelector('#search-input')", 10000, '搜索框');
    const search = await evl(`(function(){
      var inp=document.querySelector('#search-input');
      inp.value='排序';
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      return true;
    })()`);
    await sleep(1200);
    const searchCount = await evl("document.querySelectorAll('#search-results a').length");
    check('站内搜索返回结果', !!search && searchCount >= 1, 'results=' + searchCount);

    /* ── 11. 品牌·作者信息（v1.1 更新） ── */
    await goto('#/about');
    await waitFor("document.querySelector('.author-card')", 12000, '作者信息卡');
    const brandInfo = await evl(`(function(){
      var title = document.title;
      var foot = document.querySelector('.sitefoot').textContent;
      var mail = document.querySelector('.sitefoot .mailto');
      var avatar = document.querySelector('.author-avatar');
      var name = document.querySelector('.author-name');
      var aMail = document.querySelector('.author-mail');
      return {
        title: title, footHasCn: foot.indexOf('贝尔实验室') >= 0, footHasEn: foot.indexOf('BEARLABS') >= 0,
        footMail: mail ? (mail.getAttribute('href') || '') : 'none',
        avatarOk: !!avatar && avatar.naturalWidth > 0,
        name: name ? name.textContent : '',
        aMailHref: aMail ? aMail.getAttribute('href') : '', aMailText: aMail ? aMail.textContent : ''
      };
    })()`);
    check('更名与页脚品牌（贝尔实验室 + BEARLABS + 邮箱组装）', !!(brandInfo && brandInfo.footHasCn && brandInfo.footHasEn && /^mailto:2451101123@qq\.com$/.test(brandInfo.footMail)), JSON.stringify(brandInfo).slice(0,220));
    check('作者信息模块（姓名/邮箱/头像加载）', !!(brandInfo && brandInfo.name === 'Solips-Singularitat' && brandInfo.aMailHref === 'mailto:2451101123@qq.com' && brandInfo.aMailText === '2451101123@qq.com' && brandInfo.avatarOk), JSON.stringify(brandInfo).slice(0,220));
    check('页面标题含品牌英文名', !!(brandInfo && brandInfo.title.indexOf('Bearlabs') >= 0), brandInfo && brandInfo.title);

    /* ── 12. 研究所专栏（v1.1 更新） ── */
    await goto('#/institute');
    await waitFor("document.querySelector('.institute-logo')", 12000, '研究所专栏');
    const instInfo = await evl(`(function(){
      var logo = document.querySelector('.institute-logo');
      var link = [].slice.call(document.querySelectorAll('.view-institute a')).find(function(a){return (a.getAttribute('href')||'').indexOf('caa-ins.org')>=0;});
      var prose = document.querySelector('.view-institute .prose');
      return {
        logoOk: !!logo && logo.naturalWidth > 0,
        linkHref: link ? link.getAttribute('href') : 'none',
        linkTarget: link ? link.getAttribute('target') : '',
        linkRel: link ? (link.getAttribute('rel')||'') : '',
        bodyLen: prose ? prose.textContent.length : 0
      };
    })()`);
    check('研究所专栏：内容与图标加载', !!(instInfo && instInfo.logoOk && instInfo.bodyLen > 60), JSON.stringify(instInfo).slice(0,220));
    check('研究所官网链接（新标签+安全属性）', !!(instInfo && instInfo.linkHref === 'https://www.caa-ins.org/' && instInfo.linkTarget === '_blank' && /noopener/.test(instInfo.linkRel)), JSON.stringify(instInfo).slice(0,220));

    /* ── 13. JS 运行错误（应为空） ── */
    const critErrors = jsErrors.filter((e) => !/favicon|net::ERR|404/i.test(e));
    check('页面无 JavaScript 异常', critErrors.length === 0, critErrors.slice(0, 5).join(' | '));

    /* ── 14. 导出功能（CSV 生成） ── */
    const csv = await evl("(function(){ try { return Store.exportCSV_exercises().split('\\r\\n').length; } catch(e) { return 'ERR:'+e.message; } })()");
    check('答题记录可导出 CSV', typeof csv === 'number' && csv >= 2, 'csvLines=' + csv);

  } catch (e) {
    check('测试执行', false, String(e && e.message || e));
  } finally {
    try { if (ws) ws.close(); } catch (e) { /* noop */ }
    try { chrome.kill(); } catch (e) { /* noop */ }
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  }

  const report = { at: Date.now(), base: BASE, results, jsErrors, pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log('====== 端到端交互测试 ======');
  results.forEach((r) => console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '  —— ' + r.detail)));
  console.log('============================');
  console.log('通过 ' + report.pass + ' / 失败 ' + report.fail + '（报告：docs/e2e-report.json）');
  process.exit(report.fail ? 1 : 0);
}

main();
