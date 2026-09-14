#!/usr/bin/env node
/* ============================================================================
 * audit.js — 内容覆盖审计：生成覆盖矩阵与审计报告
 * 用法：node tools/audit.js
 * 产出：
 *   docs/coverage-matrix.csv   —— 逐章覆盖矩阵（字/题/难度分布/演示/状态）
 *   docs/audit-report.json     —— 汇总审计（覆盖、双讲解齐全率、题分布、缺口清单）
 * 退出码：存在缺口或校验失败时为 1，否则 0
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const COURSES_DIR = path.join(CONTENT, 'courses');
const DEMOS_DIR = path.join(CONTENT, 'demos');
const DOCS_DIR = path.join(ROOT, 'docs');

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const rel = (f) => path.relative(ROOT, f);

function main() {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const manifest = readJSON(path.join(COURSES_DIR, 'manifest.json'), { courses: [] });
  const demosManifest = readJSON(path.join(DEMOS_DIR, 'manifest.json'), { demos: [] });
  const demoIds = new Set((demosManifest.demos || []).map((d) => d.id));

  /* 1) 跑结构校验（复用 validate-content.js） */
  let validationOutput = '';
  let validationOk = true;
  try {
    validationOutput = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'validate-content.js'), '--all'], { encoding: 'utf8' });
  } catch (e) {
    validationOk = false;
    validationOutput = String(e.stdout || '') + String(e.stderr || '');
  }

  /* 2) 逐章扫描 */
  const rows = [['课程', '单元', '章节', '标题', 'pro字数', 'kid字数', '节数(pro/kid)', '题数', '简单', '中等', '困难', '题型数', '演示', 'SVG', '状态']];
  const summary = {
    generatedAt: Date.now(),
    courses: 0, chapters: 0, chaptersLoaded: 0, chaptersMissing: [],
    exercises: 0, words: 0,
    dualTrackComplete: 0, dualTrackPct: 0,
    levels: { easy: 0, medium: 0, hard: 0 },
    typeCounts: {},
    filesInvalid: [],
    demoFilesMissing: [],
    validationOk,
  };
  let badChapters = [];
  try {
    const out = validationOutput;
    badChapters = out.split('\n').filter((l) => l.startsWith('FAIL')).map((l) => l.trim());
  } catch (e) { /* ignore */ }

  manifest.courses.forEach((c) => {
    summary.courses++;
    const courseJson = readJSON(path.join(COURSES_DIR, c.id, 'course.json'), null);
    if (!courseJson) { summary.chaptersMissing.push(c.id + '/course.json'); return; }
    (courseJson.units || []).forEach((u) => {
      (u.chapters || []).forEach((ch) => {
        summary.chapters++;
        const chFile = path.join(COURSES_DIR, c.id, ch.id + '.json');
        const d = readJSON(chFile, null);
        const row = [c.title, u.title, ch.id, ch.title, '', '', '', '', '', '', '', '', '', '', ''];
        if (!d) {
          summary.chaptersMissing.push(c.id + '/' + ch.id);
          row[14] = '缺失';
          rows.push(row);
          return;
        }
        summary.chaptersLoaded++;
        const proSec = (d.pro && d.pro.sections) || [];
        const kidSec = (d.kid && d.kid.sections) || [];
        const proLen = stripTags((d.pro && d.pro.intro) || '').length + proSec.reduce((a, s) => a + stripTags(s.html).length, 0);
        const kidLen = stripTags((d.kid && d.kid.intro) || '').length + kidSec.reduce((a, s) => a + stripTags(s.html).length, 0);
        const ex = d.exercises || [];
        const lv = { easy: 0, medium: 0, hard: 0 };
        const types = new Set();
        ex.forEach((e) => { if (lv[e.level] !== undefined) lv[e.level]++; types.add(e.type); summary.typeCounts[e.type] = (summary.typeCounts[e.type] || 0) + 1; });
        summary.exercises += ex.length;
        summary.words += proLen + kidLen;
        summary.levels.easy += lv.easy; summary.levels.medium += lv.medium; summary.levels.hard += lv.hard;
        const svg = /<svg/i.test(JSON.stringify(d)) ? '有' : '无';
        const demos = (d.demoRefs || []).filter((x) => demoIds.has(x));
        row[4] = proLen; row[5] = kidLen;
        row[6] = proSec.length + '/' + kidSec.length;
        row[7] = ex.length; row[8] = lv.easy; row[9] = lv.medium; row[10] = lv.hard;
        row[11] = types.size; row[12] = demos.join('+') || '—'; row[13] = svg;
        const dualOk = proSec.length > 0 && proSec.length === kidSec.length && proLen >= 1100 && kidLen >= 750;
        if (dualOk) summary.dualTrackComplete++;
        row[14] = dualOk ? 'OK' : '待查';
        rows.push(row);
      });
    });
  });
  summary.dualTrackPct = summary.chaptersLoaded ? (summary.dualTrackComplete / summary.chaptersLoaded) : 0;

  /* 3) 演示文件检查 */
  (demosManifest.demos || []).forEach((d) => {
    const jsFile = path.join(ROOT, 'js', 'demos', d.id + '.js');
    if (!fs.existsSync(jsFile)) summary.demoFilesMissing.push(d.id);
  });

  /* 4) 写出 */
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  fs.writeFileSync(path.join(DOCS_DIR, 'coverage-matrix.csv'), '\uFEFF' + csv);
  fs.writeFileSync(path.join(DOCS_DIR, 'audit-report.json'), JSON.stringify(summary, null, 2));

  /* 5) 控制台摘要 */
  console.log('====== 覆盖审计 ======');
  console.log('课程: ' + summary.courses + ' 门；章节: ' + summary.chaptersLoaded + '/' + summary.chapters + ' 已落盘');
  console.log('双讲解齐全率: ' + (summary.dualTrackPct * 100).toFixed(1) + '% (' + summary.dualTrackComplete + '/' + summary.chaptersLoaded + ')');
  console.log('习题: ' + summary.exercises + ' 道（简单 ' + summary.levels.easy + ' / 中等 ' + summary.levels.medium + ' / 困难 ' + summary.levels.hard + '）');
  console.log('正文字数: 约 ' + (summary.words / 10000).toFixed(1) + ' 万字');
  console.log('结构校验: ' + (validationOk ? '全部通过' : '存在 FAIL（详见 validate --all 输出）'));
  if (summary.chaptersMissing.length) console.log('缺失章节/文件 (' + summary.chaptersMissing.length + '): ' + summary.chaptersMissing.slice(0, 40).join(', ') + (summary.chaptersMissing.length > 40 ? ' …' : ''));
  if (summary.demoFilesMissing.length) console.log('缺失演示脚本 (' + summary.demoFilesMissing.length + '): ' + summary.demoFilesMissing.join(', '));
  console.log('已写出: docs/coverage-matrix.csv, docs/audit-report.json');

  const gap = summary.chaptersMissing.length || summary.demoFilesMissing.length || !validationOk;
  process.exit(gap ? 1 : 0);
}

main();
