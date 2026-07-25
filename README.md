# 模拟器阅读器

手机优先的暗夜 AI 文字模拟器客户端：导入玩法规则、按回合阅读、点选项或自定义行动推进。

## 本地运行

需要 Node.js 18+。

```bash
cd ai-simulator
npm install
npm run dev
```

终端会打印：

- Local：`http://localhost:5173/`
- Network：`http://192.168.x.x:5173/` ← **手机连同一 Wi‑Fi 打开这个**

## 手机随时可玩（Vercel）

1. 把本项目推到 GitHub
2. 打开 [vercel.com](https://vercel.com) → 用 GitHub 登录 → Import 该仓库
3. 框架选 Vite，直接 Deploy
4. 用手机打开给你的 `https://xxx.vercel.app`，可「添加到主屏幕」

`vercel.json` 已配置好 SPA 路由。

## 电脑 ↔ 手机同步进度

进度存在浏览器本地，两端不会自动相通。在 **设定 → 进度同步**：

1. 设备 A：导出全部进度 / 复制到剪贴板（可用微信发给自己）
2. 设备 B：粘贴后点「合并导入」

勾选「包含 API Key」可把密钥一并带走（只在自己的设备间用）。

## 使用步骤

1. **设定** → 填写 OpenAI 兼容 API
2. 粘贴或上传模拟器规则
3. 大厅 → 新建对局 → 复制提纲填写 → 开玩
4. 对局左上角 **大厅** 可切换存档；**回合** 可回看历史

## 技术说明

- 存档与 API Key 存在浏览器 `localStorage`
- 每回合请求只带：压缩规则 + 角色写入 + 近 2 回合全文 + 更早摘要
- 模型需返回约定 JSON（应用内已写进 system 提示）
