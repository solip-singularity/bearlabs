#!/usr/bin/env node
/* ============================================================================
 * build.js — 内容构建：生成统计与搜索索引
 * 用法：node tools/build.js
 * 产出：
 *   content/stats.json         —— 首页统计数据（课程/章节/题量/字数/演示数）
 *   content/search-index.json  —— 客户端搜索索引
 * ==========================================================================*/
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT = path.join(ROOT, 'content');
const COURSES_DIR = path.join(CONTENT, 'courses');
const DEMOS_DIR = path.join(CONTENT, 'demos');

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };

function main() {
  const manifest = readJSON(path.join(COURSES_DIR, 'manifest.json'), { courses: [] });
  const demosManifest = readJSON(path.join(DEMOS_DIR, 'manifest.json'), { demos: [] });

  const stats = {
    updatedAt: Date.now(),
    courses: manifest.courses.length,
    chapters: 0,
    chaptersLoaded: 0,
    exercises: 0,
    demos: (demosManifest.demos || []).length,
    words: 0,
    perCourse: {},
    missing: [],
  };
  const search = [];

  manifest.courses.forEach((c) => {
    const courseJson = readJSON(path.join(COURSES_DIR, c.id, 'course.json'), null);
    const per = { title: c.title, level: c.level || '', chapters: 0, loaded: 0, exercises: 0, words: 0, minutes: 0 };
    if (courseJson) {
      (courseJson.units || []).forEach((u) => (u.chapters || []).forEach((ch) => {
        per.chapters++;
        if (ch.minutes) per.minutes += ch.minutes;
        const chFile = path.join(COURSES_DIR, c.id, ch.id + '.json');
        const chData = readJSON(chFile, null);
        if (!chData) { stats.missing.push(c.id + '/' + ch.id); per.missing = (per.missing || 0) + 1; return; }
        per.loaded++;
        const ex = chData.exercises || [];
        per.exercises += ex.length;
        let words = 0;
        const pro = (chData.pro && chData.pro.sections) || [];
        const kid = (chData.kid && chData.kid.sections) || [];
        pro.forEach((s) => { words += stripTags(s.html).length; });
        kid.forEach((s) => { words += stripTags(s.html).length; });
        words += stripTags((chData.pro && chData.pro.intro) || '').length;
        words += stripTags((chData.kid && chData.kid.intro) || '').length;
        per.words += words;
        search.push({
          t: chData.title,
          s: c.title + ' · ' + (u.title || ''),
          u: '#/chapter/' + c.id + '/' + ch.id,
          k: [(chData.keywords || []).join(' '), chData.objective || ''].join(' '),
        });
      }));
    }
    stats.chapters += per.chapters;
    stats.chaptersLoaded += per.loaded;
    stats.exercises += per.exercises;
    stats.words += per.words;
    stats.perCourse[c.id] = per;
    search.unshift({ t: c.title, s: '课程 · ' + (c.level || ''), u: '#/course/' + c.id, k: [c.title, c.short || '', c.level || ''].join(' ') });
  });

  fs.writeFileSync(path.join(CONTENT, 'stats.json'), JSON.stringify(stats, null, 2));
  fs.writeFileSync(path.join(CONTENT, 'search-index.json'), JSON.stringify(search));

  console.log('构建完成：');
  console.log('  课程 ' + stats.courses + ' 门，章节 ' + stats.chaptersLoaded + '/' + stats.chapters + ' 已落盘');
  console.log('  习题 ' + stats.exercises + ' 道，正文累计约 ' + (stats.words / 10000).toFixed(1) + ' 万字');
  console.log('  演示 ' + stats.demos + ' 个');
  if (stats.missing.length) {
    console.log('  缺口章节（' + stats.missing.length + '）：' + stats.missing.slice(0, 30).join(', ') + (stats.missing.length > 30 ? ' …' : ''));
  }
}

main();
