/* ============================================================================
 * store.js — 学习进度 / 答题记录 / 时长 / 错题本 / 导入导出 / 可选账号同步
 * 存储：localStorage（key: cslearn.progress.v1），事件：progress:changed
 * ==========================================================================*/
'use strict';
var Store = (function () {
  const KEY = 'cslearn.progress.v1';
  const SCHEMA = 1;

  function blank() {
    return {
      schema: SCHEMA,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      profile: { nickname: '' },
      chapters: {},   // chapterId -> {visits, timeSpentSec, completed, completedAt, lastVisitAt, track}
      exercises: {},  // exId -> {attempts, correct, wrong, lastCorrect, lastAnswer, lastAt, mastered, needsReview}
      demos: {},      // demoId -> {visits, lastAt}
      activity: {},   // 'YYYY-MM-DD' -> seconds
      sync: { user: '', token: '' },
    };
  }

  let state = null;
  let loaded = false;

  function load() {
    if (loaded) return state;
    let raw = U.storage.get(KEY, null);
    if (!raw || typeof raw !== 'object') {
      raw = blank();
    }
    // 兼容与兜底
    state = Object.assign(blank(), raw);
    ['chapters', 'exercises', 'demos', 'activity'].forEach((k) => {
      if (!state[k] || typeof state[k] !== 'object') state[k] = {};
    });
    if (!state.sync || typeof state.sync !== 'object') state.sync = { user: '', token: '' };
    loaded = true;
    return state;
  }

  let saveTimer = null;
  function persist(immediate) {
    state.updatedAt = Date.now();
    if (immediate) {
      U.storage.set(KEY, state);
      U.emit('progress:changed', state);
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      U.storage.set(KEY, state);
      U.emit('progress:changed', state);
    }, 300);
  }

  function mutate(fn, immediate) {
    load();
    fn(state);
    persist(immediate);
  }

  const dayKey = (d) => {
    const x = d || new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };

  /* ── 章节 ─────────────────────────────────────────────────────── */
  function chapterVisit(chId, track) {
    mutate((s) => {
      const c = s.chapters[chId] || (s.chapters[chId] = { visits: 0, timeSpentSec: 0, completed: false });
      c.visits += 1;
      c.lastVisitAt = Date.now();
      if (track) c.track = track;
    });
  }
  function chapterTime(chId, sec) {
    if (!(sec > 0)) return;
    mutate((s) => {
      const c = s.chapters[chId] || (s.chapters[chId] = { visits: 0, timeSpentSec: 0, completed: false });
      c.timeSpentSec = (c.timeSpentSec || 0) + sec;
      const d = dayKey();
      s.activity[d] = (s.activity[d] || 0) + sec;
    });
  }
  function chapterComplete(chId, done) {
    mutate((s) => {
      const c = s.chapters[chId] || (s.chapters[chId] = { visits: 0, timeSpentSec: 0 });
      c.completed = !!done;
      c.completedAt = done ? Date.now() : null;
      s.chapters[chId] = c;
    }, true);
  }
  function setTrackChoice(chId, track) {
    mutate((s) => {
      const c = s.chapters[chId] || (s.chapters[chId] = { visits: 0, timeSpentSec: 0, completed: false });
      c.track = track;
    });
  }

  /* ── 习题 ─────────────────────────────────────────────────────── */
  function recordAnswer(exId, correct, answer) {
    mutate((s) => {
      const e = s.exercises[exId] || (s.exercises[exId] = { attempts: 0, correct: 0, wrong: 0 });
      e.attempts += 1;
      e.lastAt = Date.now();
      e.lastAnswer = answer == null ? '' : String(answer).slice(0, 500);
      if (correct === true) { e.correct += 1; e.lastCorrect = true; }
      else if (correct === false) { e.wrong += 1; e.lastCorrect = false; }
      else { e.lastCorrect = null; } // 查看类操作不判分
      if (e.mastered && correct === false) e.mastered = false;
    }, true);
  }
  function selfAssess(exId, mastered) {
    mutate((s) => {
      const e = s.exercises[exId] || (s.exercises[exId] = { attempts: 0, correct: 0, wrong: 0 });
      e.mastered = !!mastered;
      e.lastAt = Date.now();
      if (mastered) e.needsReview = false;
    }, true);
  }
  function markNeedsReview(exId, flag) {
    mutate((s) => {
      const e = s.exercises[exId] || (s.exercises[exId] = { attempts: 0, correct: 0, wrong: 0 });
      e.needsReview = !!flag;
      if (flag) e.mastered = false;
    }, true);
  }

  /* ── 演示 ─────────────────────────────────────────────────────── */
  function demoVisit(demoId) {
    mutate((s) => {
      const d = s.demos[demoId] || (s.demos[demoId] = { visits: 0 });
      d.visits += 1;
      d.lastAt = Date.now();
    });
  }

  /* ── 统计 ─────────────────────────────────────────────────────── */
  function stats() {
    load();
    const ex = Object.values(state.exercises);
    const totalAttempts = ex.reduce((a, e) => a + (e.attempts || 0), 0);
    const correct = ex.reduce((a, e) => a + (e.correct || 0), 0);
    const wrong = ex.reduce((a, e) => a + (e.wrong || 0), 0);
    const answered = ex.filter((e) => e.attempts > 0).length;
    const chaptersDone = Object.entries(state.chapters).filter(([, c]) => c.completed).length;
    const totalTime = Object.values(state.chapters).reduce((a, c) => a + (c.timeSpentSec || 0), 0);
    const days = Object.keys(state.activity).sort();
    return {
      chaptersDone,
      totalTime,
      totalAttempts,
      correct,
      wrong,
      answered,
      accuracy: correct + wrong > 0 ? correct / (correct + wrong) : null,
      activeDays: days.length,
      lastActiveDay: days.length ? days[days.length - 1] : null,
    };
  }
  function activitySeries(days) {
    load();
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ day: dayKey(d), sec: state.activity[dayKey(d)] || 0 });
    }
    return out;
  }
  function wrongList() {
    load();
    return Object.entries(state.exercises)
      .filter(([, e]) => (e.wrong > 0 || e.lastCorrect === false) && !e.mastered)
      .map(([id, e]) => ({ id, ...e }));
  }
  function chapterStatus(chId) {
    load();
    return state.chapters[chId] || null;
  }
  function courseProgress(chapterIds) {
    load();
    let done = 0;
    chapterIds.forEach((id) => { if (state.chapters[id] && state.chapters[id].completed) done++; });
    return { done, total: chapterIds.length, pct: chapterIds.length ? done / chapterIds.length : 0 };
  }

  /* ── 导入导出 ─────────────────────────────────────────────────── */
  function exportObject() {
    load();
    return JSON.parse(JSON.stringify(state));
  }
  function exportJSONText() { return JSON.stringify(exportObject(), null, 2); }
  function exportCSV_exercises() {
    load();
    const rows = [['题目ID', '尝试次数', '答对', '答错', '最近一次是否正确', '是否已掌握', '最近作答时间']];
    Object.entries(state.exercises).sort().forEach(([id, e]) => {
      rows.push([id, e.attempts || 0, e.correct || 0, e.wrong || 0,
        e.lastCorrect === true ? '是' : e.lastCorrect === false ? '否' : '',
        e.mastered ? '是' : '', e.lastAt ? U.fmtDateTime(e.lastAt) : '']);
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }
  function exportCSV_chapters() {
    load();
    const rows = [['章节ID', '学习次数', '累计时长(秒)', '是否完成', '完成时间', '最近访问时间']];
    Object.entries(state.chapters).sort().forEach(([id, c]) => {
      rows.push([id, c.visits || 0, Math.round(c.timeSpentSec || 0), c.completed ? '是' : '',
        c.completedAt ? U.fmtDateTime(c.completedAt) : '', c.lastVisitAt ? U.fmtDateTime(c.lastVisitAt) : '']);
    });
    return rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }
  function importJSONText(text, mode) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON 解析失败：' + e.message }; }
    if (!data || typeof data !== 'object' || typeof data.chapters !== 'object') {
      return { ok: false, error: '文件格式不符合本站备份格式（缺少 chapters 字段）' };
    }
    load();
    if (mode === 'replace') {
      state = Object.assign(blank(), data);
      if (!state.sync || typeof state.sync !== 'object') state.sync = { user: '', token: '' };
      // 不覆盖当前登录态以外的本地 token 可保留
      persist(true);
      return { ok: true, mode: 'replace' };
    }
    // merge：按字段深合并，时间较新优先
    const merged = Object.assign(blank(), state);
    ['chapters', 'exercises', 'demos', 'activity'].forEach((k) => {
      const src = data[k] || {};
      const dst = merged[k] = Object.assign({}, merged[k]);
      Object.entries(src).forEach(([id, v]) => {
        if (!dst[id]) { dst[id] = v; return; }
        const a = dst[id]; const b = v;
        const at = a.lastAt || a.lastVisitAt || a.completedAt || 0;
        const bt = b.lastAt || b.lastVisitAt || b.completedAt || 0;
        if (bt >= at) dst[id] = Object.assign({}, a, b);
      });
    });
    persist(true);
    return { ok: true, mode: 'merge' };
  }
  function resetAll() {
    state = blank();
    persist(true);
  }

  /* ── 可选账号同步（需在后端开启时使用） ───────────────────────── */
  let apiBase = ''; // 同源
  function syncCreds() { load(); return state.sync; }
  async function api(path, opts) {
    const res = await fetch(apiBase + path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
    }, opts));
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
    return data;
  }
  async function backendAlive() {
    try { const r = await api('/api/health'); return !!r.ok; } catch { return false; }
  }
  async function register(username, password) {
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    mutate((s) => { s.sync = { user: r.username, token: r.token }; }, true);
    return r;
  }
  async function login(username, password) {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    mutate((s) => { s.sync = { user: r.username, token: r.token }; }, true);
    return r;
  }
  function logout() {
    mutate((s) => { s.sync = { user: '', token: '' }; }, true);
  }
  async function syncPush() {
    load();
    if (!state.sync.token) throw new Error('请先登录同步账号');
    const r = await api('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.sync.token },
      body: JSON.stringify({ data: exportObject() }),
    });
    return r;
  }
  async function syncPull() {
    load();
    if (!state.sync.token) throw new Error('请先登录同步账号');
    const r = await api('/api/sync', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + state.sync.token },
    });
    if (r && r.data) {
      importJSONText(JSON.stringify(r.data), 'merge');
      return { ok: true, updatedAt: r.updatedAt };
    }
    return { ok: false };
  }

  return {
    load, get: () => { load(); return state; },
    chapterVisit, chapterTime, chapterComplete, setTrackChoice, chapterStatus,
    recordAnswer, selfAssess, markNeedsReview,
    demoVisit,
    stats, activitySeries, wrongList, courseProgress,
    exportObject, exportJSONText, exportCSV_exercises, exportCSV_chapters, importJSONText, resetAll,
    syncCreds, backendAlive, register, login, logout, syncPush, syncPull,
  };
})();
window.Store = Store;
