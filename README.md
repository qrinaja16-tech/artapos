# 🛒 Web Chatbot Penjualan Toko Online (Siap Vercel & GitHub)

Aplikasi **Web Live-Chat AI Penjualan** yang bisa langsung di-hosting secara gratis di **GitHub & Vercel**. Bekerja 24 jam nonstop tanpa perlu laptop hidup, menggunakan domain Vercel Anda sendiri!

---

## ✨ Fitur Unggulan

1. **💬 Tampilan Chatbot Mirip WhatsApp (Untuk Pelanggan)**
   - Pembeli bisa bertanya seputar jam operasional, alamat toko, harga produk, cara order, ongkir, COD, dan metode pembayaran.
   - Bot otomatis menjawab dalam hitungan detik berdasarkan pengetahuan yang Anda berikan.

2. **📲 Tombol "Lanjut Order via WhatsApp"**
   - Di bagian atas chat tersedia tombol hijau khas WhatsApp.
   - Begitu pembeli selesai tanya-tanya, mereka cukup klik tombol tersebut untuk langsung diarahkan ke nomor WhatsApp toko Anda dengan pesan yang sudah terisi rapi!

3. **🎓 Halaman Admin "Kelola & Ajari Bot"**
   - **Ajari Bot Jawaban Baru**: Cukup masukkan pertanyaan, kata kunci, dan jawaban yang diinginkan. Bot akan langsung mengingatnya.
   - **Kotak Pertanyaan Belum Terjawab (Inbox)**: Jika ada pengunjung web menanyakan pertanyaan yang belum ada jawabannya, bot otomatis mencatatnya di tab admin agar Anda bisa langsung mengajarinya dengan 1 klik!
   - **Pengaturan Toko**: Ubah nama toko dan nomor WhatsApp admin langsung dari tampilan web.
   - **Backup & Restore JSON**: Seluruh data tanya-jawab bisa Anda download atau upload kembali kapan saja.

4. **🌐 100% Cocok untuk GitHub & Vercel**
   - Tidak butuh database rumit atau berbayar.
   - Menggunakan static files & local storage engine yang sangat ringan dan cepat.

---

## 🚀 Cara Menjalankan & Mencoba di Laptop

1. Buka terminal di folder ini (`d:\laragon\www\ai`):
   ```powershell
   node server.js
   ```
2. Buka browser Anda (Google Chrome / Edge) dan buka alamat:
   👉 **http://localhost:3000**
3. Anda bisa langsung mencoba chat sebagai pembeli, dan berpindah ke tab **"Kelola & Ajari Bot"** untuk mengajari jawaban baru!

---

## ☁️ Panduan Upload ke GitHub & Sambungkan ke Vercel

### Langkah 1: Upload ke GitHub
1. Buat repository baru di [GitHub](https://github.com/new) (misal: `chatbot-toko`).
2. Di terminal folder ini (`d:\laragon\www\ai`), jalankan perintah git berikut:
   ```bash
   git init
   git add .
   git commit -m "Inisialisasi Web Chatbot Toko"
   git branch -M main
   git remote add origin https://github.com/USERNAME-ANDA/chatbot-toko.git
   git push -u origin main
   ```

### Langkah 2: Sambungkan ke Vercel
1. Buka dashboard [Vercel](https://vercel.com).
2. Klik tombol **"Add New..."** > pilih **"Project"**.
3. Pilih repository GitHub Anda (`chatbot-toko`) lalu klik **"Import"**.
4. Di bagian *Framework Preset*, biarkan default (*Other*).
5. Klik **"Deploy"**! Dalam 30 detik web chatbot toko Anda sudah langsung tayang secara online 24 jam.

### Langkah 3: Pasang Custom Domain Anda di Vercel
1. Di proyek Vercel Anda, buka menu **Settings** > **Domains**.
2. Masukkan domain Anda (misal: `tokoanda.com` atau subdomain `chat.tokoanda.com`).
3. Selesai! Web Chatbot toko Anda sekarang aktif 24 jam di domain sendiri.
