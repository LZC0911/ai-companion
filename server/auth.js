/**
 * 认证模块 - 密码加密、会话管理、注册/登录逻辑
 */

import crypto from 'crypto';
import db from './db.js';

// 密码加密：SHA-256 + 随机盐（生产环境建议用 bcrypt，这里零依赖更轻量）
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

// 生成随机 token
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// 生成卡密（8位大写字母+数字）
export function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ 用户操作 ============

export function registerUser(username, password) {
  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    throw new Error('用户名已存在');
  }

  const passwordHash = hashPassword(password);
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  const result = stmt.run(username, passwordHash);

  return { id: result.lastInsertRowid, username };
}

export function loginUser(username, password) {
  const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
  if (!user) {
    throw new Error('用户名或密码错误');
  }

  if (!verifyPassword(password, user.password_hash)) {
    throw new Error('用户名或密码错误');
  }

  // 创建会话（7 天有效期）
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)')
    .run(user.id, token, expiresAt);

  return { id: user.id, username: user.username, token };
}

export function getUserByToken(token) {
  const session = db.prepare(`
    SELECT s.user_id, s.expires_at, u.username
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `).get(token);

  if (!session) return null;

  // 检查是否过期
  if (new Date(session.expires_at) < new Date()) {
    // 删除过期会话
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }

  return { id: session.user_id, username: session.username };
}

export function logoutUser(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// ============ 订阅操作 ============

export function getSubscriptionStatus(userId) {
  const sub = db.prepare(`
    SELECT plan_type, status, start_date, end_date
    FROM subscriptions
    WHERE user_id = ? AND status = 'active'
    ORDER BY end_date DESC
    LIMIT 1
  `).get(userId);

  if (!sub) {
    return { isActive: false, planType: null, endDate: null };
  }

  // 检查是否过期
  const now = new Date();
  const endDate = new Date(sub.end_date);
  if (endDate < now) {
    // 标记为过期
    db.prepare(`UPDATE subscriptions SET status = 'expired' WHERE user_id = ? AND status = 'active'`).run(userId);
    return { isActive: false, planType: null, endDate: null };
  }

  return { isActive: true, planType: sub.plan_type, endDate: sub.end_date };
}

export function activateSubscription(userId, planType) {
  const now = new Date();
  let endDate;

  if (planType === 'month') {
    endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 天
  } else if (planType === 'year') {
    endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 365 天
  } else {
    throw new Error('无效的订阅类型');
  }

  // 先取消现有活跃订阅
  db.prepare(`UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'`).run(userId);

  // 创建新订阅
  const stmt = db.prepare(`
    INSERT INTO subscriptions (user_id, plan_type, status, start_date, end_date)
    VALUES (?, ?, 'active', ?, ?)
  `);
  stmt.run(userId, planType, now.toISOString(), endDate.toISOString());

  return { planType, endDate: endDate.toISOString() };
}

// ============ 卡密操作 ============

export function redeemCode(userId, code) {
  // 检查卡密是否存在且未使用
  const redeemCode = db.prepare('SELECT id, plan_type, status FROM redeem_codes WHERE code = ?').get(code);

  if (!redeemCode) {
    throw new Error('卡密不存在');
  }

  if (redeemCode.status === 'used') {
    throw new Error('卡密已被使用');
  }

  // 激活订阅
  const subResult = activateSubscription(userId, redeemCode.plan_type);

  // 标记卡密已使用
  db.prepare(`
    UPDATE redeem_codes
    SET status = 'used', used_by = ?, used_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId, redeemCode.id);

  return subResult;
}

// 管理接口：批量生成卡密
export function generateRedeemCodes(planType, count) {
  const codes = [];
  const stmt = db.prepare('INSERT INTO redeem_codes (code, plan_type) VALUES (?, ?)');

  for (let i = 0; i < count; i++) {
    let code;
    let attempts = 0;
    // 确保生成的卡密唯一
    do {
      code = generateRedeemCode();
      const existing = db.prepare('SELECT id FROM redeem_codes WHERE code = ?').get(code);
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    stmt.run(code, planType);
    codes.push(code);
  }

  return codes;
}
