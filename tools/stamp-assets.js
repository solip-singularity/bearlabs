#!/usr/bin/env node
/* ============================================================================
 * stamp-assets.js — 给引用的本地资源加上内容哈希版本号
 *
 * 为什么需要：GitHub Pages 对静态资源固定下发 Cache-Control: max-age=600，
 * 改完文件重新部署后，浏览器最长 10 分钟仍会使用旧缓存（表现为"改了看不到"）。
 * 给引用加上 ?v=<内容哈希> 后，只要文件内容变了 URL 就变，浏览器必然重新拉取。
 *
 * 覆盖范围：
 *   - index.html 中的 css/*、js/*、assets/*、根目录 favicon.ico
 *   - js/**\/*.js 中的 assets/* 字符串字面量（例如关于页作者头像）
 *
 * 幂等：每次执行先剥离已有 ?v= 得到基准内容，再用基准内容计算哈希。
 * 注意 js 文件既是被引用的资源、又是承载 ?v= 的载体，计算哈希时必须用
 * 剥离后的内容，否则会形成"哈希依赖自身输出"的循环，导致每次执行版本号都变。
 *
 * 用法：node tools/stamp-assets.js [目标目录]   默认项目根目录
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const JS_DIR = path.join(ROOT, 'js');

if (!fs.existsSync(INDEX)) {
  console.error('找不到 ' + INDEX);
  process.exit(1);
}

const toRel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

/* ── 收集 js 文件 ── */
const jsFiles = [];
(function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) jsFiles.push(p);
  }
})(JS_DIR);

/* ── 1. 剥离 js 中已存在的 ?v=，得到基准内容 ── */
const JS_STAMPED = /(["'])(assets\/[^"'?]+)\?v=[a-f0-9]+(["'])/g;
const JS_PLAIN = /(["'])(assets\/[^"'?]+)(["'])/g;
const jsBase = new Map();      // 绝对路径 -> 基准内容
const jsBaseByRel = new Map(); // 相对路径 -> 基准内容
for (const f of jsFiles) {
  const base = fs.readFileSync(f, 'utf8').replace(JS_STAMPED, '$1$2$3');
  jsBase.set(f, base);
  jsBaseByRel.set(toRel(f), base);
}

/* ── 2. 剥离 index.html 中已存在的 ?v= ── */
const REF_RE = /(?:href|src)="((?:(?:css|js|assets)\/[^"?]+|favicon\.ico))(?:\?v=[a-f0-9]+)?"/g;
const STRIP_RE = /((?:href|src)="(?:(?:css|js|assets)\/[^"?]+|favicon\.ico))(?:\?v=[a-f0-9]+)?"/g;
const html = fs.readFileSync(INDEX, 'utf8');
const refs = [...new Set([...html.matchAll(REF_RE)].map((m) => m[1]))];

/* ── 3. 计算统一版本号（js 一律用基准内容，避免循环依赖） ── */
const h = crypto.createHash('sha1');
const ok = [];
for (const f of refs) {
  const rel = f.split('?')[0];
  if (jsBaseByRel.has(rel)) { h.update(jsBaseByRel.get(rel)); ok.push(f); continue; }
  try { h.update(fs.readFileSync(path.join(ROOT, rel))); ok.push(f); }
  catch (e) { console.warn('  跳过（读取失败）：' + f); }
}
const stamp = h.digest('hex').slice(0, 8);

/* ── 4. 写回 js ── */
let jsTouched = 0;
for (const f of jsFiles) {
  const next = jsBase.get(f).replace(JS_PLAIN, '$1$2?v=' + stamp + '$3');
  if (next !== fs.readFileSync(f, 'utf8')) { fs.writeFileSync(f, next); jsTouched++; }
}

/* ── 5. 写回 index.html ── */
fs.writeFileSync(INDEX, html.replace(STRIP_RE, '$1?v=' + stamp + '"'));

console.log('版本号 v=' + stamp + '  |  index.html 资源 ' + ok.length + '/' + refs.length +
  ' 个  |  js 文件 ' + jsFiles.length + ' 个（改动 ' + jsTouched + ' 个）');
