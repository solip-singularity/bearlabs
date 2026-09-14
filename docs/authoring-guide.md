# 内容创作规范（AUTHORING-GUIDE.md）

版本 1.0 · 适用于全部课程内容 subagent。**写作前必须完整阅读本文件 + `docs/OUTLINES.md` 对应课程部分 + 示例章节 `content/courses/oop/oop-01.json`。**

## 0. 总则（硬性）
1. 语言：简体中文。专业术语保留英文原名并括注解释（如 `缓存（Cache）`）；代码保持原文。
2. 目标读者：`pro`（专业版）= 大学生/成人学习者；`kid`（通俗版）= 小学高年级/初中生也能听懂，**两版讲同一批知识点，结论必须一致**。
3. 原创：全部内容自己撰写；如需参考经典教材，只在 `refs` 里注明书名与章节（纯文本，不带链接）。禁止整段复制教材原文。
4. **禁止 emoji**。禁止外链图片、外链脚本、iframe。所有图形用内联手写 SVG 或 HTML 结构。
5. 每写完一个 JSON 文件，**立即**运行校验脚本（见 §11），必须 PASS 才继续下一个文件。
6. 文件编码 UTF-8；JSON 里字符串内的换行用 \n 转义；**HTML 标签的属性一律用单引号**（如 `<pre class='code' data-lang='c'>`），避免 JSON 转义错误。中文标点直接写（全角符号没问题）。

### 0.5 时间预算与执行节奏（重要）
- 你的单次运行时间上限约 20 分钟：读完材料后**立即动笔**，平均每章写作 ≤5 分钟。
- 不要探索目录、不要读校验脚本源码、不要读 plan.md 等其他文件，这些对写作没有帮助。
- 宁可每章写到规范下限（pro ≥1100 字、kid ≥750 字、习题 10 题齐备），不要超长或反复打磨。
- 时间不够时：优先把完整的章节文件落盘；未完成部分写进报告，由后续任务接力。

## 1. 文件与路径
- 课程元数据：`content/courses/<courseId>/course.json`
- 章节：`content/courses/<courseId>/<chapterId>.json`（如 `coa-01.json`）
- courseId：`coa/net/os/alg/oop/db/cmp/dm/ai`；章节 id：`<courseId>-NN`（两位数字）。
- 只允许写自己负责的文件，**不得修改其他课程/其他 agent 的文件**，不得改站点代码。

## 2. course.json 结构
```json
{
  "id": "coa",
  "title": "计算机组成原理",
  "subtitle": "一句话副标题（有画面感，不夸张）",
  "level": "本科核心",
  "levelNote": "适用年级与先修说明（1-2 句）",
  "hours": 18,
  "keywords": ["关键词1", "关键词2"],
  "description": "2-3 句课程介绍：学什么、学完能做什么。",
  "prerequisites": ["先修建议1", "……"],
  "units": [
    {
      "id": "coa-u1",
      "title": "单元一 单元标题",
      "summary": "一句话单元说明",
      "chapters": [
        { "id": "coa-01", "title": "第1讲 标题", "objective": "一句话学习目标", "minutes": 40, "difficulty": 1, "prereqs": [] }
      ]
    }
  ]
}
```
- `hours` = 本课预计总学习时长（含做题）：≈ 所有章节 minutes 之和 ÷ 60 × 1.8，四舍五入到整数。
- 章节列表必须与 OUTLINES.md 完全一致（id、标题、课时、难度），不得增删改。

## 3. 章节文件结构（核心）
```json
{
  "id": "coa-01",
  "courseId": "coa",
  "title": "第1讲 标题（与 course.json 一致）",
  "objectives": ["学习目标 3-5 条"],
  "keyPoints": ["要点 3-6 条"],
  "minutes": 40,
  "difficulty": 1,
  "prerequisites": ["本章先修（可为空数组）"],
  "keywords": ["3-8 个关键词（供搜索）"],
  "demoRefs": ["float"],
  "refs": ["《深入理解计算机系统》第2章（延伸阅读）"],
  "pro": { "intro": "专业版引言（≥60字）", "sections": [ { "heading": "小节标题", "html": "<p>……</p>" } ] },
  "kid": { "intro": "通俗版引言（≥60字）", "sections": [ { "heading": "小节标题", "html": "<p>……</p>" } ] },
  "glossary": [ { "term": "术语", "def": "一句话解释（零基础能懂）" } ],
  "exercises": [ "…… 10 题，见 §6 ……" ]
}
```
- `pro.sections` 4-6 节；`kid.sections` **与 pro 节数完全一致、顺序对应**（小节标题可以更口语，但必须讲同一批知识点）。
- `demoRefs` 只填 `content/demos/manifest.json` 里已列出的、与本章相关的演示 id；如无写 `[]`。
- `refs` 可选字段：延伸阅读（最多 3 条）。

## 4. 专业版（pro）写作要求
- 建议结构：概念引入 → 定义与术语 → 原理/机制深入 → 例子/推导/计算 → 小结。
- 术语首次出现必须给定义；数学计算给出过程（不能只给结果）。
- 每章至少 1 张自绘 SVG 图（放在 `<figure>…<figcaption>…</figcaption></figure>` 里）。
- 代码示例用 `<pre class="code" data-lang="c">代码</pre>`；伪代码明确标注「伪代码」。
- 总字数（去 HTML 标签后）≥ 1100 个汉字；每节正文 ≥ 150 字。

