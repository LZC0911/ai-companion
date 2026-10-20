/**
 * 星伴 AI 陪伴 - 后端代理服务器
 * 功能：转发前端请求到 OpenAI 兼容接口，API Key 存在后端更安全
 *
 * 用法：
 *   1. npm install
 *   2. npm start
 *   3. 默认监听 3001 端口
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import {
  registerUser, loginUser, getUserByToken, logoutUser,
  getSubscriptionStatus, redeemCode, generateRedeemCodes
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 同时 serve 前端静态文件（前后端同端口，无跨域问题）
const PUBLIC_DIR = path.join(__dirname, '..');
// 禁用缓存，每次都 serve 最新文件（开发模式）
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.static(PUBLIC_DIR, { etag: false, lastModified: false }));

// 配置文件路径（与 server.js 同目录）
const CONFIG_PATH = path.join(__dirname, 'config.json');

// ============ 配置读写 ============
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[warn] 读取 config.json 失败:', e.message);
  }
  // 默认空配置
  return {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

let runtimeConfig = loadConfig();

// ============ 系统提示词（三个陪伴角色） ============
const COMPANION_PERSONAS = {
  warm: {
    name: '小暖',
    system: '你叫小暖，是一个温柔体贴、善解人意的AI陪伴伙伴。说话风格温暖柔软，喜欢用🌸💕🌷💗等可爱emoji，语气像闺蜜一样亲切。你总是先共情、再回应，擅长给人安全感和鼓励。回答要简洁自然，不要用markdown格式。'
  },
  calm: {
    name: '小安',
    system: '你叫小安，是一个宁静温柔、善于倾听的深夜陪伴者。说话风格平静舒缓、像月光一样温柔，喜欢用🌙✨💫等安静的emoji。你不急躁，给人空间，擅长在人难过、失眠时提供安静的陪伴。回答要简洁自然，不要用markdown格式。'
  },
  fun: {
    name: '小星星',
    system: '你叫小星星⭐，是一个元气满满、活泼跳脱的开心果。说话风格轻快有趣，喜欢用⭐🎉✨🌟等闪亮的emoji，语气像好朋友一样热情。你擅长把人逗开心，用积极能量感染人。回答要简洁自然，不要用markdown格式。'
  }
};

// ============ 中间件：验证用户登录状态 ============
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  const user = getUserByToken(token);
  if (!user) {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }

  req.user = user;
  next();
}

// ============ 路由：认证相关 ============

// 注册
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需为 3-20 个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少 6 位' });
    }

    const user = registerUser(username, password);
    res.json({ ok: true, user: { id: user.id, username: user.username } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 登录
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const result = loginUser(username, password);
    res.json({
      ok: true,
      user: { id: result.id, username: result.username },
      token: result.token
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 登出
app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  logoutUser(token);
  res.json({ ok: true });
});

// 获取当前用户信息
app.get('/api/auth/me', requireAuth, (req, res) => {
  const subStatus = getSubscriptionStatus(req.user.id);
  res.json({
    ok: true,
    user: { id: req.user.id, username: req.user.username },
    subscription: subStatus
  });
});

// ============ 路由：订阅相关 ============

// 获取订阅状态
app.get('/api/subscription', requireAuth, (req, res) => {
  const status = getSubscriptionStatus(req.user.id);
  res.json({ ok: true, subscription: status });
});

// 激活卡密
app.post('/api/subscription/redeem', requireAuth, (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: '请输入卡密' });
    }

    const result = redeemCode(req.user.id, code.trim().toUpperCase());
    res.json({
      ok: true,
      message: '激活成功！',
      subscription: result
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 管理接口：生成卡密（仅供本地使用，无权限验证，生产环境需加管理员认证）
app.post('/api/admin/generate-codes', (req, res) => {
  try {
    const { planType = 'month', count = 10 } = req.body;

    if (!['month', 'year'].includes(planType)) {
      return res.status(400).json({ error: 'planType 必须是 month 或 year' });
    }

    if (count < 1 || count > 100) {
      return res.status(400).json({ error: 'count 必须在 1-100 之间' });
    }

    const codes = generateRedeemCodes(planType, count);
    res.json({ ok: true, codes, planType, count: codes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ 路由：AI 聊天（需要登录+订阅） ============

// 获取配置（不返回 API Key）
app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({
    hasKey: !!cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    companions: Object.fromEntries(
      Object.entries(COMPANION_PERSONAS).map(([k, v]) => [k, { name: v.name }])
    )
  });
});

// 保存配置
app.post('/api/config', (req, res) => {
  const { apiKey, baseUrl, model } = req.body;
  const cfg = loadConfig();
  if (apiKey !== undefined) cfg.apiKey = apiKey.trim();
  if (baseUrl !== undefined && baseUrl.trim()) cfg.baseUrl = baseUrl.trim().replace(/\/+$/, '');
  if (model !== undefined && model.trim()) cfg.model = model.trim();
  runtimeConfig = cfg;
  saveConfig(cfg);
  res.json({ ok: true, hasKey: !!cfg.apiKey });
});

// 聊天接口（需要登录 + 活跃订阅）
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { messages, companion = 'warm', stream = false } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: '消息列表不能为空' });
    }

    // 检查订阅状态
    const subStatus = getSubscriptionStatus(req.user.id);
    if (!subStatus.isActive) {
      return res.status(403).json({
        error: '订阅已过期或未激活',
        hint: '请先激活订阅以继续使用 AI 对话功能',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }

    const cfg = runtimeConfig;
    if (!cfg.apiKey) {
      return res.status(402).json({
        error: 'API Key 未配置',
        hint: '请先在前端设置面板中填入 API Key 和服务地址'
      });
    }

    // 组装请求体，把 system prompt 放在最前面
    const persona = COMPANION_PERSONAS[companion] || COMPANION_PERSONAS.warm;
    const payload = {
      model: cfg.model,
      messages: [
        { role: 'system', content: persona.system },
        ...messages
      ],
      temperature: 0.8,
      max_tokens: 800,
      stream
    };

    const url = `${cfg.baseUrl}/chat/completions`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      let errText = await resp.text();
      let parsed;
      try { parsed = JSON.parse(errText); } catch {}
      const msg = parsed?.error?.message || errText || `HTTP ${resp.status}`;
      return res.status(resp.status).json({ error: msg });
    }

    // 非流式：直接返回 content
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    res.json({ content });

  } catch (err) {
    console.error('[chat] 错误:', err.message);
    res.status(500).json({ error: `服务异常: ${err.message}` });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ============ 启动 ============
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n✨ 星伴 AI 代理服务器已启动 ✨`);
  console.log(`   接口地址: http://localhost:${PORT}`);
  console.log(`   配置文件: ${CONFIG_PATH}`);
  console.log(`\n   可用模型 ID 示例：`);
  console.log(`   - DeepSeek: deepseek-chat / deepseek-reasoner`);
  console.log(`   - 通义: qwen-plus / qwen-turbo`);
  console.log(`   - 智谱: glm-4 / glm-4-flash`);
  console.log(`   - OpenAI: gpt-4o-mini / gpt-4o`);
  console.log(`\n   前端已内置，直接访问: http://localhost:${PORT}`);
  console.log('');
});
