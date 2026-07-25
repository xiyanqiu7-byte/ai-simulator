# 手机随时打开（已部署后）

你的代码在：[https://github.com/xiyanqiu7-byte/ai-simulator](https://github.com/xiyanqiu7-byte/ai-simulator)

## 能不能离开 Wi‑Fi 玩？

**可以。** 只要打开 Vercel 给你的 `https://….vercel.app` 链接，手机用流量、电脑用别的网络都行，**不需要同一 Wi‑Fi**。

同一 Wi‑Fi 只是以前「电脑本地 `npm run dev`」时的临时办法，上线后不用再管它。

## 日常用法

1. 电脑、手机都收藏同一个 Vercel 链接  
2. 各设备在「设定」里填一次 API Key  
3. 换设备接着玩：设定 → 复制进度 → 发到另一台 → 合并导入  

## 以后改了代码怎么更新网站？

在项目目录执行：

```bash
git add .
git commit -m "说明改了什么"
git push
```

Vercel 会自动重新部署，一两分钟后刷新链接即可。
