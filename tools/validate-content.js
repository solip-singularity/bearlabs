#!/usr/bin/env node
/*
 * validate-content.js — 课程内容校验脚本（零依赖，Node >= 16）
 * 用法：
 *   node tools/validate-content.js <file1.json> [file2.json ...]
 *   node tools/validate-content.js --course <courseId>
 *   node tools/validate-content.js --all
 * 说明：校验 course.json / 章节 json 的结构、题量、难度分布、双讲解节数与字数。
 * 输出 PASS / FAIL 明细；存在 FAIL 时进程退出码为 1。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const COURSES_DIR = path.join(CONTENT, 'courses');
const DEMO_MANIFEST = path.join(CONTENT, 'demos', 'manifest.json');

let DEMO_IDS = new Set();
try {
  const dm = JSON.parse(fs.readFileSync(DEMO_MANIFEST, 'utf8'));
  DEMO_IDS = new Set(dm.demos.map((d) => d.id));
} catch (e) {
  console.error('[warn] 无法读取 demos/manifest.json：' + e.message);
}

const LEVELS = ['easy', 'medium', 'hard'];
const TYPES = ['choice', 'judge', 'derive', 'design', 'code', 'open'];
const BAD_PATTERNS = [
  [/<script[\s>]/i, '存在 <script> 标签（禁止）'],
  [/<style[\s>]/i, '存在 <style> 标签（禁止）'],
  [/<iframe[\s>]/i, '存在 <iframe>（禁止）'],
  [/<img[\s>]/i, '存在 <img>（禁止外链图片，用 SVG）'],
  [/<a[\s>]/i, '存在 <a> 链接（禁止）'],
  [/\son[a-z]+\s*=/i, '存在 on* 事件属性（禁止）'],
  [/https?:\/\//i, '存在外部 URL（禁止）'],
  [/TODO|待补充|Lorem ipsum/i, '存在占位符文本（TODO/待补充/Lorem）'],
];

const log = (...a) => console.log(...a);
const stripTags = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, '');

function checkText(field, text, minLen, issues, label) {
  const plain = stripTags(text);
  if (plain.length < minLen) {
    issues.push(`${label} 字数不足：${plain.length} < ${minLen}`);
  }
  for (const [re, msg] of BAD_PATTERNS) {
    if (re.test(String(text || ''))) issues.push(`${label} ${msg}`);
  }
}

function validateCourse(course, file, issues) {
  const need = (cond, msg) => { if (!cond) issues.push(msg); };
  need(course && typeof course === 'object', 'course.json 不是对象');
  need(typeof course.id === 'string', '缺少 id');
  need(typeof course.title === 'string' && course.title.length >= 2, '缺少 title');
  need(typeof course.subtitle === 'string', '缺少 subtitle');
  need(typeof course.level === 'string', '缺少 level');
  need(typeof course.levelNote === 'string', '缺少 levelNote');
  need(typeof course.hours === 'number' && course.hours >= 5 && course.hours <= 100, 'hours 应为 5-100 的数字');
  need(typeof course.description === 'string' && stripTags(course.description).length >= 40, 'description 太短');
  need(Array.isArray(course.keywords) && course.keywords.length >= 3 && course.keywords.length <= 8, 'keywords 应为 3-8 个');
  need(Array.isArray(course.prerequisites), '缺少 prerequisites 数组');
  need(Array.isArray(course.units) && course.units.length >= 2, 'units 至少 2 个');
  let totalCh = 0; let chIdx = 0;
  (course.units || []).forEach((u, ui) => {
    need(typeof u.id === 'string' && u.id.includes('-u'), `unit[${ui}] id 形如 <courseId>-u1`);
    need(typeof u.title === 'string' && u.title.length >= 2, `unit[${ui}] 缺少 title`);
    need(typeof u.summary === 'string' && u.summary.length >= 5, `unit[${ui}] 缺少 summary`);
    need(Array.isArray(u.chapters) && u.chapters.length >= 1, `unit[${ui}] chapters 至少 1 个`);
    (u.chapters || []).forEach((c, ci) => {
      totalCh++; chIdx++;
      need(new RegExp(`^${course.id}-\\d{2}$`).test(c.id || ''), `unit[${ui}].ch[${ci}] id 应为 ${course.id}-NN`);
      need(typeof c.title === 'string' && /^第\d+讲/.test(c.title), `unit[${ui}].ch[${ci}] 标题应以「第N讲」开头`);
      need(typeof c.objective === 'string' && c.objective.length >= 6, `${c.id} 缺少 objective`);
      need(typeof c.minutes === 'number' && c.minutes >= 20 && c.minutes <= 90, `${c.id} minutes 应为 20-90`);
      need([1, 2, 3].includes(c.difficulty), `${c.id} difficulty 应为 1/2/3`);
      need(Array.isArray(c.prereqs), `${c.id} 缺少 prereqs 数组`);
    });
  });
  need(totalCh >= 8, `章节总数 ${totalCh} < 8（课程应完整）`);
}

function validateChapter(ch, file, issues) {
  const need = (cond, msg) => { if (!cond) issues.push(msg); };
  need(typeof ch.id === 'string' && /-[0-9]{2}$/.test(ch.id), '章节 id 形如 xx-NN');
  need(typeof ch.courseId === 'string', '缺少 courseId');
  need(typeof ch.title === 'string' && /^第\d+讲/.test(ch.title), '标题应以「第N讲」开头');
  need(Array.isArray(ch.objectives) && ch.objectives.length >= 3 && ch.objectives.length <= 5, 'objectives 应为 3-5 条');
  need(Array.isArray(ch.keyPoints) && ch.keyPoints.length >= 3 && ch.keyPoints.length <= 6, 'keyPoints 应为 3-6 条');
  need(typeof ch.minutes === 'number' && ch.minutes >= 20 && ch.minutes <= 90, 'minutes 应为 20-90');
  need([1, 2, 3].includes(ch.difficulty), 'difficulty 应为 1/2/3');
  need(Array.isArray(ch.prerequisites), '缺少 prerequisites 数组');
  need(Array.isArray(ch.keywords) && ch.keywords.length >= 3 && ch.keywords.length <= 8, 'keywords 应为 3-8 个');
  need(Array.isArray(ch.demoRefs), '缺少 demoRefs 数组');
  (ch.demoRefs || []).forEach((d) => {
    if (!DEMO_IDS.has(d)) issues.push(`demoRefs 引用了不存在的演示 id：${d}`);
  });

  const pro = ch.pro || {}; const kid = ch.kid || {};
  need(Array.isArray(pro.sections) && pro.sections.length >= 4 && pro.sections.length <= 6, 'pro.sections 应为 4-6 节');
  need(Array.isArray(kid.sections) && kid.sections.length >= 4 && kid.sections.length <= 6, 'kid.sections 应为 4-6 节');
  if (Array.isArray(pro.sections) && Array.isArray(kid.sections) && pro.sections.length !== kid.sections.length) {
    issues.push(`双讲解节数不一致：pro=${pro.sections.length} kid=${kid.sections.length}`);
  }
  checkText('pro.intro', pro.intro, 60, issues, 'pro.intro');
  checkText('kid.intro', kid.intro, 60, issues, 'kid.intro');
  let proLen = 0; let kidLen = 0;
  (pro.sections || []).forEach((s, i) => {
    proLen += stripTags(s.html).length;
    checkText(`pro.sections[${i}]`, s.html, 150, issues, `pro.sections[${i}]`);
    need(typeof s.heading === 'string' && s.heading.length >= 2, `pro.sections[${i}] 缺少 heading`);
  });
  (kid.sections || []).forEach((s, i) => {
    kidLen += stripTags(s.html).length;
    checkText(`kid.sections[${i}]`, s.html, 120, issues, `kid.sections[${i}]`);
    need(typeof s.heading === 'string' && s.heading.length >= 2, `kid.sections[${i}] 缺少 heading`);
  });
  if (proLen < 1100) issues.push(`pro 总字数不足：${proLen} < 1100`);
  if (kidLen < 750) issues.push(`kid 总字数不足：${kidLen} < 750`);
  const full = JSON.stringify(ch);
  if (!/<svg/i.test(full)) issues.push('本章没有 SVG 图（至少 1 张）');

  need(Array.isArray(ch.glossary) && ch.glossary.length >= 3 && ch.glossary.length <= 8, 'glossary 应为 3-8 条');
  (ch.glossary || []).forEach((g, i) => {
    need(typeof g.term === 'string' && g.term.length >= 1, `glossary[${i}] 缺少 term`);
    need(typeof g.def === 'string' && stripTags(g.def).length >= 8, `glossary[${i}].def 太短`);
  });

  const ex = ch.exercises || [];
  need(Array.isArray(ex) && ex.length === 10, `exercises 应为 10 题，当前 ${Array.isArray(ex) ? ex.length : '非数组'}`);
  if (!Array.isArray(ex)) return;
  const cnt = { easy: 0, medium: 0, hard: 0 };
  const typeCnt = {}; TYPES.forEach((t) => (typeCnt[t] = 0));
  ex.forEach((e, i) => {
    const tag = `${ch.id}-e${String(i + 1).padStart(2, '0')}`;
    need(typeof e.id === 'string' && e.id.startsWith(ch.id + '-e'), `${tag} id 不规范：${e.id}`);
    need(LEVELS.includes(e.level), `${tag} level 非法：${e.level}`);
    if (LEVELS.includes(e.level)) cnt[e.level]++;
    need(TYPES.includes(e.type), `${tag} type 非法：${e.type}`);
    if (TYPES.includes(e.type)) typeCnt[e.type]++;
    checkText(`${tag}.stem`, e.stem, 10, issues, `${tag}.stem`);
    if (e.type === 'choice') {
      need(Array.isArray(e.options) && e.options.length >= 3, `${tag} 选择题至少 3 个选项`);
      need(typeof e.answer === 'string' && /^[A-D]$/.test(e.answer.trim()), `${tag} 选择题 answer 应为 A-D 字母`);
    } else if (e.type === 'judge') {
      need(['正确', '错误'].includes(String(e.answer).trim()), `${tag} 判断题 answer 应为「正确」或「错误」`);
    } else {
      need(typeof e.answer === 'string' && e.answer.trim().length >= 2, `${tag} 缺少 answer 结论`);
    }
    const so = e.solution || {};
    checkText(`${tag}.solution.idea`, so.idea, 8, issues, `${tag}.idea`);
    need(Array.isArray(so.steps) && so.steps.length >= 2, `${tag} steps 至少 2 步`);
    (so.steps || []).forEach((s, si) => {
      if (stripTags(s).length < 4) issues.push(`${tag}.steps[${si}] 太短`);
    });
    checkText(`${tag}.solution.result`, so.result, 4, issues, `${tag}.result`);
    need(Array.isArray(so.pitfalls) && so.pitfalls.length >= 1, `${tag} 需要至少 1 条 pitfalls`);
    checkText(`${tag}.solution.kid`, so.kid, 60, issues, `${tag}.kid`);
    if (e.type === 'code') {
      const c = e.code || {};
      need(typeof c.lang === 'string' && c.lang.length >= 1, `${tag} code.lang 缺失`);
      need(typeof c.code === 'string' && c.code.length >= 10, `${tag} code.code 缺失或太短`);
      need(typeof c.output === 'string' && c.output.length >= 1, `${tag} code.output 缺失`);
      need(typeof c.explain === 'string' && stripTags(c.explain).length >= 10, `${tag} code.explain 太短`);
    }
  });
  if (!(cnt.easy >= 3 && cnt.easy <= 5)) issues.push(`easy 题数 ${cnt.easy} 应在 3-5`);
  if (!(cnt.medium >= 3 && cnt.medium <= 5)) issues.push(`medium 题数 ${cnt.medium} 应在 3-5`);
  if (!(cnt.hard >= 1 && cnt.hard <= 3)) issues.push(`hard 题数 ${cnt.hard} 应在 1-3`);
  if (typeCnt.choice < 2) issues.push(`选择题应 ≥2（当前 ${typeCnt.choice}）`);
  if (typeCnt.judge < 1) issues.push(`判断题应 ≥1（当前 ${typeCnt.judge}）`);
  if (typeCnt.derive + typeCnt.design < 2) issues.push(`推导/设计题应 ≥2（当前 ${typeCnt.derive + typeCnt.design}）`);
  if (typeCnt.code < 1 && typeCnt.design + typeCnt.open < 2) issues.push('缺少动手/设计类题目（code≥1 或 design+open≥2）');
  const distinct = new Set(ex.map((e) => e.type)).size;
  if (distinct < 3) issues.push(`题型种类应 ≥3（当前 ${distinct}）`);
}

function validateFile(file) {
  const issues = [];
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { file, ok: false, issues: ['JSON 解析失败：' + e.message] };
  }
  if (data && Array.isArray(data.units)) validateCourse(data, file, issues);
  else if (data && Array.isArray(data.exercises)) validateChapter(data, file, issues);
  else issues.push('无法识别文件类型（既不是 course.json 也不是章节 json）');
  return { file, ok: issues.length === 0, issues };
}

function listCourseFiles(courseId) {
  const dir = path.join(COURSES_DIR, courseId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f)).sort();
}

function main() {
  const args = process.argv.slice(2);
  let files = [];
  if (args[0] === '--course') {
    const cid = args[1];
    files = listCourseFiles(cid);
    if (!files.length) { console.error(`[error] 课程目录不存在或无 json：${cid}`); process.exit(2); }
  } else if (args[0] === '--all') {
    const mf = JSON.parse(fs.readFileSync(path.join(COURSES_DIR, 'manifest.json'), 'utf8'));
    mf.courses.forEach((c) => files.push(...listCourseFiles(c.id)));
  } else if (args.length) {
    files = args;
  } else {
    console.error('用法：node tools/validate-content.js <file...> | --course <id> | --all');
    process.exit(2);
  }
  let fail = 0; let pass = 0;
  const allIssues = [];
  files.forEach((f) => {
    const r = validateFile(path.resolve(f));
    if (r.ok) { pass++; log(`PASS  ${path.relative(ROOT, r.file)}`); }
    else {
      fail++;
      log(`FAIL  ${path.relative(ROOT, r.file)}`);
      r.issues.forEach((m) => { log(`      - ${m}`); allIssues.push(`${path.relative(ROOT, r.file)} :: ${m}`); });
    }
  });
  log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 / 共 ${files.length} =====`);
  if (fail) {
    log('失败明细可复制给修复流程。');
    process.exit(1);
  }
}

main();
