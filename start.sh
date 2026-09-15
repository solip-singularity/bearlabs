#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "需要先安装 Node.js 18+（https://nodejs.org/）"; exit 1
fi
echo "正在启动「贝尔实验室 · 计算机知识学习站」本地服务… http://127.0.0.1:8642/"
(sleep 2; command -v xdg-open >/dev/null && xdg-open http://127.0.0.1:8642/ || true) &
node server/server.js
