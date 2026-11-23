import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { dbAddNotificationLog } from './db.js';

dotenv.config();

/**
 * Mailer Service untuk artapos.id
 * Menggunakan Gmail SMTP resmi dengan 16-Digit Google App Password
 */
let transporter = null;

function getTransporter() {
  const user = process.env.GMAIL_USER || '';
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''); // Hapus spasi jika ada

  if (user && pass) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: pass
      }
    });
  }
  return null;
}

/**
 * Kirim email pendaftaran akun gratis artapos.id
 */
export async function sendFreeRegistrationEmail(toEmail, rawPassword, storeName = 'Toko AI Assistant') {
  const mailTransporter = getTransporter();
  const gmailUser = process.env.GMAIL_USER || 'no-reply@artapos.id';

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
        .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(0,0,0,0.06); }
        .header { background: #0b1220; padding: 28px 24px; text-align: center; }
        .logo { font-size: 24px; font-weight: 800; color: #ffffff; }
        .logo span { color: #16a34a; }
        .badge { display: inline-block; background: #16a34a; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 12px; border-radius: 99px; margin-top: 10px; }
        .body { padding: 32px 28px; line-height: 1.6; }
        .h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; }
        .info-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 18px 20px; margin: 20px 0; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
        .info-label { color: #64748b; }
        .info-val { font-weight: 700; color: #0f172a; }
        .pw-box { background: #ffffff; border: 2px dashed #16a34a; padding: 12px; text-align: center; border-radius: 8px; font-size: 20px; font-weight: 800; letter-spacing: 2px; color: #16a34a; margin: 16px 0; }
        .btn { display: block; text-align: center; background: #16a34a; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 24px; border-radius: 8px; margin: 24px 0 16px; }
        .spam-note { background: #fefce8; border: 1px solid #fef08a; padding: 12px 16px; border-radius: 8px; font-size: 12px; color: #854d0e; line-height: 1.5; }
        .footer { background: #f8fafc; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="logo">arta<span>pos</span>.id</div>
          <div class="badge">Paket Uji Coba Gratis (300 Token)</div>
        </div>
        <div class="body">
          <h2 class="h2">Selamat Datang di artapos.id! 🎉</h2>
          <p>Halo pemilik <strong>${storeName}</strong>,</p>
          <p>Akun gratis Anda telah berhasil diaktifkan. Anda mendapatkan <strong>300 Token Balasan Chat AI WhatsApp</strong> beserta 7 template soal & jawaban otomatis siap pakai.</p>
          
          <div class="info-box">
            <div style="font-size: 13px; font-weight: 700; color: #166534; margin-bottom: 8px; text-transform: uppercase;">Kredensial Masuk Dashboard:</div>
            <div style="font-size: 14px; margin-bottom: 4px;"><strong>Email:</strong> ${toEmail}</div>
            <div style="font-size: 14px;"><strong>Password Anda:</strong></div>
            <div class="pw-box">${rawPassword}</div>
          </div>

          <a href="http://localhost:3000/#login" class="btn">Masuk ke Dashboard artapos.id</a>

          <div class="spam-note">
            💡 <strong>Penting:</strong> Jika email ini masuk ke folder <strong>Spam</strong> atau <strong>Promosi</strong>, mohon klik <em>"Bukan Spam" (Report Not Spam)</em> agar notifikasi penting berikutnya masuk langsung ke Kotak Masuk Anda.
          </div>
        </div>
        <div class="footer">
          © 2026 artapos.id — Asisten AI WhatsApp Otomatis Indonesia.
        </div>
      </div>
    </body>
    </html>
  `;

  if (!mailTransporter) {
    console.log(`\n📨 [SIMULASI EMAIL] GMAIL_APP_PASSWORD belum diatur di .env`);
    console.log(`-----------------------------------------------------`);
    console.log(`Kepada: ${toEmail}`);
    console.log(`Subjek: [artapos.id] Akun Gratis 100 Token Berhasil Diaktifkan!`);
    console.log(`Password: ${rawPassword}`);
    console.log(`-----------------------------------------------------\n`);
    return {
      success: true,
      simulated: true,
      message: 'Email disimulasikan (GMAIL_APP_PASSWORD belum diisi di .env).'
    };
  }

  try {
    const info = await mailTransporter.sendMail({
      from: `"artapos.id AI" <${gmailUser}>`,
      to: toEmail,
      subject: `[artapos.id] Akun Gratis 300 Token Anda Berhasil Diaktifkan! 🎉`,
      html: htmlContent
    });

    console.log(`✅ [EMAIL SENT] Berhasil mengirim email pendaftaran ke ${toEmail}. Message ID: ${info.messageId}`);
    await dbAddNotificationLog({
      category: 'EMAIL',
      recipient: toEmail,
      title: `Email Aktivasi & Password Terkirim (${storeName})`,
      message: `Password login (${rawPassword}) berhasil dikirim dari ${gmailUser} ke ${toEmail}. Message ID: ${info.messageId}`,
      status: 'success'
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ [EMAIL ERROR] Gagal mengirim email via Gmail SMTP:`, err.message);
    await dbAddNotificationLog({
      category: 'EMAIL',
      recipient: toEmail,
      title: `Gagal Kirim Email Aktivasi (${storeName})`,
      message: `Gagal mengirim email ke ${toEmail}: ${err.message}`,
      status: 'error'
    });
    return { success: false, error: err.message };
  }
}
