import dotenv from 'dotenv';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { knowledgeManager } from './knowledge.js';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateRandomPassword,
  verifyMidtransSignature,
  rateLimiter,
  isBlockedRequestUrl,
  containsMaliciousPayload,
  applyLayeredSecurityHeaders,
  resolveServerDeviceFingerprint
} from './security.js';
import {
  initTiDB,
  dbGetAllKnowledge,
  dbAddKnowledge,
  dbUpdateKnowledge,
  dbDeleteKnowledge,
  dbGetConfig,
  dbSaveConfig,
  dbGetUser,
  dbGetUserById,
  dbVerifyAndBindUserDevice,
  dbRegisterOrUpdatePaidUser,
  dbUpdateUserAccount,
  dbDeductQuota,
  dbGetUserQuota,
  dbCreateSession,
  dbGetSession,
  dbDeleteSession,
  dbCreateOrder,
  dbGetOrder,
  dbUpdateOrderStatus,
  dbGetAllUsers,
  dbGetAllOrders,
  dbGetAdminStats,
  dbUpdateUserPassword,
  dbAdminUpdateUser,
  dbGetUserDetailsForAdmin,
  dbAdminFullUpdateUser,
  dbGetAllKnowledgeForAdmin,
  dbAdminDeleteKnowledge,
  dbRegisterFreeUser,
  dbGetUserWaStatus,
  dbSetUserWaStatus,
  dbAdminCreateUser,
  dbAdminDeleteUser,
  dbAddNotificationLog,
  dbGetAllNotifications,
  dbDeleteNotificationLog,
  dbClearAllNotifications,
  dbRecordVisit,
  dbGetVisitStats
} from './db.js';
import { sendFreeRegistrationEmail } from './mailer.js';

dotenv.config();

