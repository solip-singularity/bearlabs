/* ============================================================================
 * views-problems.js — 「必刷题」视图（题库列表 / 刷题会话 / 单题 / 错题本 / 收藏 / 统计）
 * 依赖：U（工具）、PB（数据与进度引擎）、Views（通用组件）；挂载：Views.problems(route)
 * 路由：#/problems · #/problems/wrong · #/problems/fav · #/problems/stats
 *       #/problems/do（题组会话）· #/problems/q/<id>（单题）
 * ==========================================================================*/
'use strict';
(function () {
  const { el, icon, toast, confirmDialog, download, fmtPct, fmtDate, debounce } = U;
  const V = window.Views;
  const PAGE_SIZE = 40;

  /* ── 小部件 ─────────────────────────────────────────────────────── */
  function stripPrefix(s) { return String(s).replace(/^[A-Fa-f][.．、:：]?\s*/, ''); }
  function diffChip(df) { return el('span', { class: 'pb-diff d' + df, text: PB.DIFF_LABEL[df] || String(df) }); }
  function typeChip(t) { return el('span', { class: 'chip chip-plain', text: PB.TYPE_LABEL[t] || t }); }
  function subjChip(id, name) { return el('span', { class: 'chip chip-plain', text: name || PB.subjName(id) }); }
  function statusIcon(id) {
    const st = PB.statusOf(id);
    const kind = st === 'ok' ? 'ok' : st === 'no' ? 'no' : 'new';
    const span = el('span', { class: 'pb-st ' + kind, 'aria-hidden': 'true' });
    if (kind === 'ok') span.innerHTML = icon('check-circle');
    else if (kind === 'no') span.innerHTML = icon('close');
    return span;
  }
  function subjNameOf(mf, id) {
    const s = (mf.subjects || []).find((x) => x.id === id);
    return s ? s.name : PB.subjName(id);
  }
  function tabs(active, mf) {
    const st = PB.stats(mf.index);
    const nav = el('nav', { class: 'pb-tabs', 'aria-label': '必刷题内导航' });
    [['', '题库', null], ['wrong', '错题本', st.wrong], ['fav', '收藏', st.fav], ['stats', '统计', null]].forEach(([key, label, n]) => {
      const a = el('a', { href: key ? '#/problems/' + key : '#/problems', text: label });
      if ((active || '') === key) a.classList.add('active');
      if (n) a.appendChild(el('span', { class: 'pb-tab-n', text: '（' + n + '）' }));
      nav.appendChild(a);
    });
    return nav;
  }
  function head(active, mf) {
    const box = el('div', { class: 'pb-head' });
    box.appendChild(el('h1', { text: '必刷题' }));
    box.appendChild(el('p', { class: 'pb-sub', text: '只刷题，不上课：' + mf.total + ' 道计算机面试与 408 考研经典题。每题都有「专业版 + 宝宝巴士版」双解析；单选、多选、判断、填空即时判分，简答、代码与复杂度分析对照参考答案自评；答错自动进错题本。' }));
    box.appendChild(tabs(active, mf));
    return box;
  }
  function questionRow(it, opts) {
    opts = opts || {};
    const a = el('a', { class: 'pb-row', href: '#/problems/q/' + encodeURIComponent(it.id) });
    a.appendChild(el('span', { class: 'pb-idx', text: opts.no || it.id.slice(-3) }));
    const main = el('div', { class: 'pb-rowmain' });
    main.appendChild(el('div', { class: 'pb-rowstem', text: it.stem }));
    const meta = el('div', { class: 'pb-rowmeta' });
    meta.appendChild(diffChip(it.df));
    meta.appendChild(typeChip(it.ty));
    meta.appendChild(subjChip(it.s, opts.subjName));
    meta.appendChild(el('span', { text: it.tp }));
    if (PB.isFav(it.id)) meta.appendChild(el('span', { class: 'chip chip-sand', text: '收藏' }));
    main.appendChild(meta);
    a.appendChild(main);
    a.appendChild(statusIcon(it.id));
    return a;
  }

  /* ── 单题作答卡（核心组件） ─────────────────────────────────────── */
  function renderQuestion(q, opts) {
    opts = opts || {};
    const sid = q.id.split('-')[1];
    const card = el('div', { class: 'pb-quiz' });

    /* 元信息 */
    const meta = el('div', { class: 'pb-qmeta' });
    meta.appendChild(diffChip(q.difficulty));
    meta.appendChild(typeChip(q.type));
    meta.appendChild(subjChip(sid, opts.subjName));
    meta.appendChild(el('span', { class: 'chip chip-plain', text: q.topic }));
    const att = PB.attemptOf(q.id);
    if (att && att.last) {
      const label = att.last === 'ok' ? '答对' : att.last === 'selfok' ? '自评答对' : att.last === 'selfno' ? '需复习' : '答错';
      meta.appendChild(el('span', { class: 'chip chip-plain', text: '上次：' + label + '（第 ' + att.n + ' 次）' }));
    }
    if (opts.pos) meta.appendChild(el('span', { class: 'pb-pos', text: opts.pos }));
    card.appendChild(meta);

    /* 题干（纯文本，保留换行） */
    card.appendChild(el('div', { class: 'pb-stem', text: q.stem }));

    const zone = el('div', { class: 'pb-answerzone' });
    card.appendChild(zone);
    const expWrap = el('div', { class: 'pb-exp hidden' });
    card.appendChild(expWrap);
    const actions = el('div', { class: 'pb-actions' });
    card.appendChild(actions);

    let answered = false;
    let selfLocked = false;

    function buildActions() {
      actions.innerHTML = '';
      const mk = (text, fn, cls) => {
        const b = el('button', { class: 'btn ' + cls + ' ' + (cls === 'btn-primary' ? '' : '') + '', type: 'button', text });
        b.addEventListener('click', fn);
        return b;
      };
      if (opts.onPrev) actions.appendChild(mk('← 上一题', opts.onPrev, 'btn-secondary'));
      if (opts.onNext) actions.appendChild(mk('下一题 →', opts.onNext, 'btn-primary'));
      if (opts.onRandom) actions.appendChild(mk('随机再来一题', opts.onRandom, 'btn-secondary'));
      if (opts.backHref) actions.appendChild(el('a', { class: 'btn btn-secondary', href: opts.backHref, text: '返回题库' }));
      if (answered && opts.onRedo) {
        const redo = el('button', { class: 'btn btn-ghost btn-sm pb-redo', type: 'button', text: '重做本题' });
        redo.addEventListener('click', opts.onRedo);
        actions.appendChild(redo);
      }
      actions.appendChild(el('span', { class: 'pb-spacer' }));
      const favOn = PB.isFav(q.id);
      const favBtn = el('button', { class: 'btn btn-ghost btn-sm pb-fav' + (favOn ? ' on' : ''), type: 'button', text: favOn ? '已收藏' : '收藏' });
      favBtn.addEventListener('click', () => {
        const on = PB.toggleFav(q.id);
        favBtn.textContent = on ? '已收藏' : '收藏';
        favBtn.classList.toggle('on', on);
        toast(on ? '已加入收藏' : '已取消收藏');
      });
      actions.appendChild(favBtn);
    }

    function renderExp() {
      expWrap.innerHTML = '';
      expWrap.classList.remove('hidden');
      const h = el('div', { class: 'pb-exp-head' });
      h.appendChild(el('span', { class: 'small', text: '双版本解析' }));
      const seg = el('div', { class: 'segmented pb-exp-toggle' });
      const btnPro = el('button', { type: 'button', text: '专业版', 'aria-pressed': 'false' });
      const btnKid = el('button', { type: 'button', text: '宝宝巴士版', 'aria-pressed': 'false' });
      seg.appendChild(btnPro);
      seg.appendChild(btnKid);
      h.appendChild(seg);
      h.appendChild(el('span', { class: 'pb-exp-tip', text: '两种讲法，答案完全一致' }));
      expWrap.appendChild(h);
      const body = el('div', { class: 'pb-exp-body' });
      function paint(which) {
        body.className = 'pb-exp-body' + (which === 'kid' ? ' kid' : '');
        body.textContent = which === 'kid' ? q.kid : q.pro;
        btnPro.setAttribute('aria-pressed', which === 'pro' ? 'true' : 'false');
        btnKid.setAttribute('aria-pressed', which === 'kid' ? 'true' : 'false');
        PB.prefExplain(which);
      }
      btnPro.addEventListener('click', () => paint('pro'));
      btnKid.addEventListener('click', () => paint('kid'));
      paint(PB.prefExplain());
      expWrap.appendChild(body);
    }

    function afterAnswer() {
      renderExp();
      buildActions();
    }
    function recordAndToast(ok) {
      const wasWrong = PB.statusOf(q.id) === 'no';
      PB.record(q.id, ok ? 'ok' : 'no');
      if (ok && wasWrong) toast('回答正确，已从错题本移除', 'success');
    }

    /* 选择题 / 判断题 / 多选题 */
    if (q.type === 'single' || q.type === 'multi' || q.type === 'judge') {
      const isJudge = q.type === 'judge';
      const labels = isJudge ? ['正确', '错误'] : (q.options || []).map(stripPrefix);
      const keys = isJudge ? ['对', '错'] : labels.map((_, i) => 'ABCDE'[i]);
      const values = isJudge ? [true, false] : keys;
      let picked = q.type === 'multi' ? [] : null;
      const optWrap = el('div', { class: 'quiz-options pb-opts', role: 'group', 'aria-label': '选项' });
      const btns = labels.map((text, i) => {
        const b = el('button', { class: 'quiz-option pb-opt', type: 'button', 'aria-pressed': 'false' });
        b.appendChild(el('span', { class: 'qo-key', text: keys[i] }));
        b.appendChild(el('span', { class: 'qo-text', text: text }));
        b.addEventListener('click', () => {
          if (answered) return;
          if (q.type === 'multi') {
            const k = keys[i];
            const ix = picked.indexOf(k);
            if (ix >= 0) picked.splice(ix, 1); else picked.push(k);
          } else {
            picked = values[i];
          }
          btns.forEach((x, j) => {
            const on = q.type === 'multi' ? picked.indexOf(keys[j]) >= 0 : picked === values[j];
            x.setAttribute('aria-pressed', on ? 'true' : 'false');
          });
          submitBtn.disabled = q.type === 'multi' ? !picked.length : picked === null;
        });
        return b;
      });
      btns.forEach((b) => optWrap.appendChild(b));
      zone.appendChild(optWrap);
      const submitBtn = el('button', { class: 'btn btn-primary pb-submit mt-4', type: 'button', text: '提交答案', disabled: true });
      zone.appendChild(submitBtn);

      submitBtn.addEventListener('click', () => {
        if (answered) return;
        const ok = PB.grade(q, picked);
        answered = true;
        submitBtn.disabled = true;
        submitBtn.classList.add('hidden');
        const correctSet = isJudge ? [q.answer === true ? 0 : 1] : (q.type === 'multi' ? (q.answer || []).map((k) => keys.indexOf(k)) : [keys.indexOf(q.answer)]);
        btns.forEach((b, j) => {
          if (correctSet.indexOf(j) >= 0) b.classList.add('is-correct');
          const wasPicked = q.type === 'multi' ? picked.indexOf(keys[j]) >= 0 : picked === values[j];
          if (wasPicked && !ok) b.classList.add('is-wrong');
        });
        const choiceStore = isJudge ? (picked === true ? '正确' : '错误') : (q.type === 'multi' ? picked.slice() : picked);
        const wasWrong = PB.statusOf(q.id) === 'no';
        PB.record(q.id, ok ? 'ok' : 'no', choiceStore);
        if (ok && wasWrong) toast('回答正确，已从错题本移除', 'success');
        const v = el('div', { class: 'pb-verdict ' + (ok ? 'ok' : 'no') });
        if (ok) v.appendChild(el('b', { text: '回答正确。' }));
        else {
          v.appendChild(el('b', { text: '回答错误。' }));
          const ansText = isJudge
            ? (q.answer ? '正确' : '错误')
            : q.type === 'multi'
              ? (q.answer || []).join('、')
              : q.answer + '（' + (labels[keys.indexOf(q.answer)] || '') + '）';
          v.appendChild(el('span', { text: ' 正确答案：' + ansText }));
        }
        zone.appendChild(v);
        afterAnswer();
      });
    } else if (q.type === 'fill') {
      /* 填空题 */
      const row = el('div', { class: 'pb-fillrow' });
      const input = el('input', { class: 'input pb-fill', type: 'text', placeholder: '输入答案（单空）', 'aria-label': '填空答案', autocomplete: 'off' });
      const submitBtn = el('button', { class: 'btn btn-primary pb-submit', type: 'button', text: '提交答案', disabled: true });
      row.appendChild(input);
      row.appendChild(submitBtn);
      zone.appendChild(row);
      input.addEventListener('input', () => { submitBtn.disabled = !input.value.trim(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !submitBtn.disabled) submitBtn.click(); });
      submitBtn.addEventListener('click', () => {
        if (answered) return;
        const ok = PB.fillMatch(q, input.value);
        answered = true;
        submitBtn.disabled = true;
        submitBtn.classList.add('hidden');
        input.disabled = true;
        const wasWrong = PB.statusOf(q.id) === 'no';
        PB.record(q.id, ok ? 'ok' : 'no', input.value.trim());
        if (ok && wasWrong) toast('回答正确，已从错题本移除', 'success');
        const v = el('div', { class: 'pb-verdict ' + (ok ? 'ok' : 'no') });
        v.appendChild(el('b', { text: ok ? '回答正确。' : '回答错误。' }));
        v.appendChild(el('span', { text: ' 参考答案：' + (q.answer || []).join(' / ') }));
        zone.appendChild(v);
        afterAnswer();
      });
    } else {
      /* 主观题（简答 / 代码 / 复杂度分析）：对照参考答案自评 */
      zone.appendChild(el('p', { class: 'small muted', text: '建议先在纸上或编辑器里写下自己的答案，再对照参考答案自评。主观题不做自动判分。' }));
      const revealBtn = el('button', { class: 'btn btn-secondary pb-reveal mt-2', type: 'button', text: '查看参考答案' });
      zone.appendChild(revealBtn);
      const selfRow = el('div', { class: 'pb-toolrow mt-3 pb-self hidden' });
      selfRow.appendChild(el('span', { class: 'small muted', text: '自评：' }));
      const okB = el('button', { class: 'btn btn-secondary btn-sm pb-self-ok', type: 'button', text: '我答对了，记下' });
      const noB = el('button', { class: 'btn btn-secondary btn-sm pb-self-no', type: 'button', text: '还不太会，进错题本' });
      selfRow.appendChild(okB);
      selfRow.appendChild(noB);
      zone.appendChild(selfRow);
      revealBtn.addEventListener('click', () => {
        if (selfLocked) return;
        revealBtn.disabled = true;
        const ansBox = el('div', { class: 'pb-verdict soft pb-ref' });
        ansBox.appendChild(el('b', { text: '参考答案：' }));
        const body = el('div', { class: 'pb-exp-body', text: q.answer });
        body.setAttribute('style', 'margin-top:6px;');
        ansBox.appendChild(body);
        zone.insertBefore(ansBox, selfRow);
        selfRow.classList.remove('hidden');
      });
      function finishSelf(result) {
        if (selfLocked) return;
        selfLocked = true;
        answered = true;
        const wasWrong = PB.statusOf(q.id) === 'no';
        PB.record(q.id, result, '');
        if (result === 'selfok' && wasWrong) toast('已从错题本移除', 'success');
        selfRow.classList.add('hidden');
        revealBtn.disabled = true;
        const v = el('div', { class: 'pb-verdict ' + (result === 'selfok' ? 'ok' : 'no') });
        v.appendChild(el('b', { text: result === 'selfok' ? '已记录：答对。' : '已记录：需复习，题目已加入错题本。' }));
        zone.appendChild(v);
        afterAnswer();
      }
      okB.addEventListener('click', () => finishSelf('selfok'));
      noB.addEventListener('click', () => finishSelf('selfno'));
    }

    buildActions();
    return card;
  }

  /* ── 题库主页 ───────────────────────────────────────────────────── */
  async function hub() {
    const mf = await PB.manifest();
    const root = el('div', { class: 'view view-problems' });
    const c = el('div', { class: 'container pb-page' });
    c.appendChild(head('', mf));

    /* 指标条 */
    const st0 = PB.stats(mf.index);
    const mbox = el('div', { class: 'pb-metrics' });
    [['总题数', String(mf.total)], ['已做', st0.done + ' / ' + mf.total], ['正确率（客观题）', st0.accuracy != null ? fmtPct(st0.accuracy) : '—'], ['错题', String(st0.wrong)], ['收藏', String(st0.fav)]].forEach(([l, n]) => {
      const m = el('div', { class: 'pb-metric' });
      m.appendChild(el('div', { class: 'pm-n', text: n }));
      m.appendChild(el('div', { class: 'pm-l', text: l }));
      mbox.appendChild(m);
    });
    c.appendChild(mbox);

    const state = { subject: 'all', type: 'all', difficulty: 'all', status: 'all', kw: '' };
    const toolbar = el('div', { class: 'pb-toolbar' });

    /* 模式按钮 */
    const row1 = el('div', { class: 'pb-toolrow' });
    const startBtn = el('button', { class: 'btn btn-primary pb-start', type: 'button', text: '开始刷题' });
    const randomBtn = el('button', { class: 'btn btn-secondary pb-random', type: 'button', text: '随机一题' });
    row1.appendChild(startBtn);
    row1.appendChild(randomBtn);
    if (st0.wrong > 0) {
      const reBtn = el('button', { class: 'btn btn-secondary pb-rewrong', type: 'button', text: '重做错题（' + st0.wrong + '）' });
      reBtn.addEventListener('click', () => {
        const ids = PB.wrongIds(mf.index);
        if (!ids.length) { toast('错题本是空的'); return; }
        PB.saveDeck({ ids, idx: 0 });
        location.hash = '#/problems/do';
      });
      row1.appendChild(reBtn);
    }
    toolbar.appendChild(row1);

    /* 筛选行 */
    const row2 = el('div', { class: 'pb-toolrow' });
    const subjSel = el('select', { class: 'pb-f-subject', 'aria-label': '科目筛选' });
    subjSel.appendChild(el('option', { value: 'all', text: '全部科目' }));
    PB.SUBJ_ORDER.forEach((id) => {
      const s = (mf.subjects || []).find((x) => x.id === id);
      subjSel.appendChild(el('option', { value: id, text: (s ? s.name : PB.subjName(id)) + '（' + (s ? s.count : 0) + '）' }));
    });
    const typeSel = el('select', { class: 'pb-f-type', 'aria-label': '题型筛选' });
    typeSel.appendChild(el('option', { value: 'all', text: '全部题型' }));
    PB.TYPE_ORDER.forEach((t) => typeSel.appendChild(el('option', { value: t, text: PB.TYPE_LABEL[t] })));
    const diffSel = el('select', { class: 'pb-f-diff', 'aria-label': '难度筛选' });
    diffSel.appendChild(el('option', { value: 'all', text: '全部难度' }));
    [1, 2, 3].forEach((d) => diffSel.appendChild(el('option', { value: String(d), text: PB.DIFF_LABEL[d] })));
    const kwInput = el('input', { class: 'pb-f-kw', type: 'search', placeholder: '关键词搜索题干 / 考点…', 'aria-label': '关键词搜索' });
    row2.appendChild(subjSel);
    row2.appendChild(typeSel);
    row2.appendChild(diffSel);
    row2.appendChild(kwInput);
    toolbar.appendChild(row2);

    /* 状态分段 + 计数 */
    const row3 = el('div', { class: 'pb-toolrow' });
    const seg = el('div', { class: 'segmented pb-status-seg', role: 'group', 'aria-label': '作答状态' });
    [['all', '全部'], ['new', '未做'], ['wrong', '做错'], ['done', '已做'], ['fav', '收藏']].forEach(([v, t]) => {
      const b = el('button', { type: 'button', text: t, 'aria-pressed': v === 'all' ? 'true' : 'false' });
      b.addEventListener('click', () => {
        state.status = v;
        U.$$('button', seg).forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        rerender(true);
      });
      seg.appendChild(b);
    });
    row3.appendChild(seg);
    const countEl = el('span', { class: 'pb-count' });
    row3.appendChild(countEl);
    toolbar.appendChild(row3);
    c.appendChild(toolbar);

    const listWrap = el('div', { class: 'pb-list' });
    const moreWrap = el('div', { class: 'pb-more' });
    c.appendChild(listWrap);
    c.appendChild(moreWrap);

    let shown = PAGE_SIZE;
    function renderList() {
      const list = PB.filterIndex(mf.index, state);
      countEl.textContent = '共 ' + list.length + ' 题';
      listWrap.innerHTML = '';
      moreWrap.innerHTML = '';
      if (!list.length) {
        listWrap.appendChild(el('div', { class: 'empty pb-empty' }, [
          el('div', { class: 'empty-title', text: '没有匹配的题目' }),
          el('div', { class: 'small', text: '换个筛选条件试试，或清空关键词。' }),
        ]));
        return;
      }
      list.slice(0, shown).forEach((it, i) => listWrap.appendChild(questionRow(it, { no: String(i + 1) })));
      if (list.length > shown) {
        const btn = el('button', { class: 'btn btn-secondary', type: 'button', text: '加载更多（剩余 ' + (list.length - shown) + ' 题）' });
        btn.addEventListener('click', () => { shown += PAGE_SIZE; renderList(); });
        moreWrap.appendChild(btn);
      }
    }
    function rerender(reset) {
      if (reset) shown = PAGE_SIZE;
      renderList();
    }
    subjSel.addEventListener('change', () => { state.subject = subjSel.value; rerender(true); });
    typeSel.addEventListener('change', () => { state.type = typeSel.value; rerender(true); });
    diffSel.addEventListener('change', () => { state.difficulty = diffSel.value; rerender(true); });
    kwInput.addEventListener('input', debounce(() => { state.kw = kwInput.value; rerender(true); }, 200));

    startBtn.addEventListener('click', () => {
      const ids = PB.deckIds(mf.index, state);
      if (!ids.length) { toast('当前筛选没有题目'); return; }
      const firstNew = ids.findIndex((id) => PB.statusOf(id) === 'new');
      PB.saveDeck({ ids, idx: firstNew >= 0 ? firstNew : 0 });
      location.hash = '#/problems/do';
    });
    randomBtn.addEventListener('click', () => {
      const id = PB.randomId(mf.index, state);
      if (!id) { toast('当前筛选没有题目'); return; }
      location.hash = '#/problems/q/' + encodeURIComponent(id);
    });

    renderList();
    root.appendChild(c);
    return { el: root, title: '必刷题' };
  }

  /* ── 错题本 / 收藏 ──────────────────────────────────────────────── */
  async function collection(kind) {
    const mf = await PB.manifest();
    const isWrong = kind === 'wrong';
    const root = el('div', { class: 'view view-problems' });
    const c = el('div', { class: 'container pb-page' });
    c.appendChild(head(kind, mf));
    const list = isWrong
      ? mf.index.filter((x) => PB.statusOf(x.id) === 'no')
      : mf.index.filter((x) => PB.isFav(x.id));
    if (list.length) {
      const bar = el('div', { class: 'pb-toolrow' });
      const againBtn = el('button', { class: 'btn btn-primary', type: 'button', text: isWrong ? '开始重刷全部错题（' + list.length + ' 题）' : '按收藏顺序刷（' + list.length + ' 题）' });
      againBtn.addEventListener('click', () => {
        PB.saveDeck({ ids: list.map((x) => x.id), idx: 0 });
        location.hash = '#/problems/do';
      });
      bar.appendChild(againBtn);
      c.appendChild(bar);
    }
    const listWrap = el('div', { class: 'pb-list' });
    if (!list.length) {
      listWrap.appendChild(el('div', { class: 'empty pb-empty' }, [
        el('div', { class: 'empty-title', text: isWrong ? '错题本是空的' : '还没有收藏' }),
        el('div', { class: 'small', text: isWrong ? '做错的题会自动出现在这里；全部做对它们就会消失。' : '在题目页点「收藏」，这里就会留下书签。' }),
        el('a', { class: 'btn btn-secondary btn-sm mt-4', href: '#/problems', text: '去题库刷题' }),
      ]));
    } else {
      list.forEach((it, i) => listWrap.appendChild(questionRow(it, { no: String(i + 1) })));
    }
    c.appendChild(listWrap);
    root.appendChild(c);
    return { el: root, title: '必刷题 · ' + (isWrong ? '错题本' : '收藏') };
  }

  /* ── 统计页 ─────────────────────────────────────────────────────── */
  async function statsView() {
    const mf = await PB.manifest();
    const root = el('div', { class: 'view view-problems' });
    const c = el('div', { class: 'container pb-page' });
    c.appendChild(head('stats', mf));
    const st = PB.stats(mf.index);

    const grid = el('div', { class: 'pb-statgrid mt-4' });
    grid.appendChild(V.statTile(String(mf.total), '题库总题数'));
    grid.appendChild(V.statTile(String(st.done), '已完成（做过）'));
    grid.appendChild(V.statTile(fmtPct(st.pct, 0), '完成率'));
    grid.appendChild(V.statTile(st.accuracy != null ? fmtPct(st.accuracy) : '—', '正确率（客观题）'));
    grid.appendChild(V.statTile(String(st.wrong), '错题数（待复习）'));
    grid.appendChild(V.statTile(String(st.fav), '收藏数'));
    c.appendChild(grid);

    const sub = el('div', { class: 'panel mt-8' });
    sub.appendChild(el('div', { class: 'panel-title', text: '各科目进度与正确率' }));
    PB.SUBJ_ORDER.forEach((id) => {
      const items = mf.index.filter((x) => x.s === id);
      const sst = PB.stats(items);
      const row = el('div', { class: 'pb-subrow' });
      row.appendChild(el('div', { class: 'pb-subname', text: subjNameOf(mf, id) + '（' + items.length + ' 题）' }));
      row.appendChild(V.progressBar(sst.pct));
      row.appendChild(el('div', { class: 'pb-subpct', text: sst.done + '/' + items.length + (sst.accuracy != null ? ' · ' + fmtPct(sst.accuracy) : '') }));
      sub.appendChild(row);
    });
    c.appendChild(sub);

    const ty = el('div', { class: 'panel mt-6' });
    ty.appendChild(el('div', { class: 'panel-title', text: '按题型统计' }));
    const table = el('table', { class: 'ds-table' });
    table.innerHTML = '<thead><tr><th>题型</th><th class="num-col">题数</th><th class="num-col">已做</th><th class="num-col">正确率</th></tr></thead>';
    const tbody = el('tbody');
    PB.TYPE_ORDER.forEach((t) => {
      const items = mf.index.filter((x) => x.ty === t);
      if (!items.length) return;
      const sst = PB.stats(items);
      const tr = el('tr');
      tr.appendChild(el('td', { text: PB.TYPE_LABEL[t] }));
      tr.appendChild(el('td', { class: 'num-col', text: String(items.length) }));
      tr.appendChild(el('td', { class: 'num-col', text: String(sst.done) }));
      tr.appendChild(el('td', { class: 'num-col', text: sst.accuracy != null ? fmtPct(sst.accuracy) : '—' }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    ty.appendChild(table);
    c.appendChild(ty);

    const df = el('div', { class: 'panel mt-6' });
    df.appendChild(el('div', { class: 'panel-title', text: '按难度统计' }));
    const dt = el('table', { class: 'ds-table' });
    dt.innerHTML = '<thead><tr><th>难度</th><th class="num-col">题数</th><th class="num-col">已做</th><th class="num-col">正确率</th></tr></thead>';
    const dbody = el('tbody');
    [1, 2, 3].forEach((d) => {
      const items = mf.index.filter((x) => x.df === d);
      const sst = PB.stats(items);
      const tr = el('tr');
      const td0 = el('td');
      td0.appendChild(diffChip(d));
      tr.appendChild(td0);
      tr.appendChild(el('td', { class: 'num-col', text: String(items.length) }));
      tr.appendChild(el('td', { class: 'num-col', text: String(sst.done) }));
      tr.appendChild(el('td', { class: 'num-col', text: sst.accuracy != null ? fmtPct(sst.accuracy) : '—' }));
      dbody.appendChild(tr);
    });
    dt.appendChild(dbody);
    df.appendChild(dt);
    c.appendChild(df);

    const dm = el('div', { class: 'panel mt-6' });
    dm.appendChild(el('div', { class: 'panel-title', text: '数据管理（本地存储）' }));
    dm.appendChild(el('p', { class: 'small muted', text: '做题记录、错题与收藏保存在本机浏览器，刷新或下次进来都还在；与课程学习记录互不影响。' }));
    const row = el('div', { class: 'row' });
    row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出记录 JSON', onclick: () => download('bearlabs-problems-' + fmtDate(Date.now()) + '.json', PB.exportJSONText(), 'application/json') }));
    row.appendChild(el('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: '导出记录 CSV', onclick: () => download('bearlabs-problems.csv', PB.exportCSV(mf.index), 'text/csv') }));
    dm.appendChild(row);
    dm.appendChild(el('button', { class: 'btn btn-ghost btn-sm mt-4', type: 'button', text: '清空必刷题记录…', onclick: async () => {
      if (await confirmDialog('确定清空「必刷题」的全部做题记录、错题与收藏吗？此操作不可恢复，建议先导出备份。', { okLabel: '清空' })) {
        PB.reset();
        toast('已清空必刷题记录');
        App.refresh();
      }
    } }));
    c.appendChild(dm);

    root.appendChild(c);
    return { el: root, title: '必刷题 · 统计' };
  }

  /* ── 题组会话（顺序刷） ─────────────────────────────────────────── */
  async function doView() {
    const mf = await PB.manifest();
    const root = el('div', { class: 'view view-problems' });
    const c = el('div', { class: 'container pb-page' });
    c.appendChild(head('', mf));
    const bar = el('div', { class: 'pb-deckbar' });
    bar.appendChild(el('a', { class: 'btn btn-ghost btn-sm', href: '#/problems', text: '← 回题库' }));
    const posEl = el('span', { class: 'pb-pos' });
    bar.appendChild(posEl);
    const progress = V.progressBar(0);
    bar.appendChild(progress);
    c.appendChild(bar);
    const stage = el('div', { class: 'pb-stage' });
    c.appendChild(stage);

    let d = PB.loadDeck();
    if (!d) {
      const ids = PB.deckIds(mf.index, {});
      const firstNew = ids.findIndex((id) => PB.statusOf(id) === 'new');
      d = { ids, idx: firstNew >= 0 ? firstNew : 0 };
      PB.saveDeck(d);
    }
    d.idx = Math.min(Math.max(0, d.idx | 0), d.ids.length - 1);

    function showDone() {
      const st = { ok: 0, no: 0, todo: 0 };
      d.ids.forEach((id) => {
        const s = PB.statusOf(id);
        if (s === 'ok') st.ok++; else if (s === 'no') st.no++; else st.todo++;
      });
      stage.innerHTML = '';
      const card = el('div', { class: 'pb-quiz pb-quiz-narrow' });
      card.setAttribute('style', 'text-align:center;');
      card.appendChild(el('h2', { text: '本组刷完' }));
      card.appendChild(el('p', { class: 'mt-3', text: '本组共 ' + d.ids.length + ' 题：答对 ' + st.ok + ' 题 · 答错 ' + st.no + ' 题 · 未做 ' + st.todo + ' 题。' }));
      const row = el('div', { class: 'pb-toolrow' });
      row.setAttribute('style', 'justify-content:center;margin-top:18px;');
      const again = el('button', { class: 'btn btn-primary', type: 'button', text: '再刷一组未做题' });
      again.addEventListener('click', () => {
        const ids = PB.deckIds(mf.index, { status: 'new' });
        if (!ids.length) { toast('没有未做的题了，可以重刷错题或按科目复习'); return; }
        PB.saveDeck({ ids, idx: 0 });
        d = PB.loadDeck();
        renderAt(0);
      });
      row.appendChild(again);
      row.appendChild(el('a', { class: 'btn btn-secondary', href: '#/problems', text: '返回题库' }));
      card.appendChild(row);
      stage.appendChild(card);
      posEl.textContent = '本组完成';
      progress.firstChild.setAttribute('style', 'width:100%');
    }

    async function renderAt(i) {
      d.idx = Math.min(Math.max(0, i), d.ids.length - 1);
      PB.saveDeck(d);
      posEl.textContent = '第 ' + (d.idx + 1) + ' / ' + d.ids.length + ' 题';
      progress.firstChild.setAttribute('style', 'width:' + Math.max(2, Math.round((d.idx / d.ids.length) * 100)) + '%');
      stage.innerHTML = '';
      stage.appendChild(el('div', { class: 'skeleton skeleton-card' }));
      let q = null;
      try { q = await PB.question(d.ids[d.idx]); }
      catch (e) {
        stage.innerHTML = '';
        stage.appendChild(V.errorBox(e, () => renderAt(d.idx)));
        return;
      }
      stage.innerHTML = '';
      stage.appendChild(renderQuestion(q, {
        subjName: subjNameOf(mf, d.ids[d.idx].split('-')[1]),
        onPrev: d.idx > 0 ? () => renderAt(d.idx - 1) : null,
        onNext: d.idx < d.ids.length - 1 ? () => renderAt(d.idx + 1) : () => showDone(),
        onRedo: () => renderAt(d.idx),
        backHref: '#/problems',
      }));
    }
    await renderAt(d.idx);
    root.appendChild(c);
    return { el: root, title: '必刷题 · 刷题' };
  }

  /* ── 单题页 ─────────────────────────────────────────────────────── */
  async function qView(route) {
    const mf = await PB.manifest();
    const root = el('div', { class: 'view view-problems' });
    const c = el('div', { class: 'container pb-page' });
    c.appendChild(head('', mf));
    const stage = el('div', { class: 'pb-stage pb-quiz-narrow' });
    c.appendChild(stage);
    let q = null;
    try { q = await PB.question(route.id); }
    catch (e) {
      stage.appendChild(V.errorBox(e, () => App.refresh()));
      root.appendChild(c);
      return { el: root, title: '必刷题 · 题目' };
    }
    const idx = mf.index.findIndex((x) => x.id === q.id);
    const prev = idx > 0 ? mf.index[idx - 1] : null;
    const next = idx >= 0 && idx < mf.index.length - 1 ? mf.index[idx + 1] : null;
    stage.appendChild(renderQuestion(q, {
      subjName: subjNameOf(mf, q.id.split('-')[1]),
      onPrev: prev ? () => { location.hash = '#/problems/q/' + encodeURIComponent(prev.id); } : null,
      onNext: next ? () => { location.hash = '#/problems/q/' + encodeURIComponent(next.id); } : null,
      onRandom: () => {
        const id = PB.randomId(mf.index, {});
        if (id) location.hash = '#/problems/q/' + encodeURIComponent(id);
      },
      onRedo: () => App.refresh(),
      backHref: '#/problems',
    }));
    root.appendChild(c);
    return { el: root, title: '必刷题 · ' + q.id };
  }

  /* ── 路由分发 ───────────────────────────────────────────────────── */
  async function problems(route) {
    const sub = route.sub || '';
    if (sub === 'wrong') return collection('wrong');
    if (sub === 'fav') return collection('fav');
    if (sub === 'stats') return statsView();
    if (sub === 'do') return doView();
    if (sub === 'q' && route.id) return qView(route);
    return hub();
  }
  V.problems = problems;

  /* 首页横幅（由 views.js 的 home() 调用） */
  V.problemsBanner = function () {
    const card = el('div', { class: 'pb-banner' });
    const body = el('div', { class: 'pb-banner-body' });
    body.appendChild(el('p', { class: 'pb-banner-eyebrow', text: 'NEW · 必刷题 · 纯刷题板块' }));
    body.appendChild(el('h3', { text: '只刷题，不上课：220 道面试与 408 经典题' }));
    body.appendChild(el('p', { text: '每题「专业版 + 宝宝巴士版」双解析；答错自动进错题本，进度按科目标记，手机上也能刷。' }));
    card.appendChild(body);
    card.appendChild(el('a', { class: 'btn btn-primary', href: '#/problems', text: '去刷必刷题 →' }));
    return card;
  };
})();
