import crypto from 'crypto';

/**
 * ==============================================================
 * ARTAPOS.ID • SECURITY & CRYPTOGRAPHY ENGINE
 * Layered Defense: Password Hashing, Anti-Brute Force, Signatures
 * ==============================================================
 */

/**
 * Hash password menggunakan crypto.scrypt (Salted Key Derivation)
 * Format output: salt:derivedKey (Hex)
 */
export function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password wajib berupa teks.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verifikasi password dengan timingSafeEqual (Anti Timing Attack)
 */
export function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  // Fallback transisi jika ada akun lama tanpa salt
  if (!storedHash.includes(':')) {
    return password === storedHash;
  }

  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;

  try {
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch (e) {
    return false;
  }
}

/**
 * Generate Secure Random Token (32 Bytes / 64 Hex chars)
 */
export function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate Strong Random Initial Password untuk akun baru yang lunas
 * Contoh output: Arta7#mK9!
 */
export function generateRandomPassword(length = 10) {
  const lettersUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lettersLower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';

  let pwd = 'Arta';
  pwd += lettersUpper[crypto.randomInt(0, lettersUpper.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];

  const allChars = lettersUpper + lettersLower + digits + symbols;
  while (pwd.length < length) {
    pwd += allChars[crypto.randomInt(0, allChars.length)];
  }

  return pwd;
}

/**
 * Validasi Midtrans Webhook Signature Key (SHA-512)
 * signature = sha512(order_id + status_code + gross_amount + ServerKey)
 */
export function verifyMidtransSignature({ order_id, status_code, gross_amount, signature_key, server_key }) {
  if (!order_id || !status_code || !gross_amount || !signature_key || !server_key) {
    return false;
  }

  // Normalisasi gross_amount (contoh "100000.00" atau 100000)
  let cleanAmount = gross_amount;
  if (typeof cleanAmount === 'number') {
    cleanAmount = cleanAmount.toFixed(2);
  }

  const rawString = `${order_id}${status_code}${cleanAmount}${server_key}`;
  const calculatedSignature = crypto.createHash('sha512').update(rawString).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature_key.toLowerCase(), 'utf-8'),
      Buffer.from(calculatedSignature.toLowerCase(), 'utf-8')
    );
  } catch (e) {
    return false;
  }
}

/**
 * Rate Limiter sederhana di memori untuk mencegah brute-force login dan bot spam
 */
class InMemoryRateLimiter {
  constructor() {
    this.requests = new Map();
  }

  /**
   * Cek apakah IP/Key melebihi limit dalam rentang waktu (ms)
   */
  isAllowed(key, maxRequests = 10, windowMs = 60000) {
    const now = Date.now();
    const timestamps = this.requests.get(key) || [];

    // Filter timestamp di luar jendela waktu
    const validTimestamps = timestamps.filter(ts => now - ts < windowMs);

    if (validTimestamps.length >= maxRequests) {
      this.requests.set(key, validTimestamps);
      return false; // Rate limit exceeded!
    }

    validTimestamps.push(now);
    this.requests.set(key, validTimestamps);
    return true;
  }

  clean() {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(ts => now - ts < 120000);
      if (valid.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, valid);
      }
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();

// Bersihkan memori setiap 2 menit (unref agar tidak menahan event loop serverless)
const rateCleanTimer = setInterval(() => rateLimiter.clean(), 120000);
if (typeof rateCleanTimer.unref === 'function') rateCleanTimer.unref();

/**
 * ==============================================================
 * ANTI-HACKER WAF (WEB APPLICATION FIREWALL) & PHP/SCRIPT BLOCKER
 * Memblokir akses .php, injeksi SQL, XSS, Path Traversal, & limit karakter
 * ==============================================================
 */
const BLOCKED_URL_PATTERNS = [
  /\.php(\b|\?|\/|$)/i,
  /<\?php/i,
  /\.env(\b|\?|\/|$)/i,
  /\.git(\b|\?|\/|$)/i,
  /\.sql(\b|\?|\/|$)/i,
  /\.sh(\b|\?|\/|$)/i,
  /\.exe(\b|\?|\/|$)/i,
  /\.bat(\b|\?|\/|$)/i,
  /\.cmd(\b|\?|\/|$)/i,
  /wp-admin/i,
  /wp-login/i,
  /phpmyadmin/i,
  /adminer/i,
  /cgi-bin/i,
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i,
  /%00/,
  /<script/i,
  /%3cscript/i,
  /union[\s+%20]+select/i,
  /drop[\s+%20]+table/i
];

const MALICIOUS_PAYLOAD_PATTERNS = [
  /<\?php/i,
  /<\?=/,
  /\.php\b/i,
  /<script\b/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
  /\bonclick\s*=/i,
  /\bonmouseover\s*=/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /\bunion\s+all\s+select\b/i,
  /\bunion\s+select\b/i,
  /\bdrop\s+table\b/i,
  /\bdelete\s+from\s+users\b/i,
  /\binsert\s+into\s+users\b/i,
  /'\s*or\s*'1'\s*=\s*'1/i,
  /"\s*or\s*"1"\s*=\s*"1/i,
  /\bor\s+1\s*=\s*1\b/i,
  /\bsleep\s*\(\s*\d+\s*\)/i,
  /\bbenchmark\s*\(/i,
  /\.\.\/\.\.\//,
  /\/etc\/passwd/i,
  /cmd\.exe/i,
  /powershell\.exe/i
];

/**
 * Cek apakah URL request mengandung ekstensi terlarang (.php, .env, dll) atau eksploitasi
 */
export function isBlockedRequestUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (rawUrl.length > 500) return true; // Blokir URL abnormal panjang
  let decoded = rawUrl;
  try {
    decoded = decodeURIComponent(rawUrl);
  } catch (e) {
    return true; // Malformed URL encoding attack
  }
  return BLOCKED_URL_PATTERNS.some(pattern => pattern.test(rawUrl) || pattern.test(decoded));
}

/**
 * Cek apakah input pengguna mengandung payload berbahaya (PHP, XSS, SQLi, Shell)
 */
export function containsMaliciousPayload(input) {
  if (input === null || input === undefined) return false;
  if (typeof input === 'string') {
    return MALICIOUS_PAYLOAD_PATTERNS.some(pattern => pattern.test(input));
  }
  if (Array.isArray(input)) {
    return input.some(item => containsMaliciousPayload(item));
  }
  if (typeof input === 'object') {
    return Object.values(input).some(val => containsMaliciousPayload(val));
  }
  return false;
}

/**
 * ==============================================================
 * NEXT.JS & PRISMA-STYLE LAYERED SECURITY HEADERS & VALIDATOR
 * ==============================================================
 */
export function applyLayeredSecurityHeaders(res) {
  res.setHeader('X-DNS-Prefetch-Control', 'on');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('X-Powered-By', 'artapos.id Next-Gen Security Shield');
}

/**
 * Buat Sidik Jari Perangkat (Device Fingerprint Hash) Gabungan Client Device ID + Server IP/UA
 */
export function resolveServerDeviceFingerprint(req, clientDeviceId = '') {
  const cleanClient = String(clientDeviceId || req.headers['x-device-id'] || '').trim().slice(0, 100);
  if (cleanClient && cleanClient.length >= 8) {
    return cleanClient;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1');
  const ua = String(req.headers['user-agent'] || 'unknown');
  return 'dev_' + crypto.createHash('sha256').update(`${ip}::${ua}`).digest('hex').slice(0, 28);
}


