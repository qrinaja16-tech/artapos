import { knowledgeManager } from './knowledge.js';
import {
  dbGetConfig,
  dbGetProducts,
  dbCreateStoreOrder,
  dbGetEffectiveUserLimits,
  dbGetCustomerMemory,
  dbUpsertCustomerMemory,
  dbAddNotificationLog
} from './db.js';

// Memori percakapan sementara per akun & nomor pelanggan (dibatasi contextLimit sesuai paket)
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

function estimateShippingByCity(cityText = '', weightGram = 1000) {
  const kg = Math.max(1, Math.ceil(Number(weightGram || 500) / 1000));
  const c = String(cityText || '').toLowerCase();
  let zone = 'Luar Jabodetabek (Jawa)';
  let ratePerKg = 14000;

  if (/(jakarta|bogor|depok|tangerang|bekasi)/.test(c)) {
    zone = 'Jabodetabek';
    ratePerKg = 10000;
  } else if (/(bandung|semarang|surabaya|jogja|yogyakarta|solo|malang|cirebon|sidoarjo|kediri)/.test(c)) {
    zone = 'Pulau Jawa';
    ratePerKg = 15000;
  } else if (/(medan|palembang|lampung|padang|pekanbaru|jambi|bengkulu|aceh|batam)/.test(c)) {
    zone = 'Sumatera';
    ratePerKg = 26000;
  } else if (/(makassar|banjarmasin|balikpapan|samarinda|pontianak|manado|denpasar|bali|lombok|mataram)/.test(c)) {
    zone = 'Bali / Kalimantan / Sulawesi';
    ratePerKg = 32000;
  } else if (/(papua|jayapura|ambon|kupang|sorong|ternate)/.test(c)) {
    zone = 'Indonesia Timur';
    ratePerKg = 55000;
  }

  return {
    zone,
    kg,
    reguler: ratePerKg * kg,
    hemat: Math.round(ratePerKg * 0.8) * kg,
    express: Math.round(ratePerKg * 1.45) * kg
  };
}

