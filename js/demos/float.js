/* ============================================================================
 * float — 浮点数拆解实验室（IEEE754 单精度，DemoKit 帧序列模式）
 * 32 个格子 = 1 位符号 + 8 位指数（偏移 127）+ 23 位尾数（隐含前导 1）。
 * 用 Float32Array / Uint32Array 拆位，与真实硬件存储完全一致（已用已知值自验）。
 * ==========================================================================*/
DemoKit.register('float', function (root, kit) {
  const P = kit.palette;

  const cv = kit.canvas(720, 360);
  cv.canvas.setAttribute('aria-label', '浮点数拆解图：一个十进制数被拆成 32 个二进制位——第 1 位是符号，接着 8 位是指数（带偏移 127），最后 23 位是尾数（含隐含前导 1）；下方同时给出实际存储值与原值的误差');

  const PRESETS = [
    { label: '0.1', v: 0.1 },
    { label: '0.3', v: 0.3 },
    { label: '0.5', v: 0.5 },
    { label: '1', v: 1 },
    { label: '-2.75', v: -2.75 },
    { label: '1/3', v: 1 / 3 },
    { label: '1e-8', v: 1e-8 },
    { label: '16777217', v: 16777217 },
  ];

  const state = { v: 0.1 };
  let frames = [];   // 每帧 { desc }
  let info = null;   // 当前数值的拆解结果（所有帧共享，随 rebuild 更新）
  let pb = null;

  /* ---------- 拆位工具：Float32Array + Uint32Array 共享缓冲 ---------- */
  function f32(v) { const a = new Float32Array(1); a[0] = v; return a[0]; }
  function bits32(v) { const a = new Float32Array(1); a[0] = v; return new Uint32Array(a.buffer)[0]; }

  function fmtNum(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-6 || a >= 1e12)) return v.toExponential(6);
    return String(parseFloat(v.toPrecision(12)));
  }
  function fmtStored(s) {
    if (Number.isInteger(s) && Math.abs(s) < 1e15) return String(s);
    const a = Math.abs(s);
    if (a !== 0 && (a < 1e-6 || a >= 1e12)) return s.toExponential(8);
    return String(parseFloat(s.toPrecision(12)));
  }
  function fmtErr(e) {
    if (e === 0) return '0（完全一致）';
    if (Number.isInteger(e) && Math.abs(e) < 1e6) return (e > 0 ? '+' : '') + String(e);
    return (e > 0 ? '+' : '') + e.toExponential(3);
  }

  function compute(v0) {
    const s = f32(v0);
    const u = bits32(v0);
    const sign = (u >>> 31) & 1;
    const e2 = (u >>> 23) & 255;
    const mant = u & 0x7FFFFF;
    const expStr = e2.toString(2).padStart(8, '0');
    const manStr = mant.toString(2).padStart(23, '0');
    const zero = (v0 === 0);
    const underflow = (!zero && s === 0);
    const subnormal = (!zero && !underflow && e2 === 0);
    const normal = !zero && !underflow && !subnormal;
    const E = normal ? (e2 - 127) : null;
    const exact = (s === v0);
    const err = s - v0;
    const hex = '0x' + u.toString(16).toUpperCase().padStart(8, '0');
    return { v0: v0, s: s, sign: sign, e2: e2, mant: mant, expStr: expStr, manStr: manStr,
      zero: zero, underflow: underflow, subnormal: subnormal, normal: normal,
      E: E, exact: exact, err: err, hex: hex };
  }

  /* ---------------- 帧数据：按「拆解流程」生成 7 帧 ---------------- */
  function computeFrames(v0) {
    info = compute(v0);
    const t = [];
    const vStr = fmtNum(v0);
    const classic = Math.abs(Math.abs(v0) - 0.1) < 1e-12;

    t.push({ desc: 'IEEE754 单精度用 32 个二进制位存一个小数：1 位符号 + 8 位指数 + 23 位尾数。现在输入的是 ' + vStr + '，我们一步步看它如何被拆成三段、存进内存、再读回来。' });

    t.push({ desc: '第 1 段 · 符号位（1 位）：0 表示正数，1 表示负数。'
      + (info.zero
        ? '0 不分正负：+0 的符号位是 0，-0 的符号位是 1——两者值相等，这是浮点数的一个小怪癖。'
        : (v0 < 0 ? vStr + ' 是负数 → 符号位 = 1。' : vStr + ' 是正数 → 符号位 = 0。')) });

    if (info.normal) {
      t.push({ desc: '关键一步：把绝对值写成二进制科学计数法 1.xxxx…₂ × 2^E。'
        + (info.exact ? '' : '十进制小数转成二进制往往写不完（比如 0.1 的二进制是 0.000110011…，无限循环），')
        + '规格化之后的指数 E = ' + info.E + '。' });
    } else if (info.zero) {
      t.push({ desc: '0 是特殊值：没有科学计数法形式，指数域和尾数域全部为 0。' });
    } else if (info.underflow) {
      t.push({ desc: '这个数太小了，超出了单精度能表示的下限（约 1.4e-45），直接被「下溢」成 0 存储——这也是一种精度丢失。' });
    } else {
      t.push({ desc: '这个数非常小，落在「非规格化数」区域：指数域固定为 0，尾数不再有隐含前导 1（进阶内容，了解即可）。' });
    }

    if (info.normal) {
      t.push({ desc: '第 2 段 · 指数位（8 位）：存的是「偏移码」——真实指数 E + 127。这里 '
        + info.E + ' + 127 = ' + info.e2 + '，写成二进制就是 ' + info.expStr + '。偏移 127 让 8 位能同时表示负指数和正指数（范围 -126 到 +127）。' });
    } else {
      t.push({ desc: info.zero ? '指数域 8 位全部为 0。'
        : (info.underflow ? '存储值为 0：32 位全部为 0。' : '非规格化数：指数域 8 位固定为 0。') });
    }

    if (info.normal) {
      t.push({ desc: '第 3 段 · 尾数位（23 位）：规格化后整数部分永远是 1，这个「隐含的前导 1」不占存储位——相当于白赚一位精度，所以只存小数点后的 23 位。' });
    } else {
      t.push({ desc: info.zero ? '尾数域 23 位也全部为 0。'
        : (info.underflow ? '没有任何尾数被保留下来。' : '非规格化数的尾数直接按定点小数存放（没有隐含的 1）。') });
    }

    if (info.exact) {
      t.push({ desc: '检查舍入：这个数的二进制恰好能被 23 位尾数完整存下——没有任何舍入，存储值与原值完全相等，误差为 0。' });
    } else {
      t.push({ desc: '检查舍入：二进制在 23 位内写不完（无限循环或位数太多），第 24 位起按「就近舍入」处理——存下的值比原值'
        + (info.err > 0 ? '略大' : '略小') + '。' + (classic ? ' 0.1 存不准，就是从这里来的。' : '') });
    }

    t.push({ desc: '拼装完成！读回时按公式 (-1)^符号 × 1.尾数₂ × 2^(指数-127) 还原：实际存下的值是 '
      + fmtStored(info.s) + '，与原值相差 ' + fmtErr(info.err) + '。所以浮点数永远不要用 == 比较，要比「误差是否够小」。' });

    return t;
  }

  /* ---------------- 绘制 ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function render(i) {
    if (!info || !frames[i]) return;
    const ctx = cv.ctx;
    cv.bg(P.bg);
    const showSign = i >= 1, showExp = i >= 3, showMan = i >= 4;

    /* 顶部信息 */
    ctx.fillStyle = P.ink; ctx.font = 'bold 14px ' + kit.font; ctx.textAlign = 'left';
    ctx.fillText('原值 ' + fmtNum(info.v0), 25, 30);
    ctx.fillStyle = P.muted; ctx.font = '12px ' + kit.font; ctx.textAlign = 'right';
    ctx.fillText('32 位整体（十六进制）' + info.hex, 695, 30);

    /* 三段标题 */
    ctx.font = '11px ' + kit.font; ctx.fillStyle = P.muted; ctx.textAlign = 'center';
    ctx.fillText('符号（1 位）', 34, 56);
    ctx.fillText('指数（8 位）', 129, 56);
    ctx.fillText('尾数（23 位）', 448, 56);

    /* 32 个位格子 */
    for (let k = 0; k < 32; k++) {
      const x = 25 + k * 21, y = 66;
      const revealed = k === 0 ? showSign : (k <= 8 ? showExp : showMan);
      const bit = k === 0 ? info.sign : (k <= 8 ? Number(info.expStr[k - 1]) : Number(info.manStr[k - 9]));
      let fill = P.surface, stroke = P.border, txt = P.muted;
      if (revealed) {
        if (k === 0) { fill = P.blueWash; stroke = P.blue; txt = P.ink; }
        else if (k <= 8) { fill = P.sandWash; stroke = P.sand; txt = P.sandInk; }
        else { fill = P.wash; stroke = P.accent; txt = P.ink; }
      }
      ctx.fillStyle = fill; ctx.strokeStyle = stroke;
      roundRect(ctx, x, y, 19, 38, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = txt; ctx.font = '12px ' + kit.font;
      ctx.fillText(String(bit), x + 9.5, y + 23);
    }

    /* 末位舍入标注 */
    if (i >= 5 && !info.exact && info.normal) {
      ctx.strokeStyle = P.red; ctx.lineWidth = 2;
      roundRect(ctx, 25 + 31 * 21 - 1.5, 64.5, 22, 41, 4); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = P.red; ctx.font = '11px ' + kit.font; ctx.textAlign = 'right';
      ctx.fillText('末位之后被舍入', 695, 120);
    }

    /* 二进制科学计数法面板 */
    if (i >= 2) {
      ctx.fillStyle = P.surface; ctx.strokeStyle = P.border;
      roundRect(ctx, 25, 136, 670, info.normal ? 92 : 52, 8); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left';
      let y = 162;
      ctx.fillStyle = P.ink; ctx.font = '13px ' + kit.font;
      const l1 = info.normal
        ? fmtNum(info.v0) + (info.exact ? ' = ' : ' ≈ ') + (info.sign ? '-' : '+') + '1.' + info.manStr + '₂ × 2^' + info.E
        : (info.zero ? '0：指数域与尾数域全 0（特殊值）'
          : (info.underflow ? fmtNum(info.v0) + ' → 下溢为 0（全 0 位）' : '非规格化小数：指数域为 0，无隐含前导 1'));
      ctx.fillText(l1, 45, y);
      if (info.normal) {
        if (i >= 3) {
          y += 26;
          ctx.fillStyle = P.sandInk;
          ctx.fillText('指数域 = E + 127 = ' + info.E + ' + 127 = ' + info.e2 + ' → ' + info.expStr + '₂', 45, y);
        }
        if (i >= 4) {
          y += 26;
          ctx.fillStyle = P.muted;
          ctx.fillText('尾数域 = 隐含前导「1」后面的小数部分（1 不占位，白赚一位精度）', 45, y);
        }
      }
    }

    /* 舍入结论 */
    if (i >= 5) {
      ctx.textAlign = 'left'; ctx.font = '13px ' + kit.font;
      if (info.exact) {
        ctx.fillStyle = P.green;
        ctx.fillText('舍入检查：恰好存得下，零误差。', 45, 252);
      } else {
        ctx.fillStyle = P.redWash;
        roundRect(ctx, 35, 238, 650, 24, 5); ctx.fill();
        ctx.fillStyle = P.red;
        ctx.fillText('舍入检查：超出 23 位，按就近舍入处理——存下的值比原值' + (info.err > 0 ? '略大' : '略小') + '。', 45, 254);
      }
    }

    /* 结果面板 */
    if (i >= 6) {
      ctx.fillStyle = P.wash; ctx.strokeStyle = P.border;
      roundRect(ctx, 25, 276, 670, 66, 8); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = P.ink; ctx.font = '13px ' + kit.font;
      ctx.fillText('实际存储值：' + fmtStored(info.s), 45, 302);
      ctx.fillStyle = P.red;
      const rel = (info.v0 !== 0 && info.err !== 0)
        ? '（相对 ' + (Math.abs(info.err / info.v0) * 100).toExponential(2) + '%）' : '';
      ctx.fillText('与原值的误差：' + fmtErr(info.err) + rel, 45, 326);
      ctx.fillStyle = P.muted; ctx.font = '12px ' + kit.font; ctx.textAlign = 'right';
      ctx.fillText('读回公式：(-1)^符号 × 1.尾数₂ × 2^(指数-127)', 680, 316);
    }

    kit.narrate({ index: i, total: frames.length, text: frames[i].desc });
    if (i === frames.length - 1) {
      kit.explain('记住三件事：指数用「偏移 127」存；尾数有「隐含前导 1」，白赚一位精度；大多数十进制小数（比如 0.1）无法被精确存储——所以比较浮点数要用误差范围，别用等号。');
    }
  }

  /* ---------------- 控件与初始化 ---------------- */
  kit.controlRow();
  const slider = kit.range({
    label: '数值',
    min: -1000, max: 1000, step: 0.01, value: 0.1,
    format: (x) => fmtNum(x),
  }, (v) => {
    state.v = Math.round(v * 100) / 100;   // 消除滑杆浮点毛刺，得到干净的两位小数
    rebuild();
  });

  kit.controlRow();
  PRESETS.forEach(function (p) {
    kit.btn(p.label, function () {
      state.v = p.v;
      slider.set(Math.max(-1000, Math.min(1000, p.v)));
      rebuild();
    });
  });

  pb = kit.playback({ total: 1, onChange: render });
  kit.legend([
    { color: P.blue, label: '符号位' },
    { color: P.sand, label: '指数位（偏移 127）' },
    { color: P.accent, label: '尾数位（隐含前导 1）' },
  ]);
  kit.explain('输入任意小数，看它被拆成 1 位符号、8 位指数、23 位尾数；注意「实际存储值」与「原值」的差——这就是浮点误差的来源。试试预设按钮里的 0.1 和 16777217。');

  function rebuild() {
    frames = computeFrames(state.v);
    pb.setTotal(frames.length);
    pb.goTo(pb.current());
  }
  rebuild();
  return { destroy() { /* 无异步资源需要清理 */ } };
});
