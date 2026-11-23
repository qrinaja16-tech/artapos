import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPassword, verifyPassword, generateSecureToken } from './security.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');

const pool = mysql.createPool({
  host: process.env.TIDB_HOST || 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com',
  port: Number(process.env.TIDB_PORT) || 4000,
  user: process.env.TIDB_USER || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DATABASE || 'test',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Inisialisasi tabel di Cloud dengan dukungan Multi-Tenant (user_id Scoping)
 */
export async function initTiDB() {
  try {
    const conn = await pool.getConnection();

    // 1. Tabel Users (Tenant / Pelanggan artapos.id)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        store_name VARCHAR(255) DEFAULT 'Toko AI Assistant',
        plan VARCHAR(100) DEFAULT 'Paket Bisnis',
        quota_total INT DEFAULT 2500,
        quota_used INT DEFAULT 0,
        role VARCHAR(50) DEFAULT 'user',
        active_until DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Pastikan kolom role dan device_id ada di tabel users (1 Email = 1 Device Lock)
    try {
      const [colsUsers] = await conn.query("SHOW COLUMNS FROM users LIKE 'role'");
      if (!colsUsers || colsUsers.length === 0) {
        await conn.query("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user'");
      }
      const [colsDevice] = await conn.query("SHOW COLUMNS FROM users LIKE 'device_id'");
      if (!colsDevice || colsDevice.length === 0) {
        console.log('🔒 Menambahkan kolom device_id (Proteksi 1 Email 1 Device) ke tabel users...');
        await conn.query("ALTER TABLE users ADD COLUMN device_id VARCHAR(128) DEFAULT NULL");
        try {
          await conn.query("ALTER TABLE users ADD INDEX idx_user_device (device_id)");
        } catch (_) {}
      }
    } catch (e) {
      console.warn('⚠️ Users column migration notice:', e.message);
    }

    // 2. Tabel Sessions (Autentikasi Aman & Anti-Session Hijacking)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_user_id (user_id),
        INDEX idx_token (token)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Tabel Knowledge (Terkunci dengan user_id per akun)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS knowledge (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL DEFAULT 1,
        questions JSON NOT NULL,
        keywords JSON NOT NULL,
        answer TEXT NOT NULL,
        category VARCHAR(100) DEFAULT 'umum',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_knowledge (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Pastikan kolom user_id ada di tabel knowledge
    try {
      const [cols] = await conn.query("SHOW COLUMNS FROM knowledge LIKE 'user_id'");
      if (!cols || cols.length === 0) {
        console.log('🔄 Menambahkan kolom user_id ke tabel knowledge...');
        await conn.query("ALTER TABLE knowledge ADD COLUMN user_id INT NOT NULL DEFAULT 1");
        try {
          await conn.query("ALTER TABLE knowledge ADD INDEX idx_user_knowledge (user_id)");
        } catch (_) {}
        console.log('✅ Kolom user_id berhasil ditambahkan ke knowledge.');
      }
    } catch (e) {
      console.warn('⚠️ Knowledge migration notice:', e.message);
    }

    // 4. Tabel Config Toko (Terkunci dengan user_id per akun)
    try {
      const [tblConfig] = await conn.query("SHOW TABLES LIKE 'config'");
      if (tblConfig && tblConfig.length > 0) {
        const [colsConfig] = await conn.query("SHOW COLUMNS FROM config LIKE 'user_id'");
        if (!colsConfig || colsConfig.length === 0) {
          console.log('🔄 Memperbarui struktur tabel config multi-tenant...');
          await conn.query("DROP TABLE IF EXISTS config");
        }
      }
    } catch (e) {}

    await conn.query(`
      CREATE TABLE IF NOT EXISTS config (
        user_id INT NOT NULL DEFAULT 1,
        config_key VARCHAR(100) NOT NULL,
        config_value TEXT NOT NULL,
        PRIMARY KEY (user_id, config_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Tabel Orders (Transaksi Pembayaran Midtrans)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id VARCHAR(100) PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        plan VARCHAR(100) NOT NULL,
        amount INT NOT NULL,
        quota INT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        snap_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Tabel Notifications & Activity Log (Pantau Daftar, Login, Logout, Email, WA & Keamanan)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category VARCHAR(60) DEFAULT 'EMAIL',
        recipient VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(40) DEFAULT 'success',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Tabel Visits Log (Grafik Kunjungan Website Real-Time +1 Otomatis)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS visits_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(100) DEFAULT '127.0.0.1',
        page_view VARCHAR(100) DEFAULT 'landing',
        visitor_email VARCHAR(255) DEFAULT 'Pengunjung',
        user_agent VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_visits_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Pastikan akun Paket Gratis lama (100) otomatis disesuaikan ke 300 Token
    try {
      await conn.query(
        `UPDATE users SET plan = 'Paket Gratis (300 Token)', quota_total = 300 
         WHERE quota_total = 100 AND (plan LIKE '%Gratis%' OR plan LIKE '%Free%')`
      );
    } catch (e) {}

    try {
      const [nCount] = await conn.query('SELECT COUNT(*) AS total FROM notifications_log');
      if (nCount[0].total === 0) {
        await conn.query(
          `INSERT INTO notifications_log (category, recipient, title, message, status) VALUES
           ('EMAIL', 'qrinaja16@gmail.com', 'Email Aktivasi & Password Terkirim (Toko AI Assistant)', 'Password login berhasil dikirim melalui SMTP resmi artapos26@gmail.com.', 'success'),
           ('WHATSAPP', '+6281949223100', 'WhatsApp Tertaut (User #90002)', 'Nomor WhatsApp +6281949223100 berhasil tertaut ke sistem bot AI.', 'success'),
           ('AUTH', 'achmadfurqon33@gmail.com', 'Login Super Admin Berhasil', 'Super Admin achmadfurqon33@gmail.com masuk ke pusat pemantauan artapos.id.', 'success')`
        );
      }
    } catch (e) {}

    // Seed default knowledge untuk user_id = 1 jika kosong
    const [rows] = await conn.query('SELECT COUNT(*) AS total FROM knowledge');
    if (rows[0].total === 0 && fs.existsSync(KNOWLEDGE_FILE)) {
      const localData = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
      for (const item of localData) {
        await conn.query(
          'INSERT INTO knowledge (user_id, questions, keywords, answer, category) VALUES (1, ?, ?, ?, ?)',
          [
            JSON.stringify(item.questions || []),
            JSON.stringify(item.keywords || []),
            item.answer,
            item.category || 'umum'
          ]
        );
      }
    }

    // Seed / Pastikan Akun Super Admin Tersedia
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'achmadfurqon33@gmail.com';
    const superAdminPlainPw = process.env.SUPER_ADMIN_INITIAL_PASSWORD || '';
    const [existSuper] = await conn.query("SELECT id, password FROM users WHERE email = ? LIMIT 1", [superAdminEmail]);
    if ((!existSuper || existSuper.length === 0) && superAdminPlainPw) {
      const superHash = hashPassword(superAdminPlainPw);
      await conn.query(
        `INSERT INTO users (email, password, store_name, plan, quota_total, quota_used, role, active_until) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [superAdminEmail, superHash, 'Super Admin artapos.id', 'Super Admin Unlimited', 9999999, 0, 'superadmin', '2099-12-31 23:59:59']
      );
      console.log('👑 [SUPER ADMIN] Akun super admin achmadfurqon33@gmail.com berhasil dibuat di TiDB!');
    } else {
      // Pastikan role diset sebagai superadmin
      await conn.query("UPDATE users SET role = 'superadmin' WHERE email = ?", [superAdminEmail]);
    }

    // Auto-seed pengetahuan dan config default untuk semua akun pengguna yang belum memiliki data
    try {
      const [userRows] = await conn.query("SELECT id, store_name FROM users WHERE role != 'superadmin'");
      for (const u of userRows) {
        const [kCount] = await conn.query('SELECT COUNT(*) AS total FROM knowledge WHERE user_id = ?', [u.id]);
        if (kCount[0].total === 0) {
          await seedUserDefaultKnowledgeAndConfig(u.id, u.store_name);
        }
      }
    } catch (e) {
      console.warn('⚠️ Auto-seed check error:', e.message);
    }

    conn.release();
    console.log('☁️ TiDB Cloud Multi-Tenant Database Terhubung & Siap Digunakan!');
  } catch (err) {
    console.error('❌ Gagal inisialisasi TiDB Cloud:', err.message);
  }
}

// ==========================================
// SESSION MANAGEMENT (TOKEN BASED)
// ==========================================
export async function dbCreateSession(userId, email, days = 14) {
  try {
    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await pool.query(
      'INSERT INTO sessions (token, user_id, email, expires_at) VALUES (?, ?, ?, ?)',
      [token, Number(userId), email.trim().toLowerCase(), expiresAt]
    );
    return { token, expiresAt };
  } catch (err) {
    console.error('dbCreateSession Error:', err.message);
    throw err;
  }
}

export async function dbGetSession(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const [rows] = await pool.query(
      `SELECT s.token, s.user_id, s.email, s.expires_at, 
              u.store_name, u.plan, u.quota_total, u.quota_used, u.active_until, u.role
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > NOW() LIMIT 1`,
      [token.trim()]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('dbGetSession Error:', err.message);
    return null;
  }
}

export async function dbDeleteSession(token) {
  try {
    await pool.query('DELETE FROM sessions WHERE token = ?', [token.trim()]);
    return true;
  } catch (err) {
    return false;
  }
}

// ==========================================
// MULTI-TENANT KNOWLEDGE BASE (SCOPED BY USER_ID)
// ==========================================
export async function dbGetAllKnowledge(userId = 1) {
  try {
    const targetUserId = typeof userId === 'number' || (typeof userId === 'string' && !isNaN(userId)) ? Number(userId) : 1;
    const [rows] = await pool.query(
      'SELECT id, questions, keywords, answer, category FROM knowledge WHERE user_id = ? ORDER BY id ASC',
      [targetUserId]
    );
    return rows.map(r => ({
      id: r.id,
      questions: typeof r.questions === 'string' ? JSON.parse(r.questions) : r.questions,
      keywords: typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords,
      answer: r.answer,
      category: r.category
    }));
  } catch (err) {
    console.error('dbGetAllKnowledge Error:', err.message);
    return [];
  }
}

export async function dbAddKnowledge(arg1, arg2) {
  let userId = 1;
  let data = arg1;
  if (typeof arg1 === 'number' || (typeof arg1 === 'string' && !isNaN(arg1))) {
    userId = Number(arg1);
    data = arg2;
  }
  const { questions = [], keywords = [], answer = '', category = 'umum' } = data || {};

  try {
    const [result] = await pool.query(
      'INSERT INTO knowledge (user_id, questions, keywords, answer, category) VALUES (?, ?, ?, ?, ?)',
      [
        Number(userId),
        JSON.stringify(Array.isArray(questions) ? questions : [questions]),
        JSON.stringify(Array.isArray(keywords) ? keywords : String(keywords).split(',').map(s => s.trim())),
        String(answer).trim(),
        String(category).trim()
      ]
    );
    return {
      id: result.insertId,
      questions,
      keywords,
      answer,
      category
    };
  } catch (err) {
    console.error('dbAddKnowledge Error:', err.message);
    return null;
  }
}

export async function dbUpdateKnowledge(arg1, arg2, arg3) {
  let userId = 1;
  let id = arg1;
  let data = arg2;
  if (arg3 !== undefined) {
    userId = Number(arg1);
    id = arg2;
    data = arg3;
  }
  const { questions = [], keywords = [], answer = '', category = 'umum' } = data || {};

  try {
    await pool.query(
      'UPDATE knowledge SET questions = ?, keywords = ?, answer = ?, category = ? WHERE id = ? AND user_id = ?',
      [
        JSON.stringify(Array.isArray(questions) ? questions : [questions]),
        JSON.stringify(Array.isArray(keywords) ? keywords : String(keywords).split(',').map(s => s.trim())),
        String(answer).trim(),
        String(category).trim(),
        Number(id),
        Number(userId)
      ]
    );
    return true;
  } catch (err) {
    console.error('dbUpdateKnowledge Error:', err.message);
    return false;
  }
}

export async function dbDeleteKnowledge(arg1, arg2) {
  let userId = 1;
  let id = arg1;
  if (arg2 !== undefined) {
    userId = Number(arg1);
    id = arg2;
  }
  try {
    await pool.query('DELETE FROM knowledge WHERE id = ? AND user_id = ?', [Number(id), Number(userId)]);
    return true;
  } catch (err) {
    console.error('dbDeleteKnowledge Error:', err.message);
    return false;
  }
}

// Unanswered helpers
export async function dbGetUnanswered() {
  return [];
}
export async function dbAddUnanswered(senderName, senderJid, question) {
  return { id: Date.now(), senderName, senderJid, question, timestamp: new Date().toISOString() };
}
export async function dbDeleteUnanswered(id) {
  return true;
}

// ==========================================
// CONFIG TOKO (SCOPED BY USER_ID)
// ==========================================
export async function dbGetConfig(userId = 1) {
  try {
    const [rows] = await pool.query('SELECT config_key, config_value FROM config WHERE user_id = ?', [Number(userId)]);
    const cfg = {};
    for (const r of rows) {
      try {
        cfg[r.config_key] = JSON.parse(r.config_value);
      } catch (e) {
        cfg[r.config_key] = r.config_value;
      }
    }
    return cfg;
  } catch (err) {
    console.error('dbGetConfig Error:', err.message);
    return {};
  }
}

export async function dbSaveConfig(userId = 1, configObj) {
  try {
    for (const [k, v] of Object.entries(configObj)) {
      const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
      await pool.query(
        `INSERT INTO config (user_id, config_key, config_value) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_value = ?`,
        [Number(userId), k, valStr, valStr]
      );
    }
    return true;
  } catch (err) {
    console.error('dbSaveConfig Error:', err.message);
    return false;
  }
}

// ==========================================
// MANAJEMEN USERS & KUOTA (HASHED PASSWORDS)
// ==========================================
export async function dbGetUser(email) {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    return rows[0] || null;
  } catch (err) {
    console.error('dbGetUser Error:', err.message);
    return null;
  }
}

export async function dbGetUserById(id) {
  try {
    const [rows] = await pool.query('SELECT id, email, store_name, plan, quota_total, quota_used, active_until, role, device_id FROM users WHERE id = ? LIMIT 1', [Number(id)]);
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

/**
 * Validasi & Kunci 1 Email = 1 Device saat Login
 * (Super Admin dikecualikan agar bebas memantau dari perangkat mana saja)
 */
function extractHardwareDevicePrefix(devId = '') {
  const str = String(devId || '').trim();
  const parts = str.split('_');
  if (parts.length >= 2 && parts[0] === 'artadev' && parts[1].length >= 6) {
    return `${parts[0]}_${parts[1]}`;
  }
  return str;
}

export async function dbVerifyAndBindUserDevice(user, deviceId) {
  if (!user || user.role === 'superadmin') {
    return { allowed: true };
  }
  const cleanDevice = deviceId ? String(deviceId).trim().slice(0, 120) : '';
  if (!cleanDevice) {
    return { allowed: true };
  }
  const hwPrefix = extractHardwareDevicePrefix(cleanDevice);

  // 1. Cek apakah perangkat (device_id / hardware signature) ini sudah dipakai oleh akun email LAIN
  const [otherUsersOnDevice] = await pool.query(
    "SELECT id, email FROM users WHERE (device_id = ? OR device_id LIKE ?) AND id != ? AND role != 'superadmin' LIMIT 1",
    [cleanDevice, `${hwPrefix}_%`, Number(user.id)]
  );
  if (otherUsersOnDevice.length > 0) {
    const boundEmail = otherUsersOnDevice[0].email;
    return {
      allowed: false,
      reason: `⛔ Kebijakan 1 Perangkat 1 Email: Perangkat ini sudah terkunci untuk akun ${boundEmail}. Satu perangkat tidak boleh login berganti-ganti dengan banyak akun email!`
    };
  }

  // 2. Cek apakah email ini sudah terkunci pada perangkat LAIN
  if (user.device_id) {
    const existingPrefix = extractHardwareDevicePrefix(user.device_id);
    if (user.device_id !== cleanDevice && existingPrefix !== hwPrefix) {
      return {
        allowed: false,
        reason: `⛔ Kebijakan 1 Email 1 Perangkat: Akun ${user.email} sudah tertaut pada perangkat lain. Demi keamanan & pencegahan penyalahgunaan token gratis, 1 email hanya berlaku untuk 1 perangkat.`
      };
    }
  }

  // 3. Jika belum terikat (atau update ke deterministic ID pada perangkat yang sama), kunci akun ini
  if (!user.device_id || user.device_id !== cleanDevice) {
    await pool.query('UPDATE users SET device_id = ? WHERE id = ?', [cleanDevice, Number(user.id)]);
  }

  return { allowed: true };
}

export async function seedUserDefaultKnowledgeAndConfig(userId, storeName = 'Toko AI Assistant') {
  try {
    const sName = storeName || 'Toko AI Assistant';

    // 1. Simpan default config toko
    await dbSaveConfig(userId, {
      store_name: sName,
      bot_name: sName + ' AI Assistant',
      welcome_msg: `Halo kak! Selamat datang di ${sName}. Ada yang bisa kami bantu seputar produk atau pesanan hari ini? 😊`,
      wa_status: 'scan_qr',
      wa_phone: ''
    });

    // 2. Cek apakah sudah ada knowledge untuk user ini
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM knowledge WHERE user_id = ?', [Number(userId)]);
    if (rows[0].total > 0) return true;

    // 3. Bank Soal & Jawaban Default (Otomatis Diisi Saat Daftar Baru)
    const templates = [
      {
        questions: ["halo", "selamat pagi", "selamat siang", "selamat malam", "permisi", "hai admin", "assalamualaikum"],
        keywords: ["halo", "hai", "admin", "pagi", "siang", "malam", "assalamualaikum"],
        answer: `Halo kak! Selamat datang di *${sName}*. Kami siap melayani informasi produk dan pemesanan 24 jam otomatis dibantu oleh AI Assistant. Ada yang bisa kami bantu? 😊`,
        category: "umum"
      },
      {
        questions: ["jam berapa toko buka", "jam buka", "jam operasional", "apakah masih buka", "tutup jam berapa"],
        keywords: ["jam", "buka", "tutup", "operasional", "jadwal"],
        answer: `Toko kami buka setiap hari:\n🗓️ *Senin - Sabtu*: 08:00 - 21:00 WIB\n🗓️ *Minggu / Libur*: 09:00 - 18:00 WIB\nWhatsApp bot ini aktif *24 jam nonstop* untuk mencatat pesanan kakak kapan saja! ⏰`,
        category: "informasi_toko"
      },
      {
        questions: ["berapa harganya", "daftar harga", "katalog produk", "ada produk apa saja", "harga promo", "pricelist"],
        keywords: ["harga", "produk", "katalog", "promo", "stok", "biaya", "pricelist"],
        answer: `Produk kami tersedia dalam berbagai varian berkualitas dengan penawaran harga terbaik. Silakan sebutkan nama atau foto produk yang kakak inginkan untuk langsung kami cekkan stok & promonya! 🏷️✨`,
        category: "produk"
      },
      {
        questions: ["bisa bayar lewat apa", "metode pembayaran", "rekening pembayaran", "bisa bayar qris", "bisa cod", "cara bayar"],
        keywords: ["bayar", "transfer", "rekening", "qris", "cod", "bca", "dana", "pembayaran"],
        answer: `Kami menyediakan metode pembayaran yang mudah & aman:\n💳 *Transfer Bank*: BCA, Mandiri, BRI, BNI\n📱 *QRIS*: GoPay, OVO, Dana, ShopeePay\n📦 *COD (Bayar di Tempat)*: Khusus area pulau Jawa\nSilakan tentukan produk pilihan kakak! 🛍️`,
        category: "pembayaran"
      },
      {
        questions: ["bagaimana cara pesan", "cara order", "gimana cara belinya", "format order", "mau beli dong"],
        keywords: ["pesan", "order", "beli", "format", "cara", "langkah"],
        answer: `Cara pemesanan sangat praktis kak:\n1️⃣ Kirimkan nama/foto produk & jumlahnya\n2️⃣ Ketik Nama Penerima, No. HP, & Alamat Lengkap\n3️⃣ Admin AI kami akan segera mengirimkan total tagihan & konfirmasi pengiriman! 🛒`,
        category: "pemesanan"
      },
      {
        questions: ["kirim dari mana", "ekspedisi apa saja", "berapa lama pengiriman", "ongkir berapa", "bisa instant gosend"],
        keywords: ["kirim", "pengiriman", "ekspedisi", "ongkir", "jnt", "sicepat", "jne", "resi", "gosend"],
        answer: `Pengiriman dilakukan setiap hari kerja via *J&T, SiCepat, JNE*, serta kurir instan *Grab/Gojek*. Estimasi pesanan sampai 1-3 hari kerja tergantung kota tujuan kakak. Nomor resi otomatis diinfokan setelah paket dikemas ya! 🚚💨`,
        category: "pengiriman"
      },
      {
        questions: ["apakah ada garansi", "bisa retur kalau rusak", "barang cacat gimana", "komplain barang", "garansi resmi"],
        keywords: ["garansi", "retur", "rusak", "cacat", "komplain", "tukar", "retur"],
        answer: `Tenang kak, semua produk kami bergaransi toko *100% aman*! Jika barang yang diterima cacat/salah kirim, sertakan video unboxing dan kami kirimkan pengganti baru tanpa biaya tambahan. Kepuasan kakak adalah komitmen kami! 🙏✨`,
        category: "garansi"
      }
    ];

    for (const t of templates) {
      await pool.query(
        'INSERT INTO knowledge (user_id, questions, keywords, answer, category) VALUES (?, ?, ?, ?, ?)',
        [
          Number(userId),
          JSON.stringify(t.questions),
          JSON.stringify(t.keywords),
          t.answer,
          t.category
        ]
      );
    }

    console.log(`✅ [AUTO-SEED] Berhasil mengisi 7 template Q&A default untuk User #${userId} (${sName})!`);
    return true;
  } catch (err) {
    console.error('seedUserDefaultKnowledgeAndConfig Error:', err.message);
    return false;
  }
}

export async function dbGetUserWaStatus(userId) {
  try {
    const cfg = await dbGetConfig(userId);
    return {
      wa_status: cfg.wa_status || 'scan_qr',
      wa_phone: cfg.wa_phone || ''
    };
  } catch (err) {
    return { wa_status: 'scan_qr', wa_phone: '' };
  }
}

export async function dbSetUserWaStatus(userId, status, phone = '', qrDataUrl = '') {
  try {
    await dbSaveConfig(userId, {
      wa_status: status,
      wa_phone: phone,
      wa_qr: qrDataUrl || '',
      wa_updated_at: String(Date.now())
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function dbRequestUserWaCommand(userId, command = 'ensure') {
  try {
    await dbSaveConfig(userId, {
      wa_command: String(command || ''),
      wa_command_at: String(Date.now())
    });
    return true;
  } catch (err) {
    return false;
  }
}

export async function dbGetPendingWaCommands() {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, config_value FROM config WHERE config_key = 'wa_command' AND config_value != ''"
    );
    if (rows.length > 0) {
      await pool.query("UPDATE config SET config_value = '' WHERE config_key = 'wa_command' AND config_value != ''");
    }
    return rows.map(r => ({ userId: Number(r.user_id), command: String(r.config_value) }));
  } catch (err) {
    return [];
  }
}

export async function dbRegisterFreeUser({ email, password = null, storeName = 'Toko AI Assistant', deviceId = null }) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanDevice = deviceId ? String(deviceId).trim().slice(0, 120) : null;
    
    // Validasi email resmi Google
    if (!cleanEmail.endsWith('@gmail.com')) {
      throw new Error('Wajib menggunakan email Google (@gmail.com).');
    }

    // ====================================================
    // PROTEKSI AWAL: 1 PERANGKAT (DEVICE) = 1 AKUN EMAIL
    // Mencegah 1 HP / Laptop mendaftar banyak email untuk dapat 300 token gratis terus-menerus
    // ====================================================
    if (cleanDevice) {
      const hwPrefix = extractHardwareDevicePrefix(cleanDevice);
      const [deviceBound] = await pool.query(
        "SELECT id, email FROM users WHERE (device_id = ? OR device_id LIKE ?) AND LOWER(email) != ? AND role != 'superadmin' LIMIT 1",
        [cleanDevice, `${hwPrefix}_%`, cleanEmail]
      );
      if (deviceBound.length > 0) {
        const boundEmail = deviceBound[0].email;
        throw new Error(`⛔ Proteksi 1 Perangkat 1 Akun: Perangkat Anda sudah terdaftar dengan email ${boundEmail}. Tidak diperbolehkan mendaftar banyak akun gratis di 1 perangkat yang sama!`);
      }
    }

    let rawPassword = (password || '').trim();
    if (!rawPassword) {
      rawPassword = 'Arta' + Math.floor(1000 + Math.random() * 9000);
    }
    if (rawPassword.length > 20) {
      throw new Error('Password maksimal 20 karakter.');
    }

    const hashedPassword = hashPassword(rawPassword);

    const [existing] = await pool.query(
      'SELECT id, role, store_name, plan, quota_total, active_until, device_id FROM users WHERE LOWER(email) = ? LIMIT 1',
      [cleanEmail]
    );

    if (existing.length > 0) {
      const existingUser = existing[0];
      if (existingUser.role === 'superadmin') {
        throw new Error('Email ini adalah akun Super Admin. Silakan langsung masuk di halaman Login.');
      }
      // Jika akun ini sudah terkunci di perangkat lain, tolak reset dari perangkat berbeda
      if (existingUser.device_id && cleanDevice && existingUser.device_id !== cleanDevice) {
        throw new Error(`⛔ Proteksi 1 Email 1 Perangkat: Email ${cleanEmail} sudah terkunci pada perangkat lain dan tidak dapat diakses dari perangkat ini.`);
      }
      // Update password baru & kunci device_id
      const finalStore = storeName || existingUser.store_name || 'Toko AI Assistant';
      await pool.query(
        'UPDATE users SET password = ?, store_name = ?, device_id = COALESCE(device_id, ?) WHERE id = ?',
        [hashedPassword, finalStore, cleanDevice, existingUser.id]
      );
      await seedUserDefaultKnowledgeAndConfig(existingUser.id, finalStore);
      return {
        id: existingUser.id,
        email: cleanEmail,
        rawPassword,
        storeName: finalStore,
        plan: existingUser.plan || 'Paket Gratis (300 Token)',
        quota_total: existingUser.quota_total || 300,
        active_until: existingUser.active_until
      };
    }

    const activeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 hari aktif

    const [res] = await pool.query(
      `INSERT INTO users (email, password, store_name, plan, quota_total, quota_used, role, active_until, device_id) 
       VALUES (?, ?, ?, 'Paket Gratis (300 Token)', 300, 0, 'user', ?, ?)`,
      [cleanEmail, hashedPassword, storeName || 'Toko AI Assistant', activeUntil, cleanDevice]
    );

    const newUserId = res.insertId;
    await seedUserDefaultKnowledgeAndConfig(newUserId, storeName);

    return {
      id: newUserId,
      email: cleanEmail,
      rawPassword,
      storeName: storeName || 'Toko AI Assistant',
      plan: 'Paket Gratis (300 Token)',
      quota_total: 300,
      active_until: activeUntil
    };
  } catch (err) {
    console.error('dbRegisterFreeUser Error:', err.message);
    throw err;
  }
}

export async function dbRegisterOrUpdatePaidUser({ email, password, storeName = 'Toko AI Assistant', plan = 'Paket Bisnis', quota = 2500, daysActive = 30 }) {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const activeUntil = new Date(Date.now() + daysActive * 24 * 60 * 60 * 1000);
    // Hash password kuat dengan scrypt
    const hashedPassword = hashPassword(password);

    const [existing] = await pool.query('SELECT id, quota_total, quota_used FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);

    if (existing.length > 0) {
      const newTotal = (existing[0].quota_total || 0) + quota;
      await pool.query(
        'UPDATE users SET plan = ?, quota_total = ?, active_until = ?, store_name = COALESCE(?, store_name) WHERE id = ?',
        [plan, newTotal, activeUntil, storeName || null, existing[0].id]
      );
      return { id: existing[0].id, email: cleanEmail, plan, quota_total: newTotal, active_until: activeUntil, isNew: false };
    } else {
      const [res] = await pool.query(
        'INSERT INTO users (email, password, store_name, plan, quota_total, quota_used, active_until) VALUES (?, ?, ?, ?, ?, 0, ?)',
        [cleanEmail, hashedPassword, storeName || 'Toko AI Assistant', plan, quota, activeUntil]
      );
      const newUserId = res.insertId;
      await seedUserDefaultKnowledgeAndConfig(newUserId, storeName);
      return { id: newUserId, email: cleanEmail, plan, quota_total: quota, active_until: activeUntil, isNew: true };
    }
  } catch (err) {
    console.error('dbRegisterOrUpdatePaidUser Error:', err.message);
    throw err;
  }
}

export async function dbUpdateUserAccount(userId, newEmail, newPassword = null) {
  try {
    if (newPassword && newPassword.trim()) {
      const hashedPassword = hashPassword(newPassword.trim());
      if (newEmail && newEmail.trim()) {
        await pool.query('UPDATE users SET email = ?, password = ? WHERE id = ?', [newEmail.trim().toLowerCase(), hashedPassword, Number(userId)]);
      } else {
        await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, Number(userId)]);
      }
    } else if (newEmail && newEmail.trim()) {
      await pool.query('UPDATE users SET email = ? WHERE id = ?', [newEmail.trim().toLowerCase(), Number(userId)]);
    }
    return true;
  } catch (err) {
    console.error('dbUpdateUserAccount Error:', err.message);
    return false;
  }
}

/**
 * Pemotongan Kuota Atomik (-1) per chat dijawab AI
 */
export async function dbDeductQuota(userId = null) {
  try {
    if (userId) {
      await pool.query('UPDATE users SET quota_used = quota_used + 1 WHERE id = ? AND quota_used < quota_total', [Number(userId)]);
    } else {
      await pool.query('UPDATE users SET quota_used = quota_used + 1 WHERE quota_used < quota_total ORDER BY id DESC LIMIT 1');
    }
    return true;
  } catch (err) {
    console.error('dbDeductQuota Error:', err.message);
    return false;
  }
}

export async function dbGetUserQuota(userId) {
  try {
    const [rows] = await pool.query(
      'SELECT quota_total, quota_used, (quota_total - quota_used) AS remaining, plan, active_until FROM users WHERE id = ? LIMIT 1',
      [Number(userId)]
    );
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

// ==========================================
// ORDERS MIDTRANS
// ==========================================
export async function dbCreateOrder({ orderId, email, plan, amount, quota, snapToken = null }) {
  try {
    await pool.query(
      'INSERT INTO orders (order_id, email, plan, amount, quota, status, snap_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [orderId, email.trim().toLowerCase(), plan, amount, quota, 'pending', snapToken]
    );
    return true;
  } catch (err) {
    console.error('dbCreateOrder Error:', err.message);
    return false;
  }
}

export async function dbGetOrder(orderId) {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_id = ? LIMIT 1', [orderId]);
    return rows[0] || null;
  } catch (err) {
    return null;
  }
}

export async function dbUpdateOrderStatus(orderId, status) {
  try {
    await pool.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, orderId]);
    return true;
  } catch (err) {
    return false;
  }
}

// ==========================================
// SUPER ADMIN QUERIES & AUDIT
// ==========================================
export async function dbGetAllUsers() {
  try {
    const [rows] = await pool.query(
      `SELECT id, email, store_name, plan, quota_total, quota_used, 
              (quota_total - quota_used) AS quota_remaining, 
              role, active_until, created_at, updated_at 
       FROM users ORDER BY id DESC`
    );
    return rows;
  } catch (err) {
    console.error('dbGetAllUsers Error:', err.message);
    return [];
  }
}

export async function dbGetAllOrders() {
  try {
    const [rows] = await pool.query(
      `SELECT order_id, email, plan, amount, quota, status, snap_token, created_at 
       FROM orders ORDER BY created_at DESC LIMIT 200`
    );
    return rows;
  } catch (err) {
    console.error('dbGetAllOrders Error:', err.message);
    return [];
  }
}

export async function dbGetAdminStats() {
  try {
    const [[userCount]] = await pool.query("SELECT COUNT(*) AS total_users FROM users WHERE role != 'superadmin'");
    const [[paidOrderCount]] = await pool.query("SELECT COUNT(*) AS total_paid_orders, COALESCE(SUM(amount), 0) AS total_revenue FROM orders WHERE status = 'settlement'");
    const [[quotaStats]] = await pool.query("SELECT COALESCE(SUM(quota_used), 0) AS total_quota_used FROM users");
    const [[totalKnowledge]] = await pool.query("SELECT COUNT(*) AS total_knowledge FROM knowledge");

    return {
      totalUsers: userCount?.total_users || 0,
      totalPaidOrders: paidOrderCount?.total_paid_orders || 0,
      totalRevenue: Number(paidOrderCount?.total_revenue || 0),
      totalQuotaUsed: Number(quotaStats?.total_quota_used || 0),
      totalKnowledge: totalKnowledge?.total_knowledge || 0
    };
  } catch (err) {
    console.error('dbGetAdminStats Error:', err.message);
    return { totalUsers: 0, totalPaidOrders: 0, totalRevenue: 0, totalQuotaUsed: 0, totalKnowledge: 0 };
  }
}

export async function dbUpdateUserPassword(userId, newPlainPassword) {
  try {
    const cleanPw = String(newPlainPassword || '').trim();
    if (!cleanPw || cleanPw.length > 20) {
      throw new Error('Password baru maksimal 20 karakter.');
    }
    const newHash = hashPassword(cleanPw);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [newHash, Number(userId)]);
    return true;
  } catch (err) {
    console.error('dbUpdateUserPassword Error:', err.message);
    throw err;
  }
}

