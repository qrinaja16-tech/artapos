// Locked legacy endpoint — simulator & bot chat menggunakan engine multi-tenant terautentikasi (src/index.js)
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  return res.status(403).json({
    error: '🛡️ Akses Ditolak: Gunakan endpoint terautentikasi artapos.id.'
  });
}
