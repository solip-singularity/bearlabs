# 贝尔实验室 · 计算机知识学习站（从入门到入坟）

**Bearlabs** · 从二进制到人工智能：**11 门课程 · 116 讲 · 双讲解 · 三级习题 · 16 个可动手交互动画**的学习网站。
零第三方依赖：纯 HTML/CSS/JS 前端 + 可选的零依赖 Node 同步服务。

**在线访问**：<https://solip-singularity.github.io/bearlabs/> —— 由 GitHub Pages 自动部署，推送 `main` 分支即自动更新。

## 功能亮点

- **双讲解**：每一讲同时提供「专业版」（大学讲义风格，术语规范、推导完整）与「宝宝巴士版」（生活类比、小学高年级也能听懂），一键切换且保留阅读位置。
- **三级习题**：每讲 10 题（简单 4 / 中等 4 / 困难 2），题型覆盖选择、判断、推导、设计、编程；每题都有「思路 → 分步解答 → 结果 → 常见错误 → 零基础说明」五要素完整解答，编程题代码可实际运行。
- **交互动画**：进程调度、TCP 握手与拥塞控制、内存与指针、浮点数拆解、缓存命中、流水线、排序/查找/图遍历、面向对象建模、编译流水线、神经网络等，全部支持重置 / 上一步 / 播放暂停 / 下一步 / 速度调节与参数调整，每步配旁白。
- **学习台账**：章节进度、答题记录、错题本、学习时长全部本地持久化；支持导出 JSON/CSV、导入恢复；可选账号同步与管理员学习记录导出。
- **多端适配**：桌面 / 平板 / 手机响应式布局，触控目标达标，低性能设备自动降级为分步模式。

## 作者与研究所

- **作者**：Solips-Singularitat。如发现问题，请联系作者邮箱：2451101123@qq.com。
- **研究所专栏**：中国美术学院 网络社会研究所（INS）—— 站点内专栏页 `#/institute`；官网：<https://www.caa-ins.org/>。

## 快速开始

