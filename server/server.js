#!/usr/bin/env node
/* ============================================================================
 * server.js — 「计算机知识学习站」本地服务（零依赖，Node >= 18）
 * 功能：
 *   1. 静态文件服务（项目根目录，含内容 JSON）
 *   2. 可选账号同步 API（注册/登录/推送/拉取）
 *   3. 管理员学习记录台账 API（查看/导出）
 * 用法：node server/server.js   （PORT 环境变量可改端口，默认 8642）
 * ==========================================================================*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');
const SYNC_DIR = path.join(DATA_DIR, 'sync');
const ADMIN_KEY_FILE = path.join(DATA_DIR, 'admin-key.txt');
const MAX_BODY = 12 * 1024 * 1024; // 12MB（同步数据可能较大）

/* ── 数据初始化 ─────────────────────────────────────────────────── */
function ensureData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SYNC_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
  if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, '{}');
  if (!fs.existsSync(ADMIN_KEY_FILE)) {
    fs.writeFileSync(ADMIN_KEY_FILE, crypto.randomBytes(12).toString('hex'));
  }
}
ensureData();

const readJSON = (file, fb) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fb; } };
const writeJSON = (file, obj) => { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); };
const hashPwd = (pwd, salt) => crypto.scryptSync(String(pwd), salt, 64).toString('hex');
const validUser = (u) => /^[A-Za-z0-9_]{3,20}$/.test(String(u || ''));

/* ── HTTP 工具 ──────────────────────────────────────────────────── */
function send(res, code, obj, extraHeaders) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  }, extraHeaders || {});
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let size = 0;
  const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { cb(new Error('请求体过大')); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try {
      const raw = Buffer.concat(chunks).toString('utf8');
      cb(null, raw ? JSON.parse(raw) : {});
    } catch (e) { cb(new Error('JSON 解析失败：' + e.message)); }
  });
  req.on('error', (e) => cb(e));
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+([a-f0-9]{20,})$/i);
  if (!m) return null;
  const tokens = readJSON(TOKENS_FILE, {});
  const t = tokens[m[1]];
  if (!t) return null;
  t.lastAt = Date.now();
  writeJSON(TOKENS_FILE, tokens);
  return { username: t.username, token: m[1] };
}
function summarize(username) {
  const f = path.join(SYNC_DIR, username + '.json');
  const d = readJSON(f, null);
  const base = { username, chaptersDone: 0, totalTime: 0, accuracy: null, answered: 0, lastActive: null, updatedAt: d ? d.updatedAt : null };
  if (!d || !d.data) return base;
  const s = d.data;
  Object.values(s.chapters || {}).forEach((c) => {
    if (c && c.completed) base.chaptersDone++;
    if (c && c.timeSpentSec) base.totalTime += c.timeSpentSec;
  });
  let correct = 0, wrong = 0;
  Object.values(s.exercises || {}).forEach((e) => {
    if (!e) return;
    correct += e.correct || 0;
    wrong += e.wrong || 0;
    if ((e.attempts || 0) > 0) base.answered++;
    if (e.lastAt && (!base.lastActive || e.lastAt > base.lastActive)) base.lastActive = e.lastAt;
  });
  Object.values(s.chapters || {}).forEach((c) => {
    if (c && c.lastVisitAt && (!base.lastActive || c.lastVisitAt > base.lastActive)) base.lastActive = c.lastVisitAt;
  });
  base.accuracy = (correct + wrong) > 0 ? correct / (correct + wrong) : null;
  return base;
}

