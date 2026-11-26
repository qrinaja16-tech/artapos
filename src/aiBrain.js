import { knowledgeManager } from './knowledge.js';
import {
  dbGetConfig,
  dbGetProducts,
  dbCreateStoreOrder,
  dbGetEffectiveUserLimits,
  dbGetCustomerMemory,
  dbUpsertCustomerMemory,
  dbAddNotificationLog,
  dbGetUserById
} from './db.js';

// Memori percakapan sementara per akun & nomor pelanggan (hanya aktif mulai Paket Plus 35K+)
const conversationBuffer = new Map();

function appendContext(userId, jid, role, text, limit = 6) {
  if (!limit || limit <= 0) return [];
  const key = `${userId}:${jid}`;
  const list = conversationBuffer.get(key) || [];
  list.push({ role, text: String(text || '').slice(0, 800), ts: Date.now() });
  while (list.length > limit * 2) list.shift();
  conversationBuffer.set(key, list);
  return list;
}

function getContext(userId, jid, limit = 6) {
  if (!limit || limit <= 0) return [];
  const key = `${userId}:${jid}`;
  const list = conversationBuffer.get(key) || [];
  return list.slice(-(limit * 2));
}

function formatRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function scoreProductMatch(products, queryText) {
  const q = String(queryText || '').toLowerCase();
  const tokens = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 2);
  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const hay = `${p.name || ''} ${p.sku || ''} ${p.category || ''} ${p.description || ''}`.toLowerCase();
    let score = 0;
    if (p.sku && q.includes(String(p.sku).toLowerCase())) score += 10;
    if (p.name && q.includes(String(p.name).toLowerCase())) score += 8;
    for (const t of tokens) {
      if (hay.includes(t)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return bestScore >= 2 ? best : null;
}

async function tryGeminiReply({ storeName, aiTier, userText, history, products, customerMem, extraSystemHint }) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prodSummary = products.slice(0, 30).map(p =>
    `- ${p.name} | Harga: ${formatRp(p.price)} | Stok: ${p.stock}`
  ).join('\n');

  const systemText = [
    `Kamu adalah CS Sales WhatsApp manusiawi untuk toko "${storeName}".`,
    `Level kecerdasan paket toko: ${aiTier}.`,
    `ATURAN KETAT: Jangan pernah mengarang harga, stok, atau ongkir di luar data berikut. Ongkir dihitung manual oleh admin toko.`,
    `=== STOK INVENTORY LIVE ===\n${prodSummary || '(Belum ada produk di inventory)'}`,
    customerMem ? `=== MEMORI PELANGGAN ===\nNama: ${customerMem.customer_name || '-'}, Produk terakhir: ${customerMem.last_product || '-'}` : '',
    extraSystemHint || '',
    `Balas dengan bahasa Indonesia yang hangat, natural seperti admin manusia, singkat jelas, dan arahkan ke transaksi.`
  ].filter(Boolean).join('\n\n');

  const contents = [
    ...history.map(h => ({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] })),
    { role: 'user', parts: [{ text: userText }] }
  ];

  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: { temperature: 0.45, maxOutputTokens: 420 }
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return txt ? txt.trim() : null;
  } catch (e) {
    return null;
  }
}

