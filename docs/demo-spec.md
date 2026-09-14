# 交互动画组件规格书（DEMO-SPEC.md）

> 供演示开发 subagent（D1–D6）使用。目标：16 个可动手演示，统一外壳、统一交互、人人看得懂。
> 必读：`js/demokit.js`（引擎 API）、`js/demos/sorting.js`（基准演示，严格照此模式写）。

## 0. 文件与命名
- 演示脚本：`js/demos/<id>.js` —— 必须调用 `DemoKit.register('<id>', function (root, kit) { ... })`。
- 演示元数据：`content/demos/<id>.json` —— `{ "id": "...", "title": "...", "goal": "这一演示帮你理解什么（1-2 句）", "howto": ["操作提示 1", "操作提示 2", ...] }`。
- 只写你负责的 id 对应文件；不得修改其他文件（除你自己 id 的元数据）。

## 1. 硬性规则
1. 零第三方依赖：只用原生 JS + Canvas/SVG/HTML。禁止外链、禁止 emoji。
2. 颜色只用 `kit.palette`（Canvas 场景）或 CSS 变量（HTML 场景）：墨色 ink、青绿 accent、砂金 sand、蓝 blue、红 red、绿 green。
3. 交互必须齐全：`重置`、`◀ 上一步`、`▶ 播放/暂停`、`下一步 ▶`、`速度`（用 `kit.playback` 一站式获得）。
4. 每一步都有旁白：`kit.narrate({ index, total, text })` 描述「这一步发生了什么」；整个演示至少 1 处 `kit.explain(...)` 给出总说明。
5. 可调参数：至少 1 个 `kit.range` 或 `kit.select`（如数组大小、算法选择、网络参数），变化后重新生成帧。
6. 键盘：引擎已接好 ←→ 单步、空格播放；你只需保证 `kit.playback` 的 `onChange(i)` 正确渲染第 i 帧。
7. 性能与降级：用「预先计算帧序列 + 按帧渲染」模式（见基准演示），不要用 requestAnimationFrame 连续动画；系统「减弱动态效果」时引擎会自动降速，你无需另行处理。
8. 移动端：宽度自适应（Canvas 用 `kit.canvas(w, h)`，内部已适配 DPR 与 100% 宽度）；控件都是标准按钮/滑杆。
9. 无障碍：canvas 上加 `aria-label`（用 `kit.canvas` 后自行 `cv.canvas.setAttribute('aria-label', ...)`）；旁白文字即读屏信息。

## 2. 推荐代码骨架（帧序列模式）
```js
DemoKit.register('demo-id', function (root, kit) {
  let frames = [], total = 0;
  let state = { size: 12, mode: 'xxx' };

  const cv = kit.canvas(720, 320);
  cv.canvas.setAttribute('aria-label', '演示说明文字');

  const pb = kit.playback({ total: 1, onChange: render });   // 先建，稍后 setTotal
  const sizeRange = kit.range({ label: '数据量', min: 6, max: 24, value: state.size,
    onInput: (v) => { state.size = v; rebuild(); } }, () => {});

  function rebuild() {
    frames = computeFrames(state);      // 生成完整帧序列：每帧 { arr, highlight, desc, counters... }
    pb.goTo(0);
    // 帧总数变了：直接重新注册 playback 不便时，可在生成时固定上限或调用内部 ref 方案
  }
  function render(i) {
    const f = frames[i]; if (!f) return;
    cv.bg(kit.palette.bg);
    // …按 f 绘制到 cv.ctx…
    kit.narrate({ index: i, total: frames.length, text: f.desc });
  }
  function computeFrames(s) { /* 返回帧数组 */ }
  rebuild();
  return { destroy() { /* 如有定时器/监听器在此清理 */ } };
});
```
> 提示：若帧总数动态变化，最简单做法是「数据量变化时重建整个演示区」（`kit.stage.innerHTML=''` 重新画）或把 playback 的 total 一次性设足够大后用空帧跳过——保持简单优先。

## 3. 质量清单（每个演示提交前自查）
- [ ] `node --check js/demos/<id>.js` 通过；
- [ ] 打开 `http://127.0.0.1:8642/#/demo/<id>` 无报错，首屏即显示可视化；
- [ ] 播放/暂停/上一步/下一步/重置 五个操作全部生效；
- [ ] 速度切换、参数调整后画面重新计算且不卡顿；
- [ ] 每一步旁白读得懂（让没学过的人也能说出「发生了什么」）；
- [ ] 手机宽度（<420px）下控件不溢出、可点按；
- [ ] 元数据 content/demos/<id>.json 已写。

## 4. 演示清单与分工
| 负责 | 演示 id | 核心要求（额外） |
|---|---|---|
| D1 | searching | 二分查找每步高亮区间收缩；BST 查找路径高亮 |
| D1 | graphtravel | 可点节点搭图；BFS/DFS 扩散顺序；Dijkstra 距离表 |
| D1 | fsm | 可编辑状态转移；输入字符串逐字符走状态；接受/拒绝判定 |
| D1 | bigo | 拖规模滑块对比曲线；标注常见复杂度 |
| D2 | scheduling | 进程队列 + 甘特图；FCFS/SJF/RR/优先级；等待/周转时间统计 |
| D2 | paging | 页面访问序列 → 帧框；FIFO/LRU/OPT 缺页计数对比 |
| D2 | deadlock | 资源分配图 + 银行家算法安全检查表 |
| D3 | tcp | 三个子模式：握手/挥手（报文步进）、可靠传输（丢包重传）、拥塞控制（cwnd 曲线） |
| D4 | memptr | 栈/堆内存布局；malloc/指针操作；泄漏与野指针现场 |
| D4 | float | 位数拆解滑块；IEEE754 三字段联动；精度丢失演示 |
| D4 | cache | 地址流 → 缓存行映射；命中/缺失与替换动画；命中率统计 |
| D5 | pipeline | 五级流水线时空图；数据冒险/转发/气泡开关 |
| D5 | oop-model | 创建类与对象；继承链；多态派发可视化 |
| D5 | compile-flow | 源码逐站经过：词法→语法→语义→IR→优化→目标码 |
| D6 | neural-net | 两层网络权重可调；前向传播数值流动；迷你训练演示 |

## 5. 引擎 API 速查（详见 js/demokit.js）
- `kit.palette` / `kit.font`；`kit.reducedMotion`
- `kit.setStage(html)`、`kit.canvas(w,h)`（返回 { el, ctx, clear(), bg() }，坐标即 w×h 逻辑像素）
- `kit.controlRow()`、`kit.btn(label, fn, opts)`、`kit.sep()`、`kit.range(o, onInput)`、`kit.select(o, onChange)`、`kit.badge(text)`、`kit.hint(text)`
- `kit.legend([{color,label}...])`
- `kit.narrate({index,total,text})`、`kit.explain(html)`
- `kit.playback({ total, index, onChange, baseInterval })` → `{ goTo, next, prev, reset, play, stop, toggle, current, total }`
- `kit.onCleanup(fn)`；factory 返回 `{ destroy() {} }` 可选

## 6. 提交与回传
- 每写完一个演示：`node --check` + 在浏览器里亲自走一遍（或说明无法预览的原因）。
- 写报告 `reports/subagent_NN.md`：演示清单 / 自测结果 / 已知缺口。
