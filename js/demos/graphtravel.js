/* ============================================================================
 * graphtravel — 图世界漫游：BFS、DFS 与 Dijkstra 最短路径（DemoKit 帧序列模式）
 * 帧模型：frames[i] = { status, hlEdges, queue? / stack? / order?, dist?, fresh, desc }
 *   status[j]：'none' 未访问 | 'wait'/'tent' 排队或待定 | 'cur' 正在处理 | 'done' 已完成
 *   hlEdges：[[u, v, kind], ...]，kind ∈ 'check'（正在检查的边）| 'path'（最终路线）
 * 算法要点（硬性）：BFS 用队列（先进先出）；DFS 用栈（后进先出）；
 *   Dijkstra 每一轮都从「尚未确定」的节点里挑距离最小者盖章，再松弛它到邻居的边。
 * ==========================================================================*/
(function () {
  'use strict';

  const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  /* 画布坐标（画布 720×480，图区域约 y 40–300） */
  const POS = [
    [70, 180], [200, 85], [200, 270], [360, 65], [350, 175],
    [360, 275], [505, 110], [510, 260], [640, 130], [645, 250],
  ];
  /* 带权边：[节点1, 节点2, 权值] */
  const EDGES = [
    [0, 1, 4], [0, 2, 3], [1, 3, 5], [1, 4, 2], [2, 4, 6], [2, 5, 5],
    [3, 6, 3], [4, 6, 4], [4, 7, 7], [5, 7, 4], [6, 8, 2], [7, 8, 6],
    [7, 9, 5], [8, 9, 3],
  ];
  const ADJ = NAMES.map(function () { return []; });
  EDGES.forEach(function (e) {
    ADJ[e[0]].push({ v: e[1], w: e[2] });
    ADJ[e[1]].push({ v: e[0], w: e[2] });
  });
  ADJ.forEach(function (lst) { lst.sort(function (a, b) { return a.v - b.v; }); });

  const INF = Infinity;
  const nm = function (i) { return NAMES[i]; };
  const fmtD = function (d) { return d === INF ? '∞' : String(d); };

  /* ---------------- 帧生成：BFS（队列，先进先出） ---------------- */
  function bfsFrames(start, target) {
    const status = NAMES.map(function () { return 'none'; });
    const parent = NAMES.map(function () { return -1; });
    const hop = NAMES.map(function () { return INF; });
    const queue = [];
    const out = [];
    function snap(desc, hlEdges) {
      out.push({ status: status.slice(), queue: queue.slice(), dist: hop.slice(), hlEdges: hlEdges || [], fresh: [], desc: desc });
    }
    status[start] = 'wait';
    hop[start] = 0;
    queue.push(start);
    snap('准备就绪：把起点 ' + nm(start) + ' 放进队列。队列像排队买票，先进先出——排在最前面的先被处理。', []);
    while (queue.length) {
      const u = queue.shift();
      status[u] = 'cur';
      snap('从队首取出 ' + nm(u) + '，开始访问它。', []);
      ADJ[u].forEach(function (nb) {
        const v = nb.v;
        if (status[v] === 'none') {
          status[v] = 'wait';
          parent[v] = u;
          hop[v] = hop[u] + 1;
          queue.push(v);
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 还没访问过 → 记下「来路是 ' + nm(u) + '」，把它放进队尾排队。', [[u, v, 'check']]);
        } else {
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 已经访问过或已在队列里，跳过。', [[u, v, 'check']]);
        }
      });
      status[u] = 'done';
      snap(nm(u) + ' 的邻居都查完了，' + nm(u) + ' 访问完成（变成深色）。', []);
    }
    const path = [];
    let cur = target;
    while (cur !== -1) { path.push(cur); cur = parent[cur]; }
    path.reverse();
    if (path[0] === start) {
      const edges = [];
      for (let k = 0; k + 1 < path.length; k++) edges.push([path[k], path[k + 1], 'path']);
      snap('全部访问完毕！BFS 像水波一样一层层向外扩散，第一次碰到某个点走过的边数一定最少。绿色路线：' + path.map(nm).join(' → ') + '，共 ' + fmtD(hop[target]) + ' 步。注意：步数最少不一定是总路程最短——换成 Dijkstra 对比一下总权值。', edges);
    } else {
      snap('访问完毕，但终点不可达。', []);
    }
    return out;
  }

  /* ---------------- 帧生成：DFS（栈，后进先出） ---------------- */
  function dfsFrames(start) {
    const status = NAMES.map(function () { return 'none'; });
    const visitIdx = NAMES.map(function () { return 0; });
    let count = 0;
    const stack = [];
    const out = [];
    function snap(desc, hlEdges) {
      out.push({ status: status.slice(), stack: stack.slice(), visitIdx: visitIdx.slice(), hlEdges: hlEdges || [], fresh: [], desc: desc });
    }
    status[start] = 'wait';
    stack.push(start);
    snap('准备就绪：把起点 ' + nm(start) + ' 压入栈。栈像一摞盘子，后进先出——最后放上去的最先被拿走。', []);
    while (stack.length) {
      const u = stack.pop();
      status[u] = 'cur';
      count++;
      visitIdx[u] = count;
      snap('从栈顶取出 ' + nm(u) + '，开始访问它（它是第 ' + count + ' 个被访问的节点）。', []);
      ADJ[u].forEach(function (nb) {
        const v = nb.v;
        if (status[v] === 'none') {
          status[v] = 'wait';
          stack.push(v);
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 还没见过 → 压入栈，先在栈里等着。', [[u, v, 'check']]);
        } else if (status[v] === 'wait') {
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 已经在栈里等着了，不重复压栈。', [[u, v, 'check']]);
        } else {
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 已经访问完成，跳过。', [[u, v, 'check']]);
        }
      });
      status[u] = 'done';
      snap(nm(u) + ' 处理完毕（变成深色）——深度优先就是沿着一条路一直往深走，走不动了才回头。', []);
    }
    const order = NAMES.map(function (_, i) { return i; }).sort(function (a, b) { return visitIdx[a] - visitIdx[b]; });
    snap('全部访问完毕！访问顺序：' + order.map(nm).join(' → ') + '。每次都先处理「最后压入栈」的节点，所以是一条道走到黑再回头——这就是深度优先。', []);
    return out;
  }

  /* ---------------- 帧生成：Dijkstra（每步取未确定点中距离最小者） ---------------- */
  function dijkstraFrames(start, target) {
    const status = NAMES.map(function () { return 'none'; });
    const dist = NAMES.map(function () { return INF; });
    const parent = NAMES.map(function () { return -1; });
    const settled = [];
    const out = [];
    function snap(desc, hlEdges, fresh) {
      out.push({ status: status.slice(), order: settled.slice(), dist: dist.slice(), hlEdges: hlEdges || [], fresh: fresh || [], desc: desc });
    }
    dist[start] = 0;
    status[start] = 'tent';
    snap('初始化：起点 ' + nm(start) + ' 的距离记为 0（自己到自己不用走路），其他节点先全部记为 ∞——意思是「还不知道怎么走过去」。', []);
    for (let iter = 0; iter < NAMES.length; iter++) {
      let u = -1;
      let best = INF;
      for (let i = 0; i < NAMES.length; i++) {
        if (status[i] !== 'done' && dist[i] < best) { best = dist[i]; u = i; }
      }
      if (u === -1) {
        snap('剩下的节点距离全是 ∞，都到不了，算法结束。', []);
        break;
      }
      status[u] = 'cur';
      snap('在还没确定的节点里，挑距离最小的：' + nm(u) + '（当前距离 ' + fmtD(best) + '），把它「盖章确定」——它的最短距离今后不会再变。', []);
      ADJ[u].forEach(function (nb) {
        const v = nb.v;
        const w = nb.w;
        if (status[v] === 'done') {
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：' + nm(v) + ' 已经确定过了，不用再看。', [[u, v, 'check']]);
          return;
        }
        const nd = dist[u] + w;
        if (nd < dist[v]) {
          const old = dist[v];
          dist[v] = nd;
          parent[v] = u;
          status[v] = 'tent';
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：绕道 ' + nm(u) + ' 的总长 = ' + fmtD(dist[u]) + ' + ' + w + ' = ' + nd + '，比原来的 ' + fmtD(old) + ' 更短 → 更新 ' + nm(v) + ' 的距离为 ' + nd + '（这就是「松弛」这条边）。', [[u, v, 'check']], [v]);
        } else {
          snap('检查边 ' + nm(u) + '–' + nm(v) + '：绕道 ' + nm(u) + ' 的总长 = ' + fmtD(dist[u]) + ' + ' + w + ' = ' + nd + '，不比如今记录的值更短 → 保持不变。', [[u, v, 'check']]);
        }
      });
      status[u] = 'done';
      settled.push(u);
      snap(nm(u) + ' 确定完毕（盖章）。为什么敢确定？因为所有还没确定的点距离都不小于它，绕别的路只会更长。', []);
    }
    const path = [];
    if (dist[target] < INF) {
      let cur = target;
      while (cur !== -1) { path.push(cur); cur = parent[cur]; }
      path.reverse();
    }
    if (path.length && path[0] === start) {
      const edges = [];
      for (let k = 0; k + 1 < path.length; k++) edges.push([path[k], path[k + 1], 'path']);
      snap('最短路揭晓：' + path.map(nm).join(' → ') + '，总长 ' + fmtD(dist[target]) + '。注意和 BFS 的区别：BFS 数的是「几条边」，这里算的是「总权值」。', edges);
    } else {
      snap('终点不可达，没有路线可以展示。', []);
    }
    return out;
  }

  /* 测试接缝：浏览器中 module 不存在，此段自动跳过 */
  const GT = { names: NAMES, edges: EDGES, adj: ADJ, bfsFrames: bfsFrames, dfsFrames: dfsFrames, dijkstraFrames: dijkstraFrames };
  if (typeof module !== 'undefined' && module.exports) { module.exports = GT; }

  /* ============================ 演示界面 ============================ */
  DemoKit.register('graphtravel', function (root, kit) {
    const P = kit.palette;
    const W = 720;
    const H = 480;
    const R = 19;
    const MODE_NAME = { bfs: '广度优先搜索（BFS）', dfs: '深度优先搜索（DFS）', dijkstra: '最短路径（Dijkstra）' };
    const INTRO = '图 = 一堆「点」加上连接它们的「边」，边上的数字是走过的代价。三种玩法：BFS 用队列一层层向外扩散，找的是「步数最少」；DFS 用栈一条道走到黑；Dijkstra 每次都从还没确定的点里挑距离最小的盖章，算出真正的「总权值最短」。切换算法或起点，然后播放观察。';
    const state = { mode: 'bfs', start: 0, target: 9 };
    let frames = [];
    let pb = null;

    const cv = kit.canvas(W, H);
    cv.canvas.setAttribute('aria-label', '图世界漫游演示：10 个带权节点的示例地图，展示 BFS 队列扩散、DFS 栈深入与 Dijkstra 距离表逐步确定最短路径的全过程');

    kit.controlRow();
    kit.select({
      label: '算法',
      options: [
        { value: 'bfs', label: '广度优先 BFS' },
        { value: 'dfs', label: '深度优先 DFS' },
        { value: 'dijkstra', label: '最短路 Dijkstra' },
      ],
      value: state.mode,
    }, function (v) { state.mode = v; rebuild(); });
    kit.select({
      label: '起点',
      options: NAMES.map(function (s, i) { return { value: String(i), label: s }; }),
      value: '0',
    }, function (v) { state.start = Number(v); rebuild(); });
    kit.select({
      label: '终点',
      options: NAMES.map(function (s, i) { return { value: String(i), label: s }; }),
      value: '9',
    }, function (v) { state.target = Number(v); rebuild(); });
    const badge = kit.badge('已访问 0 / 10');

    pb = kit.playback({ total: 1, onChange: render });
    kit.legend([
      { color: P.muted, label: '未访问' },
      { color: P.sand, label: '排队 / 待定' },
      { color: P.blue, label: '正在处理' },
      { color: P.accent, label: '已访问完成' },
      { color: P.red, label: '正在检查的边' },
      { color: P.green, label: '最终最短路线' },
    ]);
    kit.explain(INTRO);

    /* ---------- 绘制小工具 ---------- */
    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawChip(ctx, x, y, text, style) {
      ctx.font = '12px ' + kit.font;
      const tw = ctx.measureText(text).width;
      const w = Math.max(30, Math.ceil(tw) + 18);
      const h = 24;
      roundRect(ctx, x, y, w, h, 8);
      if (style === 'cur') { ctx.fillStyle = P.blue; ctx.fill(); }
      else if (style === 'done') { ctx.fillStyle = P.accent; ctx.fill(); }
      else if (style === 'fresh') { ctx.fillStyle = P.redWash; ctx.fill(); }
      else { ctx.fillStyle = P.surface; ctx.fill(); }
      ctx.strokeStyle = style === 'cur' ? P.blue
        : style === 'done' ? P.accentDeep
          : style === 'fresh' ? P.red
            : P.border;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = style === 'cur' || style === 'done' ? P.surface : style === 'fresh' ? P.red : P.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
      return w;
    }

    function drawCell(ctx, x, y, name, val, st, fresh) {
      const w = 130;
      const h = 36;
      roundRect(ctx, x, y, w, h, 8);
      ctx.fillStyle = fresh ? P.redWash : st === 'done' ? P.wash : P.surface;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = fresh ? P.red : st === 'done' ? P.accent : st === 'cur' ? P.blue : P.border;
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = 'bold 13px ' + kit.font;
      ctx.fillStyle = P.ink;
      ctx.fillText(name, x + 14, y + h / 2);
      ctx.textAlign = 'right';
      ctx.font = '13px ' + kit.font;
      ctx.fillStyle = fresh ? P.red : st === 'cur' ? P.blue : st === 'done' ? P.accentDeep : P.muted;
      ctx.fillText(val, x + w - 14, y + h / 2);
      ctx.textBaseline = 'alphabetic';
    }

    function drawList(ctx, x, y, label, arr, style) {
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(label, x, y + 16);
      let cx = x + ctx.measureText(label).width + 12;
      if (!arr.length) {
        ctx.fillStyle = P.border;
        ctx.font = '12px ' + kit.font;
        ctx.fillText('（空）', cx, y + 17);
        return;
      }
      arr.forEach(function (ni) {
        cx += drawChip(ctx, cx, y, nm(ni), style) + 6;
      });
    }

    /* ---------- 逐帧渲染 ---------- */
    function render(i) {
      const f = frames[i];
      if (!f) return;
      const ctx = cv.ctx;
      cv.bg(P.bg);

      /* 标题 */
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 13px ' + kit.font;
      ctx.fillStyle = P.ink;
      let title = MODE_NAME[state.mode] + ' ｜ 起点 ' + nm(state.start);
      if (state.mode !== 'dfs') title += ' ｜ 终点 ' + nm(state.target);
      ctx.fillText(title, 16, 22);
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'right';
      ctx.fillText('图：10 个节点 · 14 条带权边', W - 16, 22);

      /* 边（底色） */
      ctx.lineCap = 'round';
      EDGES.forEach(function (e) {
        const a = POS[e[0]];
        const b = POS[e[1]];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        ctx.strokeStyle = P.muted;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(a[0] + ux * (R + 2), a[1] + uy * (R + 2));
        ctx.lineTo(b[0] - ux * (R + 2), b[1] - uy * (R + 2));
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      /* 被检查 / 最终路线的边 */
      f.hlEdges.forEach(function (he) {
        const a = POS[he[0]];
        const b = POS[he[1]];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        ctx.strokeStyle = he[2] === 'path' ? P.green : P.red;
        ctx.lineWidth = he[2] === 'path' ? 5 : 3.5;
        ctx.beginPath();
        ctx.moveTo(a[0] + ux * (R + 2), a[1] + uy * (R + 2));
        ctx.lineTo(b[0] - ux * (R + 2), b[1] - uy * (R + 2));
        ctx.stroke();
      });

      /* 边的权值（带底色缺口，保证可读） */
      EDGES.forEach(function (e) {
        const a = POS[e[0]];
        const b = POS[e[1]];
        const mx = (a[0] + b[0]) / 2;
        const my = (a[1] + b[1]) / 2;
        ctx.fillStyle = P.bg;
        ctx.fillRect(mx - 10, my - 7, 20, 14);
        ctx.fillStyle = P.muted;
        ctx.font = '10px ' + kit.font;
        ctx.textAlign = 'center';
        ctx.fillText(String(e[2]), mx, my + 3.5);
      });

      /* 节点 */
      const pathSet = {};
      f.hlEdges.forEach(function (he) { if (he[2] === 'path') { pathSet[he[0]] = 1; pathSet[he[1]] = 1; } });
      NAMES.forEach(function (s, idx) {
        const x = POS[idx][0];
        const y = POS[idx][1];
        const st = f.status[idx];
        if (st === 'cur') { ctx.fillStyle = P.blue; ctx.strokeStyle = P.blue; }
        else if (st === 'done') { ctx.fillStyle = P.accent; ctx.strokeStyle = P.accentDeep; }
        else if (st === 'wait' || st === 'tent') { ctx.fillStyle = P.sand; ctx.strokeStyle = P.sandInk; }
        else { ctx.fillStyle = P.surface; ctx.strokeStyle = P.muted; }
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = st === 'none' ? 1.6 : 2;
        ctx.stroke();
        if (pathSet[idx]) {
          ctx.beginPath();
          ctx.arc(x, y, R + 4.5, 0, Math.PI * 2);
          ctx.strokeStyle = P.green;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.fillStyle = st === 'cur' || st === 'done' ? P.surface : P.ink;
        ctx.font = 'bold 14px ' + kit.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s, x, y + 1);
        ctx.textBaseline = 'alphabetic';
      });

      /* 结构区一：队列 / 栈 / 已确定顺序 */
      if (f.queue) {
        drawList(ctx, 16, 316, '队列（队首 → 队尾）', f.queue, 'plain');
      } else if (f.stack) {
        drawList(ctx, 16, 316, '栈（栈底 → 栈顶）', f.stack, 'plain');
      } else if (f.order) {
        drawList(ctx, 16, 316, '已确定（盖章顺序）', f.order, 'done');
      }

      /* 结构区二：步数表 / 访问序号表 / 距离表 */
      const label2 = state.mode === 'bfs' ? '步数表（从起点最少走几条边）'
        : state.mode === 'dfs' ? '访问序号（第几个被访问）'
          : '距离表（目前的最短距离，红 = 刚刚更新）';
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'left';
      ctx.fillText(label2, 16, 372);

      const cw = 130;
      const chh = 36;
      const gx = 8;
      const sx = (W - (cw * 5 + gx * 4)) / 2;
      for (let k = 0; k < NAMES.length; k++) {
        const row = k < 5 ? 0 : 1;
        const col = k % 5;
        const cx2 = sx + col * (cw + gx);
        const cy2 = 380 + row * (chh + 10);
        let val;
        if (state.mode === 'dfs') val = f.visitIdx && f.visitIdx[k] ? '#' + f.visitIdx[k] : '·';
        else val = fmtD(f.dist[k]);
        const fresh = f.fresh && f.fresh.indexOf(k) >= 0;
        drawCell(ctx, cx2, cy2, NAMES[k], val, f.status[k], fresh);
      }

      /* 计数 / 旁白 / 总结 */
      let doneCount = 0;
      f.status.forEach(function (st) { if (st === 'done') doneCount++; });
      badge.set((state.mode === 'dijkstra' ? '已确定 ' : '已访问 ') + doneCount + ' / ' + NAMES.length);
      kit.narrate({ index: i, total: frames.length, text: f.desc });
      if (i === 0) kit.explain(INTRO);
      if (i === frames.length - 1) {
        const summary = state.mode === 'bfs'
          ? 'BFS（广度优先）：用队列一层层扩散，第一次到达某点时步数最少；它回答「最少走几步」，不保证总权值最小。'
          : state.mode === 'dfs'
            ? 'DFS（深度优先）：用栈一条道走到黑，走不动了才回头；它擅长遍历整个图和搜索路径，不负责最短路线。'
            : 'Dijkstra：每轮都从「尚未确定」的点里挑距离最小的盖章，再松弛它到邻居的边；盖章时它的距离就已经是最终答案。';
        kit.explain(INTRO + ' ' + summary);
      }
    }

    /* ---------- 重建帧序列 ---------- */
    function rebuild() {
      if (state.mode === 'bfs') frames = bfsFrames(state.start, state.target);
      else if (state.mode === 'dfs') frames = dfsFrames(state.start);
      else frames = dijkstraFrames(state.start, state.target);
      pb.setTotal(frames.length);
      pb.reset();
    }

    rebuild();
    return { destroy() { /* 无异步资源需要清理 */ } };
  });
})();
