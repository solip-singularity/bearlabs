/* ============================================================================
 * problems.js — 「必刷题」数据与进度引擎（挂到 window.PB）
 * 数据：content/problems/manifest.json（题目索引）+ content/problems/<subject>.json（全文）
 * 进度：localStorage key = cslearn.problems.v1（独立于课程学习记录 cslearn.progress.v1）
 * 事件：U.emit('problems:changed', state)
 * ==========================================================================*/
'use strict';
var PB = (function () {
  const KEY = 'cslearn.problems.v1';
  const DECK_KEY = 'pb.deck.v1';
  const SCHEMA = 1;

  const SUBJ_ORDER = ['ds', 'co', 'os', 'net', 'pl', 'algo', 'db', 'brain'];
  const SUBJ_FALLBACK = {
    ds: '数据结构', co: '计算机组成原理', os: '操作系统', net: '计算机网络',
    pl: '编程语言基础', algo: '算法与复杂度', db: '数据库', brain: '智力·场景面试',
  };
  const TYPE_LABEL = { single: '单选', multi: '多选', judge: '判断', fill: '填空', short: '简答', code: '代码/算法', complexity: '复杂度分析' };
  const TYPE_ORDER = ['single', 'multi', 'judge', 'fill', 'short', 'code', 'complexity'];
  const DIFF_LABEL = { 1: '入门', 2: '进阶', 3: '冲刺' };
  const OBJ_TYPES = ['single', 'multi', 'judge', 'fill'];

  /* ── 数据访问 ── */
  let manifestCache = null;
  const subjectCache = new Map();
  async function fetchJSON(path) {
    const r = await fetch(path, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + path);
    return r.json();
  }
  function manifest() {
    if (!manifestCache) manifestCache = fetchJSON('content/problems/manifest.json');
    return manifestCache;
  }
  function subjectData(id) {
    if (subjectCache.has(id)) return subjectCache.get(id);
    const p = fetchJSON('content/problems/' + id + '.json').catch((e) => { subjectCache.delete(id); throw e; });
    subjectCache.set(id, p);
    return p;
  }
  async function question(id) {
    const mf = await manifest();
    const it = (mf.index || []).find((x) => x.id === id);
    if (!it) throw new Error('未找到题目：' + id);
    const data = await subjectData(it.s);
    const q = (data.questions || []).find((x) => x.id === id);
    if (!q) throw new Error('题目数据异常：' + id);
    return q;
  }

  /* ── 本地存储（做题记录 / 收藏 / 偏好） ── */
  function blank() {
    return { schema: SCHEMA, updatedAt: Date.now(), attempts: {}, fav: [], prefs: { explain: 'pro' } };
  }
  let state = null;
  function load() {
    if (state) return state;
    let raw = U.storage.get(KEY, null);
    if (!raw || typeof raw !== 'object') raw = blank();
    state = Object.assign(blank(), raw);
    if (!state.attempts || typeof state.attempts !== 'object') state.attempts = {};
    if (!Array.isArray(state.fav)) state.fav = [];
    state.fav = state.fav.filter((x) => typeof x === 'string');
    if (!state.prefs || typeof state.prefs !== 'object') state.prefs = { explain: 'pro' };
    if (state.prefs.explain !== 'kid') state.prefs.explain = 'pro';
    return state;
  }
  function persist() {
    load();
    state.updatedAt = Date.now();
    U.storage.set(KEY, state);
    U.emit('problems:changed', state);
  }
  function record(id, result, choice) {
    load();
    const a = state.attempts[id] || (state.attempts[id] = { n: 0 });
    a.n += 1;
    a.last = result;
    a.ts = Date.now();
    if (choice !== undefined) a.choice = choice;
    persist();
  }
  function attemptOf(id) { load(); return state.attempts[id] || null; }
  function statusOf(id) {
    const a = attemptOf(id);
    if (!a || !a.last) return 'new';
    return (a.last === 'ok' || a.last === 'selfok') ? 'ok' : 'no';
  }
  function toggleFav(id) {
    load();
    const i = state.fav.indexOf(id);
    if (i >= 0) state.fav.splice(i, 1); else state.fav.push(id);
    persist();
    return state.fav.indexOf(id) >= 0;
  }
  function isFav(id) { load(); return state.fav.indexOf(id) >= 0; }
  function prefExplain(v) {
    load();
    if (v === 'pro' || v === 'kid') { state.prefs.explain = v; persist(); }
    return state.prefs.explain;
  }
  function reset() { state = blank(); persist(); }

  /* ── 判分 ── */
  function normText(s) {
    return String(s == null ? '' : s).trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？；：、,.!?;:（）()]/g, '');
  }
  function fillMatch(q, input) {
    const v = normText(input);
    if (!v) return false;
    return (q.answer || []).some((a) => normText(a) === v);
  }
  function grade(q, picked) {
    if (q.type === 'single') return picked === q.answer;
    if (q.type === 'judge') return picked === q.answer;
    if (q.type === 'multi') {
      if (!Array.isArray(picked)) return false;
      const a = picked.slice().sort().join('');
      const b = (q.answer || []).slice().sort().join('');
      return a.length > 0 && a === b;
    }
    if (q.type === 'fill') return fillMatch(q, picked);
    return null; /* 主观题自评 */
  }

  /* ── 统计 / 筛选 / 题组 ── */
  function stats(index) {
    load();
    let done = 0; let ok = 0; let no = 0; let objDone = 0; let objOk = 0; let selfDone = 0;
    index.forEach((it) => {
      const a = state.attempts[it.id];
      if (!a || !a.last) return;
      done++;
      if (a.last === 'ok' || a.last === 'selfok') ok++; else no++;
      if (OBJ_TYPES.indexOf(it.ty) >= 0) { objDone++; if (a.last === 'ok') objOk++; }
      else selfDone++;
    });
    return {
      total: index.length, done, ok, wrong: no, fav: state.fav.length, selfDone,
      pct: index.length ? done / index.length : 0,
      accuracy: objDone ? objOk / objDone : null,
      objDone,
    };
  }
  function filterIndex(index, f) {
    load();
    f = f || {};
    const kw = String(f.kw || '').trim().toLowerCase();
    return index.filter((it) => {
      if (f.subject && f.subject !== 'all' && it.s !== f.subject) return false;
      if (f.type && f.type !== 'all' && it.ty !== f.type) return false;
      if (f.difficulty && f.difficulty !== 'all' && String(it.df) !== String(f.difficulty)) return false;
      if (kw) {
        const hay = (it.stem + ' ' + it.tp + ' ' + (SUBJ_FALLBACK[it.s] || '')).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      const st = statusOf(it.id);
      if (f.status === 'new' && st !== 'new') return false;
      if (f.status === 'wrong' && st !== 'no') return false;
      if (f.status === 'done' && st === 'new') return false;
      if (f.status === 'fav' && state.fav.indexOf(it.id) < 0) return false;
      return true;
    });
  }
  function deckIds(index, f) { return filterIndex(index, f).map((x) => x.id); }
  function randomId(index, f) {
    const list = deckIds(index, f);
    if (!list.length) return null;
    const news = list.filter((id) => statusOf(id) === 'new');
    const pool = news.length ? news : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function wrongIds(index) {
    return index.filter((x) => statusOf(x.id) === 'no').map((x) => x.id);
  }

  /* ── 导出 ── */
  function exportJSONText() {
    load();
    return JSON.stringify({ exportedAt: new Date().toISOString(), key: KEY, data: state }, null, 2);
  }
  function exportCSV(index) {
    load();
    const rows = [['题号', '科目', '考点', '题型', '难度', '状态', '作答次数', '最近结果', '最近作答时间']];
    index.forEach((it) => {
      const a = state.attempts[it.id] || {};
      const st = statusOf(it.id);
      rows.push([
        it.id, SUBJ_FALLBACK[it.s] || it.s, it.tp, TYPE_LABEL[it.ty] || it.ty, DIFF_LABEL[it.df] || it.df,
        st === 'new' ? '未做' : (st === 'ok' ? '已做对' : '做错/待复习'),
        a.n || 0, a.last || '', a.ts ? U.fmtDateTime(a.ts) : '',
      ]);
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }

  /* ── 题组会话（刷新不丢） ── */
  function saveDeck(d) { try { sessionStorage.setItem(DECK_KEY, JSON.stringify(d)); } catch (e) { /* noop */ } }
  function loadDeck() {
    try {
      const s = sessionStorage.getItem(DECK_KEY);
      const d = s ? JSON.parse(s) : null;
      return (d && Array.isArray(d.ids) && d.ids.length) ? d : null;
    } catch (e) { return null; }
  }
  function clearDeck() { try { sessionStorage.removeItem(DECK_KEY); } catch (e) { /* noop */ } }

  return {
    KEY, DECK_KEY, SUBJ_ORDER, SUBJ_FALLBACK, TYPE_LABEL, TYPE_ORDER, DIFF_LABEL, OBJ_TYPES,
    manifest, subjectData, question,
    load, record, attemptOf, statusOf, toggleFav, isFav, prefExplain, reset,
    grade, fillMatch, normText,
    stats, filterIndex, deckIds, randomId, wrongIds,
    subjName: (id) => SUBJ_FALLBACK[id] || id,
    exportJSONText, exportCSV,
    saveDeck, loadDeck, clearDeck,
  };
})();
window.PB = PB;
