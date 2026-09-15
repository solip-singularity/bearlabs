/* ============================================================================
 * memptr — 内存与指针显微镜（DemoKit 帧序列模式）
 * 左：栈区（编译器自动分配/回收）  右：堆区（malloc 申请 / free 归还）
 * 三个情景：正确流程 / 内存泄漏 / 野指针（悬空指针），每步旁白解释内存里发生了什么。
 * ==========================================================================*/
DemoKit.register('memptr', function (root, kit) {
  const P = kit.palette;

  const SCEN = [
    { id: 'clean', name: '正确流程：申请 → 使用 → 释放' },
    { id: 'leak', name: '内存泄漏：用了忘还' },
    { id: 'dangling', name: '野指针：还了还在用' },
  ];
  const FINAL_EXPLAIN = {
    clean: '关键分工：栈由编译器自动分配、函数返回时自动整体回收；堆由程序员 malloc 申请、free 归还。free 之后立刻把指针置为 NULL，就不会留下野指针。',
    leak: '泄漏的本质：指向堆内存的最后一根「指针门票」消失了。内存本身没坏，但再也还不回去了。预防：malloc 与 free 严格成对出现；Java、Python 等语言的垃圾回收就是帮你自动做这件事。',
    dangling: '野指针的本质：指针记着的地址还在，但那块内存的所有权已经还给系统，谁再申请到就归谁。预防：free 后立刻 p = NULL，让「还指着」变成「明确不指」，使用前先判断是否为 NULL。',
  };

  const state = { scen: 'clean', n: 4 };
  let frames = [];
  let pb = null;

  const cv = kit.canvas(720, 380);
  cv.canvas.setAttribute('aria-label', '栈与堆内存布局图：左侧是栈区的局部变量，右侧是堆区的内存块，箭头表示指针指向；逐步演示内存的申请、使用、释放、泄漏与野指针的形成过程');

  kit.controlRow();
  kit.select({
    label: '情景',
    options: SCEN.map(function (s) { return { value: s.id, label: s.name }; }),
    value: state.scen,
  }, (v) => { state.scen = v; rebuild(); });
  kit.range({
    label: '申请大小',
    min: 3, max: 8, value: state.n,
    format: (v) => v + ' 个 int',
  }, (v) => { state.n = v; rebuild(); });

  pb = kit.playback({ total: 1, onChange: render });
  kit.legend([
    { color: P.blueWash, label: '栈变量（自动回收）' },
    { color: P.wash, label: '堆块 · 已分配' },
    { color: P.redWash, label: '危险：泄漏 / 被篡改' },
    { color: P.muted, label: '已归还系统' },
  ]);
  kit.explain('左边的「栈」住着局部变量：函数一结束就整体消失。右边的「堆」要靠 malloc 申请、free 归还，忘了还或还了还用，都会出事。指针就是「存着内存地址的变量」，箭头表示它指向谁。');

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------- 帧数据 ---------------- */
  function computeFrames(scen, n) {
    const F = [];
    function push(code, stack, heap, arrows, desc) { F.push({ code: code, stack: stack, heap: heap, arrows: arrows || [], desc: desc }); }
    function sVars(pStatus, pVal, withQ) {
      const st = [{ name: 'x (int)', kind: 'int', val: '42', status: 'ok' }];
      if (pStatus) st.push({ name: 'p (int*)', kind: 'ptr', val: pVal, status: pStatus });
      if (withQ) st.push({ name: 'q (int*)', kind: 'ptr', val: '0x2000', status: 'live' });
      return st;
    }
    function block(status, owner, cells, count, danger, truncated) {
      return { addr: '0x2000', status: status, owner: owner, cells: cells, count: count, danger: !!danger, truncated: !!truncated };
    }
    const empty = () => new Array(n).fill('');
    const seq = () => Array.from({ length: n }, (_, i) => String(i * 10));
    const nines = () => new Array(n).fill('999');

    /* 公共前缀：声明变量 */
    push('// 程序开始运行', [], [], [],
      '程序启动：操作系统为 main 函数在栈上划出一块「栈帧」，这个函数的局部变量都会住在这里。');
    push('int x = 42;', sVars(null), [], [],
      '声明整型变量 x：编译器在栈帧里划出一个格子，放入 42。栈内存自动分配、函数返回时自动回收，完全不用程序员操心。');
    push('int *p;', sVars('uninit', '?'), [], [],
      '声明指针 p：它也是栈上的一个格子，只是里面存的是「地址」。此刻还没赋值，里面是残留的垃圾值——这种指针千万不能直接用。');

    function pushMallocUse() {
      push('p = malloc(' + n + ' * sizeof(int));', sVars('live', '0x2000'),
        [block('alloc', 'p', empty(), n)], [{ from: 'p', to: 0, style: 'live', dy: 0 }],
        'malloc 在堆上申请了一块能放 ' + n + ' 个整数的连续空间，返回首地址 0x2000，存进 p。堆和栈完全不同：它不会自动回收，用完必须由程序员手动 free。');
      push('for (i = 0; i < ' + n + '; i++) p[i] = i * 10;', sVars('live', '0x2000'),
        [block('alloc', 'p', seq(), n)], [{ from: 'p', to: 0, style: 'live', dy: 0 }],
        '通过 p 像数组一样读写这块内存：堆上的数据必须先拿到地址（指针）才能访问。此刻一切正常。');
    }

    if (scen === 'clean') {
      pushMallocUse();
      push('free(p);', sVars('dangling', '0x2000'),
        [block('freed', null, empty(), n)], [{ from: 'p', to: 0, style: 'ghost', dy: 0 }],
        'free(p) 把这块内存还给系统。注意：p 里仍然留着旧地址 0x2000，但内存已经不属于你了——此刻它其实已经是个野指针，所以马上要做下一步。');
      push('p = NULL;', sVars('null', 'NULL'),
        [block('freed', null, empty(), n)], [],
        '把 p 置为 NULL：指针明确地「不指向任何地方」。万一以后误用 *p，程序会立刻崩溃报错——崩溃好过悄悄破坏数据，因为容易排查。');
      push('return 0;', [], [], [],
        '函数结束：栈帧连同 x 和 p 一起自动消失——这就是栈的「自动管理」。堆上的内存早已 free 归还，也干干净净。申请与释放严格配对，就是内存使用的满分答卷。');
    } else if (scen === 'leak') {
      pushMallocUse();
      push('return 0;   /* 糟糕，忘了 free */', [],
        [block('orphan', null, seq(), n)], [],
        '函数结束：栈帧连同里面唯一的指针 p 一起自动消失了。堆上那块内存还好好地占着，但已经没有任何指针记得它的地址——既没法再用，也永远无法 free。这就是「内存泄漏」。');
      push('/* 这个函数被循环调用了 4 次…… */', [],
        [0, 1, 2, 3].map(function (i) {
          return {
            addr: '0x' + (0x2000 + i * 0x400).toString(16).toUpperCase(),
            status: 'orphan', owner: null,
            cells: Array.from({ length: Math.min(n, 4) }, function (_, k) { return String(k * 10); }),
            count: n, danger: false, truncated: true,
          };
        }), [],
        '如果这个函数被循环调用上千次，就会泄漏上千块内存：进程占用的内存越滚越大，越跑越卡，最终可能被系统强制结束。泄漏是最常见的一类内存 bug。');
    } else {
      pushMallocUse();
      push('free(p);   /* 忘了置空 */', sVars('dangling', '0x2000'),
        [block('freed', null, empty(), n)], [{ from: 'p', to: 0, style: 'ghost', dy: -6 }],
        'free(p) 把内存还给系统了，但 p 没有被清空：它仍存着 0x2000。这样的指针叫「悬空指针（野指针）」——地址看起来正常，指向的内存却已经不属于你。');
      push('int *q = malloc(' + n + ' * sizeof(int));', sVars('dangling', '0x2000', true),
        [block('alloc', 'q', empty(), n)],
        [{ from: 'p', to: 0, style: 'ghost', dy: -6 }, { from: 'q', to: 0, style: 'live', dy: 6 }],
        '新的 malloc 很可能刚好拿到刚归还的 0x2000——malloc 喜欢复用刚释放的内存。现在这块内存的合法主人是 q，而 p 还在偷偷指着它。');
      push('*p = 999;   /* 危险！ */', sVars('dangling', '0x2000', true),
        [block('alloc', 'q', nines(), n, true)],
        [{ from: 'p', to: 0, style: 'ghost', dy: -6 }, { from: 'q', to: 0, style: 'live', dy: 6 }],
        '通过悬空指针 p 写入 999，实际篡改的是 q 的数据！这种 bug 常常不会立刻崩溃，而是让别人的数据莫名其妙被改坏——C 程序里最阴险的一类错误。');
      push('p = NULL;   /* 亡羊补牢 */', sVars('null', 'NULL', true),
        [block('alloc', 'q', nines(), n, true)],
        [{ from: 'q', to: 0, style: 'live', dy: 0 }],
        '正确习惯：free 之后立刻把指针置为 NULL。记住三句话：栈自动回收、堆手动释放、free 之后指针立刻置空。');
    }
    return F;
  }

  /* ---------------- 绘制 ---------------- */
  function varBox(st, x, y) {
    const ctx = cv.ctx;
    let fill = P.surface, stroke = P.muted, dash = null, color = P.ink;
    if (st.kind === 'int') { fill = P.blueWash; stroke = P.blue; }
    else if (st.status === 'uninit') { dash = [4, 3]; color = P.muted; }
    else if (st.status === 'live') { fill = P.blueWash; stroke = P.blue; }
    else if (st.status === 'null') { fill = P.wash; stroke = P.muted; color = P.muted; }
    else if (st.status === 'dangling') { fill = P.redWash; stroke = P.red; color = P.red; }
    ctx.save();
    ctx.fillStyle = fill; ctx.strokeStyle = stroke;
    if (dash) ctx.setLineDash(dash);
    roundRect(ctx, x, y, 140, 36, 5); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color; ctx.font = '12px ' + kit.font; ctx.textAlign = 'center';
    ctx.fillText(st.val, x + 70, y + 23);
  }

  function drawArrow(x1, y1, x2, y2, ghost) {
    const ctx = cv.ctx;
    ctx.save();
    ctx.strokeStyle = ghost ? P.muted : P.accent;
    ctx.fillStyle = ghost ? P.muted : P.accent;
    ctx.lineWidth = ghost ? 1.5 : 2;
    if (ghost) ctx.setLineDash([5, 4]);
    const mx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(mx, y1, x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(y2 - y1, x2 - mx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - 8 * Math.cos(ang - 0.45), y2 - 8 * Math.sin(ang - 0.45));
    ctx.lineTo(x2 - 8 * Math.cos(ang + 0.45), y2 - 8 * Math.sin(ang + 0.45));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function render(i) {
    const f = frames[i];
    if (!f) return;
    const ctx = cv.ctx;
    cv.bg(P.bg);

    /* 顶部：当前执行的 C 语句 */
    ctx.fillStyle = P.sandWash; ctx.strokeStyle = P.border;
    roundRect(ctx, 14, 8, 692, 34, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.ink; ctx.font = '13px ' + kit.font; ctx.textAlign = 'left';
    ctx.fillText('C ›  ' + f.code, 26, 31);

    function panel(title, x, y, w, h) {
      ctx.fillStyle = P.surface; ctx.strokeStyle = P.border;
      roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.accentDeep; ctx.font = 'bold 13px ' + kit.font; ctx.textAlign = 'left';
      ctx.fillText(title, x + 14, y + 24);
      ctx.strokeStyle = P.border;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 34); ctx.lineTo(x + w - 10, y + 34); ctx.stroke();
    }
    panel('栈区（Stack）· 函数结束自动回收', 14, 54, 292, 300);
    panel('堆区（Heap）· 只能手动 malloc / free', 322, 54, 384, 300);

    /* 栈变量 */
    f.stack.forEach(function (st, idx) {
      const y = 108 + idx * 52;
      ctx.fillStyle = P.ink; ctx.font = '12px ' + kit.font; ctx.textAlign = 'left';
      ctx.fillText(st.name, 30, y + 23);
      varBox(st, 134, y);
    });

    /* 堆块 */
    f.heap.forEach(function (b, idx) {
      const y = 104 + idx * 58;
      ctx.fillStyle = P.muted; ctx.font = '11px ' + kit.font; ctx.textAlign = 'left';
      ctx.fillText(b.addr, 338, y + 38);
      let statusColor = P.green, statusText = '已分配 · 主人 ' + (b.owner || '?');
      if (b.status === 'freed') { statusColor = P.muted; statusText = '已归还系统'; }
      else if (b.status === 'orphan') { statusColor = P.red; statusText = '失联：再也无法 free'; }
      ctx.fillStyle = statusColor; ctx.textAlign = 'right';
      ctx.fillText(statusText, 692, y + 12);
      const shown = b.truncated ? Math.min(b.cells.length, 4) : b.cells.length;
      for (let k = 0; k < shown; k++) {
        const x = 396 + k * 32;
        let fill = P.wash, stroke = P.green, color = P.ink, dash = null;
        if (b.status === 'freed') { fill = P.surface; stroke = P.muted; color = P.muted; dash = [4, 3]; }
        else if (b.status === 'orphan' || b.danger) { fill = P.redWash; stroke = P.red; color = P.red; }
        ctx.save();
        ctx.fillStyle = fill; ctx.strokeStyle = stroke;
        if (dash) ctx.setLineDash(dash);
        roundRect(ctx, x, y + 20, 30, 32, 4); ctx.fill(); ctx.stroke();
        ctx.restore();
        if (b.cells[k] !== '') {
          ctx.fillStyle = color; ctx.font = '11px ' + kit.font; ctx.textAlign = 'center';
          ctx.fillText(b.cells[k], x + 15, y + 40);
        }
      }
      if (b.truncated) {
        ctx.fillStyle = P.muted; ctx.font = '12px ' + kit.font; ctx.textAlign = 'left';
        ctx.fillText('…共 ' + b.count + ' 个 int', 396 + shown * 32 + 4, y + 40);
      }
    });

    /* 指针箭头 */
    (f.arrows || []).forEach(function (a) {
      const rowIdx = f.stack.findIndex(function (st) { return st.name.indexOf(a.from + ' ') === 0; });
      if (rowIdx < 0 || !f.heap[a.to]) return;
      const sy = 108 + rowIdx * 52 + 18;
      const hy = 104 + a.to * 58 + 36 + (a.dy || 0);
      drawArrow(276, sy, 392, hy, a.style === 'ghost');
    });

    kit.narrate({ index: i, total: frames.length, text: f.desc });
    if (i === frames.length - 1) kit.explain(FINAL_EXPLAIN[state.scen]);
  }

  function rebuild() {
    frames = computeFrames(state.scen, state.n);
    pb.setTotal(frames.length);
    pb.reset();
  }
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
