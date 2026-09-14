/* ============================================================================
 * sorting — 排序可视化实验室（基准演示 · DemoKit 帧序列模式 v2）
 * 高亮模型：每帧 hl = [[index, kind], ...]，kind ∈ cmp | swap | pivot
 * 支持：冒泡 / 插入 / 选择 / 快速 / 归并 / 堆；数据量可调；逐帧旁白与计数。
 * ==========================================================================*/
DemoKit.register('sorting', function (root, kit) {
  const P = kit.palette;
  const ALGS = [
    { id: 'bubble', name: '冒泡排序', cx: '平均 O(n²)：相邻比较，大数慢慢「浮」到后面。' },
    { id: 'insertion', name: '插入排序', cx: '平均 O(n²)：像理扑克牌，把每张牌插到左边已排好的位置。' },
    { id: 'selection', name: '选择排序', cx: '平均 O(n²)：每轮从未排序区选出最小的，放到前面。' },
    { id: 'quick', name: '快速排序', cx: '平均 O(n log n)：选枢轴、分区、递归处理左右两半。' },
    { id: 'merge', name: '归并排序', cx: '稳定 O(n log n)：两两合并有序段，像合并两摞有序的扑克。' },
    { id: 'heap', name: '堆排序', cx: 'O(n log n)：先建大顶堆，再反复把堆顶换到末尾。' },
  ];
  const state = { alg: 'bubble', size: 12, arr: [] };
  let frames = [];
  let pb = null;

  const cv = kit.canvas(720, 340);
  cv.canvas.setAttribute('aria-label', '排序过程柱状图：砂色=正在比较，红色=刚刚交换，蓝色=枢轴/标记，绿色=已归位');

  kit.controlRow();
  kit.select({
    label: '算法',
    options: ALGS.map((a) => ({ value: a.id, label: a.name })),
    value: state.alg,
  }, (v) => { state.alg = v; rebuild(); });
  kit.range({
    label: '数据量',
    min: 6,
    max: 24,
    value: state.size,
    format: (v) => v + ' 个',
  }, (v) => { state.size = v; randArr(); rebuild(); });
  kit.btn('换一组数据', () => { randArr(); rebuild(); });
  const cmpBadge = kit.badge('比较 0 次');
  const swapBadge = kit.badge('交换 0 次');

  pb = kit.playback({ total: 1, onChange: render });
  kit.legend([
    { color: P.muted, label: '未排序' },
    { color: P.sand, label: '正在比较' },
    { color: P.red, label: '刚刚交换' },
    { color: P.blue, label: '枢轴/标记' },
    { color: P.green, label: '已归位' },
  ]);
  kit.explain('排序 = 反复「比较」与「交换」，让数据一步步变得有序。顶部的统计会实时累计这两个动作的次数；一般来说，比较/交换越少，算法越高效。');

  function randArr() {
    state.arr = [];
    while (state.arr.length < state.size) {
      state.arr.push(5 + Math.floor(Math.random() * 91));
    }
  }

  function computeFrames(alg, input) {
    const a = input.slice();
    const n = a.length;
    const out = [];
    let cmp = 0; let swaps = 0;
    const sorted = new Array(n).fill(false);
    function push(desc, hl) { out.push({ arr: a.slice(), hl: hl || [], sorted: sorted.slice(), cmp: cmp, swaps: swaps, desc: desc }); }
    function mark(i) { sorted[i] = true; }

    if (alg === 'bubble') {
      for (let end = n - 1; end > 0; end--) {
        let moved = false;
        for (let j = 0; j < end; j++) {
          cmp++;
          push('比较 ' + a[j] + ' 和 ' + a[j + 1], [[j, 'cmp'], [j + 1, 'cmp']]);
          if (a[j] > a[j + 1]) {
            const t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; swaps++; moved = true;
            push('交换：' + a[j + 1] + ' 与 ' + a[j] + ' 换位', [[j, 'swap'], [j + 1, 'swap']]);
          }
        }
        mark(end);
        push('第 ' + (n - end) + ' 轮结束：' + a[end] + ' 已归位（绿色）', []);
        if (!moved) { for (let k = 0; k <= end; k++) mark(k); push('本轮没有发生交换，说明已经有序，提前结束', []); break; }
      }
      mark(0);
      push('全部有序！冒泡排序完成', []);
    } else if (alg === 'insertion') {
      mark(0);
      for (let i = 1; i < n; i++) {
        const key = a[i];
        push('拿起 ' + key + '，准备插入左边已排序区', [[i, 'pivot']]);
        let j = i - 1;
        while (j >= 0) {
          cmp++;
          push('比较 ' + a[j] + ' 与待插入的 ' + key, [[j, 'cmp'], [i, 'pivot']]);
          if (a[j] > key) { a[j + 1] = a[j]; swaps++; j--; }
          else break;
        }
        a[j + 1] = key;
        for (let k = 0; k <= i; k++) mark(k);
        push('插入完成：前 ' + (i + 1) + ' 个元素有序', [[j + 1, 'swap']]);
      }
      push('全部有序！插入排序完成', []);
    } else if (alg === 'selection') {
      for (let i = 0; i < n - 1; i++) {
        let minI = i;
        push('第 ' + (i + 1) + ' 轮：在剩余区找最小值', [[i, 'pivot']]);
        for (let j = i + 1; j < n; j++) {
          cmp++;
          push('比较 ' + a[j] + ' 与当前最小 ' + a[minI], [[j, 'cmp'], [minI, 'pivot']]);
          if (a[j] < a[minI]) { minI = j; push('发现更小的：' + a[minI], [[minI, 'pivot']]); }
        }
        if (minI !== i) {
          const t = a[i]; a[i] = a[minI]; a[minI] = t; swaps++;
          push('把最小者 ' + a[i] + ' 换到第 ' + (i + 1) + ' 位', [[i, 'swap'], [minI, 'swap']]);
        }
        mark(i);
        push(a[i] + ' 就位（绿色）', []);
      }
      mark(n - 1);
      push('全部有序！选择排序完成', []);
    } else if (alg === 'quick') {
      (function qs(lo, hi) {
        if (lo > hi) return;
        if (lo === hi) { mark(lo); push('单个元素自动有序', []); return; }
        const pivot = a[hi];
        push('选 ' + pivot + ' 作为枢轴，处理区间 [' + lo + ', ' + hi + ']', [[hi, 'pivot']]);
        let i = lo;
        for (let j = lo; j < hi; j++) {
          cmp++;
          push('比较 ' + a[j] + ' 与枢轴 ' + pivot, [[j, 'cmp'], [hi, 'pivot']]);
          if (a[j] < pivot) {
            if (i !== j) { const t = a[i]; a[i] = a[j]; a[j] = t; swaps++; push('小于枢轴：换到左区', [[i, 'swap'], [j, 'swap']]); }
            i++;
          }
        }
        { const t = a[i]; a[i] = a[hi]; a[hi] = t; swaps++; }
        mark(i);
        push(pivot + ' 归位（绿色）：左边都比它小，右边都不小', [[i, 'swap']]);
        qs(lo, i - 1);
        qs(i + 1, hi);
      })(0, n - 1);
      for (let k = 0; k < n; k++) mark(k);
      push('全部有序！快速排序完成', []);
    } else if (alg === 'merge') {
      const tmp = new Array(n);
      (function ms(lo, hi) {
        if (lo >= hi) return;
        const mid = (lo + hi) >> 1;
        push('拆分区间 [' + lo + ', ' + hi + ']，分别排好两半，再合并', []);
        ms(lo, mid); ms(mid + 1, hi);
        let i = lo; let j = mid + 1; let k = lo;
        while (i <= mid && j <= hi) {
          cmp++;
          push('比较 ' + a[i] + ' 与 ' + a[j] + '，小的先合并', [[i, 'cmp'], [j, 'cmp']]);
          tmp[k++] = a[i] <= a[j] ? a[i++] : a[j++];
        }
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi) tmp[k++] = a[j++];
        for (let t2 = lo; t2 <= hi; t2++) {
          a[t2] = tmp[t2];
          swaps++;
          push('合并写回：位置 ' + t2 + ' ← ' + a[t2], [[t2, 'swap']]);
        }
      })(0, n - 1);
      for (let k = 0; k < n; k++) mark(k);
      push('全部有序！归并排序完成', []);
    } else if (alg === 'heap') {
      function siftDown(i0, size) {
        let i = i0;
        while (true) {
          const l = i * 2 + 1; const r = l + 1; let big = i;
          if (l < size) { cmp++; push('比较 ' + a[l] + ' 与 ' + a[big], [[l, 'cmp'], [big, 'cmp']]); if (a[l] > a[big]) big = l; }
          if (r < size) { cmp++; push('比较 ' + a[r] + ' 与 ' + a[big], [[r, 'cmp'], [big, 'cmp']]); if (a[r] > a[big]) big = r; }
          if (big === i) break;
          const t = a[i]; a[i] = a[big]; a[big] = t; swaps++;
          push('把大的换上去，小的继续下沉', [[i, 'swap'], [big, 'swap']]);
          i = big;
        }
      }
      for (let i = (n >> 1) - 1; i >= 0; i--) { push('建堆：调整下标 ' + i + ' 的子树', [[i, 'pivot']]); siftDown(i, n); }
      push('大顶堆建好了：堆顶是最大值', []);
      for (let end = n - 1; end > 0; end--) {
        const t = a[0]; a[0] = a[end]; a[end] = t; swaps++;
        mark(end);
        push('堆顶 ' + a[end] + ' 换到末尾并归位（绿色）', [[end, 'swap']]);
        siftDown(0, end);
      }
      mark(0);
      push('全部有序！堆排序完成', []);
    }
    return out;
  }

  function render(i) {
    const f = frames[i];
    if (!f) return;
    const W = cv.width; const H = cv.height;
    cv.bg(P.bg);
    const padL = 14; const padR = 14; const top = 44; const base = H - 26;
    const n = f.arr.length;
    const bw = (W - padL - padR) / n;
    const maxV = Math.max.apply(null, f.arr.concat([1]));
    const meta = ALGS.filter((x) => x.id === state.alg)[0];

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

    /* 底色柱 */
    for (let idx = 0; idx < n; idx++) {
      const v = f.arr[idx];
      const h = Math.max(8, Math.round((v / maxV) * (base - top)));
      const x = padL + idx * bw + 2;
      const w = Math.max(4, bw - 4);
      cv.ctx.save();
      cv.ctx.globalAlpha = f.sorted[idx] ? 0.92 : 0.4;
      cv.ctx.fillStyle = f.sorted[idx] ? P.green : P.muted;
      barPath(x, w, h);
      cv.ctx.fill();
      cv.ctx.restore();
    }
    /* 高亮覆盖 */
    (f.hl || []).forEach((pair) => {
      const idx = pair[0]; const kind = pair[1];
      const v = f.arr[idx];
      if (v === undefined) return;
      const h = Math.max(8, Math.round((v / maxV) * (base - top)));
      const x = padL + idx * bw + 2;
      const w = Math.max(4, bw - 4);
      cv.ctx.save();
      cv.ctx.globalAlpha = 0.85;
      cv.ctx.fillStyle = kind === 'cmp' ? P.sand : kind === 'swap' ? P.red : kind === 'pivot' ? P.blue : P.sand;
      barPath(x, w, h);
      cv.ctx.fill();
      cv.ctx.restore();
    });
    /* 数值标签 */
    if (n <= 16) {
      cv.ctx.fillStyle = P.muted;
      cv.ctx.font = '11px ' + kit.font;
      cv.ctx.textAlign = 'center';
      for (let idx = 0; idx < n; idx++) {
        const v = f.arr[idx];
        const h = Math.max(8, Math.round((v / maxV) * (base - top)));
        const x = padL + idx * bw + 2;
        const w = Math.max(4, bw - 4);
        cv.ctx.fillText(String(v), x + w / 2, base - h - 5);
      }
    }
    /* 顶部信息 */
    cv.ctx.fillStyle = P.ink;
    cv.ctx.font = '12px ' + kit.font;
    cv.ctx.textAlign = 'left';
    cv.ctx.fillText(meta ? meta.name : '', 14, 22);
    cmpBadge.set('比较 ' + f.cmp + ' 次');
    swapBadge.set('交换 ' + f.swaps + ' 次');
    kit.narrate({ index: i, total: frames.length, text: f.desc });
    if (i === frames.length - 1) {
      kit.explain('排序完成！本次共比较 ' + f.cmp + ' 次、交换 ' + f.swaps + ' 次。' + (meta ? meta.cx : ''));
    }
  }

  function rebuild() {
    frames = computeFrames(state.alg, state.arr);
    pb.setTotal(frames.length);
    pb.reset();
  }

  randArr();
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
