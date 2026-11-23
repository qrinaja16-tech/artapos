// Locked legacy endpoint — semua akses API pengetahuan wajib melalui server utama multi-tenant terautentikasi (src/index.js)
export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  return res.status(403).json({
    error: '🛡️ Akses Ditolak: Endpoint tanpa autentikasi dinonaktifkan demi keamanan berlapis artapos.id.'
  });
}
