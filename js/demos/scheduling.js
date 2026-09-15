/* ============================================================================
 * scheduling — 进程调度模拟器（DemoKit 帧序列模式）
 * 四种算法：FCFS / SJF（非抢占）/ RR（时间片可调）/ 优先级（非抢占，数字小=优先级高）
 * 帧序列：每个时间单位一帧（甘特图一格），末尾加一帧汇总统计。
 * 约定：同一时刻，新到达的进程先入就绪队列，刚用完时间片的进程随后排到队尾。
 * ==========================================================================*/
DemoKit.register('scheduling', function (root, kit) {
  const P = kit.palette;
  const COLORS = [P.accent, P.blue, P.sand, P.red, P.green];
  const ALGS = [
    {
      id: 'fcfs', name: '先来先服务 FCFS',
      cx: 'FCFS 像排队买票：谁先到谁先上 CPU，一旦开始就运行到结束（非抢占）。公平直观，但前面的大任务会让后面所有小任务一起等（护航效应）。',
    },
    {
      id: 'sjf', name: '最短作业优先 SJF',
      cx: 'SJF 每次都挑「已到达且运行时间最短」的进程上 CPU（非抢占）。它的平均等待时间通常最短；代价是长任务可能一直排在后面（饥饿）。',
    },
    {
      id: 'rr', name: '时间片轮转 RR',
      cx: 'RR 让大家排队轮流用 CPU：每人一次最多用 q 个时间单位（时间片），用完就排到队尾。q 越小越公平、响应越快；q 越大就越接近 FCFS。',
    },
    {
      id: 'prio', name: '优先级调度',
      cx: '优先级调度每次挑「优先级最高」的已到达进程（本演示约定：数字越小优先级越高），先上 CPU 的进程运行到结束（非抢占）。紧急任务先做，但低优先级进程可能饿死。',
    },
  ];
  const DEFAULTS = [
    { arrival: 0, burst: 4, prio: 3 },
    { arrival: 1, burst: 3, prio: 1 },
    { arrival: 2, burst: 5, prio: 4 },
    { arrival: 3, burst: 2, prio: 2 },
    { arrival: 4, burst: 2, prio: 5 },
  ];
  const state = { alg: 'fcfs', quantum: 2, n: 4, editId: 1, procs: [] };
  DEFAULTS.forEach((p) => state.procs.push({ arrival: p.arrival, burst: p.burst, prio: p.prio }));

  let frames = [];
  let totalT = 0;
  let pb = null;

  const cv = kit.canvas(720, 340);
  cv.canvas.setAttribute('aria-label', '进程调度甘特图：彩色格子表示对应进程占用 CPU 的时间单位，灰色格子表示 CPU 空闲；下方表格显示每个进程的剩余运行时间，以及完成后的周转时间与等待时间。');

  /* ---------------- 控制区 ---------------- */
  kit.controlRow();
  const algSel = kit.select({
    label: '算法',
    options: ALGS.map((a) => ({ value: a.id, label: a.name })),
    value: state.alg,
  }, (v) => { state.alg = v; rebuild(); });
  const qRange = kit.range({
    label: '时间片 q（RR 用）', min: 1, max: 4, value: state.quantum, format: (v) => v + ' 个单位',
  }, (v) => { state.quantum = v; rebuild(); });
  const nRange = kit.range({
    label: '进程数', min: 3, max: 5, value: state.n, format: (v) => v + ' 个',
  }, (v) => {
    state.n = v;
    if (state.editId > v) { state.editId = v; procSel.set('P' + v); }
    syncEdit();
    rebuild();
  });
  const tBadge = kit.badge('t = 0');
  const doneBadge = kit.badge('完成 0 / 4');

  kit.controlRow();
  const procSel = kit.select({
    label: '编辑进程',
    options: [1, 2, 3, 4, 5].map((i) => ({ value: 'P' + i, label: 'P' + i })),
    value: 'P1',
  }, (v) => {
    state.editId = Number(String(v).slice(1));
    if (state.editId > state.n) { state.n = state.editId; nRange.set(state.n); }
    syncEdit();
  });
  const arrRange = kit.range({ label: '到达时间', min: 0, max: 8, value: 0 }, (v) => { state.procs[state.editId - 1].arrival = v; rebuild(); });
  const burstRange = kit.range({ label: '运行时长', min: 1, max: 8, value: 4 }, (v) => { state.procs[state.editId - 1].burst = v; rebuild(); });
  const prioRange = kit.range({ label: '优先级（1 最高）', min: 1, max: 5, value: 3 }, (v) => { state.procs[state.editId - 1].prio = v; rebuild(); });

  kit.controlRow();
  kit.btn('换一组随机', () => {
    for (let i = 0; i < 5; i++) {
      state.procs[i] = {
        arrival: Math.floor(Math.random() * 6),
        burst: 1 + Math.floor(Math.random() * 6),
        prio: 1 + Math.floor(Math.random() * 5),
      };
    }
    syncEdit();
    rebuild();
  });
  kit.btn('恢复默认', () => {
    DEFAULTS.forEach((p, i) => { state.procs[i] = { arrival: p.arrival, burst: p.burst, prio: p.prio }; });
    state.n = 4; state.editId = 1; state.quantum = 2; state.alg = 'fcfs';
    algSel.set('fcfs'); qRange.set(2); nRange.set(4); procSel.set('P1');
    syncEdit();
    rebuild();
  });

  pb = kit.playback({ total: 1, onChange: render });
  kit.explain('进程调度 = 决定「接下来让谁上 CPU」。甘特图每个格子 = 1 个时间单位：彩色格子代表某个进程在运行，灰色格子是 CPU 空闲。等待时间 = 从到达到完成的时间 − 实际运行时间；周转时间 = 完成时间 − 到达时间。切换四种算法，同一群进程会得到完全不同的结果。');

  /* ---------------- 参数与编辑同步 ---------------- */
  function syncEdit() {
    const p = state.procs[state.editId - 1];
    if (!p) return;
    arrRange.set(p.arrival);
    burstRange.set(p.burst);
    prioRange.set(p.prio);
  }

  /* ---------------- 帧序列计算 ---------------- */
  function computeFrames(s) {
    const procs = [];
    for (let i = 0; i < s.n; i++) {
      const p = s.procs[i];
      procs.push({ id: i + 1, arrival: p.arrival, burst: p.burst, prio: p.prio, remaining: p.burst, state: 'wait', finish: null, enqueued: false });
    }
    const q = s.quantum;
    const alg = s.alg;
    const out = [];
    let t = 0;
    let doneCount = 0;
    let queue = [];
    let running = null;
    let sliceUsed = 0;
    let pending = null;
    let guard = 0;

    function makeFrame(runId, notes, finishedNow) {
      return {
        t: t,
        runId: runId,
        notes: notes,
        queueIds: queue.map((p2) => p2.id),
        rem: procs.map((p2) => p2.remaining),
        states: procs.map((p2) => p2.state),
        finishes: procs.map((p2) => p2.finish),
        doneCount: doneCount,
        finishedNow: !!finishedNow,
        final: false,
      };
    }

    function pickReason(pick) {
      if (alg === 'fcfs') return 'FCFS：就绪队列里最早到达的是 P' + pick.id + '，让它上 CPU（非抢占，运行到结束）';
      if (alg === 'sjf') return 'SJF：已到达的进程里 P' + pick.id + ' 的运行时间最短（' + pick.burst + '），选它（非抢占）';
      if (alg === 'rr') return 'RR：就绪队列队首是 P' + pick.id + '，让它上 CPU（时间片 ' + q + '；它还需运行 ' + pick.remaining + ' 个单位）';
      return '优先级：已到达的进程里 P' + pick.id + ' 的优先级最高（数字最小 = ' + pick.prio + '），选它（非抢占）';
    }

    while (doneCount < procs.length && guard++ < 4000) {
      const notes = [];

      /* 1) 新到达的进程入就绪队列 */
      for (let k = 0; k < procs.length; k++) {
        const p = procs[k];
        if (!p.enqueued && p.arrival === t) {
          p.enqueued = true;
          p.state = 'ready';
          queue.push(p);
          notes.push('P' + p.id + ' 到达（运行 ' + p.burst + ' 个单位，优先级 ' + p.prio + '），进入就绪队列');
        }
      }

      /* 2) 刚用完时间片的进程排到队尾（本演示约定：新到达者先入队） */
      if (pending) {
        queue.push(pending);
        notes.push('P' + pending.id + ' 从队尾重新排队');
        pending = null;
      }

      /* 3) CPU 空闲时按算法挑一个进程 */
      if (!running) {
        if (queue.length === 0) {
          notes.push('没有就绪进程，CPU 空闲');
          let nextArr = Infinity;
          for (let k = 0; k < procs.length; k++) {
            if (!procs[k].enqueued && procs[k].arrival < nextArr) nextArr = procs[k].arrival;
          }
          if (isFinite(nextArr)) notes.push('下一个进程将在 t = ' + nextArr + ' 到达');
          out.push(makeFrame(null, notes, false));
          t++;
          continue;
        }
        let pick = null;
        if (alg === 'fcfs' || alg === 'rr') {
          pick = queue[0];
        } else if (alg === 'sjf') {
          for (let k = 0; k < queue.length; k++) if (!pick || queue[k].burst < pick.burst) pick = queue[k];
        } else {
          for (let k = 0; k < queue.length; k++) if (!pick || queue[k].prio < pick.prio) pick = queue[k];
        }
        queue = queue.filter((p2) => p2 !== pick);
        running = pick;
        running.state = 'running';
        sliceUsed = 0;
        notes.push(pickReason(pick));
      }

      /* 4) 运行 1 个时间单位 */
      running.remaining--;
      sliceUsed++;
      const runner = running;
      let finishedNow = false;
      if (runner.remaining === 0) {
        runner.finish = t + 1;
        runner.state = 'done';
        doneCount++;
        finishedNow = true;
        notes.push('P' + runner.id + ' 运行完毕（完成于 t = ' + (t + 1) + '）');
      } else {
        notes.push('P' + runner.id + ' 运行 1 个单位（还剩 ' + runner.remaining + '）');
        if (alg === 'rr' && sliceUsed === q) notes.push('P' + runner.id + ' 的时间片用完，将被换下、排到队尾');
      }
      out.push(makeFrame(runner.id, notes, finishedNow));
      t++;
      if (finishedNow) {
        running = null;
      } else if (alg === 'rr' && sliceUsed === q) {
        runner.state = 'ready';
        pending = runner;
        running = null;
      }
    }

    /* 汇总帧 */
    const turn = procs.map((p2) => p2.finish - p2.arrival);
    const wait = procs.map((p2, k) => turn[k] - p2.burst);
    function avg(arr) { let s = 0; arr.forEach((x) => { s += x; }); return arr.length ? s / arr.length : 0; }
    out.push({
      t: t,
      runId: null,
      notes: [],
      queueIds: [],
      rem: procs.map((p2) => p2.remaining),
      states: procs.map((p2) => p2.state),
      finishes: procs.map((p2) => p2.finish),
      doneCount: procs.length,
      finishedNow: false,
      final: true,
      turn: turn,
      wait: wait,
      avgTurn: avg(turn),
      avgWait: avg(wait),
    });
    return out;
  }

  /* ---------------- 渲染 ---------------- */
  function fmt(x) { return String(Math.round(x * 100) / 100); }
  function textOnColor(ci) { return ci === 2 ? P.ink : P.surface; } /* 砂金偏亮，配墨色字 */

  function rrect(c2d, x, y, w, h, r) {
    c2d.beginPath();
    c2d.moveTo(x + r, y);
    c2d.arcTo(x + w, y, x + w, y + h, r);
    c2d.arcTo(x + w, y + h, x, y + h, r);
    c2d.arcTo(x, y + h, x, y, r);
    c2d.arcTo(x, y, x + w, y, r);
    c2d.closePath();
  }

  function render(i) {
    const f = frames[i];
    if (!f) return;
    const W = 720;
    const pad = 16;
    cv.bg(P.bg);
    const meta = ALGS.filter((a) => a.id === state.alg)[0];

    /* 标题行 */
    cv.ctx.fillStyle = P.ink;
    cv.ctx.font = '13px ' + kit.font;
    cv.ctx.textAlign = 'left';
    cv.ctx.fillText('算法：' + meta.name + (state.alg === 'rr' ? '（时间片 q = ' + state.quantum + '）' : ''), pad, 22);
    cv.ctx.textAlign = 'right';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.fillText('时钟 t = ' + f.t + (f.final ? '（全部完成）' : ' / 共 ' + totalT + ' 个单位'), W - pad, 22);

    /* 甘特图：[t, t+1) 一格的彩色条 */
    const gy = 38;
    const gh = 44;
    const cw = (W - 2 * pad) / totalT;
    for (let k = 0; k < totalT; k++) {
      const x = pad + k * cw;
      const doneCell = f.final || k < i + 1;
      if (doneCell) {
        const runId = frames[k].runId;
        cv.ctx.fillStyle = runId == null ? P.border : COLORS[runId - 1];
        cv.ctx.fillRect(x + 1, gy, Math.max(1, cw - 2), gh);
        if (runId != null && cw >= 20) {
          cv.ctx.fillStyle = textOnColor(runId - 1);
          cv.ctx.font = '11px ' + kit.font;
          cv.ctx.textAlign = 'center';
          cv.ctx.fillText('P' + runId, x + cw / 2, gy + gh / 2 + 4);
        }
      } else {
        cv.ctx.strokeStyle = P.border;
        cv.ctx.lineWidth = 1;
        cv.ctx.strokeRect(x + 1.5, gy + 1.5, Math.max(1, cw - 3), gh - 3);
      }
    }
    if (!f.final) {
      cv.ctx.strokeStyle = P.ink;
      cv.ctx.lineWidth = 1.5;
      cv.ctx.strokeRect(pad + i * cw + 1, gy - 3, cw - 2, gh + 6);
    }
    /* 时间轴刻度 */
    const tstep = Math.max(1, Math.ceil(totalT / 12));
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '10px ' + kit.font;
    cv.ctx.textAlign = 'center';
    for (let k = 0; k <= totalT; k += tstep) cv.ctx.fillText(String(k), pad + k * cw, gy + gh + 14);
    if (totalT % tstep !== 0) cv.ctx.fillText(String(totalT), pad + totalT * cw, gy + gh + 14);

    /* CPU 与就绪队列 */
    const cpuY = 112;
    const cpuH = 34;
    rrect(cv.ctx, pad, cpuY, 88, cpuH, 7);
    cv.ctx.fillStyle = f.runId != null && !f.final ? COLORS[f.runId - 1] : P.border;
    cv.ctx.fill();
    cv.ctx.textAlign = 'center';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '9px ' + kit.font;
    cv.ctx.fillText('CPU', pad + 44, cpuY + 12);
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.fillStyle = f.runId != null && !f.final ? textOnColor(f.runId - 1) : P.muted;
    cv.ctx.fillText(f.final ? '全部完成' : (f.runId != null ? 'P' + f.runId + ' 在运行' : '空闲'), pad + 44, cpuY + 26);
    cv.ctx.textAlign = 'left';
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '11px ' + kit.font;
    cv.ctx.fillText('就绪队列', pad + 104, cpuY + 22);
    const qx0 = pad + 104 + 58;
    if (f.queueIds.length === 0) {
      cv.ctx.fillStyle = P.muted;
      cv.ctx.fillText(f.final ? '——' : '（空）', qx0, cpuY + 22);
    } else {
      f.queueIds.forEach((id, k) => {
        const bx = qx0 + k * 52;
        rrect(cv.ctx, bx, cpuY, 44, cpuH, 7);
        cv.ctx.fillStyle = COLORS[id - 1];
        cv.ctx.fill();
        cv.ctx.fillStyle = textOnColor(id - 1);
        cv.ctx.font = '12px ' + kit.font;
        cv.ctx.textAlign = 'center';
        cv.ctx.fillText('P' + id, bx + 22, cpuY + cpuH / 2 + 4);
        cv.ctx.textAlign = 'left';
      });
    }

    /* 进程表 */
    const cols = [96];
    for (let c = 1; c < 8; c++) cols.push(84.57);
    function colX(c) { let x2 = pad; for (let k2 = 0; k2 < c; k2++) x2 += cols[k2]; return x2; }
    const headers = ['进程', '到达', '运行', '优先级', '剩余', '完成', '周转', '等待'];
    const hy = 168;
    cv.ctx.fillStyle = P.muted;
    cv.ctx.font = '11px ' + kit.font;
    cv.ctx.textAlign = 'center';
    for (let c = 0; c < 8; c++) cv.ctx.fillText(headers[c], colX(c) + cols[c] / 2, hy);
    for (let k = 0; k < state.n; k++) {
      const y = hy + 8 + k * 24;
      const st = f.states[k];
      if (st === 'running' || st === 'done' || st === 'ready') {
        rrect(cv.ctx, pad, y, W - 2 * pad, 22, 5);
        cv.ctx.fillStyle = st === 'running' ? P.blueWash : (st === 'done' ? P.wash : P.sandWash);
        cv.ctx.fill();
      }
      rrect(cv.ctx, colX(0) + 10, y + 6, 10, 10, 2);
      cv.ctx.fillStyle = COLORS[k];
      cv.ctx.fill();
      cv.ctx.fillStyle = P.ink;
      cv.ctx.font = (st === 'running' ? '600 ' : '') + '12px ' + kit.font;
      cv.ctx.textAlign = 'left';
      cv.ctx.fillText('P' + (k + 1), colX(0) + 26, y + 16);
      const pr = state.procs[k];
      const vals = [
        String(pr.arrival),
        String(pr.burst),
        String(pr.prio),
        st === 'wait' ? '未到' : String(f.rem[k]),
        f.finishes[k] != null ? 't=' + f.finishes[k] : '—',
        f.finishes[k] != null ? String(f.finishes[k] - pr.arrival) : '—',
        f.finishes[k] != null ? String(f.finishes[k] - pr.arrival - pr.burst) : '—',
      ];
      cv.ctx.font = '12px ' + kit.font;
      cv.ctx.textAlign = 'center';
      for (let c = 0; c < 7; c++) {
        cv.ctx.fillStyle = (c >= 5 && f.finishes[k] != null) ? P.accentDeep : P.ink;
        cv.ctx.fillText(vals[c], colX(c + 1) + cols[c + 1] / 2, y + 16);
      }
    }

    /* 底部提示 / 汇总 */
    cv.ctx.textAlign = 'left';
    cv.ctx.font = '11px ' + kit.font;
    if (f.final) {
      cv.ctx.fillStyle = P.ink;
      cv.ctx.fillText('平均周转时间 ' + fmt(f.avgTurn) + ' 个单位　·　平均等待时间 ' + fmt(f.avgWait) + ' 个单位（' + state.n + ' 个进程，总用时 ' + totalT + ' 个单位）', pad, 318);
    } else {
      cv.ctx.fillStyle = P.muted;
      cv.ctx.fillText('等待时间 = 完成时间 − 到达时间 − 运行时间；周转时间 = 完成时间 − 到达时间。', pad, 318);
    }

    /* 徽标与旁白 */
    tBadge.set('t = ' + f.t + (f.final ? ' · 完成' : ''));
    doneBadge.set('完成 ' + f.doneCount + ' / ' + state.n);
    if (f.final) {
      kit.narrate({ index: i, total: frames.length, text: '全部完成！' + meta.name + ' 的结果：平均周转时间 ' + fmt(f.avgTurn) + '、平均等待时间 ' + fmt(f.avgWait) + ' 个时间单位。' });
      kit.explain('全部完成！本次「' + meta.name + '」：平均周转时间 ' + fmt(f.avgTurn) + '、平均等待时间 ' + fmt(f.avgWait) + '。' + meta.cx + '　试试切换其它算法，或拖动「时间片」「到达时间」「运行时长」「优先级」，让同一群进程换一种活法。');
    } else {
      kit.narrate({ index: i, total: frames.length, text: 't = ' + f.t + '：' + f.notes.join('；') + '。' });
    }
  }

  /* ---------------- 重建 ---------------- */
  function rebuild() {
    frames = computeFrames(state);
    totalT = frames[frames.length - 1].t;
    pb.setTotal(frames.length);
    pb.reset();
  }

  syncEdit();
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