export async function generateTieredBotReply({ userId, jid = 'sim_user', senderName = 'Kakak', text = '', userPlan = 'free', userRole = 'user' }) {
  const uid = Number(userId);
  const cleanText = String(text || '').trim();
  if (!cleanText) return { found: false, answer: '', aiTier: 'basic' };

  const userObj = await dbGetUserById(uid);
  const limits = await dbGetEffectiveUserLimits(
    userObj?.plan || userPlan,
    userObj?.role || userRole,
    userObj?.extra_knowledge || 0,
    userObj?.extra_images || 0,
    userObj?.extra_inventory || 0
  );
  const { aiTier, contextLimit, features, hasWatermark, inventoryLimit } = limits;

  const finalizeReply = (rawAnswer, imageUrl = null, meta = {}) => {
    const ans = String(rawAnswer || '').trim();
    if (!ans) return { found: false, answer: '', aiTier };
    const finalText = (!hasWatermark || ans.toLowerCase().includes('sent via artapos.id'))
      ? ans
      : `${ans}\n\n> sent via artapos.id`;
    if (features.ai_brain && contextLimit > 0) {
      appendContext(uid, jid, 'user', cleanText, contextLimit);
      appendContext(uid, jid, 'model', ans, contextLimit);
    }
    return { found: true, answer: finalText, imageUrl, aiTier, ...meta };
  };

  // =========================================================================
  // 1. PAKET GRATIS (Basic): Hanya 10 Knowledge Base statis, 0 Inventory, 0 Otak AI
  // =========================================================================
  if (!features.inventory || inventoryLimit <= 0) {
    const kb = await knowledgeManager.findAnswer(cleanText, uid);
    if (!kb.found) return { found: false, answer: '', aiTier };
    return finalizeReply(kb.answer, kb.item?.image_url || null, { source: 'knowledge_basic' });
  }

  // Ambil daftar produk sesuai batas kuota Inventory paket
  const allProducts = await dbGetProducts(uid);
  const products = allProducts.slice(0, inventoryLimit);

  // =========================================================================
  // 2. PAKET HEMAT 25K (Basic + 10 Inventory, BELUM Otak AI Kontekstual)
  // =========================================================================
  if (!features.ai_brain) {
    const kb = await knowledgeManager.findAnswer(cleanText, uid);
    const matchedProd = scoreProductMatch(products, cleanText);
    if (matchedProd) {
      const stockNum = Number(matchedProd.stock || 0);
      const stockInfo = stockNum > 0 ? `Tersedia (${stockNum} pcs)` : `Stok Habis (0 pcs)`;
      const descInfo = matchedProd.description ? `\nKeterangan: ${matchedProd.description}` : '';
      return finalizeReply(
        `📦 *${matchedProd.name}*\n💰 Harga: *${formatRp(matchedProd.price)}*\n📊 Status Stok: *${stockInfo}*${descInfo}`,
        null,
        { source: 'inventory_basic' }
      );
    }
    if (kb.found) {
      return finalizeReply(kb.answer, kb.item?.image_url || null, { source: 'knowledge_hemat' });
    }
    return { found: false, answer: '', aiTier };
  }

  // =========================================================================
  // 3. PAKET PLUS 35K KE ATAS (OTAK AI MULAI AKTIF: Sales / Smart / Pro / Genius)
  // =========================================================================
  const cfg = await dbGetConfig(uid);
  const storeName = cfg?.store_name || userObj?.store_name || 'Toko Kami';
  const history = getContext(uid, jid, contextLimit);
  const customerMem = features.memory ? await dbGetCustomerMemory(uid, jid) : null;

  if (features.memory && senderName) {
    dbUpsertCustomerMemory(uid, jid, { customer_name: senderName }).catch(() => {});
  }

  // A. Deteksi Human Handover / Komplain (Pro 70K & Bisnis 100K)
  if (features.handover && /\b(komplain|rusak|cacat|refund|kembali|penipu|kecewa|marah|bicara.*admin|hubungi.*owner)\b/i.test(cleanText)) {
    dbAddNotificationLog({
      category: 'HANDOVER',
      recipient: `${senderName} (${String(jid).split('@')[0]})`,
      title: `🚨 Butuh Admin / Komplain (User #${uid})`,
      message: `Pelanggan mengirim: "${cleanText.slice(0, 120)}". Segera tangani manual.`,
      status: 'warning'
    }).catch(() => {});
    if (features.memory) {
      dbUpsertCustomerMemory(uid, jid, { label: 'Komplain' }).catch(() => {});
    }
    return finalizeReply(
      `Mohon maaf atas ketidaknyamanannya ya Kak ${senderName} 🙏 Keluhan kakak sudah langsung saya teruskan ke Owner/Admin ${storeName} agar segera dibantu penyelesaiannya.`
    );
  }

  // B. Cari produk di Inventory (dari pesan saat ini atau dari ingatan konteks percakapan)
  let matchedProduct = scoreProductMatch(products, cleanText);
  if (!matchedProduct && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      matchedProduct = scoreProductMatch(products, history[i].text);
      if (matchedProduct) break;
    }
  }
  if (matchedProduct && features.memory) {
    dbUpsertCustomerMemory(uid, jid, { last_product: matchedProduct.name }).catch(() => {});
  }

  // C. Auto-Order & Auto-Invoice WhatsApp (Plus 35K+ | Tanpa Hitung Ongkir Otomatis)
  const isOrderIntent = /\b(pesan|order|beli|checkout|bungkus|ambil|mau\s+\d+)\b/i.test(cleanText);
  if (features.invoice && isOrderIntent && matchedProduct) {
    const qtyMatch = cleanText.match(/\b(\d{1,3})\s*(pcs|buah|biji|unit|x)?\b/i);
    const qty = qtyMatch ? Math.max(1, Math.min(99, Number(qtyMatch[1]))) : 1;

    if (Number(matchedProduct.stock) < qty) {
      const alt = products.find(p => Number(p.stock) > 0 && p.id !== matchedProduct.id);
      const altMsg = alt ? `\nAlternatif yang ready sekarang: *${alt.name}* (${formatRp(alt.price)}, stok ${alt.stock} pcs).` : '';
      return finalizeReply(
        `Maaf Kak ${senderName}, untuk *${matchedProduct.name}* stoknya saat ini tersisa *${matchedProduct.stock} pcs* (tidak cukup untuk ${qty} pcs).${altMsg}`
      );
    }

    try {
      const order = await dbCreateStoreOrder(uid, {
        customer_name: customerMem?.customer_name || senderName || 'Pelanggan WhatsApp',
        customer_phone: String(jid || '').split('@')[0],
        customer_address: 'Menunggu konfirmasi alamat & ongkir admin',
        courier: 'Dikonfirmasi Admin',
        shipping_cost: 0,
        status: 'pending',
        items: [{ product_id: matchedProduct.id, qty }]
      });

      if (features.memory) {
        dbUpsertCustomerMemory(uid, jid, { label: 'Menunggu Bayar', last_product: matchedProduct.name }).catch(() => {});
      }

      const invoiceText = [
        `🧾 *INVOICE PESANAN — ${storeName}*`,
        `No. Invoice: *${order.invoice_no}*`,
        `Pemesan: ${order.customer_name}`,
        `--------------------------------`,
        `• ${matchedProduct.name} x${qty} = *${formatRp(order.subtotal)}*`,
        `--------------------------------`,
        `💰 *Total Produk: ${formatRp(order.total_amount)}*`,
        `_(Belum termasuk ongkir • Ongkir dikonfirmasi oleh Admin)_`,
        `Status: Menunggu Pembayaran (Stok sudah kami amankan untuk Kakak 😊)`,
        ``,
        `Silakan kirim alamat lengkap & konfirmasi pembayaran agar pesanan langsung kami proses!`
      ].join('\n');

      return finalizeReply(invoiceText, null, { createdOrder: order });
    } catch (ordErr) {
      return finalizeReply(`Maaf Kak ${senderName}, pesanan belum bisa dibuat: ${ordErr.message}`);
    }
  }

  // D. Cek Knowledge Base toko
  const kbMatch = await knowledgeManager.findAnswer(cleanText, uid);
  if (kbMatch.found && !matchedProduct) {
    return finalizeReply(kbMatch.answer, kbMatch.item?.image_url || null, { source: 'knowledge' });
  }

  // E. Jawaban Otak AI Berbasis Inventory Live
  if (matchedProduct) {
    const geminiAns = await tryGeminiReply({
      storeName,
      aiTier,
      userText: cleanText,
      history,
      products,
      customerMem,
      extraSystemHint: `Pelanggan menanyakan produk: ${matchedProduct.name} (Harga ${formatRp(matchedProduct.price)}, Stok ${matchedProduct.stock}).`
    });
    if (geminiAns) {
      return finalizeReply(geminiAns, null, { source: 'gemini_inventory' });
    }

    const stockNum = Number(matchedProduct.stock || 0);
    const greetName = (features.memory && customerMem?.customer_name) ? `Kak ${customerMem.customer_name}` : `Kak ${senderName}`;
    if (stockNum <= 0) {
      const alt = products.find(p => Number(p.stock) > 0 && p.id !== matchedProduct.id);
      return finalizeReply(
        `Halo ${greetName}, maaf banget untuk *${matchedProduct.name}* saat ini stoknya sedang habis 🙏` +
        (alt ? `\nTapi kita punya *${alt.name}* yang masih ready (${formatRp(alt.price)}, sisa ${alt.stock} pcs). Mau lihat yang ini kak?` : ''),
        null
      );
    }

    const urgency = stockNum <= 5 ? ` (sisa *${stockNum} pcs* lagi nih kak, cepat habis!)` : ` (ready *${stockNum} pcs*)`;
    const upsell = (features.upsell || aiTier === 'genius')
      ? (() => {
          const other = products.find(p => p.id !== matchedProduct.id && Number(p.stock) > 0);
          return other ? `\n\n💡 _Rekomendasi produk lainnya yang masih ready: *${other.name}* (${formatRp(other.price)})._` : '';
        })()
      : '';

    const cta = features.invoice
      ? `\n\nKalau mau langsung order, balas: *"pesan ${matchedProduct.name} 1"* nanti langsung saya buatkan invoicenya 😊`
      : `\n\nAda yang ingin ditanyakan lagi kak?`;

    return finalizeReply(
      `Halo ${greetName}! Untuk *${matchedProduct.name}* tersedia${urgency}.\n💰 Harga: *${formatRp(matchedProduct.price)}*${matchedProduct.description ? `\n📝 ${matchedProduct.description}` : ''}${upsell}${cta}`,
      null,
      { source: 'inventory_ai' }
    );
  }

  if (kbMatch.found) {
    return finalizeReply(kbMatch.answer, kbMatch.item?.image_url || null);
  }

  // F. FAQ Auto-Discovery (Pro 70K & Bisnis 100K): Catat pertanyaan pelanggan tentang produk/toko yang belum terjawab
  if (features.handover && /\b(harga|stok|ready|ada|jual|produk|beli|pesan|ukuran|size|warna|bahan|promo|diskon|toko|buka|lokasi)\b/i.test(cleanText)) {
    knowledgeManager.recordUnanswered(senderName, String(jid), cleanText, uid).catch(() => {});
  }

  // JANGAN membalas & JANGAN auto-read jika di luar database toko (agar chat pribadi owner tetap Unread di HP)
  return { found: false, answer: '', aiTier };
}
