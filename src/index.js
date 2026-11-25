import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { knowledgeManager } from './knowledge.js';
import { createHttpHandler } from './httpHandler.js';
import {
  initTiDB,
  dbGetConfig,
  dbDeductQuota,
  dbGetUserQuota,
  dbSetUserWaStatus,
  dbGetPendingWaCommands,
  dbAddNotificationLog
} from './db.js';

dotenv.config();

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
const AUTH_DIR = path.join(ROOT_DIR, 'auth_info_baileys');

const prefix = process.env.PREFIX || '.';
const autoRead = process.env.AUTO_READ !== 'false';
const respondGroupTagOnly = process.env.RESPOND_GROUP_TAG_ONLY !== 'false';
const WEB_PORT = Number(process.env.PORT) || 3000;
let webServerStarted = false;
const userCooldownMap = new Map();

function cleanupTenantWa(uid) {
  try {
    const userDir = getTenantAuthDir(uid);
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
    tenantSessions.delete(Number(uid));
  } catch (e) {}
}

const handleHttpRequest = createHttpHandler({
  ensureTenantWhatsApp: (...args) => ensureTenantWhatsApp(...args),
  resetTenantWhatsApp: (...args) => resetTenantWhatsApp(...args),
  cleanupTenantWa
});

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

    const {
      default: makeWASocket,
      Browsers,
      DisconnectReason,
      makeCacheableSignalKeyStore,
      useMultiFileAuthState
    } = await import('@whiskeysockets/baileys');
    const { default: pino } = await import('pino');
    const { default: QRCode } = await import('qrcode');

    const waLogger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(userDir);
    const version = await getBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: waLogger,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, waLogger)
      },
      browser: Browsers.ubuntu('Chrome'),
      connectTimeoutMs: 60000,
      qrTimeout: 45000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false
    });

    tenant.sock = sock;
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        tenant.status = 'scan_qr';
        try {
          tenant.qr = await QRCode.toDataURL(qr, { margin: 1, scale: 6, errorCorrectionLevel: 'M' });
          await dbSetUserWaStatus(uid, 'scan_qr', '', tenant.qr);
          console.log(`📱 [WA USER #${uid}] Kode QR Resmi WhatsApp Web siap dipindai & disinkronkan ke TiDB Cloud!`);
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

        // Cek Saklar ON/OFF Bot (jika OFF, tetap terhubung tapi tidak membalas chat)
        const userCfg = await dbGetConfig(uid);
        if (userCfg && userCfg.bot_enabled === '0') {
          console.log(`⏸️ [WA USER #${uid}] Saklar Bot sedang OFF. Pesan dari ${senderName} diabaikan.`);
          continue;
        }

        // Cek sisa token & masa aktif akun ini sebelum membalas (Kedaluwarsa = sisa token hangus)
        const userQuota = await dbGetUserQuota(uid);
        if (userQuota && (userQuota.isExpired || userQuota.remaining <= 0)) {
          console.log(`⚠️ [WA USER #${uid}] ${userQuota.isExpired ? 'Masa aktif habis (kedaluwarsa)' : 'Token habis'} (0 tersisa). Pesan dari ${senderName} tidak dibalas otomatis.`);
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
          // Free (75 Token) & 25K (300 Token) masih ada watermark; 35K, 50K, 70K, 100K+ BEBAS watermark
          const isWatermarkFree =
            planLower.includes('35k') ||
            planLower.includes('plus') ||
            planLower.includes('50k') ||
            planLower.includes('starter') ||
            planLower.includes('70k') ||
            planLower.includes('100k') ||
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

  // Dengarkan permintaan Generate QR / Reset Sesi dari Vercel (www.artapos.id) via TiDB Cloud setiap 1 detik
  let isCheckingWaCommands = false;
  setInterval(async () => {
    if (isCheckingWaCommands) return;
    isCheckingWaCommands = true;
    try {
      const cmds = await dbGetPendingWaCommands();
      for (const cmd of cmds) {
        if (!cmd.userId) continue;
        if (cmd.command === 'reset') {
          console.log(`🔄 [CLOUD SYNC] Menerima perintah Reset QR untuk User #${cmd.userId} dari www.artapos.id`);
          resetTenantWhatsApp(cmd.userId).catch(() => {});
        } else if (cmd.command === 'ensure') {
          const existing = tenantSessions.get(cmd.userId);
          if (!existing || (existing.status !== 'connected' && !existing.qr && !existing.isConnecting)) {
            console.log(`📲 [CLOUD SYNC] Menerima permintaan QR baru untuk User #${cmd.userId} dari www.artapos.id`);
            ensureTenantWhatsApp(cmd.userId).catch(() => {});
          } else if (existing.qr) {
            await dbSetUserWaStatus(cmd.userId, 'scan_qr', '', existing.qr);
          } else if (existing.status === 'connected') {
            await dbSetUserWaStatus(cmd.userId, 'connected', existing.phone || '', '');
          }
        }
      }
    } catch (e) {} finally {
      isCheckingWaCommands = false;
    }
  }, 1000);
}

if (process.env.VERCEL !== '1') {
  bootArtaposServer();
}

export default handleHttpRequest;
