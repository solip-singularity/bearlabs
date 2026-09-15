/* ============================================================================
 * demos/oop-model.js — 对象与多态建模台
 * 五步走：定义基类 → 子类重写 → 实例化 → 多态派发 → 动态绑定小结。
 * 可调参数：两个对象的实际类型（Dog / Cat），切换后重新派发看谁在说话。
 * ==========================================================================*/
(function () {
  'use strict';
  DemoKit.register('oop-model', function (shell, kit) {
    const P = kit.palette;
    const cv = kit.canvas(760, 380);
    const g = cv.ctx;
    cv.canvas.setAttribute('aria-label', '面向对象建模台：类、对象、继承与多态派发示意');

    /* ---------- 绘图小工具 ---------- */
    function font(size, weight) { g.font = (weight || 500) + ' ' + size + 'px ' + kit.font; }
    function text(s, x, y, color, size, align, weight) { font(size || 13, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function mono(s, x, y, color, size, align, weight) { font(size || 12.5, weight); g.fillStyle = color || P.ink; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
    function rrect(x, y, w, h, r, fill, stroke, lw) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.4; g.stroke(); }
    }
    function arrowLine(x1, y1, x2, y2, color, width) {
      g.strokeStyle = color; g.lineWidth = width || 1.8;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      g.beginPath(); g.moveTo(x2, y2);
      g.lineTo(x2 - 10 * Math.cos(ang - 0.42), y2 - 10 * Math.sin(ang - 0.42));
      g.lineTo(x2 - 10 * Math.cos(ang + 0.42), y2 - 10 * Math.sin(ang + 0.42));
      g.closePath(); g.fillStyle = color; g.fill();
    }

    /* ---------- 数据 ---------- */
    const CLASSES = {
      Animal: {
        x: 60, y: 42, w: 240, h: 96,
        desc: '基类：动物',
        fields: ['name ：名字'],
        methods: [['speak()', '由子类决定怎么叫', 'abstract']],
      },
      Dog: {
        x: 24, y: 216, w: 230, h: 118,
        desc: '子类：狗',
        fields: ['（继承 name）'],
        methods: [['speak()', 'return "汪汪！"', 'override']],
      },
      Cat: {
        x: 274, y: 216, w: 230, h: 118,
        desc: '子类：猫',
        fields: ['（继承 name）'],
        methods: [['speak()', 'return "喵喵！"', 'override']],
      },
    };
    let objTypes = ['Dog', 'Cat'];
    const OBJ_NAMES = ['旺财', '咪咪'];
    function bubbleText(t) { return t === 'Dog' ? '汪汪！' : '喵喵！'; }

    function drawClassCard(key, opts) {
      const c = CLASSES[key];
      const hl = opts && opts.hl;
      rrect(c.x, c.y, c.w, c.h, 12, hl ? P.wash : P.surface, hl ? P.accent : P.border, hl ? 2.2 : 1.4);
      text(c.desc, c.x + 14, c.y + 20, hl ? P.accentDeep : P.ink, 13, 'left', 700);
      text(c.fields[0], c.x + 14, c.y + 42, P.muted, 11.5, 'left', 500);
      c.methods.forEach((m, i) => {
        const my = c.y + 66 + i * 24;
        const mhl = opts && opts.methodHl;
        rrect(c.x + 10, my - 11, c.w - 20, 22, 6, mhl ? P.sandWash : (P.surfaceWarm || '#FBF9F5'), mhl ? P.sand : P.border, mhl ? 1.8 : 1);
        mono(m[0], c.x + 18, my, mhl ? P.sandInk : P.ink, 12, 'left', 700);
        mono(m[1], c.x + 96, my, P.muted, 11.5, 'left', 500);
        if (m[2] === 'abstract') text('（抽象）', c.x + c.w - 58, my, P.muted, 10.5, 'right', 500);
        if (m[2] === 'override') text('@override', c.x + c.w - 58, my, P.green, 10.5, 'right', 600);
      });
    }

    function draw(fr) {
      cv.clear(); cv.bg(P.surface);
      text('对象与多态建模台', 24, 24, P.muted, 13, 'left', 600);
      mono('调用代码：  for a in [obj1, obj2]:  a.speak()', 736, 24, P.muted, 11.5, 'right', 500);

      /* 类卡片 */
      drawClassCard('Animal', { hl: fr === 0 });
      if (fr >= 1) {
        drawClassCard('Dog', { hl: fr === 1, methodHl: fr >= 3 && objTypes[0] === 'Dog' || fr >= 3 && objTypes[1] === 'Dog' ? true : false });
        drawClassCard('Cat', { hl: fr === 1, methodHl: false });
        arrowLine(139, 216, 168, 138, P.border, 1.6);
        arrowLine(389, 216, 200 + 120, 138, P.border, 1.6);
      } else {
        rrect(24, 216, 230, 118, 12, P.bg, P.border, 1.2);
        text('（待创建子类…）', 139, 275, P.muted, 12, 'center', 500);
        rrect(274, 216, 230, 118, 12, P.bg, P.border, 1.2);
        text('（待创建子类…）', 389, 275, P.muted, 12, 'center', 500);
      }

      /* 对象卡片 */
      if (fr >= 2) {
        objTypes.forEach((t, i) => {
          const ox = 540, oy = 52 + i * 150, w = 196, h = 128;
          const isDispatch = fr >= 3;
          rrect(ox, oy, w, h, 12, P.surface, isDispatch ? (i === 0 ? P.blue : P.sand) : P.border, isDispatch ? 2 : 1.4);
          text('对象 ' + (i + 1), ox + 12, oy + 20, P.muted, 11, 'left', 600);
          text(OBJ_NAMES[i], ox + 60, oy + 20, P.ink, 13.5, 'left', 700);
          mono('类型：' + t, ox + 12, oy + 46, P.accentDeep, 12, 'left', 600);
          mono('a = new ' + t + '("' + OBJ_NAMES[i] + '")', ox + 12, oy + 70, P.muted, 11, 'left', 500);
          if (isDispatch) {
            const cls = CLASSES[t];
            text('执行：' + t + '.' + 'speak()', ox + 12, oy + 96, P.ink, 11.5, 'left', 600);
            // 对话框
            rrect(ox + 116, oy + 80, 72, 30, 15, t === 'Dog' ? P.blueWash : P.sandWash, t === 'Dog' ? P.blue : P.sand, 1.6);
            text(bubbleText(t), ox + 152, oy + 95, t === 'Dog' ? P.blue : P.sandInk, 13, 'center', 700);
          }
        });
      } else {
        rrect(540, 52, 196, 128, 12, P.bg, P.border, 1.2);
        text('（待实例化…）', 638, 116, P.muted, 12, 'center', 500);
        rrect(540, 202, 196, 128, 12, P.bg, P.border, 1.2);
        text('（待实例化…）', 638, 266, P.muted, 12, 'center', 500);
      }

      /* 底部小结 */
      const notes = [
        '第 1 步：定义基类 Animal —— 约定「有什么」，不规定「怎么做」。',
        '第 2 步：子类重写 speak() —— 同一个方法名，两种实现。',
        '第 3 步：实例化 —— 把类和具体数据合体，得到活生生的对象。',
        '第 4 步：多态派发 —— 同一句 a.speak()，各自执行自己类型的版本。',
        '第 5 步：动态绑定 —— 调用看声明，执行看实际类型；这正是「面向接口编程」的底气。',
      ];
      rrect(24, 344, 712, 28, 8, fr >= 4 ? P.wash : P.surface, fr >= 4 ? P.accent : P.border, 1.2);
      text(notes[fr], 38, 358, fr >= 4 ? P.accentDeep : P.muted, 12, 'left', fr >= 4 ? 700 : 500);
    }

    function narr(fr) {
      const names = OBJ_NAMES[0] + '（' + objTypes[0] + '）和' + OBJ_NAMES[1] + '（' + objTypes[1] + '）';
      const N = [
        '先写基类 Animal：所有动物都有名字，都会「说话」——但基类不写死怎么叫，把 speak() 留给子类（抽象方法）。',
        '两个子类分别<strong>重写</strong> speak()：狗返回「汪汪！」、猫返回「喵喵！」。方法名相同，实现各自说了算。',
        '实例化：new 一个对象 = 把「类」和具体数据（名字）合体。现在有了两个对象：' + names + '。',
        '关键一刻：同一句 a.speak() 依次发给两个对象——' + names + '。看气泡：狗对象执行狗版、猫对象执行猫版。<strong>调用相同，执行不同。</strong>',
        '这就是<strong>多态（动态绑定）</strong>：写代码的人只写 a.speak()，到底执行哪段实现，由运行时对象的实际类型决定。想验证的话，切换下面两个对象的类型，再走一遍第 4 步。',
      ];
      kit.narrate(fr, 5, N[fr]);
    }

    const pb = kit.playback({ total: 5, onChange: (i) => { const fr = Math.max(0, Math.min(4, i)); draw(fr); narr(fr); } });

    kit.select({
      label: '对象1 类型',
      options: [{ value: 'Dog', label: 'Dog（狗）' }, { value: 'Cat', label: 'Cat（猫）' }],
      value: objTypes[0],
    }, (v) => { objTypes[0] = v; draw(Math.max(0, pb.current())); });

    kit.select({
      label: '对象2 类型',
      options: [{ value: 'Dog', label: 'Dog（狗）' }, { value: 'Cat', label: 'Cat（猫）' }],
      value: objTypes[1],
    }, (v) => { objTypes[1] = v; draw(Math.max(0, pb.current())); });

    kit.explain('面向对象的三根支柱在一张图里：封装（数据和方法打包在类里）、继承（Dog / Cat 复用 Animal 的约定）、多态（同一调用按实际类型分头执行）。判断「该不该重写」的小口诀：子类对同一个问题是否给出了不同答案——是，就重写。');

    draw(0); narr(0);
    return { destroy() { /* 无外部资源 */ } };
  });
})();
