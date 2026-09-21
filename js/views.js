/* ============================================================================
 * views.js — 全部视图：首页 / 路径 / 课程 / 章节 / 演示 / 练习 / 进度 / 管理
 * 每个视图返回 { el, title, onMount?, cleanup? }
 * ==========================================================================*/
'use strict';
var Views = (function () {
  const { el, $, $$, escapeHtml, sanitize, fmtDuration, fmtPct, fmtDate, icon, toast, modal, confirmDialog, download } = U;

  const LEVEL_LABEL = { easy: '简单', medium: '中等', hard: '困难' };
  const TYPE_LABEL = { choice: '选择题', judge: '判断题', derive: '推导题', design: '设计题', code: '编程题', open: '思考题' };

  /* ══ 数据访问层 ═══════════════════════════════════════════════════ */
  const Data = (function () {
    const cache = new Map();
    async function fetchJSON(path) {
      if (cache.has(path)) return cache.get(path);
      const p = (async () => {
        const r = await fetch(path, { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + path);
        return r.json();
      })();
      cache.set(path, p);
      try { return await p; } catch (e) { cache.delete(path); throw e; }
    }
    const manifest = () => fetchJSON('content/courses/manifest.json');
    const course = (id) => fetchJSON('content/courses/' + id + '/course.json');
    const chapter = (cid, ch) => fetchJSON('content/courses/' + cid + '/' + ch + '.json');
    const demosManifest = () => fetchJSON('content/demos/manifest.json');
    const demoMeta = (id) => fetchJSON('content/demos/' + id + '.json').catch(() => null);
    const stats = () => fetchJSON('content/stats.json').catch(() => null);
    const searchIndex = () => fetchJSON('content/search-index.json').catch(() => null);
    async function allCourses() {
      const mf = await manifest();
      const list = await Promise.all(mf.courses.map(async (c) => {
        try { const cj = await course(c.id); return Object.assign({}, c, cj, { _loaded: true }); }
        catch (e) { return Object.assign({}, c, { _loaded: false }); }
      }));
      return { manifest: mf, courses: list };
    }
    const flatten = (course) => {
      const out = [];
      (course.units || []).forEach((u) => (u.chapters || []).forEach((ch) => out.push({ unit: u, chapter: ch })));
      return out;
    };
    const chapterIndex = (course, chId) => flatten(course).findIndex((x) => x.chapter.id === chId);
    return { fetchJSON, manifest, course, chapter, demosManifest, demoMeta, stats, searchIndex, allCourses, flatten, chapterIndex };
  })();

  /* ══ 通用组件 ═════════════════════════════════════════════════════ */
  function errorBox(err, retry) {
    const box = el('div', { class: 'empty error' });
    box.appendChild(el('div', { class: 'empty-title', text: '内容加载失败' }));
    box.appendChild(el('p', { class: 'small', text: String(err && err.message || err) }));
    if (retry) box.appendChild(el('button', { class: 'btn btn-secondary mt-4', type: 'button', text: '重试', onclick: retry }));
    return box;
  }
  function loadingBlock(text) {
    const box = el('div', { class: 'stack', style: undefined });
    box.appendChild(el('div', { class: 'skeleton skeleton-card', style: undefined }));
    box.appendChild(el('p', { class: 'muted small mt-3', text: text || '正在加载…' }));
    return box;
  }
  function breadcrumbs(items) {
    const nav = el('nav', { class: 'breadcrumbs', 'aria-label': '面包屑' });
    items.forEach((it, i) => {
      if (i > 0) nav.appendChild(el('span', { class: 'muted', text: '/' }));
      if (it.href) nav.appendChild(el('a', { href: it.href, text: it.text }));
      else nav.appendChild(el('span', { text: it.text }));
    });
    return nav;
  }
  function courseIcon(c) {
    const span = el('span', { class: 'course-icon' });
    span.innerHTML = c.icon || icon('book');
    return span;
  }
  function levelChip(c) {
    const map = { '本科基础': 'var(--sand-ink)', '本科核心': 'var(--accent-strong)', '研究生入门': 'var(--link)' };
    const badge = el('span', { class: 'levelbadge' });
    badge.appendChild(el('span', { class: 'lb-dot' }));
    badge.lastChild.setAttribute('style', 'background:' + (map[c.level] || 'var(--muted)'));
    badge.appendChild(el('span', { text: c.level || '' }));
    return badge;
  }
  function progressBar(pct, gold) {
    const bar = el('div', { class: 'progressbar' + (gold ? ' gold' : '') });
    bar.appendChild(el('i'));
    bar.firstChild.setAttribute('style', 'width:' + Math.round(pct * 100) + '%');
    return bar;
  }
  function progressRing(pct) {
    const size = 84, r = 34, c = 2 * Math.PI * r;
    const wrap = el('div', { class: 'progress-ring' });
    wrap.innerHTML = '<svg viewBox="0 0 84 84" aria-hidden="true">' +
      '<circle class="ring-bg" cx="42" cy="42" r="' + r + '"></circle>' +
      '<circle class="ring-fg" cx="42" cy="42" r="' + r + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - Math.min(1, pct))).toFixed(1) + '"></circle></svg>';
    wrap.appendChild(el('span', { class: 'ring-label', text: Math.round(pct * 100) + '%' }));
    return wrap;
  }
  function statTile(num, label) {
    const t = el('div', { class: 'stat-tile' });
    t.appendChild(el('div', { class: 'st-num', text: num }));
    t.appendChild(el('div', { class: 'st-label', text: label }));
    return t;
  }
  function difficultyDots(level) {
    const d = el('span', { class: 'difficulty', dataset: { level: String(level) } });
    [1, 2, 3].forEach(() => d.appendChild(el('span', { class: 'dot' })));
    d.appendChild(el('span', { class: 'dl-label', text: level === 1 ? '入门' : level === 2 ? '进阶' : '挑战' }));
    return d;
  }
  function courseCard(c, opts) {
    opts = opts || {};
    const chapterIds = c._loaded ? Data.flatten(c).map((x) => x.chapter.id) : [];
    const prog = chapterIds.length ? Store.courseProgress(chapterIds) : { done: 0, total: 0, pct: 0 };
    const a = el(c._loaded ? 'a' : 'div', { class: 'card card-hover course-card' });
    if (c._loaded) a.setAttribute('href', '#/course/' + c.id);
    else a.setAttribute('aria-disabled', 'true');
    const top = el('div', { class: 'cc-top' });
    top.appendChild(courseIcon(c));
    top.appendChild(levelChip(c));
    a.appendChild(top);
    a.appendChild(el('div', { class: 'cc-title', text: (opts.step ? opts.step + '. ' : '') + c.title }));
    a.appendChild(el('div', { class: 'cc-sub', text: c._loaded ? (c.subtitle || '') : '内容编写中，敬请期待' }));
    const foot = el('div', { class: 'cc-foot' });
    if (c._loaded) {
      foot.appendChild(el('span', { text: Data.flatten(c).length + ' 讲' }));
      foot.appendChild(el('span', { text: '约 ' + (c.hours || '—') + ' 小时' }));
      if (prog.done > 0) foot.appendChild(el('span', { class: 'chip chip-accent', text: '已学 ' + prog.done + '/' + prog.total }));
    } else {
      foot.appendChild(el('span', { class: 'chip chip-plain', text: '编写中' }));
    }
    a.appendChild(foot);
    if (c._loaded && prog.total) a.appendChild(progressBar(prog.pct));
    return a;
  }

  /* ══ 习题渲染（章节页与练习中心共用） ════════════════════════════ */
  function stripOptionPrefix(s) { return String(s).replace(/^[A-Fa-f][.．、:：]?\s*/, ''); }
  function solPart(label, bodyNode) {
    const row = el('div', { class: 'sol-part' });
    row.appendChild(el('div', { class: 'sp-label', text: label }));
    const body = el('div', { class: 'sp-body' });
    body.appendChild(bodyNode);
    row.appendChild(body);
    return row;
  }
  function renderExercise(ex, opts) {
    opts = opts || {};
    const state = (Store.load(), (Store.get().exercises || {})[ex.id] || {});
    const item = el('li', { class: 'quiz-item', dataset: { id: ex.id, level: ex.level } });

    /* 头部 */
    const head = el('div', { class: 'quiz-head' });
    head.appendChild(el('span', { class: 'chip badge-' + ex.level, text: LEVEL_LABEL[ex.level] || ex.level }));
    head.appendChild(el('span', { class: 'chip chip-plain', text: TYPE_LABEL[ex.type] || ex.type }));
    if (state.attempts) head.appendChild(el('span', { class: 'chip chip-plain', text: '已练 ' + state.attempts + ' 次' }));
    if (state.mastered) head.appendChild(el('span', { class: 'chip good', text: '已掌握' }));
    else if (state.lastCorrect === false || state.needsReview) head.appendChild(el('span', { class: 'chip bad', text: '待复习' }));
    item.appendChild(head);

    /* 题干 */
    item.appendChild(el('div', { class: 'quiz-stem', html: sanitize(ex.stem) }));

    /* 解答区（可折叠） */
    const solWrap = el('details', { class: 'disclosure quiz-solution-wrap' });
    solWrap.appendChild(el('summary', { text: '查看完整解答' }));
    const sol = el('div', { class: 'quiz-solution' });
    const block = el('div', { class: 'sol-block' });
    block.appendChild(solPart('思路', el('div', { html: sanitize(ex.solution.idea) })));
    const stepsOl = el('ol');
    (ex.solution.steps || []).forEach((s) => stepsOl.appendChild(el('li', { html: sanitize(s) })));
    block.appendChild(solPart('步骤', stepsOl));
    block.appendChild(solPart('结果', el('div', { html: sanitize(ex.solution.result) })));
    const pitUl = el('ul');
    (ex.solution.pitfalls || []).forEach((s) => pitUl.appendChild(el('li', { html: sanitize(s) })));
    block.appendChild(solPart('常见错误', pitUl));
    if (ex.code) {
      const codeBox = el('div', { class: 'sol-code' });
      codeBox.appendChild(el('pre', { html: '<code>' + escapeHtml(ex.code.code) + '</code>' }));
      codeBox.appendChild(el('div', { class: 'meta mt-2', text: '运行结果：' }));
      codeBox.appendChild(el('div', { class: 'sc-out', text: ex.code.output || '' }));
      codeBox.appendChild(el('p', { class: 'small mt-2', html: sanitize(ex.code.explain || '') }));
      block.appendChild(solPart('代码', codeBox));
    }
    sol.appendChild(block);
    const kidDet = el('details', { class: 'disclosure' });
    kidDet.appendChild(el('summary', { text: '零基础也能懂的说明' }));
    kidDet.appendChild(el('div', { class: 'sol-part' }, [el('div', {}), el('div', { class: 'kidbox', html: sanitize(ex.solution.kid) })]));
    sol.appendChild(kidDet);
    solWrap.appendChild(sol);
    item.appendChild(solWrap);

    /* 作答区 */
    const actions = el('div', { class: 'quiz-actions' });
    if (ex.type === 'choice' || ex.type === 'judge') {
      const optWrap = el('div', { class: 'quiz-options', role: 'group', 'aria-label': '选项' });
      const isJudge = ex.type === 'judge';
      const opts2 = isJudge ? ['正确', '错误'] : (ex.options || []).map((o) => String(o).trim());
      const keys = isJudge ? ['对', '错'] : ['A', 'B', 'C', 'D', 'E', 'F'];
      const correctIdx = isJudge
        ? opts2.indexOf(String(ex.answer).trim())
        : Math.max(0, keys.indexOf(String(ex.answer).trim()[0]));
      let selected = -1, locked = false;
      const btns = opts2.map((text, i) => {
        const b = el('button', { class: 'quiz-option', type: 'button', 'aria-pressed': 'false' });
        b.appendChild(el('span', { class: 'qo-key', text: keys[i] }));
        b.appendChild(el('span', { class: 'qo-text', text: isJudge ? text : stripOptionPrefix(text) }));
        b.addEventListener('click', () => {
          if (locked) return;
          selected = i;
          btns.forEach((x, j) => x.setAttribute('aria-pressed', j === i ? 'true' : 'false'));
          submitBtn.disabled = false;
        });
        return b;
      });
      btns.forEach((b) => optWrap.appendChild(b));
      item.insertBefore(optWrap, solWrap);
      const submitBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '提交答案', disabled: true, onclick: onSubmit });
      const resetBtn = el('button', { class: 'btn btn-secondary btn-sm hidden', type: 'button', text: '再试一次', onclick: onReset });
      let feedback = null;
      actions.appendChild(submitBtn);
      actions.appendChild(resetBtn);
      item.appendChild(actions);
      function onSubmit() {
        if (locked || selected < 0) return;
        locked = true;
        submitBtn.disabled = true;
        const pick = isJudge ? opts2[selected] : keys[selected];
        const correct = isJudge ? (pick === String(ex.answer).trim()) : (pick === String(ex.answer).trim()[0]);
        btns.forEach((b, j) => {
          if (j === selected) b.classList.add(correct ? 'is-correct' : 'is-wrong');
          if (!correct && j === correctIdx) b.classList.add('is-correct');
        });
        Store.recordAnswer(ex.id, correct, pick);
        feedback = el('span', { class: 'quiz-status ' + (correct ? 'ok' : 'bad'), text: correct ? '回答正确！' : ('回答错误。正确答案：' + (isJudge ? ex.answer : (String(ex.answer).trim() + '（' + stripOptionPrefix(opts2[correctIdx] || '') + '）'))) });
        actions.insertBefore(feedback, submitBtn);
        resetBtn.classList.remove('hidden');
        solWrap.open = true;
        if (opts.onChange) opts.onChange();
      }
      function onReset() {
        locked = false; selected = -1;
        btns.forEach((b) => { b.classList.remove('is-correct'); b.classList.remove('is-wrong'); b.setAttribute('aria-pressed', 'false'); });
        if (feedback) { feedback.remove(); feedback = null; }
        resetBtn.classList.add('hidden');
        submitBtn.disabled = true;
        solWrap.open = false;
        if (opts.onChange) opts.onChange();
      }
    } else {
      /* 推导 / 设计 / 编程 / 思考题：先自己写，再看解答，再自我评估 */
      const hint = el('p', { class: 'small muted', text: '建议先在纸上或编辑器里写下自己的答案，再对照下方完整解答。' });
      actions.appendChild(hint);
      const learnBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '我学会了', onclick: () => { Store.selfAssess(ex.id, true); toast('已标记掌握', 'success'); rebuildChips(); } });
      const reviewBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '还需要复习', onclick: () => { Store.markNeedsReview(ex.id, true); toast('已加入错题本'); rebuildChips(); } });
      const self = el('div', { class: 'self-check hidden' });
      self.appendChild(el('span', { class: 'small muted', text: '学会了就点亮它：', style: undefined }));
      self.appendChild(learnBtn);
      self.appendChild(reviewBtn);
      item.appendChild(actions);
      item.appendChild(self);
      solWrap.addEventListener('toggle', () => {
        if (solWrap.open) self.classList.remove('hidden');
      });
      function rebuildChips() {
        const st = (Store.load(), (Store.get().exercises || {})[ex.id] || {});
        $$('.chip.good, .chip.bad', head).forEach((n) => n.remove());
        if (st.mastered) head.appendChild(el('span', { class: 'chip good', text: '已掌握' }));
        else if (st.needsReview) head.appendChild(el('span', { class: 'chip bad', text: '待复习' }));
        if (opts.onChange) opts.onChange();
      }
    }
    return item;
  }

  /* ══ 首页 ═════════════════════════════════════════════════════════ */
  async function home() {
    const elRoot = el('div', { class: 'view view-home' });
    const hero = el('section', { class: 'section hero' });
    const hc = el('div', { class: 'container hero-split' });
    const left = el('div');
    left.appendChild(el('p', { class: 'eyebrow', text: 'COMPUTER SCIENCE · 交互式学习' }));
    left.appendChild(el('p', { class: 'brand-line', text: '贝尔实验室（Bearlabs）· 计算机知识学习站 · 从入门到入坟' }));
    left.appendChild(el('h1', { text: '从 0 和 1，到会思考的机器。' }));
    left.appendChild(el('p', { class: 'lead', text: '11 门课程、116 讲计算机知识：每讲都有「专业版 + 宝宝巴士版」双讲解、三档难度习题与完整解答；进程调度、TCP 握手、指针、排序、多态……全都能亲手玩着学。' }));
    const cta = el('div', { class: 'hero-cta' });
    cta.appendChild(el('a', { class: 'btn btn-primary btn-lg', href: '#/paths', text: '选择一条学习路径' }));
    cta.appendChild(el('a', { class: 'btn btn-secondary btn-lg', href: '#/demos', text: '先玩交互演示' }));
    left.appendChild(cta);
    hc.appendChild(left);
    const right = el('div', { class: 'hero-visual' });
    const panel = el('div', { class: 'hero-panel' });
    const ph = el('div', { class: 'hp-head' });
    ['', '', ''].forEach(() => ph.appendChild(el('span', { class: 'hp-dot' })));
    panel.appendChild(ph);
    const pb = el('div', { class: 'hp-body' });
    pb.appendChild(el('div', { class: 'small muted', text: '第1讲 · 什么是面向对象' }));
    pb.appendChild(el('div', { class: 'segmented mt-3' }, [
      el('button', { type: 'button', 'aria-pressed': 'true', text: '专业版' }),
      el('button', { type: 'button', 'aria-pressed': 'false', text: '宝宝巴士版' }),
    ]));
    pb.appendChild(el('p', { class: 'small mt-3', text: '“对象就像一只聪明的小书包：里面装着东西（属性），它自己还会干活（方法）。”' }));
    pb.appendChild(progressBar(0.42));
    pb.appendChild(el('div', { class: 'meta mt-2', text: '学习进度 42% · 20 道习题已练 · 2 个演示已解锁' }));
    panel.appendChild(pb);
    const bannerWrap = el('div', { class: 'hero-banner-wrap' }, [
      el('span', { class: 'hero-banner-glow', 'aria-hidden': 'true' }),
      el('div', { class: 'hero-banner' }, [
        el('img', { class: 'hero-banner-img', src: 'assets/brand-hero.png?v=1f8c93d2', alt: '贝尔实验室 Bearlabs', loading: 'eager' }),
      ]),
    ]);
    right.appendChild(bannerWrap);
    right.appendChild(panel);
    right.appendChild(el('div', { class: 'hero-float', text: '11 门课程 · 116 讲 · 16 个可动手演示' }));
    hc.appendChild(right);
    hero.appendChild(hc);
    elRoot.appendChild(hero);

    /* 统计与课程 */
    let statsData = null; let all = null;
    try { statsData = await Data.stats(); } catch (e) { /* ignore */ }
    try { all = await Data.allCourses(); } catch (e) { /* ignore */ }
    const sec = el('section', { class: 'section' });
    const cont = el('div', { class: 'container' });
    const grid = el('div', { class: 'grid-4' });
    if (statsData) {
      grid.appendChild(statTile(String(statsData.courses || 11), '门课程'));
      grid.appendChild(statTile(String(statsData.chapters || '116'), '讲内容'));
      grid.appendChild(statTile(String(statsData.exercises || '1160') + '+', '道习题'));
      grid.appendChild(statTile(String(statsData.demos || '16'), '个交互演示'));
    } else {
      grid.appendChild(statTile('11', '门课程'));
      grid.appendChild(statTile('116', '讲内容'));
      grid.appendChild(statTile('1160+', '道习题'));
      grid.appendChild(statTile('16', '个交互演示'));
    }
    cont.appendChild(grid);
    if (all) {
      cont.appendChild(el('div', { class: 'row-between mt-12' }, [
        el('div', {}, [el('p', { class: 'eyebrow', text: '课程目录' }), el('h2', { text: '十一门课，从入门到研究生导读' })]),
        el('a', { class: 'btn btn-ghost', href: '#/courses', text: '查看全部 →' }),
      ]));
      const cg = el('div', { class: 'grid-cards mt-6' });
      all.courses.slice(0, 6).forEach((c) => cg.appendChild(courseCard(c)));
      cont.appendChild(cg);
      const paths = el('div', { class: 'mt-12' });
      paths.appendChild(el('p', { class: 'eyebrow', text: '学习路径' }));
      paths.appendChild(el('h2', { text: '不知道从哪开始？跟着路径走' }));
      const pg = el('div', { class: 'grid-3 mt-6' });
      all.manifest.paths.forEach((p) => {
        const card = el('div', { class: 'card path-card' });
        card.appendChild(el('div', { class: 'cc-title', text: p.title }));
        card.appendChild(el('div', { class: 'cc-sub', text: p.description }));
        const steps = el('div', { class: 'path-steps mt-2' });
        p.courses.forEach((cid, i) => {
          const c = all.courses.find((x) => x.id === cid);
          steps.appendChild(el('a', { class: 'ps-node', href: '#/course/' + cid, text: (c ? c.title : cid) }));
          if (i < p.courses.length - 1) steps.appendChild(el('span', { class: 'ps-arrow', text: '→' }));
        });
        card.appendChild(steps);
        pg.appendChild(card);
      });
      paths.appendChild(pg);
      cont.appendChild(paths);
    }
    sec.appendChild(cont);
    elRoot.appendChild(sec);

    /* 特色 */
    const feat = el('section', { class: 'section' });
    const fc = el('div', { class: 'container' });
    fc.appendChild(el('p', { class: 'eyebrow', text: '为什么这样学' }));
    fc.appendChild(el('h2', { text: '同一节课，两种讲法；学完立刻动手。' }));
    const fg = el('div', { class: 'grid-4 mt-8' });
    [
      ['book', '双版本讲解', '专业版讲术语、定义与推导；宝宝巴士版用生活类比讲清同一批知识，一键切换、位置不丢。'],
      ['list', '三级习题 + 完整解答', '每讲 10 题（简单/中等/困难）：思路 → 步骤 → 结果 → 常见错误 → 零基础说明，全部展开讲透。'],
      ['flask', '可动手的交互演示', '调度、握手、指针、排序、多态、编译、流水线……调参数、单步走、看结果，一步步自己操作。'],
      ['chart', '学习台账', '进度、得分、错题本、学习时长自动记录；刷新不丢、可导出备份，可选账号同步。'],
    ].forEach(([ic, t, d]) => {
      const card = el('div', { class: 'card' });
      const mark = el('div', { class: 'course-icon' });
      mark.innerHTML = icon(ic);
      card.appendChild(mark);
      card.appendChild(el('h3', { class: 'mt-3', text: t }));
      card.appendChild(el('p', { class: 'cc-sub mt-2', text: d }));
      fg.appendChild(card);
    });
    fc.appendChild(fg);
    fc.appendChild(el('div', { class: 'text-center mt-12' }, [
      el('a', { class: 'btn btn-primary btn-lg', href: '#/courses', text: '从第一门课开始' }),
    ]));
    feat.appendChild(fc);
    elRoot.appendChild(feat);
    return { el: elRoot, title: '贝尔实验室' };
  }

  /* ══ 学习路径 ═════════════════════════════════════════════════════ */
  async function paths() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container', style: undefined });
    c.appendChild(el('h1', { text: '学习路径' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '四条路径覆盖不同起点与目标：完全零基础、本科主线、研究生导读、大厂冲刺。每条路径内按顺序学最省力。' }));
    const all = await Data.allCourses();
    all.manifest.paths.forEach((p) => {
      const sec = el('section', { class: 'path-section' });
      const head = el('div', { class: 'path-head' });
      head.appendChild(el('p', { class: 'eyebrow', text: p.subtitle || '' }));
      head.appendChild(el('h2', { text: p.title }));
      head.appendChild(el('p', { class: 'lead mt-2', text: p.description }));
      sec.appendChild(head);
      const road = el('div', { class: 'path-road' });
      p.courses.forEach((cid, i) => {
        const course = all.courses.find((x) => x.id === cid);
        if (course) road.appendChild(courseCard(course, { step: i + 1 }));
      });
      sec.appendChild(road);
      c.appendChild(sec);
    });
    root.appendChild(c);
    return { el: root, title: '学习路径' };
  }

  /* ══ 课程目录 ═════════════════════════════════════════════════════ */
  async function courses() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container' });
    c.appendChild(el('h1', { text: '课程目录' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '11 门课程：本科核心、研究生导读与大厂面试冲刺。每门课标注难度与预计学时。' }));
    const all = await Data.allCourses();
    const filterWrap = el('div', { class: 'exercise-filters mt-4' });
    const grid = el('div', { class: 'grid-cards mt-4' });
    const levels = ['全部', '本科基础', '本科核心', '研究生入门'];
    let current = '全部';
    function renderGrid() {
      grid.innerHTML = '';
      all.courses.filter((x) => current === '全部' || x.level === current).forEach((x) => grid.appendChild(courseCard(x)));
    }
    levels.forEach((lv) => {
      const chip = el('button', { class: 'filter-chip', type: 'button', text: lv, 'aria-pressed': lv === current });
      chip.addEventListener('click', () => {
        current = lv;
        $$('.filter-chip', filterWrap).forEach((b) => b.setAttribute('aria-pressed', b.textContent === lv ? 'true' : 'false'));
        renderGrid();
      });
      filterWrap.appendChild(chip);
    });
    c.appendChild(filterWrap);
    renderGrid();
    c.appendChild(grid);
    root.appendChild(c);
    return { el: root, title: '课程目录' };
  }

  /* ══ 课程页 ═══════════════════════════════════════════════════════ */
  async function coursePage(params) {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container', style: undefined });
    let course;
    try { course = await Data.course(params.id); } catch (e) { root.appendChild(c); c.appendChild(errorBox(e, () => App.refresh())); return { el: root, title: '课程' }; }
    c.appendChild(breadcrumbs([{ href: '#/', text: '首页' }, { href: '#/courses', text: '课程目录' }, { text: course.title }]));
    const head = el('div', { class: 'chapter-head mt-2' });
    head.appendChild(el('h1', { text: course.title }));
    head.appendChild(el('p', { class: 'lead mt-3', text: course.subtitle || '' }));
    const meta = el('div', { class: 'chapter-meta' });
    meta.appendChild(el('span', { class: 'chip chip-accent', text: course.level || '' }));
    meta.appendChild(el('span', { class: 'chip chip-plain', text: '约 ' + (course.hours || '—') + ' 学时' }));
    meta.appendChild(el('span', { class: 'chip chip-plain', text: Data.flatten(course).length + ' 讲' }));
    head.appendChild(meta);
    c.appendChild(head);
    if (course.description) c.appendChild(el('p', { class: 'mt-4', text: course.description }));
    if ((course.prerequisites || []).length) {
      const pre = el('div', { class: 'callout note' });
      pre.appendChild(el('div', { class: 'co-title', text: '先修建议' }));
      pre.appendChild(el('div', { text: course.prerequisites.join('；') }));
      c.appendChild(pre);
    }
    /* 进度概览 */
    const chIds = Data.flatten(course).map((x) => x.chapter.id);
    const prog = Store.courseProgress(chIds);
    const over = el('div', { class: 'card mt-8 row-between' });
    over.appendChild(el('div', { class: 'row' }, [progressRing(prog.pct), el('div', { class: 'stack' }, [
      el('div', { class: 'cc-title', text: '学习进度' }),
      el('div', { class: 'cc-sub', text: '已完成 ' + prog.done + ' / ' + prog.total + ' 讲' + (course.levelNote ? ' · ' + course.levelNote : '') }),
    ])]));
    over.appendChild(el('a', { class: 'btn btn-primary', href: '#/chapter/' + course.id + '/' + (Data.flatten(course)[0] || {}).chapter?.id, text: prog.done ? '继续学习' : '开始第一讲' }));
    c.appendChild(over);
    /* 单元与章节列表 */
    course.units.forEach((u) => {
      const sec = el('section', { class: 'mt-8' });
      sec.appendChild(el('h2', { text: u.title }));
      sec.appendChild(el('p', { class: 'muted small mt-2', text: u.summary || '' }));
      const list = el('div', { class: 'stack mt-4', style: undefined });
      u.chapters.forEach((ch) => {
        const st = Store.chapterStatus(ch.id);
        const card = el('a', { class: 'card card-hover', href: '#/chapter/' + course.id + '/' + ch.id });
        const row = el('div', { class: 'row-between' });
        const l = el('div', { class: 'stack' });
        const t = el('div', { class: 'row' });
        t.appendChild(el('span', { class: 'cc-title', text: ch.title }));
        if (st && st.completed) t.appendChild(el('span', { class: 'chip good', text: '已完成' }));
        l.appendChild(t);
        l.appendChild(el('div', { class: 'cc-sub', text: ch.objective || '' }));
        row.appendChild(l);
        const r = el('div', { class: 'stack', style: 'align-items:flex-end;' });
        r.appendChild(difficultyDots(ch.difficulty));
        r.appendChild(el('span', { class: 'meta', text: '约 ' + ch.minutes + ' 分钟' }));
        row.appendChild(r);
        card.appendChild(row);
        list.appendChild(card);
      });
      sec.appendChild(list);
      c.appendChild(sec);
    });
    root.appendChild(c);
    return { el: root, title: course.title };
  }

  /* ══ 章节页 ═══════════════════════════════════════════════════════ */
  async function chapterView(params) {
    const root = el('div', { class: 'view view-chapter' });
    let course = null; let ch = null;
    try {
      ch = await Data.chapter(params.courseId, params.chapterId);
    } catch (e) {
      const c = el('div', { class: 'container', style: undefined });
      c.appendChild(errorBox(e, () => App.refresh()));
      root.appendChild(c);
      return { el: root, title: '章节' };
    }
    try {
      course = await Data.course(params.courseId);
    } catch (e) {
      const mf = await Data.manifest().catch(() => null);
      const meta = mf && (mf.courses || []).filter((x) => x.id === params.courseId)[0];
      course = {
        id: params.courseId,
        title: meta ? meta.title : params.courseId,
        units: [{ id: params.courseId + '-u', title: '（课程目录加载中）', summary: '', chapters: [{ id: ch.id, title: ch.title, minutes: ch.minutes, difficulty: ch.difficulty }] }],
      };
    }

    const flat = Data.flatten(course);
    const idx = Data.chapterIndex(course, ch.id);
    const prev = idx > 0 ? flat[idx - 1] : null;
    const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

    /* 计时与访问 */
    Store.chapterVisit(ch.id, null);
    const timer = setInterval(() => { if (U.isVisible()) Store.chapterTime(ch.id, 15); }, 15000);
    const onVis = () => { if (U.isVisible()) Store.chapterTime(ch.id, 5); };
    document.addEventListener('visibilitychange', onVis);
    const readbar = $('#readbar');
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      if (readbar) readbar.style.width = (max > 0 ? Math.min(100, (h.scrollTop / max) * 100) : 0) + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const wrap = el('div', { class: 'container chapter-layout' });

    /* 侧边目录（移动端折叠为可展开卡片） */
    const tocMobile = window.matchMedia('(max-width: 1024px)').matches;
    const toc = el(tocMobile ? 'details' : 'aside', { class: 'toc-side', 'aria-label': '课程目录' });
    if (tocMobile) toc.appendChild(el('summary', { class: 'toc-summary', text: '本课程目录 · 共 ' + flat.length + ' 讲（点击展开）' }));
    toc.appendChild(el('div', { class: 'toc-course', text: course.title }));
    course.units.forEach((u) => {
      toc.appendChild(el('div', { class: 'toc-unit', text: u.title }));
      u.chapters.forEach((x) => {
        const st = Store.chapterStatus(x.id);
        const a = el('a', { href: '#/chapter/' + course.id + '/' + x.id, text: x.title });
        if (x.id === ch.id) a.classList.add('current');
        if (st && st.completed) a.innerHTML += ' <span class="toc-done">' + icon('check') + '</span>';
        toc.appendChild(a);
      });
    });
    wrap.appendChild(toc);

    /* 主内容 */
    const main = el('article', { class: 'chapter-main' });
    main.appendChild(breadcrumbs([{ href: '#/', text: '首页' }, { href: '#/course/' + course.id, text: course.title }, { text: ch.title }]));
    const head = el('header', { class: 'chapter-head' });
    head.appendChild(el('h1', { text: ch.title }));
    const meta = el('div', { class: 'chapter-meta' });
    meta.appendChild(difficultyDots(ch.difficulty));
    meta.appendChild(el('span', { class: 'chip chip-plain', text: '约 ' + ch.minutes + ' 分钟' }));
    if ((ch.prerequisites || []).length) meta.appendChild(el('span', { class: 'chip chip-plain', text: '先修：' + ch.prerequisites.join('、') }));
    head.appendChild(meta);
    const obj = el('div', { class: 'objectives-box' });
    obj.appendChild(el('div', { class: 'ob-title', text: '学完这一讲，你将能够' }));
    const objUl = el('ul');
    (ch.objectives || []).forEach((o) => objUl.appendChild(el('li', { text: o })));
    obj.appendChild(objUl);
    head.appendChild(obj);
    main.appendChild(head);

    /* 双版本切换 */
    let currentTrack = (Store.chapterStatus(ch.id) || {}).track || 'pro';
    const trackbar = el('div', { class: 'trackbar' });
    const seg = el('div', { class: 'segmented' });
    const btnPro = el('button', { type: 'button', 'aria-pressed': currentTrack === 'pro', text: '专业版' });
    const btnKid = el('button', { type: 'button', 'aria-pressed': currentTrack === 'kid', text: '宝宝巴士版' });
    seg.appendChild(btnPro); seg.appendChild(btnKid);
    trackbar.appendChild(seg);
    const doneBtn = el('button', { class: 'btn btn-secondary btn-sm', type: 'button' });
    function updateDoneBtn() {
      const st = Store.chapterStatus(ch.id);
      const done = !!(st && st.completed);
      doneBtn.textContent = done ? '已完成 · 点击取消' : '标记本讲完成';
      doneBtn.className = 'btn ' + (done ? 'btn-sand' : 'btn-secondary') + ' btn-sm';
    }
    updateDoneBtn();
    doneBtn.addEventListener('click', () => {
      const st = Store.chapterStatus(ch.id);
      const nowDone = !(st && st.completed);
      Store.chapterComplete(ch.id, nowDone);
      updateDoneBtn();
      toast(nowDone ? '已标记完成，继续下一讲吧' : '已取消完成标记', nowDone ? 'success' : undefined);
    });
    trackbar.appendChild(doneBtn);
    main.appendChild(trackbar);

    const trackWrap = el('div', { id: 'track-wrap' });
    main.appendChild(trackWrap);
    function sectionIndex() {
      const secs = $$('.track-section', trackWrap);
      let i = 0;
      secs.forEach((s, j) => { if (s.getBoundingClientRect().top < 150) i = j; });
      return i;
    }
    function renderTrack() {
      trackWrap.innerHTML = '';
      const data = currentTrack === 'pro' ? ch.pro : ch.kid;
      const art = el('article', { class: 'track', dataset: { track: currentTrack } });
      if (data.intro) art.appendChild(el('p', { class: 'track-intro', html: sanitize(data.intro) }));
      (data.sections || []).forEach((s) => {
        const sec = el('section', { class: 'track-section' });
        sec.appendChild(el('h3', { class: 'section-heading', text: s.heading }));
        sec.appendChild(el('div', { class: 'prose', html: sanitize(s.html) }));
        art.appendChild(sec);
      });
      trackWrap.appendChild(art);
    }
    function switchTrack(next) {
      if (next === currentTrack) return;
      const i = sectionIndex();
      currentTrack = next;
      Store.setTrackChoice(ch.id, next);
      btnPro.setAttribute('aria-pressed', next === 'pro' ? 'true' : 'false');
      btnKid.setAttribute('aria-pressed', next === 'kid' ? 'true' : 'false');
      renderTrack();
      const secs = $$('.track-section', trackWrap);
      const target = secs[Math.min(i, secs.length - 1)];
      if (target) U.scrollToEl(target, 120);
    }
    btnPro.addEventListener('click', () => switchTrack('pro'));
    btnKid.addEventListener('click', () => switchTrack('kid'));
    renderTrack();

    /* 要点速览 */
    const kp = el('section', { class: 'keypoints-box' });
    kp.appendChild(el('h2', { text: '本讲要点速览' }));
    const kpUl = el('ul');
    (ch.keyPoints || []).forEach((k) => kpUl.appendChild(el('li', { text: k })));
    kp.appendChild(kpUl);
    main.appendChild(kp);

    /* 术语表 */
    if ((ch.glossary || []).length) {
      const gl = el('section', { class: 'mt-8' });
      gl.appendChild(el('h2', { text: '术语表' }));
      const gg = el('div', { class: 'glossary-grid' });
      ch.glossary.forEach((g) => {
        const item = el('div', { class: 'glossary-item' });
        item.appendChild(el('div', { class: 'gi-term', text: g.term }));
        item.appendChild(el('div', { class: 'gi-def', text: g.def }));
        gg.appendChild(item);
      });
      gl.appendChild(gg);
      main.appendChild(gl);
    }

    /* 延伸阅读 */
    if ((ch.refs || []).length) {
      const rf = el('div', { class: 'callout tip mt-6' });
      rf.appendChild(el('div', { class: 'co-title', text: '延伸阅读' }));
      ch.refs.forEach((r) => rf.appendChild(el('div', { class: 'small', text: r })));
      main.appendChild(rf);
    }

    /* 交互演示 */
    const demoIds = (ch.demoRefs || []).filter(Boolean);
    if (demoIds.length) {
      const dsec = el('section', { class: 'mt-12', id: 'demos' });
      dsec.appendChild(el('h2', { text: '动手实验' }));
      dsec.appendChild(el('p', { class: 'muted small mt-2', text: '下面这些动画可以调参数、单步走、随时重置——玩一遍，比读十遍管用。' }));
      demoIds.forEach((id) => {
        const holder = el('div', { class: 'demo-embed', dataset: { demo: id } });
        holder.appendChild(el('div', { class: 'skeleton skeleton-card' }));
        holder.appendChild(el('p', { class: 'muted small mt-2', text: '演示加载中…' }));
        dsec.appendChild(holder);
      });
      main.appendChild(dsec);
    }

    /* 习题 */
    const exSec = el('section', { class: 'exercise-zone', id: 'exercises' });
    exSec.appendChild(el('h2', { text: '配套习题（共 ' + (ch.exercises || []).length + ' 题）' }));
    const counts = { easy: 0, medium: 0, hard: 0 };
    (ch.exercises || []).forEach((e) => counts[e.level]++);
    exSec.appendChild(el('p', { class: 'muted small mt-2', text: '简单 ' + counts.easy + ' 题 · 中等 ' + counts.medium + ' 题 · 困难 ' + counts.hard + ' 题；选择题与判断题可即时判分，其余题型对照解答自我评估。' }));
    const filters = el('div', { class: 'exercise-filters' });
    let lv = 'all';
    const listWrap = el('ul', { class: 'stack', style: undefined });
    listWrap.style.listStyle = 'none';
    listWrap.style.padding = '0';
    function renderList() {
      listWrap.innerHTML = '';
      (ch.exercises || []).filter((e) => lv === 'all' || e.level === lv).forEach((ex) => listWrap.appendChild(renderExercise(ex)));
    }
    [['all', '全部'], ['easy', '简单'], ['medium', '中等'], ['hard', '困难']].forEach(([v, t]) => {
      const chip = el('button', { class: 'filter-chip', type: 'button', text: t, 'aria-pressed': v === lv });
      chip.addEventListener('click', () => {
        lv = v;
        $$('.filter-chip', filters).forEach((b2) => b2.setAttribute('aria-pressed', b2.textContent === t ? 'true' : 'false'));
        renderList();
      });
      filters.appendChild(chip);
    });
    exSec.appendChild(filters);
    renderList();
    exSec.appendChild(listWrap);
    main.appendChild(exSec);

    /* 上下讲导航 */
    const nav = el('nav', { class: 'chapter-nav', 'aria-label': '章节导航' });
    if (prev) nav.appendChild(el('a', { class: 'cn-link', href: '#/chapter/' + course.id + '/' + prev.chapter.id }, [
      el('span', { class: 'cn-dir', text: '← 上一讲' }), el('span', { class: 'cn-title', text: prev.chapter.title }),
    ]));
    if (next) nav.appendChild(el('a', { class: 'cn-link', style: 'text-align:right;', href: '#/chapter/' + course.id + '/' + next.chapter.id }, [
      el('span', { class: 'cn-dir', text: '下一讲 →' }), el('span', { class: 'cn-title', text: next.chapter.title }),
    ]));
    main.appendChild(nav);
    wrap.appendChild(main);
    root.appendChild(wrap);

    return {
      el: root,
      title: ch.title + ' · ' + course.title,
      onMount: (node) => {
        if (window.DemoKit && DemoKit.autoMount) DemoKit.autoMount(node);
      },
      cleanup: () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('scroll', onScroll);
        if (readbar) readbar.style.width = '0';
      },
    };
  }

  /* ══ 演示实验室 ═══════════════════════════════════════════════════ */
  async function demosPage() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container' });
    c.appendChild(el('h1', { text: '演示实验室' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '把抽象概念变成可以动手玩的模拟：调参数、单步执行、回退、重置——每一步都有旁白解释发生了什么。' }));
    const mf = await Data.demosManifest();
    const grid = el('div', { class: 'demo-grid mt-8' });
    mf.demos.forEach((d) => {
      const a = el('a', { class: 'card card-hover demo-card', href: '#/demo/' + d.id });
      const thumb = el('div', { class: 'dc-thumb' });
      thumb.innerHTML = icon('flask');
      a.appendChild(thumb);
      a.appendChild(el('div', { class: 'cc-title', text: d.title }));
      a.appendChild(el('div', { class: 'cc-sub', text: d.desc || '' }));
      const foot = el('div', { class: 'cc-foot' });
      foot.appendChild(el('span', { class: 'chip chip-accent', text: '演示' }));
      foot.appendChild(el('span', { class: 'chip chip-plain', text: (d.chapters || [])[0] || '' }));
      a.appendChild(foot);
      grid.appendChild(a);
    });
    c.appendChild(grid);
    root.appendChild(c);
    return { el: root, title: '演示实验室' };
  }

  async function demoPage(params) {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container container-narrow', style: undefined });
    const mf = await Data.demosManifest().catch(() => ({ demos: [] }));
    const info = mf.demos.find((d) => d.id === params.id);
    if (!info) { c.appendChild(errorBox(new Error('未找到该演示：' + params.id), () => App.refresh())); root.appendChild(c); return { el: root, title: '演示' }; }
    c.appendChild(breadcrumbs([{ href: '#/', text: '首页' }, { href: '#/demos', text: '演示实验室' }, { text: info.title }]));
    c.appendChild(el('h1', { class: 'mt-2', text: info.title }));
    c.appendChild(el('p', { class: 'lead mt-3', text: info.desc || '' }));
    const meta = await Data.demoMeta(info.id);
    const holder = el('div', { class: 'demo-embed mt-8', dataset: { demo: info.id } });
    holder.appendChild(el('div', { class: 'skeleton skeleton-card' }));
    c.appendChild(holder);
    const guide = el('div', { class: 'card mt-8' });
    guide.appendChild(el('h3', { text: '怎么玩' }));
    const howto = (meta && meta.howto) || ['用下方控制条开始 / 暂停，或逐步前进、后退', '调整参数观察结果如何变化', '随时点「重置」回到初始状态', '每一步的旁白会解释正在发生什么'];
    const ol = el('ol');
    howto.forEach((h) => ol.appendChild(el('li', { text: h })));
    guide.appendChild(ol);
    if (meta && meta.goal) {
      guide.appendChild(el('div', { class: 'callout tip mt-4' }, [el('div', { class: 'co-title', text: '这个演示帮你理解' }), el('div', { text: meta.goal })]));
    }
    c.appendChild(guide);
    if (info.chapters && info.chapters.length) {
      const rel = el('div', { class: 'mt-6' });
      rel.appendChild(el('h3', { text: '相关课程章节' }));
      const row = el('div', { class: 'row mt-2' });
      info.chapters.forEach((chId) => {
        const cid = chId.replace(/-\d+$/, '');
        row.appendChild(el('a', { class: 'chip chip-accent', href: '#/chapter/' + cid + '/' + chId, text: chId }));
      });
      rel.appendChild(row);
      c.appendChild(rel);
    }
    root.appendChild(c);
    return { el: root, title: info.title, onMount: (node) => { if (window.DemoKit && DemoKit.autoMount) DemoKit.autoMount(node); } };
  }

  /* ══ 练习中心 ═════════════════════════════════════════════════════ */
  async function practice() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container', style: undefined });
    c.appendChild(el('h1', { text: '练习中心' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '按课程、章节与难度自由练习；也可以一键进入错题本，把做错的题消灭掉。' }));
    const all = await Data.allCourses();
    const toolbar = el('div', { class: 'practice-toolbar' });
    const courseSel = el('select', { 'aria-label': '选择课程' });
    all.courses.forEach((x) => courseSel.appendChild(el('option', { value: x.id, text: x.title + (x._loaded ? '' : '（编写中）') })));
    const chapterSel = el('select', { 'aria-label': '选择章节' });
    const levelSel = el('select', { 'aria-label': '选择难度' });
    [['all', '全部难度'], ['easy', '只看简单'], ['medium', '只看中等'], ['hard', '只看困难']].forEach(([v, t]) => levelSel.appendChild(el('option', { value: v, text: t })));
    const runBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '开始练习' });
    const wrongBtn = el('button', { class: 'btn btn-secondary', type: 'button', text: '错题本练习' });
    toolbar.appendChild(courseSel); toolbar.appendChild(chapterSel); toolbar.appendChild(levelSel);
    toolbar.appendChild(runBtn); toolbar.appendChild(wrongBtn);
    c.appendChild(toolbar);
    const status = el('p', { class: 'muted small' });
    c.appendChild(status);
    const listWrap = el('ul', { class: 'stack mt-6', style: undefined });
    listWrap.style.listStyle = 'none'; listWrap.style.padding = '0';
    c.appendChild(listWrap);

    function fillChapters() {
      chapterSel.innerHTML = '';
      const co = all.courses.find((x) => x.id === courseSel.value);
      if (!co || !co._loaded) { chapterSel.appendChild(el('option', { value: '', text: '整门课' })); return; }
      chapterSel.appendChild(el('option', { value: 'all', text: '整门课（全部章节）' }));
      Data.flatten(co).forEach((x) => chapterSel.appendChild(el('option', { value: x.chapter.id, text: x.chapter.title })));
    }
    fillChapters();
    courseSel.addEventListener('change', fillChapters);

    function refreshStatus(counts) {
      const done = Store.stats();
      const lv = levelSel.value;
      status.textContent = '已选：' + (courseSel.options[courseSel.selectedIndex] ? courseSel.options[courseSel.selectedIndex].text : '') +
        ' · 当前显示 ' + counts.shown + ' 题（简单 ' + counts.easy + ' / 中等 ' + counts.medium + ' / 困难 ' + counts.hard + '）' +
        (done.accuracy != null ? ' · 历史正确率 ' + fmtPct(done.accuracy) : '');
    }

    async function loadFromChapters(chIds) {
      listWrap.innerHTML = '';
      status.textContent = '正在加载题目…';
      const results = await Promise.allSettled(chIds.map((cid2) => Data.chapter(cid2.replace(/-\d+$/, ''), cid2)));
      const files = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const skipped = results.length - files.length;
      let exs = [];
      files.forEach((f) => { exs = exs.concat(f.exercises || []); });
      const lv = levelSel.value;
      let filtered = exs.filter((e) => lv === 'all' || e.level === lv);
      const counts = { shown: filtered.length, easy: filtered.filter((e) => e.level === 'easy').length, medium: filtered.filter((e) => e.level === 'medium').length, hard: filtered.filter((e) => e.level === 'hard').length };
      filtered.forEach((ex) => listWrap.appendChild(renderExercise(ex, { onChange: () => refreshStatus(counts) })));
      refreshStatus(counts);
      if (skipped > 0) status.textContent += ' · 有 ' + skipped + ' 章内容暂不可用已跳过';
    }

    runBtn.addEventListener('click', () => {
      const co = all.courses.find((x) => x.id === courseSel.value);
      if (!co || !co._loaded) { toast('该课程内容尚在编写中'); return; }
      const chIds = chapterSel.value === 'all' ? Data.flatten(co).map((x) => x.chapter.id) : [chapterSel.value];
      loadFromChapters(chIds).catch((e) => { status.textContent = '加载失败：' + e.message; });
    });
    wrongBtn.addEventListener('click', () => {
      const wrong = Store.wrongList();
      if (!wrong.length) { toast('错题本是空的，先去做几题吧'); return; }
      levelSel.value = 'all';
      const chIds = Array.from(new Set(wrong.map((w) => w.id.replace(/-e\d+$/, ''))));
      const wrongSet = new Set(wrong.map((w) => w.id));
      status.textContent = '正在加载错题（' + wrongSet.size + ' 题）…';
      Promise.allSettled(chIds.map((cid2) => Data.chapter(cid2.replace(/-\d+$/, ''), cid2))).then((results) => {
        listWrap.innerHTML = '';
        let exs = [];
        results.filter((r) => r.status === 'fulfilled').forEach((r) => { exs = exs.concat(r.value.exercises || []); });
        const filtered = exs.filter((e) => wrongSet.has(e.id));
        const counts = { shown: filtered.length, easy: filtered.filter((e) => e.level === 'easy').length, medium: filtered.filter((e) => e.level === 'medium').length, hard: filtered.filter((e) => e.level === 'hard').length };
        filtered.forEach((ex) => listWrap.appendChild(renderExercise(ex, { onChange: () => refreshStatus(counts) })));
        refreshStatus(counts);
        toast('错题模式：共 ' + filtered.length + ' 题，加油！');
      }).catch((e) => { status.textContent = '加载失败：' + e.message; });
    });
    root.appendChild(c);
  return { el: root, title: '练习中心' };
  }

  /* ══ 进度面板 ═════════════════════════════════════════════════════ */
  async function dashboard() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container' });
    function build() {
      c.innerHTML = '';
      c.appendChild(el('h1', { text: '我的学习进度' }));
      const s = Store.stats();
      const grid = el('div', { class: 'dash-grid mt-6' });
      grid.appendChild(statTile(String(s.chaptersDone), '已学完章节'));
      grid.appendChild(statTile(s.totalTime ? fmtDuration(s.totalTime) : '0 分钟', '累计学习时长'));
      grid.appendChild(statTile(s.accuracy != null ? fmtPct(s.accuracy) : '—', '习题正确率'));
      grid.appendChild(statTile(String(s.answered), '已练题目数'));
      c.appendChild(grid);

      /* 近 14 天活动 */
      const act = el('div', { class: 'panel mt-8' });
      act.appendChild(el('div', { class: 'panel-title', text: '近 14 天学习投入' }));
      const series = Store.activitySeries(14);
      const maxSec = Math.max(60, ...series.map((x) => x.sec));
      const bars = el('div', { class: 'row', style: 'align-items:flex-end;height:120px;gap:6px;' });
      series.forEach((x) => {
        const col = el('div', { class: 'stack', style: 'align-items:center;flex:1;gap:4px;' });
        const barWrap = el('div', { style: 'height:92px;display:flex;align-items:flex-end;width:100%;justify-content:center;' });
        const bar = el('div');
        bar.setAttribute('style', 'width:70%;border-radius:4px;background:var(--accent);min-height:2px;height:' + Math.round((x.sec / maxSec) * 90) + 'px;opacity:' + (x.sec ? '1' : '0.15') + ';');
        barWrap.appendChild(bar);
        col.appendChild(barWrap);
        col.appendChild(el('span', { class: 'meta', text: x.day.slice(5) }));
        col.appendChild(el('span', { class: 'meta', text: x.sec ? Math.round(x.sec / 60) + '分' : '—' }));
        bars.appendChild(col);
      });
      act.appendChild(bars);
      c.appendChild(act);

      /* 各课程进度 */
      const cp = el('div', { class: 'panel mt-6' });
      cp.appendChild(el('div', { class: 'panel-title', text: '各课程进度' }));
      Data.allCourses().then((all) => {
        all.courses.forEach((co) => {
          if (!co._loaded) return;
          const ids = Data.flatten(co).map((x) => x.chapter.id);
          const p = Store.courseProgress(ids);
          const row = el('div', { class: 'course-progress-row' });
          row.appendChild(el('div', { class: 'cpr-name' }, [el('a', { href: '#/course/' + co.id, text: co.title })]));
          row.appendChild(progressBar(p.pct));
          row.appendChild(el('div', { class: 'cpr-pct', text: p.done + '/' + p.total }));
          cp.appendChild(row);
        });
      }).catch(() => { cp.appendChild(el('p', { class: 'muted small', text: '课程数据加载失败' })); });
      c.appendChild(cp);

      /* 错题本 */
      const wb = el('div', { class: 'panel mt-6' });
      const wrong = Store.wrongList();
      wb.appendChild(el('div', { class: 'panel-title', text: '错题本（' + wrong.length + ' 题待消灭）' }));
      if (!wrong.length) {
        wb.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'empty-title', text: '暂时没有错题' }), el('div', { class: 'small', text: '做错的题会自动出现在这里；也可以手动标记「还需要复习」。' })]));
      } else {
        wrong.slice(0, 30).forEach((w) => {
          const row = el('div', { class: 'wrongbook-item' });
          const main = el('div', { class: 'wb-main' });
          const cid = w.id.replace(/-e\d+$/, '');
          main.appendChild(el('div', { class: 'wb-stem', text: w.id }));
          main.appendChild(el('div', { class: 'wb-meta', text: '答错 ' + (w.wrong || 0) + ' 次 · 最近 ' + (w.lastAt ? fmtDate(w.lastAt) : '—') }));
          row.appendChild(main);
          row.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: '#/chapter/' + cid.replace(/-\d+$/, '') + '/' + cid + '#exercises', text: '去复习' }));
          row.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '移出', onclick: () => { Store.selfAssess(w.id, true); toast('已标记掌握'); build(); } }));
          wb.appendChild(row);
        });
      }
      c.appendChild(wb);

      /* 数据管理 */
      const dm = el('div', { class: 'panel mt-6' });
      dm.appendChild(el('div', { class: 'panel-title', text: '数据管理（本地存储）' }));
      const row = el('div', { class: 'row' });
      row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出 JSON 备份', onclick: () => { download('cslearn-backup-' + fmtDate(Date.now()) + '.json', Store.exportJSONText(), 'application/json'); } }));
      row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出题目记录 CSV', onclick: () => { download('cslearn-exercises.csv', Store.exportCSV_exercises(), 'text/csv'); } }));
      row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出章节记录 CSV', onclick: () => { download('cslearn-chapters.csv', Store.exportCSV_chapters(), 'text/csv'); } }));
      dm.appendChild(row);
      const imp = el('div', { class: 'row mt-4' });
      const file = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': '选择备份文件' });
      const mode = el('select', { 'aria-label': '导入方式' });
      mode.appendChild(el('option', { value: 'merge', text: '合并（推荐）' }));
      mode.appendChild(el('option', { value: 'replace', text: '替换现有数据' }));
      imp.appendChild(file); imp.appendChild(mode);
      imp.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导入备份', onclick: async () => {
        if (!file.files || !file.files[0]) { toast('请先选择备份文件'); return; }
        const text = await file.files[0].text();
        const r = Store.importJSONText(text, mode.value);
        if (r.ok) { toast('导入成功（' + (r.mode === 'merge' ? '合并' : '替换') + '）', 'success'); build(); }
        else toast('导入失败：' + r.error, 'error');
      } }));
      dm.appendChild(imp);
      dm.appendChild(el('button', { class: 'btn btn-ghost btn-sm mt-4', type: 'button', text: '清空全部学习数据…', onclick: async () => {
        if (await confirmDialog('确定要清空所有学习数据吗？此操作不可恢复（建议先导出备份）。', { okLabel: '清空' })) {
          Store.resetAll(); toast('已清空'); build();
        }
      } }));
      c.appendChild(dm);

      /* 可选账号同步 */
      const sy = el('div', { class: 'panel mt-6' });
      sy.appendChild(el('div', { class: 'panel-title', text: '可选账号同步（跨设备）' }));
      const creds = Store.syncCreds();
      const st = el('p', { class: 'small muted', text: '正在检测本地服务…' });
      sy.appendChild(st);
      const btnRow = el('div', { class: 'row mt-3' });
      sy.appendChild(btnRow);
      if (creds.user) {
        st.textContent = '已登录：' + creds.user + '。学习数据可在设备间推送/拉取。';
        btnRow.appendChild(el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: '上传到云端', onclick: async () => {
          try { await Store.syncPush(); toast('已上传', 'success'); } catch (e) { toast('上传失败：' + e.message, 'error'); }
        } }));
        btnRow.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '从云端拉取', onclick: async () => {
          try { const r = await Store.syncPull(); toast(r && r.ok ? '已拉取并合并' : '云端暂无数据', r && r.ok ? 'success' : undefined); build(); } catch (e) { toast('拉取失败：' + e.message, 'error'); }
        } }));
        btnRow.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '退出登录', onclick: () => { Store.logout(); toast('已退出'); build(); } }));
      } else {
        btnRow.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '登录 / 注册同步账号…', onclick: openAuth }));
      }
      Store.backendAlive().then((alive) => {
        if (!alive && !creds.user) {
          st.textContent = '未检测到本地服务：账号同步需要以完整模式启动（node server/server.js）。默认的本地记录功能不受影响。';
        } else if (alive && !creds.user) {
          st.textContent = '本地服务在线。登录后可跨设备同步学习数据（同一局域网 / 同一部署）。';
        }
      });
      function openAuth() {
        const body = el('div');
        const f1 = el('div', { class: 'field' }, [el('label', { text: '用户名（3-20 位字母、数字或下划线）' }), el('input', { class: 'input', type: 'text', autocomplete: 'username' })]);
        const f2 = el('div', { class: 'field' }, [el('label', { text: '密码（至少 6 位）' }), el('input', { class: 'input', type: 'password', autocomplete: 'current-password' })]);
        const msg = el('p', { class: 'small' });
        body.appendChild(f1); body.appendChild(f2); body.appendChild(msg);
        const close = modal({
          title: '同步账号',
          body,
          actions: [
            { label: '取消' },
            { label: '注册新账号', action: async () => { const r = await doAuth('register'); return r === true ? undefined : false; } },
            { label: '登录', primary: true, action: async () => { const r = await doAuth('login'); return r === true ? undefined : false; } },
          ],
        });
        async function doAuth(mode) {
          const u = f1.querySelector('input').value.trim();
          const p = f2.querySelector('input').value;
          if (u.length < 3 || p.length < 6) { msg.textContent = '请填写有效的用户名与密码。'; msg.className = 'small'; msg.style.color = 'var(--danger)'; return false; }
          try {
            if (mode === 'register') await Store.register(u, p);
            else await Store.login(u, p);
            toast('成功！已登录 ' + u, 'success');
            build();
            return true;
          } catch (e) { msg.textContent = '失败：' + e.message; msg.style.color = 'var(--danger)'; return false; }
        }
      }
      c.appendChild(sy);
    }
    build();
    const onProg = () => { /* 数据在操作处即时重建，无需监听 */ };
    U.on('progress:changed', onProg);
    root.appendChild(c);
  return { el: root, title: '我的学习进度', cleanup: () => U.bus.removeEventListener('progress:changed', onProg) };
  }

  /* ══ 管理员台账 ═══════════════════════════════════════════════════ */
  async function admin() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container', style: undefined });
    c.appendChild(el('h1', { text: '学习记录台账（管理员）' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '查看与导出全部用户的学习记录（需要以完整模式启动服务；管理员密钥见 server/data/admin-key.txt）。' }));
    const bar = el('div', { class: 'row mt-4' });
    const keyInput = el('input', { class: 'input', type: 'password', placeholder: '管理员密钥', style: 'max-width:240px;', 'aria-label': '管理员密钥' });
    const loadBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '查看台账' });
    bar.appendChild(keyInput); bar.appendChild(loadBtn);
    c.appendChild(bar);
    const out = el('div', { class: 'mt-6' });
    c.appendChild(out);
    let records = null;
    loadBtn.addEventListener('click', async () => {
      out.innerHTML = '';
      out.appendChild(loadingBlock('正在获取台账…'));
      try {
        const r = await fetch('/api/admin/records?key=' + encodeURIComponent(keyInput.value));
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || ('HTTP ' + r.status));
        const data = await r.json();
        records = data;
        renderRecords(data);
      } catch (e) {
        out.innerHTML = '';
        out.appendChild(errorBox(new Error('获取失败：' + e.message + '（请确认服务已启动且密钥正确）')));
      }
    });
    function renderRecords(data) {
      out.innerHTML = '';
      const users = data.users || [];
      out.appendChild(el('div', { class: 'panel' }, [
        el('div', { class: 'panel-title', text: '共 ' + users.length + ' 个用户' }),
      ]));
      const panel = out.lastChild;
      if (!users.length) { panel.appendChild(el('div', { class: 'empty', text: '暂无用户记录' })); return; }
      const table = el('table', { class: 'ds-table' });
      const thead = el('thead');
      thead.innerHTML = '<tr><th>用户名</th><th>已学章节</th><th>累计时长</th><th>答题正确率</th><th>题目数</th><th>最近活动</th></tr>';
      table.appendChild(thead);
      const tbody = el('tbody');
      users.forEach((u) => {
        const tr = el('tr');
        tr.appendChild(el('td', { text: u.username }));
        tr.appendChild(el('td', { class: 'num-col', text: u.chaptersDone }));
        tr.appendChild(el('td', { class: 'num-col', text: fmtDuration(u.totalTime) }));
        tr.appendChild(el('td', { class: 'num-col', text: u.accuracy != null ? fmtPct(u.accuracy) : '—' }));
        tr.appendChild(el('td', { class: 'num-col', text: u.answered }));
        tr.appendChild(el('td', { text: u.lastActive ? U.fmtDateTime(u.lastActive) : '—' }));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      panel.appendChild(table);
      const row = el('div', { class: 'row mt-4' });
      row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出 CSV', onclick: () => {
        const rows = [['用户名', '已学章节', '累计时长(秒)', '正确率', '题目数', '最近活动']];
        users.forEach((u) => rows.push([u.username, u.chaptersDone, Math.round(u.totalTime), u.accuracy != null ? (u.accuracy * 100).toFixed(1) + '%' : '', u.answered, u.lastActive ? U.fmtDateTime(u.lastActive) : '']));
        download('cslearn-admin-records.csv', rows.map((r) => r.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv');
      } }));
      row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出 JSON', onclick: () => download('cslearn-admin-records.json', JSON.stringify(records, null, 2), 'application/json') }));
      panel.appendChild(row);
    }
    root.appendChild(c);
  return { el: root, title: '管理台账' };
  }

  /* ══ 关于 ═════════════════════════════════════════════════════════ */
  async function about() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container container-narrow' });
    c.appendChild(el('p', { class: 'eyebrow', text: 'ABOUT · 关于' }));
    c.appendChild(el('h1', { text: '关于本站与作者' }));
    /* 作者信息 */
    const author = el('section', { class: 'card author-card' });
    author.appendChild(el('img', { class: 'author-avatar', src: 'assets/author/avatar.jpg?v=1f8c93d2', alt: '作者头像：Solips-Singularitat', width: 96, height: 96, loading: 'lazy' }));
    const ab = el('div', { class: 'author-body' });
    ab.appendChild(el('div', { class: 'author-name', text: 'Solips-Singularitat' }));
    ab.appendChild(el('div', { class: 'author-role', text: '本站作者 · 内容与开发' }));
    const mailRow = el('div', { class: 'author-mailrow' }, [el('span', { class: 'small muted', text: '联系邮箱：' }), mailLink('author-mail')]);
    ab.appendChild(mailRow);
    ab.appendChild(el('p', { class: 'small muted author-note', text: '如发现问题，请联系作者邮箱。' }));
    author.appendChild(ab);
    c.appendChild(author);
    /* 研究所入口 */
    const teaser = el('section', { class: 'card institute-teaser' });
    teaser.appendChild(el('img', { class: 'institute-icon', src: 'assets/institute/caa-ins-icon.jpg?v=1f8c93d2', alt: '中国美术学院网络社会研究所（INS）图标', width: 44, height: 44, loading: 'lazy' }));
    const tb = el('div', { class: 'institute-teaser-body' });
    tb.appendChild(el('div', { class: 'institute-name', text: '中国美术学院 · 网络社会研究所（INS）' }));
    tb.appendChild(el('p', { class: 'small muted', text: '本站作者所在的研究所，关注网络社会的理论、艺术与实践。' }));
    tb.appendChild(el('a', { class: 'btn btn-secondary btn-sm', href: '#/institute', text: '进入研究所专栏 →' }));
    teaser.appendChild(tb);
    c.appendChild(teaser);
    const sec1 = el('div', { class: 'prose mt-6' });
    sec1.innerHTML = sanitize(
      '<p>这里是「贝尔实验室 · 计算机知识学习站」：为「从零基础到研究生入门」而设计——11 门课程、116 讲，每讲都提供<strong>专业版</strong>与<strong>宝宝巴士版</strong>两种讲解，配套三级难度习题与完整解答，重点知识点配有可以动手操作的交互演示。</p>' +
      '<h4>学习方式</h4><ul>' +
      '<li>从<a href="#/paths">学习路径</a>选一条线，按顺序学；或直接进<a href="#/courses">课程目录</a>挑感兴趣的主题。</li>' +
      '<li>每讲读完做一遍习题：选择题、判断题可即时判分；推导、设计、编程题对照完整解答自评。</li>' +
      '<li>把「标记本讲完成」点亮，学习进度、时长、错题都会记入<a href="#/dashboard">进度面板</a>。</li></ul>' +
      '<h4>数据与隐私</h4><p>学习数据默认只保存在你当前浏览器的本地存储里，不会上传到任何地方。你可以随时导出 JSON/CSV 备份，也可以在启动本地服务后使用可选的账号同步功能跨设备同步。</p>' +
      '<h4>技术说明</h4><p>本站为纯前端静态应用 + 可选轻量 Node 服务（无第三方依赖）：内容以结构化 JSON 组织，交互演示基于原生 Canvas/SVG 实现，支持键盘操作与低性能设备的分步降级。</p>' +
      '<h4>反馈与扩展</h4><p>想新增课程、章节、题目或演示？请参考项目文档中的《内容维护指南》（docs/AUTHORING-GUIDE.md）与《交接说明》（docs/handoff.html）。</p>'
    );
    c.appendChild(sec1);
    root.appendChild(c);
    return { el: root, title: '关于本站' };
  }

  /* ══ 研究所专栏 ═════════════════════════════════════════════ */
  async function institute() {
    const root = el('div', { class: 'view view-institute' });
    const c = el('div', { class: 'container container-narrow' });
    c.appendChild(el('p', { class: 'eyebrow', text: 'INS · 网络社会研究所专栏' }));
    const head = el('div', { class: 'institute-head' });
    head.appendChild(el('img', { class: 'institute-logo', src: 'assets/institute/caa-ins-icon.jpg?v=1f8c93d2', alt: '中国美术学院网络社会研究所（INS）图标：紫底白色 iNs 字母', width: 72, height: 72, loading: 'lazy' }));
    const ht = el('div', { class: 'institute-head-body' });
    ht.appendChild(el('h1', { text: '中国美术学院 · 网络社会研究所' }));
    ht.appendChild(el('p', { class: 'institute-en', text: 'Institute of Network Society (INS), School of Intermedia Art, China Academy of Art' }));
    const links = el('div', { class: 'institute-links' });
    links.appendChild(el('a', { class: 'btn btn-primary btn-sm', href: 'https://www.caa-ins.org/', target: '_blank', rel: 'noopener noreferrer', text: '访问研究所官网 ↗' }));
    ht.appendChild(links);
    head.appendChild(ht);
    c.appendChild(head);

    const prose = el('div', { class: 'prose mt-8' });
    prose.innerHTML = sanitize(
      '<p>中国美术学院网络社会研究所（Institute of Network Society，简称 <strong>INS</strong>）隶属中国美术学院跨媒体艺术学院，长期关注「网络社会」中的理论、艺术与实践问题——从平台与算法，到数字文化与媒介理论。</p>' +
      '<h4>它在做什么</h4><ul>' +
      '<li><strong>网络社会年会</strong>：年度学术会议，邀请世界各地的研究者与艺术家，已连续举办多届（最新为第十届）；</li>' +
      '<li><strong>国际讲座与研究者论坛</strong>：常态化的公开讲座与青年学者论坛；</li>' +
      '<li><strong>黑客松与工作坊</strong>：如「AIathon 智能松」等活动，推动动手实践与技术思辨；</li>' +
      '<li><strong>出版与译介</strong>：出版期刊与文集（如 ACID、历届年会论文集），并译介斯蒂格勒（Bernard Stiegler）、洛文克（Geert Lovink）等学者的研究。</li></ul>' +
      '<p>本站作者来自该研究所；本专栏仅作学习与交流展示，不代表研究所官方发布。</p>'
    );
    c.appendChild(prose);

    const cta = el('section', { class: 'card institute-cta' });
    cta.appendChild(el('div', { class: 'institute-name', text: '访问研究所官网' }));
    cta.appendChild(el('p', { class: 'small muted', text: '活动预告、年会日程与出版物的完整信息，请前往官网查看。' }));
    cta.appendChild(el('a', { class: 'btn btn-primary', href: 'https://www.caa-ins.org/', target: '_blank', rel: 'noopener noreferrer', text: '前往 www.caa-ins.org ↗' }));
    c.appendChild(cta);
    c.appendChild(el('p', { class: 'meta mt-6', text: '本专栏根据研究所官网公开信息整理，仅供参考；如与官网表述不一致，以官网为准。' }));
    root.appendChild(c);
    return { el: root, title: '网络社会研究所' };
  }

  /* ══ 邮件链接（轻量组装，降低被爬取概率） ═══════════════════ */
  function mailLink(cls) {
    const a = el('a', { class: cls || 'mailto', href: '#/about' });
    const user = '2451101123';
    const domain = 'qq.com';
    const em = user + '@' + domain;
    a.href = 'mailto:' + em;
    a.textContent = em;
    a.setAttribute('title', '点击打开邮件客户端给作者写信');
    return a;
  }

  function notFound() {
    const root = el('div', { class: 'view' });
    const c = el('div', { class: 'container narrow', style: 'text-align:center;padding-block:80px;' });
    c.appendChild(el('h1', { text: '页面不存在' }));
    c.appendChild(el('p', { class: 'lead mt-3', text: '你访问的页面不存在或已移动。' }));
    c.appendChild(el('a', { class: 'btn btn-primary mt-6', href: '#/', text: '回到首页' }));
    root.appendChild(c);
    return { el: root, title: '页面不存在' };
  }

  return { Data, home, paths, courses, coursePage, chapterView, demosPage, demoPage, practice, dashboard, admin, about, institute, notFound, renderExercise, courseCard, statTile, progressBar, progressRing, difficultyDots, errorBox, loadingBlock, breadcrumbs };
})();
window.Views = Views;