// Crash Protection: Auto-recover from unexpected network or Baileys errors (hanya di server lokal/VPS)
if (process.env.VERCEL !== '1') {
  process.on('uncaughtException', (err) => {
    console.error('🚨 [AUTO-RECOVER] Uncaught Exception:', err?.message || err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('🚨 [AUTO-RECOVER] Unhandled Rejection:', reason?.message || reason);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const AUTH_DIR = path.join(ROOT_DIR, 'auth_info_baileys');

const prefix = process.env.PREFIX || '.';
let botName = process.env.BOT_NAME || 'Toko AI Assistant';
const autoRead = process.env.AUTO_READ !== 'false';
const respondGroupTagOnly = process.env.RESPOND_GROUP_TAG_ONLY !== 'false';
const WEB_PORT = Number(process.env.PORT) || 3000;

// ==========================================
// STATE LIVE WHATSAPP
// ==========================================
let waSock = null;
let waStatus = 'connecting'; // 'connected' | 'scan_qr' | 'connecting' | 'disconnected'
let waQR = null;
let waPhone = null;
let waUser = null;
let webServerStarted = false;

// Cooldown anti-spam WhatsApp per nomor pengirim (mencegah abuse)
const userCooldownMap = new Map();

// ==========================================
// SERVER WEB DASHBOARD & MULTI-TENANT API
// ==========================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/**
 * Generator Tampilan Halaman Error HTML Modern (403 Forbidden, 404 Not Found, 500 Server Error)
 */
function renderBrandedErrorHtml({ code = 404, badge = 'HALAMAN TIDAK DITEMUKAN', title = 'Halaman Tidak Ditemukan', message = 'Maaf, halaman yang Anda cari tidak tersedia.', targetUrl = '/', isSecurity = false }) {
  const accentColor = isSecurity ? '#dc2626' : (code === 404 ? '#0f172a' : '#d97706');
  const badgeBg = isSecurity ? '#fef2f2' : '#f0fdf4';
  const badgeBorder = isSecurity ? '#fecaca' : '#bbf7d0';
  const badgeColor = isSecurity ? '#b91c1c' : '#15803d';
  const iconSvg = isSecurity
    ? `<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#dc2626" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    : `<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="#16a34a" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>`;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${code} ${title} — artapos.id</title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: radial-gradient(circle at top, #f0fdf4 0%, #f8fafc 55%, #f1f5f9 100%);
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .err-card {
      background: #ffffff;
      border: 1.5px solid #e2e8f0;
      border-radius: 24px;
      max-width: 540px;
      width: 100%;
      padding: 42px 36px;
      text-align: center;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    }
    .err-icon-wrap {
      width: 82px;
      height: 82px;
      border-radius: 22px;
      background: ${badgeBg};
      border: 1.5px solid ${badgeBorder};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .err-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${badgeBg};
      color: ${badgeColor};
      border: 1px solid ${badgeBorder};
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    .err-code {
      font-size: 3.4rem;
      font-weight: 800;
      color: ${accentColor};
      line-height: 1.05;
      letter-spacing: -1.5px;
      margin-bottom: 10px;
    }
    .err-title {
      font-size: 1.45rem;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .err-msg {
      font-size: 0.94rem;
      color: #475569;
      line-height: 1.65;
      margin-bottom: 22px;
    }
    .err-path-box {
      background: #f8fafc;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 10px 14px;
      font-family: monospace;
      font-size: 0.82rem;
      color: #64748b;
      margin-bottom: 26px;
      word-break: break-all;
    }
    .err-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn-primary {
      background: #16a34a;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.92rem;
      padding: 13px 22px;
      border-radius: 12px;
      transition: all 0.2s;
      box-shadow: 0 6px 18px rgba(22, 163, 74, 0.25);
    }
    .btn-primary:hover { background: #15803d; transform: translateY(-1px); }
    .btn-secondary {
      background: #f8fafc;
      color: #334155;
      border: 1.5px solid #cbd5e1;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.92rem;
      padding: 13px 20px;
      border-radius: 12px;
      transition: all 0.2s;
    }
    .btn-secondary:hover { background: #f1f5f9; color: #0f172a; }
    .err-foot {
      margin-top: 26px;
      padding-top: 16px;
      border-top: 1px solid #f1f5f9;
      font-size: 0.78rem;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="err-card">
    <div class="err-icon-wrap">${iconSvg}</div>
    <div class="err-badge">${badge}</div>
    <div class="err-code">${code}</div>
    <h1 class="err-title">${title}</h1>
    <p class="err-msg">${message}</p>
    <div class="err-path-box">URL: ${String(targetUrl || '/').replace(/[<>"']/g, '')}</div>
    <div class="err-actions">
      <a href="/" class="btn-primary">Kembali ke Beranda artapos.id</a>
      <a href="/#login" class="btn-secondary">Masuk ke Dashboard</a>
    </div>
    <div class="err-foot">🛡️ Dilindungi oleh <strong>artapos.id Layered Security Shield</strong></div>
  </div>
</body>
</html>`;
}

function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    if (containsMaliciousPayload(req.body)) {
      return Promise.reject(new Error('🛡️ Sistem Keamanan: Input mengandung skrip terlarang (.php / XSS / SQL Injection) dan telah diblokir!'));
    }
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Batasi ukuran payload 1MB (Anti Denial-of-Service / Memory Exhaustion)
      if (body.length > 1048576) {
        req.destroy();
        reject(new Error('Payload too large.'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (containsMaliciousPayload(parsed)) {
          reject(new Error('🛡️ Sistem Keamanan: Input mengandung skrip terlarang (.php / XSS / SQL Injection) dan telah diblokir!'));
          return;
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Middleware Autentikasi Tenant: Mengambil session user dari Bearer Token
 */
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (req.headers['x-auth-token'] || '');

  if (!token) return null;
  return await dbGetSession(token);
}

/**
 * Middleware Rate Limiting: Mencegah brute-force & bot attack
 */
function checkRateLimit(req, res, max = 15, windowMs = 60000) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  if (!rateLimiter.isAllowed(ip, max, windowMs)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Terlalu banyak permintaan (Rate limit exceeded). Mohon tunggu 1 menit.' }));
    return false;
  }
  return true;
}

// Helper: Cek status transaksi langsung ke server Midtrans Production
async function checkMidtransStatus(orderId) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
  const statusApiUrl = isProd
    ? `https://api.midtrans.com/v2/${encodeURIComponent(orderId)}/status`
    : `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`;
  const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');

  try {
    const res = await fetch(statusApiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': authHeader
      }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('⚠️ [MIDTRANS STATUS ERROR]:', err.message);
    return null;
  }
}

const ARTAPOS_PLANS = {
  starter: { id: 'starter', name: 'Paket Starter', price: 50000, quota: 1000, desc: 'Cocok untuk toko baru & pesan santai' },
  bisnis: { id: 'bisnis', name: 'Paket Bisnis', price: 100000, quota: 2500, popular: true, desc: 'Paling Laris! Untuk toko online aktif harian' },
  pro: { id: 'pro', name: 'Paket Pro', price: 150000, quota: 5000, desc: 'Untuk bisnis dengan perputaran chat tinggi' },
  enterprise: { id: 'enterprise', name: 'Paket Enterprise', price: 200000, quota: 10000, desc: 'Kapasitas maksimal untuk toko skala besar' }
};

let tidbInitPromise = null;
function ensureTiDBReady() {
  if (!tidbInitPromise) {
    tidbInitPromise = initTiDB().catch(err => {
      tidbInitPromise = null;
      throw err;
    });
  }
  return tidbInitPromise;
}

export async function handleHttpRequest(req, res) {
    applyLayeredSecurityHeaders(res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, x-device-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url && req.url.startsWith('/api/')) {
      await ensureTiDBReady();
    }

    // ====================================================
    // FIREWALL ANTI-HACKER & PEMBLOKIR AKSES .PHP / SCRIPT
    // ====================================================
    if (isBlockedRequestUrl(req.url)) {
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      dbAddNotificationLog({
        category: 'SECURITY',
        recipient: String(ip),
        title: 'Blokir Firewall: Percobaan Akses Terlarang (.php / Script)',
        message: `Firewall menolak akses URL berbahaya: ${req.url} dari IP ${ip}`,
        status: 'warning'
      }).catch(() => {});

      const acceptHeader = String(req.headers['accept'] || '');
      if (acceptHeader.includes('text/html') && !req.url.startsWith('/api/')) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderBrandedErrorHtml({
          code: 403,
          badge: '🛡️ FIREWALL KEAMANAN • 403 FORBIDDEN',
          title: 'Akses Ditolak oleh Sistem Keamanan',
          message: 'Firewall berlapis artapos.id mendeteksi permintaan ke ekstensi file terlarang (.php / .env / .sql) atau skrip berbahaya dan telah memblokir akses ini secara otomatis.',
          targetUrl: req.url,
          isSecurity: true
        }));
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          code: 403,
          error: '🛡️ Akses Ditolak oleh Firewall Keamanan artapos.id: Ekstensi file (.php / .env / .sql) atau skrip berbahaya dilarang!'
        }));
      }
      return;
    }

    const cleanUrl = req.url.split('?')[0];

    // ----------------------------------------
    // 0. API REAL-TIME VISITOR TRACKER (+1 SAAT WEB DIBUKA)
    // ----------------------------------------
    if (cleanUrl === '/api/track-visit' && req.method === 'POST') {
      try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const ua = req.headers['user-agent'] || '';
        const body = await readJsonBody(req);
        const session = await getAuthUser(req);
        const visitorEmail = session ? session.email : (body.email || 'Pengunjung');
        const pageView = body.pageView || 'landing';

        await dbRecordVisit({
          ip: String(ip),
          pageView,
          visitorEmail,
          userAgent: String(ua)
        });

        const visitStats = await dbGetVisitStats();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, visitStats }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      }
      return;
    }

    // ----------------------------------------
    // 1. API STATUS WHATSAPP (REAL BAILEYS MULTI-TENANT PER AKUN - WAJIB LOGIN)
    // ----------------------------------------
    if (cleanUrl === '/api/whatsapp/status') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.' }));
          return;
        }
        const userId = session.user_id;
        let userBotName = botName;

        const cfg = await dbGetConfig(userId);
        if (cfg.store_name) userBotName = cfg.store_name;

        if (process.env.VERCEL === '1') {
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store'
          });
          res.end(JSON.stringify({
            status: cfg.wa_status === 'connected' ? 'connected' : 'connecting',
            qr: null,
            phone: cfg.wa_phone || null,
            user: session.email,
            botName: userBotName
          }));
          return;
        }

        // Pastikan socket Baileys resmi untuk akun ini aktif
        const tenant = await ensureTenantWhatsApp(userId);

        // Jika socket baru dibuat dan sedang meminta QR asli dari server WhatsApp, tunggu hingga QR siap (maks 3 detik)
        if (tenant.status !== 'connected' && !tenant.qr) {
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 150));
            if (tenant.qr || tenant.status === 'connected') break;
          }
        }

        const effectiveStatus = tenant.status === 'connected'
          ? 'connected'
          : (tenant.qr ? 'scan_qr' : 'connecting');

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store'
        });
        res.end(JSON.stringify({
          status: effectiveStatus,
          qr: tenant.qr || null,
          phone: tenant.phone || null,
          user: session.email,
          botName: userBotName
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (cleanUrl === '/api/whatsapp/logout' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Sesi login tidak sah.' }));
          return;
        }
        const userId = session.user_id;

        await resetTenantWhatsApp(userId);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          status: 'scan_qr',
          message: 'Sesi WhatsApp berhasil di-reset. Menyiapkan Kode QR resmi baru...'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 2. API MULTI-TENANT KNOWLEDGE BASE (SCOPED BY USER_ID & WAJIB LOGIN)
    // ----------------------------------------
    if (cleanUrl === '/api/knowledge') {
      const session = await getAuthUser(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Sesi login tidak sah atau telah kedaluwarsa.' }));
        return;
      }
      const userId = session.user_id;

      // [R] READ ALL
      if (req.method === 'GET') {
        const list = await dbGetAllKnowledge(userId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(list));
        return;
      }

      // [C] CREATE ITEM (Wajib Login & Maks 100 Karakter)
      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          if (String(body.answer || '').length > 100) {
            throw new Error('Jawaban bot maksimal 100 karakter.');
          }
          const newItem = await dbAddKnowledge(session.user_id, body);
          knowledgeManager.lastCacheTime = 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, item: newItem }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // [U] UPDATE ITEM (Wajib Login & Scoped ke User Milik Sendiri)
      if (req.method === 'PUT') {
        try {
          const body = await readJsonBody(req);
          if (!body.id) throw new Error('ID wajib disertakan.');
          if (String(body.answer || '').length > 100) {
            throw new Error('Jawaban bot maksimal 100 karakter.');
          }
          await dbUpdateKnowledge(session.user_id, body.id, body);
          knowledgeManager.lastCacheTime = 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, id: body.id }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      // [D] DELETE ITEM (Wajib Login & Scoped ke User Milik Sendiri)
      if (req.method === 'DELETE') {
        try {
          const body = await readJsonBody(req);
          const targetId = body.id || req.url.split('/').pop();
          await dbDeleteKnowledge(session.user_id, targetId);
          knowledgeManager.lastCacheTime = 0;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, id: targetId }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }

    // ----------------------------------------
    // 3. API CONFIG TOKO (SCOPED BY USER_ID & WAJIB LOGIN)
    // ----------------------------------------
    if (cleanUrl === '/api/config') {
      const session = await getAuthUser(req);
      if (!session) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Sesi login tidak sah.' }));
        return;
      }
      const userId = session.user_id;

      if (req.method === 'GET') {
        const cfg = await dbGetConfig(userId);
        const fullCfg = {
          name: cfg.store_name || botName,
          ownerNumber: cfg.owner_number || '',
          ...cfg
        };
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(fullCfg));
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          const cleanName = String(body.name || botName).trim().slice(0, 100);
          const cleanOwner = String(body.ownerNumber || '').trim().slice(0, 100);
          await dbSaveConfig(session.user_id, {
            store_name: cleanName,
            owner_number: cleanOwner
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }
    }

    // ----------------------------------------
    // 4. API PLANS & PRICING
    // ----------------------------------------
    if (cleanUrl === '/api/plans') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        plans: Object.values(ARTAPOS_PLANS),
        clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
        isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true'
      }));
      return;
    }

    // ----------------------------------------
    // 5. API ORDER & MIDTRANS SNAP TOKEN (RATE LIMITED)
    // ----------------------------------------
    if (cleanUrl === '/api/payment/create-transaction' && req.method === 'POST') {
      if (!checkRateLimit(req, res, 10, 60000)) return;

      try {
        const body = await readJsonBody(req);
        const planKey = (body.planId || 'bisnis').toLowerCase();
        const plan = ARTAPOS_PLANS[planKey] || ARTAPOS_PLANS.bisnis;
        const email = (body.email || '').trim().toLowerCase();
        const storeName = (body.storeName || 'Toko AI Assistant').trim().slice(0, 50);

        if (!email || !email.endsWith('@gmail.com') || email.length < 11) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email wajib menggunakan format Google (@gmail.com) yang valid.' }));
          return;
        }

        const orderId = `ARTA-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
        const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
        const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
        const snapApiUrl = isProd
          ? 'https://app.midtrans.com/snap/v1/transactions'
          : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

        const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
        const midtransPayload = {
          transaction_details: {
            order_id: orderId,
            gross_amount: plan.price
          },
          customer_details: {
            email: email,
            first_name: storeName
          },
          item_details: [{
            id: plan.id,
            price: plan.price,
            quantity: 1,
            name: `${plan.name} (${plan.quota} balasan/bln)`
          }]
        };

        let snapToken = null;
        let redirectUrl = null;

        try {
          const midRes = await fetch(snapApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': authHeader
            },
            body: JSON.stringify(midtransPayload)
          });
          const midData = await midRes.json();
          if (midData.token) {
            snapToken = midData.token;
            redirectUrl = midData.redirect_url;
          }
        } catch (fetchErr) {
          console.warn('⚠️ Gagal request ke Midtrans API:', fetchErr.message);
        }

        await dbCreateOrder({
          orderId,
          email,
          plan: plan.name,
          amount: plan.price,
          quota: plan.quota,
          snapToken
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          orderId,
          plan: plan.name,
          amount: plan.price,
          quota: plan.quota,
          token: snapToken,
          redirect_url: redirectUrl,
          clientKey: process.env.MIDTRANS_CLIENT_KEY || '',
          isProduction: isProd
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 6. API VERIFIKASI PEMBAYARAN KETAT & GENERATE RANDOM PASSWORD
    // ----------------------------------------
    if (cleanUrl === '/api/payment/verify-status' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const orderId = body.orderId;
        const email = (body.email || '').trim().toLowerCase();
        const planKey = (body.planId || 'bisnis').toLowerCase();
        const plan = ARTAPOS_PLANS[planKey] || ARTAPOS_PLANS.bisnis;
        const storeName = body.storeName || 'Toko AI Assistant';

        if (!orderId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Order ID wajib disertakan.' }));
          return;
        }

        const order = await dbGetOrder(orderId);
        if (!order) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Data pesanan tidak ditemukan di sistem.' }));
          return;
        }
        const targetEmail = order.email || email;
        const wasAlreadySettled = (order.status === 'settlement');

        if (!targetEmail) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email pembeli tidak valid.' }));
          return;
        }

        // Verifikasi ke server Midtrans Production
        const midData = await checkMidtransStatus(orderId);
        const transStatus = midData?.transaction_status || '';
        const fraudStatus = midData?.fraud_status || '';

        console.log(`\n🔍 [VERIFIKASI STATUS MIDTRANS] Order: ${orderId} | Status: "${transStatus}"`);

        const isPaid = (transStatus === 'settlement') || (transStatus === 'capture' && fraudStatus === 'accept');

        if (isPaid) {
          await dbUpdateOrderStatus(orderId, 'settlement');

          const randomInitialPassword = generateRandomPassword(10);
          let user = null;

          // Cegah Replay Exploit: Hanya tambahkan kuota jika order belum pernah berstatus settlement
          if (!wasAlreadySettled) {
            user = await dbRegisterOrUpdatePaidUser({
              email: targetEmail,
              password: randomInitialPassword,
              storeName: String(storeName).slice(0, 100),
              plan: plan.name,
              quota: plan.quota,
              daysActive: 30
            });
            await dbAddNotificationLog({
              category: 'ADMIN',
              recipient: targetEmail,
              title: `💳 Pembayaran Midtrans Lunas (${orderId})`,
              message: `Paket ${plan.name} (+${plan.quota} Token) telah diaktifkan untuk ${targetEmail}.`,
              status: 'success'
            });
          } else {
            user = await dbGetUser(targetEmail);
          }

          // Otomatis buat session token untuk kemudahan login
          const session = await dbCreateSession(user.id, targetEmail, 14);

          console.log(`🎉 [PEMBAYARAN TERVERIFIKASI LUNAS] Akun ${targetEmail} aktif! Token: ${session.token.slice(0, 8)}...`);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            verified: true,
            status: 'settlement',
            message: 'Pembayaran terverifikasi lunas oleh Midtrans.',
            sessionToken: session.token,
            account: {
              email: targetEmail,
              password: randomInitialPassword,
              plan: plan.name,
              quota: plan.quota,
              activeUntil: user.active_until,
              loginUrl: '/#login'
            }
          }));
        } else {
          let displayStatus = transStatus;
          let humanMessage = 'Pembayaran belum diselesaikan. Akun TIDAK DAPAT diaktifkan.';

          if (!transStatus || midData?.status_code === '404') {
            displayStatus = 'belum_dibayar';
            humanMessage = 'Tagihan telah dibuat namun belum ada transaksi masuk di sistem Midtrans. Silakan selesaikan pembayaran.';
          } else if (transStatus === 'pending') {
            displayStatus = 'pending';
            humanMessage = 'Pembayaran sedang menunggu (QRIS / Virtual Account belum dibayar). Silakan lakukan transfer sebelum akun aktif.';
          } else if (transStatus === 'cancel' || transStatus === 'expire' || transStatus === 'deny') {
            displayStatus = transStatus;
            humanMessage = `Transaksi telah ${transStatus}. Silakan lakukan pemesanan ulang.`;
            await dbUpdateOrderStatus(orderId, transStatus);
          }

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            verified: false,
            status: displayStatus,
            message: humanMessage
          }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 7. API MIDTRANS WEBHOOK / NOTIFICATION DENGAN SIGNATURE CHECK
    // ----------------------------------------
    if (cleanUrl === '/api/payment/notification' && req.method === 'POST') {
      try {
        const notifyData = await readJsonBody(req);
        const orderId = notifyData.order_id;
        const statusCode = notifyData.status_code;
        const grossAmount = notifyData.gross_amount;
        const signatureKey = notifyData.signature_key;
        const serverKey = process.env.MIDTRANS_SERVER_KEY || '';

        console.log(`\n🔔 [MIDTRANS WEBHOOK DITERIMA] Order: ${orderId} | Status: ${notifyData.transaction_status}`);

        // Verifikasi Signature SHA-512
        const isSignatureValid = verifyMidtransSignature({
          order_id: orderId,
          status_code: statusCode,
          gross_amount: grossAmount,
          signature_key: signatureKey,
          server_key: serverKey
        });

        if (!isSignatureValid) {
          console.warn(`🚨 [INVALID WEBHOOK SIGNATURE] Percobaan webhook palsu untuk order ${orderId}!`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid signature key' }));
          return;
        }

        // Cek status resmi ke Midtrans
        const midData = await checkMidtransStatus(orderId);
        const transStatus = midData?.transaction_status || notifyData.transaction_status;
        const fraudStatus = midData?.fraud_status || notifyData.fraud_status;
        const isPaid = (transStatus === 'settlement') || (transStatus === 'capture' && fraudStatus === 'accept');

        if (isPaid) {
          const order = await dbGetOrder(orderId);
          if (order && order.status !== 'settlement') {
            await dbUpdateOrderStatus(orderId, 'settlement');
            const randomInitialPassword = generateRandomPassword(10);
            await dbRegisterOrUpdatePaidUser({
              email: order.email,
              password: randomInitialPassword,
              storeName: 'Toko AI Assistant',
              plan: order.plan,
              quota: order.quota,
              daysActive: 30
            });
            console.log(`✅ [WEBHOOK AKTIF] Akun ${order.email} berhasil diaktifkan dengan aman.`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API PENDAFTARAN AKUN GRATIS (TRIAL 100 TOKEN CHAT AI)
    // ----------------------------------------
    if (cleanUrl === '/api/auth/register-free' && req.method === 'POST') {
      if (!checkRateLimit(req, res, 5, 60000)) return;

      try {
        const body = await readJsonBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();
        const storeName = (body.storeName || 'Toko AI Assistant').trim();

        if (!email || !email.endsWith('@gmail.com') || email.length < 11) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Wajib menggunakan alamat email Google resmi (@gmail.com).' }));
          return;
        }

        if (email.length > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email maksimal 100 karakter.' }));
          return;
        }

        if (password && password.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password maksimal 20 karakter.' }));
          return;
        }

        if (storeName.length > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nama toko maksimal 100 karakter.' }));
          return;
        }

        // Simpan pendaftaran gratis ke TiDB (300 Token + 7 Template Soal & Jawaban + Kunci 1 Device 1 Email)
        const deviceId = resolveServerDeviceFingerprint(req, body.deviceId);
        const regResult = await dbRegisterFreeUser({ email, password, storeName, deviceId });

        // Catat ke Log Aktivitas: DAFTAR AKUN BARU
        await dbAddNotificationLog({
          category: 'REGISTER',
          recipient: regResult.email,
          title: `📝 Pendaftaran Akun Baru (${regResult.storeName})`,
          message: `Pengguna ${regResult.email} berhasil mendaftar Paket Gratis (300 Token) • Device: ${deviceId.slice(0, 16)}.`,
          status: 'success'
        });

        // Kirim email resmi berisi password login dari artapos26@gmail.com
        const mailResult = await sendFreeRegistrationEmail(
          regResult.email,
          regResult.rawPassword,
          regResult.storeName
        );

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          email: regResult.email,
          storeName: regResult.storeName,
          emailSent: Boolean(mailResult && mailResult.success),
          message: `Akun ${regResult.email} berhasil didaftarkan! Silakan cek Kotak Masuk atau folder Spam email Google Anda untuk melihat password login.`
        }));
      } catch (err) {
        if (String(err.message || '').includes('1 Perangkat')) {
          dbAddNotificationLog({
            category: 'SECURITY',
            recipient: req.headers['x-device-id'] || 'Device',
            title: '🛡️ Pencegahan Abuse: 1 Device Coba Daftar Email Baru',
            message: err.message,
            status: 'warning'
          }).catch(() => {});
        }
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 8. API LOGIN (ANTI BRUTE-FORCE RATE LIMITED + HASHED PASSWORD)
    // ----------------------------------------
    if (cleanUrl === '/api/auth/login' && req.method === 'POST') {
      if (!checkRateLimit(req, res, 8, 60000)) return;

      try {
        const body = await readJsonBody(req);
        const email = (body.email || '').trim().toLowerCase();
        const password = (body.password || '').trim();

        if (!email || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email dan password wajib diisi.' }));
          return;
        }

        if (email.length > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Email maksimal 100 karakter.' }));
          return;
        }

        if (password.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Kolom password maksimal 20 karakter.' }));
          return;
        }

        const user = await dbGetUser(email);
        if (!user) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akun Gmail ini belum terdaftar atau pembayaran belum diselesaikan.' }));
          return;
        }

        // Verifikasi password yang di-hash scrypt
        const isMatch = verifyPassword(password, user.password);
        if (!isMatch) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password salah. Silakan periksa kembali password akun Anda.' }));
          return;
        }

        // ====================================================
        // PROTEKSI 1 EMAIL = 1 DEVICE (CEGAH 1 DEVICE LOGIN 2 EMAIL GRATIS)
        // ====================================================
        const deviceId = resolveServerDeviceFingerprint(req, body.deviceId);
        const deviceCheck = await dbVerifyAndBindUserDevice(user, deviceId);
        if (!deviceCheck.allowed) {
          await dbAddNotificationLog({
            category: 'SECURITY',
            recipient: user.email,
            title: `🛡️ Blokir Login Multi-Akun (1 Device 1 Email)`,
            message: `${deviceCheck.reason} (Device: ${deviceId.slice(0, 16)})`,
            status: 'warning'
          });
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: deviceCheck.reason }));
          return;
        }

        // Buat session token persisten
        const session = await dbCreateSession(user.id, user.email, 14);

        console.log(`🔑 [LOGIN SUKSES] User: ${user.email} (ID: ${user.id}, Role: ${user.role || 'user'})`);
        dbAddNotificationLog({
          category: 'LOGIN',
          recipient: user.email,
          title: `🔑 Masuk Akun / Login (${user.store_name || 'Toko'})`,
          message: `Pengguna ${user.email} berhasil masuk (Login) ke dashboard artapos.id (${user.plan}).`,
          status: 'success'
        }).catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          token: session.token,
          user: {
            id: user.id,
            email: user.email,
            storeName: user.store_name,
            plan: user.plan,
            quota_total: user.quota_total,
            quota_used: user.quota_used,
            role: user.role || 'user',
            active_until: user.active_until
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 9. API GET PROFILE (AUTH SCOPED)
    // ----------------------------------------
    if (cleanUrl === '/api/user/me') {
      try {
        const session = await getAuthUser(req);
        if (session) {
          // Ambil quota terkini
          const quota = await dbGetUserQuota(session.user_id);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            authenticated: true,
            user: {
              id: session.user_id,
              email: session.email,
              storeName: session.store_name,
              plan: quota?.plan || session.plan,
              quota_total: quota?.quota_total || session.quota_total,
              quota_used: quota?.quota_used || session.quota_used,
              remaining: quota?.remaining || Math.max(0, session.quota_total - session.quota_used),
              role: session.role || 'user',
              active_until: quota?.active_until || session.active_until
            }
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ authenticated: false }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 10. API REAL-TIME QUOTA STREAM / LIVE SYNC
    // ----------------------------------------
    if (cleanUrl === '/api/user/quota-live') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        const quota = await dbGetUserQuota(session.user_id);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache, no-store'
        });
        res.end(JSON.stringify({
          quota_total: quota?.quota_total || 2500,
          quota_used: quota?.quota_used || 0,
          remaining: quota ? Math.max(0, quota.quota_total - quota.quota_used) : 2500,
          plan: quota?.plan || 'Paket Bisnis',
          active_until: quota?.active_until
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API DEDUCT QUOTA (SIMULATOR & CHAT ATOMIC DEDUCTION)
    // ----------------------------------------
    if (cleanUrl === '/api/user/deduct-quota' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }

        await dbDeductQuota(session.user_id);
        const updated = await dbGetUserQuota(session.user_id);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          quota_used: updated?.quota_used || 0,
          remaining: updated ? Math.max(0, updated.quota_total - updated.quota_used) : 0
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 11. API UPDATE PROFILE (GANTI GMAIL & PASSWORD)
    // ----------------------------------------
    if (cleanUrl === '/api/user/update-profile' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sesi login tidak sah.' }));
          return;
        }

        const body = await readJsonBody(req);
        const newEmail = (body.newEmail || '').trim().toLowerCase();
        const newPassword = body.newPassword ? body.newPassword.trim() : null;

        if (newEmail) {
          if (newEmail.length > 100) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email baru maksimal 100 karakter.' }));
            return;
          }
          if (!newEmail.endsWith('@gmail.com') || newEmail.length < 11) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email baru wajib menggunakan akun Google (@gmail.com)' }));
            return;
          }
        }

        if (newPassword) {
          if (newPassword.length < 6) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Password baru minimal 6 karakter.' }));
            return;
          }
          if (newPassword.length > 20) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Kolom password baru maksimal 20 karakter.' }));
            return;
          }
        }

        await dbUpdateUserAccount(session.user_id, newEmail, newPassword);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Profil dan kredensial akun berhasil diperbarui di Cloud!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 12. API GANTI PASSWORD (MAKS 20 KARAKTER)
    // ----------------------------------------
    if (cleanUrl === '/api/user/change-password' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sesi login tidak sah.' }));
          return;
        }

        const body = await readJsonBody(req);
        const newPassword = (body.newPassword || '').trim();

        if (!newPassword || newPassword.length < 6) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password baru minimal 6 karakter.' }));
          return;
        }
        if (newPassword.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Kolom password maksimal 20 karakter.' }));
          return;
        }

        await dbUpdateUserPassword(session.user_id, newPassword);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Password berhasil diperbarui di Cloud!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 13. API SUPER ADMIN: OVERVIEW (PANTAU SEMUA AKUN & TRANSAKSI)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/overview' && req.method === 'GET') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak: Hanya Super Admin yang berhak memantau.' }));
          return;
        }

        const stats = await dbGetAdminStats();
        const users = await dbGetAllUsers();
        const orders = await dbGetAllOrders();
        const knowledge = await dbGetAllKnowledgeForAdmin();
        const notifications = await dbGetAllNotifications(250);
        const visitStats = await dbGetVisitStats();

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          stats,
          users,
          orders,
          knowledge,
          notifications,
          visitStats
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 14. API SUPER ADMIN: GANTI PASSWORD SUPER ADMIN (MAKS 20 KARAKTER)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/change-password' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak: Hanya Super Admin yang dapat mengganti sandi ini.' }));
          return;
        }

        const body = await readJsonBody(req);
        const newPassword = (body.newPassword || '').trim();

        if (!newPassword || newPassword.length < 6) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password baru minimal 6 karakter.' }));
          return;
        }
        if (newPassword.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Kolom password maksimal 20 karakter.' }));
          return;
        }

        await dbUpdateUserPassword(session.user_id, newPassword);

        console.log(`👑 [SUPER ADMIN] Password untuk ${session.email} berhasil diubah di TiDB Cloud!`);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Password Super Admin berhasil diperbarui di TiDB Cloud!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 15. API SUPER ADMIN: UPDATE KUOTA / PERPANJANG USER
    // ----------------------------------------
    if (cleanUrl === '/api/admin/update-user' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak.' }));
          return;
        }

        const body = await readJsonBody(req);
        const targetUserId = body.userId;
        if (!targetUserId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User ID wajib disertakan.' }));
          return;
        }

        await dbAdminUpdateUser(targetUserId, {
          plan: body.plan,
          quota_total: body.quota_total,
          daysToAdd: body.daysToAdd
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Data toko berhasil diperbarui.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: DETAIL LENGKAP TOKO (USER, KNOWLEDGE, CONFIG, ORDERS)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/user-detail' && req.method === 'GET') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak.' }));
          return;
        }

        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const userId = urlObj.searchParams.get('userId');
        if (!userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Parameter userId wajib disertakan.' }));
          return;
        }

        const details = await dbGetUserDetailsForAdmin(userId);
        if (!details) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User tidak ditemukan.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, ...details }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: EDIT LENGKAP AKUN TOKO (PLAN, KUOTA, MASA AKTIF, PASSWORD)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/edit-user-full' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak.' }));
          return;
        }

        const body = await readJsonBody(req);
        const targetUserId = body.userId;
        if (!targetUserId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User ID wajib disertakan.' }));
          return;
        }

        await dbAdminFullUpdateUser(targetUserId, body);

        await dbAddNotificationLog({
          category: 'ADMIN',
          recipient: body.email || `User #${targetUserId}`,
          title: `Super Admin Memperbarui Data Akun #${targetUserId}`,
          message: `Data akun (${body.email || targetUserId}) diperbarui: Toko="${body.storeName}", Paket="${body.plan}", Total Kuota=${body.quota_total}.`,
          status: 'success'
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Data toko & email berhasil diperbarui di Cloud!' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: CREATE AKUN EMAIL BARU (CRUD - CREATE)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/create-user' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak: Hanya Super Admin.' }));
          return;
        }

        const body = await readJsonBody(req);
        const created = await dbAdminCreateUser({
          email: body.email,
          password: body.password,
          storeName: body.storeName,
          plan: body.plan,
          quotaTotal: body.quotaTotal,
          daysActive: body.daysActive
        });

        // Kirim notifikasi email password ke akun baru tersebut
        if (body.sendEmail !== false) {
          await sendFreeRegistrationEmail(created.email, created.rawPassword, created.storeName);
        }

        await dbAddNotificationLog({
          category: 'ADMIN',
          recipient: created.email,
          title: `Super Admin Menambahkan Akun Baru (${created.storeName})`,
          message: `Akun ${created.email} dibuat oleh Super Admin dengan ${created.plan} (${created.quota_total} Token). Password: ${created.rawPassword}`,
          status: 'success'
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          user: created,
          message: `Akun ${created.email} berhasil dibuat & notifikasi email password telah dikirim!`
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: HAPUS AKUN EMAIL PENGGUNA (CRUD - DELETE)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/delete-user' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak: Hanya Super Admin.' }));
          return;
        }

        const body = await readJsonBody(req);
        if (!body.userId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'User ID wajib disertakan.' }));
          return;
        }

        const deleted = await dbAdminDeleteUser(body.userId);

        // Bersihkan sesi WA jika ada
        try {
          const userDir = getTenantAuthDir(deleted.id);
          if (fs.existsSync(userDir)) {
            fs.rmSync(userDir, { recursive: true, force: true });
          }
          tenantSessions.delete(Number(deleted.id));
        } catch (e) {}

        await dbAddNotificationLog({
          category: 'ADMIN',
          recipient: deleted.email,
          title: `Super Admin Menghapus Akun Pengguna (#${deleted.id})`,
          message: `Akun ${deleted.email} beserta seluruh sesi dan data knowledge-nya telah dihapus permanen dari Cloud.`,
          status: 'warning'
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: `Akun ${deleted.email} berhasil dihapus permanen!`
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: KELOLA LOG NOTIFIKASI (HAPUS / BERSIHKAN)
    // ----------------------------------------
    if (cleanUrl === '/api/admin/delete-notification' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak.' }));
          return;
        }
        const body = await readJsonBody(req);
        if (body.clearAll) {
          await dbClearAllNotifications();
        } else if (body.id) {
          await dbDeleteNotificationLog(body.id);
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // API SUPER ADMIN: HAPUS SOAL & JAWABAN KNOWLEDGE TERTENTU
    // ----------------------------------------
    if (cleanUrl === '/api/admin/delete-knowledge' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        if (!session || session.role !== 'superadmin') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Akses ditolak: Hanya Super Admin.' }));
          return;
        }

        const body = await readJsonBody(req);
        const knowledgeId = body.id;
        if (!knowledgeId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ID Knowledge wajib disertakan.' }));
          return;
        }

        await dbAdminDeleteKnowledge(knowledgeId);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Soal & jawaban berhasil dihapus oleh Super Admin.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // 16. API LOGOUT (INVALIDATE SESSION TOKEN & LOG ACTIVITY)
    // ----------------------------------------
    if (cleanUrl === '/api/auth/logout' && req.method === 'POST') {
      try {
        const session = await getAuthUser(req);
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.headers['x-auth-token'] || '');

        if (session && session.email) {
          await dbAddNotificationLog({
            category: 'LOGOUT',
            recipient: session.email,
            title: `🚪 Keluar Akun / Logout (${session.store_name || 'Toko'})`,
            message: `Pengguna ${session.email} telah keluar (Logout) dari sesi dashboard artapos.id.`,
            status: 'info'
          });
        }

        if (token) {
          await dbDeleteSession(token);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // ----------------------------------------
    // STATIC ASSETS (HTML, CSS, JS) DENGAN ANTI-PATH TRAVERSAL & TAMPILAN 403/404
    // ----------------------------------------
    if (cleanUrl.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        code: 404,
        error: `Endpoint API ${cleanUrl} tidak ditemukan (404 Not Found).`
      }));
      return;
    }

    let staticPath = cleanUrl === '/' ? '/index.html' : cleanUrl;
    const resolvedPublicDir = path.resolve(PUBLIC_DIR);
    const filePath = path.resolve(resolvedPublicDir, '.' + staticPath);
    const ext = path.extname(filePath).toLowerCase();
    const acceptHeader = String(req.headers['accept'] || '');

    // Jika URL tidak memiliki ekstensi file (misal /halaman-tidak-ada), tampilkan Halaman 404 Not Found
    if (!ext) {
      if (acceptHeader.includes('text/html') || acceptHeader.includes('*/*')) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderBrandedErrorHtml({
          code: 404,
          badge: '🔍 HALAMAN TIDAK DITEMUKAN • 404 NOT FOUND',
          title: 'Halaman Tidak Ditemukan',
          message: 'Maaf, halaman atau rute URL yang Anda tuju tidak tersedia di server artapos.id. Silakan periksa kembali alamat URL atau kembali ke halaman utama.',
          targetUrl: cleanUrl,
          isSecurity: false
        }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ code: 404, error: 'Halaman tidak ditemukan (404 Not Found).' }));
      }
      return;
    }

    if (!filePath.startsWith(resolvedPublicDir) || !MIME_TYPES[ext]) {
      if (acceptHeader.includes('text/html')) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderBrandedErrorHtml({
          code: 403,
          badge: '🛡️ AKSES FILE DITOLAK • 403 FORBIDDEN',
          title: 'File atau Direktori Tidak Diizinkan',
          message: 'Sistem keamanan artapos.id menolak akses langsung ke file internal atau ekstensi yang tidak masuk dalam daftar aman (Whitelist).',
          targetUrl: cleanUrl,
          isSecurity: true
        }));
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          code: 403,
          error: '🛡️ Akses Ditolak oleh Firewall Keamanan artapos.id: File atau direktori tidak diizinkan!'
        }));
      }
      return;
    }

    const contentType = MIME_TYPES[ext];

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (acceptHeader.includes('text/html') || ext === '.html') {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderBrandedErrorHtml({
            code: 404,
            badge: '🔍 FILE TIDAK DITEMUKAN • 404 NOT FOUND',
            title: 'Halaman atau File Tidak Ditemukan',
            message: 'File yang Anda minta tidak ditemukan di server artapos.id. Silakan kembali ke beranda.',
            targetUrl: cleanUrl,
            isSecurity: false
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ code: 404, error: '404 Not Found' }));
        }
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        });
        res.end(content);
      }
    });
}