export async function dbAdminUpdateUser(userId, { plan, quota_total, daysToAdd }) {
  try {
    const updates = [];
    const params = [];
    if (plan) {
      updates.push('plan = ?');
      params.push(String(plan).slice(0, 100));
    }
    if (quota_total !== undefined && !isNaN(quota_total)) {
      updates.push('quota_total = ?');
      params.push(Number(quota_total));
    }
    if (daysToAdd && !isNaN(daysToAdd)) {
      updates.push('active_until = DATE_ADD(COALESCE(active_until, NOW()), INTERVAL ? DAY)');
      params.push(Number(daysToAdd));
    }
    if (updates.length === 0) return true;
    params.push(Number(userId));
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return true;
  } catch (err) {
    console.error('dbAdminUpdateUser Error:', err.message);
    return false;
  }
}

export async function dbGetUserDetailsForAdmin(userId) {
  try {
    const [userRows] = await pool.query(
      `SELECT id, email, store_name, plan, quota_total, quota_used, 
              (quota_total - quota_used) AS quota_remaining, 
              role, active_until, created_at, updated_at 
       FROM users WHERE id = ? LIMIT 1`,
      [Number(userId)]
    );
    if (!userRows || userRows.length === 0) return null;
    const user = userRows[0];

    // Ambil database knowledge milik user ini
    const [knowledgeRows] = await pool.query(
      'SELECT id, questions, keywords, answer, category, created_at FROM knowledge WHERE user_id = ? ORDER BY id DESC',
      [Number(userId)]
    );
    const knowledge = knowledgeRows.map(r => ({
      id: r.id,
      questions: typeof r.questions === 'string' ? JSON.parse(r.questions) : r.questions,
      keywords: typeof r.keywords === 'string' ? JSON.parse(r.keywords) : r.keywords,
      answer: r.answer,
      category: r.category,
      created_at: r.created_at
    }));

    // Ambil config toko milik user ini
    const [configRows] = await pool.query(
      'SELECT config_key, config_value FROM config WHERE user_id = ?',
      [Number(userId)]
    );
    const config = {};
    for (const r of configRows) {
      try { config[r.config_key] = JSON.parse(r.config_value); } catch(e) { config[r.config_key] = r.config_value; }
    }

    // Ambil order transaksi milik user ini
    const [orders] = await pool.query(
      'SELECT order_id, email, plan, amount, quota, status, snap_token, created_at FROM orders WHERE LOWER(email) = LOWER(?) ORDER BY created_at DESC',
      [user.email]
    );

    return {
      user,
      knowledge,
      config,
      orders
    };
  } catch (err) {
    console.error('dbGetUserDetailsForAdmin Error:', err.message);
    return null;
  }
}

