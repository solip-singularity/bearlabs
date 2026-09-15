/* ============================================================================
 * demos/compile-flow.js — 编译器流水线之旅
 * 两个示例程序，逐站走过：词法 → 语法 → 语义 → 三地址码 → 优化 → 目标代码。
 * 可调参数：① 示例切换；② 注解显示（简洁 / 带注解）。
 * ==========================================================================*/
(function () {
  'use strict';
  DemoKit.register('compile-flow', function (shell, kit) {
    const P = kit.palette;
    const cv = kit.canvas(760, 350);
    const g = cv.ctx;
    cv.canvas.setAttribute('aria-label', '编译器流水线示意：从源码到目标代码的六个阶段');

    /* ---------- 绘图小工具 ---------- */
    function font(size, weight) { g.font = (weight || 500) + ' ' + size + 'px ' + kit.font; }
    function text(s, x, y, color, size, align, weight) { font(size || 13, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function mono(s, x, y, color, size, align, weight) { font(size || 13, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function rrect(x, y, w, h, r, fill, stroke, lw) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.4; g.stroke(); }
    }
    function line(x1, y1, x2, y2, color, width) { g.strokeStyle = color; g.lineWidth = width || 1.7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }

    const STAGES = ['词法分析', '语法分析', '语义检查', '三地址码', '代码优化', '目标代码'];

    /* ---------- 两个示例程序的各阶段产物（手工核验） ---------- */
    const EXAMPLES = {
      e1: {
        label: '示例一：x + 1 * 2',
        source: 'x + 1 * 2',
        tokens: [ ['x', '标识符'], ['+', '运算符'], ['1', '数字'], ['*', '运算符'], ['2', '数字'] ],
        tree: {
          nodes: [ ['+', 380, 66], ['x', 285, 148], ['*', 475, 148], ['1', 425, 232], ['2', 528, 232] ],
          edges: [ [0, 1], [0, 2], [2, 3], [2, 4] ],
        },
        sem: { symbols: ['x : int（已在源码中声明）'], checks: ['表达式类型：int + ( int * int ) → int ✓', '所有标识符都已在符号表中 ✓'] },
        ir: ['t1 = 1 * 2', 't2 = x + t1'],
        irNote: '每条指令最多一个运算，用临时变量串联。',
        opt: ['t2 = x + 2'],
        optNotes: ['常量折叠：1 * 2 在编译期直接算成 2', '中间变量 t1 被省掉'],
        asm: ['LOAD  R1, x', 'ADD   R1, 2', 'STORE result, R1'],
        asmNote: '把结果写回内存中 result 的位置。',
        narr: [
          '字符流被切成一个个有意义的「单词」（Token）：标识符、运算符、数字——像先把句子拆成词。',
          '按语法规则把单词组织成一棵树：乘法在更深的枝上，会先于加法计算——运算优先级变成了树形结构。',
          '语义检查：查符号表确认 x 真的存在；再做类型检查——int 与 int 运算，结果还是 int ✓。',
          '翻译成三地址码：每条指令最多做一个运算，用临时变量 t1、t2 把步骤串起来。',
          '优化出手：1 * 2 是常量，编译期直接折叠成 2；不改变语义，但少算一步。',
          '目标代码：把中间代码翻译成（简化的）汇编，CPU 拿到它就能执行——流水线之旅结束！',
        ],
      },
      e2: {
        label: '示例二：a = b + c * 2',
        source: 'a = b + c * 2',
        tokens: [ ['a', '标识符'], ['=', '赋值'], ['b', '标识符'], ['+', '运算符'], ['c', '标识符'], ['*', '运算符'], ['2', '数字'] ],
        tree: {
          nodes: [ ['=', 380, 62], ['a', 262, 140], ['+', 470, 140], ['b', 408, 218], ['*', 545, 218], ['c', 508, 292], ['2', 592, 292] ],
          edges: [ [0, 1], [0, 2], [2, 3], [2, 4], [4, 5], [4, 6] ],
        },
        sem: { symbols: ['a : int（已声明）', 'b : int（已声明）', 'c : int（已声明）'], checks: ['赋值左右类型一致：int = int ✓', '运算符两侧类型匹配 ✓'] },
        ir: ['t1 = c * 2', 't2 = b + t1', 'a = t2'],
        irNote: '先算乘法、再算加法、最后赋值——严格按语法树顺序。',
        opt: ['t1 = c << 1', 'a = b + t1'],
        optNotes: ['强度削弱：乘 2 改写为左移 1 位（数值相同、硬件更便宜）', '临时变量 t2 被合并掉'],
        asm: ['LOAD  R1, c', 'SHL   R1, 1', 'LOAD  R2, b', 'ADD   R2, R1', 'STORE a, R2'],
        asmNote: '左移与加法都只需一拍，比真正的乘法快。',
        narr: [
          '先切开：标识符 a、b、c，赋值号 =，运算符 +、*，数字 2——共 7 个 Token。',
          '语法树把运算顺序显式化：c * 2 在最深处先算，结果与 b 相加，最后赋值给 a。',
          '语义检查：三个变量都在符号表中；检查「赋值的左右两边类型一致」：int = int ✓。',
          '三地址码：一条指令一件事——先乘、再加、后赋值，临时变量承载中间结果。',
          '优化：乘 2 可以安全地改写成「左移 1 位」——同样数值，操作更便宜；t2 也被合并。',
          '目标代码：加载 c → 左移 → 加载 b → 相加 → 存回 a 的内存位置。到站！',
        ],
      },
    };

    let exKey = 'e1';
    let verbose = true;

    function draw(i) {
      const ex = EXAMPLES[exKey];
      cv.clear(); cv.bg(P.surface);

      /* 流水线站牌 */
      const sw = 112, gap = 8;
      STAGES.forEach((s, j) => {
        const x = 24 + j * (sw + gap);
        const cur = j === i;
        const done = j < i;
        rrect(x, 18, sw, 30, 15, cur ? P.accent : (done ? P.wash : P.surface), cur ? P.accent : (done ? P.accent : P.border), 1.4);
        text(s, x + sw / 2, 33, cur ? '#FFFFFF' : (done ? P.accentDeep : P.muted), 12, 'center', cur ? 700 : 600);
        if (j < STAGES.length - 1) text('→', x + sw + 1, 33, P.border, 12, 'center', 600);
      });

      /* 源码回顾（右上角） */
      text('源码：' + ex.source, 736, 33, P.muted, 12, 'right', 600);

      const contentY = 66;
      if (i === 0) {
        /* 词法：Token 流 */
        text('Token 流（词素 → 类别）', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        let x = 24;
        ex.tokens.forEach((tk) => {
          const w = Math.max(58, tk[0].length * 14 + 46);
          const kindColor = tk[1] === '数字' ? P.sand : tk[1] === '标识符' ? P.blue : tk[1] === '赋值' ? P.accentDeep : P.ink;
          rrect(x, contentY + 26, w, 46, 9, P.surfaceWarm || '#FBF9F5', kindColor, 1.6);
          mono(tk[0], x + w / 2, contentY + 42, P.ink, 15, 'center', 700);
          text(tk[1], x + w / 2, contentY + 61, kindColor, 11, 'center', 600);
          x += w + 12;
        });
        if (verbose) text('词法分析负责把字符流切分、归类——它不关心语法，只认「单词」的形状。', 24, contentY + 110, P.muted, 12.5, 'left', 500);
      } else if (i === 1) {
        /* 语法：语法树 */
        text('语法树（运算符在枝上，叶子是操作数）', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        const node = ex.tree.nodes;
        ex.tree.edges.forEach(([a, b]) => line(node[a][1], node[a][2] + 12, node[b][1], node[b][2] - 16, P.border, 2));
        node.forEach(([label, nx, ny]) => {
          rrect(nx - 26, ny - 16, 52, 32, 9, P.surface, P.accent, 1.8);
          mono(label, nx, ny, P.accentDeep, 15, 'center', 700);
        });
        if (verbose) text('「先乘后加」不再是口头约定，而是树的高低：枝越低，算得越早。', 24, contentY + 300, P.muted, 12.5, 'left', 500);
      } else if (i === 2) {
        /* 语义：符号表 + 检查 */
        text('符号表', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        const sy = contentY + 26;
        rrect(24, sy, 300, 30 + ex.sem.symbols.length * 30, 10, P.wash, P.accent, 1.4);
        ex.sem.symbols.forEach((s, j) => mono(s, 40, sy + 30 + j * 30, P.accentDeep, 13, 'left', 600));
        text('检查结果', 360, contentY + 8, P.muted, 12.5, 'left', 600);
        rrect(360, sy, 376, 30 + ex.sem.checks.length * 30, 10, P.surface, P.border, 1.2);
        ex.sem.checks.forEach((s, j) => text(s, 376, sy + 30 + j * 30, P.ink, 12.5, 'left', 500));
        if (verbose) text('语法对了不代表有道理：「冰箱吃苹果」语法没问题，语义检查才拦住它。', 24, sy + 130, P.muted, 12.5, 'left', 500);
      } else if (i === 3) {
        /* 三地址码 */
        text('中间代码：三地址码', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        ex.ir.forEach((l, j) => {
          const y = contentY + 28 + j * 40;
          rrect(24, y, 430, 32, 8, j === ex.ir.length - 1 ? P.wash : P.surface, j === ex.ir.length - 1 ? P.accent : P.border, 1.3);
          mono(l, 40, y + 16, P.ink, 13.5, 'left', 600);
          text('# 第 ' + (j + 1) + ' 步', 470, y + 16, P.muted, 11.5, 'left', 500);
        });
        if (verbose) text(ex.irNote, 24, contentY + 28 + ex.ir.length * 40 + 16, P.muted, 12.5, 'left', 500);
      } else if (i === 4) {
        /* 优化 */
        text('优化前 → 优化后', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        ex.ir.forEach((l, j) => { mono(l, 40, contentY + 36 + j * 26, P.muted, 12.5, 'left', 500); line(40 + 0, contentY + 50 + j * 26, 300, contentY + 50 + j * 26, P.redWash, 2); });
        ex.opt.forEach((l, j) => {
          const y = contentY + 28 + j * 40;
          rrect(360, y, 376, 32, 8, P.wash, P.accent, 1.4);
          mono(l, 376, y + 16, P.accentDeep, 13.5, 'left', 700);
        });
        ex.optNotes.forEach((n, j) => text('· ' + n, 360, contentY + 28 + ex.opt.length * 40 + 14 + j * 24, P.sandInk, 12.5, 'left', 500));
      } else {
        /* 目标代码 */
        text('目标代码（简化汇编）', 24, contentY + 8, P.muted, 12.5, 'left', 600);
        ex.asm.forEach((l, j) => {
          const y = contentY + 28 + j * 36;
          rrect(24, y, 430, 30, 8, P.surface, P.border, 1.2);
          mono(l, 40, y + 15, P.ink, 13.5, 'left', 600);
        });
        text('指令的「地址」写法：寄存器 → 操作 → 写回。', 24, contentY + 28 + ex.asm.length * 36 + 14, P.muted, 12.5, 'left', 500);
        if (verbose) text(ex.asmNote, 24, contentY + 28 + ex.asm.length * 36 + 40, P.sandInk, 12.5, 'left', 500);
      }
    }

    function narrate(i) {
      const ex = EXAMPLES[exKey];
      kit.narrate(i, STAGES.length, ex.narr[i]);
    }

    const pb = kit.playback({ total: STAGES.length, onChange: render });
    function render(i) { const idx = Math.max(0, Math.min(i, STAGES.length - 1)); draw(idx); narrate(idx); }

    kit.select({
      label: '示例程序',
      options: [
        { value: 'e1', label: '示例一：x + 1 * 2' },
        { value: 'e2', label: '示例二：a = b + c * 2' },
      ],
      value: 'e1',
    }, (v) => { exKey = v; pb.stop(); pb.goTo(0); });

    kit.select({
      label: '注解',
      options: [
        { value: 'on', label: '带注解' },
        { value: 'off', label: '只看产物' },
      ],
      value: 'on',
    }, (v) => { verbose = v === 'on'; render(pb.current()); });

    kit.explain('编译器把源码变成机器码，要经过六个站点：切词（词法）、组句（语法）、查合理性（语义）、中转站（三地址码）、打磨（优化）、出厂（目标代码）。很多语言工具（类型检查、代码格式化、Lint）其实都是这套流水线的某一站单独拎出来工作。');

    render(0);
    return { destroy() { /* 无外部资源 */ } };
  });
})();
