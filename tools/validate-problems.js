#!/usr/bin/env node
/* ============================================================================
 * validate-problems.js — 「必刷题」题库校验与统计（零依赖，Node >= 16）
 * 用法：
 *   node tools/validate-problems.js                  # 校验 content/problems 全部 8 科 + 全局统计
 *   node tools/validate-problems.js --file <f>...    # 只校验指定文件（写作自查用）
 *   node tools/validate-problems.js --json <out>     # 额外输出统计报告 JSON
 * 规范见工作台 SCHEMA.md / docs/problems-guide.md；失败时进程退出码为 1。
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'content', 'problems');

const SUBJECTS = [
  ['ds', '数据结构', 30],
  ['co', '计算机组成原理', 30],
  ['os', '操作系统', 30],
  ['net', '计算机网络', 30],
  ['pl', '编程语言基础', 25],
  ['algo', '算法与复杂度', 30],
  ['db', '数据库', 25],
  ['brain', '智力·场景面试', 20],
];
const SUBJ_BY_ID = new Map(SUBJECTS.map(([id, name, target]) => [id, { id, name, target }]));
const TYPE_LABEL = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '简答', code: '代码/算法', complexity: '复杂度分析' };
const TYPE_ORDER = ['single', 'multi', 'judge', 'fill', 'short', 'code', 'complexity'];
const TYPE_MIN = { single: 60, multi: 20, judge: 20, fill: 20, short: 20, code: 12, complexity: 10 };
const DIFF_LABEL = { 1: '入门', 2: '进阶', 3: '冲刺' };
const BAD = [
  [/\p{Extended_Pictographic}/u, '包含 emoji 或图形符号'],
  [/https?:\/\//i, '包含外部 URL'],
  [/<\/?[a-z][^>]*>/i, '包含 HTML 标签'],
  [/TODO|待补充|Lorem ipsum/i, '包含占位符（TODO/待补充/Lorem）'],
  [/以上(都|全)对|以上(都|全)错/, '含「以上都对/错」类取巧表述'],
];
/* 疑似繁体字清单（仅提示不拦截；均为繁体专用字形） */
const TRAD = '誰為說們時裡將於後兒點碼題錯處學無與個來這對經過發顯實際檢內關進遠選擇變數體東問頭條機讓稱觀軍準確隨產動錢類傳僅絕開復計議設資訊網絡線繫統級組結給電腦圖標員場廣應態樣幾風險驗證據庫從舊認識讀書寫筆記錄鍵盤種積極單雙邊還買賣課業習練試測總較覺寶貝貴費幣額頁項順須預飛飯館嗎愛貓隻塊顆舉辦務眾賺輸贏鐵銀針鐘鏡號蟲鳥龍龜麥醫藥護戰擊丟撿撐攤擺掛畫蓋';

