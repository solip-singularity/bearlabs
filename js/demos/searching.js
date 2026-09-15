/* ============================================================================
 * searching — 查找之旅：二分查找与二叉搜索树（DemoKit 帧序列模式）
 * 子模式一 binary：有序数组上高亮搜索区间、mid 比较、区间收缩；找到 / 失败各有终态。
 * 子模式二 bst：二叉搜索树查找路径逐节点高亮；比它大往右、比它小往左。
 * 可调参数：子模式、数据量（8–16）、目标值（可设为不在数组中的值）。
 * ==========================================================================*/
DemoKit.register('searching', function (root, kit) {
  const P = kit.palette;
  const state = { mode: 'binary', size: 12, target: 50, arr: [] };
  let frames = [];
  let pb = null;
  let targetRange = null;
  let tree = null;

  const cv = kit.canvas(720, 360);
  cv.canvas.setAttribute('aria-label', '查找演示画布：二分查找模式显示有序数组、当前搜索区间与正中间的比较位置；二叉搜索树模式显示各个节点与从根出发的查找路径。');

  function roundRect(x, y, w, h, r) {
    cv.ctx.beginPath();
    cv.ctx.moveTo(x + r, y);
    cv.ctx.arcTo(x + w, y, x + w, y + h, r);
    cv.ctx.arcTo(x + w, y + h, x, y + h, r);
    cv.ctx.arcTo(x, y + h, x, y, r);
    cv.ctx.arcTo(x, y, x + w, y, r);
    cv.ctx.closePath();
  }

  /* ---------- 控件 ---------- */
  kit.controlRow();
  kit.select({
    label: '子模式',
    options: [
      { value: 'binary', label: '二分查找（有序数组）' },
      { value: 'bst', label: '二叉搜索树' },
    ],
    value: state.mode,
  }, (v) => { state.mode = v; rebuild(); });
  kit.range({
    label: '数据量',
    min: 8, max: 16,
    value: state.size,
    format: (v) => v + ' 个',
  }, (v) => { state.size = v; randArr(); state.target = state.arr[state.size >> 1]; syncTarget(); rebuild(); });
  kit.btn('换一组数据', () => { randArr(); state.target = state.arr[state.size >> 1]; syncTarget(); rebuild(); });
  kit.btn('试一个找不到的目标', () => { state.target = missingTarget(); syncTarget(); rebuild(); });

  pb = kit.playback({ total: 1, onChange: render, baseInterval: 950 });

  kit.controlRow();
  targetRange = kit.range({
    label: '目标值',
    min: 1, max: 110,
    value: state.target,
    format: (v) => '找 ' + v,
  }, (v) => { state.target = v; rebuild(); });
  const infoBadge = kit.badge('');

  kit.legend([
    { color: P.accent, label: '候选区 / 已走过的路径' },
    { color: P.sand, label: '当前比较位置' },
    { color: P.red, label: '刚砍掉的一半 / 空指针' },
    { color: P.green, label: '找到目标' },
    { color: P.border, label: '已排除' },
  ]);

  /* ---------- 数据与树 ---------- */
  function randArr() {
    const a = [];
    while (a.length < state.size) {
      const v = 10 + Math.floor(Math.random() * 90);
      if (a.indexOf(v) < 0) a.push(v);
    }
    a.sort((x, y) => x - y);
    state.arr = a;
  }
  function missingTarget() {
    return Math.random() < 0.5 ? state.arr[0] - 1 : state.arr[state.arr.length - 1] + 1;
  }
  function syncTarget() { if (targetRange) targetRange.set(state.target); }

  function buildTree() {
    const arr = state.arr;
    const n = arr.length;
    const nodes = [];
    function build(lo, hi, depth) {
      if (lo > hi) return -1;
      const mid = (lo + hi) >> 1;
      const id = nodes.length;
      nodes.push({ id: id, v: arr[mid], l: -1, r: -1, depth: depth, pos: mid });
      const l = build(lo, mid - 1, depth + 1);
      const r = build(mid + 1, hi, depth + 1);
      nodes[id].l = l;
      nodes[id].r = r;
      return id;
    }
    const rootId = build(0, n - 1, 0);
    let maxDepth = 0;
    nodes.forEach((nd) => { if (nd.depth > maxDepth) maxDepth = nd.depth; });
    const padX = 26;
    const top = 86;
    const bottom = cv.height - 44;
    const levelH = maxDepth > 0 ? (bottom - top) / maxDepth : 0;
    const colW = (cv.width - padX * 2) / n;
    nodes.forEach((nd) => {
      nd.x = padX + (nd.pos + 0.5) * colW;
      nd.y = top + nd.depth * levelH;
    });
    return { nodes: nodes, root: rootId, maxDepth: maxDepth, colW: colW, levelH: levelH, radius: n <= 12 ? 16 : 13 };
  }

  /* ---------- 帧序列：二分查找 ---------- */
  function buildBinaryFrames() {
    const arr = state.arr;
    const t = state.target;
    const n = arr.length;
    const out = [];
    const dead = new Array(n).fill(false);
    let lo = 0, hi = n - 1, comps = 0;

    out.push({
      kind: 'init', lo: lo, hi: hi, mid: -1, dead: dead.slice(), elim: null, comps: 0,
      desc: '要在 ' + n + ' 个排好序的数字里找到 ' + t + '。二分查找先看整个区间，每次都挑「正中间」的数字和目标比一比，比完就能排除一半。',
    });
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      comps++;
      out.push({
        kind: 'cmp', lo: lo, hi: hi, mid: mid, dead: dead.slice(), elim: null, comps: comps,
        desc: '第 ' + comps + ' 次比较：当前候选是第 ' + (lo + 1) + ' 到第 ' + (hi + 1) + ' 个（共 ' + (hi - lo + 1) + ' 个）。取正中间的第 ' + (mid + 1) + ' 个：数字是 ' + arr[mid] + '，和目标 ' + t + ' 比一比。',
      });
      if (arr[mid] === t) {
        out.push({
          kind: 'found', lo: lo, hi: hi, mid: mid, dead: dead.slice(), elim: null, comps: comps,
          desc: '正好相等！' + t + ' 就在第 ' + (mid + 1) + ' 个位置——找到了。全程只比了 ' + comps + ' 次；要是从左往右一个个找，最坏要比 ' + n + ' 次。',
        });
        return out;
      }
      let elim = null;
      let side = '';
      if (arr[mid] < t) {
        elim = [lo, mid];
        for (let i = lo; i <= mid; i++) dead[i] = true;
        lo = mid + 1;
        side = '左';
      } else {
        elim = [mid, hi];
        for (let i = mid; i <= hi; i++) dead[i] = true;
        hi = mid - 1;
        side = '右';
      }
      const rest = hi - lo + 1;
      out.push({
        kind: 'shrink', lo: lo, hi: hi, mid: -1, dead: dead.slice(), elim: elim, comps: comps,
        desc: arr[mid] + (side === '左'
          ? ' 比目标小：它和它左边的数字都太小了，目标只可能在右半边——砍掉左半边。'
          : ' 比目标大：它和它右边的数字都太大了，目标只可能在左半边——砍掉右半边。')
          + (rest > 0
            ? '新区间是第 ' + (lo + 1) + ' 到第 ' + (hi + 1) + ' 个，只剩 ' + rest + ' 个候选。'
            : '这一下砍完，候选区间空了——马上就能确认结果。'),
      });
    }
    out.push({
      kind: 'fail', lo: lo, hi: hi, mid: -1, dead: dead.slice(), elim: null, comps: comps,
      desc: '左边界越过了右边界，搜索区间为空：' + t + ' 不在这个数组里，查找失败。虽然没找到，但也只用了 ' + comps + ' 次比较——二分查找连「确认找不到」都很快。',
    });
    return out;
  }

  /* ---------- 帧序列：二叉搜索树 ---------- */
  function buildBstFrames() {
    const t = state.target;
    const out = [];
    const path = [];
    let cur = tree.root;
    let comps = 0;
    out.push({
      kind: 'init', cur: cur, path: [], comps: 0, dir: null, next: -1,
      desc: '要在二叉搜索树里找 ' + t + '。规则一句话：比当前节点小就往左走，比它大就往右走。从树根 ' + tree.nodes[cur].v + ' 开始。',
    });
    while (cur !== -1) {
      comps++;
      const nd = tree.nodes[cur];
      if (nd.v === t) {
        out.push({
          kind: 'found', cur: cur, path: path.concat([cur]), comps: comps, dir: null, next: -1,
          desc: '节点 ' + nd.v + ' 正好就是 ' + t + '，相等——找到了！从根走到这里一共路过 ' + comps + ' 个节点。每往下一层，可能的范围就砍掉一半，所以树越「矮胖」，找得越快。',
        });
        return out;
      }
      const dir = t < nd.v ? 'left' : 'right';
      const nid = dir === 'left' ? nd.l : nd.r;
      if (nid === -1) {
        out.push({
          kind: 'miss', cur: cur, path: path.concat([cur]), comps: comps, dir: dir, next: -1,
          desc: '在节点 ' + nd.v + ' 处：' + t + (dir === 'left'
            ? ' 比它小，本该往左走——可是左边已经没有节点了。'
            : ' 比它大，本该往右走——可是右边已经没有节点了。')
            + '路走到尽头也没碰到 ' + t + '，它不在树里，查找结束。',
        });
        return out;
      }
      const nxt = tree.nodes[nid];
      out.push({
        kind: 'visit', cur: cur, path: path.concat([cur]), comps: comps, dir: dir, next: nid,
        desc: '节点 ' + nd.v + '：目标 ' + t + (dir === 'left' ? ' 比它小 → 往左走进 ' : ' 比它大 → 往右走进 ') + nxt.v + '。记住口诀：比它大往右、比它小往左。',
      });
      path.push(cur);
      cur = nid;
    }
    return out;
  }

  /* ---------- 重建 ---------- */
  function rebuild() {
    if (state.mode === 'binary') {
      tree = null;
      frames = buildBinaryFrames();
      kit.explain('二分查找的前提是数组已经「排好序」。每次和正中间的数字比较一次，就能确定目标在左半还是右半，一口气排除一半候选——所以 1000 个数字最多比 10 次左右（2 的 10 次方是 1024）。把「目标值」拖到一个不在数组里的数字，还能看到它如何确认「找不到」。');
    } else {
      tree = buildTree();
      frames = buildBstFrames();
      kit.explain('二叉搜索树把「砍一半」的规则挂到了树上：每个节点的左边都比它小、右边都比它大。查找就像走迷宫：每一步和当前节点比一次、只往一个方向走，走过的节点连成一条「查找路径」——路径越短，查得越快。');
    }
    frames.forEach((f) => { f.view = state.mode; });
    pb.setTotal(frames.length);
    pb.reset();
  }

  /* ---------- 渲染 ---------- */
  function render(i) {
    const f = frames[i];
    if (!f) return;
    cv.bg(P.bg);
    if (f.view === 'binary') renderBinary(f); else renderBst(f);
    kit.narrate({ index: i, total: frames.length, text: f.desc });
    if (f.view === 'binary') {
      infoBadge.set('候选 ' + Math.max(0, f.hi - f.lo + 1) + ' 个');
    } else {
      infoBadge.set('路径 ' + f.path.length + ' 个节点');
    }
  }

  function renderBinary(f) {
    const W = cv.width, H = cv.height;
    const arr = state.arr;
    const n = arr.length;
    const t = state.target;
    const padL = 14, padR = 14;
    const base = H - 40;
    const top = 88;
    const bw = (W - padL - padR) / n;
    const maxV = Math.max.apply(null, arr);

    function barPath(x, w, h) {
      const y = base - h;
      const r = Math.min(4, w / 2);
      cv.ctx.beginPath();
      cv.ctx.moveTo(x, base);
      cv.ctx.lineTo(x, y + r);
      cv.ctx.quadraticCurveTo(x, y, x + r, y);
      cv.ctx.lineTo(x + w - r, y);
      cv.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      cv.ctx.lineTo(x + w, base);
      cv.ctx.closePath();
    }
    function hOf(v) { return Math.max(10, Math.round((v / maxV) * (base - top - 36))); }

    /* 柱体 */
    for (let i = 0; i < n; i++) {
      const h = hOf(arr[i]);
      const x = padL + i * bw + 3;
      const w = Math.max(4, bw - 6);
      let fill = P.accent, alpha = 0.42;
      if (f.dead[i]) { fill = P.border; alpha = 1; }
      if (f.elim && i >= f.elim[0] && i <= f.elim[1]) { fill = P.red; alpha = 0.55; }
      if (i === f.mid) { fill = P.sand; alpha = 1; }
      if (f.kind === 'found' && i === f.mid) { fill = P.green; alpha = 1; }
      cv.ctx.save();
      cv.ctx.globalAlpha = alpha;
      cv.ctx.fillStyle = fill;
      barPath(x, w, h);
      cv.ctx.fill();
      cv.ctx.restore();
    }

    /* 数值与序号 */
    cv.ctx.font = '11px ' + kit.font;
    cv.ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const h = hOf(arr[i]);
      const xc = padL + (i + 0.5) * bw;
      cv.ctx.save();
      if (i === f.mid && f.kind === 'found') cv.ctx.fillStyle = P.green;
      else if (i === f.mid) cv.ctx.fillStyle = P.sandInk;
      else if (f.dead[i]) { cv.ctx.fillStyle = P.muted; cv.ctx.globalAlpha = 0.55; }
      else cv.ctx.fillStyle = P.ink;
      cv.ctx.fillText(String(arr[i]), xc, base - h - 6);
      cv.ctx.restore();
      cv.ctx.save();
      cv.ctx.font = '10px ' + kit.font;
      cv.ctx.fillStyle = i === f.mid ? P.sandInk : P.muted;
      cv.ctx.fillText(String(i + 1), xc, base + 15);
      cv.ctx.restore();
    }

    /* 搜索区间标注 */
    const by = 54;
    if (f.lo <= f.hi) {
      const x1c = padL + (f.lo + 0.5) * bw;
      const x2c = padL + (f.hi + 0.5) * bw;
      cv.ctx.strokeStyle = P.accentDeep;
      cv.ctx.lineWidth = 2;
      cv.ctx.beginPath();
      cv.ctx.moveTo(x1c, by - 6);
      cv.ctx.lineTo(x1c, by);
      cv.ctx.lineTo(x2c, by);
      cv.ctx.lineTo(x2c, by - 6);
      cv.ctx.stroke();
      const rest = f.hi - f.lo + 1;
      const rangeLabel = '搜索区间：第 ' + (f.lo + 1) + ' 到第 ' + (f.hi + 1) + ' 个 · 候选 ' + rest + ' 个';
      cv.ctx.fillStyle = P.accentDeep;
      cv.ctx.font = '11px ' + kit.font;
      cv.ctx.textAlign = 'center';
      const half = cv.ctx.measureText(rangeLabel).width / 2;
      const cx = Math.max(half + 6, Math.min(W - half - 6, (x1c + x2c) / 2));
      cv.ctx.fillText(rangeLabel, cx, by - 10);
    } else {
      cv.ctx.fillStyle = P.red;
      cv.ctx.font = '12px ' + kit.font;
      cv.ctx.textAlign = 'center';
      cv.ctx.fillText('搜索区间为空 → 没有找到', W / 2, by - 4);
    }

    /* mid 标记 */
    if (f.mid >= 0) {
      const xc = padL + (f.mid + 0.5) * bw;
      const barTop = base - hOf(arr[f.mid]);
      cv.ctx.save();
      cv.ctx.strokeStyle = P.sand;
      cv.ctx.lineWidth = 1.5;
      if (cv.ctx.setLineDash) cv.ctx.setLineDash([4, 4]);
      cv.ctx.beginPath();
      cv.ctx.moveTo(xc, by + 8);
      cv.ctx.lineTo(xc, barTop - 6);
      cv.ctx.stroke();
      cv.ctx.restore();
      cv.ctx.save();
      const label = 'mid';
      cv.ctx.font = '10px ' + kit.font;
      const tw = cv.ctx.measureText(label).width + 14;
      const cy = by + 14;
      cv.ctx.fillStyle = P.sand;
      roundRect(xc - tw / 2, cy, tw, 15, 7);
      cv.ctx.fill();
      cv.ctx.fillStyle = P.ink;
      cv.ctx.textAlign = 'center';
      cv.ctx.fillText(label, xc, cy + 11);
      cv.ctx.restore();
    }

    /* 顶部信息 */
    cv.ctx.textAlign = 'left';
    cv.ctx.fillStyle = P.ink;
    cv.ctx.font = '13px ' + kit.font;
    const preBin = '二分查找（有序数组） · 目标 = ';
    cv.ctx.fillText(preBin, 14, 24);
    const preBinW = cv.ctx.measureText(preBin).width;
    cv.ctx.fillStyle = P.sandInk;
    cv.ctx.font = 'bold 13px ' + kit.font;
    cv.ctx.fillText(String(t), 14 + preBinW, 24);
    cv.ctx.textAlign = 'right';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.fillText('已比较 ' + f.comps + ' 次', W - 14, 24);
  }

  function renderBst(f) {
    const W = cv.width, H = cv.height;
    const t = state.target;
    const nodes = tree.nodes;
    const pathSet = {};
    f.path.forEach((id) => { pathSet[id] = true; });

    function edgeLine(a, b, color, width) {
      cv.ctx.strokeStyle = color;
      cv.ctx.lineWidth = width;
      cv.ctx.beginPath();
      cv.ctx.moveTo(a.x, a.y);
      cv.ctx.lineTo(b.x, b.y);
      cv.ctx.stroke();
    }

    /* 边 */
    nodes.forEach((nd) => {
      if (nd.l >= 0) {
        const c = nodes[nd.l];
        const on = pathSet[nd.id] && pathSet[c.id];
        edgeLine(nd, c, on ? P.accent : P.border, on ? 2.5 : 1.5);
      }
      if (nd.r >= 0) {
        const c = nodes[nd.r];
        const on = pathSet[nd.id] && pathSet[c.id];
        edgeLine(nd, c, on ? P.accent : P.border, on ? 2.5 : 1.5);
      }
    });

    /* 下一步方向的边（visit 帧） */
    if (f.kind === 'visit' && f.next >= 0) {
      edgeLine(nodes[f.cur], nodes[f.next], P.blue, 3);
    }

    /* miss 帧：空指针示意 */
    if (f.kind === 'miss') {
      const cur = nodes[f.cur];
      let gx = f.dir === 'left' ? cur.x - 46 : cur.x + 46;
      let gy = cur.y + 44;
      gx = Math.max(22, Math.min(W - 22, gx));
      gy = Math.min(H - 18, gy);
      const dx = gx - cur.x, dy = gy - cur.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const sx = cur.x + (dx / len) * (tree.radius + 3);
      const sy = cur.y + (dy / len) * (tree.radius + 3);
      cv.ctx.save();
      cv.ctx.strokeStyle = P.red;
      cv.ctx.lineWidth = 1.5;
      if (cv.ctx.setLineDash) cv.ctx.setLineDash([5, 4]);
      cv.ctx.beginPath();
      cv.ctx.moveTo(sx, sy);
      cv.ctx.lineTo(gx, gy);
      cv.ctx.stroke();
      cv.ctx.beginPath();
      cv.ctx.arc(gx, gy, 11, 0, Math.PI * 2);
      cv.ctx.stroke();
      if (cv.ctx.setLineDash) cv.ctx.setLineDash([]);
      cv.ctx.font = '10px ' + kit.font;
      cv.ctx.fillStyle = P.red;
      cv.ctx.textAlign = 'center';
      cv.ctx.fillText('空', gx, gy + 4);
      cv.ctx.restore();
    }

    /* 节点 */
    cv.ctx.font = 'bold 13px ' + kit.font;
    if (tree.radius < 15) cv.ctx.font = 'bold 12px ' + kit.font;
    nodes.forEach((nd) => {
      const isCur = nd.id === f.cur;
      const inPath = pathSet[nd.id] && !isCur;
      let fill = P.surface, stroke = P.border, text = P.muted;
      if (inPath) { fill = P.accent; stroke = P.accentDeep; text = P.surface; }
      if (isCur) { fill = P.sand; stroke = P.sandInk; text = P.ink; }
      if (isCur && f.kind === 'found') { fill = P.green; stroke = P.green; text = P.surface; }
      cv.ctx.save();
      cv.ctx.fillStyle = fill;
      cv.ctx.strokeStyle = stroke;
      cv.ctx.lineWidth = 1.5;
      cv.ctx.beginPath();
      cv.ctx.arc(nd.x, nd.y, tree.radius, 0, Math.PI * 2);
      cv.ctx.fill();
      cv.ctx.stroke();
      cv.ctx.fillStyle = text;
      cv.ctx.textAlign = 'center';
      cv.ctx.textBaseline = 'middle';
      cv.ctx.fillText(String(nd.v), nd.x, nd.y + 1);
      cv.ctx.restore();
    });

    /* 下一步节点蓝圈（visit 帧） */
    if (f.kind === 'visit' && f.next >= 0) {
      const nx = nodes[f.next];
      cv.ctx.save();
      cv.ctx.strokeStyle = P.blue;
      cv.ctx.lineWidth = 2;
      cv.ctx.beginPath();
      cv.ctx.arc(nx.x, nx.y, tree.radius + 4, 0, Math.PI * 2);
      cv.ctx.stroke();
      cv.ctx.restore();
    }

    /* 顶部与底部信息 */
    cv.ctx.textAlign = 'left';
    cv.ctx.fillStyle = P.ink;
    cv.ctx.font = '13px ' + kit.font;
    const preBst = '二叉搜索树 · 目标 = ';
    cv.ctx.fillText(preBst, 14, 24);
    const preBstW = cv.ctx.measureText(preBst).width;
    cv.ctx.fillStyle = P.sandInk;
    cv.ctx.font = 'bold 13px ' + kit.font;
    cv.ctx.fillText(String(t), 14 + preBstW, 24);
    cv.ctx.textAlign = 'right';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.fillText('已比较 ' + f.comps + ' 次', W - 14, 24);
    cv.ctx.textAlign = 'center';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '11px ' + kit.font;
    cv.ctx.fillText('口诀：比它大往右，比它小往左', W / 2, H - 12);
  }

  /* ---------- 初始化 ---------- */
  randArr();
  state.target = state.arr[state.size >> 1];
  syncTarget();
  rebuild();

  return { destroy() { /* 无异步资源需要清理 */ } };
});
