/* ============================================================================
 * pipeline — 指令流水线工厂（五级流水线时空图）
 * 行=指令（①..⑤），列=时钟拍；每帧推进 1 拍；可切换「停顿（气泡）/ 转发」。
 * 教学模型（单发射、顺序执行、经典五级流水）：
 *  - 停顿模式（无转发）：后一条要读的结果必须等前一条「写回」后才能读到，
 *    因此紧邻的数据依赖要在译码阶段等待 2 拍（出现 2 个气泡）。
 *  - 转发模式（前递）：计算结果可从流水线寄存器直接抄给下一条（0 气泡）；
 *    但「读内存 → 紧接着用」的 load-use 依赖要等访存结束，仍须 1 拍。
 * ==========================================================================*/
DemoKit.register('pipeline', function (root, kit) {
  const P = kit.palette;
  const STAGE_DEFS = [
    { key: 'IF', name: '取指', short: '取' },
    { key: 'ID', name: '译码', short: '译' },
    { key: 'EX', name: '执行', short: '执' },
    { key: 'MEM', name: '访存', short: '访' },
    { key: 'WB', name: '写回', short: '写' },
  ];
  const STYLE = {
    IF: { fill: P.blueWash, line: P.blue, text: P.blue },
    ID: { fill: P.sandWash, line: P.sand, text: P.sandInk },
    EX: { fill: P.wash, line: P.accent, text: P.accentDeep },
    MEM: { fill: P.border, line: P.ink, text: P.ink },
    WB: { fill: P.wash, line: P.green, text: P.green },
  };
  const PROG = [
    { sym: '①', label: '取数：r1 ← 内存A', kind: 'load', rd: [], wr: 'r1' },
    { sym: '②', label: '加法：r2 ← r1 + 1', kind: 'alu', rd: ['r1'], wr: 'r2' },
    { sym: '③', label: '乘法：r3 ← r2 × 2', kind: 'alu', rd: ['r2'], wr: 'r3' },
    { sym: '④', label: '存数：内存B ← r3', kind: 'store', rd: ['r3'], wr: null },
    { sym: '⑤', label: '空操作：无依赖', kind: 'nop', rd: [], wr: null },
  ];
  const IDEAL = PROG.length + 5 - 1; // 无冒险的理想流水线 = 9 拍
  const SERIAL = PROG.length * 5;    // 一条条串行执行 = 25 拍
  const MODE_NAME = { stall: '停顿（无转发）', forward: '转发（前递）' };
  const EXPLAIN_MAIN = '把一条指令拆成 5 个阶段（取指→译码→执行→访存→写回），让不同指令像装配线一样错峰流动，就是流水线。行＝指令、列＝时钟拍：每拍 5 个阶段同时在工作。但指令之间常有牵连：后一条要用前一条刚算出的结果（数据冒险）。「停顿」让它在译码阶段干等（多耗的空拍叫气泡）；「转发」把结果从流水线寄存器抄给下一条，气泡大多消失。留意：转发也不是万能的！';

  const state = { mode: 'stall' };
  let frames = [];
  let pb = null;
  let scheds = null;

  const cv = kit.canvas(720, 376);
  cv.canvas.setAttribute('aria-label', '指令流水线时空图：行是指令①到⑤，列是时钟拍，每格显示指令所处阶段；红色「停」格表示译码等待产生的气泡');

  /* ---------------- 控制条 ---------------- */
  kit.controlRow();
  kit.select({
    label: '数据冒险策略',
    options: [
      { value: 'stall', label: '停顿（插入气泡）' },
      { value: 'forward', label: '转发（前递）' },
    ],
    value: state.mode,
  }, function (v) { state.mode = v; rebuild(); });
  const bTotal = kit.badge('总周期 …');
  const bBub = kit.badge('气泡 …');
  const bSp = kit.badge('加速比 …');

  pb = kit.playback({ total: 1, onChange: render });

  kit.legend([
    { color: STYLE.IF.line, label: '取指' },
    { color: STYLE.ID.line, label: '译码' },
    { color: STYLE.EX.line, label: '执行' },
    { color: STYLE.MEM.line, label: '访存' },
    { color: STYLE.WB.line, label: '写回' },
    { color: P.red, label: '「停」＝气泡（空转 1 拍）' },
  ]);

  /* ---------------- 排班计算 ---------------- */
  function computeSchedule(mode) {
    const n = PROG.length;
    const F = new Array(n).fill(0); // 取指拍
    const S = new Array(n).fill(0); // 译码等待拍数
    const waitFor = new Array(n).fill(-1);
    const writers = {}; // 寄存器 -> 最近写它的指令下标
    for (let j = 0; j < n; j++) {
      const ins = PROG[j];
      F[j] = j === 0 ? 0 : F[j - 1] + 1 + S[j - 1];
      let dep = -1;
      ins.rd.forEach(function (r) {
        if (writers[r] != null) dep = Math.max(dep, writers[r]);
      });
      let s = 0;
      if (dep >= 0) {
        const prod = PROG[dep];
        // 需要满足：F_j + s_j ≥ F_dep + delta + S_dep
        // 停顿模式：结果写回后（+3）才能读；转发模式：ALU 结果直通（+1），
        // 读内存指令结果要等访存结束（+2）。
        const delta = mode === 'forward' ? (prod.kind === 'load' ? 2 : 1) : 3;
        s = Math.max(0, F[dep] + delta + S[dep] - F[j]);
        waitFor[j] = dep;
      }
      S[j] = s;
      if (ins.wr) writers[ins.wr] = j;
    }
    const rows = PROG.map(function (ins, j) {
      const cells = [];
      let c = F[j];
      cells.push({ cycle: c, type: 'IF' }); c++;
      cells.push({ cycle: c, type: 'ID' }); c++;
      for (let k = 0; k < S[j]; k++) { cells.push({ cycle: c, type: 'STOP' }); c++; }
      cells.push({ cycle: c, type: 'EX' }); c++;
      cells.push({ cycle: c, type: 'MEM' }); c++;
      cells.push({ cycle: c, type: 'WB' }); c++;
      return { ins: ins, idx: j, F: F[j], S: S[j], waitFor: waitFor[j], cells: cells };
    });
    let total = 0;
    rows.forEach(function (r) {
      r.cells.forEach(function (cc) { if (cc.type === 'WB' && cc.cycle + 1 > total) total = cc.cycle + 1; });
    });
    const bubbles = S.reduce(function (a, b) { return a + b; }, 0);
    return { rows: rows, total: total, bubbles: bubbles };
  }

  /* ---------------- 逐拍帧序列 ---------------- */
  function buildFrames() {
    const sc = scheds[state.mode];
    const out = [];
    for (let c = 0; c < sc.total; c++) {
      const occ = occupantMap(sc, c);
      const parts = [];
      STAGE_DEFS.forEach(function (st) {
        const o = occ[st.key];
        if (!o) return;
        if (o.stall) parts.push(o.sym + '在' + st.name + '等待' + (o.waitSym ? '（等' + o.waitSym + '）' : ''));
        else parts.push(o.sym + '在' + st.name);
      });
      let text = '第 ' + (c + 1) + ' 拍：' + (parts.length ? parts.join('，') + '。' : '所有阶段都空闲。');
      if (c === 0) text += ' 流水线开工啦：五级像流水作业一样依次接手。';
      const stopRow = sc.rows.filter(function (r) {
        return r.cells.some(function (cc) { return cc.cycle === c && cc.type === 'STOP'; });
      })[0];
      if (stopRow) {
        const dep = stopRow.waitFor;
        const why = state.mode === 'stall'
          ? '要等 ' + PROG[dep].sym + ' 把结果写回寄存器后才读得到'
          : PROG[dep].sym + '是读内存指令，结果到访存结束才出来，转发也来不及';
        text += ' 出现气泡——' + stopRow.ins.sym + '在译码阶段干等（' + why + '），这一拍整条线空转了。';
      }
      out.push({ cycle: c, desc: text });
    }
    const other = state.mode === 'stall' ? scheds.forward : scheds.stall;
    const otherName = MODE_NAME[state.mode === 'stall' ? 'forward' : 'stall'];
    let sdesc = '全部走完啦，来看账本：' + MODE_NAME[state.mode] + '一共 ' + sc.total + ' 拍 ＝ 理想线 ' + IDEAL + ' 拍 ＋ 气泡 ' + sc.bubbles + ' 个；';
    sdesc += '如果一条条串行执行需要 ' + SERIAL + ' 拍，加速比 ＝ ' + SERIAL + ' ÷ ' + sc.total + ' ≈ ' + fmtNum(SERIAL / sc.total) + '×。';
    sdesc += ' 对照「' + otherName + '」：' + other.total + ' 拍、气泡 ' + other.bubbles + ' 个。';
    sdesc += state.mode === 'stall' ? '切到「转发」看看气泡怎么被消灭！' : '转发很能干，但注意：读内存后紧接着用结果的 1 拍，谁都省不掉。';
    out.push({ summary: true, desc: sdesc });
    return out;
  }

  function occupantMap(sc, c) {
    const map = {};
    sc.rows.forEach(function (r) {
      r.cells.forEach(function (cc) {
        if (cc.cycle !== c) return;
        if (cc.type === 'STOP') {
          map.ID = { sym: r.ins.sym, stall: true, waitSym: r.waitFor >= 0 ? PROG[r.waitFor].sym : '' };
        } else if (!map[cc.type]) {
          map[cc.type] = { sym: r.ins.sym, stall: false };
        }
      });
    });
    return map;
  }

  function hasStopCycle(sc, c) {
    return sc.rows.some(function (r) {
      return r.cells.some(function (cc) { return cc.cycle === c && cc.type === 'STOP'; });
    });
  }

  /* ---------------- 渲染 ---------------- */
  function render(i) {
    const f = frames[i];
    if (!f) return;
    const sc = scheds[state.mode];
    const isSummary = !!f.summary;
    const curC = isSummary ? sc.total - 1 : f.cycle;
    const revealC = isSummary ? sc.total - 1 : curC;
    const ctx = cv.ctx;
    const W = cv.width;
    const H = cv.height;

    cv.bg(P.bg);

    /* 标题 */
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = P.ink; ctx.font = '13px ' + kit.font;
    const title = isSummary
      ? '收官 · 共 ' + sc.total + ' 拍（' + MODE_NAME[state.mode] + '）'
      : '第 ' + (curC + 1) + ' / ' + sc.total + ' 拍 · ' + MODE_NAME[state.mode];
    ctx.fillText(title, 14, 22);
    ctx.textAlign = 'right'; ctx.fillStyle = P.muted; ctx.font = '11px ' + kit.font;
    ctx.fillText('行＝指令　列＝时钟拍（每帧推进 1 拍）', W - 14, 22);

    /* 装配线实况 */
    const stripY = 30, stripH = 46, gap = 10;
    const bw = (W - 28 - 4 * gap) / 5;
    const occ = occupantMap(sc, curC);
    for (let s = 0; s < 5; s++) {
      const st = STAGE_DEFS[s];
      const x = 14 + s * (bw + gap);
      const o = occ[st.key];
      let fill = P.surface, line = P.border, nameCol = P.muted, whoCol = P.muted, who = '空';
      if (o) {
        if (o.stall) {
          fill = P.sandWash; line = P.sand; nameCol = P.sandInk; whoCol = P.sandInk; who = o.sym + ' 等待中';
        } else {
          fill = STYLE[st.key].fill; line = STYLE[st.key].line; nameCol = STYLE[st.key].text; whoCol = STYLE[st.key].text; who = o.sym;
        }
      }
      roundRect(ctx, x, stripY, bw, stripH, 8);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = nameCol; ctx.font = '11px ' + kit.font;
      ctx.fillText(st.name, x + 10, stripY + 17);
      if (o && !o.stall) {
        ctx.font = 'bold 15px ' + kit.font; ctx.fillStyle = whoCol;
        ctx.fillText(who, x + 10, stripY + 39);
      } else {
        ctx.font = '11px ' + kit.font; ctx.fillStyle = whoCol;
        ctx.fillText(who, x + 10, stripY + 38);
      }
      if (s < 4) {
        ctx.textAlign = 'center'; ctx.fillStyle = P.border; ctx.font = '13px ' + kit.font;
        ctx.fillText('›', x + bw + gap / 2, stripY + stripH / 2 + 4);
      }
    }

    /* 时空网格 */
    const gridX0 = 178, gridX1 = W - 14, gridW = gridX1 - gridX0;
    const total = sc.total, cw = gridW / total;
    const headY = 86, rowsY0 = 108, rowH = 30;

    for (let c = 0; c <= revealC; c++) {
      const cx = gridX0 + c * cw + cw / 2;
      const isCur = !isSummary && c === curC;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = (isCur ? 'bold ' : '') + '10.5px ' + kit.font;
      ctx.fillStyle = isCur ? P.accentDeep : P.muted;
      ctx.fillText(String(c + 1), cx, headY + 12);
      if (hasStopCycle(sc, c)) {
        ctx.beginPath(); ctx.arc(cx, headY + 18.5, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = P.red; ctx.fill();
      }
    }

    for (let j = 0; j < sc.rows.length; j++) {
      const r = sc.rows[j];
      const ry = rowsY0 + j * rowH;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px ' + kit.font; ctx.fillStyle = P.ink;
      ctx.fillText(r.ins.sym, 14, ry + rowH / 2);
      ctx.font = '10.5px ' + kit.font; ctx.fillStyle = P.muted;
      ctx.fillText(r.ins.label, 32, ry + rowH / 2);
      for (let c = 0; c <= revealC; c++) {
        const x = gridX0 + c * cw + 2;
        const w = cw - 4;
        const y = ry + 4;
        const h = rowH - 8;
        let cell = null;
        r.cells.forEach(function (cc) { if (cc.cycle === c) cell = cc; });
        if (!cell) {
          roundRect(ctx, x, y, w, h, 6);
          ctx.fillStyle = P.bg; ctx.fill();
          ctx.globalAlpha = 0.6; ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
          continue;
        }
        if (cell.type === 'STOP') {
          roundRect(ctx, x, y, w, h, 6);
          ctx.fillStyle = P.redWash; ctx.fill();
          ctx.setLineDash([3, 2]); ctx.strokeStyle = P.red; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = P.red; ctx.font = '11px ' + kit.font;
          ctx.fillText('停', x + w / 2, y + h / 2 + 0.5);
          continue;
        }
        const stl = STYLE[cell.type];
        const isCur = !isSummary && c === curC;
        roundRect(ctx, x, y, w, h, 6);
        ctx.fillStyle = stl.fill; ctx.fill();
        ctx.strokeStyle = stl.line; ctx.lineWidth = isCur ? 2 : 1.2; ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = stl.text; ctx.font = (isCur ? 'bold ' : '') + '11px ' + kit.font;
        const def = STAGE_DEFS.filter(function (s) { return s.key === cell.type; })[0];
        ctx.fillText(def ? def.short : '', x + w / 2, y + h / 2 + 0.5);
      }
    }

    /* 当前拍底色 */
    if (!isSummary) {
      ctx.fillStyle = P.accent; ctx.globalAlpha = 0.07;
      ctx.fillRect(gridX0 + curC * cw, headY + 1, cw, rowsY0 + 5 * rowH - headY - 1);
      ctx.globalAlpha = 1;
    }

    /* 底部对比条 */
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '10.5px ' + kit.font; ctx.fillStyle = P.muted;
    ctx.fillText('总周期数对比（越短越快）：', 14, 300);
    const bars = [
      { label: '串行执行', v: SERIAL, fill: P.border, line: P.muted, dim: true },
      { label: '停顿', v: scheds.stall.total, fill: P.sand, line: P.sandInk, mode: 'stall' },
      { label: '转发', v: scheds.forward.total, fill: P.accent, line: P.accentDeep, mode: 'forward' },
    ];
    const barX = 106, barMax = 420, unit = barMax / SERIAL;
    bars.forEach(function (b, k) {
      const y = 312 + k * 22;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = '10.5px ' + kit.font; ctx.fillStyle = P.ink;
      ctx.fillText(b.label, 98, y + 7);
      const w = Math.max(6, b.v * unit);
      const isCur = b.mode === state.mode;
      ctx.globalAlpha = b.dim ? 0.8 : (isCur ? 1 : 0.45);
      roundRect(ctx, barX, y, w, 14, 5);
      ctx.fillStyle = b.fill; ctx.fill();
      ctx.strokeStyle = isCur ? P.ink : b.line; ctx.lineWidth = isCur ? 1.6 : 1; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left'; ctx.font = '10.5px ' + kit.font;
      ctx.fillStyle = isCur ? P.ink : P.muted;
      ctx.fillText(b.v + ' 拍' + (b.mode ? '（气泡 ' + (b.mode === 'stall' ? scheds.stall.bubbles : scheds.forward.bubbles) + ' 个）' : ''), barX + w + 8, y + 7);
    });

    /* 徽章与旁白 */
    bTotal.set('总周期 ' + sc.total + ' 拍');
    bBub.set('气泡 ' + sc.bubbles + ' 个');
    bSp.set('加速比 ' + fmtNum(SERIAL / sc.total) + '×');

    kit.narrate({ index: i, total: frames.length, text: f.desc });

    if (isSummary) {
      const other = state.mode === 'stall' ? scheds.forward : scheds.stall;
      const otherName = MODE_NAME[state.mode === 'stall' ? 'forward' : 'stall'];
      kit.explain(
        '对比一下：' + MODE_NAME[state.mode] + '共 ' + sc.total + ' 拍（气泡 ' + sc.bubbles + ' 个，加速比 ' + fmtNum(SERIAL / sc.total) + '×）；' +
        otherName + '共 ' + other.total + ' 拍（气泡 ' + other.bubbles + ' 个）。' +
        (state.mode === 'stall'
          ? '转发把 ' + (sc.bubbles - other.bubbles) + ' 个气泡消掉了——大多数数据冒险靠「抄近路」就能解决。'
          : '转发效率很高，但要记住：load-use（读内存的结果马上被用）那 1 个气泡，谁都消不掉，这是它的界限。')
      );
    } else {
      kit.explain(EXPLAIN_MAIN);
    }
  }

  /* ---------------- 重建与工具 ---------------- */
  function rebuild() {
    frames = buildFrames();
    pb.setTotal(frames.length);
    pb.reset();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function fmtNum(x) { return String(Math.round(x * 100) / 100); }

  scheds = { stall: computeSchedule('stall'), forward: computeSchedule('forward') };
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
