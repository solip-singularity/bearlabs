/* ============================================================================
 * demos/bigo.js — 复杂度曲线探索器
 * 拖动数据规模 n，同屏对比六种复杂度的操作次数（对数刻度的柱状条）。
 * 可调参数：① n 滑块；② 步进档位（通过标准播放控件逐档放大 n）。
 * ==========================================================================*/
(function () {
  'use strict';
  DemoKit.register('bigo', function (shell, kit) {
    const P = kit.palette;
    const cv = kit.canvas(760, 360);
    const g = cv.ctx;
    cv.canvas.setAttribute('aria-label', '复杂度曲线柱状图：不同数据规模下各复杂度的操作次数对比');

    const PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];
    let n = PRESETS[0];

    const fns = [
      { name: 'O(1)', color: P.green, f: () => 1, why: '常数时间：不管数据多大，一步到位（比如数组按下标取值）。' },
      { name: 'O(log n)', color: P.accent, f: (n2) => Math.log2(n2), why: '对数时间：每步砍一半（二分查找）——n 变 1000 倍，它只多走 10 步。' },
      { name: 'O(n)', color: P.blue, f: (n2) => n2, why: '线性时间：数据翻倍、时间翻倍（扫一遍列表）。' },
      { name: 'O(n log n)', color: P.sand, f: (n2) => n2 * Math.log2(n2), why: '优秀排序的水平（归并/快排），n 大起来也只多带一个 log 因子。' },
      { name: 'O(n²)', color: P.red, f: (n2) => n2 * n2, why: '平方时间：两层循环（冒泡排序）。n=1000 就是一百万次操作——开始受不了了。' },
      { name: 'O(2ⁿ)', color: P.ink, f: (n2) => (n2 <= 24 ? Math.pow(2, n2) : Infinity), why: '指数时间：每加一个数据量，工作量翻倍（暴力枚举所有子集）——n 到 30 左右就爆表。' },
    ];

    function fmt(v) {
      if (!isFinite(v)) return '爆表';
      if (v >= 1e12) return '≈10' + Math.floor(Math.log10(v)) + ' 次';
      if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' 百万次';
      if (v >= 1e4) return (v / 1e4).toFixed(1).replace(/\.0$/, '') + ' 万次';
      return Math.round(v * 10) / 10 + ' 次';
    }
    function logH(v) {
      if (!isFinite(v)) return 1;
      return Math.min(1, Math.log10(v + 1) / Math.log10(1e6 + 1));
    }

    function font(size, weight) { g.font = (weight || 500) + ' ' + size + 'px ' + kit.font; }
    function text(s, x, y, color, size, align, weight) { font(size || 13, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function rrect(x, y, w, h, r, fill, stroke, lw) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.4; g.stroke(); }
    }

    function draw() {
      cv.clear(); cv.bg(P.surface);
      text('数据规模 n = ' + n, 24, 28, P.ink, 15, 'left', 700);
      text('柱高按「对数刻度」绘制：每高一层 = 操作次数 × 10', 736, 28, P.muted, 11.5, 'right', 500);

      const baseY = 306, maxH = 218;
      fns.forEach((fn, i) => {
        const ops = fn.f(n);
        const x = 36 + i * 121;
        const h = Math.max(3, logH(ops) * maxH);
        rrect(x, baseY - h, 92, h, 6, fn.color, null, 0);
        text(fn.name, x + 46, baseY + 16, P.ink, 12.5, 'center', 700);
        text(fmt(ops), x + 46, baseY + 34, P.muted, 11, 'center', 600);
      });
      // 基线
      g.strokeStyle = P.border; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(24, baseY); g.lineTo(736, baseY); g.stroke();

      // 底部解读
      const worst = fns[4].f(n), almost = fns[3].f(n);
      rrect(24, 322, 712, 30, 8, P.surfaceWarm || '#FBF9F5', P.border, 1);
      text('换个角度看：n = ' + n + ' 时，O(n log n) 只要 ' + fmt(almost) + '，而 O(n²) 要 ' + fmt(worst) + '——差了 ' + (worst / almost).toFixed(1) + ' 倍工作量。', 38, 337, P.muted, 12, 'left', 500);
    }

    function narrateFrame(i) {
      n = PRESETS[i];
      const worst = fns[4].f(n);
      const logn = fns[1].f(n);
      let t = '规模 n = ' + n + '：O(log n) 只用约 ' + Math.round(logn) + ' 步，O(n) 用 ' + fmt(fns[2].f(n)) + '，O(n²) 涨到 ' + fmt(worst) + '。';
      if (i >= 5) t += ' 注意看两个速度档位的差距是怎么「拉开」的：n 每翻一倍，平方这一列就贵四倍。';
      if (i >= 7) t += ' 这就是为什么工程上宁可多写几行聪明代码，也要把 O(n²) 的循环换成 O(n log n)——在 n=1000 时已经差 100 倍，n 再大更是天壤之别。';
      kit.narrate(i, PRESETS.length, t);
    }

    const slider = kit.range({ label: '数据规模 n', min: 1, max: 1000, step: 1, value: n, format: (v) => String(v) }, (v) => { n = v; draw(); });
    const pb = kit.playback({ total: PRESETS.length, onChange: (i) => { n = PRESETS[Math.min(i, PRESETS.length - 1)]; if (slider) slider.set(n); draw(); narrateFrame(i); } });

    kit.explain('复杂度描述的是「数据变大时，工作量怎么涨」。柱状条按对数刻度画：看起来差距被压缩了，但真实数字在每根柱子下面——n=1000 时，O(n²) 是一百万次操作，而 O(n log n) 只要一万次。工程师的日常，就是在这几根柱子上做文章。');

    draw(); narrateFrame(0);
    return { destroy() { /* 无外部资源 */ } };
  });
})();
