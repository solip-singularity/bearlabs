# 图片资源与引用台账（asset-ledger）

> 站点所有用户可见图片资源及其引用位置。**换图只需替换同名文件，无需修改任何代码。**

## 资源清单

| 编号 | 文件 | 存放路径 | 规格 | 引用位置 | 来源 / 授权备注 |
|---|---|---|---|---|---|
| 图片1 | `avatar-original.jpg` | `assets/author/avatar-original.jpg` | 891×1097（原图备份） | 不直接引用（保留源文件） | 用户提供（作者头像原图） |
| 图片1a | `avatar.jpg` | `assets/author/avatar.jpg` | 480×480 / 35KB | 关于页（`#/about`）作者信息卡 | 由原图焦点裁剪压缩生成 |
| 图片1b | `avatar-mini.jpg` | `assets/author/avatar-mini.jpg` | 96×96 / 2KB | 页脚「作者与研究所」入口 | 由原图裁剪压缩生成 |
| 图片2 | `caa-ins-icon.jpg` | `assets/institute/caa-ins-icon.jpg` | 155×155 / 3KB | 研究所专栏页（`#/institute`）、关于页入口卡、页脚 | 用户提供（中国美术学院网络社会研究所图标） |
| 过程稿 | `avatar-cand-a.jpg`、`avatar-cand-b.jpg`、`avatar-compare.png`、`avatar-round-preview.png` | `assets/author/` | — | 不直接引用 | 由原图派生的裁剪候选与对照稿（制作过程留存，可安全删除） |

## 替换方式（三步，无需改代码）

1. 准备新图：头像建议正方形、≥480px；图标建议正方形、≥155px。
2. 用新图**覆盖同名文件**：
   - 换作者头像 → 覆盖 `assets/author/avatar.jpg` 与 `assets/author/avatar-mini.jpg`（迷你版可由大头像缩放生成，或直接用同一张）。
   - 换研究所图标 → 覆盖 `assets/institute/caa-ins-icon.jpg`。
3. 刷新页面确认。若需调整圆形头像的聚焦位置（比如人物偏左/偏右），只需修改 `css/site.css` 中 `.author-avatar` 的 `object-position`（默认 `50% 30%`）。

## 说明

- 所有引用均使用相对路径（`assets/...`），本地服务与静态托管下均正常加载。
- 替代文本（alt）：头像为「作者头像：Solips-Singularitat」；图标为「中国美术学院网络社会研究所（INS）图标」。
- 页面内展示尺寸与原始尺寸对照：头像 96×96 显示（提供 480px 版本，高清屏清晰）；页脚迷你头像 20×20 显示（提供 96px 版本）；图标 44–72px 显示（提供 155px 版本）。
- 未经授权的第三方图片请勿放入本目录；本目录内素材来源见上表。