## 5. 通俗版（kid）写作要求
- 用生活类比/小故事/小实验解释；句子短、口语化；可以用「你可以这样想：」引入。
- 不出现未解释的术语；必须出现时，立刻用一句大白话解释。用具体画面（"快递分拣中心"比"资源调度机制"好）。
- 讲错比讲浅更糟：简化可以，事实不能错；与专业版结论一致。
- 每节 ≥ 120 字；总字数 ≥ 750 汉字。

## 6. 习题规范（每章恰好 10 题）
1. 难度分布：`easy` 4 题、`medium` 4 题、`hard` 2 题（允许 easy 3-5、medium 3-5、hard 1-3 微调，总数必须 10，三档齐备）。
2. 题型至少覆盖：选择题 ≥2、判断题 ≥1、推导/设计题 ≥2、编程/动手题 ≥1（确实没有编程点的章节，用"设计题/动手描述题"顶替编程题）。
3. 每题结构：
```json
{
  "id": "coa-01-e01",
  "level": "easy",
  "type": "choice",
  "stem": "题干（清晰、独立可读；题干里可以有 <code>行内代码</code>）",
  "options": ["A. ……", "B. ……", "C. ……", "D. ……"],
  "answer": "B",
  "solution": {
    "idea": "解题思路，1-2 句",
    "steps": ["第 1 步：……", "第 2 步：……"],
    "result": "最终答案与关键结论",
    "pitfalls": ["常见错误 1：……（为什么错）"],
    "kid": "面向零基础的通俗说明（≥60字）：用生活语言讲清"为什么这样解""
  }
}
```
   - `type` 取值：`choice` / `judge` / `derive` / `design` / `code` / `open`。
   - `judge`：answer 写 "正确" 或 "错误" 并附解析。
   - `derive/design/open` 不写 options。
   - `code` 题额外加：
```json
"code": { "lang": "python", "code": "print('hello')", "output": "hello", "explain": "运行结果说明（这段代码为什么输出这个）" }
```
   - 注意：code.code 字段里如果出现换行，同样用 \n 转义；字段内不要出现未转义的双引号，优先用单引号写 Python 字符串。
   - 代码必须正确可运行；优先 Python；output 必须真实（我们会在验收阶段实际运行）。
4. 难度定义：easy=直接回忆/套用；medium=多步推理/综合运用；hard=设计/证明/容易踩坑。
5. 禁止两题重复；题干里点名相关知识点（章节与知识点的对应关系要明确）。

## 7. SVG 图与配色
- 调色板（直接写 hex 值）：墨色 `#2A2E33`、主色青绿 `#5E9E8F`、砂金 `#C9A96A`、蓝 `#7C9CBF`、红 `#C96A6A`、绿 `#6FA57E`、背景 `#FAF7F2`、描边 `#E4DCCF`。
- SVG 必须写 `viewBox`（如 `0 0 640 240`），宽度自适应（外层 figure 会控制）；形状简单、文字用 `<text>` 且字号 ≥12；不要滤镜/渐变堆叠。
- 图要有信息量：结构图/流程图/对比图/示意图。

## 8. HTML 白名单（pro/kid 的 html、stem）
允许标签：`<p> <ul> <ol> <li> <strong> <em> <code> <pre class="code" data-lang="xx"> <blockquote> <figure> <figcaption> <svg> <table> <thead> <tbody> <tr> <th> <td> <sup> <sub> <br> <h4>`。
禁止：`<script> <style> <iframe> <a> <img>`、任何 `on*` 事件属性、任何外链。
术语首现写法：`<strong>指令流水线</strong>（Instruction Pipeline，把一条指令拆成多步并行处理的技术）`。

## 9. 长度与质量基线（校验脚本会检查）
- objectives 3-5 条；keyPoints 3-6 条；glossary 3-8 条；keywords 3-8 个。
- pro 总字数 ≥1100、kid ≥750；每节 pro ≥150 / kid ≥120；intro 各 ≥60。
- 每章至少 1 个 `<svg`。exercises 必须 10 题、五要素齐全。

## 10. 事实与严谨性
- 数字、协议名、公式务必核对；不确定的细节宁可不写，不要编造。
- 例：TCP 三次握手步骤、IEEE754 字段宽度、时间复杂度等是高频抽查点，写准确。

## 11. 校验命令（每写完一个文件立即跑）
```
node "C:\Users\光的波粒二象性\.openclaw-autoclaw\workspace\.cluster\cs-learn-site\DELIVERY\cs-learn-site\tools\validate-content.js" "<刚写的文件绝对路径>"
```
输出 `PASS` 才能继续；`FAIL` 列表要逐条修复后重跑。若某次命令超过 30 秒无响应，跳过校验、继续写下一章（缺口写进报告）。课程级整课校验由主线统一执行，你不需要跑 `--course` / `--all`。

## 12. 回传报告（写到自己编号的 reports 文件）
`C:\Users\光的波粒二象性\.openclaw-autoclaw\workspace\.cluster\cs-learn-site\reports\subagent_NN.md`
格式：结论 / 证据（文件清单+统计：章节数、题数、字数）/ 分析（亮点与取舍）/ 缺口与风险 / 建议。
