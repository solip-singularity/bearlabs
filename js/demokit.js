/* ============================================================================
 * demokit.js — 交互动画统一引擎
 * 约定：演示脚本 js/demos/<id>.js 调用 DemoKit.register(id, factory)
 * factory(root, kit) 中：
 *   - 用 kit.stage / kit.canvas / kit.setStage 构建可视化
 *   - 用 kit.controlRow()/kit.btn()/kit.range()/kit.select()/kit.badge() 构建控制条
 *   - 用 kit.playback({total, onChange}) 获得 重置/上一步/播放/下一步/速度 的标准控件
 *   - 用 kit.narrate({index,total,text}) 输出分步旁白；kit.explain(html) 输出「发生了什么」
 *   - 需要清理时返回 { destroy() {...} }
 * 支持：键盘 ←→ 单步、空格播放/暂停；系统「减弱动态效果」与低性能自动降速。
 * ==========================================================================*/
'use strict';
var DemoKit = (function () {
  const el = U.el;
  const registry = new Map();
  const scriptPromises = new Map();
  const destroyers = new WeakMap();
  let manifestCache = null;

  const PALETTE = {
    ink: '#26292E', muted: '#676B73', accent: '#46796B', accentDeep: '#3A6659',
    sand: '#C9A96A', sandInk: '#7E622D', blue: '#4E6E8E', red: '#A64F4F',
    green: '#3E7A52', bg: '#FAF7F2', surface: '#FFFFFF', border: '#E6DFD3',
    wash: '#EAF1EE', sandWash: '#F6EFE0', redWash: '#F6E7E6', blueWash: '#E9EFF4',
  };
  const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

  async function getManifest() {
    if (!manifestCache) manifestCache = fetch('content/demos/manifest.json').then((r) => r.json());
    return manifestCache;
  }
  function register(id, factory) { registry.set(id, factory); }
  function isLoaded(id) { return registry.has(id); }
  function loadScript(id) {
    if (registry.has(id)) return Promise.resolve();
    if (scriptPromises.has(id)) return scriptPromises.get(id);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/demos/' + id + '.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptPromises.delete(id); reject(new Error('演示脚本加载失败：' + id)); };
      document.head.appendChild(s);
    });
    scriptPromises.set(id, p);
    return p;
  }

  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function makeKit(ctx) {
    const kit = {
      id: ctx.id,
      stage: ctx.stage,
      bar: ctx.bar,
      palette: PALETTE,
      font: FONT,
      reducedMotion: reducedMotion(),
      _cleanups: ctx.cleanups,
      _lastRow: null,
      _next: null, _prev: null, _toggle: null,
    };
    kit.setStage = (html) => { ctx.stage.innerHTML = html; return ctx.stage; };
    kit.canvas = (w, h) => {
      const cv = document.createElement('canvas');
      cv.setAttribute('role', 'img');
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      cv.style.width = '100%'; cv.style.height = 'auto';
      const c2d = cv.getContext('2d');
      c2d.scale(dpr, dpr);
      const wrap = el('div');
      wrap.style.maxWidth = w + 'px';
      wrap.style.margin = '0 auto';
      wrap.appendChild(cv);
      ctx.stage.appendChild(wrap);
      return {
        el: wrap, canvas: cv, ctx: c2d, width: w, height: h,
        clear() { c2d.clearRect(0, 0, w, h); },
        bg(color) { c2d.fillStyle = color || PALETTE.bg; c2d.fillRect(0, 0, w, h); },
      };
    };
    kit.controlRow = () => { const r = el('div', { class: 'row' }); ctx.bar.appendChild(r); kit._lastRow = r; return r; };
    kit.btn = (label, fn, opts) => {
      opts = opts || {};
      const b = el('button', { class: 'dk-btn' + (opts.primary ? ' primary' : ''), type: 'button', text: label, disabled: !!opts.disabled });
      b.addEventListener('click', fn);
      (opts.parent || kit._lastRow || ctx.bar).appendChild(b);
      return { el: b, setDisabled: (d) => { b.disabled = d; }, setText: (t) => { b.textContent = t; } };
    };
    kit.sep = (parent) => { (parent || kit._lastRow || ctx.bar).appendChild(el('span', { class: 'dk-sep' })); };
    kit.range = (o, onInput) => {
      const wrap = el('label', { class: 'dk-param' });
      if (o.label) wrap.appendChild(el('span', { text: o.label }));
      const input = el('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value });
      const val = el('span', { class: 'dk-val', text: o.format ? o.format(o.value) : String(o.value) });
      input.addEventListener('input', () => {
        const v = Number(input.value);
        val.textContent = o.format ? o.format(v) : String(v);
        onInput && onInput(v);
      });
      wrap.appendChild(input); wrap.appendChild(val);
      (o.parent || kit._lastRow || ctx.bar).appendChild(wrap);
      return { el: wrap, input, get: () => Number(input.value), set: (v) => { input.value = v; val.textContent = o.format ? o.format(v) : String(v); } };
    };
    kit.select = (o, onChange) => {
      const wrap = el('label', { class: 'dk-param' });
      if (o.label) wrap.appendChild(el('span', { text: o.label }));
      const sel = el('select');
      o.options.forEach((op) => sel.appendChild(el('option', { value: op.value, text: op.label })));
      sel.value = o.value;
      sel.addEventListener('change', () => onChange && onChange(sel.value));
      wrap.appendChild(sel);
      (o.parent || kit._lastRow || ctx.bar).appendChild(wrap);
      return { el: wrap, get: () => sel.value, set: (v) => { sel.value = v; } };
    };
    kit.badge = (text, parent) => {
      const b = el('span', { class: 'chip chip-plain', text: text || '' });
      (parent || kit._lastRow || ctx.bar).appendChild(b);
      return { el: b, set: (t) => { b.textContent = t; } };
    };
    kit.hint = (text) => {
      const h = el('span', { class: 'dk-stepmode-hint', text: text });
      ctx.bar.appendChild(h);
      return h;
    };
    kit.legend = (items) => {
      const row = el('div', { class: 'dk-legend' });
      items.forEach((it) => {
        const span = el('span', { class: 'lg-item' });
        const sw = el('span', { class: 'lg-swatch' });
        sw.style.background = it.color;
        span.appendChild(sw);
        span.appendChild(el('span', { text: it.label }));
        row.appendChild(span);
      });
      ctx.stage.appendChild(row);
    };
    kit.narrate = (step, total, text) => {
      if (typeof step === 'object') { text = step.text; total = step.total; step = step.index; }
      ctx.step.textContent = step != null ? ('步骤 ' + (step + 1) + (total ? ' / ' + total : '')) : '';
      ctx.text.innerHTML = U.sanitize(text || '');
      ctx.narr.classList.remove('hidden');
    };
    kit.explain = (html) => {
      ctx.explain.innerHTML = U.sanitize(html || '');
      ctx.explain.classList.toggle('hidden', !html);
    };
    kit.onCleanup = (fn) => ctx.cleanups.push(fn);
    kit.playback = (o) => {
      const total = o.total || 1;
      let cur = Math.max(0, Math.min(o.index || 0, total - 1));
      let playing = false, timer = null;
      let speed = kit.reducedMotion ? 0.5 : 1;
      const base = o.baseInterval || 800;
      let slowStreak = 0;
      const row = kit.controlRow();
      const bReset = kit.btn('重置', () => { stop(); goTo(0); }, { parent: row });
      const bPrev = kit.btn('◀ 上一步', () => { stop(); goTo(cur - 1); }, { parent: row });
      const bPlay = kit.btn('▶ 播放', toggle, { parent: row, primary: true });
      const bNext = kit.btn('下一步 ▶', () => { stop(); goTo(cur + 1); }, { parent: row });
      kit.sep(row);
      const spd = kit.select({ label: '速度', options: [{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '4', label: '4×' }], value: String(speed), parent: row }, (v) => { speed = Number(v); if (playing) { restartTimer(); } });
      const badge = kit.badge('', row);
      function updateUI() {
        badge.set('第 ' + (cur + 1) + ' / ' + total + ' 步');
        bPrev.setDisabled(cur <= 0);
        bNext.setDisabled(cur >= total - 1);
        bPlay.setText(playing ? '⏸ 暂停' : (cur >= total - 1 ? '▶ 从头播放' : '▶ 播放'));
      }
      function goTo(i, silent) {
        cur = Math.max(0, Math.min(total - 1, i));
        if (!silent) { updateUI(); o.onChange && o.onChange(cur); }
      }
      function tick() {
        const t0 = Date.now();
        if (cur >= total - 1) { stop(); return; }
        goTo(cur + 1);
        const dt = Date.now() - t0;
        if (dt > (base / speed) * 2.5) {
          slowStreak++;
          if (slowStreak >= 2 && speed > 0.5) {
            speed = Math.max(0.5, speed / 2);
            slowStreak = 0;
            spd.set(String(speed));
            if (!ctx._slowed) { ctx._slowed = true; kit.hint('设备较慢，已自动放慢演示；可用「单步」查看细节'); }
            restartTimer();
          }
        } else slowStreak = 0;
      }
      function restartTimer() { clearInterval(timer); timer = setInterval(tick, base / speed); }
      function play() {
        if (cur >= total - 1) goTo(0);
        playing = true; updateUI();
        if (kit.reducedMotion && !ctx._rmHint) { ctx._rmHint = true; kit.hint('已按系统「减弱动态效果」放慢；可随时单步查看'); }
        restartTimer();
      }
      function stop() { playing = false; clearInterval(timer); timer = null; updateUI(); }
      function toggle() { playing ? stop() : play(); }
      kit._next = () => { stop(); goTo(cur + 1); };
      kit._prev = () => { stop(); goTo(cur - 1); };
      kit._toggle = toggle;
      updateUI();
      o.onChange && o.onChange(cur);
      kit.onCleanup(stop);
      return { goTo: (i) => goTo(i), next: () => goTo(cur + 1), prev: () => goTo(cur - 1), reset: () => { stop(); goTo(0); }, play, stop, toggle, current: () => cur, total };
    };
    return kit;
  }

  async function mount(container, id) {
    if (destroyers.has(container)) return; // 已挂载
    const mf = await getManifest();
    const meta = (mf.demos || []).find((d) => d.id === id) || { id, title: id };
    await loadScript(id);
    const factory = registry.get(id);
    if (typeof factory !== 'function') throw new Error('演示未注册：' + id);
    container.innerHTML = '';
    const shell = el('div', { class: 'dk-shell', tabindex: '0', role: 'group', 'aria-label': meta.title });
    const head = el('div', { class: 'dk-head' });
    head.appendChild(el('div', { class: 'dk-title', text: meta.title }));
    if (meta.courseId) head.appendChild(el('span', { class: 'dk-tag', text: String(meta.courseId).toUpperCase() + ' · 交互演示' }));
    shell.appendChild(head);
    const stage = el('div', { class: 'dk-stage' });
    shell.appendChild(stage);
    const bar = el('div', { class: 'dk-bar' });
    shell.appendChild(bar);
    const narr = el('div', { class: 'dk-narr hidden' });
    const step = el('span', { class: 'dk-narr-step', text: '' });
    const text = el('div', { class: 'dk-narr-text', text: '' });
    narr.appendChild(step); narr.appendChild(text);
    shell.appendChild(narr);
    const explain = el('div', { class: 'dk-explain hidden' });
    shell.appendChild(explain);
    container.appendChild(shell);

    const cleanups = [];
    const kit = makeKit({ id, shell, stage, bar, narr, step, text, explain, cleanups });
    let instance = null;
    try { instance = factory(shell, kit); }
    catch (e) {
      stage.innerHTML = '';
      stage.appendChild(el('div', { class: 'empty' }, [el('div', { class: 'empty-title', text: '演示初始化失败' }), el('div', { class: 'small', text: String(e.message || e) })]));
      if (window.console) console.error(e);
    }
    shell.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' && kit._next) { kit._next(); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft' && kit._prev) { kit._prev(); ev.preventDefault(); }
      else if (ev.key === ' ' && kit._toggle) { kit._toggle(); ev.preventDefault(); }
    });
    destroyers.set(container, () => {
      try { instance && instance.destroy && instance.destroy(); } catch (e) { /* noop */ }
      cleanups.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
    });
    return shell;
  }

  function unmount(container) {
    const d = destroyers.get(container);
    if (d) { d(); destroyers.delete(container); }
  }

  async function autoMount(root) {
    const nodes = U.$$('[data-demo]', root || document);
    for (const node of nodes) {
      const id = node.getAttribute('data-demo');
      if (!id || destroyers.has(node)) continue;
      try {
        await mount(node, id);
      } catch (e) {
        node.innerHTML = '';
        node.appendChild(el('div', { class: 'empty' }, [
          el('div', { class: 'empty-title', text: '演示暂时无法加载' }),
          el('div', { class: 'small', text: String(e.message || e) + '（请确认已运行本地服务并刷新）' }),
        ]));
      }
    }
  }

  return { version: '1.0', register, isLoaded, loadScript, mount, unmount, autoMount, getManifest, palette: PALETTE, font: FONT };
})();
window.DemoKit = DemoKit;
