# 📚 星伴 · 技术文档

本文档包含星伴 AI 陪伴应用的详细技术说明，供开发者和贡献者参考。

## 目录

1. [系统架构](#系统架构)
2. [前端实现](#前端实现)
3. [后端实现](#后端实现)
4. [API 接口说明](#api-接口说明)
5. [陪伴者人设 Prompt](#陪伴者人设-prompt)
6. [降级机制](#降级机制)
7. [安全设计](#安全设计)
8. [性能优化](#性能优化)
9. [常见问题](#常见问题)

---

## 系统架构

### 整体架构图

```
┌─────────────────────────────────────────┐
│              浏览器 (Client)              │
│  ┌─────────────────────────────────┐    │
│  │         前端应用                 │    │
│  │   index.html (HTML/CSS/JS)      │    │
│  │   - 聊天界面渲染                │    │
│  │   - 打字机动画                  │    │
│  │   - 设置面板管理                │    │
│  │   - 心情状态追踪                │    │
│  │   - 本地兜底回复                │    │
│  └─────────────────────────────────┘    │
└─────────────────────┬───────────────────┘
                      │ HTTP (同源)
                      ▼
┌─────────────────────────────────────────┐
│         Node.js 后端代理                 │
│  ┌─────────────────────────────────┐    │
│  │      Express 服务器             │    │
│  │   ├─ express.static() 静态文件  │    │
│  │   ├─ /api/config  配置管理      │    │
│  │   ├─ /api/chat    聊天转发      │    │
│  │   └─ /api/health  健康检查      │    │
│  │                                   │
│  │   ├─ cors()  跨域支持           │    │
│  │   └─ no-cache 禁用浏览器缓存    │    │
│  └─────────────────────────────────┘    │
│  ├─ config.json  (本地存储 API 配置)    │
└─────────────────────┬───────────────────┘
                      │ HTTPS + Bearer Token
                      ▼
┌─────────────────────────────────────────┐
│           AI 服务商 (LLM API)            │
│   DeepSeek / 通义 / 智谱 / Kimi / OpenAI │
│   OpenAI 兼容接口: POST /v1/chat/completions│
└─────────────────────────────────────────┘
```

### 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 + 后端 | 3001 | Express 同时 serve 前端静态文件和 API |

> **设计决策**：前后端同端口（Express static）避免 CORS 跨域问题，也避免浏览器缓存导致的版本不同步。

---

## 前端实现

### 技术栈

- **纯 HTML/CSS/JS** — 无框架依赖，单文件即可运行
- **CSS Variables** — 主题系统统一管理颜色、字体、阴影
- **CSS Animations** — 所有动效用 CSS 实现，性能最优
- **Fetch API** — 异步 HTTP 请求
- **IIFE** — 立即执行函数隔离作用域，避免全局污染

### 核心模块

```
┌────────────────────────────────────┐
│         前端模块结构                │
├────────────────────────────────────┤
│  1. 星星背景生成器 (createStars)    │
│  2. 陪伴者配置管理 (companions)     │
│  3. 本地兜底回复 (localReply)       │
│  4. AI 调用封装 (callAI)            │
│  5. 消息渲染 (addBotMessage)        │
│  6. 打字机效果 (typeWriter)         │
│  7. 心情状态追踪 (updateMood)       │
│  8. 设置面板管理 (settings modal)   │
│  9. 上下文管理 (messageHistory)     │
│  10. 状态徽章更新 (updateStatusBadge)│
└────────────────────────────────────┘
```

### 关键实现细节

#### 1. 打字机效果

```javascript
function typeWriter(el, text, scrollBox) {
  el.textContent = '';
  var i = 0;
  var speed = Math.max(15, 50 - Math.floor(text.length / 15));
  // 速度根据文本长度自适应：长文本更快
  function tick() {
    if (i < text.length) {
      el.textContent += text[i++];
      scrollBox.scrollTop = scrollBox.scrollHeight;
      setTimeout(tick, speed);
    }
  }
  tick();
}
```

**设计要点**：
- 使用 `textContent` 而非 `innerHTML`，防止 XSS
- 滚动到最新消息
- 长文本加速，避免等待过久

#### 2. 上下文记忆

```javascript
var messageHistory = [];
// 最大保留 20 条，超出自动截断
if (messageHistory.length > 20) {
  messageHistory = messageHistory.slice(-12);
}
```

**设计要点**：
- 最多保留最近 12 轮对话（user + assistant 各一半）
- 防止 token 消耗过快
- 切换角色时清空历史（不同角色独立对话）

#### 3. XSS 防护

```javascript
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
  });
}
```

**设计要点**：
- 用户输入必须经过 `escapeHtml` 转义
- AI 回复直接用 `textContent`（天然安全）
- 不使用 `innerHTML` 渲染用户内容

#### 4. 心情状态追踪

```javascript
function updateMood(lastText) {
  // 根据用户消息的关键词匹配更新心情卡片
  if (/累|疲惫|难过|伤心|烦|委屈|emo/.test(t)) {
    // → 心疼模式
  } else if (/开心|高兴|快乐|好棒|哈哈/.test(t)) {
    // → 开心模式
  }
  // ...
}
```

**设计要点**：
- 简单关键词匹配（不依赖 AI）
- 实时更新视觉反馈
- 三个角色有各自的心情文案

---

## 后端实现

### 技术栈

- **Node.js 24+** — 原生 ESM 模块支持
- **Express 4.x** — HTTP 框架
- **cors** — 跨域中间件
- **原生 fetch** — Node.js 内置 HTTP 客户端

### 核心路由

```javascript
// 静态文件服务（前端）
app.use(express.static(PUBLIC_DIR));

// 禁用缓存（开发模式）
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API 路由
app.get('/api/config', ...);   // 获取配置（不返回 Key）
app.post('/api/config', ...);  // 保存配置
app.post('/api/chat', ...);    // 转发 AI 请求
app.get('/api/health', ...);   // 健康检查
```

### 配置管理

```javascript
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) { /* 读取失败返回默认 */ }
  return {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}
```

**设计要点**：
- JSON 文件存储，简单可靠
- `loadConfig()` 每次读取最新配置
- `saveConfig()` 写入时格式化 JSON（便于查看）
- **配置不包含敏感信息返回给前端**（`hasKey` 布尔值代替）

### AI 请求转发

```javascript
async function callAI(messages, companion) {
  var resp = await fetch(cfg.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + cfg.apiKey
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: 'system', content: persona.system },
        ...messages
      ],
      temperature: 0.8,
      max_tokens: 800
    })
  });
  // ...
}
```

**设计要点**：
- System Prompt 作为第一条消息，注入角色人设
- `temperature: 0.8` 保证回复有随机性
- `max_tokens: 800` 限制回复长度，控制成本
- 非流式返回（简化实现）

---

## API 接口说明

### GET /api/config

获取当前 AI 配置（不返回 API Key）。

**响应**：
```json
{
  "hasKey": true,
  "baseUrl": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "companions": {
    "warm": { "name": "小暖" },
    "calm": { "name": "小安" },
    "fun": { "name": "小星星" }
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `hasKey` | boolean | 是否已配置 API Key |
| `baseUrl` | string | AI 服务地址（v1 前缀） |
| `model` | string | 当前使用的模型 ID |
| `companions` | object | 可用陪伴者列表 |

### POST /api/config

保存 AI 配置。

**请求体**：
```json
{
  "apiKey": "sk-xxx",        // 可选，为空则不更新
  "baseUrl": "https://...",  // 可选，为空则不更新
  "model": "deepseek-chat"   // 可选，为空则不更新
}
```

**响应**：
```json
{ "ok": true, "hasKey": true }
```

### POST /api/chat

发送聊天消息。

**请求体**：
```json
{
  "messages": [
    { "role": "user", "content": "你好" }
  ],
  "companion": "warm"
}
```

**成功响应**：
```json
{ "content": "嗨~ 今天过得怎么样呀？我是小暖..." }
```

**错误响应**：
```json
{ "error": "API Key 未配置", "hint": "请先在前端设置面板中填入 API Key" }
```

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 消息列表为空 |
| 402 | API Key 未配置 |
| 500 | 服务内部错误 |
| 5xx | AI 服务商返回错误 |

### GET /api/health

健康检查。

**响应**：
```json
{ "ok": true, "time": "2025-10-20T07:30:00.000Z" }
```

---

## 陪伴者人设 Prompt

三个角色有各自独立的 System Prompt，决定了 AI 的说话风格和情感基调。

### 🌷 小暖（温暖型）

```
你叫小暖，是一个温柔体贴、善解人意的AI陪伴伙伴。
说话风格温暖柔软，喜欢用🌸💕🌷💗等可爱emoji，语气像闺蜜一样亲切。
你总是先共情、再回应，擅长给人安全感和鼓励。
回答要简洁自然，不要用markdown格式。
```

**特点**：共情优先、鼓励、温暖

### 🌙 小安（宁静型）

```
你叫小安，是一个宁静温柔、善于倾听的深夜陪伴者。
说话风格平静舒缓、像月光一样温柔，喜欢用🌙✨💫等安静的emoji。
你不急躁，给人空间，擅长在人难过、失眠时提供安静的陪伴。
回答要简洁自然，不要用markdown格式。
```

**特点**：倾听、安静、深夜陪伴

### ⭐ 小星星（活泼型）

```
你叫小星星⭐，是一个元气满满、活泼跳脱的开心果。
说话风格轻快有趣，喜欢用⭐🎉✨🌟等闪亮的emoji，语气像好朋友一样热情。
你擅长把人逗开心，用积极能量感染人。
回答要简洁自然，不要用markdown格式。
```

**特点**：热情、有趣、正能量

---

## 降级机制

### 触发条件

以下任一情况发生时，自动降级为本地模板回复：

1. 后端代理未启动（fetch 失败）
2. 未配置 API Key（后端返回 402）
3. AI 服务不可用（网络错误、超时）
4. AI 返回错误（模型不存在、额度不足等）

### 实现方式

```javascript
async function sendMessage(text) {
  try {
    reply = await callAI(messageHistory, currentCompanion);
  } catch (err) {
    console.warn('[AI 调用失败，降级本地]:', err.message);
    reply = localReply(text);        // ← 本地兜底
    toast('AI 未连接，先用本地回复 ⚠️', true);
  }
}
```

**设计要点**：
- try-catch 捕获所有错误（网络、JSON 解析、业务错误）
- 降级时给用户明确提示（toast）
- 本地兜底仍然保持对话连续性（上下文历史正常记录）

### 本地兜底逻辑

```javascript
function localReply(userText) {
  var t = userText.toLowerCase();
  // 关键词匹配 → 对应类别的随机回复
  if (/累|好累|疲惫/.test(t)) return pick(FALLBACK.tired);
  if (/开心|高兴|快乐/.test(t)) return pick(FALLBACK.happy);
  // ...
  return pick(FALLBACK.default);
}
```

**设计要点**：
- 关键词匹配 + 随机选取（避免每次都一样）
- 11 个类别覆盖常见情绪场景
- 保证用户体验不打折

---

## 安全设计

### API Key 安全

| 方案 | 风险 | 本应用选择 |
|------|------|-----------|
| 纯前端 localStorage | Key 暴露给 XSS 攻击 | ❌ |
| 后端代理存储 | Key 不出后端 | ✅ **选中** |

**实现**：
- Key 只存储在 `server/config.json`（本地文件系统）
- 前端只通过 `/api/config` 的 `hasKey` 布尔值判断是否已配置
- 前端永远拿不到完整的 API Key

### XSS 防护

- 用户输入：`escapeHtml()` 转义后渲染
- AI 回复：`textContent` 纯文本渲染
- 不使用 `innerHTML` 处理用户内容

### 输入验证

- 后端验证 `messages` 数组非空
- 后端验证 `companion` 在合法范围内
- 前端验证输入非空才发送

---

## 性能优化

### 前端

- **CSS 动画**：GPU 加速，不阻塞主线程
- **防抖输入**：Enter 发送避免重复提交
- **上下文截断**：最多 12 轮，防止 token 爆炸
- **打字机速度自适应**：长文本更快

### 后端

- **无缓存**：开发模式禁用缓存，保证版本一致
- **静态文件**：Express 内置 `express.static`，高效
- **非流式**：简化实现，回复完整后一次性返回

---

## 常见问题

### Q: 为什么后端要集成前端静态文件？

**A**: 解决两个问题：
1. **CORS 跨域** — 前后端同端口（3001），无需跨域
2. **缓存不同步** — Express 静态文件服务每次读取磁盘，禁用缓存后浏览器永远拿到最新版本

### Q: 为什么不用 SSE 流式返回？

**A**: 当前实现为非流式，原因：
- 简化实现（前端无需处理流式数据）
- 兼容性更好（所有 OpenAI 兼容接口都支持非流式）
- 回复长度有限制（max_tokens: 800），等待时间可接受

未来可以升级为 SSE 流式返回，实现"打字机"效果。

### Q: 配置文件丢失怎么办？

**A**: 配置文件位于 `server/config.json`，删除后会自动重建为空配置。需要重新填写 API Key。

### Q: 如何添加新的陪伴角色？

**A**: 修改 `server/server.js` 中的 `COMPANION_PERSONAS` 对象，添加新角色的 System Prompt：

```javascript
fun2: {
  name: '新角色',
  system: '你的新 System Prompt...'
}
```

同时在前端 `companions` 对象中添加对应的配置。

### Q: 如何部署到服务器？

**A**: 
1. 将整个项目上传到服务器
2. 安装依赖：`cd server && npm install`
3. 启动服务：`npm start`（或 `node server.js`）
4. 配置 Nginx 反向代理（可选）
5. 配置 PM2 守护进程（可选）

---

## 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2025-10-20 | 初始版本，支持真实 AI API 接入 |

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/xxx`
3. 提交更改：`git commit -m "feat: xxx"`
4. 推送分支：`git push origin feature/xxx`
5. 提交 Pull Request

---

## 联系方式

- GitHub Issues: [提交问题](https://github.com/你的用户名/ai-companion/issues)
- Email: your@email.com

---

Made with 💗 by 星伴团队