export async function dbAdminFullUpdateUser(userId, data) {
  try {
    const updates = [];
    const params = [];

    if (data.email && String(data.email).trim().length > 0) {
      const cleanEm = String(data.email).trim().toLowerCase().slice(0, 100);
      if (!cleanEm.endsWith('@gmail.com') || cleanEm.length < 11) {
        throw new Error('Email wajib menggunakan format Google (@gmail.com) yang valid.');
      }
      const [dup] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1', [cleanEm, Number(userId)]);
      if (dup.length > 0) {
        throw new Error(`Email ${cleanEm} sudah terdaftar pada akun lain.`);
      }
      updates.push('email = ?');
      params.push(cleanEm);
      await pool.query('UPDATE sessions SET email = ? WHERE user_id = ?', [cleanEm, Number(userId)]);
    }

    if (data.storeName !== undefined) {
      updates.push('store_name = ?');
      params.push(String(data.storeName).slice(0, 100));
    }
    if (data.plan !== undefined) {
      updates.push('plan = ?');
      params.push(String(data.plan).slice(0, 100));
    }
    if (data.quota_total !== undefined && !isNaN(data.quota_total)) {
      updates.push('quota_total = ?');
      params.push(Number(data.quota_total));
    }
    if (data.quota_used !== undefined && !isNaN(data.quota_used)) {
      updates.push('quota_used = ?');
      params.push(Number(data.quota_used));
    }
    if (data.daysToAdd !== undefined && !isNaN(data.daysToAdd) && Number(data.daysToAdd) > 0) {
      updates.push('active_until = DATE_ADD(COALESCE(active_until, NOW()), INTERVAL ? DAY)');
      params.push(Number(data.daysToAdd));
    }
    if (data.newPassword && String(data.newPassword).trim().length > 0) {
      const cleanPw = String(data.newPassword).trim();
      if (cleanPw.length > 20) throw new Error('Password maksimal 20 karakter.');
      updates.push('password = ?');
      params.push(hashPassword(cleanPw));
    }

    if (updates.length === 0) return true;
    params.push(Number(userId));
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return true;
  } catch (err) {
    console.error('dbAdminFullUpdateUser Error:', err.message);
    throw err;
  }
}

