# re-dp-portal

本机 DeepSeek 查询入口。页面在本地启动，问答走官方 API（思考 + 智能搜索）。

```bash
cp .env.example .env
# 填入 DEEPSEEK_API_KEY
npm install
npm run dev
```

打开 http://127.0.0.1:5173/ 。提交问题后进入本地 `/chat/:id`：思考过程、智能搜索来源、侧栏会话历史和新对话都在本机；问答仍走官方 API。会话记录保存在浏览器 `localStorage`，不会同步官网账号。
