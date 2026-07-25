# 手机随时打开 · 部署指南（跟着做即可）

目标：得到一个网址，例如 `https://ai-simulator-xxx.vercel.app`，手机浏览器打开就能玩。

你需要两个免费账号（如果已有可跳过注册）：

1. **GitHub**（放代码）：https://github.com/signup
2. **Vercel**（把网页挂上网）：https://vercel.com/signup  
   → 选 **Continue with GitHub**，用同一个 GitHub 登录最省事。

---

## 第一步：确认本机已准备好

在项目文件夹打开终端，应能运行：

```bash
git --version
node -v
```

如果还没有，已由助手帮你安装 Git / Node。

---

## 第二步：把代码推到 GitHub

### 2.1 在 GitHub 新建空仓库

1. 打开 https://github.com/new
2. Repository name 填：`ai-simulator`（随便起名也可以）
3. 选 **Public**
4. **不要**勾选 “Add a README”
5. 点 **Create repository**

### 2.2 按页面提示推送（或让助手帮你执行）

创建仓库后，GitHub 会显示类似命令。在 `C:\Users\28578\ai-simulator` 里执行：

```bash
git init
git add .
git commit -m "Initial commit: AI simulator reader"
git branch -M main
git remote add origin https://github.com/你的用户名/ai-simulator.git
git push -u origin main
```

推送时浏览器可能会弹出登录 GitHub，按提示完成即可。

---

## 第三步：用 Vercel 一键上线

1. 打开 https://vercel.com/new
2. 用 GitHub 登录后，找到刚才的 `ai-simulator` 仓库，点 **Import**
3. 框架会自动识别为 **Vite**，一般不用改
4. 点 **Deploy**
5. 等 1～2 分钟，出现 **Congratulations**
6. 点开给的域名，复制下来，发到手机打开

以后你改代码并 `git push`，Vercel 会自动重新部署。

---

## 第四步：手机上更好用

1. 用手机浏览器打开 Vercel 给你的链接
2. Safari / Chrome 里选「添加到主屏幕」
3. 在设定里填写 API Key（和电脑一样）
4. 用「进度同步」在电脑和手机之间复制存档

注意：电脑和手机的进度不会自动同步，玩完用设定页的「复制进度 / 合并导入」即可。

---

## 常见问题

**Q：Deploy 失败？**  
看 Vercel 的 Build Logs。本项目是标准 Vite，一般直接成功。

**Q：打开是空白页？**  
确认 `vercel.json` 已在仓库里（本项目已包含）。

**Q：不想用 GitHub？**  
也可以安装 Vercel CLI 后在本机登录部署，但 GitHub 方式最不容易出错，推荐用上面的流程。
