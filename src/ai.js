import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { memoryManager } from './memory.js';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const botName = process.env.BOT_NAME || 'Nova AI';

let genAI = null;
if (apiKey && apiKey.trim().length > 0) {
  genAI = new GoogleGenerativeAI(apiKey.trim());
}

/**
 * Memperbarui instance GoogleGenerativeAI jika API key diatur ulang
 */
export function reloadApiKey(newKey) {
  if (newKey && newKey.trim().length > 0) {
    process.env.GEMINI_API_KEY = newKey.trim();
    genAI = new GoogleGenerativeAI(newKey.trim());
    return true;
  }
  return false;
}

/**
 * Membuat prompt sistem dinamis yang menyertakan seluruh ingatan bot
 */
function buildSystemInstruction() {
  const currentMemories = memoryManager.formatMemoriesForPrompt();

  return `Kamu adalah asisten AI WhatsApp bernama "${botName}".
Kamu pintar, ramah, solutif, dan luwes dalam berkomunikasi. Sesuaikan gaya bicaramu dengan lawan bicara (santai jika lawan bicara santai, sopan dan jelas).

=== PENGETAHUAN & MEMORI YANG SUDAH KAMU PELAJARI ===
Berikut adalah informasi dan fakta yang sudah kamu pelajari sebelumnya. Gunakan data ini untuk menjawab pertanyaan pengguna:
${currentMemories}
=====================================================

=== FITUR BELAJAR MANDIRI (SANGAT PENTING!) ===
Kamu memiliki kemampuan luar biasa untuk belajar sendiri dari percakapan!
1. Jika pengguna memberitahu info baru yang penting (misalnya: nama mereka, hobi, preferensi, jadwal, fakta seputar toko/usaha, alamat, atau kalimat seperti "ingat ya...", "catat ya..."):
   - Tanggapi pesan mereka dengan ramah dan alami.
   - Di bagian PALING AKHIR jawabanmu, sertakan tag format:
     [INGAT: fakta singkat dan padat yang kamu pelajari]
   Contoh:
     Pengguna: "Nama saya Dimas, saya tinggal di Bandung."
     Jawabanmu: "Halo Dimas! Salam kenal ya. Sudah saya ingat kalau kamu tinggal di Bandung. Ada yang bisa saya bantu hari ini? [INGAT: Pengguna bernama Dimas dan tinggal di Bandung]"
2. JANGAN membuat tag [INGAT: ...] untuk obrolan basa-basi (seperti "halo", "terima kasih", "ok", "lagi apa", atau lelucon).
3. Hanya pelajari informasi yang memang berupa fakta penting atau hal yang diminta pengguna untuk diingat.
4. Sistem backend akan otomatis menangkap tag [INGAT: ...] tersebut dan menghapusnya sebelum pesan dikirim ke WhatsApp, sehingga pengguna tidak akan melihat tag teknis tersebut.`;
}

/**
 * Mengirim pesan ke AI dan memproses jawaban serta fakta baru yang dipelajari
 */
export async function generateAIResponse(jid, senderName, userText) {
  // Cek apakah API key sudah dimasukkan
  if (!genAI || !process.env.GEMINI_API_KEY) {
    return {
      text: `⚠️ *Google Gemini API Key belum terpasang.*\n\nSilakan buka file *.env* di folder bot, lalu masukkan *GEMINI_API_KEY* Anda agar saya bisa berpikir dan menjawab pesan.\n\n_Dapatkan gratis di: https://aistudio.google.com/app/apikey_`,
      learnedFact: null
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: buildSystemInstruction()
    });

    // Ambil riwayat chat sebelumnya
    const rawHistory = memoryManager.getHistory(jid);
    const history = rawHistory.map(item => ({
      role: item.role,
      parts: item.parts
    }));

    const chat = model.startChat({
      history
    });

    const promptWithSender = `[Pengirim: ${senderName || 'Teman'}]: ${userText}`;
    const result = await chat.sendMessage(promptWithSender);
    let replyText = result.response.text();

    // Deteksi apakah AI mempelajari fakta baru lewat tag [INGAT: ...]
    let learnedFact = null;
    const learnRegex = /\[INGAT:\s*([^\]]+)\]/i;
    const match = replyText.match(learnRegex);

    if (match) {
      learnedFact = match[1].trim();
      // Simpan ke memori jangka panjang
      memoryManager.addMemory(learnedFact, 'belajar-otomatis', `chat:${senderName}`);
      // Hapus tag teknis dari balasan pengguna
      replyText = replyText.replace(learnRegex, '').trim();
    }

    // Simpan interaksi ke riwayat percakapan
    memoryManager.appendHistory(jid, 'user', promptWithSender);
    memoryManager.appendHistory(jid, 'model', replyText);

    return {
      text: replyText,
      learnedFact
    };
  } catch (error) {
    console.error('Error saat memanggil Gemini API:', error);

    // Tangani error kuota / format
    if (error.message && error.message.includes('API_KEY_INVALID')) {
      return {
        text: `⚠️ *API Key Gemini tidak valid.* Periksa kembali kunci API Anda di file *.env*.`,
        learnedFact: null
      };
    }

    return {
      text: `Maaf, saya sedang mengalami sedikit kendala koneksi ke otak AI. Coba tanyakan lagi beberapa saat lagi ya! (Detail: ${error.message?.slice(0, 80)})`,
      learnedFact: null
    };
  }
}
