/* ============================================================================
 * demos/neural-net.js — 神经网络前向传播工坊
 * 2 输入 → 2 隐藏（ReLU/Sigmoid 可切换）→ 1 输出（Sigmoid）。
 * 前向传播五步逐帧演示；「训练一步」= 数值梯度全批梯度下降（两样本）。
 * ==========================================================================*/
(function () {
  'use strict';
  DemoKit.register('neural-net', function (shell, kit) {
    const P = kit.palette;
    const cv = kit.canvas(760, 390);
    const g = cv.ctx;
    cv.canvas.setAttribute('aria-label', '两层神经网络结构图与数值计算面板');

    /* ---------- 数学 ---------- */
    const sigmoid = (x) => 1 / (1 + Math.exp(-x));
    const relu = (x) => Math.max(0, x);
    const act = (x, kind) => (kind === 'relu' ? relu(x) : sigmoid(x));
    const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);

    const defaults = () => ({
      x1: 1, x2: 1,
      w11: 0.8, w12: 0.4, b1: -0.3,
      w21: 0.3, w22: 0.9, b2: -0.4,
      v1: 1.2, v2: 0.8, c: -0.5,
    });
    let ps = defaults();
    let actKind = 'relu';
    let lr = 0.5;
    const SAMPLE_INPUTS = [[1, 1], [0, 1]];
    const SAMPLE_TARGETS = [1, 0];

    function forward(x1, x2, p) {
      const z1 = p.w11 * x1 + p.w12 * x2 + p.b1;
      const z2 = p.w21 * x1 + p.w22 * x2 + p.b2;
      const a1 = act(z1, actKind), a2 = act(z2, actKind);
      const z = p.v1 * a1 + p.v2 * a2 + p.c;
      const y = sigmoid(z);
      return { z1, z2, a1, a2, z, y };
    }
    function loss(p) {
      let L = 0;
      for (let i = 0; i < SAMPLE_INPUTS.length; i++) {
        const y = forward(SAMPLE_INPUTS[i][0], SAMPLE_INPUTS[i][1], p).y;
        L += 0.5 * Math.pow(y - SAMPLE_TARGETS[i], 2);
      }
      return L / SAMPLE_INPUTS.length;
    }
    function trainStep() {
      const eps = 1e-4;
      const base = { ...ps };
      const keys = Object.keys(base);
      const before = loss(base);
      const grads = {};
      keys.forEach((k) => {
        const p1 = { ...base }; p1[k] += eps;
        const p2 = { ...base }; p2[k] -= eps;
        grads[k] = (loss(p1) - loss(p2)) / (2 * eps);
      });
      keys.forEach((k) => { ps[k] = base[k] - lr * grads[k]; });
      syncSliders();
      const after = loss(ps);
      kit.narrate('一步训练（两个样本）', null, '平均损失 <strong>' + f2(before) + ' → ' + f2(after) + '</strong>。梯度告诉每个参数「往哪边调、调多少」，一次小小的下降——这就是「学习」的全部秘密。多点几次，看着损失一路变小吧。');
      renderFrame(pb.current(), true);
    }

    /* ---------- 绘图 ---------- */
    function font(size, weight) { g.font = (weight || 500) + ' ' + size + 'px ' + kit.font; }
    function text(s, x, y, color, size, align, weight) { font(size || 13, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function rrect(x, y, w, h, r, fill, stroke, lw) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.4; g.stroke(); }
    }
    function circle(x, y, r, fill, stroke, lw) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.6; g.stroke(); } }
    function edge(x1, y1, x2, y2, w, color, lw) {
      g.strokeStyle = color; g.lineWidth = lw || 1;
      g.beginPath(); g.moveTo(x1 + 26, y1); g.lineTo(x2 - 30, y2); g.stroke();
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      text(w, mx, my - 10, color, 11, 'center', 600);
    }

    const NODE = {
      x1: [110, 120], x2: [110, 210], h1: [360, 120], h2: [360, 210], y: [610, 165],
    };
    function weightStyle(w) {
      const width = Math.min(6, 1 + Math.abs(w) * 3);
      return { color: w >= 0 ? P.accent : P.red, lw: width };
    }

    function drawDiagram(fr) {
      // 连接线
      const pairs = [
        ['x1', 'h1', ps.w11], ['x1', 'h2', ps.w21], ['x2', 'h1', ps.w12], ['x2', 'h2', ps.w22],
        ['h1', 'y', ps.v1], ['h2', 'y', ps.v2],
      ];
      pairs.forEach(([a, b, w], idx) => {
        const st = weightStyle(w);
        const highlight = (fr === 1 && idx < 4) || (fr === 3 && idx >= 4);
        edge(NODE[a][0], NODE[a][1], NODE[b][0], NODE[b][1], f2(w), highlight ? st.color : P.border, highlight ? st.lw : Math.max(1, st.lw - 1));
      });
      // 输入
      [['x1', ps.x1], ['x2', ps.x2]].forEach(([k, v]) => {
        const [x, y] = NODE[k]; const hl = fr === 0;
        circle(x, y, 30, P.blueWash, hl ? P.blue : P.border, hl ? 2.4 : 1.6);
        text(k, x, y - 8, P.ink, 13, 'center', 700); text(f2(v), x, y + 10, P.muted, 12, 'center', 600);
      });
      // 隐藏层
      [['h1', fr >= 2 ? f2(act(ps.w11 * ps.x1 + ps.w12 * ps.x2 + ps.b1, actKind)) : 'z?'], ['h2', fr >= 2 ? f2(act(ps.w21 * ps.x1 + ps.w22 * ps.x2 + ps.b2, actKind)) : 'z?']].forEach(([k, v]) => {
        const [x, y] = NODE[k]; const hl = fr === 1 || fr === 2;
        circle(x, y, 32, P.wash, hl ? P.accent : P.border, hl ? 2.4 : 1.6);
        text(k, x, y - 10, P.ink, 13, 'center', 700); text(String(v), x, y + 10, P.accentDeep, 12, 'center', 600);
      });
      // 输出
      {
        const [x, y] = NODE.y; const hl = fr === 3 || fr === 4;
        const val = fr >= 4 ? f2(sigmoid(ps.v1 * act(ps.w11 * ps.x1 + ps.w12 * ps.x2 + ps.b1, actKind) + ps.v2 * act(ps.w21 * ps.x1 + ps.w22 * ps.x2 + ps.b2, actKind) + ps.c)) : 'y?';
        circle(x, y, 34, hl && fr === 4 ? P.sandWash : P.surface, hl ? P.sand : P.border, hl ? 2.4 : 1.6);
        text('y', x, y - 10, P.ink, 13, 'center', 700); text(String(val), x, y + 10, P.sandInk, 12.5, 'center', 600);
      }
      text('输入层', 110, 60, P.muted, 12, 'center', 600);
      text('隐藏层（' + (actKind === 'relu' ? 'ReLU' : 'Sigmoid') + '）', 360, 60, P.muted, 12, 'center', 600);
      text('输出层', 610, 60, P.muted, 12, 'center', 600);
    }

    function drawPanel(fr, extra) {
      const fw = forward(ps.x1, ps.x2, ps);
      const lines = [];
      const push = (s, hl) => lines.push({ s: s, hl: hl });
      push('z1 = w11·x1 + w12·x2 + b1 = ' + f2(ps.w11) + '·' + f2(ps.x1) + ' + ' + f2(ps.w12) + '·' + f2(ps.x2) + ' + (' + f2(ps.b1) + ') = ' + f2(fw.z1), fr === 1);
      push('z2 = w21·x1 + w22·x2 + b2 = ' + f2(ps.w21) + '·' + f2(ps.x1) + ' + ' + f2(ps.w22) + '·' + f2(ps.x2) + ' + (' + f2(ps.b2) + ') = ' + f2(fw.z2), fr === 1);
      push('a1 = f(z1) = ' + f2(fw.a1) + '　　a2 = f(z2) = ' + f2(fw.a2) + '　（f = ' + (actKind === 'relu' ? 'ReLU' : 'Sigmoid') + '）', fr === 2);
      push('z = v1·a1 + v2·a2 + c = ' + f2(ps.v1) + '·' + f2(fw.a1) + ' + ' + f2(ps.v2) + '·' + f2(fw.a2) + ' + (' + f2(ps.c) + ') = ' + f2(fw.z), fr === 3);
      push('y = σ(z) = ' + f2(fw.y) + '　（' + (fw.y >= 0.5 ? '更像「是」' : '更像「否」') + '，信心 ' + Math.round(fw.y * 100) + '%）', fr === 4);
      const y0 = 268;
      rrect(24, y0 - 14, 712, 30 + lines.length * 22 + (extra ? 26 : 0), 10, P.surfaceWarm || '#FBF9F5', P.border, 1.2);
      lines.forEach((ln, i) => text(ln.s, 40, y0 + 8 + i * 22, ln.hl ? P.accentDeep : P.muted, 12.5, 'left', ln.hl ? 700 : 500));
      if (extra) text(extra, 40, y0 + 8 + lines.length * 22 + 6, P.sandInk, 12, 'left', 600);
    }

    /* ---------- 帧控制 ---------- */
    let lastTrainMsg = null;
    function renderFrame(i, keepTrainMsg) {
      const fr = Math.max(0, Math.min(4, i));
      cv.clear(); cv.bg(P.surface);
      drawDiagram(fr);
      drawPanel(fr, keepTrainMsg ? lastTrainMsg : null);
      const NARR = [
        '第 1 步 · 输入层：x1、x2 把数值送进网络，信号沿连线（权重）流向隐藏层。',
        '第 2 步 · 隐藏层加权求和：每条连线贡献「输入 × 权重」，再加偏置——先算 z1、z2。',
        '第 3 步 · 激活函数出手：a = f(z)。ReLU 把负数切掉，Sigmoid 把一切压进 0~1——没有它，网络就只能做直线判断。',
        '第 4 步 · 输出层加权求和：z = v1·a1 + v2·a2 + c，把隐藏层两位「证人」的证词汇总。',
        '第 5 步 · 输出激活：y = σ(z) 变成 0~1 的信心值。整个前向传播完成；想知道它准不准，就点「训练一步」。',
      ];
      kit.narrate(fr, 5, NARR[fr]);
    }

    /* ---------- 控制 ---------- */
    const pb = kit.playback({ total: 5, onChange: (i) => renderFrame(i) });

    const row1 = kit.controlRow();
    const sX1 = kit.range({ label: 'x1', min: -2, max: 2, step: 0.1, value: ps.x1, parent: row1 }, (v) => { ps.x1 = v; renderFrame(pb.current()); });
    const sX2 = kit.range({ label: 'x2', min: -2, max: 2, step: 0.1, value: ps.x2, parent: row1 }, (v) => { ps.x2 = v; renderFrame(pb.current()); });
    kit.select({ label: '隐藏层激活', options: [{ value: 'relu', label: 'ReLU' }, { value: 'sigmoid', label: 'Sigmoid' }], value: 'relu', parent: row1 }, (v) => { actKind = v; renderFrame(pb.current()); });

    const row2 = kit.controlRow();
    const sliderDefs = [['w11', -2, 2, 0.1], ['w12', -2, 2, 0.1], ['b1', -2, 2, 0.1], ['w21', -2, 2, 0.1], ['w22', -2, 2, 0.1], ['b2', -2, 2, 0.1], ['v1', -2, 2, 0.1], ['v2', -2, 2, 0.1], ['c', -2, 2, 0.1]];
    const sliders = {};
    sliderDefs.forEach(([k, mn, mx, st]) => { sliders[k] = kit.range({ label: k, min: mn, max: mx, step: st, value: ps[k], parent: row2 }, (v) => { ps[k] = v; renderFrame(pb.current()); }); });

    const row3 = kit.controlRow();
    kit.range({ label: '学习率', min: 0.05, max: 2, step: 0.05, value: lr, format: (v) => f2(v), parent: row3 }, (v) => { lr = v; });
    kit.btn('训练一步', () => { lastTrainMsg = '上一次训练：已更新全部权重/偏置（学习率 ' + f2(lr) + '）'; trainStep(); }, { parent: row3, primary: false });
    kit.btn('参数重置', () => { ps = defaults(); syncSliders(); renderFrame(pb.current()); }, { parent: row3 });

    function syncSliders() { Object.keys(sliders).forEach((k) => sliders[k].set(ps[k])); if (sX1) sX1.set(ps.x1); if (sX2) sX2.set(ps.x2); }

    kit.explain('把一个神经元想成「投票器」：它给每个输入配一个权重（话语权），加权求和后过一道激活函数（决定要不要举手）。两层叠起来，就能拼出弯曲的决策边界——这就是「深度学习」的最小完整例子。点「训练一步」，看梯度下降如何根据两个样本微调全部参数；多点几次，损失会一路走低。');

    renderFrame(0);
    return { destroy() { /* 无外部资源 */ } };
  });
})();