前提：安装 [Node.js](https://nodejs.org/) 18 或更高版本。

**Windows**：双击 `start.bat`。
**macOS / Linux / 通用**：

```bash
node server/server.js        # 或 npm start
```

启动后访问 <http://127.0.0.1:8642/>（端口被占用时自动顺延，以控制台打印的地址为准）。控制台同时会打印**管理员密钥**（也可在 `server/data/admin-key.txt` 查看），用于「#/admin」学习记录台账页。

> 没有本地服务也能用：把项目交给任意静态托管（见 `docs/deploy.md`）即可浏览与学习，只是「账号同步 / 管理员台账」这两个需要后端的功能不可用，其余功能完全一致。

## 目录结构

```
cs-learn-site/
├─ index.html              # 应用入口（SPA）
├─ css/site.css            # 全站样式（Takram 柔和科技风设计系统）
├─ assets/                  # 图片资源：作者头像、网研所图标（见 docs/asset-ledger.md）
├─ js/
│  ├─ util.js              # 工具库（DOM/存储/弹窗/图标）
│  ├─ store.js             # 学习进度、错题本、导入导出、同步客户端
│  ├─ demokit.js           # 交互动画统一引擎（播放/单步/旁白/降级）
│  ├─ views.js             # 全部页面视图（首页/课程/章节/练习/进度/管理…）
│  ├─ app.js               # 路由与搜索
│  └─ demos/<id>.js        # 每个交互动画一个脚本
├─ content/
│  ├─ courses/manifest.json            # 课程清单与学习路径
│  ├─ courses/<课程>/course.json       # 课程—单元—章节结构
│  ├─ courses/<课程>/<章>.json         # 每讲内容：双讲解 + 习题 + 图示
│  ├─ demos/manifest.json              # 演示清单
│  ├─ demos/<id>.json                  # 演示使用说明元数据
│  ├─ search-index.json / stats.json   # 构建产物（npm run build 重新生成）
├─ server/server.js          # 零依赖 Node 服务：静态托管 + 同步 API + 管理台账
├─ tools/                    # 校验/构建/审计/冒烟/截图 脚本
├─ docs/                     # 规范与文档（写作指南、演示规格、部署、自检报告…）
└─ start.bat / start.sh      # 一键启动
```

## 使用指南

- **学习路径**：首页 → 「学习路径」有四条主线（轻松起步 / 计算机核心 / 进阶深造 / 大厂冲刺），按顺序学最省力。
- **章节页**：目录进入任意一讲；顶部可在「专业版 / 宝宝巴士版」之间切换（阅读位置不丢）；页内含要点速览、术语表、互动演示与习题区；读完点「完成本讲」计入进度。
- **练习中心**：按课程 / 章节 / 难度筛选刷题，也可只练「错题本」；选择与判断题自动判分，推导 / 设计 / 编程题对照参考解答后自评。
- **进度面板**（#/dashboard）：已学章节、正确率、学习时长、近 14 天活跃、错题本管理；支持导出 JSON 备份 / CSV 台账、导入恢复、一键重置。
- **账号同步**（可选）：进度面板内注册 / 登录后可上传 / 下载学习记录，用于跨设备（需要本地 Node 服务在运行）。
- **管理员台账**（#/admin）：输入启动时打印的管理员密钥，可查看全部同步用户的学习摘要并导出 CSV / JSON。
- **演示实验室**（#/demos）：16 个交互动画的独立入口页，每个都有「这个演示帮你理解什么」与操作提示。
- **关于与研究所**：「关于」（#/about）包含作者信息与联系邮箱；「网络社会研究所」（#/institute）为独立专栏，含官网入口。

## 数据与隐私

- 默认所有学习数据保存在**本机浏览器** localStorage（键 `cslearn.progress.v1`），不上传任何服务器；清理浏览器数据前请先在进度面板导出备份。
- 同步账号仅保存用户名与 scrypt 加盐哈希的密码；同步内容只有学习进度数据。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm start` | 启动本地服务（= `node server/server.js`） |
| `npm run validate` | 校验全部课程内容（结构 / 题量 / 双讲解 / 解答要素） |
| `npm run build` | 重新生成搜索索引与统计（content/search-index.json、stats.json） |
| `npm run audit` | 生成覆盖矩阵与审计报告（docs/coverage-matrix.csv 等） |
| `npm run smoke` | 启动服务并跑 13 项端到端冒烟检查 |

## 新增 / 修改内容

- **新增或修改章节 / 习题**：阅读 `docs/AUTHORING-GUIDE.md`（字段结构、质量基线、校验命令），按 `content/courses/<课程>/<章>.json` 的现有格式编辑，保存后跑 `npm run validate`。
- **新增课程**：在 `content/courses/manifest.json` 登记课程（id、图标、学习路径），再建 `content/courses/<id>/course.json` 与章节文件。
- **新增交互动画**：阅读 `docs/demo-spec.md`，在 `js/demos/<id>.js` 实现（照 `js/demos/sorting.js` 的帧序列模式）并在 `content/demos/` 写元数据、在 `content/demos/manifest.json` 登记。
- 改完内容记得 `npm run build` 刷新搜索索引，并跑 `npm run validate`。

## 图片资源与换图

站点图片统一放在 `assets/` 目录，更换图片只需覆盖同名文件（无需改代码）：

| 图片 | 路径 | 出现位置 |
|---|---|---|
| 作者头像 | `assets/author/avatar.jpg` | 关于页（#/about）作者卡 |
| 作者迷你头像 | `assets/author/avatar-mini.jpg` | 页脚作者入口 |
| 网研所图标 | `assets/institute/caa-ins-icon.jpg` | 研究所专栏（#/institute）、关于页、页脚 |

完整说明、来源备注与聚焦点调整方法见 [docs/asset-ledger.md](docs/asset-ledger.md)。

## 更新记录

- **v1.1（2026-09-16）**：站点更名为「贝尔实验室 · 计算机知识学习站（从入门到入坟）」（英文名 Bearlabs）；新增作者信息模块与网络社会研究所专栏；接入作者头像与网研所图标；页脚与站点元信息更新；新增图片资源台账。涉及文件：`index.html`、`css/site.css`、`js/app.js`、`js/views.js`、`server/server.js`、`package.json`、`assets/`（新增）、`docs/asset-ledger.md`（新增）。
- **v1.2（2026-09-22）**：新增「**人工智能的数学基础**」课程（8 讲：数据的形状 / 矩阵运算 / 特征值 / 奇异值分解 SVD / 导数与梯度下降 / 概率与熵 / 概率与贝叶斯 / 综合实战；参考菜鸟教程《AI 数学基础》知识脉络改编）；新增「**大厂面试实战题库**」课程（8 讲 80 题：线性结构与哈希 / 操作系统与网络 / AI 与手写代码 / 备考路径与自查清单 / 数据库与缓存 / 系统设计与分布式 / 海量数据 / Linux 与 Git；每题标注来源，口径为 LeetCode / 剑指Offer / 牛客网专题 / 经典教材）；manifest 新增「大厂冲刺线」学习路径；离散数学课程零改动。涉及文件：`content/courses/aimath/`（新增 8 讲）、`content/courses/interview/`（新增 8 讲）、`content/courses/manifest.json`、`docs/OUTLINES.md`、`content/stats.json`（构建产物）、`content/search-index.json`（构建产物）、`docs/screenshots/v12/`（新增 6 张截图）。维护方式见「新增 / 修改内容」一节。
- **v1.2.1（2026-09-22）**：修复「学习路径」页（#/paths）课程卡片无法点击进入课程的问题（卡片改为链接，支持键盘与中键打开）；首页 / 路径页 / 关于页的课程数与题量文案更新为 11 门课 / 116 讲 / 1160+ 题；静态资源缓存戳更新（`?v=1f8c93d2`）。涉及文件：`js/views.js`、`index.html`、`readme.md`、`docs/screenshots/v12/paths-desktop.png`（新增）。

## 部署

见 [docs/deploy.md](docs/deploy.md)：静态托管（Netlify / Vercel / GitHub Pages，附配置文件在 `deploy/`）、Node 自托管（本地 / 局域网 / VPS）、数据备份与安全注意事项。

## 已知限制

- 公网部署为静态托管时，「账号同步 / 管理员台账」不可用（其余功能不受影响）；需要这两项时请用 Node 自托管或部署云函数版后端。
- 课程内容为原创讲解，覆盖大学本科核心与研究生入门导读深度，不代替教材与系统课程。
- 学习记录同步按「后写优先」合并，不支持多设备同时编辑的细粒度冲突合并。

## 技术说明

- 前端零依赖、无构建步骤；内容为结构化 JSON，站点运行时按需加载。
- 无障碍：语义化标签、键盘可达、`focus-visible` 焦点态、演示画布 aria-label、`prefers-reduced-motion` 自动降级。
- 兼容：Chrome / Edge / Firefox / Safari 现代版本；Node ≥ 18。
- 设计体系与决策留档见 [docs/design-notes.md](docs/design-notes.md)。