/* ── 静态文件 ──────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.bat': 'text/plain; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  rel = rel.replace(/\\/g, '/'); // 统一为正斜杠判断
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT + path.sep) && abs !== ROOT) return send(res, 403, { error: '禁止访问' });
  if (rel === 'server/data' || rel.startsWith('server/data/')) return send(res, 403, { error: '禁止访问' });
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) {
      if (!path.extname(abs)) {
        const idx = path.join(abs, 'index.html');
        if (fs.existsSync(idx)) return serveStatic(pathname.replace(/\/?$/, '/index.html'), res);
      }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><meta charset="utf-8"><title>404</title><p style="font-family:sans-serif;padding:40px;">404 — 未找到：' + rel + '</p><p style="font-family:sans-serif;padding:0 40px;color:#666;">如果是页面路由，请回到 <a href="/">首页</a>。</p>');
      return;
    }
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(abs).pipe(res);
  });
}

/* ── 主服务器 ──────────────────────────────────────────────────── */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  /* ---- API ---- */
  if (p === '/api/health') {
    return send(res, 200, { ok: true, name: 'cs-learn-site', version: '1.0.0', time: Date.now() });
  }
  if (p === '/api/auth/register' && req.method === 'POST') {
    return readBody(req, (err, body) => {
      if (err) return send(res, 400, { error: err.message });
      const { username, password } = body || {};
      if (!validUser(username)) return send(res, 400, { error: '用户名需为 3-20 位字母、数字或下划线' });
      if (typeof password !== 'string' || password.length < 6) return send(res, 400, { error: '密码至少 6 位' });
      const users = readJSON(USERS_FILE, {});
      if (users[username]) return send(res, 409, { error: '用户名已存在' });
      const salt = crypto.randomBytes(16).toString('hex');
      users[username] = { salt, hash: hashPwd(password, salt), createdAt: Date.now() };
      writeJSON(USERS_FILE, users);
      const token = crypto.randomBytes(24).toString('hex');
      const tokens = readJSON(TOKENS_FILE, {});
      tokens[token] = { username, createdAt: Date.now(), lastAt: Date.now() };
      writeJSON(TOKENS_FILE, tokens);
      send(res, 200, { username, token });
    });
  }
  if (p === '/api/auth/login' && req.method === 'POST') {
    return readBody(req, (err, body) => {
      if (err) return send(res, 400, { error: err.message });
      const { username, password } = body || {};
      const users = readJSON(USERS_FILE, {});
      const usr = users[username];
      if (!usr || typeof password !== 'string' || hashPwd(password, usr.salt) !== usr.hash) {
        return send(res, 401, { error: '用户名或密码不正确' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const tokens = readJSON(TOKENS_FILE, {});
      tokens[token] = { username, createdAt: Date.now(), lastAt: Date.now() };
      writeJSON(TOKENS_FILE, tokens);
      send(res, 200, { username, token });
    });
  }
  if (p === '/api/sync') {
    const who = authUser(req);
    if (!who) return send(res, 401, { error: '未登录或登录已过期' });
    const f = path.join(SYNC_DIR, who.username + '.json');
    if (req.method === 'GET') {
      const d = readJSON(f, null);
      return send(res, 200, d || { data: null, updatedAt: null });
    }
    if (req.method === 'POST') {
      return readBody(req, (err, body) => {
        if (err) return send(res, 400, { error: err.message });
        if (!body || typeof body.data !== 'object' || body.data === null) return send(res, 400, { error: '缺少 data 字段' });
        writeJSON(f, { data: body.data, updatedAt: Date.now() });
        send(res, 200, { ok: true, updatedAt: Date.now() });
      });
    }
    return send(res, 405, { error: '方法不允许' });
  }
  if (p === '/api/admin/records') {
    let real = '';
    try { real = fs.readFileSync(ADMIN_KEY_FILE, 'utf8').trim(); } catch { /* ignore */ }
    const key = u.searchParams.get('key') || '';
    if (!key || key !== real) return send(res, 403, { error: '管理员密钥不正确' });
    const users = readJSON(USERS_FILE, {});
    const list = Object.keys(users).map(summarize).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
    return send(res, 200, { users: list, generatedAt: Date.now(), total: list.length });
  }
  if (p.startsWith('/api/')) return send(res, 404, { error: '接口不存在：' + p });

  /* ---- 静态 ---- */
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: '方法不允许' });
  serveStatic(p, res);
});

/* ── 启动（端口占用自动顺延） ──────────────────────────────────── */
let port = Number(process.env.PORT || 8642);
let attempts = 0;
function listen() {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempts < 8) {
      attempts++;
      port++;
      console.log('[server] 端口被占用，尝试 ' + port + ' …');
      setTimeout(listen, 200);
    } else {
      console.error('[server] 启动失败：', e.message);
      process.exit(1);
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const key = fs.readFileSync(ADMIN_KEY_FILE, 'utf8').trim();
    console.log('==============================================');
    console.log('  计算机知识学习站 · 本地服务已启动');
    console.log('  访问地址:  http://127.0.0.1:' + port + '/');
    console.log('  管理员密钥: ' + key);
    console.log('  （密钥文件: server/data/admin-key.txt）');
    console.log('  按 Ctrl+C 停止服务');
    console.log('==============================================');
  });
}
listen();
