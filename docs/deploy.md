# 部署指南

三种部署方式按需选择。**功能差异**：静态托管（方案 A）下「账号同步 / 管理员台账」不可用（这两个功能需要后端），浏览课程、双讲解、习题判分、本地进度、导入导出、全部交互动画均正常；需要完整功能用方案 B。

## 方案 A · 静态托管（最快上线）

整个项目就是静态站点（无构建步骤）。

### Netlify
1. 登录 Netlify →「Add new site → Deploy manually」，把整个 `cs-learn-site` 文件夹拖进上传区即可；或连接 Git 仓库（已附 `deploy/netlify.toml`）。
2. 部署完成后得到 `https://<随机名>.netlify.app`，可在 Site settings 里改域名。

### Vercel
1. 「Add New → Project」导入 Git 仓库，Framework 选 **Other**（已附 `deploy/vercel.json`，无需构建命令）。
2. 部署完成后得到 `https://<项目名>.vercel.app`。

### GitHub Pages
1. 把项目推送到 GitHub 仓库。
2. 仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**（已附 `.github/workflows/deploy-pages.yml`）。
3. 手动触发或 push 到 main 即自动部署，地址为 `https://<用户名>.github.io/<仓库名>/`。

> 三个平台均可绑定自定义域名并自动配 HTTPS。

## 方案 B · Node 自托管（全功能）

### 本地 / 局域网
```bash
node server/server.js                    # 默认 http://127.0.0.1:8642
# 局域网内其他设备（手机/平板）访问：
HOST=0.0.0.0 node server/server.js       # Windows PowerShell: $env:HOST="0.0.0.0"; node server/server.js
```
然后同一 Wi-Fi 下的设备访问 `http://<电脑局域网IP>:8642/`（防火墙需放行该端口）。

### VPS / 云主机
```bash
# 任意目录
node server/server.js                    # 建议用 pm2 / systemd 守护
# PORT=80 HOST=0.0.0.0 node server/server.js
```
- 建议前置 Nginx / Caddy 做 HTTPS 与反代（本服务未内置 TLS）。
- 平台托管（Render / Railway 等）：启动命令 `node server/server.js`，注意挂载**持久磁盘**到 `server/data/`，否则重建实例会丢失账号与同步数据。

### 环境变量
| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8642 | 服务端口（被占用自动 +1 重试） |
| `HOST` | 127.0.0.1 | 监听地址；公网/局域网用 `0.0.0.0` |

## 管理员与数据

- **管理员密钥**：服务首次启动时自动生成，打印在启动横幅，并保存在 `server/data/admin-key.txt`。在网站 `#/admin` 页输入即可查看/导出全部同步用户的学习台账。
- **数据备份**：直接复制 `server/data/` 目录（含 users.json、tokens.json、sync/*.json、admin-key.txt）。恢复 = 把目录放回去重启服务。
- 用户密码以 scrypt 加盐哈希存储；同步内容仅学习进度数据。

## 安全注意事项

- 服务面向个人 / 小规模使用设计：接口无速率限制、无 HTTPS（请置于反向代理之后），请勿直接暴露在公网高危环境。
- 公网部署建议：Nginx/Caddy 终结 HTTPS + 限流；定期备份 `server/data/`；管理员密钥仅自己保管。

## 部署后验证

1. 打开首页、任一课程页、任一章节页（确认双讲解切换与习题判分可用）。
2. 打开 `#/demos` 任一演示，操作「重置 / 上一步 / 下一步 / 播放」。
3. （方案 B）注册一个测试账号 → 做一题 → 上传同步 → 换浏览器登录拉取，确认记录一致；`#/admin` 用密钥导出台账。
4. 静态托管时按 F12 确认无 404（同步相关按钮会提示「需要本地服务」，属预期）。
