/* ============================================================================
 * tcp — TCP 连接与拥塞控制实验室（DemoKit 帧序列模式）
 *
 * 三个子模式（kit.select 切换）：
 *   1) 握手与挥手：SYN / SYN+ACK / ACK / FIN 报文步进时序图，每步展示
 *      两端 TCP 状态机切换（CLOSED / LISTEN / SYN_SENT / SYN_RCVD /
 *      ESTABLISHED / FIN_WAIT_1/2 / CLOSE_WAIT / LAST_ACK / TIME_WAIT）。
 *   2) 可靠传输：发送窗口滑动、累计确认；丢包后由「3 个重复确认 → 快速重传」
 *      或「计时器 → 超时重传」补齐，序号逐步推进。
 *   3) 拥塞控制：Reno 的 AIMD——慢启动（每 RTT 翻倍，封顶 ssthresh）、
 *      拥塞避免（每 RTT +1）、丢包后乘性减小（快速重传 → 减半继续；
 *      超时 → 归 1 重新慢启动）。
 *
 * 硬性约束：零依赖；颜色仅取 kit.palette；帧序列 + playback；
 * 每帧 kit.narrate；canvas 带 aria-label。
 * ==========================================================================*/
DemoKit.register('tcp', function (root, kit) {
  'use strict';
  const P = kit.palette;

  /* ---------------- 可调状态 ---------------- */
  const state = {
    mode: 'hs',            // hs | rel | cc
    hsScen: 'handshake',   // handshake | teardown
    relScen: 'data-loss',  // none | data-loss | fast | ack-loss
    win: 4,                // 可靠传输：发送窗口
    initCwnd: 1,           // 拥塞控制：初始 cwnd
    lossPct: 20,           // 拥塞控制：每轮丢包概率 %
    fastRtx: true,         // 拥塞控制：是否启用快速重传
    seed: 20260214,
  };

  let frames = [];
  let pb = null;

  /* ---------------- 画布与绘图小工具 ---------------- */
  const cv = kit.canvas(720, 400);
  cv.canvas.setAttribute('aria-label',
    'TCP 交互演示画布：依次展示三次握手与四次挥手的报文时序与两端状态变化、' +
    '可靠传输的滑动窗口与丢包重传过程、拥塞控制的 cwnd 曲线（慢启动、拥塞避免、乘性减小）');

  function txt(s, x, y, o) {
    o = o || {};
    const c = cv.ctx;
    c.save();
    c.fillStyle = o.color || P.ink;
    c.font = (o.bold ? 'bold ' : '') + (o.size || 12) + 'px ' + kit.font;
    c.textAlign = o.align || 'left';
    if (o.alpha != null) c.globalAlpha = o.alpha;
    c.fillText(s, x, y);
    c.restore();
  }

  function box(x, y, w, h, r, fill, stroke, lw) {
    const c = cv.ctx;
    c.save();
    c.beginPath();
    const rr = Math.min(r, w / 2, h / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.5; c.stroke(); }
    c.restore();
  }

  function arrow(x1, y1, x2, y2, o) {
    o = o || {};
    const c = cv.ctx;
    c.save();
    c.strokeStyle = o.color || P.ink;
    c.fillStyle = o.color || P.ink;
    c.lineWidth = o.width || 1.6;
    if (o.alpha != null) c.globalAlpha = o.alpha;
    if (o.dash) c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.setLineDash([]);
    const dir = x2 >= x1 ? 1 : -1;
    c.beginPath();
    c.moveTo(x2, y2);
    c.lineTo(x2 - dir * 8, y2 - 4);
    c.lineTo(x2 - dir * 8, y2 + 4);
    c.closePath(); c.fill();
    c.restore();
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 控件 ---------------- */
  kit.controlRow();
  const modeSel = kit.select({
    label: '子模式',
    options: [
      { value: 'hs', label: '握手与挥手' },
      { value: 'rel', label: '可靠传输' },
      { value: 'cc', label: '拥塞控制' },
    ],
    value: state.mode,
  }, (v) => { state.mode = v; syncParams(); rebuild(); });
  const hsScenSel = kit.select({
    label: '场景',
    options: [
      { value: 'handshake', label: '三次握手（建立连接）' },
      { value: 'teardown', label: '四次挥手（断开连接）' },
    ],
    value: state.hsScen,
  }, (v) => { state.hsScen = v; rebuild(); });
  const relScenSel = kit.select({
    label: '丢包情景',
    options: [
      { value: 'none', label: '一切顺利（无丢包）' },
      { value: 'data-loss', label: '丢一个包 → 超时重传' },
      { value: 'fast', label: '丢一个包 → 快速重传' },
      { value: 'ack-loss', label: '最后的 ACK 丢失' },
    ],
    value: state.relScen,
  }, (v) => { state.relScen = v; rebuild(); });

  kit.controlRow();
  const winRange = kit.range({
    label: '发送窗口', min: 2, max: 6, value: state.win, format: (v) => v + ' 个',
  }, (v) => { state.win = v; rebuild(); });
  const cwndRange = kit.range({
    label: '初始 cwnd', min: 1, max: 8, value: state.initCwnd,
  }, (v) => { state.initCwnd = v; rebuild(); });
  const lossRange = kit.range({
    label: '每轮丢包概率', min: 0, max: 40, step: 5, value: state.lossPct, format: (v) => v + '%',
  }, (v) => { state.lossPct = v; rebuild(); });
  const fastSel = kit.select({
    label: '快速重传',
    options: [{ value: 'on', label: '开启' }, { value: 'off', label: '关闭' }],
    value: 'on',
  }, (v) => { state.fastRtx = v === 'on'; rebuild(); });
  const rerollBtn = kit.btn('换一次网络', () => {
    state.seed = (state.seed * 1103515245 + 12345) % 2147483648;
    rebuild();
  });
  const statBadge = kit.badge('');

  function show(ctrl, on) { ctrl.el.style.display = on ? '' : 'none'; }
  function syncParams() {
    show(hsScenSel, state.mode === 'hs');
    show(relScenSel, state.mode === 'rel');
    show(winRange, state.mode === 'rel');
    show(cwndRange, state.mode === 'cc');
    show(lossRange, state.mode === 'cc');
    show(fastSel, state.mode === 'cc');
    show(rerollBtn, state.mode === 'cc');
  }

  pb = kit.playback({ total: 1, onChange: render });

  /* ---------------- 图例 / 说明文案 ---------------- */
  const LEGENDS = {
    hs: [
      { color: P.muted, label: '已完成的报文' },
      { color: P.accent, label: '当前这一步' },
      { color: P.green, label: 'ESTABLISHED（就绪）' },
      { color: P.sandInk, label: '等待类状态' },
    ],
    rel: [
      { color: P.sand, label: '已发送，待确认' },
      { color: P.green, label: '已确认 / 已收到' },
      { color: P.blue, label: '数据箭头 / 接收方暂存' },
      { color: P.red, label: '丢失（红叉）' },
    ],
    cc: [
      { color: P.sand, label: '慢启动（每轮翻倍）' },
      { color: P.blue, label: '拥塞避免（每轮 +1）' },
      { color: P.red, label: '丢包' },
      { color: P.sandInk, label: 'ssthresh 阈值（虚线）' },
    ],
  };
  const INTRO_HTML = {
    hs: '<b>TCP 建立连接要「三次握手」，断开要「四次挥手」。</b>下面的时序图会一步步展示每个报文（SYN / ACK / FIN）与两端状态（SYN_SENT、ESTABLISHED、TIME_WAIT…）的切换，旁白解释每一步为什么这样设计。可用「场景」下拉框切换建立 / 断开。',
    rel: '<b>可靠传输靠「序号 + 确认 + 滑动窗口」。</b>窗口里的包可以连续发出，确认到达后窗口向右滑动；一旦丢包，由快速重传（3 个重复确认）或超时重传补齐。选一种丢包情景、调窗口大小，看发送方如何应对。',
    cc: '<b>拥塞窗口 cwnd 是发送方的「油门」。</b>慢启动时每轮翻倍，达到阈值 ssthresh 后每轮只加 1；一旦丢包立刻踩刹车。这就是 Reno 的 AIMD（加性增、乘性减）。调整参数，看曲线怎么变。',
  };
  const DONE_HTML = {
    hs: () => (state.hsScen === 'handshake'
      ? '<b>三次握手完成！</b>SYN → SYN+ACK → ACK：服务端把自己的 SYN 和确认捎在同一个报文里，所以三次就够。少了无法确认双向连通，多了纯属浪费。'
      : '<b>四次挥手完成！</b>TCP 是全双工，两个方向要分别关闭：被动方先 ACK（可能还有数据要发），说完再发自己的 FIN。TIME_WAIT 等 2MSL，是为了补救可能丢失的最后一个 ACK，并让旧报文自然消亡。'),
    rel: () => '<b>传输完成！</b>可靠传输四件套：序号定位、累计确认、滑动窗口限流、丢包重传。快速重传抢在超时之前行动，超时则是最后的兜底。换一种丢包情景或调整窗口大小，再试一次。',
    cc: () => '<b>这条锯齿曲线就是 TCP 的「呼吸」。</b>慢启动翻倍 → 拥塞避免 +1 → 丢包立刻乘性减小：开着快速重传时减半后继续（温和的 AIMD 锯齿），关掉后每次超时都打回 1 重新慢启动，吞吐量天差地别。',
  };

  function setLegend(items) {
    const old = kit.stage.querySelectorAll('.dk-legend');
    for (let i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    kit.legend(items);
  }

  /* ================= 模式一：握手与挥手 ================= */
  let hsMsgs = [];

  function computeHSFrames(scen) {
    const steps = scen === 'handshake' ? [
      { C: 'CLOSED', S: 'LISTEN',
        desc: '一切开始前：客户端处于 CLOSED（连接还没打开）；服务端已经启动，处于 LISTEN（监听）状态，正等着有人来敲门。' },
      { C: 'SYN_SENT', S: 'LISTEN', from: 'C', label: '第 1 次握手 · SYN，seq=100',
        desc: '第 1 次握手：客户端发出 SYN 报文（seq=100），意思是「我想建立连接」。发完后客户端进入 SYN_SENT（已发出，等待对方回应）。' },
      { C: 'SYN_SENT', S: 'SYN_RCVD', from: 'S', label: '第 2 次握手 · SYN+ACK，seq=200，ack=101',
        desc: '第 2 次握手：服务端收到 SYN，回答一个 SYN+ACK——「同意连接（SYN，seq=200），你刚才的话我收到了（ack=101，请从 101 继续发）」。服务端进入 SYN_RCVD。' },
      { C: 'ESTABLISHED', S: 'SYN_RCVD', from: 'C', label: '第 3 次握手 · ACK，ack=201',
        desc: '第 3 次握手：客户端收到 SYN+ACK，回最后一条 ACK（ack=201，表示「你的 200 我收到了」）。客户端随即进入 ESTABLISHED——它这边已经就绪。' },
      { C: 'ESTABLISHED', S: 'ESTABLISHED', from: 'C', label: '第 3 次握手 · ACK，ack=201', recv: true,
        desc: '服务端收到那条 ACK，也进入 ESTABLISHED。三次握手完成：双方都确认了「自己和对方都能收、能发」，可以正式传数据了。' },
      { C: 'ESTABLISHED', S: 'ESTABLISHED', final: true,
        desc: '为什么必须三次、两次不行？关键在第三次：服务端只有等到最后的 ACK，才能确定「客户端能收到我的消息」。三次恰好让双向通道都得到验证，是可靠通信的最小次数。' },
    ] : [
      { C: 'ESTABLISHED', S: 'ESTABLISHED',
        desc: '连接建立后双方都在通信。现在客户端的数据发完了，想断开连接。注意：TCP 是全双工（两个方向各自独立），所以两个方向要分别关上。' },
      { C: 'FIN_WAIT_1', S: 'ESTABLISHED', from: 'C', label: '第 1 次挥手 · FIN，seq=500',
        desc: '第 1 次挥手：客户端发出 FIN（seq=500），意思是「我说完了」。发完进入 FIN_WAIT_1，等对方确认。' },
      { C: 'FIN_WAIT_1', S: 'CLOSE_WAIT', from: 'S', label: '第 2 次挥手 · ACK，ack=501',
        desc: '第 2 次挥手：服务端回 ACK（ack=501）「知道了」。但服务端可能还有没发完的数据，所以只确认、不急着关——这个状态叫 CLOSE_WAIT（半关闭：客户端到服务端的方向已经关了）。' },
      { C: 'FIN_WAIT_2', S: 'CLOSE_WAIT', from: 'S', label: '第 2 次挥手 · ACK，ack=501', recv: true,
        desc: '客户端收到 ACK，进入 FIN_WAIT_2：自己不再发数据，安静等服务端把剩下的话说完。' },
      { C: 'FIN_WAIT_2', S: 'LAST_ACK', from: 'S', label: '第 3 次挥手 · FIN，seq=300',
        desc: '第 3 次挥手：服务端的数据也发完了，发出自己的 FIN（seq=300），进入 LAST_ACK——这是它最后一次确认关闭。' },
      { C: 'TIME_WAIT', S: 'LAST_ACK', from: 'C', label: '第 4 次挥手 · ACK，ack=301',
        desc: '第 4 次挥手：客户端收到 FIN，回最后一条 ACK（ack=301），随后进入 TIME_WAIT——它不会立刻关门，要等上 2MSL（报文最大生存时间的两倍，通常 1～4 分钟）。' },
      { C: 'TIME_WAIT', S: 'CLOSED', from: 'C', label: '第 4 次挥手 · ACK，ack=301', recv: true,
        desc: '服务端收到 ACK，LAST_ACK → CLOSED，服务端这边正式关闭。' },
      { C: 'TIME_WAIT', S: 'CLOSED', wait: true,
        desc: '客户端还在 TIME_WAIT 里等待 2MSL。为什么要等？万一最后那条 ACK 丢了，服务端重发的 FIN 还能被回应；同时让本连接的旧报文在网络里自然消亡，不会干扰之后的新连接。' },
      { C: 'CLOSED', S: 'CLOSED', final: true,
        desc: '等满 2MSL 后客户端也进入 CLOSED，连接彻底消失。为什么挥手要四次、握手只要三次？因为建立时服务端可以把 SYN 和 ACK 捎在同一个报文里；而关闭时被动方收到 FIN 后可能还有数据要发，ACK 和 FIN 必须分开，各占一步。' },
    ];
    let mi = 0;
    hsMsgs = [];
    return steps.map((s, i) => {
      const o = {
        kind: 'hs', idx: i,
        states: { C: s.C, S: s.S },
        msgIdx: -1, recvAt: null,
        wait: !!s.wait, final: !!s.final,
        desc: s.desc,
      };
      if (s.from) {
        if (!s.recv) {
          o.msgIdx = mi;
          hsMsgs[mi] = { from: s.from, label: s.label };
          mi++;
        } else {
          o.msgIdx = mi - 1;
          o.recvAt = s.from === 'C' ? 'S' : 'C';
        }
      }
      return o;
    });
  }

  const HS_ST_COLOR = {
    CLOSED: P.muted, LISTEN: P.blue, SYN_SENT: P.sandInk, SYN_RCVD: P.sandInk,
    ESTABLISHED: P.green, FIN_WAIT_1: P.sandInk, FIN_WAIT_2: P.sandInk,
    CLOSE_WAIT: P.sandInk, LAST_ACK: P.sandInk, TIME_WAIT: P.sandInk,
  };

  function drawHost(name, st, x, changed) {
    box(x, 12, 160, 56, 8, changed ? P.wash : P.surface, changed ? P.accent : P.border, changed ? 2 : 1.4);
    txt(name, x + 80, 34, { align: 'center', size: 14, bold: true });
    txt(st, x + 80, 54, { align: 'center', size: 13, bold: !!changed, color: HS_ST_COLOR[st] || P.ink });
  }

  function renderHS(f, i) {
    const W = cv.width, H = cv.height, c = cv.ctx;
    cv.bg(P.bg);
    const lx = { C: 140, S: 580 };
    const prev = i > 0 ? frames[i - 1] : null;
    drawHost('客户端', f.states.C, 60, !prev || prev.states.C !== f.states.C);
    drawHost('服务端', f.states.S, 500, !prev || prev.states.S !== f.states.S);
    c.save();
    c.strokeStyle = P.border; c.lineWidth = 1.4; c.setLineDash([4, 5]);
    [lx.C, lx.S].forEach((x) => { c.beginPath(); c.moveTo(x, 74); c.lineTo(x, H - 52); c.stroke(); });
    c.restore();

    let maxRow = -1;
    for (let j = 0; j <= i; j++) if (frames[j].msgIdx > maxRow) maxRow = frames[j].msgIdx;
    const yOf = (r) => 112 + r * 40;
    for (let r = 0; r <= maxRow; r++) {
      const m = hsMsgs[r];
      const cur = !f.wait && !f.final && f.msgIdx === r;
      const y = yOf(r);
      const o = { color: cur ? P.accent : P.muted, width: cur ? 2.4 : 1.5, alpha: cur ? 1 : 0.65 };
      if (m.from === 'C') arrow(lx.C + 8, y, lx.S - 8, y, o);
      else arrow(lx.S - 8, y, lx.C + 8, y, o);
      txt(m.label, 360, y - 8, { align: 'center', size: 12, bold: cur, color: cur ? P.ink : P.muted });
      if (cur && f.recvAt) {
        c.save(); c.fillStyle = P.accent;
        c.beginPath(); c.arc(lx[f.recvAt], y, 4.5, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }
    if (f.wait) {
      txt('TIME_WAIT：等待 2MSL（约 1～4 分钟）…', lx.C + 12, yOf(maxRow) + 36, { size: 12, bold: true, color: P.sandInk });
    }
    if (f.final) {
      const msg = state.hsScen === 'handshake'
        ? '连接建立完成：双方均为 ESTABLISHED，可以传数据了'
        : '连接完全关闭：双方均回到 CLOSED，端口资源已释放';
      box(170, H - 58, 380, 34, 8, P.wash, P.accent, 1.5);
      txt(msg, 360, H - 36, { align: 'center', size: 13, bold: true, color: P.accentDeep });
    }
  }

  /* ================= 模式二：可靠传输 ================= */
  function computeRelFrames(s) {
    const N = 10, W = s.win, TIMEOUT = 8;
    const out = [];
    const status = new Array(N + 1).fill('unsent'); // unsent | inflight | acked | lost
    const received = {};
    let base = 1, next = 1, expect = 1, dupCount = 0, rtxTotal = 0;
    const rtxGen = new Array(N + 1).fill(0);   // 每个包第几次发送
    const timerTok = new Array(N + 1).fill(0); // 计时器令牌（旧超时事件作废用）
    const retransmitted = {};
    const arrows = [];
    let t = 0, order = 0, guard = 0;
    const pending = [];
    const useFast = s.relScen === 'fast';
    const lostDataSeq = (s.relScen === 'data-loss' || s.relScen === 'fast') ? 3 : 0;
    const lostAckFor = s.relScen === 'ack-loss' ? N : 0; // 最后一个数据包的 ACK 丢失

    function countAcked() {
      let n = 0;
      for (let k = 1; k <= N; k++) if (status[k] === 'acked') n++;
      return n;
    }
    function snap(desc, hl) {
      const start = Math.max(0, arrows.length - 6);
      out.push({
        kind: 'rel',
        status: status.slice(),
        base, next, expect,
        received: Object.keys(received).map(Number),
        arrows: arrows.slice(start).map((a, k) => Object.assign({ i: start + k }, a)),
        hl: hl == null ? -1 : hl,
        acked: countAcked(), dups: dupCount, rtxTotal,
        desc,
      });
    }
    function sched(t2, type, pl) { pending.push({ t: t2, type, pl, o: order++ }); }

    function doSend(seq, isRtx) {
      status[seq] = 'inflight';
      rtxGen[seq]++;
      timerTok[seq]++;
      if (isRtx) rtxTotal++;
      sched(t + 1, 'ARRIVE', { seq, isRtx, gen: rtxGen[seq] });
      sched(t + TIMEOUT, 'TIMEOUT', { seq, gen: rtxGen[seq], tok: timerTok[seq] });
      arrows.push({ dir: 'LR', label: (isRtx ? '重传 包 ' : '发送 包 ') + seq, kind: isRtx ? 'rtx' : 'data' });
      if (!isRtx) {
        snap('发送方发出包 ' + seq + '。窗口（' + base + '–' + Math.min(base + W - 1, N) + '）内的包可以连续发送，不必发一个等一个。', arrows.length - 1);
      }
      // 重传的旁白由触发方（超时 / 快速重传帧）给出
    }
    function retransmit(seq) { doSend(seq, true); }

    function sendNew() {
      while (next < base + W && next <= N) { doSend(next, false); next++; }
    }

    function doArrive(ev) {
      const seq = ev.pl.seq, isRtx = ev.pl.isRtx;
      if (ev.pl.gen !== rtxGen[seq]) return; // 过期的旧传输
      if (!isRtx && seq === lostDataSeq) {
        status[seq] = 'lost';
        arrows.push({ dir: 'LR', label: '包 ' + seq, kind: 'data', lost: true });
        snap('包 ' + seq + ' 在网络中丢了！接收方毫无察觉，发送方也还蒙在鼓里——它只能靠「重复确认」或「超时」来发现问题。', arrows.length - 1);
        return;
      }
      const dup = !!received[seq];
      const before = expect;
      received[seq] = true;
      while (received[expect]) expect++;
      const ackNum = expect;
      const ackLost = !dup && seq === lostAckFor && rtxGen[seq] === 1;
      arrows.push({ dir: 'LR', label: '包 ' + seq + (dup ? '（重复）' : ''), kind: 'data' });
      arrows.push({ dir: 'RL', label: 'ACK ' + ackNum, kind: 'ack', lost: ackLost });
      let d;
      if (ackLost) {
        d = '包 ' + seq + ' 到达，接收方回 ACK ' + ackNum + '——可是它在返程中也丢了！发送方等不到确认，最终只能靠超时兜底。';
      } else if (seq < before) {
        d = '包 ' + seq + ' 其实早就到过（当时是它的确认丢了）。接收方丢弃重复数据，再补一条 ACK ' + ackNum + '，发送方收到就能继续。';
      } else if (seq > before) {
        d = '包 ' + seq + ' 先到了，可它前面的包还没到——接收方先把它暂存（接收条上的蓝色格），再回重复确认 ACK ' + ackNum + '，反复「催」缺的那个包。';
      } else if (ackNum - seq > 1) {
        d = '包 ' + seq + ' 到达，正好补上缺口！接收方把暂存的包一起交付，回 ACK ' + ackNum + '（累计确认一口气确认了多个包）。';
      } else {
        d = '包 ' + seq + ' 到达，正是接收方等待的序号！接收方回 ACK ' + ackNum + '：「' + seq + ' 之前的我都收到了，请从 ' + ackNum + ' 继续」。';
      }
      snap(d, arrows.length - 1);
      sched(t + 1, 'ACK_ARRIVE', { ack: ackNum, lost: ackLost });
    }

    function doAck(ev) {
      const ack = ev.pl.ack;
      if (ev.pl.lost) {
        arrows.push({ dir: 'RL', label: 'ACK ' + ack, kind: 'ack', lost: true });
        snap('ACK ' + ack + ' 在返程中丢了。发送方收不到它，窗口被卡住——如果没有后续确认来补救，就只能等超时重传。', arrows.length - 1);
        return;
      }
      arrows.push({ dir: 'RL', label: 'ACK ' + ack, kind: 'ack' });
      const ackIdx = arrows.length - 1;
      let d;
      if (ack > base) {
        const oldBase = base;
        base = ack;
        for (let k = oldBase; k < ack; k++) status[k] = 'acked';
        dupCount = 0;
        d = 'ACK ' + ack + ' 到达：包 ' + oldBase + (ack - 1 > oldBase ? '–' + (ack - 1) : '') + ' 一并确认（累计确认），窗口右移到 ' + base + '–' + Math.min(base + W - 1, N) + '，空出的位置马上用来发新包。';
        sendNew();
        snap(d, ackIdx);
      } else {
        dupCount++;
        d = '收到重复确认 ACK ' + ack + '（第 ' + dupCount + ' 次）：接收方在催包 ' + base + '。窗口被未确认的包占满，发不了新包，只能等。';
        let trig = false;
        if (useFast && dupCount >= 3 && !retransmitted[base] && base <= N) {
          retransmitted[base] = true;
          trig = true;
          d += '攒满 3 个——触发快速重传：不等超时，立刻重发包 ' + base + '！';
          retransmit(base);
        }
        snap(d, trig ? arrows.length - 1 : ackIdx);
      }
    }

    function doTimeout(ev) {
      const seq = ev.pl.seq;
      if (ev.pl.gen !== rtxGen[seq] || ev.pl.tok !== timerTok[seq] || status[seq] === 'acked') return;
      retransmit(seq);
      // 超时后重置其余在途包的计时器（RTO 重启）
      for (let k = 1; k <= N; k++) {
        if (k !== seq && status[k] === 'inflight') {
          timerTok[k]++;
          sched(t + TIMEOUT, 'TIMEOUT', { seq: k, gen: rtxGen[k], tok: timerTok[k] });
        }
      }
      let d = '迟迟等不到包 ' + seq + ' 的确认——超时了！发送方把包 ' + seq + ' 重发一遍，并重置计时器。';
      if (s.relScen === 'data-loss' && dupCount > 0) {
        d += '（本情景演示「不开快速重传」的传统做法：即使重复确认已经出现，也要等计时器超时才行动。）';
      }
      if (s.relScen === 'fast' && dupCount < 3) {
        d += '（重复确认只有 ' + dupCount + ' 个，攒不满 3 个，快速重传无法触发——窗口太小时就会退化成超时重传。）';
      }
      snap(d, arrows.length - 1);
    }

    // 主循环
    snap('发送方要送 ' + N + ' 个数据包（编号 1–' + N + '），发送窗口 = ' + W + '：最多允许 ' + W + ' 个包同时「在路上」等确认。下面一步步看窗口如何滑动、丢了怎么补。');
    sendNew();
    while (pending.length && base <= N && guard++ < 900) {
      pending.sort((a, b) => a.t - b.t || a.o - b.o);
      const ev = pending.shift();
      t = Math.max(t, ev.t);
      if (ev.type === 'ARRIVE') doArrive(ev);
      else if (ev.type === 'ACK_ARRIVE') doAck(ev);
      else doTimeout(ev);
    }
    snap('全部 ' + N + ' 个包确认完毕（ACK ' + (N + 1) + '）！这一局共重传 ' + rtxTotal + ' 次。可靠传输的秘密：序号定位 + 累计确认 + 滑动窗口限流 + 丢包后重传。');
    return out;
  }

  const REL_ST_TXT = { inflight: '待确认', acked: '已确认', lost: '丢失' };

  function renderRel(f) {
    const W = cv.width, H = cv.height, c = cv.ctx;
    cv.bg(P.bg);
    const N = 10, Wn = state.win;
    const slotW = 58, gap = 8;
    const sx0 = (W - (N * slotW + (N - 1) * gap)) / 2;
    const slotX = (k) => sx0 + (k - 1) * (slotW + gap);

    // 发送窗口括弧
    const lo = f.base, hi = Math.min(f.base + Wn - 1, N);
    const bx1 = slotX(lo), bx2 = slotX(hi) + slotW;
    c.save();
    c.strokeStyle = P.accentDeep; c.lineWidth = 2;
    c.beginPath();
    c.moveTo(bx1, 27); c.lineTo(bx1, 21); c.lineTo(bx2, 21); c.lineTo(bx2, 27);
    c.stroke();
    c.restore();
    txt('发送窗口 ' + lo + '–' + hi + '（最多 ' + Wn + ' 个未确认）', (bx1 + bx2) / 2, 15, { align: 'center', size: 11.5, bold: true, color: P.accentDeep });

    // 发送方条带
    for (let k = 1; k <= N; k++) {
      const st = f.status[k];
      const x = slotX(k);
      if (st === 'unsent') {
        box(x, 30, slotW, 44, 6, P.surface, P.border, 1.4);
        txt('包 ' + k, x + slotW / 2, 55, { align: 'center', size: 12, color: P.muted });
      } else {
        const fill = st === 'acked' ? P.green : st === 'inflight' ? P.sand : P.red;
        box(x, 30, slotW, 44, 6, fill, fill, 1.2);
        txt('包 ' + k, x + slotW / 2, 48, { align: 'center', size: 12, bold: true, color: st === 'inflight' ? P.ink : P.surface });
        txt(REL_ST_TXT[st], x + slotW / 2, 64, { align: 'center', size: 9.5, color: st === 'inflight' ? P.ink : P.surface });
      }
    }
    txt('下一个要发送：' + (f.next > N ? '（10 个已全部发出）' : '包 ' + f.next) + ' ｜ 当前重复确认：' + f.dups + ' 个 ｜ 累计重传：' + f.rtxTotal + ' 次', sx0, 92, { size: 11.5, color: P.muted });

    // 报文流
    const fx = { A: 120, B: 600 };
    box(50, 102, 140, 32, 6, P.blueWash, P.blue, 1.4);
    txt('发送方', 120, 123, { align: 'center', size: 13, bold: true });
    box(530, 102, 140, 32, 6, P.blueWash, P.blue, 1.4);
    txt('接收方', 600, 123, { align: 'center', size: 13, bold: true });
    c.save();
    c.strokeStyle = P.border; c.setLineDash([4, 5]); c.lineWidth = 1.4;
    [fx.A, fx.B].forEach((x) => { c.beginPath(); c.moveTo(x, 134); c.lineTo(x, 302); c.stroke(); });
    c.restore();
    const ay0 = 162, ady = 24;
    f.arrows.forEach((a, k) => {
      const y = ay0 + k * ady;
      const cur = f.hl === a.i;
      const col = a.lost ? P.red : a.kind === 'ack' ? P.green : P.blue;
      const o = { color: col, width: cur ? 2.4 : 1.6, dash: !!a.lost };
      if (a.dir === 'LR') arrow(fx.A + 6, y, fx.B - 6, y, o);
      else arrow(fx.B - 6, y, fx.A + 6, y, o);
      txt(a.label, (fx.A + fx.B) / 2, y - 6, { align: 'center', size: 10.5, bold: cur, color: a.lost ? P.red : cur ? P.ink : P.muted });
      if (a.lost) {
        const mid = (fx.A + fx.B) / 2;
        c.save(); c.strokeStyle = P.red; c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(mid - 6, y + 3); c.lineTo(mid + 6, y + 15);
        c.moveTo(mid + 6, y + 3); c.lineTo(mid - 6, y + 15);
        c.stroke(); c.restore();
      }
    });

    // 接收方条带
    txt('接收方收到的包：', sx0, 318, { size: 11.5, color: P.muted });
    const recvSet = {};
    f.received.forEach((k) => { recvSet[k] = true; });
    for (let k = 1; k <= N; k++) {
      const x = slotX(k);
      const got = !!recvSet[k];
      const inorder = got && k < f.expect;
      const fill = inorder ? P.green : got ? P.blue : P.surface;
      box(x, 324, slotW, 38, 6, fill, got ? fill : P.border, 1.4);
      txt(String(k), x + slotW / 2, 348, { align: 'center', size: 12, bold: got, color: got ? P.surface : P.muted });
    }
    const ex = slotX(Math.min(f.expect, N)) + slotW / 2;
    c.save(); c.fillStyle = P.accent;
    c.beginPath(); c.moveTo(ex, 366); c.lineTo(ex - 5, 376); c.lineTo(ex + 5, 376); c.closePath(); c.fill();
    c.restore();
    txt('等待包 ' + f.expect + (f.expect > N ? '（全部到齐）' : ''), ex, 390, { align: 'center', size: 11, bold: true, color: P.accentDeep });
  }

  /* ================= 模式三：拥塞控制（Reno AIMD） ================= */
  function computeCCFrames(s) {
    const ROUNDS = 24, MAXCW = 32;
    const rnd = mulberry32(s.seed);
    const p = s.lossPct / 100;
    let cwnd = Math.max(1, s.initCwnd);
    let ssthresh = 16;
    const rounds = [];
    const out = [];
    function snap(desc, i) {
      out.push({ kind: 'cc', rounds: rounds.slice(), idx: i, cwnd, ssthresh, desc });
    }
    rounds.push({ cwnd, sst: ssthresh, phase: '初始', loss: false, lossType: null, lossFrom: 0 });
    snap('网络刚接通：拥塞窗口 cwnd = ' + cwnd + '（最初只敢发 ' + cwnd + ' 个报文段），慢启动阈值 ssthresh = 16。发送方开始小心地探测网络的承受能力。', 0);
    for (let r = 1; r <= ROUNDS; r++) {
      const prev = cwnd;
      const loss = rnd() < p;
      let phase, lossType = null;
      if (loss) {
        lossType = s.fastRtx ? 'fast' : 'timeout';
        ssthresh = Math.max(1, Math.floor(prev / 2));
        cwnd = lossType === 'timeout' ? 1 : ssthresh;
        phase = lossType === 'timeout' ? '超时' : '乘性减小';
      } else if (cwnd < ssthresh) {
        cwnd = Math.min(cwnd * 2, ssthresh, MAXCW);
        phase = '慢启动';
      } else {
        cwnd = Math.min(cwnd + 1, MAXCW);
        phase = '拥塞避免';
      }
      rounds.push({ cwnd, sst: ssthresh, phase, loss: true, lossType, lossFrom: prev });
      let d;
      if (loss && lossType === 'fast') {
        d = '第 ' + r + ' 轮：丢包！收到 3 个重复确认 → 快速重传，随后乘性减小：ssthresh = ' + prev + ' ÷ 2 ≈ ' + ssthresh + '，cwnd 从 ' + prev + ' 降到 ' + cwnd + '。这就是 AIMD 里的「乘性减」。';
      } else if (loss) {
        d = '第 ' + r + ' 轮：丢包且只能等超时（未开快速重传）！ssthresh 降为 ' + prev + ' ÷ 2 ≈ ' + ssthresh + '，cwnd 直接打回 1，从零开始慢启动——代价非常惨痛。';
      } else if (phase === '慢启动') {
        d = '第 ' + r + ' 轮：一切顺利，cwnd ' + prev + ' → ' + cwnd + '（慢启动：每过一个 RTT 就翻倍，指数级增长，尽快找到可用带宽）。';
        if (cwnd === ssthresh && prev < ssthresh) d += ' 已达阈值 ssthresh = ' + ssthresh + '，下一轮起转入拥塞避免。';
      } else {
        d = '第 ' + r + ' 轮：一切顺利，cwnd ' + prev + ' → ' + cwnd + '（拥塞避免：过了阈值后每轮只加 1，线性爬升，避免把网络压垮）。';
        if (cwnd === MAXCW && prev < MAXCW) d += '（已达演示上限 ' + MAXCW + '）';
      }
      snap(d, r);
    }
    return out;
  }

  function renderCC(f) {
    const W = cv.width, H = cv.height, c = cv.ctx;
    cv.bg(P.bg);
    const x0 = 58, x1 = 690, y0 = 332, y1 = 44;
    const ROUNDS = 24, yMax = 34;
    const X = (r) => x0 + ((x1 - x0) * r) / ROUNDS;
    const Y = (v) => y0 - ((y0 - y1) * v) / yMax;
    // 网格与刻度
    c.save();
    c.strokeStyle = P.border; c.lineWidth = 1;
    for (let v = 5; v <= 30; v += 5) {
      c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke();
    }
    c.restore();
    for (let v = 5; v <= 30; v += 5) txt(String(v), x0 - 10, Y(v) + 4, { align: 'right', size: 11, color: P.muted });
    for (let r = 0; r <= ROUNDS; r += 4) txt(String(r), X(r), y0 + 16, { align: 'center', size: 11, color: P.muted });
    c.save();
    c.strokeStyle = P.muted; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x0, y1 - 8); c.lineTo(x0, y0); c.lineTo(x1 + 6, y0); c.stroke();
    c.restore();
    txt('cwnd（拥塞窗口：这一轮最多能发多少数据）', x0 + 8, y1 - 16, { size: 12, bold: true });
    txt('RTT 轮次', x1, y0 + 30, { align: 'right', size: 12, color: P.muted });

    const rs = f.rounds;
    // ssthresh 阶梯虚线
    c.save();
    c.strokeStyle = P.sandInk; c.lineWidth = 1.6; c.setLineDash([6, 4]);
    c.beginPath();
    c.moveTo(X(0), Y(rs[0].sst));
    if (f.idx === 0) c.lineTo(X(1), Y(rs[0].sst));
    for (let i2 = 1; i2 <= f.idx; i2++) {
      c.lineTo(X(i2), Y(rs[i2 - 1].sst));
      if (rs[i2].sst !== rs[i2 - 1].sst) c.lineTo(X(i2), Y(rs[i2].sst));
    }
    c.stroke();
    c.setLineDash([]);
    c.restore();
    txt('ssthresh = ' + rs[f.idx].sst, Math.min(X(f.idx) + 8, x1 - 90), Y(rs[f.idx].sst) - 6, { size: 11, bold: true, color: P.sandInk });

    // cwnd 曲线（按阶段着色）
    for (let i2 = 1; i2 <= f.idx; i2++) {
      const seg = rs[i2];
      const col = seg.loss ? P.red : seg.phase === '慢启动' ? P.sand : P.blue;
      c.save();
      c.strokeStyle = col; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(X(i2 - 1), Y(rs[i2 - 1].cwnd)); c.lineTo(X(i2), Y(seg.cwnd)); c.stroke();
      c.fillStyle = col;
      c.beginPath(); c.arc(X(i2), Y(seg.cwnd), 3, 0, Math.PI * 2); c.fill();
      c.restore();
      if (seg.loss) {
        c.save(); c.strokeStyle = P.red; c.lineWidth = 2;
        const mx = X(i2), my = Y(seg.lossFrom);
        c.beginPath();
        c.moveTo(mx - 5, my - 5); c.lineTo(mx + 5, my + 5);
        c.moveTo(mx + 5, my - 5); c.lineTo(mx - 5, my + 5);
        c.stroke(); c.restore();
      }
    }
    c.save(); c.fillStyle = P.ink;
    c.beginPath(); c.arc(X(0), Y(rs[0].cwnd), 3, 0, Math.PI * 2); c.fill();
    c.restore();
    c.save();
    c.fillStyle = P.accent; c.strokeStyle = P.surface; c.lineWidth = 2;
    c.beginPath(); c.arc(X(f.idx), Y(rs[f.idx].cwnd), 5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
    txt('第 ' + f.idx + ' 轮 RTT ｜ cwnd = ' + f.cwnd + ' ｜ ssthresh = ' + f.ssthresh + ' ｜ 阶段：' + rs[f.idx].phase, x0, 22, { size: 13, bold: true });
  }

  /* ---------------- 渲染调度 ---------------- */
  function badgeFor(f) {
    if (f.kind === 'hs') return '客户端 ' + f.states.C + ' ｜ 服务端 ' + f.states.S;
    if (f.kind === 'rel') return '已确认 ' + f.acked + ' / 10';
    return 'cwnd = ' + f.cwnd + ' ｜ ssthresh = ' + f.ssthresh;
  }

  function render(i) {
    const f = frames[i];
    if (!f) return;
    if (f.kind === 'hs') renderHS(f, i);
    else if (f.kind === 'rel') renderRel(f);
    else renderCC(f);
    kit.narrate({ index: i, total: frames.length, text: f.desc });
    statBadge.set(badgeFor(f));
    if (i === frames.length - 1) {
      const dn = DONE_HTML[state.mode];
      kit.explain(typeof dn === 'function' ? dn() : dn);
    }
  }

  function rebuild() {
    if (state.mode === 'hs') frames = computeHSFrames(state.hsScen);
    else if (state.mode === 'rel') frames = computeRelFrames(state);
    else frames = computeCCFrames(state);
    setLegend(LEGENDS[state.mode]);
    kit.explain(INTRO_HTML[state.mode]);
    pb.setTotal(frames.length);
    pb.reset();
  }

  syncParams();
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
