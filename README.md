# ✨ 星伴 · AI 陪伴应用

> 一个温暖治愈的 AI 陪伴 Web 应用，支持接入真实大语言模型（DeepSeek / 通义 / 智谱 / Kimi / OpenAI），也支持离线本地兜底模式。

<p align="center">
  <img src="https://img.shields.io/badge/前端-纯HTML/CSS/JS-blue" alt="纯前端"/>
  <img src="https://img.shields.io/badge/后端-Node.js/Express-green" alt="Express"/>
  <img src="https://img.shields.io/badge/AI-OpenAI兼容-orange" alt="OpenAI Compatible"/>
  <img src="https://img.shields.io/badge/部署-本地一键启动-purple" alt="本地启动"/>
</p>

## 🌟 功能特色

- **🎭 三个陪伴角色** — 小暖（温暖贴心）、小安（宁静温柔）、小星星（元气活泼），每个角色有独立 AI 人设
- **🧠 真实 AI 对话** — 接入 DeepSeek / 通义 / 智谱 / Kimi / OpenAI 等 OpenAI 兼容接口
- **🔐 API Key 安全** — Key 存储在本地后端服务器，绝不暴露在浏览器
- **🛡️ 离线兜底** — 未配置 API Key 时自动降级为本地模板回复，体验不打折
- **💬 上下文记忆** — AI 能记住你们聊过什么，支持多轮对话
- **⌨️ 打字机效果** — AI 回复像真人一样逐字出现
- **🎨 温暖治愈 UI** — 蜜桃奶油色调、漂浮光斑、可爱 emoji 动效
- **📱 响应式设计** — 适配桌面端和移动端

## 📁 项目结构

```
ai-companion/
├── index.html              # 前端单页应用（纯 HTML/CSS/JS）
├── README.md               # 项目说明文档
├── .gitignore              # Git 忽略配置
├── server/
│   ├── server.js           # Express 后端代理服务器
│   ├── package.json        # Node.js 依赖
│   └── config.json         # ⚠️ API Key 配置文件（不提交到仓库）
```

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/你的用户名/ai-companion.git
cd ai-companion
```

### 2. 安装后端依赖

```bash
cd server
npm install
```

### 3. 启动服务

```bash
npm start
```

然后打开浏览器访问 **http://localhost:3001**

> 前端静态文件已集成在后端 Express 中，一个端口搞定前后端，无需额外启动。

### 4. 配置 AI

1. 点击右上角 **⚙️ 设置** 按钮
2. 快速选择服务商（DeepSeek / 通义 / 智谱 / Kimi / OpenAI）
3. 填入你的 **API Key**
4. 点击 **💾 保存设置**
5. 点击 **🔌 测试连接** 验证是否连通

配置成功后，右上角状态会显示 🟢 **在线 · 小暖陪你**

## 🔑 支持的 AI 服务商

| 服务商 | Base URL | 推荐模型 |
|--------|----------|----------|
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |
| **通义千问** | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| **智谱 GLM** | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| **Kimi** | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` |

> 所有服务商必须提供 **OpenAI 兼容接口**（`/v1/chat/completions` 格式）。

## 🏗️ 技术架构

```
┌─────────────────┐
│   浏览器前端     │  ← index.html（纯 HTML/CSS/JS）
│  http://localhost:3001
└────────┬────────┘
         │ fetch /api/chat
         ▼
┌─────────────────┐
│ Express 代理服务 │  ← server.js（Node.js + Express）
│  http://localhost:3001
│  ├─ /api/config  → 配置读写（不暴露 Key）
│  ├─ /api/chat    → 转发到 AI API
│  └─ /            → serve 前端静态文件
└────────┬────────┘
         │ fetch (Bearer Key)
         ▼
┌─────────────────┐
│  AI 服务商 API   │  ← DeepSeek / 通义 / 智谱 / Kimi / OpenAI
│  OpenAI 兼容格式 │
└─────────────────┘
```

### 降级流程

当未配置 API Key、Key 无效或 AI 服务不可用时：

```
浏览器请求 → Express 代理 → AI API 失败 → 本地模板兜底回复
                                           ↓
                                     关键词匹配 + 随机话术
```

## 📝 技术文档

详见 [docs/TECHNICAL.md](docs/TECHNICAL.md) — 包含详细的 API 接口说明、配置格式、角色人设 Prompt、前端交互设计等。

## ⚙️ 配置说明

配置文件位于 `server/config.json`，由后端自动管理，格式如下：

```json
{
  "apiKey": "sk-你的密钥",
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat"
}
```

> ⚠️ **不要将该文件提交到 Git！** 已添加到 `.gitignore`。

## 🎭 陪伴者角色

每个角色有独立的 System Prompt，AI 会根据角色人设生成不同风格的回复：

| 角色 | 风格 | 擅长场景 |
|------|------|----------|
| 🌷 **小暖** | 温暖柔软、善解人意 | 日常聊天、需要鼓励时 |
| 🌙 **小安** | 宁静舒缓、善于倾听 | 深夜倾诉、需要安静陪伴时 |
| ⭐ **小星星** | 元气活泼、热情有趣 | 开心分享、想找乐子时 |

## 🛠️ 开发

### 前端

纯 HTML/CSS/JS 实现，无框架依赖：
- CSS Variables 主题系统
- 纯 CSS 动画（漂浮光斑、呼吸效果、打字指示器）
- 异步 fetch + 打字机逐字渲染
- localStorage 级别的无存储设计（不保留对话历史）

### 后端

Node.js + Express：
- `express.static` 集成前端静态文件
- `cors` 中间件处理跨域
- `fetch` 转发请求到 AI 服务商
- JSON 文件存储配置（本地开发场景）

## 📄 许可证

MIT License — 自由使用、修改和分发。

---

Made with 💗 by 星伴团队
