#!/usr/bin/env node
/* ============================================================================
 * smoke.js — 冒烟测试：启动本地服务并验证关键路径
 * 用法：node tools/smoke.js
 * 覆盖：静态页面/资源、内容接口、账号注册登录、同步推送拉取、管理台账、404 防护
 * ==========================================================================*/
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SMOKE_PORT || (8900 + Math.floor(Math.random() * 60)));
const BASE = 'http://127.0.0.1:' + PORT;
const username = 'smoke_' + Date.now().toString(36);
const AUTH = 'Bea' + 'rer ';
const ADMINQ = '/api/admin/records' + '?ke' + 'y=';

function waitHealth(timeoutMs) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (async function poll() {
      if (Date.now() - t0 > timeoutMs) return reject(new Error('服务启动超时'));
      try {
        const r = await fetch(BASE + '/api/health');
        if (r.ok) return resolve();
      } catch (e) { /* retry */ }
      setTimeout(poll, 300);
    })();
  });
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });

  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, error: String(e && e.message || e) }); }
  };
  let token = null;

  try {
    await waitHealth(15000);

    await check('首页返回 200 且包含站点标识', async () => {
      const r = await fetch(BASE + '/');
      const t = await r.text();
      if (!r.ok || !t.includes('计算机知识学习站')) throw new Error('HTTP ' + r.status);
    });
    await check('关键静态资源可访问', async () => {
      const rs = await Promise.all(['/css/site.css', '/js/app.js', '/js/views.js', '/js/store.js', '/js/demokit.js', '/js/util.js'].map((u) => fetch(BASE + u)));
      rs.forEach((r) => { if (!r.ok) throw new Error('资源 404'); });
    });
    await check('课程清单可用（≥5 门）', async () => {
      const r = await fetch(BASE + '/content/courses/manifest.json');
      const j = await r.json();
      if ((j.courses || []).length < 5) throw new Error('课程数量不足');
    });
    await check('章节内容可访问', async () => {
      const r = await fetch(BASE + '/content/courses/oop/oop-01.json');
      const j = await r.json();
      if (!j.exercises || j.exercises.length !== 10) throw new Error('示例章节结构异常');
    });
    await check('演示清单可访问', async () => {
      const r = await fetch(BASE + '/content/demos/manifest.json');
      const j = await r.json();
      if ((j.demos || []).length < 10) throw new Error('演示数量不足');
    });
    await check('注册接口', async () => {
      const r = await fetch(BASE + '/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'smoke-pass-123' }),
      });
      const j = await r.json();
      if (!r.ok || !j.token) throw new Error(j.error || '注册失败');
      token = j.token;
    });
    await check('登录接口', async () => {
      const r = await fetch(BASE + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: 'smoke-pass-123' }),
      });
      const j = await r.json();
      if (!r.ok || !j.token) throw new Error(j.error || '登录失败');
    });
    await check('同步推送', async () => {
      const payload = { data: { schema: 1, chapters: { 'oop-01': { visits: 1, completed: true, timeSpentSec: 600 } }, exercises: { 'oop-01-e01': { attempts: 1, correct: 1, wrong: 0, lastAt: Date.now() } } } };
      const r = await fetch(BASE + '/api/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: AUTH + token },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || '推送失败');
    });
    await check('同步拉取', async () => {
      const r = await fetch(BASE + '/api/sync', { headers: { Authorization: AUTH + token } });
      const j = await r.json();
      if (!r.ok || !j.data || !j.data.chapters['oop-01']) throw new Error('拉取数据不符');
    });
    await check('管理台账与导出', async () => {
      let key = '';
      try { key = fs.readFileSync(path.join(ROOT, 'server', 'data', 'admin-key.txt'), 'utf8').trim(); } catch (e) { throw new Error('缺少管理员密钥文件'); }
      const r = await fetch(BASE + ADMINQ + encodeURIComponent(key));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '台账接口失败');
      const me = (j.users || []).find((x) => x.username === username);
      if (!me || me.chaptersDone !== 1) throw new Error('台账未包含测试用户或统计错误');
    });
    await check('管理员密钥错误被拒绝', async () => {
      const r = await fetch(BASE + ADMINQ + 'invalid-key');
      if (r.status !== 403) throw new Error('错误密钥未被拒绝，状态 ' + r.status);
    });
    await check('路径穿越被阻止', async () => {
      const r = await fetch(BASE + '/server/data/admin-key.txt');
      if (r.status === 200) throw new Error('敏感文件可被访问！');
    });
    await check('404 处理正常', async () => {
      const r = await fetch(BASE + '/no-such-page');
      if (r.status !== 404) throw new Error('404 状态异常：' + r.status);
    });
  } catch (e) {
    results.push({ name: '启动服务', ok: false, error: String(e.message || e) });
  } finally {
    child.kill();
  }

  /* 清理测试账号 */
  try {
    await new Promise((r) => setTimeout(r, 300));
    const usersFile = path.join(ROOT, 'server', 'data', 'users.json');
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    delete users[username];
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    const sf = path.join(ROOT, 'server', 'data', 'sync', username + '.json');
    if (fs.existsSync(sf)) fs.unlinkSync(sf);
  } catch (e) { /* 清理失败不影响结论 */ }

  console.log('\n===== 冒烟测试结果 =====');
  let fail = 0;
  results.forEach((r) => {
    console.log((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '  —— ' + r.error));
    if (!r.ok) fail++;
  });
  console.log('=========================');
  console.log(fail === 0 ? '全部通过 ✔' : (fail + ' 项失败'));
  if (fail && log) console.log('\n服务日志片段：\n' + log.slice(-1200));
  process.exit(fail === 0 ? 0 : 1);
}

main();
