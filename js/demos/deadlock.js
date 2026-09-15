/* ============================================================================
 * deadlock — 死锁与银行家算法
 * 模式① 资源分配图：制造环路死锁 / 按序申请避免死锁
 * 模式② 银行家算法：请求检查 + 安全检查表（Work / Finish 逐帧更新）
 * 帧序列 + playback 模式（参照 sorting.js）
 * ==========================================================================*/
DemoKit.register('deadlock', function (root, kit) {
  const P = kit.palette;
  const state = { mode: 'graph', procs: 4, sGraph: 'cycle', sBanker: 'check' };
  let frames = [];
  let pb = null;

  const cv = kit.canvas(720, 430);
  cv.canvas.setAttribute('aria-label', '死锁演示：资源分配图（圆圈=进程、方块=资源、实线=持有、虚线=等待、红色=死锁环路）或银行家算法检查表（Allocation、Max、Need 与 Work 的逐帧更新）');

  kit.controlRow();
  const modeSel = kit.select({
    label: '演示模式',
    options: [
      { value: 'graph', label: '① 制造死锁（分配图）' },
      { value: 'banker', label: '② 银行家算法（安全检查）' },
    ],
    value: state.mode,
  }, (v) => { state.mode = v; syncControls(); rebuild(); });
  const procRange = kit.range({
    label: '进程数', min: 3, max: 5, value: state.procs, format: (v) => v + ' 个',
  }, (v) => { state.procs = v; rebuild(); });
  const sGraphSel = kit.select({
    label: '情景',
    options: [
      { value: 'cycle', label: '环路死锁：回头申请' },
      { value: 'ordered', label: '按序申请：避免环路' },
    ],
    value: state.sGraph,
  }, (v) => { state.sGraph = v; rebuild(); });
  const sBankerSel = kit.select({
    label: '剧本',
    options: [
      { value: 'check', label: '先做一次安全检查' },
      { value: 'safe', label: '来一个安全的请求' },
      { value: 'unsafe', label: '来一个危险的请求' },
    ],
    value: state.sBanker,
  }, (v) => { state.sBanker = v; rebuild(); });
  const b1 = kit.badge('');
  const b2 = kit.badge('');
  pb = kit.playback({ total: 1, onChange: render });
  const legend = document.createElement('div');
  legend.className = 'dk-legend';
  kit.stage.appendChild(legend);
  const EXPLAIN_BASE = '死锁 = 一组进程互相攥着对方想要的资源，谁都不肯先松手，全体卡住。<br>模式①：亲眼看环形等待怎么一步步形成，再对比「按编号顺序申请」如何防住它。<br>模式②：银行家算法在每次「借出」之前先做一次试算——把资源假装借出去，检查还找不找得到一条让所有进程都能跑完的安全序列；找得到才真借，找不到就拒绝。';

  function syncControls() {
    const g = state.mode === 'graph';
    sGraphSel.el.style.display = g ? '' : 'none';
    sBankerSel.el.style.display = g ? 'none' : '';
  }

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
  /* ---------- 纯逻辑：向量工具 + 数据表 + 帧序列生成（可在 node 中单独验证） ---------- */
  const vfmt = (v) => '(' + v.join(', ') + ')';
  const leq = (a, b) => a.every((x, k) => x <= b[k]);
  const addv = (a, b) => a.map((x, k) => x + b[k]);
  const subv = (a, b) => a.map((x, k) => x - b[k]);
  const clone2 = (m) => m.map((r) => r.slice());

  /* 三种规模的银行家算法底账：total = 资源总数(A,B,C)；alloc = 已分配；max = 最大需求 */
  const TABLES = {
    3: { total: [5, 4, 4], alloc: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], max: [[4, 3, 3], [4, 3, 2], [3, 2, 2]] },
    4: { total: [6, 5, 5], alloc: [[1, 1, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], max: [[3, 3, 1], [4, 1, 2], [2, 2, 2], [3, 2, 2]] },
    5: { total: [10, 5, 7], alloc: [[0, 1, 0], [2, 0, 0], [3, 0, 2], [2, 1, 1], [0, 0, 2]], max: [[7, 5, 3], [3, 2, 2], [9, 0, 2], [2, 2, 2], [4, 3, 3]] },
  };
  const SAFE_REQ = { 3: { p: 2, v: [1, 0, 0] }, 4: { p: 0, v: [1, 0, 0] }, 5: { p: 1, v: [1, 0, 2] } };
  const UNSAFE_REQ = { 3: { p: 0, v: [1, 0, 0] }, 4: { p: 1, v: [2, 0, 0] }, 5: { p: 0, v: [3, 2, 2] } };

  /* 模式①：资源分配图帧序列 */
  function graphFrames(n, scen) {
    const out = [];
    const resHolder = new Array(n).fill(-1);
    const holds = [];
    const waits = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    for (let i = 0; i < n; i++) holds.push([]);
    function snap(desc, extra) {
      const f = {
        kind: 'graph', n: n,
        resHolder: resHolder.slice(),
        holds: holds.map((a) => a.slice()),
        waits: waits.slice(),
        done: done.slice(),
        cycle: false,
        desc: desc,
      };
      if (extra) Object.keys(extra).forEach((k) => { f[k] = extra[k]; });
      out.push(f);
    }
    snap('初始状态：' + n + ' 个进程 P0 — P' + (n - 1) + '；' + n + ' 类资源 R0 — R' + (n - 1) + '，每类只有 1 个实例，现在全部空闲。接下来按剧本一步步走。');
    for (let i = 0; i < n; i++) {
      resHolder[i] = i;
      holds[i].push(i);
      snap('P' + i + ' 申请 R' + i + '：R' + i + ' 正空闲，直接授予。P' + i + ' 持有 R' + i + '（一条从资源指向进程的实线）。', { hl: ['P' + i, 'R' + i], hlEdge: 'h:R' + i + ':P' + i });
    }
    if (scen === 'cycle') {
      for (let i = 0; i < n; i++) {
        const r = (i + 1) % n;
        waits[i] = r;
        const lastTxt = i === n - 1
          ? '注意：这是「回头」申请——编号绕回到最前面，危险就藏在这一步！'
          : '';
        snap('P' + i + ' 接着申请 R' + r + '：R' + r + ' 已经被 P' + r + ' 占着，P' + i + ' 只能等待（一条从进程指向资源的虚线）。' + lastTxt, { hl: ['P' + i, 'R' + r], hlEdge: 'w:P' + i + ':R' + r });
      }
      const waitEdges = [];
      const holdEdges = [];
      const nodes = [];
      for (let i = 0; i < n; i++) {
        const r = (i + 1) % n;
        waitEdges.push('w:P' + i + ':R' + r);
        holdEdges.push('h:R' + r + ':P' + r);
        nodes.push('P' + i);
        nodes.push('R' + i);
      }
      let chain = [];
      for (let i = 0; i < n; i++) { chain.push('P' + i); chain.push('R' + ((i + 1) % n)); }
      chain.push('P0');
      const chainStr = chain.join(' → ');
      snap('停一下，仔细看：现在每个进程都「手里攥着一个资源、还在等另一个」。沿着等待关系往外走：' + chainStr + '——绕一圈又回到了起点！', { cycle: true, cycleW: waitEdges, cycleH: holdEdges, cycleNodes: nodes });
      snap('这圈「环形等待」就是死锁：' + chainStr + '。链上每个人都想往前走，但每个人要的东西都在别人手里，谁也动不了，系统彻底卡死。红色标出的就是这个死亡之环。死锁的四个必要条件（互斥、占有并等待、不可剥夺、循环等待）此刻全部满足——只要打破其中一条，就能防死锁。', { cycle: true, cycleW: waitEdges, cycleH: holdEdges, cycleNodes: nodes });
    } else {
      for (let i = 0; i < n - 1; i++) {
        const r = i + 1;
        waits[i] = r;
        snap('按「只许申请更大编号」的约定，P' + i + ' 申请 R' + r + '：R' + r + ' 被 P' + r + ' 占着，先等待。放心：它绝不会回头去要 R0 这种小号资源——等待链只会顺着编号往上走。', { hl: ['P' + i, 'R' + r], hlEdge: 'w:P' + i + ':R' + r });
      }
      resHolder[n - 1] = -1;
      holds[n - 1] = [];
      done[n - 1] = true;
      snap('轮到 P' + (n - 1) + '：按约定，它既不需要、也不许回头申请更小号的资源，等待链到它这里就断了。它把手头的事做完，释放 R' + (n - 1) + '。', { hl: ['P' + (n - 1)] });
      snap('R' + (n - 1) + ' 空闲了。等待关系永远单向递增、转不回起点，环就永远形不成——这是「按序申请」能防死锁的原因。');
      for (let k = n - 2; k >= 0; k--) {
        waits[k] = -1;
        resHolder[k + 1] = k;
        holds[k].push(k + 1);
        snap('P' + k + ' 等到 R' + (k + 1) + '（刚被腾出来），拿到手。', { hl: ['P' + k, 'R' + (k + 1)], hlEdge: 'h:R' + (k + 1) + ':P' + k });
        resHolder[k] = -1;
        resHolder[k + 1] = -1;
        holds[k] = [];
        done[k] = true;
        snap('P' + k + ' 任务完成，一次性释放 R' + k + ' 和 R' + (k + 1) + '，腾出的资源让下一位继续往前走。');
      }
      snap('所有进程都完成，资源全部空闲，自始至终没有出现环路。结论：只要大家统一按「编号从小到大」申请资源，「循环等待」就不可能发生——这是一种简单又便宜的死锁预防办法。');
    }
    return out;
  }

  /* 模式②：银行家算法帧序列 */
  function bankerFrames(n, scen) {
    const T = TABLES[n];
    const max = clone2(T.max);
    let A = clone2(T.alloc);
    let N = max.map((row, i) => subv(row, A[i]));
    let av = T.total.map((x, k) => x - A.reduce((s, r) => s + r[k], 0));
    const out = [];
    let work = av.slice();
    let fin = new Array(n).fill(false);
    let seq = [];
    function snap(o) {
      out.push({
        kind: 'banker', n: n,
        alloc: clone2(o.A || A),
        max: clone2(max),
        need: o.blank ? null : clone2(o.N || N),
        blank: !!o.blank,
        work: (o.work || av).slice(),
        finish: (o.finish || fin).slice(),
        seq: (o.seq || seq).slice(),
        hlRow: o.hlRow === undefined ? -1 : o.hlRow,
        badRows: (o.badRows || []).slice(),
        tent: !!o.tent,
        req: o.req || null,
        chip: o.chip || null,
        desc: o.desc,
      });
    }
    snap({
      blank: true, work: av,
      desc: '银行家算法的底账是一张表：Allocation = 已经分给每个进程的资源数；Max = 每个进程「一共」最多需要多少；Need = 还差多少。先算 Need：Max − Allocation，一行一行减。（问号 = 还没算）',
    });
    snap({
      work: av,
      desc: '算好了：Need = Max − Allocation（以 P0 为例：' + vfmt(max[0]) + ' − ' + vfmt(A[0]) + ' = ' + vfmt(N[0]) + '）。当前可用量 = 资源总数 ' + vfmt(T.total) + ' 减去已经分出去的总和 = ' + vfmt(av) + '。银行家的家底就看这个数。',
    });

    function runSafety(Ax, Nx, availX, tent) {
      work = availX.slice();
      fin = new Array(n).fill(false);
      seq = [];
      snap({
        A: Ax, N: Nx, work: work.slice(), finish: fin.slice(), seq: [],
        tent: tent,
        desc: '安全检查开始：把 Work 抄一份当前可用量 ' + vfmt(availX) + '，所有进程的 Finish 都设为「未完成」。规则：反复找一个「Need ≤ Work」的进程，假设它已经完成、把占用的资源还进 Work；如果能让所有进程都拿到 Finish，就说明状态安全。',
      });
      let guard = 0;
      while (seq.length < n && guard++ <= n + 1) {
        let pick = -1;
        const skipped = [];
        for (let i = 0; i < n; i++) {
          if (fin[i]) continue;
          if (leq(Nx[i], work)) { pick = i; break; }
          skipped.push(i);
        }
        if (pick === -1) {
          snap({
            A: Ax, N: Nx, work: work.slice(), finish: fin.slice(), seq: seq.slice(), tent: tent,
            badRows: skipped.slice(),
            desc: '扫描还没完成的进程：' + skipped.map((i) => 'P' + i).join('、') + ' 的 Need 全部都大于 Work ' + vfmt(work) + '，没有一个能完成。链条卡死在这里——找不到安全序列，系统「不安全」。',
          });
          return false;
        }
        const before = work.slice();
        work = addv(work, Ax[pick]);
        fin = fin.slice();
        fin[pick] = true;
        seq = seq.concat([pick]);
        const skipTxt = skipped.length ? skipped.map((i) => 'P' + i).join('、') + ' 的 Need 都比 Work 大，先跳过；' : '';
        snap({
          A: Ax, N: Nx, work: work.slice(), finish: fin.slice(), seq: seq.slice(),
          hlRow: pick, tent: tent,
          desc: skipTxt + '轮到 P' + pick + '：Need ' + vfmt(Nx[pick]) + ' 每一项都 ≤ Work ' + vfmt(before) + '，它能完成！假设它做完并归还资源：Work = ' + vfmt(before) + ' + ' + vfmt(Ax[pick]) + ' = ' + vfmt(work) + '，Finish[P' + pick + '] 标记为完成。',
        });
      }
      return true;
    }

    if (scen === 'check') {
      const ok = runSafety(A, N, av, false);
      if (ok) {
        snap({
          work: work.slice(), finish: fin.slice(), seq: seq.slice(),
          chip: { kind: 'ok', label: '状态安全' },
          desc: n + ' 个进程全都找到了归宿，安全序列（其中一条）= ' + seq.map((i) => 'P' + i).join(' → ') + '。有这条路在，银行家就敢继续放贷：最坏情况下照这个顺序一个个放行，大家都能跑完。',
        });
      }
      return out;
    }

    const cfg = (scen === 'safe' ? SAFE_REQ : UNSAFE_REQ)[n];
    const req = cfg.v.slice();
    const rp = cfg.p;
    const reqInfo = { p: rp, v: req };
    const cmpDetail = (a, b) => a.map((x, k) => x + '≤' + b[k]).join('、');
    snap({
      req: reqInfo,
      desc: '有人来办业务了：P' + rp + ' 提出申请 ' + vfmt(req) + '（要 A ' + req[0] + ' 个、B ' + req[1] + ' 个、C ' + req[2] + ' 个）。银行家算法规定：申请要先过两道检查，再试算一遍，最后才决定借不借。',
    });
    snap({
      req: reqInfo, hlRow: rp,
      desc: '第一关：申请 ' + vfmt(req) + ' 不能超过 P' + rp + ' 的 Need ' + vfmt(N[rp]) + '（不能超额索取）。逐项比：' + cmpDetail(req, N[rp]) + ' → 通过。',
    });
    snap({
      req: reqInfo, hlRow: rp,
      desc: '第二关：申请 ' + vfmt(req) + ' 不能超过当前可用量 ' + vfmt(av) + '（库里得有货）。逐项比：' + cmpDetail(req, av) + ' → 通过。两关都过，接下来做最关键的一步：试算。',
    });
    const A2 = clone2(A);
    A2[rp] = addv(A2[rp], req);
    const N2 = clone2(N);
    N2[rp] = subv(N2[rp], req);
    const av2 = subv(av, req);
    snap({
      A: A2, N: N2, work: av2.slice(), req: reqInfo, hlRow: rp, tent: true,
      desc: '试算（试探性分配）：假装已经借出去——从可用量里扣掉 ' + vfmt(req) + '，P' + rp + ' 的 Allocation 加上、Need 相应减少。记住：这只是草稿，一旦试算发现不安全，会立刻全部撤回。',
    });
    const ok = runSafety(A2, N2, av2, true);
    if (ok) {
      A = A2;
      N = N2;
      av = av2;
      snap({
        work: work.slice(), finish: fin.slice(), seq: seq.slice(), req: reqInfo,
        chip: { kind: 'ok', label: '批准' },
        desc: '试算结果：安全！存在安全序列 ' + seq.map((i) => 'P' + i).join(' → ') + '。所以批准这笔业务，把草稿变成正式结果——表格已经更新：P' + rp + ' 的 Allocation = ' + vfmt(A[rp]) + '，Need = ' + vfmt(N[rp]) + '，可用量 = ' + vfmt(av) + '。',
      });
    } else {
      snap({
        work: av.slice(), finish: new Array(n).fill(false), seq: [], req: reqInfo, badRows: [rp],
        chip: { kind: 'bad', label: '请求被拒绝' },
        desc: '试算结果：不安全！借出去之后，任何一条放行顺序都走不通。所以这笔申请必须拒绝——撤回全部试探，系统状态保持原样（表格里的数字和一开始一模一样）。',
      });
    }
    return out;
  }
  /* @testable:end */

  /* ---------- 绘制小工具 ---------- */
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
  function drawArrow(ctx, x1, y1, x2, y2, color, dashed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [6, 5] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const s = 9;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - s * Math.cos(ang - 0.42), y2 - s * Math.sin(ang - 0.42));
    ctx.lineTo(x2 - s * Math.cos(ang + 0.42), y2 - s * Math.sin(ang + 0.42));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
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

  /* ---------- 模式① 绘制 ---------- */
  function drawGraph(ctx, f) {
    const n = f.n;
    const top = 96;
    const bottom = 372;
    const yOf = (i) => (n === 1 ? (top + bottom) / 2 : top + (i * (bottom - top)) / (n - 1));
    const px = 128;
    const rx = 596;
    const inW = (s) => (f.cycleW || []).indexOf(s) >= 0;
    const inH = (s) => (f.cycleH || []).indexOf(s) >= 0;
    const inN = (s) => (f.cycleNodes || []).indexOf(s) >= 0;
    const hl = f.hl || [];

    ctx.fillStyle = P.muted;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'left';
    ctx.fillText('资源分配图：圆圈 = 进程，方块 = 资源（每类 1 个实例）；实线 = 持有，虚线 = 等待', 24, 28);
    if (f.cycle) {
      rr(ctx, 252, 40, 216, 30, 8);
      ctx.fillStyle = P.redWash;
      ctx.fill();
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = P.red;
      ctx.font = 'bold 14px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.fillText('环路出现 → 死锁！', 360, 60);
    }
    ctx.fillStyle = P.muted;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'center';
    ctx.fillText('进程', px, 86);
    ctx.fillText('资源', rx, 86);

    /* 先画边，再画节点 */
    for (let i = 0; i < n; i++) {
      f.holds[i].forEach((r) => {
        const key = 'h:R' + r + ':P' + i;
        const col = inH(key) ? P.red : (f.hlEdge === key ? P.blue : P.ink);
        drawArrow(ctx, 532, yOf(r), 154, yOf(i), col, false);
      });
      if (f.waits[i] >= 0) {
        const r = f.waits[i];
        const key = 'w:P' + i + ':R' + r;
        const col = inW(key) ? P.red : (f.hlEdge === key ? P.blue : P.muted);
        drawArrow(ctx, 154, yOf(i), 532, yOf(r), col, true);
      }
    }
    for (let i = 0; i < n; i++) {
      const y = yOf(i);
      ctx.beginPath();
      ctx.arc(px, y, 26, 0, Math.PI * 2);
      ctx.fillStyle = P.surface;
      ctx.fill();
      let stroke = P.ink;
      if (inN('P' + i)) stroke = P.red;
      else if (hl.indexOf('P' + i) >= 0) stroke = P.blue;
      else if (f.done[i]) stroke = P.green;
      else if (f.waits[i] >= 0) stroke = P.sand;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = 'bold 15px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P' + i, px, y);
      ctx.textBaseline = 'alphabetic';
      const sts = [];
      if (f.done[i]) sts.push('已完成');
      else {
        if (f.holds[i].length) sts.push('持 ' + f.holds[i].map((r) => 'R' + r).join(' '));
        if (f.waits[i] >= 0) sts.push('等 R' + f.waits[i]);
        if (!f.holds[i].length && f.waits[i] < 0) sts.push('空闲');
      }
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = f.done[i] ? P.green : (f.waits[i] >= 0 ? P.sandInk : P.muted);
      ctx.fillText(sts.join(' · '), px, y + 44);
    }
    for (let i = 0; i < n; i++) {
      const y = yOf(i);
      const bx = rx - 64;
      const by = y - 26;
      rr(ctx, bx, by, 128, 52, 10);
      ctx.fillStyle = P.surface;
      ctx.fill();
      let stroke = f.resHolder[i] >= 0 ? P.accent : P.muted;
      if (inN('R' + i)) stroke = P.red;
      else if (hl.indexOf('R' + i) >= 0) stroke = P.blue;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = 'bold 14px ' + kit.font;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('R' + i, bx + 16, y);
      ctx.font = '12px ' + kit.font;
      ctx.fillStyle = f.resHolder[i] >= 0 ? P.accentDeep : P.muted;
      ctx.fillText(f.resHolder[i] >= 0 ? '持有者 P' + f.resHolder[i] : '空闲', bx + 58, y);
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* ---------- 模式② 绘制 ---------- */
  function drawBanker(ctx, f) {
    const n = f.n;
    ctx.fillStyle = P.muted;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('银行家算法检查表：Allocation（已分配）· Max（最大需求）· Need（还需 = Max − Allocation）', 24, 28);

    /* Work 芯片 */
    ctx.fillStyle = P.ink;
    ctx.font = '13px ' + kit.font;
    ctx.fillText('Work：', 24, 69);
    const wk = ['A', 'B', 'C'];
    for (let k = 0; k < 3; k++) {
      const x = 86 + k * 104;
      rr(ctx, x, 50, 96, 28, 8);
      ctx.fillStyle = P.sandWash;
      ctx.fill();
      ctx.strokeStyle = P.sand;
      ctx.lineWidth = 1.4;
      ctx.setLineDash(f.tent ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.sandInk;
      ctx.font = '13px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wk[k] + ' = ' + f.work[k], x + 48, 65);
      ctx.textBaseline = 'alphabetic';
    }
    if (f.tent) {
      ctx.fillStyle = P.sandInk;
      ctx.font = '11px ' + kit.font;
      ctx.textAlign = 'left';
      ctx.fillText('（试探值，不安全就撤回）', 400, 69);
    }
    if (f.req) {
      rr(ctx, 452, 46, 244, 34, 8);
      ctx.fillStyle = P.blueWash;
      ctx.fill();
      ctx.strokeStyle = P.blue;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = P.blue;
      ctx.font = '12px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('请求：P' + f.req.p + ' 申请 ' + vfmt(f.req.v), 574, 63);
      ctx.textBaseline = 'alphabetic';
    }

    /* 表格坐标 */
    const x0 = 100;
    const procW = 62;
    const cellW = 44;
    const grpW = cellW * 3;
    const finW = 62;
    const xA = x0 + procW;
    const xM = xA + grpW;
    const xN = xM + grpW;
    const xF = xN + grpW;
    const xEnd = xF + finW;
    const y0 = 92;
    const gHead = 18;
    const sHead = 16;
    const rowH = 34;
    const rowsY = y0 + gHead + sHead;
    const tableBottom = rowsY + n * rowH;

    ctx.fillStyle = P.surface;
    ctx.fillRect(x0, y0, xEnd - x0, gHead + sHead + n * rowH);
    ctx.fillStyle = P.muted;
    ctx.font = '11px ' + kit.font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('进程', x0 + procW / 2, y0 + 13);
    ctx.fillText('Allocation 已分配', xA + grpW / 2, y0 + 13);
    ctx.fillText('Max 最大需求', xM + grpW / 2, y0 + 13);
    ctx.fillText('Need 还需', xN + grpW / 2, y0 + 13);
    ctx.fillText('Finish 完成?', xF + finW / 2, y0 + 13);
    ['A', 'B', 'C'].forEach((t, k) => {
      ctx.fillText(t, xA + k * cellW + cellW / 2, y0 + gHead + 12);
      ctx.fillText(t, xM + k * cellW + cellW / 2, y0 + gHead + 12);
      ctx.fillText(t, xN + k * cellW + cellW / 2, y0 + gHead + 12);
    });

    for (let i = 0; i < n; i++) {
      const ry = rowsY + i * rowH;
      if (i === f.hlRow) {
        ctx.fillStyle = P.sandWash;
        ctx.fillRect(x0, ry, xEnd - x0, rowH);
        ctx.fillStyle = P.sand;
        ctx.fillRect(x0, ry, 4, rowH);
      } else if ((f.badRows || []).indexOf(i) >= 0) {
        ctx.fillStyle = P.redWash;
        ctx.fillRect(x0, ry, xEnd - x0, rowH);
      } else if (f.finish[i]) {
        ctx.fillStyle = P.wash;
        ctx.fillRect(x0, ry, xEnd - x0, rowH);
      }
      ctx.fillStyle = P.ink;
      ctx.font = 'bold 12px ' + kit.font;
      ctx.textAlign = 'center';
      ctx.fillText('P' + i, x0 + procW / 2, ry + rowH / 2 + 4);
      const rows = [f.alloc[i], f.max[i], f.need ? f.need[i] : null];
      const xs = [xA, xM, xN];
      ctx.font = '12px ' + kit.font;
      for (let g = 0; g < 3; g++) {
        for (let k = 0; k < 3; k++) {
          const cx = xs[g] + k * cellW + cellW / 2;
          if (rows[g]) {
            ctx.fillStyle = P.ink;
            ctx.fillText(String(rows[g][k]), cx, ry + rowH / 2 + 4);
          } else {
            ctx.fillStyle = P.muted;
            ctx.fillText('?', cx, ry + rowH / 2 + 4);
          }
        }
      }
      ctx.fillStyle = f.finish[i] ? P.green : P.muted;
      ctx.font = '11px ' + kit.font;
      ctx.fillText(f.finish[i] ? '已完成' : '未完成', xF + finW / 2, ry + rowH / 2 + 4);
      ctx.strokeStyle = P.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, ry + rowH);
      ctx.lineTo(xEnd, ry + rowH);
      ctx.stroke();
    }
    ctx.strokeStyle = P.border;
    ctx.lineWidth = 1;
    [x0, xA, xA + cellW, xA + 2 * cellW, xM, xM + cellW, xM + 2 * cellW, xN, xN + cellW, xN + 2 * cellW, xF, xEnd].forEach((vx) => {
      ctx.beginPath();
      ctx.moveTo(vx, y0);
      ctx.lineTo(vx, tableBottom);
      ctx.stroke();
    });
    ctx.strokeRect(x0, y0, xEnd - x0, gHead + sHead + n * rowH);
    if (f.tent && f.req) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = P.sand;
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 1, rowsY + f.req.p * rowH + 1, xEnd - x0 - 2, rowH - 2);
      ctx.restore();
    }

    /* 安全序列 */
    const sy = tableBottom + 22;
    ctx.fillStyle = P.muted;
    ctx.font = '12px ' + kit.font;
    ctx.textAlign = 'left';
    ctx.fillText('安全序列：', 24, sy + 16);
    let sx = 100;
    f.seq.forEach((p) => {
      drawChip(ctx, sx, sy, 44, 24, P.wash, P.green, 'P' + p, P.green, 12);
      sx += 52;
    });
    if (!f.seq.length) {
      ctx.fillStyle = P.muted;
      ctx.fillText('（还没开始 / 还在搜索…）', 100, sy + 16);
    }
    if (f.chip) {
      const okk = f.chip.kind === 'ok';
      const cw = f.chip.label.length * 15 + 40;
      drawChip(ctx, xEnd - cw, sy + 30, cw, 32, okk ? P.wash : P.redWash, okk ? P.green : P.red, f.chip.label, okk ? P.green : P.red, 14);
    }
  }

  /* ---------- 渲染与重建 ---------- */
  function explainTail() {
    if (state.mode === 'graph') {
      return state.sGraph === 'cycle'
        ? '回顾：环形等待不需要很复杂——每个进程只要「手里拿一个、再去要下一个」，就能把系统绕进死路。四个必要条件里最容易下手的是「循环等待」：统一申请顺序即可打破它。'
        : '回顾：统一按编号顺序申请资源，等待关系永远单向递增，就不可能绕成环，也就不会有死锁。代价是有时要调整程序取用资源的顺序。';
    }
    const last = frames[frames.length - 1];
    if (last && last.chip && last.chip.kind === 'ok') {
      return '回顾：银行家算法的关键动作是「试算」——先假装借出去，用安全检查验证「还能不能找到一条让所有进程依次完成的路」。找得到才真借。代价是必须提前知道每个进程的最大需求 Max。';
    }
    if (last && last.chip && last.chip.kind === 'bad') {
      return '回顾：这笔申请表面上「资源够、没超支」，但试算后找不到任何安全序列——借出去迟早出事，于是被拒绝。银行家算法宁可现在少赚（拒绝），也要保证系统永远处于安全状态。';
    }
    return '回顾：安全检查从 Work = 可用量出发，反复放行「Need ≤ Work」的进程并回收资源；能放行全部进程（找到安全序列）就安全，否则不安全。';
  }

  function render(i) {
    const f = frames[i];
    if (!f) return;
    cv.bg(P.bg);
    if (f.kind === 'graph') drawGraph(cv.ctx, f); else drawBanker(cv.ctx, f);
    if (f.kind === 'graph') {
      const waitCount = f.waits.filter((w) => w >= 0).length;
      const holdCount = f.holds.reduce((s, a) => s + a.length, 0);
      b1.set('持有边 ' + holdCount + ' · 等待边 ' + waitCount);
      if (f.cycle) b2.set('检测到环路：死锁！');
      else if (f.done.every((d) => d)) b2.set('无环路：全部完成');
      else b2.set('暂未出现环路');
    } else {
      b1.set('Work = ' + vfmt(f.work));
      b2.set('安全序列 ' + f.seq.length + ' / ' + f.n);
    }
    kit.narrate({ index: i, total: frames.length, text: f.desc });
    if (i === frames.length - 1) kit.explain(explainTail());
    else kit.explain(EXPLAIN_BASE);
  }

  function rebuild() {
    if (state.mode === 'graph') {
      frames = graphFrames(state.procs, state.sGraph);
      setLegend([
        { color: P.ink, label: '持有（实线）' },
        { color: P.muted, label: '等待（虚线）' },
        { color: P.blue, label: '本步变化' },
        { color: P.red, label: '环路 = 死锁' },
        { color: P.green, label: '已完成' },
      ]);
    } else {
      frames = bankerFrames(state.procs, state.sBanker);
      setLegend([
        { color: P.sand, label: '正在检查的行' },
        { color: P.green, label: '已完成 / 安全' },
        { color: P.red, label: '不安全 / 被拒' },
        { color: P.blue, label: '请求' },
      ]);
    }
    pb.setTotal(frames.length);
    pb.reset();
  }

  syncControls();
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
