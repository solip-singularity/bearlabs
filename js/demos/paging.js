/* ============================================================================
 * paging — 虚拟内存与页面置换实验室（DemoKit 帧序列模式）
 * 三种算法：FIFO / LRU / OPT；访问序列可编辑、可随机；物理帧框数可调。
 * 帧序列：每次页面访问一帧；末尾加一帧，对比三种算法的缺页次数。
 * 技术要点：LRU 在命中时也要刷新使用记录；OPT 用「向前看」找未来最晚使用的页。
 * ==========================================================================*/
DemoKit.register('paging', function (root, kit) {
  const P = kit.palette;
  const ALGS = [
    { id: 'fifo', short: 'FIFO', name: 'FIFO（先进先出）', basis: 'FIFO 只看「谁最早被装入」：需要换页时，换出在内存里住得最久的页面，不管它最近有没有被用到。' },
    { id: 'lru', short: 'LRU', name: 'LRU（最近最少使用）', basis: 'LRU 看「上次使用时间」：换出最久没有被访问过的页面。注意：命中也要更新使用记录——每次用到它，都刷新成「刚用过」。' },
    { id: 'opt', short: 'OPT', name: 'OPT（最优置换）', basis: 'OPT 看「将来」：换出未来最晚才会用到（或不再用）的页面。它需要提前知道整个访问序列，现实中做不到，只当作理想标杆。' },
  ];
  const CLASSIC = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
  const state = { alg: 'fifo', nf: 3, seq: CLASSIC.slice() };
  let results = {};
  let frameList = [];
  let pb = null;

  const cv = kit.canvas(720, 340);
  cv.canvas.setAttribute('aria-label', '页面置换演示：上方是页面访问序列（当前访问为砂色，绿点=命中、红点=缺页）；中间是内存帧框，绿框代表命中、红框代表缺页装入或发生置换；最后一帧给出三种算法的缺页率对比。');

  /* ---------------- 控制区 ---------------- */
  kit.controlRow();
  const algSel = kit.select({
    label: '算法',
    options: ALGS.map((a) => ({ value: a.id, label: a.name })),
    value: state.alg,
  }, (v) => { state.alg = v; rebuild(); });
  const nfRange = kit.range({
    label: '物理帧框数', min: 2, max: 6, value: state.nf, format: (v) => v + ' 个',
  }, (v) => { state.nf = v; rebuild(); });
  const faultBadge = kit.badge('缺页 0 次');
  const hitBadge = kit.badge('命中 0 次');
  const rateBadge = kit.badge('缺页率 —');

  const rowB = kit.controlRow();
  const lab = document.createElement('label');
  lab.className = 'dk-param';
  const sp = document.createElement('span');
  sp.textContent = '访问序列';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.setAttribute('aria-label', '页面访问序列：0 到 9 的数字，用空格分隔，至少 4 个、最多 24 个');
  inp.style.width = 'min(280px, 46vw)';
  inp.style.fontFamily = 'ui-monospace, Consolas, monospace';
  inp.style.fontSize = '12px';
  inp.style.padding = '4px 8px';
  inp.style.border = '1px solid var(--border)';
  inp.style.borderRadius = '6px';
  inp.style.color = 'var(--fg)';
  inp.style.background = 'var(--surface)';
  inp.value = state.seq.join(' ');
  lab.appendChild(sp);
  lab.appendChild(inp);
  rowB.appendChild(lab);
  kit.btn('应用', applySeq, { parent: rowB });
  kit.btn('随机生成', randomSeq, { parent: rowB });
  kit.btn('恢复示例', () => {
    state.seq = CLASSIC.slice();
    inp.value = state.seq.join(' ');
    msg.textContent = '';
    rebuild();
  }, { parent: rowB });
  const msg = document.createElement('span');
  msg.className = 'dk-val';
  msg.textContent = '';
  rowB.appendChild(msg);

  pb = kit.playback({ total: 1, onChange: render });
  kit.explain('内存的物理帧框是有限的，程序用到的页面却可以很多。要访问的页面不在内存里就发生「缺页」，需要把某个页面换出去、把新页面装进来。三种换出策略的判断依据不同：FIFO 看谁最早进入；LRU 看谁最久没被用过；OPT 看谁将来最晚才会被用。');

  /* ---------------- 序列编辑 ---------------- */
  function applySeq() {
    const nums = (inp.value.match(/\d/g) || []).map(Number);
    if (nums.length < 4) { msg.textContent = '至少输入 4 个数字（0–9）'; return; }
    state.seq = nums.length > 24 ? nums.slice(0, 24) : nums;
    msg.textContent = nums.length > 24 ? '最多 24 个，已截取前 24 个' : '';
    inp.value = state.seq.join(' ');
    rebuild();
  }
  function randomSeq() {
    const len = 16 + Math.floor(Math.random() * 5);
    const arr = [];
    for (let k = 0; k < len; k++) arr.push(Math.floor(Math.random() * 7));
    state.seq = arr;
    inp.value = arr.join(' ');
    msg.textContent = '';
    rebuild();
  }

  /* ---------------- 模拟计算 ---------------- */
  function nextUse(seq, page, from) {
    for (let k = from; k < seq.length; k++) if (seq[k] === page) return k;
    return Infinity;
  }

  function simulate(seq, nf, alg) {
    const mem = []; /* 每项：{ page, loadedAt, lastUsed } */
    const steps = [];
    let faults = 0;
    let hits = 0;
    for (let t = 0; t < seq.length; t++) {
      const page = seq[t];
      let idx = -1;
      for (let k = 0; k < mem.length; k++) if (mem[k].page === page) { idx = k; break; }
      let type;
      let loadedFrame = -1;
      let evicted = null;
      if (idx >= 0) {
        type = 'hit';
        hits++;
        mem[idx].lastUsed = t; /* LRU 的关键：命中也要刷新使用记录 */
        loadedFrame = idx;
      } else {
        faults++;
        if (mem.length < nf) {
          mem.push({ page: page, loadedAt: t, lastUsed: t });
          loadedFrame = mem.length - 1;
          type = 'load';
        } else {
          let v = 0;
          if (alg === 'fifo') {
            for (let k = 1; k < mem.length; k++) if (mem[k].loadedAt < mem[v].loadedAt) v = k;
          } else if (alg === 'lru') {
            for (let k = 1; k < mem.length; k++) if (mem[k].lastUsed < mem[v].lastUsed) v = k;
          } else {
            /* OPT：向前看，换出「下一次使用最晚」的页面 */
            let bestNu = -1;
            for (let k = 0; k < mem.length; k++) {
              const nu = nextUse(seq, mem[k].page, t + 1);
              if (nu > bestNu) { bestNu = nu; v = k; }
            }
          }
          evicted = mem[v].page;
          mem[v] = { page: page, loadedAt: t, lastUsed: t };
          loadedFrame = v;
          type = 'replace';
        }
      }
      steps.push({
        t: t,
        page: page,
        type: type,
        loadedFrame: loadedFrame,
        evicted: evicted,
        mem: mem.map((e) => ({ page: e.page, loadedAt: e.loadedAt, lastUsed: e.lastUsed })),
        faults: faults,
        hits: hits,
      });
    }
    return { steps: steps, faults: faults, hits: hits };
  }

  /* ---------------- 渲染 ---------------- */
  function pct1(x) { return (Math.round(x * 10) / 10).toFixed(1); }

  function rrect(c2d, x, y, w, h, r) {
    c2d.beginPath();
    c2d.moveTo(x + r, y);
    c2d.arcTo(x + w, y, x + w, y + h, r);
    c2d.arcTo(x + w, y + h, x, y + h, r);
    c2d.arcTo(x, y + h, x, y, r);
    c2d.arcTo(x, y, x + w, y, r);
    c2d.closePath();
  }

  function wrapText(text, x, y, maxW, lh, maxLines) {
    let line = '';
    let lines = 0;
    for (let k = 0; k < text.length; k++) {
      const ch = text[k];
      const test = line + ch;
      if (cv.ctx.measureText(test).width > maxW && line) {
        cv.ctx.fillText(line, x, y + lines * lh);
        lines++;
        if (lines >= maxLines) return;
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) cv.ctx.fillText(line, x, y + lines * lh);
  }

  function render(i) {
    const f = frameList[i];
    if (!f) return;
    const W = 720;
    const pad = 16;
    const seq = state.seq;
    const N = seq.length;
    const meta = ALGS.filter((a) => a.id === state.alg)[0];
    cv.bg(P.bg);

    /* 标题行 */
    const procCount = f.final ? N : i + 1;
    const ratePct = procCount ? (f.faults / procCount) * 100 : 0;
    cv.ctx.fillStyle = P.ink;
    cv.ctx.font = '13px ' + kit.font;
    cv.ctx.textAlign = 'left';
    cv.ctx.fillText('算法：' + meta.name, pad, 22);
    cv.ctx.textAlign = 'right';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.fillText('缺页率 ' + pct1(ratePct) + '%（缺页 ' + f.faults + ' · 命中 ' + f.hits + '）', W - pad, 22);

    /* 访问序列条 */
    const cw = (W - 2 * pad) / N;
    const chipY = 40;
    const chipH = 26;
    for (let k = 0; k < N; k++) {
      const x = pad + k * cw + 2;
      const w = Math.max(10, cw - 4);
      const past = f.final || k < i;
      const cur = !f.final && k === i;
      rrect(cv.ctx, x, chipY, w, chipH, 5);
      if (cur) { cv.ctx.fillStyle = P.sand; cv.ctx.fill(); }
      else if (past) { cv.ctx.fillStyle = P.wash; cv.ctx.fill(); }
      else { cv.ctx.strokeStyle = P.border; cv.ctx.lineWidth = 1; cv.ctx.stroke(); }
      cv.ctx.fillStyle = P.ink;
      cv.ctx.font = (cur ? '600 ' : '') + (cw >= 26 ? 12 : 10) + 'px ' + kit.font;
      cv.ctx.textAlign = 'center';
      cv.ctx.fillText(String(seq[k]), x + w / 2, chipY + 17);
      if (past || cur) {
        const st = frameList[k];
        cv.ctx.beginPath();
        cv.ctx.arc(x + w / 2, chipY + chipH + 8, cur ? 3 : 2.2, 0, Math.PI * 2);
        cv.ctx.fillStyle = st && st.type === 'hit' ? P.green : P.red;
        cv.ctx.fill();
      }
    }

    /* 内存帧框 */
    const n = state.nf;
    const bw = 88;
    const gap = 16;
    const total = n * bw + (n - 1) * gap;
    const x0 = (W - total) / 2;
    const by = 106;
    const bh = 64;
    for (let k = 0; k < n; k++) {
      const bx = x0 + k * (bw + gap);
      const e = f.mem[k];
      const isLoaded = !f.final && k === f.loadedFrame;
      rrect(cv.ctx, bx, by, bw, bh, 8);
      cv.ctx.fillStyle = e ? (isLoaded ? (f.type === 'hit' ? P.wash : P.redWash) : P.surface) : P.bg;
      cv.ctx.fill();
      cv.ctx.lineWidth = isLoaded ? 2 : 1;
      cv.ctx.strokeStyle = isLoaded ? (f.type === 'hit' ? P.green : P.red) : P.border;
      cv.ctx.stroke();
      cv.ctx.fillStyle = P.muted;
      cv.ctx.font = '10px ' + kit.font;
      cv.ctx.textAlign = 'left';
      cv.ctx.fillText('帧' + k, bx + 8, by + 14);
      cv.ctx.textAlign = 'center';
      if (e) {
        cv.ctx.fillStyle = P.ink;
        cv.ctx.font = '600 16px ' + kit.font;
        cv.ctx.fillText('页' + e.page, bx + bw / 2, by + 40);
      } else {
        cv.ctx.fillStyle = P.muted;
        cv.ctx.font = '13px ' + kit.font;
        cv.ctx.fillText('空', bx + bw / 2, by + 40);
      }
      if (isLoaded) {
        cv.ctx.font = '10px ' + kit.font;
        cv.ctx.textAlign = 'center';
        if (f.type === 'hit') {
          cv.ctx.fillStyle = P.green;
          cv.ctx.fillText('命中', bx + bw / 2, by - 6);
        } else if (f.type === 'replace') {
          cv.ctx.fillStyle = P.red;
          cv.ctx.fillText('换出 页' + f.evicted, bx + bw / 2, by - 6);
        } else {
          cv.ctx.fillStyle = P.red;
          cv.ctx.fillText('装入', bx + bw / 2, by - 6);
        }
      }
      if (e) {
        cv.ctx.fillStyle = P.muted;
        cv.ctx.font = '10px ' + kit.font;
        let anno = '';
        if (state.alg === 'fifo') anno = '装入于 #' + (e.loadedAt + 1);
        else if (state.alg === 'lru') anno = '上次用到 #' + (e.lastUsed + 1);
        else {
          const nu = nextUse(seq, e.page, f.final ? N : i + 1);
          anno = isFinite(nu) ? '下次用到 #' + (nu + 1) : '不再使用';
        }
        cv.ctx.fillText(anno, bx + bw / 2, by + bh + 16);
      }
    }

    /* 箭头：当前访问 → 目标帧框 */
    if (!f.final) {
      const sx = pad + i * cw + cw / 2;
      const sy = chipY + chipH + 12;
      const tx = x0 + f.loadedFrame * (bw + gap) + bw / 2;
      const ty = by - 16;
      cv.ctx.strokeStyle = f.type === 'hit' ? P.green : P.red;
      cv.ctx.lineWidth = 1.5;
      cv.ctx.beginPath();
      cv.ctx.moveTo(sx, sy);
      cv.ctx.lineTo(sx, sy + 8);
      cv.ctx.lineTo(tx, ty - 8);
      cv.ctx.lineTo(tx, ty);
      cv.ctx.stroke();
      cv.ctx.beginPath();
      cv.ctx.moveTo(tx, ty);
      cv.ctx.lineTo(tx - 4, ty - 6);
      cv.ctx.lineTo(tx + 4, ty - 6);
      cv.ctx.closePath();
      cv.ctx.fillStyle = f.type === 'hit' ? P.green : P.red;
      cv.ctx.fill();
    }

    /* 底部信息区 */
    if (!f.final) {
      cv.ctx.textAlign = 'left';
      cv.ctx.fillStyle = P.ink;
      cv.ctx.font = '12px ' + kit.font;
      cv.ctx.fillText('第 ' + (i + 1) + ' / ' + N + ' 次访问：页' + f.page + (f.type === 'hit' ? ' → 命中' : (f.type === 'load' ? ' → 缺页（还有空帧）' : ' → 缺页（发生置换）')), pad, 208);
      cv.ctx.fillStyle = P.muted;
      cv.ctx.font = '11px ' + kit.font;
      wrapText('判定依据：' + meta.basis, pad, 230, W - 2 * pad, 18, 3);
      wrapText('绿 = 命中，红 = 缺页；序列可编辑、帧框数可调、算法可切换，改完自动重算。', pad, 292, W - 2 * pad, 16, 1);
    } else {
      cv.ctx.textAlign = 'left';
      cv.ctx.fillStyle = P.ink;
      cv.ctx.font = '13px ' + kit.font;
      cv.ctx.fillText('三种算法对比（同一访问序列 · ' + n + ' 个帧框）', pad, 208);
      const comp = [
        { id: 'fifo', color: P.blue, r: results.fifo },
        { id: 'lru', color: P.accent, r: results.lru },
        { id: 'opt', color: P.green, r: results.opt },
      ];
      let maxF = 1;
      comp.forEach((c) => { if (c.r.faults > maxF) maxF = c.r.faults; });
      comp.forEach((c, k) => {
        const meta2 = ALGS.filter((a) => a.id === c.id)[0];
        const y = 230 + k * 28;
        cv.ctx.fillStyle = c.id === state.alg ? P.ink : P.muted;
        cv.ctx.font = (c.id === state.alg ? '600 ' : '') + '12px ' + kit.font;
        cv.ctx.textAlign = 'left';
        cv.ctx.fillText(meta2.short + (c.id === state.alg ? '（本次）' : ''), pad, y + 12);
        const barW = Math.max(4, Math.round(c.r.faults / maxF * 330));
        rrect(cv.ctx, pad + 118, y, barW, 16, 4);
        cv.ctx.fillStyle = c.color;
        cv.ctx.globalAlpha = c.id === state.alg ? 1 : 0.55;
        cv.ctx.fill();
        cv.ctx.globalAlpha = 1;
        cv.ctx.fillStyle = P.ink;
        cv.ctx.font = '12px ' + kit.font;
        cv.ctx.fillText('缺页 ' + c.r.faults + ' 次 · 缺页率 ' + pct1(c.r.faults / N * 100) + '%', pad + 118 + barW + 10, y + 12);
      });
      cv.ctx.fillStyle = P.muted;
      cv.ctx.font = '10px ' + kit.font;
      wrapText('OPT 是「预知未来」的理想标杆（现实中做不到）；LRU 用「最近使用情况」近似未来；FIFO 只看谁来得早。通常 OPT ≤ LRU ≤ FIFO，但 FIFO 可能出现「帧框越多、缺页反而越多」的 Belady 异常。', pad, 320, W - 2 * pad, 13, 2);
    }

    /* 徽标与旁白 */
    faultBadge.set('缺页 ' + f.faults + ' 次');
    hitBadge.set('命中 ' + f.hits + ' 次');
    rateBadge.set('缺页率 ' + pct1(ratePct) + '%');
    if (f.final) {
      const fF = results.fifo.faults;
      const fL = results.lru.faults;
      const fO = results.opt.faults;
      kit.narrate({ index: i, total: frameList.length, text: '全部 ' + N + ' 次访问完成！本次 ' + meta.name + ' 缺页 ' + f.faults + ' 次（缺页率 ' + pct1(f.faults / N * 100) + '%）。对比：FIFO ' + fF + ' 次、LRU ' + fL + ' 次、OPT ' + fO + ' 次。' });
      kit.explain('对比结果（' + N + ' 次访问 · ' + n + ' 个帧框）：FIFO 缺页 ' + fF + ' 次、LRU 缺页 ' + fL + ' 次、OPT 缺页 ' + fO + ' 次。FIFO 只记「谁来得早」，LRU 记「谁最近用过」，OPT 偷看「未来」。最省的是 OPT——但它需要预知未来，只能当基准；LRU 用历史近似未来，通常很接近 OPT。试试改帧框数或换一段访问序列，缺页率会立刻重新计算。');
    } else {
      let text;
      if (f.type === 'hit') {
        text = '第 ' + (i + 1) + ' 次访问 页' + f.page + '：命中！页' + f.page + ' 已经在内存（帧' + f.loadedFrame + '），不需要读磁盘。' + (state.alg === 'lru' ? '（LRU 会把它刷新为「刚用过」）' : '');
      } else if (f.type === 'load') {
        text = '第 ' + (i + 1) + ' 次访问 页' + f.page + '：缺页！内存里没有它，好在还有空帧，直接装入帧' + f.loadedFrame + '。';
      } else {
        let why = '';
        if (state.alg === 'fifo') {
          why = 'FIFO 换出最早装入的 页' + f.evicted + '（它在内存里住得最久）';
        } else if (state.alg === 'lru') {
          why = 'LRU 换出最久没被使用的 页' + f.evicted;
        } else {
          const nu = nextUse(seq, f.evicted, i + 1);
          why = 'OPT 换出 页' + f.evicted + (isFinite(nu) ? '（它最晚——要等到第 ' + (nu + 1) + ' 次访问才再被用到）' : '（它今后不再被用到）');
        }
        text = '第 ' + (i + 1) + ' 次访问 页' + f.page + '：缺页！内存已满，' + why + '，腾出帧' + f.loadedFrame + ' 装入 页' + f.page + '。';
      }
      text += '目前缺页 ' + f.faults + ' 次、命中 ' + f.hits + ' 次。';
      kit.narrate({ index: i, total: frameList.length, text: text });
    }
  }

  /* ---------------- 重建 ---------------- */
  function rebuild() {
    const seq = state.seq;
    const nf = state.nf;
    results = {
      fifo: simulate(seq, nf, 'fifo'),
      lru: simulate(seq, nf, 'lru'),
      opt: simulate(seq, nf, 'opt'),
    };
    const cur = results[state.alg];
    frameList = cur.steps.slice();
    const lastStep = cur.steps[cur.steps.length - 1];
    frameList.push({
      t: seq.length,
      page: -1,
      type: 'none',
      loadedFrame: -1,
      evicted: null,
      mem: lastStep ? lastStep.mem : [],
      faults: cur.faults,
      hits: cur.hits,
      final: true,
    });
    pb.setTotal(frameList.length);
    pb.reset();
  }

  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
