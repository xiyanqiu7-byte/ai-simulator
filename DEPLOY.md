# 跟着做：3 步让手机随时打开

本地代码已经准备好（在 `C:\Users\28578\ai-simulator`）。你只需要在浏览器完成账号和点击部署。

---

## 第 1 步：注册两个免费账号（约 5 分钟）

已尝试在浏览器打开注册页。若没有弹出，请手动打开：

1. **GitHub（放代码）**  
   https://github.com/signup  
   - 邮箱注册即可  
   - 若已有账号：直接登录 https://github.com/login

2. **Vercel（挂上网）**  
   https://vercel.com/signup  
   - 务必点 **Continue with GitHub**（用同一个 GitHub 登录）  
   - 按提示授权即可

做完第 1 步后，回复我一句：「账号好了」，并告诉我你的 **GitHub 用户名**（个人主页上的名字，例如 `zhangsan`）。

---

## 第 2 步：在 GitHub 新建空仓库

1. 打开：https://github.com/new  
2. Repository name 填：`ai-simulator`  
3. 选 **Public**  
4. 下面的 README / .gitignore / license **都不要勾选**  
5. 点绿色按钮 **Create repository**

创建成功后页面会显示一个地址，类似：

`https://github.com/你的用户名/ai-simulator.git`

把这个地址发给我，或只发用户名也可以，我帮你把电脑上的代码推上去。

---

## 第 3 步：在 Vercel 一键上线

1. 打开：https://vercel.com/new  
2. 在列表里找到 `ai-simulator`，点 **Import**  
3. 什么都不用改，直接点 **Deploy**  
4. 等 1～2 分钟出现成功页面  
5. 点开域名（形如 `https://ai-simulator-xxxx.vercel.app`）  
6. 用手机浏览器打开这个链接 → 可「添加到主屏幕」

---

## 上线后怎么玩

1. 手机打开链接 → **设定** 里填 API Key（和电脑一样）  
2. 电脑上的存档不会自动出现，用 **设定 → 进度同步** 复制过去  
3. 以后若改了代码，只要再 `git push`，网站会自动更新

---

## 你现在要做的事（最短）

- [ ] 注册/登录 GitHub  
- [ ] 用 GitHub 登录 Vercel  
- [ ] 回复我：GitHub 用户名（或仓库地址）  

我收到后帮你执行推送命令，然后告诉你怎么点 Deploy。