function startWebServer() {
  if (webServerStarted) return;
  webServerStarted = true;

  const server = http.createServer(handleHttpRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Port ${WEB_PORT} masih terpakai, mencoba menghubungkan ulang dalam 1.5 detik...`);
      setTimeout(() => {
        try { server.close(); } catch (e) {}
        server.listen(WEB_PORT, () => {
          console.log(`🌐 Web Dashboard Aktif: http://localhost:${WEB_PORT}`);
        });
      }, 1500);
    } else {
      console.error('Web server error:', err.message);
    }
  });

  server.listen(WEB_PORT, () => {
    console.log(`🌐 Web Dashboard artapos.id Aktif: http://localhost:${WEB_PORT}`);
  });
}

// ==========================================
// MULTI-TENANT WHATSAPP BAILEYS ENGINE (ISOLASI PER USER_ID)
// Setiap akun mendapatkan QR Resmi WhatsApp Web & Sesi Tersendiri
// ==========================================
const tenantSessions = new Map();
let cachedBaileysVersion = null;

async function getBaileysVersion() {
  if (cachedBaileysVersion) return cachedBaileysVersion;
  try {
    const { fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
    const { version } = await fetchLatestBaileysVersion();
    cachedBaileysVersion = version;
    return version;
  } catch (e) {
    return [2, 3000, 1015901307];
  }
}

function getTenantAuthDir(userId) {
  return path.join(AUTH_DIR, `user_${Number(userId) || 1}`);
}

async function ensureTenantWhatsApp(userId) {
  const uid = Number(userId) || 1;
  let tenant = tenantSessions.get(uid);

  if (!tenant) {
    tenant = {
      userId: uid,
      sock: null,
      status: 'connecting',
      qr: null,
      phone: null,
      isConnecting: false,
      reconnectTimer: null
    };
    tenantSessions.set(uid, tenant);
  }

  if (!tenant.sock && !tenant.isConnecting) {
    startTenantSocket(uid).catch(err => {
      console.error(`❌ [WA USER #${uid}] Gagal memulai socket:`, err.message);
    });
  }

  return tenant;
}

async function resetTenantWhatsApp(userId) {
  const uid = Number(userId) || 1;
  const tenant = tenantSessions.get(uid);

  if (tenant) {
    if (tenant.reconnectTimer) {
      clearTimeout(tenant.reconnectTimer);
      tenant.reconnectTimer = null;
    }
    if (tenant.sock) {
      try { tenant.sock.ev.removeAllListeners(); } catch (e) {}
      try { await tenant.sock.logout(); } catch (e) {}
      try { tenant.sock.end(undefined); } catch (e) {}
      tenant.sock = null;
    }
    tenant.status = 'connecting';
    tenant.qr = null;
    tenant.phone = null;
    tenant.isConnecting = false;
  }

  const userDir = getTenantAuthDir(uid);
  try {
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
  } catch (e) {}

  await dbSetUserWaStatus(uid, 'scan_qr', '');
  await ensureTenantWhatsApp(uid);
}

async function startTenantSocket(userId) {
  const uid = Number(userId) || 1;
  let tenant = tenantSessions.get(uid);
  if (!tenant) {
    tenant = {
      userId: uid,
      sock: null,
      status: 'connecting',
      qr: null,
      phone: null,
      isConnecting: false,
      reconnectTimer: null
    };
    tenantSessions.set(uid, tenant);
  }

  if (tenant.isConnecting) return tenant;
  tenant.isConnecting = true;

  try {
    if (tenant.sock) {
      try { tenant.sock.ev.removeAllListeners(); } catch (e) {}
      try { tenant.sock.end(undefined); } catch (e) {}
      tenant.sock = null;
    }

    const userDir = getTenantAuthDir(uid);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = await import('@whiskeysockets/baileys');
    const { default: pino } = await import('pino');
    const { default: QRCode } = await import('qrcode');

    const { state, saveCreds } = await useMultiFileAuthState(userDir);
    const version = await getBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: ['artapos.id Web', 'Chrome', '122.0.0'],
      syncFullHistory: false
    });

    tenant.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        tenant.status = 'scan_qr';
        try {
          tenant.qr = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
          console.log(`📱 [WA USER #${uid}] Kode QR Resmi WhatsApp Web siap dipindai!`);
        } catch (err) {
          tenant.qr = null;
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        tenant.sock = null;
        tenant.isConnecting = false;

        if (shouldReconnect) {
          if (tenant.reconnectTimer) clearTimeout(tenant.reconnectTimer);
          tenant.reconnectTimer = setTimeout(() => {
            startTenantSocket(uid);
          }, 2500);
        } else {
          tenant.status = 'scan_qr';
          tenant.qr = null;
          tenant.phone = null;
          try {
            if (fs.existsSync(userDir)) {
              fs.rmSync(userDir, { recursive: true, force: true });
            }
          } catch (e) {}
          await dbSetUserWaStatus(uid, 'scan_qr', '');
          if (tenant.reconnectTimer) clearTimeout(tenant.reconnectTimer);
          tenant.reconnectTimer = setTimeout(() => {
            startTenantSocket(uid);
          }, 1500);
        }
      } else if (connection === 'open') {
        tenant.status = 'connected';
        tenant.qr = null;
        tenant.isConnecting = false;

        const rawNum = sock.user?.id ? sock.user.id.split(':')[0].replace(/[^0-9]/g, '') : '';
        tenant.phone = rawNum ? `+${rawNum}` : 'Terhubung';

        await dbSetUserWaStatus(uid, 'connected', tenant.phone);
        console.log(`✅ [WA USER #${uid}] BERHASIL TERHUBUNG KE WHATSAPP! (${tenant.phone})`);
        dbAddNotificationLog({
          category: 'WHATSAPP',
          recipient: tenant.phone,
          title: `WhatsApp Tertaut (User #${uid})`,
          message: `Nomor WhatsApp ${tenant.phone} berhasil tertaut ke sistem bot AI (User ID #${uid}).`,
          status: 'success'
        }).catch(() => {});
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith('@g.us');
        const isFromMe = msg.key.fromMe;

        const body =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          '';

        const trimmedText = body.trim();
        if (!trimmedText || isFromMe) continue;

        const senderName = msg.pushName || (isGroup ? 'Pelanggan Grup' : 'Kakak Pelanggan');

        // Proteksi Cooldown per pengirim & akun
        const cooldownKey = `${uid}:${jid}`;
        const lastMsgTime = userCooldownMap.get(cooldownKey) || 0;
        const now = Date.now();
        if (now - lastMsgTime < 2500) continue;
        userCooldownMap.set(cooldownKey, now);

        // Cek sisa kuota akun ini sebelum membalas
        const userQuota = await dbGetUserQuota(uid);
        if (userQuota && userQuota.remaining <= 0) {
          console.log(`⚠️ [WA USER #${uid}] Kuota habis (0 tersisa). Pesan dari ${senderName} tidak dibalas otomatis.`);
          continue;
        }

        if (autoRead) {
          try { await sock.readMessages([msg.key]); } catch (e) {}
        }

        console.log(`📩 [WA USER #${uid}] Pesan dari ${senderName}: "${trimmedText.slice(0, 50)}"`);

        if (isGroup && respondGroupTagOnly) {
          const botJid = (sock.user?.id ? sock.user.id.split(':')[0] : '') + '@s.whatsapp.net';
          const mentionedJidList = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
          const isMentioned = mentionedJidList.includes(botJid);
          const isReplyToBot = msg.message.extendedTextMessage?.contextInfo?.participant === botJid;
          const isCommand = trimmedText.startsWith(prefix);

          if (!isMentioned && !isReplyToBot && !isCommand) continue;
        }

        let cleanQuery = trimmedText;
        if (isGroup) {
          cleanQuery = cleanQuery.replace(/@\d+/g, '').trim();
        }

        // Cari jawaban dari Knowledge Base milik akun userId ini
        const match = await knowledgeManager.findAnswer(cleanQuery, uid);

        if (match.found) {
          const rawAns = String(match.answer || '').trim();
          const planLower = String(userQuota?.plan || '').toLowerCase();
          const isWatermarkFree =
            planLower.includes('bisnis') ||
            planLower.includes('pro') ||
            planLower.includes('enterprise') ||
            planLower.includes('unlimited') ||
            planLower.includes('admin');

          const finalReplyText = (isWatermarkFree || rawAns.toLowerCase().includes('sent via artapos.id'))
            ? rawAns
            : `${rawAns}\n\n> sent via artapos.id`;

          await sock.sendPresenceUpdate('composing', jid);
          await new Promise(res => setTimeout(res, 1100));
          await sock.sendPresenceUpdate('paused', jid);
          await sock.sendMessage(jid, { text: finalReplyText }, { quoted: msg });

          // Potong kuota (-1 token) dari akun pemilik nomor WhatsApp ini
          await dbDeductQuota(uid);
          console.log(`✅ [WA USER #${uid}] Dijawab otomatis & kuota terpotong (-1).`);
          dbAddNotificationLog({
            category: 'WHATSAPP',
            recipient: `${senderName} (${jid.split('@')[0]})`,
            title: `Bot AI Membalas Pesan WhatsApp (User #${uid})`,
            message: `Pesan Masuk: "${cleanQuery.slice(0, 80)}" -> Dijawab otomatis (Kuota -1).`,
            status: 'success'
          }).catch(() => {});
        }
      }
    });
  } catch (err) {
    console.error(`❌ [WA USER #${uid}] Error socket:`, err.message);
  } finally {
    tenant.isConnecting = false;
  }

  return tenant;
}

async function bootArtaposServer() {
  await initTiDB();
  const version = await getBaileysVersion();

  console.log(`\n======================================================`);
  console.log(`🛒 Memulai artapos.id Multi-Tenant WhatsApp Assistant`);
  console.log(`📦 Baileys Version: ${version.join('.')}`);
  console.log(`☁️ Cloud Serverless Multi-Tenant Database Active`);
  console.log(`🌐 Dashboard: http://localhost:${WEB_PORT}`);
  console.log(`======================================================\n`);

  startWebServer();

  // Pulihkan sesi WhatsApp untuk akun yang sudah pernah tertaut sebelumnya di folder auth_info_baileys/user_*
  try {
    if (fs.existsSync(AUTH_DIR)) {
      const entries = fs.readdirSync(AUTH_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('user_')) {
          const uid = Number(entry.name.replace('user_', ''));
          const credsPath = path.join(AUTH_DIR, entry.name, 'creds.json');
          if (uid > 0 && fs.existsSync(credsPath)) {
            ensureTenantWhatsApp(uid);
          }
        }
      }
    }
  } catch (e) {}
}

if (process.env.VERCEL !== '1') {
  bootArtaposServer();
}
