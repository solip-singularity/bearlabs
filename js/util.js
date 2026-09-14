/* ============================================================================
 * util.js — 基础工具库（无依赖，经典脚本，挂到 window.U）
 * ==========================================================================*/
'use strict';
var U = (function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ── DOM 构建 ───────────────────────────────────────────────────── */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  /* ── 安全与转义 ─────────────────────────────────────────────────── */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /** 内容 HTML 净化（内容为自研，双保险移除危险片段） */
  function sanitize(html) {
    let s = String(html == null ? '' : html);
    s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
    s = s.replace(/<script[^>]*>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
    s = s.replace(/<(iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '');
    s = s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/(href|src|xlink:href)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
    return s;
  }

  /* ── 格式化 ─────────────────────────────────────────────────────── */
  const pad2 = (n) => String(n).padStart(2, '0');
  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return `${fmtDate(ts)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    if (sec < 60) return sec + ' 秒';
    const m = Math.floor(sec / 60);
    if (m < 60) return m + ' 分钟';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`;
  }
  function fmtPct(x, digits) {
    if (!isFinite(x)) return '—';
    return (x * 100).toFixed(digits == null ? 0 : digits) + '%';
  }
  function fmtNum(n) {
    return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* ── 通用 ───────────────────────────────────────────────────────── */
  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ── 事件总线 ───────────────────────────────────────────────────── */
  const bus = new EventTarget();
  const on = (evt, cb) => bus.addEventListener(evt, cb);
  const emit = (evt, detail) => bus.dispatchEvent(new CustomEvent(evt, { detail }));

  /* ── 滚动（不用 scrollIntoView） ────────────────────────────────── */
  function scrollToTop(smooth) {
    window.scrollTo({ top: 0, behavior: smooth === false ? 'auto' : 'smooth' });
  }
  function scrollToEl(el, offset) {
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.pageYOffset - (offset == null ? 84 : offset);
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /* ── Toast ──────────────────────────────────────────────────────── */
  function toast(msg, kind) {
    const root = $('#toast-root');
    if (!root) return;
    const t = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), role: 'status', text: msg });
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 200ms'; }, 2400);
    setTimeout(() => t.remove(), 2700);
  }

  /* ── 弹窗 ───────────────────────────────────────────────────────── */
  function modal(opts) {
    const root = $('#modal-root');
    const mask = el('div', { class: 'modal-mask', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '对话框' });
    const box = el('div', { class: 'modal' });
    if (opts.title) box.appendChild(el('div', { class: 'modal-title', text: opts.title }));
    if (opts.html != null) box.appendChild(el('div', { class: 'modal-body', html: sanitize(opts.html) }));
    if (opts.body != null) box.appendChild(opts.body);
    const actions = el('div', { class: 'modal-actions' });
    (opts.actions || []).forEach((a) => {
      if (a.ghost) { actions.appendChild(el('span', { style: 'flex:1' })); return; }
      actions.appendChild(el('button', {
        class: 'btn ' + (a.primary ? 'btn-primary' : 'btn-secondary'),
        type: 'button', text: a.label,
        onclick: () => { if (!a.action || a.action() !== false) close(); },
      }));
    });
    box.appendChild(actions);
    mask.appendChild(box);
    const close = () => { mask.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
    root.appendChild(mask);
    const f = box.querySelector('input, select, textarea, button.btn');
    if (f) f.focus();
    return close;
  }
  function confirmDialog(message, opts) {
    return new Promise((resolve) => {
      modal({
        title: (opts && opts.title) || '请确认',
        html: '<p style="margin:0;line-height:1.8;">' + escapeHtml(message) + '</p>',
        actions: [
          { label: '取消', action: () => { resolve(false); } },
          { label: (opts && opts.okLabel) || '确定', primary: true, action: () => { resolve(true); } },
        ],
        onClose: () => setTimeout(() => resolve(false), 0),
      });
    });
  }

  /* ── 下载 / 剪贴板 ──────────────────────────────────────────────── */
  function download(filename, text, mime) {
    const blob = new Blob(['\uFEFF' + text], { type: (mime || 'application/octet-stream') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('已复制', 'success'); }
    catch { toast('复制失败，请手动选择文本', 'error'); }
  }

  /* ── 存储 ───────────────────────────────────────────────────────── */
  const storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(key); } catch { /* noop */ } },
    available() {
      try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
      catch { return false; }
    },
  };

  /* ── 图标 ───────────────────────────────────────────────────────── */
  const ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    'arrow-right': '<path d="M4 12h15M13 5.5 19.5 12 13 18.5"/>',
    'arrow-left': '<path d="M20 12H5M11 5.5 4.5 12 11 18.5"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.4 11 15.4 16.5 9.4"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.6-3.6 4.7-5.2 8-5.2s6.4 1.6 8 5.2"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    'step-f': '<path d="M6 5v14M10 12 17.5 5.5v13z"/>',
    'step-b': '<path d="M18 5v14M14 12 6.5 5.5v13z"/>',
    reset: '<path d="M20 11a8 8 0 1 0-3 6.3"/><path d="M20 5v6h-6"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10.5V17M12 7.2v.3"/>',
    warn: '<path d="M12 3.5 22 20H2z"/><path d="M12 10v4.5M12 17.6v.2"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M8 7h8"/>',
    layers: '<path d="M12 3 21 8.5 12 14 3 8.5z"/><path d="M3 14l9 5.5L21 14"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h9"/>',
    doc: '<path d="M6 2.5h8l4 4V21.5H6z"/><path d="M9 12h6M9 16h6"/>',
    home: '<path d="M3.5 11 12 3.5 20.5 11"/><path d="M5.5 9.5V20h13V9.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    list: '<path d="M8.5 6h11M8.5 12h11M8.5 18h11"/><path d="M4.5 6h.2M4.5 12h.2M4.5 18h.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    cal: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    flame: '<path d="M12 3c1.2 3.8-4.5 5.6-4.5 10.4a4.5 4.5 0 0 0 9 0c0-2-1-3.4-1.6-4.2 0 0-.4 1.8-1.9 1.8-1 0-1-2.2-1-8z"/>',
    flask: '<path d="M10 3h4M10 3v5L5 18.6A2 2 0 0 0 6.8 21.5h10.4A2 2 0 0 0 19 18.6L14 8V3"/><path d="M7.5 15h9"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
    pencil: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4.4l2.1-2.1a4.5 4.5 0 1 0-6.4-6.4L11 7"/><path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-2.1 2.1a4.5 4.5 0 1 0 6.4 6.4L13 17"/>',
  };
  function icon(name, cls) {
    const p = ICON_PATHS[name] || ICON_PATHS.info;
    return `<svg class="${cls || 'ico'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  /* ── 节流观察（可见性） ────────────────────────────────────────── */
  function isVisible() { return document.visibilityState === 'visible'; }

  function formatMinutes(m) { return m >= 60 ? (m / 60).toFixed(1).replace(/\.0$/, '') + ' 小时' : m + ' 分钟'; }

  return {
    $, $$, el, escapeHtml, sanitize,
    fmtDate, fmtDateTime, fmtDuration, fmtPct, fmtNum, formatMinutes,
    debounce, clamp, uid, escapeRegExp,
    bus, on, emit,
    scrollToTop, scrollToEl,
    toast, modal, confirmDialog,
    download, copyText,
    storage, icon, isVisible,
  };
})();
window.U = U;
