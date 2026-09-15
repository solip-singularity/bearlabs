/* ============================================================================
 * cache — 缓存命中大冒险
 * 地址流（按块号）→ 直接映射 / 2 路、4 路组相联缓存；逐次访问展示
 * 命中（绿）/ 缺失（红）/ 替换（砂金 = 被换出的块）；统计命中率。
 * 帧序列 + playback 模式（参照 sorting.js）
 * ==========================================================================*/
DemoKit.register('cache', function (root, kit) {
  const P = kit.palette;
  const state = { mode: 'direct', pattern: 'loop', len: 16 };
  let frames = [];
  let pb = null;

  const cv = kit.canvas(720, 430);
  cv.canvas.setAttribute('aria-label', '缓存演示：上方是地址流（绿=命中、红=缺失、蓝=正在访问），下方是 8 行缓存，每次访问显示行 / 组映射结果与替换过程');

  kit.controlRow();
  const modeSel = kit.select({
    label: '映射方式',
    options: [
      { value: 'direct', label: '直接映射（8 行，一块只有一处）' },
      { value: '2way', label: '2 路组相联（4 组 × 2 路）' },
      { value: '4way', label: '4 路组相联（2 组 × 4 路）' },
    ],
    value: state.mode,
  }, (v) => { state.mode = v; rebuild(); });
  const patSel = kit.select({
    label: '地址流',
    options: [
      { value: 'loop', label: '循环重用：0,1,2,3 反复用' },
      { value: 'stream', label: '顺序扫描：0,1,2,3,… 一路向前' },
      { value: 'stride', label: '冲突跳跃：0,8,16,24 全撞一处' },
    ],
    value: state.pattern,
  }, (v) => { state.pattern = v; rebuild(); });
  const lenRange = kit.range({
    label: '访问次数', min: 8, max: 24, value: state.len, format: (v) => v + ' 次',
  }, (v) => { state.len = v; rebuild(); });
  const b1 = kit.badge('');
  const b2 = kit.badge('');
  const b3 = kit.badge('');
  pb = kit.playback({ total: 1, onChange: render });
  const legend = document.createElement('div');
  legend.className = 'dk-legend';
  kit.stage.appendChild(legend);
  const EXPLAIN_BASE = '缓存是 CPU 和主存之间的小仓库：把常用的数据块提前搬进来，访问时先在仓库里找——找到叫「命中」，找不到叫「缺失」，这时要去主存搬进来；如果没空位，就得按规则换掉一块旧的（替换）。绿色 = 命中，红色 = 缺失，砂金色 = 被换出的块。<br>直接映射：每个块只认唯一一行（行号 = 块号 mod 行数）。组相联：先按（块号 mod 组数）找到组，组内有几条「路」可以住几个块，满了就按 LRU（最久未使用）替换。';

  function setLegend(items) {
    legend.innerHTML = '';
    items.forEach((it) => {
      const span = document.createElement('span');
      span.className = 'lg-item';
      const sw = document.createElement('span');
      sw.className = 'lg-swatch';
      sw.style.background = it.color;
      span.appendChild(sw);
      const tx = document.createElement('span');
      tx.textContent = it.label;
      span.appendChild(tx);
      legend.appendChild(span);
    });
  }

  /* @testable:begin */
  /* ---------- 纯逻辑：映射与模拟（可在 node 中单独验证） ---------- */
  const BLOCK = 16; /* 每块 16 字节 */
  function cacheCfg(mode) {
    const G = mode === 'direct' ? 1 : (mode === '2way' ? 2 : 4);
    return { G: G, sets: 8 / G };
  }
  function buildSeq(pattern, len) {
    const out = [];
    for (let k = 0; k < len; k++) {
      out.push(pattern === 'stream' ? k : (pattern === 'loop' ? (k % 4) : ((k % 4) * 8)));
    }
    return out;
  }
  function simulate(mode, pattern, len) {
    const c = cacheCfg(mode);
    const seq = buildSeq(pattern, len);
    const cache = [];
    for (let s = 0; s < c.sets; s++) {
      const ways = [];
      for (let w = 0; w < c.G; w++) ways.push({ block: -1, tag: 0, used: 0 });
      cache.push(ways);
    }
    const steps = [];
    let hits = 0;
    let misses = 0;
    let t = 0;
    for (let k = 0; k < seq.length; k++) {
      t++;
      const b = seq[k];
      const tag = Math.floor(b / c.sets);
      const idx = b % c.sets;
      let hitWay = -1;
      for (let w = 0; w < c.G; w++) {
        if (cache[idx][w].block === b) { hitWay = w; break; }
      }
      if (hitWay >= 0) {
        hits++;
        cache[idx][hitWay].used = t;
        steps.push({ k: k, b: b, tag: tag, idx: idx, hit: true, way: hitWay, evicted: null, firstEmpty: false });
      } else {
        misses++;
        let emptyWay = -1;
        for (let w = 0; w < c.G; w++) {
          if (cache[idx][w].block === -1) { emptyWay = w; break; }
        }
        let way;
        let evicted = null;
        if (emptyWay >= 0) {
          way = emptyWay;
        } else {
          way = 0;
          for (let w = 1; w < c.G; w++) {
            if (cache[idx][way].used > cache[idx][w].used) way = w;
          }
          evicted = cache[idx][way].block;
        }
        cache[idx][way].block = b;
        cache[idx][way].tag = tag;
        cache[idx][way].used = t;
        steps.push({ k: k, b: b, tag: tag, idx: idx, hit: false, way: way, evicted: evicted, firstEmpty: emptyWay >= 0 });
      }
    }
    return { G: c.G, sets: c.sets, seq: seq, steps: steps, hits: hits, misses: misses };
  }
  /* @testable:end */

  function modeName(m) {
    return m === 'direct' ? '直接映射（8 行）' : (m === '2way' ? '2 路组相联（4 组 × 2 路）' : '4 路组相联（2 组 × 4 路）');
  }
  function takeaway(G, pattern) {
    if (pattern === 'loop') return '规律：每个块第一次都要跑一趟主存，之后反复访问就全都在缓存里等着——这正是「局部性」带来的红利。';
    if (pattern === 'stream') return '每个块只出现一次，从没有重复访问，缓存一点忙也帮不上——没有重用，缓存就没有价值。';
    if (G === 1) return '0、8、16、24 这四个块在直接映射里全指着同一行，轮流把对方挤走——典型的「冲突缺失」。换成组相联试试，它们就能各占一条路。';
    if (G === 2) return '四个块抢两条路，还是不够，基本一直在互相顶替。试试 4 路组相联！';
    return '4 条路刚好装下这四个块：头 4 次搬进来，之后全部命中——关联度把「冲突缺失」消掉了。';
  }

  /* ---------- 帧序列 ---------- */
  function computeFrames() {
    const sim = simulate(state.mode, state.pattern, state.len);
    const G = sim.G;
    const seq = sim.seq;
    const out = [];
    const results = new Array(seq.length).fill(null);
    const snap = (o) => {
      out.push({
        kind: 'cache', G: G, sets: sim.sets,
        seq: seq.slice(), results: results.slice(),
        cur: o.cur === undefined ? -1 : o.cur,
        cache: o.cache,
        hits: o.hits || 0, misses: o.misses || 0, done: o.done || 0,
        block: o.block === undefined ? null : o.block,
        tag: o.tag === undefined ? null : o.tag,
        idx: o.idx === undefined ? null : o.idx,
        way: o.way === undefined ? -1 : o.way,
        evicted: o.evicted === undefined ? null : o.evicted,
        hit: !!o.hit,
        formula: o.formula || '',
        why: o.why || '',
        desc: o.desc,
      });
    };
    const cacheSnap = (cache) => cache.map((ws) => ws.map((w) => ({ block: w.block, tag: w.tag })));

    /* 缓存内部状态随模拟推进，重放一遍以生成每帧快照 */
    const c2 = [];
    for (let s = 0; s < sim.sets; s++) {
      const ways = [];
      for (let w = 0; w < G; w++) ways.push({ block: -1, tag: 0, used: 0 });
      c2.push(ways);
    }
    const applyStep = (st) => {
      c2[st.idx][st.way].block = st.b;
      c2[st.idx][st.way].tag = st.tag;
    };
    snap({
      cache: cacheSnap(c2), done: 0,
      formula: '', why: '提示：改动上方「映射方式 / 地址流 / 访问次数」，整个模拟会立刻重新计算。',
      desc: '准备开跑：这是一个 8 行的小缓存，数据按 16 字节一块来搬；上下两栏里的数字都是「块号」（地址 = 块号 × 16）。接下来让 CPU 依次访问这串地址：先看它在缓存里能不能找到（命中），找不到就去主存搬（缺失），行满了还要换出一块旧的（替换）。点击「▶ 播放」或「下一步 ▶」开始。',
    });
    let h = 0;
    let m = 0;
    sim.steps.forEach((st) => {
      applyStep(st);
      if (st.hit) h++; else m++;
      results[st.k] = st.hit ? 'hit' : 'miss';
      const addr = st.b * BLOCK;
      const directTxt = G === 1
        ? '直接映射先算行号：块号 ' + st.b + ' mod ' + sim.sets + ' = ' + st.idx + '，去看第 ' + st.idx + ' 行。'
        : '组索引 = 块号 ' + st.b + ' mod ' + sim.sets + ' = ' + st.idx + '，去第 ' + st.idx + ' 组挨条路对比标签。';
      const formula = G === 1
        ? '块号 ' + st.b + ' → 行号 = ' + st.b + ' mod ' + sim.sets + ' = ' + st.idx + '；标签 = floor(' + st.b + ' ÷ ' + sim.sets + ') = ' + st.tag
        : '块号 ' + st.b + ' → 组号 = ' + st.b + ' mod ' + sim.sets + ' = ' + st.idx + '；标签 = floor(' + st.b + ' ÷ ' + sim.sets + ') = ' + st.tag;
      let desc;
      let why;
      if (st.hit) {
        const where = G === 1 ? ('第 ' + st.idx + ' 行') : ('第 ' + st.idx + ' 组第 ' + st.way + ' 路');
        desc = '第 ' + (st.k + 1) + ' 次访问：地址 ' + addr + '（块号 ' + st.b + '）。' + directTxt
          + '一看，' + where + '里存的正是一块 ' + st.b + ' → 命中！为什么这次能中：这个块之前就被搬进来过，之后没有别的块把它挤走，所以还在原地等你。';
        why = '为什么命中：块 ' + st.b + ' 早就住在' + where + '里，没被换走。';
      } else if (st.firstEmpty) {
        const place = G === 1
          ? ('第 ' + st.idx + ' 行 ← 块 ' + st.b + '（标签 ' + st.tag + '）')
          : ('第 ' + st.idx + ' 组第 ' + st.way + ' 路还是空位 ← 块 ' + st.b + '（标签 ' + st.tag + '）');
        desc = '第 ' + (st.k + 1) + ' 次访问：地址 ' + addr + '（块号 ' + st.b + '）。' + directTxt
          + '位置上是空的 → 缺失（这个块是第一次来，缓存里没有存货）。把它搬进来：' + place + '。';
        why = '为什么缺失：块 ' + st.b + ' 是第一次出现，缓存里没有它。';
      } else {
        const evTag = Math.floor(st.evicted / sim.sets);
        const repl = G === 1
          ? '直接映射里每个块只认「唯一一行」，撞车就得让位：把块 ' + st.evicted + ' 请出去（砂金 = 被换出的块），块 ' + st.b + ' 搬进来。'
          : '组里没有空位了，按「最久未使用（LRU）」挑一条路换掉：块 ' + st.evicted + ' 被请出去（砂金 = 被换出的块），块 ' + st.b + ' 住进第 ' + st.way + ' 路。';
        desc = '第 ' + (st.k + 1) + ' 次访问：地址 ' + addr + '（块号 ' + st.b + '）。' + directTxt
          + '里面住着块 ' + st.evicted + '（标签 ' + evTag + '，和 ' + st.tag + ' 对不上）→ 缺失，只能替换。' + repl;
        why = '为什么缺失：位置被块 ' + st.evicted + ' 占着，标签对不上，只好把它换出去。';
      }
      snap({
        cur: st.k, cache: cacheSnap(c2), hits: h, misses: m, done: st.k + 1,
        block: st.b, tag: st.tag, idx: st.idx, way: st.way, evicted: st.evicted, hit: st.hit,
        formula: formula, why: why, desc: desc,
      });
    });
    const rate = Math.round((sim.hits / seq.length) * 100);
    snap({
      cur: -2, cache: cacheSnap(c2), hits: h, misses: m, done: seq.length,
      formula: '', why: takeaway(G, state.pattern),
      desc: '访问结束！共 ' + seq.length + ' 次访问：命中 ' + h + ' 次、缺失 ' + m + ' 次，命中率 ' + rate + '%。' + takeaway(G, state.pattern),
    });
    return out;
  }

  /* ---------- 绘制 ---------- */
  function rr(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function drawChip(ctx, x, y, w, h, fill, stroke, text, tcol, fontPx) {
    rr(ctx, x, y, w, h, 8);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = tcol || P.ink;
    ctx.font = (fontPx || 12) + 'px ' + kit.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
  }

  function drawCache(ctx, f) {
    ctx.fillStyle = P.muted;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('缓存命中大冒险 —— ' + modeName(state.mode) + '；每块 16 字节（显示「块号」，地址 = 块号 × 16）', 24, 26);

    /* 地址流 */
    ctx.fillStyle = P.muted;
    ctx.font = '11px ' + kit.font;
    ctx.fillText('访问序列（数字 = 块号；蓝 = 正在访问，绿 = 命中，红 = 缺失）：', 24, 48);
    const chipW = Math.max(18, Math.min(26, Math.floor((720 - 48 - f.seq.length * 2) / f.seq.length)));
    const chipY = 58;
    for (let k = 0; k < f.seq.length; k++) {
      const x = 24 + k * (chipW + 2);
      let fill = P.surface;
      let stroke = P.border;
      let tcol = P.muted;
      if (f.results[k] === 'hit') { fill = P.wash; stroke = P.green; tcol = P.green; }
      else if (f.results[k] === 'miss') { fill = P.redWash; stroke = P.red; tcol = P.red; }
      if (k === f.cur) { fill = P.blueWash; stroke = P.blue; tcol = P.blue; }
      rr(ctx, x, chipY, chipW, 22, 4);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = k === f.cur ? 2 : 1.1;
      ctx.stroke();
      ctx.fillStyle = tcol;
      ctx.font = '10px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(f.seq[k]), x + chipW / 2, chipY + 11);
      ctx.textBaseline = 'alphabetic';
    }

    /* 当前访问行 */
    const lineY = 94;
    if (f.cur >= 0) {
      drawChip(ctx, 24, lineY, 88, 24, P.blueWash, P.blue, '第 ' + (f.cur + 1) + ' 次', P.blue, 12);
      ctx.fillStyle = P.ink;
      ctx.font = '13px ' + kit.font;
      ctx.textAlign = 'left';
      ctx.fillText('地址 ' + (f.block * 16) + '（块号 ' + f.block + '）', 124, lineY + 17);
    } else if (f.cur === -2) {
      drawChip(ctx, 24, lineY, 88, 24, P.wash, P.green, '已结束', P.green, 12);
      ctx.fillStyle = P.ink;
      ctx.font = '13px ' + kit.font;
      ctx.textAlign = 'left';
      ctx.fillText('共访问 ' + f.seq.length + ' 次，命中率 ' + Math.round((f.hits / f.done) * 100) + '%', 124, lineY + 17);
    } else {
      ctx.fillStyle = P.muted;
      ctx.font = '12px ' + kit.font;
      ctx.fillText('准备就绪：点击「▶ 播放」或「下一步 ▶」开始访问。', 24, lineY + 17);
    }

    /* 缓存状态 */
    ctx.fillStyle = P.ink;
    ctx.font = '12px ' + kit.font;
    ctx.fillText('缓存状态（' + (f.G === 1 ? '共 8 行' : '共 ' + f.sets + ' 组 × ' + f.G + ' 路') + '）：', 24, 136);
    const rowsTop = 144;
    const regionH = 190;
    const rows = f.sets;
    const gap = rows > 4 ? 4 : 6;
    const rowH = Math.min(rows === 4 ? 40 : 46, Math.floor((regionH - gap * (rows - 1)) / rows));
    const xL = 24;
    const xR = 700;
    const cellsX = 106;
    const wayGap = 6;
    const wayW = (xR - cellsX - wayGap * (f.G - 1)) / f.G;
    for (let s = 0; s < rows; s++) {
      const y = rowsTop + s * (rowH + gap);
      ctx.fillStyle = P.muted;
      ctx.font = '11px ' + kit.font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.G === 1 ? ('行 ' + s) : ('组 ' + s), xL + 64, y + rowH / 2);
      ctx.textBaseline = 'alphabetic';
      for (let w = 0; w < f.G; w++) {
        const x = cellsX + w * (wayW + wayGap);
        const cell = f.cache[s][w];
        const involved = f.cur >= 0 && f.cur !== -2 && s === f.idx && w === f.way;
        let fill = P.surface;
        let stroke = P.border;
        let lw = 1.2;
        let dashed = false;
        if (cell.block === -1) { dashed = true; stroke = P.border; }
        if (involved) {
          if (f.hit) { fill = P.wash; stroke = P.green; lw = 2.5; }
          else { fill = P.redWash; stroke = P.red; lw = 2.5; }
        }
        rr(ctx, x, y, wayW, rowH, 6);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.setLineDash(dashed ? [5, 4] : []);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.setLineDash([]);
        if (cell.block === -1) {
          ctx.fillStyle = P.muted;
          ctx.font = '10px ' + kit.font;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('空', x + 10, y + rowH / 2);
          ctx.textBaseline = 'alphabetic';
        } else {
          let t1 = '块 ' + cell.block + ' · 标签 ' + cell.tag;
          if (involved && f.hit) t1 = '命中！块 ' + cell.block + ' · 标签 ' + cell.tag;
          if (involved && !f.hit) t1 = '载入 块 ' + cell.block + ' · 标签 ' + cell.tag;
          const bigRow = rowH >= 40;
          const showEvict = involved && !f.hit && f.evicted !== null && f.evicted !== undefined;
          ctx.fillStyle = involved ? (f.hit ? P.green : P.red) : P.ink;
          ctx.font = (bigRow ? 12 : 10) + 'px ' + kit.font;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const mainY = showEvict && bigRow ? (y + rowH / 2 - 5) : (y + rowH / 2);
          ctx.fillText(t1, x + 10, mainY);
          if (showEvict) {
            ctx.fillStyle = P.sandInk;
            ctx.font = '10px ' + kit.font;
            if (bigRow) {
              ctx.fillText('换出 块 ' + f.evicted + '（砂金）', x + 10, y + rowH / 2 + 13);
            } else {
              ctx.textAlign = 'right';
              ctx.fillText('换出 块 ' + f.evicted, x + wayW - 10, mainY);
            }
          }
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
    if (f.G > 1) {
      ctx.fillStyle = P.muted;
      ctx.font = '11px ' + kit.font;
      ctx.textAlign = 'left';
      const hintY = Math.min(334, rowsTop + (rows - 1) * (rowH + gap) + rowH + 12);
      ctx.fillText('组相联：同一组里的每条「路」都能住一个块；组满了就按 LRU（最久未使用）挑一条换出。', 24, hintY);
    }

    /* 公式 + 解释 + 结果 */
    ctx.fillStyle = P.ink;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'left';
    ctx.fillText(f.formula, 24, 346);
    ctx.fillStyle = P.accentDeep;
    ctx.font = '12px ' + kit.font;
    ctx.fillText(f.why, 24, 370);
    const resKind = f.cur >= 0 ? (f.hit ? 'hit' : 'miss') : (f.cur === -2 ? 'end' : 'idle');
    const chipInfo = resKind === 'hit' ? ['命中', P.wash, P.green, P.green]
      : resKind === 'miss' ? ['缺失', P.redWash, P.red, P.red]
        : resKind === 'end' ? ['结束', P.sandWash, P.sand, P.sandInk]
          : ['待机', P.surface, P.border, P.muted];
    drawChip(ctx, 24, 386, 92, 30, chipInfo[1], chipInfo[2], chipInfo[0], chipInfo[3], 13);
    ctx.fillStyle = P.ink;
    ctx.font = '12px ' + kit.font;
    const pct = f.done ? Math.round((f.hits / f.done) * 100) : 0;
    ctx.fillText('累计：命中 ' + f.hits + ' 次 · 缺失 ' + f.misses + ' 次 · 命中率 ' + pct + '%（已访问 ' + f.done + ' / ' + f.seq.length + ' 次）', 132, 405);
  }

  /* ---------- 渲染与重建 ---------- */
  function render(i) {
    const f = frames[i];
    if (!f) return;
    cv.bg(P.bg);
    drawCache(cv.ctx, f);
    b1.set('命中 ' + f.hits);
    b2.set('缺失 ' + f.misses);
    const pct = f.done ? Math.round((f.hits / f.done) * 100) : 0;
    b3.set('命中率 ' + pct + '%');
    kit.narrate({ index: i, total: frames.length, text: f.desc });
    if (i === frames.length - 1) {
      kit.explain('访问结束：这套「' + modeName(state.mode) + ' + ' + (state.pattern === 'loop' ? '循环重用' : state.pattern === 'stream' ? '顺序扫描' : '冲突跳跃') + '」组合的命中率是 ' + pct + '%。' + takeaway(f.G, state.pattern) + '<br>' + EXPLAIN_BASE);
    } else {
      kit.explain(EXPLAIN_BASE);
    }
  }

  function rebuild() {
    frames = computeFrames();
    setLegend([
      { color: P.green, label: '命中' },
      { color: P.red, label: '缺失' },
      { color: P.sand, label: '被换出的块' },
      { color: P.blue, label: '正在访问' },
      { color: P.muted, label: '空闲' },
    ]);
    pb.setTotal(frames.length);
    pb.reset();
  }

  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