function extractCityFromText(text = '') {
  const m = String(text || '').match(/(?:ke|kota|kabupaten|kirim(?:\s+ke)?|tujuan|alamat)\s+([a-zA-Z\s]{3,28})/i);
  if (m && m[1]) {
    return m[1].replace(/\b(berapa|ongkir|kak|min|ya|nih|dong)\b/gi, '').trim();
  }
  const known = String(text || '').match(/\b(jakarta|bogor|depok|tangerang|bekasi|bandung|semarang|surabaya|jogja|yogyakarta|solo|malang|medan|palembang|lampung|padang|pekanbaru|makassar|balikpapan|banjarmasin|denpasar|bali|batam|manado)\b/i);
  return known ? known[1] : '';
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
  const prodSummary = products.slice(0, 20).map(p =>
    `- ${p.name} | Harga: ${formatRp(p.price)} | Stok: ${p.stock} | Berat: ${p.weight_gram}gr`
  ).join('\n');

  const systemText = [
    `Kamu adalah CS Sales WhatsApp manusiawi untuk toko "${storeName}".`,
    `Level kecerdasan paket toko: ${aiTier}.`,
    `ATURAN KETAT: Jangan pernah mengarang harga, stok, atau ongkir di luar data berikut.`,
    `=== STOK INVENTORY LIVE ===\n${prodSummary || '(Belum ada produk di inventory)'}`,
    customerMem ? `=== MEMORI PELANGGAN ===\nNama: ${customerMem.customer_name || '-'}, Kota terakhir: ${customerMem.last_city || '-'}, Produk terakhir: ${customerMem.last_product || '-'}` : '',
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
        generationConfig: { temperature: 0.5, maxOutputTokens: 450 }
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

  const limits = await dbGetEffectiveUserLimits(userPlan, userRole);
  const { aiTier, contextLimit, features, hasWatermark } = limits;

  const finalizeReply = (rawAnswer, imageUrl = null, meta = {}) => {
    const ans = String(rawAnswer || '').trim();
    if (!ans) return { found: false, answer: '', aiTier };
    const finalText = (!hasWatermark || ans.toLowerCase().includes('sent via artapos.id'))
      ? ans
      : `${ans}\n\n> sent via artapos.id`;
    appendContext(uid, jid, 'user', cleanText, contextLimit);
    appendContext(uid, jid, 'model', ans, contextLimit);
    return { found: true, answer: finalText, imageUrl, aiTier, ...meta };
  };

  // 1. PAKET GRATIS (Basic): Hanya FAQ Knowledge Base, tanpa Inventory / Memory / Ongkir / Invoice
  if (aiTier === 'basic' || !features.inventory) {
    const kb = await knowledgeManager.findAnswer(cleanText, uid);
    if (!kb.found) return { found: false, answer: '', aiTier };
    return finalizeReply(kb.answer, kb.item?.image_url || null, { source: 'knowledge_basic' });
  }

  // 2. PAKET BERBAYAR (Hemat 25K+): Akses Inventory Live, Konteks, Ongkir, Invoice, Memori, Handover
  const cfg = await dbGetConfig(uid);
  const storeName = cfg?.store_name || 'Toko Kami';
  const products = await dbGetProducts(uid);
  const history = getContext(uid, jid, contextLimit);
  const customerMem = features.memory ? await dbGetCustomerMemory(uid, jid) : null;

  // Catat kota / nama pelanggan jika fitur Personal Memory aktif (Starter 50K+)
  const detectedCity = extractCityFromText(cleanText);
  if (features.memory && (senderName || detectedCity)) {
    dbUpsertCustomerMemory(uid, jid, {
      customer_name: senderName,
      last_city: detectedCity || undefined
    }).catch(() => {});
  }

  // A. Deteksi Human Handover / Komplain (Pro 70K+)
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
      `Mohon maaf atas ketidaknyamanannya ya Kak ${senderName} 🙏 Keluhan kakak sudah langsung saya teruskan ke Owner/Admin senior ${storeName} agar segera dibantu penyelesaiannya sekarang juga.`
    );
  }

  // B. Cek kecocokan produk di Inventory (atau dari konteks percakapan sebelumnya)
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

  // C. Deteksi Intent ORDER / INVOICE OTOMATIS (Plus 35K+)
  const isOrderIntent = /\b(pesan|order|beli|checkout|bungkus|ambil|mau\s+\d+)\b/i.test(cleanText);
  if (features.invoice && isOrderIntent && matchedProduct) {
    const qtyMatch = cleanText.match(/\b(\d{1,3})\s*(pcs|buah|biji|unit|x)?\b/i);
    const qty = qtyMatch ? Math.max(1, Math.min(99, Number(qtyMatch[1]))) : 1;

    if (Number(matchedProduct.stock) < qty) {
      const alt = products.find(p => Number(p.stock) > 0 && p.id !== matchedProduct.id);
      const altMsg = alt ? `\nAlternatif yang ready sekarang: *${alt.name}* (${formatRp(alt.price)}, stok ${alt.stock}).` : '';
      return finalizeReply(
        `Maaf Kak ${senderName}, untuk *${matchedProduct.name}* stoknya saat ini tersisa *${matchedProduct.stock} pcs* (tidak cukup untuk ${qty} pcs).${altMsg}`
      );
    }

    const shipCity = detectedCity || customerMem?.last_city || '';
    const shipCalc = (features.ongkir && shipCity)
      ? estimateShippingByCity(shipCity, Number(matchedProduct.weight_gram || 500) * qty)
      : null;
    const shippingCost = shipCalc ? shipCalc.reguler : 0;

    try {
      const order = await dbCreateStoreOrder(uid, {
        customer_name: senderName || 'Pelanggan WhatsApp',
        customer_phone: String(jid || '').split('@')[0],
        customer_address: shipCity ? `Tujuan: ${shipCity}` : 'Alamat menyusul via chat',
        courier: shipCalc ? `Reguler (${shipCalc.zone})` : 'Menunggu Konfirmasi',
        shipping_cost: shippingCost,
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
        shipCalc ? `• Ongkir (${shipCalc.zone}, ${shipCalc.kg} kg) = *${formatRp(shippingCost)}*` : `• Ongkir: *Belum termasuk*`,
        `--------------------------------`,
        `💰 *Total Tagihan: ${formatRp(order.total_amount)}*`,
        `Status: Menunggu Pembayaran (Stok sudah kami amankan untuk Kakak 😊)`,
        ``,
        `Silakan kirim alamat lengkap & konfirmasi pembayaran agar pesanan langsung kami proses!`
      ].join('\n');

      return finalizeReply(invoiceText, matchedProduct.image_url || null, { createdOrder: order });
    } catch (ordErr) {
      return finalizeReply(`Maaf Kak ${senderName}, pesanan belum bisa dibuat: ${ordErr.message}`);
    }
  }

  // D. Deteksi Hitung Ongkir Otomatis (Starter 50K+)
  if (/\b(ongkir|ongkos\s+kirim|kirim\s+ke|ekspedisi|cod)\b/i.test(cleanText)) {
    if (!features.ongkir) {
      // Hemat/Plus belum unlock kalkulator ongkir otomatis
      const kbOngkir = await knowledgeManager.findAnswer(cleanText, uid);
      if (kbOngkir.found) return finalizeReply(kbOngkir.answer, kbOngkir.item?.image_url || null);
    } else {
      const targetCity = detectedCity || customerMem?.last_city;
      if (!targetCity) {
        return finalizeReply(`Siap Kak ${senderName}! Boleh info *kota/kecamatan tujuannya* ya kak biar langsung saya hitungkan estimasi ongkirnya 😊`);
      }
      const weight = Number(matchedProduct?.weight_gram || 1000);
      const est = estimateShippingByCity(targetCity, weight);
      const prodLine = matchedProduct ? `untuk *${matchedProduct.name}* (${weight} gr)` : `untuk berat estimasi ${est.kg} kg`;
      return finalizeReply(
        `📦 *Estimasi Ongkir ke ${targetCity}* (${est.zone}, ${est.kg} kg) ${prodLine}:\n` +
        `• Ekonomi/Hemat: *${formatRp(est.hemat)}*\n` +
        `• Reguler: *${formatRp(est.reguler)}*\n` +
        `• Express/Kilat: *${formatRp(est.express)}*\n\n` +
        `Mau langsung saya buatkan pesanannya kak? Ketik saja: *"pesan [nama produk] 1 ke ${targetCity}"* 😊`
      );
    }
  }

  // E. Cek Knowledge Base dulu (FAQ toko)
  const kbMatch = await knowledgeManager.findAnswer(cleanText, uid);
  if (kbMatch.found && !matchedProduct) {
    return finalizeReply(kbMatch.answer, kbMatch.item?.image_url || null, { source: 'knowledge' });
  }

  // F. Jawaban Berbasis Inventory Live + Gaya Manusiawi (atau Gemini jika tersedia)
  if (matchedProduct) {
    const geminiAns = await tryGeminiReply({
      storeName,
      aiTier,
      userText: cleanText,
      history,
      products,
      customerMem,
      extraSystemHint: `Pelanggan sedang menanyakan produk: ${matchedProduct.name} (Harga ${formatRp(matchedProduct.price)}, Stok ${matchedProduct.stock}, Berat ${matchedProduct.weight_gram}gr).`
    });
    if (geminiAns) {
      return finalizeReply(geminiAns, matchedProduct.image_url || null, { source: 'gemini_inventory' });
    }

    const stockNum = Number(matchedProduct.stock || 0);
    const greetName = customerMem?.customer_name ? `Kak ${customerMem.customer_name}` : `Kak ${senderName}`;
    if (stockNum <= 0) {
      const alt = products.find(p => Number(p.stock) > 0 && p.id !== matchedProduct.id);
      return finalizeReply(
        `Halo ${greetName}, maaf banget untuk *${matchedProduct.name}* saat ini stoknya sedang habis 🙏` +
        (alt ? `\nTapi kita punya *${alt.name}* yang masih ready (${formatRp(alt.price)}, sisa ${alt.stock} pcs). Mau lihat yang ini kak?` : ''),
        matchedProduct.image_url || null
      );
    }

    const urgency = stockNum <= 5 ? ` (sisa *${stockNum} pcs* lagi nih kak, cepat habis!)` : ` (ready *${stockNum} pcs*)`;
    const upsell = (aiTier === 'genius')
      ? (() => {
          const other = products.find(p => p.id !== matchedProduct.id && Number(p.stock) > 0);
          return other ? `\n\n💡 _Rekomendasi sekalian hemat ongkir: banyak pembeli juga nambah *${other.name}* (${formatRp(other.price)})._` : '';
        })()
      : '';

    const cta = features.invoice
      ? `\n\nKalau mau langsung order, balas: *"pesan ${matchedProduct.name} 1"* nanti langsung saya buatkan invoicenya 😊`
      : `\n\nAda yang ingin ditanyakan lagi kak?`;

    return finalizeReply(
      `Halo ${greetName}! Untuk *${matchedProduct.name}* tersedia${urgency}.\n💰 Harga: *${formatRp(matchedProduct.price)}*\n⚖️ Berat: ${matchedProduct.weight_gram} gram${matchedProduct.description ? `\n📝 ${matchedProduct.description}` : ''}${upsell}${cta}`,
      matchedProduct.image_url || null,
      { source: 'inventory_live' }
    );
  }

  // G. Jika tidak cocok produk Inventory dan tidak ada di Knowledge Base,
  // JANGAN membalas & JANGAN auto-read (agar chat pribadi owner tetap Unread di HP)
  if (kbMatch.found) {
    return finalizeReply(kbMatch.answer, kbMatch.item?.image_url || null);
  }

  return { found: false, answer: '', aiTier };
}
