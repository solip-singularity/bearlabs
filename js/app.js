/* ============================================================================
 * app.js — 路由 / 顶栏 / 搜索 / 启动
 * ==========================================================================*/
'use strict';
var App = (function () {
  const { $, $$, el } = U;
  let current = null;
  let renderToken = 0;

  const NAV = [
    { href: '#/', label: '首页', match: (r) => r.name === 'home' },
    { href: '#/courses', label: '课程', match: (r) => ['courses', 'course', 'chapter'].indexOf(r.name) >= 0 },
    { href: '#/paths', label: '学习路径', match: (r) => r.name === 'paths' },
    { href: '#/demos', label: '演示实验室', match: (r) => r.name === 'demos' || r.name === 'demo' },
    { href: '#/practice', label: '练习中心', match: (r) => r.name === 'practice' },
    { href: '#/dashboard', label: '我的进度', match: (r) => ['dashboard', 'admin'].indexOf(r.name) >= 0 },
    { href: '#/about', label: '关于', match: (r) => ['about', 'institute'].indexOf(r.name) >= 0 },
  ];

  function parseRoute() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const parts = raw.split('#');
    const path = parts[0] || '/';
    const anchor = parts[1] || '';
    const seg = path.split('/').filter(Boolean);
    const base = { anchor };
    if (!seg.length) return Object.assign(base, { name: 'home' });
    const simple = ['paths', 'courses', 'demos', 'practice', 'dashboard', 'admin', 'about', 'institute'];
    if (simple.indexOf(seg[0]) >= 0) return Object.assign(base, { name: seg[0] });
    if (seg[0] === 'course' && seg[1]) return Object.assign(base, { name: 'course', id: seg[1] });
    if (seg[0] === 'chapter' && seg[1] && seg[2]) return Object.assign(base, { name: 'chapter', courseId: seg[1], chapterId: seg[2] });
    if (seg[0] === 'demo' && seg[1]) return Object.assign(base, { name: 'demo', id: seg[1] });
    return Object.assign(base, { name: 'notFound' });
  }

  function renderNav(route) {
    const top = $('#topnav');
    const mob = $('#mobilenav');
    top.innerHTML = '';
    mob.innerHTML = '';
    NAV.forEach((n) => {
      const active = n.match(route);
      const a1 = el('a', { href: n.href, text: n.label });
      if (active) a1.classList.add('active');
      top.appendChild(a1);
      const a2 = el('a', { href: n.href, text: n.label });
      if (active) a2.classList.add('active');
      mob.appendChild(a2);
    });
  }

  async function render() {
    const token = ++renderToken;
    const route = parseRoute();
    const app = $('#app');
    if (current && current.cleanup) { try { current.cleanup(); } catch (e) { /* noop */ } }
    current = null;
    renderNav(route);
    let view;
    try {
      switch (route.name) {
        case 'home': view = await Views.home(); break;
        case 'paths': view = await Views.paths(); break;
        case 'courses': view = await Views.courses(); break;
        case 'course': view = await Views.coursePage(route); break;
        case 'chapter': view = await Views.chapterView(route); break;
        case 'demos': view = await Views.demosPage(); break;
        case 'demo': view = await Views.demoPage(route); break;
        case 'practice': view = await Views.practice(); break;
        case 'dashboard': view = await Views.dashboard(); break;
        case 'admin': view = await Views.admin(); break;
        case 'about': view = await Views.about(); break;
        case 'institute': view = await Views.institute(); break;
        default: view = Views.notFound(); break;
      }
    } catch (e) {
      view = { el: el('div', { class: 'container', style: 'padding-block:64px;' }, [Views.errorBox(e, () => render())]), title: '出错了' };
    }
    if (token !== renderToken) return;
    app.innerHTML = '';
    app.appendChild(view.el);
    document.title = (view.title && route.name !== 'home') ? (view.title + ' · 贝尔实验室 Bearlabs') : '贝尔实验室 · 计算机知识学习站（从入门到入坟）';
    if (view.onMount) { try { view.onMount(view.el); } catch (e) { if (window.console) console.error(e); } }
    current = { cleanup: view.cleanup };
    if (route.anchor === 'exercises' || route.anchor === 'demos') {
      const t = document.getElementById(route.anchor);
      if (t) setTimeout(() => U.scrollToEl(t, 100), 80);
      else window.scrollTo({ top: 0, behavior: 'auto' });
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  /* ── 搜索 ─────────────────────────────────────────────────────── */
  function setupSearch() {
    const input = $('#search-input');
    const box = $('#search-results');
    if (!input) return;
    let index = null;
    async function ensureIndex() {
      if (index) return index;
      try {
        const all = await Views.Data.allCourses();
        const items = [];
        all.courses.forEach((c) => {
          items.push({ title: c.title, sub: '课程 · ' + (c.level || ''), href: '#/course/' + c.id, kw: [c.title, c.short || '', c.level || ''].join(' ') });
          if (c._loaded) {
            Views.Data.flatten(c).forEach((x) => {
              items.push({
                title: x.chapter.title,
                sub: c.title + ' · ' + (x.unit.title || ''),
                href: '#/chapter/' + c.id + '/' + x.chapter.id,
                kw: [x.chapter.title, x.chapter.objective || '', (x.chapter.keywords || []).join(' ')].join(' '),
              });
            });
          }
        });
        index = items;
      } catch (e) { index = []; }
      return index;
    }
    const onInput = U.debounce(async () => {
      const q = input.value.trim();
      if (!q) { hide(); return; }
      const items = await ensureIndex();
      const ql = q.toLowerCase();
      const res = items.filter((it) => (it.title + ' ' + (it.sub || '') + ' ' + (it.kw || '')).toLowerCase().indexOf(ql) >= 0).slice(0, 12);
      box.innerHTML = '';
      if (!res.length) {
        const empty = el('div', { class: 'sr-sub', text: '没有找到相关课程或章节' });
        empty.style.padding = '8px 10px';
        box.appendChild(empty);
      }
      res.forEach((r) => {
        const a = el('a', { href: r.href }, [el('div', { class: 'sr-title', text: r.title }), el('div', { class: 'sr-sub', text: r.sub || '' })]);
        a.addEventListener('click', () => hide());
        box.appendChild(a);
      });
      box.classList.remove('hidden');
    }, 150);
    input.addEventListener('input', onInput);
    input.addEventListener('focus', () => { ensureIndex(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { input.blur(); hide(); }
      else if (e.key === 'Enter') {
        const first = box.querySelector('a');
        if (first) { e.preventDefault(); first.click(); }
      }
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.searchbox')) hide(); });
    function hide() { box.classList.add('hidden'); }
  }

  /* ── 启动 ─────────────────────────────────────────────────────── */
  function boot() {
    renderNav({ name: 'home' });
    /* 邮箱链接组装（来源中的地址分片，渲染时拼合；保持不变可见与可复制） */
    $$('[data-user][data-domain]').forEach((a) => {
      const em = a.getAttribute('data-user') + '@' + a.getAttribute('data-domain');
      a.setAttribute('href', 'mailto:' + em);
      a.textContent = em;
      a.setAttribute('title', '点击打开邮件客户端给作者写信');
    });
    setupSearch();
    const menuBtn = $('#menu-btn');
    const mnav = $('#mobilenav');
    if (menuBtn && mnav) {
      menuBtn.addEventListener('click', () => {
        const open = mnav.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      mnav.addEventListener('click', (e) => { if (e.target.tagName === 'A') mnav.classList.remove('open'); });
    }
    const st = $('#scroll-top');
    if (st) {
      window.addEventListener('scroll', () => { st.classList.toggle('show', window.scrollY > 600); }, { passive: true });
      st.addEventListener('click', () => U.scrollToTop());
    }
    const syncBtn = $('#sync-btn');
    if (syncBtn) {
      Store.backendAlive().then((alive) => {
        if (alive) {
          syncBtn.style.display = '';
          syncBtn.addEventListener('click', () => { location.hash = '#/dashboard'; });
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag)) {
        e.preventDefault();
        const si = $('#search-input');
        if (si) si.focus();
      }
    });
    window.addEventListener('hashchange', () => render());
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { refresh: render, parseRoute };
})();
window.App = App;