export async function dbAdminCreateUser({ email, password = null, storeName = 'Toko AI Assistant', plan = 'Paket Gratis (300 Token)', quotaTotal = 300, daysActive = 30 }) {
  try {
    const cleanEmail = String(email || '').trim().toLowerCase().slice(0, 100);
    if (!cleanEmail.endsWith('@gmail.com') || cleanEmail.length < 11) {
      throw new Error('Wajib menggunakan alamat email Google (@gmail.com) yang valid.');
    }

    const [dup] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [cleanEmail]);
    if (dup.length > 0) {
      throw new Error(`Email ${cleanEmail} sudah terdaftar. Silakan gunakan fitur Edit pada tabel.`);
    }

    let rawPassword = String(password || '').trim();
    if (!rawPassword) {
      rawPassword = 'Arta' + Math.floor(1000 + Math.random() * 9000);
    }
    if (rawPassword.length > 20) {
      throw new Error('Password maksimal 20 karakter.');
    }

    const hashedPassword = hashPassword(rawPassword);
    const cleanStore = String(storeName || 'Toko AI Assistant').trim().slice(0, 100);
    const cleanPlan = String(plan || 'Paket Gratis (300 Token)').trim().slice(0, 100);
    const cleanQuota = Math.max(0, Number(quotaTotal) || 300);
    const activeUntil = new Date(Date.now() + (Number(daysActive) || 30) * 24 * 60 * 60 * 1000);

    const [res] = await pool.query(
      `INSERT INTO users (email, password, store_name, plan, quota_total, quota_used, role, active_until)
       VALUES (?, ?, ?, ?, ?, 0, 'user', ?)`,
      [cleanEmail, hashedPassword, cleanStore, cleanPlan, cleanQuota, activeUntil]
    );

    const newUserId = res.insertId;
    await seedUserDefaultKnowledgeAndConfig(newUserId, cleanStore);

    return {
      id: newUserId,
      email: cleanEmail,
      rawPassword,
      storeName: cleanStore,
      plan: cleanPlan,
      quota_total: cleanQuota,
      active_until: activeUntil
    };
  } catch (err) {
    console.error('dbAdminCreateUser Error:', err.message);
    throw err;
  }
}