const plen = (s) => String(s == null ? '' : s).replace(/\s+/g, '').length;
const stemFingerprint = (s) => crypto.createHash('sha1')
  .update(String(s || '').replace(/[\s\u3000]+/g, '').replace(/[，。？?！!、；;：:（）()【】\[\]“”"'’‘.,]/g, '').toLowerCase())
  .digest('hex');

function checkText(field, val, min, issues) {
  if (typeof val !== 'string' || !val.trim()) { issues.push(`${field} 缺失或为空`); return; }
  if (plen(val) < min) issues.push(`${field} 太短：${plen(val)} 字 < ${min}`);
  for (const [re, msg] of BAD) if (re.test(val)) issues.push(`${field} ${msg}`);
}

function validateOne(q, subjId, pos, issues, warns) {
  const tag = (q && typeof q.id === 'string') ? q.id : `${subjId}-#${pos}`;
  if (!q || typeof q !== 'object') { issues.push(`第 ${pos} 题不是对象`); return; }
  if (typeof q.id !== 'string' || !new RegExp('^pb-' + subjId + '-\\d{3}$').test(q.id)) issues.push(`${tag}: id 形如 pb-${subjId}-NNN`);
  if (typeof q.id === 'string') {
    const expect = 'pb-' + subjId + '-' + String(pos).padStart(3, '0');
    if (q.id !== expect) issues.push(`${tag}: id 与文件顺序不一致（第 ${pos} 位应为 ${expect}）`);
  }
  if (typeof q.topic !== 'string' || q.topic.trim().length < 2 || q.topic.trim().length > 16) issues.push(`${tag}: topic 应为 2-16 字`);
  else for (const [re, msg] of BAD) if (re.test(q.topic)) issues.push(`${tag}.topic ${msg}`);
  if (TYPE_LABEL[q.type] == null) issues.push(`${tag}: type 非法（${q.type}）`);
  if (![1, 2, 3].includes(q.difficulty)) issues.push(`${tag}: difficulty 应为 1/2/3`);
  checkText(`${tag}.stem`, q.stem, 10, issues);
  checkText(`${tag}.pro`, q.pro, 80, issues);
  checkText(`${tag}.kid`, q.kid, 60, issues);

  const t = q.type;
  if (t === 'single' || t === 'multi') {
    if (!Array.isArray(q.options)) { issues.push(`${tag}: options 应为数组`); return; }
    if (q.options.length < 4 || q.options.length > 5) issues.push(`${tag}: options 应为 4-5 个（当前 ${q.options.length}）`);
    const seen = new Set();
    q.options.forEach((o, oi) => {
      if (typeof o !== 'string' || !o.trim()) { issues.push(`${tag}.options[${oi}] 为空`); return; }
      if (/^[A-F][.．、:：]\s*/.test(o)) issues.push(`${tag}.options[${oi}] 不应带字母前缀（如 A.）`);
      if (o.length > 90) issues.push(`${tag}.options[${oi}] 过长（>90 字）`);
      const key = o.trim();
      if (seen.has(key)) issues.push(`${tag}.options[${oi}] 与前面选项重复`); else seen.add(key);
      for (const [re, msg] of BAD) if (re.test(o)) issues.push(`${tag}.options[${oi}] ${msg}`);
    });
    const letters = 'ABCDE'.slice(0, q.options.length);
    if (t === 'single') {
      if (typeof q.answer !== 'string' || !/^[A-E]$/.test(q.answer)) issues.push(`${tag}: single 的 answer 应为单个大写字母`);
      else if (letters.indexOf(q.answer) < 0) issues.push(`${tag}: answer 超出选项范围`);
    } else {
      if (!Array.isArray(q.answer) || q.answer.length < 2) issues.push(`${tag}: multi 的 answer 应为 ≥2 个字母的数组`);
      else {
        if (new Set(q.answer).size !== q.answer.length) issues.push(`${tag}: answer 存在重复字母`);
        q.answer.forEach((a) => { if (typeof a !== 'string' || !/^[A-E]$/.test(a) || letters.indexOf(a) < 0) issues.push(`${tag}: answer 含非法字母 ${a}`); });
      }
    }
  } else if (t === 'judge') {
    if (typeof q.answer !== 'boolean') issues.push(`${tag}: judge 的 answer 应为布尔值 true/false`);
  } else if (t === 'fill') {
    if (!Array.isArray(q.answer) || q.answer.length < 1 || q.answer.length > 4) issues.push(`${tag}: fill 的 answer 应为 1-4 个可接受答案的数组`);
    else {
      q.answer.forEach((a, ai) => { if (typeof a !== 'string' || !a.trim() || a.length > 80) issues.push(`${tag}: fill answer[${ai}] 应为 1-80 字非空字符串`); });
      if (!/_{2,}/.test(String(q.stem || ''))) warns.push(`${tag}: 填空题题干建议用 ____ 显式留空`);
    }
  } else if (t === 'short' || t === 'code' || t === 'complexity') {
    const min = t === 'short' ? 15 : t === 'code' ? 30 : 10;
    checkText(`${tag}.answer`, q.answer, min, issues);
    if (t === 'code' && typeof q.answer === 'string' && q.answer.indexOf('\n') < 0) warns.push(`${tag}: 代码答案建议包含换行`);
  }
  if (q.type && ['judge', 'fill', 'short', 'code', 'complexity'].indexOf(q.type) >= 0 && Array.isArray(q.options) && q.options.length) {
    warns.push(`${tag}: 非选择题不应带 options`);
  }
  /* 疑似繁体字扫描（整个题目对象；仅提示） */
  try {
    const blob = JSON.stringify(q);
    const hit = [];
    for (const ch of TRAD) if (blob.indexOf(ch) >= 0 && hit.indexOf(ch) < 0) hit.push(ch);
    if (hit.length) warns.push(`${tag}: 疑似繁体字：${hit.join('')}`);
  } catch (e) { /* noop */ }
}

function readData(abs) {
  if (!fs.existsSync(abs)) return { error: '文件不存在：' + path.relative(ROOT, abs) };
  let text = fs.readFileSync(abs, 'utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  try { return { data: JSON.parse(text) }; } catch (e) { return { error: 'JSON 解析失败：' + e.message }; }
}

function validateFile(abs) {
  const issues = [];
  const warns = [];
  const r = readData(abs);
  if (r.error) { issues.push(r.error); return { file: abs, issues, warns, questions: [] }; }
  const data = r.data;
  const subj = SUBJ_BY_ID.get(data.subject);
  if (!subj) issues.push(`subject 非法：${JSON.stringify(data.subject)}（应为 ds/co/os/net/pl/algo/db/brain 之一）`);
  if (typeof data.name !== 'string' || !data.name.trim()) issues.push('缺少 name');
  else if (subj && data.name !== subj.name) issues.push(`name 应为「${subj.name}」`);
  if (typeof data.desc !== 'string' || !data.desc.trim()) issues.push('缺少 desc');
  if (!Array.isArray(data.questions)) { issues.push('questions 应为数组'); return { file: abs, issues, warns, questions: [] }; }
  const canonical = path.basename(abs) === String(data.subject) + '.json' && path.dirname(abs) === DIR;
  if (canonical && subj && data.questions.length !== subj.target) {
    issues.push(`题量应为 ${subj.target}，当前 ${data.questions.length}`);
  }
  let prevDiff = 0;
  const idSeen = new Set();
  data.questions.forEach((q, i) => {
    if (q && typeof q.difficulty === 'number' && [1, 2, 3].includes(q.difficulty)) {
      if (q.difficulty < prevDiff) issues.push(`${(q && q.id) || '#' + (i + 1)}: 文件内难度应从低到高排序（1→2→3）`);
      prevDiff = Math.max(prevDiff, q.difficulty);
    }
    if (q && typeof q.id === 'string') {
      if (idSeen.has(q.id)) issues.push(`${q.id}: id 重复`); else idSeen.add(q.id);
    }
    validateOne(q, data.subject || 'xx', i + 1, issues, warns);
  });
  return { file: abs, issues, warns, questions: data.questions, subject: data.subject };
}

function pad(s, n) { s = String(s); let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); }

function main() {
  const args = process.argv.slice(2);
  const fileMode = args.indexOf('--file') >= 0;
  const jsonIdx = args.indexOf('--json');
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  let targets;
  if (fileMode) {
    targets = args.slice(args.indexOf('--file') + 1).filter((a, i, arr) => a !== '--json' && a !== jsonOut);
    if (!targets.length) { console.error('用法：node tools/validate-problems.js --file <path...>'); process.exit(2); }
    targets = targets.map((f) => path.resolve(ROOT, f));
  } else {
    targets = SUBJECTS.map(([id]) => path.join(DIR, id + '.json'));
  }

  const allIssues = [];
  const globalIssues = [];
  const allWarns = [];
  const perFile = [];
  const allQs = [];
  let fail = 0;
  console.log('===== 「必刷题」题库校验 =====');
  targets.forEach((abs) => {
    const r = validateFile(abs);
    perFile.push(r);
    r.issues.forEach((m) => allIssues.push(path.relative(ROOT, abs).split(path.sep).join('/') + ' :: ' + m));
    r.warns.forEach((m) => allWarns.push(path.relative(ROOT, abs).split(path.sep).join('/') + ' :: ' + m));
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (r.issues.length) {
      fail++;
      console.log('FAIL  ' + rel);
      r.issues.slice(0, 40).forEach((m) => console.log('      - ' + m));
      if (r.issues.length > 40) console.log(`      …… 共 ${r.issues.length} 条`);
    } else {
      const c = { 1: 0, 2: 0, 3: 0 };
      const ty = {};
      r.questions.forEach((q) => { if (c[q.difficulty] != null) c[q.difficulty]++; ty[q.type] = (ty[q.type] || 0) + 1; });
      console.log('PASS  ' + rel + `  (${r.questions.length} 题 / 入门${c[1]} 进阶${c[2]} 冲刺${c[3]})`);
      r.questions.forEach((q) => allQs.push({ q, file: rel }));
    }
  });

  let stats = null;
  if (!fileMode && fail === 0) {
    /* 全局统计与规则 */
    const bySubject = {};
    const typeTotals = {};
    const diffTotals = { 1: 0, 2: 0, 3: 0 };
    const fp = new Map();
    allQs.forEach(({ q }) => {
      const sid = q.id.split('-')[1];
      const s = (bySubject[sid] = bySubject[sid] || { count: 0, diff: { 1: 0, 2: 0, 3: 0 }, types: {} });
      s.count++;
      s.diff[q.difficulty]++;
      s.types[q.type] = (s.types[q.type] || 0) + 1;
      typeTotals[q.type] = (typeTotals[q.type] || 0) + 1;
      diffTotals[q.difficulty]++;
      const h = stemFingerprint(q.stem);
      if (!fp.has(h)) fp.set(h, []);
      fp.get(h).push(q.id);
    });
    fp.forEach((ids) => { if (ids.length > 1) globalIssues.push('题干重复：' + ids.join(' / ')); });
    const dupCount = allQs.length - fp.size;
    SUBJECTS.forEach(([id]) => {
      const s = bySubject[id];
      if (!s) { globalIssues.push(`科目缺失：${id}`); return; }
      [1, 2, 3].forEach((d) => { if (s.diff[d] < 3) globalIssues.push(`${id} 的${DIFF_LABEL[d]}题不足 3 道（当前 ${s.diff[d]}）`); });
      const distinct = Object.keys(s.types).length;
      if (distinct < 4) globalIssues.push(`${id} 题型种类应 ≥4（当前 ${distinct}）`);
    });
    TYPE_ORDER.forEach((t) => {
      if ((typeTotals[t] || 0) < TYPE_MIN[t]) globalIssues.push(`全局题型「${TYPE_LABEL[t]}」不足：${typeTotals[t] || 0} < ${TYPE_MIN[t]}`);
    });
    Object.entries(diffTotals).forEach(([d, n]) => { if (n < 50) globalIssues.push(`全局${DIFF_LABEL[d]}题不足 50（当前 ${n}）`); });
    if (allQs.length < 200) globalIssues.push(`总题量不足 200（当前 ${allQs.length}）`);

    stats = {
      total: allQs.length,
      unique: fp.size,
      dupCount,
      subjects: SUBJECTS.map(([id, name]) => ({
        id, name,
        count: bySubject[id] ? bySubject[id].count : 0,
        diff: bySubject[id] ? bySubject[id].diff : { 1: 0, 2: 0, 3: 0 },
        types: bySubject[id] ? bySubject[id].types : {},
      })),
      typeTotals,
      diffTotals,
    };
    /* 打印矩阵 */
    console.log('');
    console.log(pad('科目', 14) + pad('合计', 6) + pad('入门', 6) + pad('进阶', 6) + pad('冲刺', 6) + ' | ' + TYPE_ORDER.map((t) => pad(TYPE_LABEL[t], 10)).join(''));
    stats.subjects.forEach((s) => {
      console.log(pad(s.name, 14) + pad(s.count, 6) + pad(s.diff[1], 6) + pad(s.diff[2], 6) + pad(s.diff[3], 6) + ' | ' + TYPE_ORDER.map((t) => pad(s.types[t] || 0, 10)).join(''));
    });
    console.log(pad('总计', 14) + pad(stats.total, 6) + pad(diffTotals[1], 6) + pad(diffTotals[2], 6) + pad(diffTotals[3], 6) + ' | ' + TYPE_ORDER.map((t) => pad(typeTotals[t] || 0, 10)).join(''));
    console.log('');
    console.log(`去重核验：${stats.total} / ${stats.total}（题干指纹去重后 ${stats.unique}，重复 ${stats.dupCount}）`);
  }

  if (allWarns.length) {
    console.log('');
    console.log('提示（不阻塞）：');
    allWarns.slice(0, 20).forEach((m) => console.log('  ~ ' + m));
    if (allWarns.length > 20) console.log(`  …… 共 ${allWarns.length} 条`);
  }

  const ok = fail === 0 && allIssues.length === 0 && globalIssues.length === 0;
  if (globalIssues.length) {
    console.log('');
    console.log('全局校验未通过：');
    globalIssues.slice(0, 20).forEach((m) => console.log('  - ' + m));
    if (globalIssues.length > 20) console.log(`  …… 共 ${globalIssues.length} 条`);
  }
  if (allIssues.length && fail > 0) {
    console.log('');
    console.log(`存在 ${allIssues.length} 条文件级问题，样例：`);
    allIssues.slice(0, 20).forEach((m) => console.log('  - ' + m));
  }
  console.log('');
  console.log(ok ? '===== 全部通过 =====' : '===== 校验失败（见上）=====');

  if (jsonOut) {
    const out = path.resolve(ROOT, jsonOut);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({
      at: Date.now(),
      mode: fileMode ? 'file' : 'all',
      ok,
      stats,
      issues: allIssues.concat(globalIssues),
      warnings: allWarns,
      files: perFile.map((r) => ({ file: path.relative(ROOT, r.file).split(path.sep).join('/'), ok: r.issues.length === 0, count: r.questions.length })),
    }, null, 2));
    console.log('报告已写入：' + path.relative(ROOT, out));
  }
  process.exit(ok ? 0 : 1);
}

main();
