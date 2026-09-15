/* ============================================================================
 * fsm — 自动机实验室：输入 0/1 字符串，逐字符看有限自动机状态转移与判定
 * 帧模型：frames[i] = { state, readIdx, hl, verdict, desc }
 *   state   当前所在状态；readIdx 正在读的字符下标（-1 未开读，n 表示读毕）
 *   hl      刚走过的转移 { from, to, ch }；verdict 'accept' | 'reject' | null
 * 硬性：转移函数与自动机定义严格一致（自验见报告）；输入只允许 0 与 1。
 * ==========================================================================*/
(function () {
  'use strict';

  /* 三台经典自动机（states 里给出状态图绘制坐标） */
  const AUTOMATA = [
    {
      id: 'c101',
      name: '「含 101」检测机',
      goal: '识别「含有连续片段 101」的 0/1 串',
      explain: '这台机器一边读串一边记住「任务做到哪一步」：q0 = 还没看到有用的开头；q1 = 刚读到「1」；q2 = 刚读到「10」（离成功只差一个 1）；q3 = 已经完整看到「101」，任务完成，从此待在 q3 不动。',
      states: [
        { id: 'q0', x: 95, y: 250 },
        { id: 'q1', x: 295, y: 250 },
        { id: 'q2', x: 480, y: 250 },
        { id: 'q3', x: 645, y: 250 },
      ],
      start: 'q0',
      accept: ['q3'],
      trans: {
        q0: { '0': 'q0', '1': 'q1' },
        q1: { '0': 'q2', '1': 'q1' },
        q2: { '0': 'q0', '1': 'q3' },
        q3: { '0': 'q3', '1': 'q3' },
      },
      curves: { 'q2>q0': 120 },
    },
    {
      id: 'even1',
      name: '「1 的个数为偶数」检测机',
      goal: '识别「字符 1 出现的次数是偶数」的 0/1 串（出现 0 次也算偶数）',
      explain: '这台机器只记一件事：到目前为止，1 的个数是偶数还是奇数。q0 = 偶数（恰是接受状态）；q1 = 奇数。每读一个 1 就在两个状态之间跳一下；读 0 则原地不动——0 不改变个数的奇偶。',
      states: [
        { id: 'q0', x: 255, y: 250 },
        { id: 'q1', x: 465, y: 250 },
      ],
      start: 'q0',
      accept: ['q0'],
      trans: {
        q0: { '0': 'q0', '1': 'q1' },
        q1: { '0': 'q1', '1': 'q0' },
      },
      curves: { 'q0>q1': -36, 'q1>q0': 36 },
    },
    {
      id: 'ends00',
      name: '「以 00 结尾」检测机',
      goal: '识别「最后两个字符是 00」的 0/1 串',
      explain: '这台机器盯着串的「结尾」：q0 = 结尾不是 0；q1 = 结尾恰好有一个 0（有希望）；q2 = 结尾是 00（接受状态）。读到一个 1 会把希望清零，回到 q0 重新数；连续读 0 则从 q1 升级到 q2 并保持。',
      states: [
        { id: 'q0', x: 140, y: 250 },
        { id: 'q1', x: 360, y: 250 },
        { id: 'q2', x: 580, y: 250 },
      ],
      start: 'q0',
      accept: ['q2'],
      trans: {
        q0: { '0': 'q1', '1': 'q0' },
        q1: { '0': 'q2', '1': 'q0' },
        q2: { '0': 'q2', '1': 'q0' },
      },
      curves: { 'q0>q1': -36, 'q1>q0': 36, 'q2>q0': 150 },
    },
  ];
  /* AUTOMATA_END */

  /* ---------------- 帧生成：逐字符走状态，最后判定 ---------------- */
  function fsmFrames(aut, input) {
    const out = [];
    const n = input.length;
    let cur = aut.start;
    out.push({
      state: cur,
      readIdx: -1,
      hl: null,
      verdict: null,
      desc: '把机器放在开始状态 ' + cur + '，准备从左到右读入' + (n ? '字符串「' + input + '」' : '一个空串') + '。双圈画法的状态是「接受状态」。',
    });
    for (let k = 0; k < n; k++) {
      const ch = input[k];
      const nxt = aut.trans[cur][ch];
      out.push({
        state: nxt,
        readIdx: k,
        hl: { from: cur, to: nxt, ch: ch },
        verdict: null,
        desc: '读入第 ' + (k + 1) + ' 个字符「' + ch + '」：沿着 ' + cur + ' 出发、标着「' + ch + '」的箭头，转移到 ' + nxt + '。',
      });
      cur = nxt;
    }
    const accepted = aut.accept.indexOf(cur) >= 0;
    out.push({
      state: cur,
      readIdx: n,
      hl: null,
      verdict: accepted ? 'accept' : 'reject',
      desc: (n === 0 ? '字符串是空的，没有字符可读，机器停在开始状态 ' + cur + '。' : '字符串读完了！机器停在 ' + cur + (accepted ? '，它是接受状态' : '，它不是接受状态') + '。') + '结论：' + (accepted ? '接受' : '拒绝') + '这个串。（任务：' + aut.goal + '）',
    });
    return out;
  }

  /* 测试接缝：浏览器中 module 不存在，此段自动跳过 */
  const FSM = { automata: AUTOMATA, frames: fsmFrames };
  if (typeof module !== 'undefined' && module.exports) { module.exports = FSM; }

  /* ============================ 演示界面 ============================ */
  DemoKit.register('fsm', function (root, kit) {
    const P = kit.palette;
    const W = 720;
    const H = 420;
    const R = 22;
    const state = { autId: 'c101', input: '10110', rndLen: 8 };
    let frames = [];
    let model = null;
    let pb = null;

    const cv = kit.canvas(W, H);
    cv.canvas.setAttribute('aria-label', '有限自动机演示：状态转移图；蓝色是当前状态，红色是刚读入字符走过的转移，读完给出接受或拒绝的结论');

    const row1 = kit.controlRow();
    kit.select({
      label: '自动机',
      options: AUTOMATA.map(function (a) { return { value: a.id, label: a.name }; }),
      value: state.autId,
      parent: row1,
    }, function (v) { state.autId = v; rebuild(); });

    /* 原生输入框（零依赖，样式用站点 CSS 变量） */
    const inpWrap = document.createElement('label');
    inpWrap.className = 'dk-param';
    const inpLabel = document.createElement('span');
    inpLabel.textContent = '输入串';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = state.input;
    inp.maxLength = 16;
    inp.size = 12;
    inp.placeholder = '只含 0/1，如 10110';
    inp.setAttribute('aria-label', '输入只含 0 和 1 的字符串');
    inp.style.width = '108px';
    inp.style.font = 'inherit';
    inp.style.padding = '5px 10px';
    inp.style.border = '1px solid var(--border)';
    inp.style.borderRadius = '8px';
    inp.style.background = 'var(--surface)';
    inp.style.color = 'var(--fg)';
    inp.style.fontFamily = 'var(--font-mono)';
    inp.style.letterSpacing = '2px';
    inp.addEventListener('input', function () {
      const clean = inp.value.replace(/[^01]/g, '').slice(0, 16);
      if (clean !== inp.value) inp.value = clean;
      if (clean !== state.input) { state.input = clean; rebuild(); }
    });
    inpWrap.appendChild(inpLabel);
    inpWrap.appendChild(inp);
    row1.appendChild(inpWrap);

    kit.range({
      label: '随机长度',
      min: 4,
      max: 12,
      value: state.rndLen,
      parent: row1,
    }, function (v) { state.rndLen = v; });
    kit.btn('随机串', function () {
      let s = '';
      for (let k = 0; k < state.rndLen; k++) s += Math.random() < 0.5 ? '0' : '1';
      state.input = s;
      inp.value = s;
      rebuild();
    }, { parent: row1 });

    pb = kit.playback({ total: 1, onChange: render });
    kit.legend([
      { color: P.blue, label: '当前状态' },
      { color: P.red, label: '刚读字符走过的转移' },
      { color: P.green, label: '接受状态（双圈）与最终判定' },
    ]);

    /* ---------- 数据与绘制小工具 ---------- */
    function currentAut() {
      return AUTOMATA.filter(function (a) { return a.id === state.autId; })[0];
    }

    function bendOf(aut, u, v, dflt) {
      const key = u + '>' + v;
      return aut.curves && Object.prototype.hasOwnProperty.call(aut.curves, key) ? aut.curves[key] : dflt;
    }

    function buildModel(aut) {
      const posOf = {};
      aut.states.forEach(function (s) { posOf[s.id] = [s.x, s.y]; });
      const dirMap = {};
      aut.states.forEach(function (st) {
        ['0', '1'].forEach(function (ch) {
          const v = aut.trans[st.id][ch];
          if (v === st.id) return; /* 自环单独收集 */
          const key = st.id + '>' + v;
          if (!dirMap[key]) dirMap[key] = [];
          dirMap[key].push(ch);
        });
      });
      const edges = [];
      const seenPair = {};
      Object.keys(dirMap).forEach(function (key) {
        const parts = key.split('>');
        const u = parts[0];
        const v = parts[1];
        const pair = [u, v].slice().sort().join('|');
        if (seenPair[pair]) return;
        seenPair[pair] = 1;
        const fwd = dirMap[u + '>' + v];
        const back = dirMap[v + '>' + u];
        if (fwd && back) {
          edges.push({ from: u, to: v, labels: fwd, bend: bendOf(aut, u, v, -36) });
          edges.push({ from: v, to: u, labels: back, bend: bendOf(aut, v, u, 36) });
        } else if (fwd) {
          edges.push({ from: u, to: v, labels: fwd, bend: bendOf(aut, u, v, 0) });
        } else if (back) {
          edges.push({ from: v, to: u, labels: back, bend: bendOf(aut, v, u, 0) });
        }
      });
      const selfLoops = [];
      aut.states.forEach(function (st) {
        const labels = ['0', '1'].filter(function (ch) { return aut.trans[st.id][ch] === st.id; });
        if (labels.length) selfLoops.push({ u: st.id, labels: labels });
      });
      return { posOf: posOf, edges: edges, selfLoops: selfLoops };
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function arrowHead(ctx, x, y, dx, dy, size, color) {
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * size + px * size * 0.55, y - uy * size + py * size * 0.55);
      ctx.lineTo(x - ux * size - px * size * 0.55, y - uy * size - py * size * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    function edgeLabel(ctx, x, y, text, color, bold) {
      ctx.font = (bold ? 'bold ' : '') + '12px ' + kit.font;
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = P.bg;
      ctx.fillRect(x - tw / 2 - 3, y - 10, tw + 6, 19);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, y + 4);
    }

    function drawStraight(ctx, A, B, labels, color, width, big) {
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(A[0] + ux * (R + 3), A[1] + uy * (R + 3));
      ctx.lineTo(B[0] - ux * (R + 6), B[1] - uy * (R + 6));
      ctx.stroke();
      arrowHead(ctx, B[0] - ux * (R + 2), B[1] - uy * (R + 2), ux, uy, big ? 10 : 8, color);
      edgeLabel(ctx, (A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 12, labels.join(','), color, big);
    }

    function drawCurved(ctx, A, B, bend, labels, color, width, big) {
      const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const C = [mid[0], mid[1] + bend];
      const d0x = C[0] - A[0];
      const d0y = C[1] - A[1];
      const l0 = Math.sqrt(d0x * d0x + d0y * d0y) || 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(A[0] + (d0x / l0) * (R + 2), A[1] + (d0y / l0) * (R + 2));
      ctx.quadraticCurveTo(C[0], C[1], B[0], B[1]);
      ctx.stroke();
      const d1x = B[0] - C[0];
      const d1y = B[1] - C[1];
      const l1 = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
      arrowHead(ctx, B[0] - (d1x / l1) * (R + 2), B[1] - (d1y / l1) * (R + 2), d1x, d1y, big ? 10 : 8, color);
      const bx = 0.25 * A[0] + 0.5 * C[0] + 0.25 * B[0];
      const by = 0.25 * A[1] + 0.5 * C[1] + 0.25 * B[1];
      edgeLabel(ctx, bx, by + (bend > 0 ? 13 : -13), labels.join(','), color, big);
    }

    function drawSelfLoop(ctx, pos, labels, color, width, big) {
      const x = pos[0];
      const y = pos[1];
      const cy = y - 44;
      const rr = 26;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(x, cy, rr, (105 * Math.PI) / 180, (435 * Math.PI) / 180, false);
      ctx.stroke();
      const ea = (75 * Math.PI) / 180;
      const ex = x + rr * Math.cos(ea);
      const ey = cy + rr * Math.sin(ea);
      arrowHead(ctx, ex, ey, -Math.sin(ea), Math.cos(ea), big ? 9 : 7, color);
      edgeLabel(ctx, x, cy - rr - 11, labels.join(','), color, big);
    }

    function drawEdge(ctx, posOf, ed, style) {
      const A = posOf[ed.from];
      const B = posOf[ed.to];
      if (ed.bend) drawCurved(ctx, A, B, ed.bend, ed.labels, style.color, style.width, style.big);
      else drawStraight(ctx, A, B, ed.labels, style.color, style.width, style.big);
    }

    function drawStringRow(ctx, readIdx, s) {
      const n = s.length;
      if (!n) {
        ctx.font = '13px ' + kit.font;
        ctx.fillStyle = P.muted;
        ctx.textAlign = 'left';
        ctx.fillText('（空串：没有字符可以读）', 16, 76);
        return;
      }
      const bw = 34;
      const gap = 6;
      const bh = 40;
      const by = 52;
      const total = n * (bw + gap) - gap;
      let x = Math.max(16, (W - total) / 2);
      for (let k = 0; k < n; k++) {
        roundRect(ctx, x, by, bw, bh, 6);
        let bg;
        let bd;
        let tc;
        if (k < readIdx) { bg = P.wash; bd = P.accent; tc = P.ink; }
        else if (k === readIdx) { bg = P.redWash; bd = P.red; tc = P.red; }
        else { bg = P.surface; bd = P.border; tc = P.muted; }
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = bd;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = tc;
        ctx.font = 'bold 16px ' + kit.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s[k], x + bw / 2, by + bh / 2 + 1);
        ctx.textBaseline = 'alphabetic';
        x += bw + gap;
      }
    }

    /* ---------- 逐帧渲染 ---------- */
    function render(i) {
      const f = frames[i];
      if (!f) return;
      const aut = currentAut();
      const ctx = cv.ctx;
      cv.bg(P.bg);

      /* 标题 */
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 13px ' + kit.font;
      ctx.fillStyle = P.ink;
      ctx.textAlign = 'left';
      ctx.fillText('自动机：' + aut.name, 16, 22);
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'right';
      ctx.fillText('任务：' + aut.goal, W - 16, 22);

      /* 输入字符串盒子 */
      drawStringRow(ctx, f.readIdx, state.input);

      /* 当前状态 / 最终结论 */
      if (f.verdict === 'accept') {
        ctx.font = 'bold 15px ' + kit.font;
        ctx.fillStyle = P.green;
        ctx.textAlign = 'left';
        ctx.fillText('结果：接受！（机器停在接受状态 ' + f.state + '）', 16, 112);
      } else if (f.verdict === 'reject') {
        ctx.font = 'bold 15px ' + kit.font;
        ctx.fillStyle = P.red;
        ctx.textAlign = 'left';
        ctx.fillText('结果：拒绝（机器停在 ' + f.state + '，它不是接受状态）', 16, 112);
      } else {
        ctx.font = '13px ' + kit.font;
        ctx.fillStyle = P.muted;
        ctx.textAlign = 'left';
        ctx.fillText('当前状态：', 16, 112);
        const w1 = ctx.measureText('当前状态：').width;
        ctx.font = 'bold 14px ' + kit.font;
        ctx.fillStyle = P.blue;
        ctx.fillText(f.state, 16 + w1, 112);
        const w2 = ctx.measureText(f.state).width;
        ctx.font = '13px ' + kit.font;
        ctx.fillStyle = P.muted;
        ctx.fillText('　已读 ' + Math.max(f.readIdx + 1, 0) + ' / ' + state.input.length + ' 个字符', 16 + w1 + w2, 112);
      }

      /* 状态图说明 */
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'left';
      ctx.fillText('状态图（蓝 = 当前状态；红 = 刚走过的转移；双圈 = 接受状态）', 16, 134);

      /* 边（底色 → 高亮层） */
      model.edges.forEach(function (ed) {
        drawEdge(ctx, model.posOf, ed, { color: P.muted, width: 1.8, big: false });
      });
      model.selfLoops.forEach(function (sl) {
        drawSelfLoop(ctx, model.posOf[sl.u], sl.labels, P.muted, 1.8, false);
      });
      if (f.hl) {
        model.edges.forEach(function (ed) {
          if (ed.from === f.hl.from && ed.to === f.hl.to) {
            drawEdge(ctx, model.posOf, ed, { color: P.red, width: 3.5, big: true });
          }
        });
        model.selfLoops.forEach(function (sl) {
          if (sl.u === f.hl.from && sl.u === f.hl.to) {
            drawSelfLoop(ctx, model.posOf[sl.u], sl.labels, P.red, 3.5, true);
          }
        });
      }

      /* 节点 */
      aut.states.forEach(function (st) {
        const isCur = f.state === st.id;
        ctx.beginPath();
        ctx.arc(st.x, st.y, R, 0, Math.PI * 2);
        ctx.fillStyle = isCur ? P.blue : P.surface;
        ctx.fill();
        ctx.strokeStyle = isCur ? P.blue : P.muted;
        ctx.lineWidth = isCur ? 2.5 : 1.8;
        ctx.stroke();
        if (aut.accept.indexOf(st.id) >= 0) {
          ctx.beginPath();
          ctx.arc(st.x, st.y, R - 6, 0, Math.PI * 2);
          ctx.strokeStyle = P.green;
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }
        if ((f.verdict === 'accept' || f.verdict === 'reject') && isCur) {
          ctx.beginPath();
          ctx.arc(st.x, st.y, R + 6, 0, Math.PI * 2);
          ctx.strokeStyle = f.verdict === 'accept' ? P.green : P.red;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.fillStyle = isCur ? P.surface : P.ink;
        ctx.font = 'bold 13px ' + kit.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.id, st.x, st.y + 1);
        ctx.textBaseline = 'alphabetic';
      });

      /* 开始箭头 */
      const s0 = model.posOf[aut.start];
      ctx.strokeStyle = P.muted;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(s0[0] - 58, s0[1]);
      ctx.lineTo(s0[0] - R - 5, s0[1]);
      ctx.stroke();
      arrowHead(ctx, s0[0] - R - 2, s0[1], 1, 0, 8, P.muted);
      ctx.font = '11px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'right';
      ctx.fillText('开始', s0[0] - 62, s0[1] + 4);

      /* 轨迹 */
      const seen = [];
      for (let k2 = 0; k2 <= i; k2++) {
        const st2 = frames[k2].state;
        if (!seen.length || seen[seen.length - 1] !== st2) seen.push(st2);
      }
      ctx.font = '12px ' + kit.font;
      ctx.fillStyle = P.muted;
      ctx.textAlign = 'left';
      ctx.fillText('本次轨迹：' + seen.join(' › '), 16, 396);

      /* 旁白与总说明 */
      kit.narrate({ index: i, total: frames.length, text: f.desc });
      if (i === 0) {
        kit.explain(aut.explain + '　操作：输入或随机生成一个 0/1 串，用「下一步 / 播放」逐字符观察；读完后给出接受或拒绝的结论。');
      }
      if (i === frames.length - 1) {
        kit.explain(aut.explain + '　本次输入「' + (state.input || '空串') + '」的结论：' + (f.verdict === 'accept' ? '接受' : '拒绝') + '（机器停在 ' + f.state + '）。');
      }
    }

    /* ---------- 重建帧序列 ---------- */
    function rebuild() {
      const aut = currentAut();
      model = buildModel(aut);
      frames = fsmFrames(aut, state.input);
      pb.setTotal(frames.length);
      pb.reset();
    }

    rebuild();
    return { destroy() { /* 无异步资源需要清理 */ } };
  });
})();