export async function dbAdminDeleteUser(userId) {
  try {
    const uid = Number(userId);
    const [rows] = await pool.query('SELECT id, email, role FROM users WHERE id = ? LIMIT 1', [uid]);
    if (rows.length === 0) {
      throw new Error('Akun pengguna tidak ditemukan.');
    }
    if (rows[0].role === 'superadmin') {
      throw new Error('Akun Super Admin Utama tidak dapat dihapus!');
    }

    const deletedEmail = rows[0].email;
    await pool.query('DELETE FROM sessions WHERE user_id = ?', [uid]);
    await pool.query('DELETE FROM knowledge WHERE user_id = ?', [uid]);
    await pool.query('DELETE FROM config WHERE user_id = ?', [uid]);
    await pool.query('DELETE FROM users WHERE id = ?', [uid]);

    return { id: uid, email: deletedEmail };
  } catch (err) {
    console.error('dbAdminDeleteUser Error:', err.message);
    throw err;
  }
}

export async function dbAddNotificationLog({ category = 'EMAIL', recipient = '-', title = '', message = '', status = 'success' }) {
  try {
    await pool.query(
      `INSERT INTO notifications_log (category, recipient, title, message, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        String(category || 'INFO').slice(0, 60),
        String(recipient || '-').slice(0, 250),
        String(title || 'Notifikasi Sistem').slice(0, 250),
        String(message || ''),
        String(status || 'success').slice(0, 40)
      ]
    );
    return true;
  } catch (err) {
    console.error('dbAddNotificationLog Error:', err.message);
    return false;
  }
}

export async function dbGetAllNotifications(limit = 250) {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, recipient, title, message, status, created_at
       FROM notifications_log
       ORDER BY id DESC
       LIMIT ?`,
      [Number(limit) || 250]
    );
    return rows;
  } catch (err) {
    console.error('dbGetAllNotifications Error:', err.message);
    return [];
  }
}

export async function dbDeleteNotificationLog(id) {
  try {
    await pool.query('DELETE FROM notifications_log WHERE id = ?', [Number(id)]);
    return true;
  } catch (err) {
    console.error('dbDeleteNotificationLog Error:', err.message);
    throw err;
  }
}

export async function dbClearAllNotifications() {
  try {
    await pool.query('DELETE FROM notifications_log');
    return true;
  } catch (err) {
    console.error('dbClearAllNotifications Error:', err.message);
    throw err;
  }
}

export async function dbRecordVisit({ ip = '127.0.0.1', pageView = 'landing', visitorEmail = 'Pengunjung', userAgent = '' }) {
  try {
    await pool.query(
      `INSERT INTO visits_log (ip_address, page_view, visitor_email, user_agent) VALUES (?, ?, ?, ?)`,
      [
        String(ip || '127.0.0.1').slice(0, 90),
        String(pageView || 'landing').slice(0, 90),
        String(visitorEmail || 'Pengunjung').slice(0, 200),
        String(userAgent || '').slice(0, 250)
      ]
    );
    return true;
  } catch (err) {
    console.error('dbRecordVisit Error:', err.message);
    return false;
  }
}

export async function dbGetVisitStats() {
  try {
    const [totalRows] = await pool.query('SELECT COUNT(*) AS total FROM visits_log');
    const [todayRows] = await pool.query('SELECT COUNT(*) AS today FROM visits_log WHERE DATE(created_at) = CURDATE()');

    // Ambil seluruh data kunjungan untuk agregasi Mingguan (Senin-Minggu), Bulanan (Minggu 1-5), dan Tahunan (Jan-Des per Tahun)
    const [allRows] = await pool.query(
      `SELECT id, ip_address, page_view, visitor_email, created_at
       FROM visits_log
       ORDER BY id DESC
       LIMIT 5000`
    );

    const totalVisits = Number(totalRows[0]?.total || 0);
    const todayVisits = Number(todayRows[0]?.today || 0);

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-11

    // 1. MINGGUAN: Senin (0) s/d Minggu (6) pada minggu berjalan
    const dayOfWeek = now.getDay(); // 0=Minggu, 1=Senin, ...
    const diffToMonday = dayOfWeek === 0 ? -6 : (1 - dayOfWeek);
    const mondayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 0, 0, 0, 0);
    const sundayEnd = new Date(mondayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const weeklyLabels = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const weeklyCounts = [0, 0, 0, 0, 0, 0, 0];

    // 2. BULANAN: Minggu 1 s/d Minggu 5 pada bulan berjalan
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const monthlyLabels = ['Minggu 1 (Tgl 1-7)', 'Minggu 2 (Tgl 8-14)', 'Minggu 3 (Tgl 15-21)', 'Minggu 4 (Tgl 22-28)', 'Minggu 5 (Tgl 29+)'];
    const monthlyCounts = [0, 0, 0, 0, 0];

    // 3. TAHUNAN: Jan s/d Des untuk setiap tahun (otomatis bertambah seiring bergantinya tahun)
    const yearlyByYear = {};
    const yearSet = new Set([curYear, curYear + 1]);

    for (const r of allRows) {
      if (!r.created_at) continue;
      const d = new Date(r.created_at);
      if (isNaN(d.getTime())) continue;

      const y = d.getFullYear();
      const m = d.getMonth(); // 0-11
      const dateNum = d.getDate(); // 1-31

      yearSet.add(y);
      if (!yearlyByYear[y]) {
        yearlyByYear[y] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      yearlyByYear[y][m]++;

      // Cek apakah masuk di bulan berjalan
      if (y === curYear && m === curMonth) {
        const weekIdx = Math.min(4, Math.floor((dateNum - 1) / 7));
        monthlyCounts[weekIdx]++;
      }

      // Cek apakah masuk di minggu berjalan (Senin - Minggu)
      if (d >= mondayStart && d < sundayEnd) {
        const dow = d.getDay(); // 0=Minggu .. 6=Sabtu
        const monIdx = dow === 0 ? 6 : (dow - 1);
        weeklyCounts[monIdx]++;
      }
    }

    const availableYears = Array.from(yearSet).sort((a, b) => a - b).map(String);
    for (const yStr of availableYears) {
      if (!yearlyByYear[yStr]) {
        yearlyByYear[yStr] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
    }

    return {
      totalVisits,
      todayVisits,
      currentYear: String(curYear),
      currentMonthName: `${monthNames[curMonth]} ${curYear}`,
      availableYears,
      weekly: {
        labels: weeklyLabels,
        counts: weeklyCounts
      },
      monthly: {
        labels: monthlyLabels,
        counts: monthlyCounts
      },
      yearlyByYear,
      recentVisits: allRows.slice(0, 12)
    };
  } catch (err) {
    console.error('dbGetVisitStats Error:', err.message);
    return {
      totalVisits: 0,
      todayVisits: 0,
      currentYear: String(new Date().getFullYear()),
      currentMonthName: 'Bulan Ini',
      availableYears: [String(new Date().getFullYear())],
      weekly: { labels: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'], counts: [0, 0, 0, 0, 0, 0, 0] },
      monthly: { labels: ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5'], counts: [0, 0, 0, 0, 0] },
      yearlyByYear: {},
      recentVisits: []
    };
  }
}

function safeParseArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const parsed = typeof val === 'string' ? JSON.parse(val) : val;
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch (e) {
    return [String(val)];
  }
}

export async function dbGetAllKnowledgeForAdmin() {
  try {
    const [rows] = await pool.query(
      `SELECT k.id, k.user_id, k.questions, k.keywords, k.answer, k.category, k.created_at,
              u.email, u.store_name, u.plan
       FROM knowledge k
       LEFT JOIN users u ON k.user_id = u.id
       ORDER BY k.id DESC`
    );
    return rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      email: r.email || ('Pengguna #' + r.user_id),
      store_name: r.store_name || 'Toko',
      plan: r.plan || 'Paket Bisnis',
      questions: safeParseArray(r.questions),
      keywords: safeParseArray(r.keywords),
      answer: r.answer || '',
      category: r.category || 'umum',
      created_at: r.created_at
    }));
  } catch (err) {
    console.error('dbGetAllKnowledgeForAdmin Error:', err.message);
    return [];
  }
}

export async function dbAdminDeleteKnowledge(id) {
  try {
    await pool.query('DELETE FROM knowledge WHERE id = ?', [Number(id)]);
    return true;
  } catch (err) {
    console.error('dbAdminDeleteKnowledge Error:', err.message);
    throw err;
  }
}

export { pool };
