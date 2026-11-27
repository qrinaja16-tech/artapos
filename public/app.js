// @ts-nocheck
// ==============================================================
// artapos.id • INDONESIAN SAAS CLIENT APPLICATION ENGINE
// Multi-Tenant Isolation, Real-Time Quota Stream & Session Security
// ==============================================================

// Daftar Paket Resmi artapos.id (Fallback default, diperbarui dinamis via GET /api/plans)
const ARTAPOS_PLANS = {
  hemat25: {
    id: 'hemat25',
    name: 'Paket Hemat 25K',
    price: 25000,
    quota: 300,
    days_active: 30,
    max_knowledge: 7,
    max_images: 7,
    has_watermark: true,
    popular: false,
    desc: '300 token/bulan • 30 hari (Masih ada watermark)'
  },
  plus35: {
    id: 'plus35',
    name: 'Paket Plus 35K',
    price: 35000,
    quota: 500,
    days_active: 30,
    max_knowledge: 15,
    max_images: 15,
    has_watermark: false,
    popular: true,
    desc: '500 token/bulan • 30 hari (Tanpa Watermark)'
  },
  starter50: {
    id: 'starter50',
    name: 'Paket Starter 50K',
    price: 50000,
    quota: 1000,
    days_active: 30,
    max_knowledge: 25,
    max_images: 25,
    has_watermark: false,
    popular: false,
    desc: '1.000 token/bulan • 30 hari (Tanpa Watermark)'
  },
  pro70: {
    id: 'pro70',
    name: 'Paket Pro 70K',
    price: 70000,
    quota: 1500,
    days_active: 30,
    max_knowledge: 40,
    max_images: 40,
    has_watermark: false,
    popular: false,
    desc: '1.500 token/bulan • 30 hari (Tanpa Watermark)'
  },
  bisnis100: {
    id: 'bisnis100',
    name: 'Paket Bisnis 100K',
    price: 100000,
    quota: 2500,
    days_active: 30,
    max_knowledge: 9999,
    max_images: 9999,
    has_watermark: false,
    popular: false,
    desc: '2.500 token/bulan • 30 hari (Tanpa Watermark)'
  }
};

let DYNAMIC_PLANS_LIST = [];

async function loadDynamicPlans(showSuccessToast = false) {
  try {
    const res = await fetch('/api/plans');
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.plans) && data.plans.length > 0) {
      DYNAMIC_PLANS_LIST = data.plans;
      applyDynamicPlansToUI(data.plans);
      if (showSuccessToast) {
        showToast('Konfigurasi paket berhasil dimuat ulang!', 'success');
      }
    }
  } catch (e) {
    console.warn('[PLANS] Gagal memuat paket dinamis, pakai default:', e.message);
  }
}

function getAiTierDisplayLabel(aiTier = 'basic', contextLimit = 0) {
  const t = String(aiTier || 'basic').toLowerCase();
  if (t === 'genius') return `Otak AI Genius (${contextLimit || 40} Chat + Smart Upsell)`;
  if (t === 'pro') return `Otak AI Pro Closer (${contextLimit || 20} Chat + Handover)`;
  if (t === 'smart') return `Otak AI Smart CS (${contextLimit || 12} Chat + Ingat Pelanggan)`;
  if (t === 'sales') return `Otak AI Sales (${contextLimit || 6} Chat + Auto-Invoice)`;
  if (t === 'basic_inventory') return 'Basic + Cek Inventory (Belum Otak AI)';
  return 'Basic Matcher (Belum Otak AI)';
}

function applyDynamicPlansToUI(plans) {
  if (!Array.isArray(plans) || plans.length === 0) return;

  plans.forEach(p => {
    const key = p.plan_key || p.id;
    if (!key || key === 'free') return;
    const days = Number(p.days_active || 30);
    const quotaVal = Number(p.quota_tokens ?? p.quota ?? 0);
    const wmText = p.has_watermark ? 'Ada watermark' : 'Tanpa Watermark';
    ARTAPOS_PLANS[key] = {
      id: key,
      name: p.name,
      price: Number(p.price || 0),
      quota: quotaVal,
      days_active: days,
      max_knowledge: Number(p.max_knowledge ?? 25),
      max_inventory: Number(p.max_inventory ?? 10),
      max_images: Number(p.max_images ?? 0),
      ai_tier: p.ai_tier || 'basic_inventory',
      context_limit: Number(p.context_limit ?? 0),
      has_watermark: Boolean(p.has_watermark),
      popular: Boolean(p.is_popular),
      desc: `${quotaVal.toLocaleString('id-ID')} token / ${days} hari (${wmText})`
    };
  });

  renderLandingPricingGrid(plans);
  renderCheckoutPlanSelector(plans);
  renderAdminPlansManager(plans);
}

function renderLandingPricingGrid(plans) {
  const grid = document.getElementById('landingPricingGrid');
  if (!grid || !Array.isArray(plans) || plans.length === 0) return;

  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  const infoSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;

  const defaultInvMap = { free: 0, hemat25: 10, plus35: 25, starter50: 40, pro70: 50, bisnis100: 80 };
  const defaultTierMap = { free: 'basic', hemat25: 'basic_inventory', plus35: 'sales', starter50: 'smart', pro70: 'pro', bisnis100: 'genius' };
  const defaultCtxMap = { free: 0, hemat25: 0, plus35: 6, starter50: 12, pro70: 20, bisnis100: 40 };

  grid.innerHTML = plans.map(p => {
    const key = p.plan_key || p.id;
    const isFree = key === 'free' || Number(p.price) === 0;
    const isPopular = Boolean(p.is_popular);
    const priceNum = Number(p.price || 0);
    const quotaNum = Number(p.quota_tokens ?? p.quota ?? 0);
    const daysNum = Number(p.days_active || 30);
    const maxKnowledge = Number(p.max_knowledge ?? 10);
    const maxInventory = Number(p.max_inventory ?? defaultInvMap[key] ?? 0);
    const maxImages = Number(p.max_images ?? 0);
    const aiTier = p.ai_tier || defaultTierMap[key] || 'basic';
    const ctxLimit = Number(p.context_limit ?? defaultCtxMap[key] ?? 0);
    const hasWatermark = Boolean(p.has_watermark);

    const kText = maxKnowledge >= 9999
      ? 'Knowledge Base Tanpa Batas'
      : `Maksimal <strong>${maxKnowledge.toLocaleString('id-ID')}</strong> Knowledge Base`;
    const invItem = maxInventory > 0
      ? `<li>${checkSvg}Maksimal <strong>${maxInventory.toLocaleString('id-ID')} Produk Inventory</strong></li>`
      : `<li style="color: #64748b;">${infoSvg}Belum Termasuk Inventory Produk</li>`;
    const imgItem = maxImages > 0
      ? `<li>${checkSvg}Maksimal <strong>${maxImages.toLocaleString('id-ID')} Foto</strong> Knowledge</li>`
      : `<li style="color: #64748b;">${infoSvg}Belum Mendukung Upload Foto</li>`;

    const hasAiBrain = aiTier !== 'basic' && aiTier !== 'basic_inventory';
    const aiItem = hasAiBrain
      ? `<li>${checkSvg}<strong>${escapeHtml(getAiTierDisplayLabel(aiTier, ctxLimit))}</strong></li>`
      : `<li style="color: #64748b;">${infoSvg}${escapeHtml(getAiTierDisplayLabel(aiTier, ctxLimit))}</li>`;

    const descText = p.description
      ? escapeHtml(p.description)
      : (isFree
        ? 'Uji coba langsung tanpa biaya & tanpa kartu kredit.'
        : `Kuota ${quotaNum.toLocaleString('id-ID')} balasan selama ${daysNum} hari aktif.`);

    const wmItem = hasWatermark
      ? `<li style="color: #64748b;">${infoSvg}Ada Watermark <code>&gt; sent via artapos.id</code></li>`
      : `<li>${checkSvg}<strong>Tanpa Watermark</strong> (Branding Toko Sendiri)</li>`;

    const actionBtn = isFree
      ? `<button class="btn-select-plan" onclick="openFreeRegisterModal()">Daftar Gratis</button>`
      : `<button class="btn-select-plan${isPopular ? ' primary' : ''}" onclick="openCheckout('${escapeHtml(key)}')">Pilih ${escapeHtml(p.name)}</button>`;

    return `
      <div class="pricing-card${isPopular ? ' featured' : ''}" data-plan="${escapeHtml(key)}">
        <div class="pricing-badge-wrapper">${isPopular ? '<span class="popular-ribbon">🔥 PALING LARIS</span>' : ''}</div>
        <div class="pricing-tier-name">${escapeHtml(p.name)}</div>
        <div class="pricing-tier-desc">${descText}</div>
        <div class="pricing-price-box">
          <span class="price-currency">Rp</span>
          <span class="price-value">${priceNum.toLocaleString('id-ID')}</span>
          <span class="price-period">/${daysNum} hari</span>
        </div>
        <div class="pricing-quota-highlight">
          <strong>${quotaNum.toLocaleString('id-ID')}</strong> Token Chat / ${daysNum} Hari
        </div>
        <ul class="pricing-features-list">
          ${aiItem}
          <li>${checkSvg}${kText}</li>
          ${invItem}
          ${imgItem}
          ${wmItem}
        </ul>
        ${actionBtn}
      </div>
    `;
  }).join('');
}

function renderCheckoutPlanSelector(plans) {
  const container = document.getElementById('checkoutPlanSelector');
  if (!container || !Array.isArray(plans) || plans.length === 0) return;

  const paidPlans = plans.filter(p => (p.plan_key || p.id) !== 'free' && Number(p.price || 0) > 0);
  if (paidPlans.length === 0) return;

  const selectedKey = ARTAPOS_PLANS[currentSelectedPlan] ? currentSelectedPlan : (paidPlans[0].plan_key || paidPlans[0].id);
  const defaultInvMap = { hemat25: 10, plus35: 25, starter50: 40, pro70: 50, bisnis100: 80 };
  const defaultTierMap = { hemat25: 'basic_inventory', plus35: 'sales', starter50: 'smart', pro70: 'pro', bisnis100: 'genius' };

  container.innerHTML = paidPlans.map(p => {
    const key = p.plan_key || p.id;
    const isSelected = key === selectedKey;
    const priceNum = Number(p.price || 0);
    const quotaNum = Number(p.quota_tokens ?? p.quota ?? 0);
    const daysNum = Number(p.days_active || 30);
    const maxK = Number(p.max_knowledge || 25);
    const maxInv = Number(p.max_inventory ?? defaultInvMap[key] ?? 10);
    const aiTier = p.ai_tier || defaultTierMap[key] || 'basic_inventory';
    const hasAi = aiTier !== 'basic' && aiTier !== 'basic_inventory';
    const aiLabel = hasAi ? `<strong style="color:#0284c7;">🧠 ${escapeHtml(getAiTierDisplayLabel(aiTier, p.context_limit))}</strong>` : 'Belum Otak AI';
    const wmBadge = p.has_watermark
      ? 'Ada watermark'
      : '<strong style="color:#16a34a;">✨ Tanpa watermark</strong>';
    const popBadge = p.is_popular
      ? `<span class="badge-best-seller">🔥 Paling Laris</span>`
      : '';

    return `
      <label class="plan-option${isSelected ? ' selected' : ''}" onclick="selectCheckoutPlan('${escapeHtml(key)}')">
        <input type="radio" name="checkoutPlanRadio" value="${escapeHtml(key)}"${isSelected ? ' checked' : ''}>
        <div class="plan-option-content">
          <div class="plan-option-header">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              ${popBadge}
            </div>
            <span class="plan-option-price">Rp ${priceNum.toLocaleString('id-ID')} / ${daysNum} hr</span>
          </div>
          <div class="plan-option-quota">${quotaNum.toLocaleString('id-ID')} token • ${maxK} Knowledge • <strong>${maxInv} Inventory</strong> • ${aiLabel} • ${wmBadge}</div>
        </div>
      </label>
    `;
  }).join('');
}

function renderAdminPlansManager(plans) {
  const grid = document.getElementById('adminPlansManagerGrid');
  if (!grid || !Array.isArray(plans) || plans.length === 0) return;

  const defaultInvMap = { free: 0, hemat25: 10, plus35: 25, starter50: 40, pro70: 50, bisnis100: 80 };
  const defaultTierMap = { free: 'basic', hemat25: 'basic_inventory', plus35: 'sales', starter50: 'smart', pro70: 'pro', bisnis100: 'genius' };
  const defaultCtxMap = { free: 0, hemat25: 0, plus35: 6, starter50: 12, pro70: 20, bisnis100: 40 };

  grid.innerHTML = plans.map(p => {
    const key = p.plan_key || p.id;
    const safeKey = escapeHtml(key);
    const isPopular = Boolean(p.is_popular);
    const hasWatermark = Boolean(p.has_watermark);
    const curInv = Number(p.max_inventory ?? defaultInvMap[key] ?? 0);
    const curTier = p.ai_tier || defaultTierMap[key] || 'basic';
    const curCtx = Number(p.context_limit ?? defaultCtxMap[key] ?? 0);

    return `
      <div class="admin-plan-edit-card${isPopular ? ' is-popular' : ''}" data-plan-key="${safeKey}">
        <div class="admin-plan-card-top">
          <strong style="font-size:0.95rem; color:#0f172a;">${escapeHtml(p.name)}</strong>
          <span class="admin-plan-key-badge">${safeKey}</span>
        </div>

        <div class="admin-plan-fields-grid">
          <div class="admin-plan-field full-span">
            <label>Nama Paket</label>
            <input type="text" id="planEditName_${safeKey}" value="${escapeHtml(p.name || '')}">
          </div>
          <div class="admin-plan-field">
            <label>Harga (Rp)</label>
            <input type="number" min="0" id="planEditPrice_${safeKey}" value="${Number(p.price || 0)}">
          </div>
          <div class="admin-plan-field">
            <label>Jumlah Token</label>
            <input type="number" min="0" id="planEditQuota_${safeKey}" value="${Number(p.quota_tokens ?? p.quota ?? 0)}">
          </div>
          <div class="admin-plan-field">
            <label>Masa Aktif (Hari)</label>
            <input type="number" min="1" id="planEditDays_${safeKey}" value="${Number(p.days_active || 30)}">
          </div>
          <div class="admin-plan-field">
            <label>Maks. Knowledge</label>
            <input type="number" min="1" id="planEditKnowledge_${safeKey}" value="${Number(p.max_knowledge ?? 10)}">
          </div>
          <div class="admin-plan-field">
            <label>Maks. Inventory (Produk)</label>
            <input type="number" min="0" id="planEditInventory_${safeKey}" value="${curInv}">
          </div>
          <div class="admin-plan-field">
            <label>Maks. Foto Knowledge</label>
            <input type="number" min="0" id="planEditImages_${safeKey}" value="${Number(p.max_images ?? 0)}">
          </div>
          <div class="admin-plan-field">
            <label>Level Otak AI</label>
            <select id="planEditAiTier_${safeKey}" style="width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.84rem;background:#f8fafc;">
              <option value="basic"${curTier === 'basic' ? ' selected' : ''}>Basic Matcher (Non-AI)</option>
              <option value="basic_inventory"${curTier === 'basic_inventory' ? ' selected' : ''}>Basic + Inventory (Non-AI)</option>
              <option value="sales"${curTier === 'sales' ? ' selected' : ''}>Otak AI Sales (Mulai Aktif)</option>
              <option value="smart"${curTier === 'smart' ? ' selected' : ''}>Otak AI Smart CS</option>
              <option value="pro"${curTier === 'pro' ? ' selected' : ''}>Otak AI Pro Closer</option>
              <option value="genius"${curTier === 'genius' ? ' selected' : ''}>Otak AI Genius</option>
            </select>
          </div>
          <div class="admin-plan-field">
            <label>Ingatan Konteks Chat</label>
            <input type="number" min="0" id="planEditContext_${safeKey}" value="${curCtx}">
          </div>
        </div>

        <div class="admin-plan-toggles">
          <label class="admin-plan-toggle-label">
            <input type="checkbox" id="planEditWatermark_${safeKey}"${hasWatermark ? ' checked' : ''}>
            Ada Watermark
          </label>
          <label class="admin-plan-toggle-label">
            <input type="checkbox" id="planEditPopular_${safeKey}"${isPopular ? ' checked' : ''}>
            Badge Paling Laris
          </label>
        </div>

        <button type="button" class="btn-save-plan-card" onclick="handleAdminSavePlan('${safeKey}')">
          💾 Simpan Perubahan Paket
        </button>
      </div>
    `;
  }).join('');
}

async function handleAdminSavePlan(planKey) {
  const name = document.getElementById(`planEditName_${planKey}`)?.value?.trim();
  const price = Number(document.getElementById(`planEditPrice_${planKey}`)?.value || 0);
  const quota = Number(document.getElementById(`planEditQuota_${planKey}`)?.value || 0);
  const days_active = Number(document.getElementById(`planEditDays_${planKey}`)?.value || 30);
  const max_knowledge = Number(document.getElementById(`planEditKnowledge_${planKey}`)?.value || 10);
  const max_inventory = Number(document.getElementById(`planEditInventory_${planKey}`)?.value || 0);
  const max_images = Number(document.getElementById(`planEditImages_${planKey}`)?.value || 0);
  const ai_tier = document.getElementById(`planEditAiTier_${planKey}`)?.value || 'basic';
  const context_limit = Number(document.getElementById(`planEditContext_${planKey}`)?.value || 0);
  const has_watermark = Boolean(document.getElementById(`planEditWatermark_${planKey}`)?.checked);
  const is_popular = Boolean(document.getElementById(`planEditPopular_${planKey}`)?.checked);

  if (!name) {
    showAlert('Nama paket tidak boleh kosong.', 'error');
    return;
  }

  const res = await apiCall('/api/admin/plans', 'POST', {
    plan_key: planKey,
    name,
    price,
    quota_tokens: quota,
    quota,
    days_active,
    max_knowledge,
    max_inventory,
    max_images,
    ai_tier,
    context_limit,
    has_watermark,
    is_popular
  });

  if (res && res.success) {
    showToast(`Paket "${name}" berhasil disimpan & disinkronkan!`, 'success');
    await loadDynamicPlans(false);
  } else {
    showAlert('Gagal menyimpan paket: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

// Kamus Singkatan Bahasa Indonesia
const ABBREVIATIONS = {
  'brp': 'berapa',
  'kpn': 'kapan',
  'dmn': 'dimana',
  'dmana': 'dimana',
  'gmn': 'gimana',
  'gmna': 'gimana',
  'sy': 'saya',
  'aq': 'saya',
  'km': 'kamu',
  'bs': 'bisa',
  'bsa': 'bisa',
  'ga': 'tidak',
  'gak': 'tidak',
  'nggak': 'tidak',
  'tdk': 'tidak',
  'sdh': 'sudah',
  'udh': 'sudah',
  'udah': 'sudah',
  'blm': 'belum',
  'ongkir': 'ongkos kirim',
  'rek': 'rekening',
  'tf': 'transfer',
  'trf': 'transfer',
  'tq': 'terima kasih',
  'thx': 'terima kasih',
  'makasih': 'terima kasih',
  'mks': 'terima kasih'
};

// ==============================================================
// SWEETALERT2 NOTIFICATION ENGINE (SEMUA NOTIFIKASI MENGGUNAKAN SWEETALERT)
// ==============================================================
function showAlert(msg, icon = 'info', title = null) {
  if (typeof Swal === 'undefined') {
    return;
  }
  const str = String(msg || '');
  const isSuccess = str.includes('✅') || str.toLowerCase().includes('berhasil') || str.toLowerCase().includes('sukses');
  const isWarning = str.includes('⚠️') || str.toLowerCase().includes('perhatian') || str.toLowerCase().includes('mohon') || str.toLowerCase().includes('gagal') || str.toLowerCase().includes('salah') || str.toLowerCase().includes('ditolak');
  const effectiveIcon = icon !== 'info' ? icon : (isSuccess ? 'success' : (isWarning ? 'warning' : 'info'));
  const effectiveTitle = title || (isSuccess ? 'Berhasil' : (isWarning ? 'Perhatian' : 'Informasi'));

  Swal.fire({
    title: effectiveTitle,
    text: str.replace(/[✅⚠️❌🎉🔑👑💡]/g, '').trim(),
    icon: effectiveIcon,
    confirmButtonColor: '#16a34a',
    confirmButtonText: 'OK',
    didOpen: () => {
      const c = Swal.getContainer();
      if (c) c.style.zIndex = '9999999';
    },
    customClass: {
      popup: 'swal-custom-popup',
      confirmButton: 'swal-custom-confirm'
    }
  });
}

// Override window.alert default agar semua notifikasi langsung menggunakan SweetAlert2
window.alert = function (msg) {
  showAlert(String(msg || ''));
};

async function showConfirm(title, text, confirmButtonText = 'Ya, Lanjutkan') {
  if (typeof Swal === 'undefined') {
    return window.confirm(text || title);
  }
  const res = await Swal.fire({
    title: title,
    text: text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#16a34a',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: confirmButtonText,
    cancelButtonText: 'Batal',
    didOpen: () => {
      const c = Swal.getContainer();
      if (c) c.style.zIndex = '9999999';
    },
    customClass: {
      popup: 'swal-custom-popup',
      confirmButton: 'swal-custom-confirm'
    }
  });
  return res.isConfirmed;
}

function showToast(title, icon = 'success') {
  if (typeof Swal === 'undefined') return;
  const Toast = Swal.mixin({
    toast: true,
    position: 'center',
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
    didOpen: (toast) => {
      const c = Swal.getContainer();
      if (c) c.style.zIndex = '9999999';
    }
  });
  Toast.fire({
    icon: icon,
    title: title
  });
}

// ==============================================================
// STATE GLOBAL APLIKASI
// ==============================================================
let currentUser = null;           // User yang sedang login
let currentSelectedPlan = 'plus35'; // Default Paling Laris: Paket Plus 35K
let currentActiveView = 'landing'; // 'landing' | 'checkout' | 'email-success' | 'login' | 'dashboard'
let currentActiveTab = 'whatsapp'; // 'whatsapp' | 'admin' | 'chat' | 'settings' | 'account'
let activeOrder = null;           // Order aktif yang sedang menunggu verifikasi pembayaran Midtrans
let knowledgeData = [];
let allAdminUsers = [];           // Cache data seluruh pengguna untuk Super Admin
let allAdminKnowledge = [];       // Cache bank soal & jawaban seluruh akun untuk Super Admin
let waPollTimer = null;
let quotaLiveTimer = null;
let currentWaStatus = 'connecting';
let simulatedConnected = false;
let lastKnownQuotaRemaining = null;
let isNetworkOffline = !navigator.onLine;
let offlineReconnectTimer = null;

function setNetworkOfflineState(offline) {
  isNetworkOffline = Boolean(offline);
  const banner = document.getElementById('offlineNetworkBanner');
  if (!banner) return;

  if (isNetworkOffline) {
    banner.classList.remove('hidden');
    if (!offlineReconnectTimer) {
      offlineReconnectTimer = setInterval(async () => {
        if (navigator.onLine) {
          setNetworkOfflineState(false);
        }
      }, 2500);
    }
  } else {
    banner.classList.add('hidden');
    if (offlineReconnectTimer) {
      clearInterval(offlineReconnectTimer);
      offlineReconnectTimer = null;
    }
  }
}

window.addEventListener('offline', () => {
  setNetworkOfflineState(true);
});

window.addEventListener('online', () => {
  setNetworkOfflineState(false);
  retryNetworkConnection();
});

// ==============================================================
// SMART API CLIENT (WITH BEARER TOKEN & 1-DEVICE-1-EMAIL FINGERPRINT)
// ==============================================================
function getClientDeviceFingerprint() {
  // Bangun Hardware & Browser Fingerprint Deterministik (Anti-Incognito & Anti-Multi-Account)
  const signals = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth || 24,
    navigator.hardwareConcurrency || 4,
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta'
  ].join('|');

  let hash1 = 2166136261;
  for (let i = 0; i < signals.length; i++) {
    hash1 ^= signals.charCodeAt(i);
    hash1 = Math.imul(hash1, 16777619);
  }

  let hash2 = 5381;
  const extraSignals = `${signals}|${navigator.maxTouchPoints || 0}|${screen.availWidth || 0}x${screen.availHeight || 0}`;
  for (let i = 0; i < extraSignals.length; i++) {
    hash2 = ((hash2 << 5) + hash2) ^ extraSignals.charCodeAt(i);
  }

  const devId = `artadev_${(hash1 >>> 0).toString(16)}_${(hash2 >>> 0).toString(16)}`;
  localStorage.setItem('artapos_device_id', devId);
  return devId;
}

async function apiCall(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('artapos_token') || '';
  const deviceId = getClientDeviceFingerprint();
  const headers = {
    'Content-Type': 'application/json',
    'x-device-id': deviceId
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-auth-token'] = token;
  }

  const options = {
    method,
    headers
  };
  if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    options.body = JSON.stringify({ ...data, deviceId });
  }

  const urlsToTry = [endpoint];
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalHost && window.location.port !== '3000') {
    urlsToTry.push(`http://localhost:3000${endpoint}`);
    urlsToTry.push(`http://127.0.0.1:3000${endpoint}`);
  }

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, options);
      if (navigator.onLine) setNetworkOfflineState(false);
      if (res.status === 401 && endpoint !== '/api/auth/login' && endpoint !== '/api/user/me') {
        // Token tidak sah / sesi habis
        localStorage.removeItem('artapos_token');
        localStorage.removeItem('artapos_user');
        currentUser = null;
        switchView('login');
        return null;
      }
      const jsonBody = await res.json().catch(() => null);
      if (jsonBody) {
        return jsonBody;
      }
    } catch (err) { }
  }

  // Hanya tampilkan layar offline jika perangkat benar-benar tidak punya koneksi internet
  if (!navigator.onLine) {
    setNetworkOfflineState(true);
  }
  return null;
}

function formatRupiah(num) {
  return 'Rp ' + Number(num || 0).toLocaleString('id-ID');
}

// ==============================================================
// 1. VIEW ROUTER (LOCK DASHBOARD ON REFRESH)
// ==============================================================
function syncLandingAuthButtons() {
  const isLogged = Boolean(currentUser || localStorage.getItem('artapos_token'));
  const btnNavAuth = document.getElementById('btnNavAuth');
  const btnNavRegister = document.getElementById('btnNavRegister');
  const btnHeroMainCta = document.getElementById('btnHeroMainCta');
  const btnHeroMainCtaText = document.getElementById('btnHeroMainCtaText');

  if (btnNavAuth) {
    if (isLogged) {
      btnNavAuth.textContent = 'Dashboard';
      btnNavAuth.classList.add('btn-nav-dashboard-active');
      btnNavAuth.onclick = () => switchView('dashboard');
    } else {
      btnNavAuth.textContent = 'Masuk';
      btnNavAuth.classList.remove('btn-nav-dashboard-active');
      btnNavAuth.onclick = () => switchView('login');
    }
  }

  if (btnNavRegister) {
    btnNavRegister.classList.toggle('hide-on-mobile-logged-in', isLogged);
  }

  if (btnHeroMainCta) {
    if (isLogged) {
      if (btnHeroMainCtaText) btnHeroMainCtaText.textContent = 'Buka Dashboard';
      else btnHeroMainCta.textContent = 'Buka Dashboard';
      btnHeroMainCta.onclick = () => switchView('dashboard');
    } else {
      if (btnHeroMainCtaText) btnHeroMainCtaText.textContent = 'Daftar Gratis';
      else btnHeroMainCta.textContent = 'Daftar Gratis';
      btnHeroMainCta.onclick = () => openFreeRegisterModal();
    }
  }
}

function goToLandingFromDashboard() {
  toggleMobileSidebar(false);
  switchView('landing');
}

function switchView(viewName) {
  currentActiveView = viewName;

  const views = {
    'landing': document.getElementById('viewLanding'),
    'checkout': document.getElementById('viewCheckout'),
    'email-success': document.getElementById('viewSuccessEmail'),
    'login': document.getElementById('viewLogin'),
    'forgot-password': document.getElementById('viewForgotPassword'),
    'dashboard': document.getElementById('viewDashboard'),
    'error': document.getElementById('viewErrorState')
  };

  if (viewName === 'login') {
    trackCtaEvent('cta_login');
  }

  Object.values(views).forEach(v => {
    if (v) v.classList.add('hidden');
  });

  if (views[viewName]) {
    views[viewName].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  syncLandingAuthButtons();

  // Jika masuk ke dashboard, aktifkan live listeners & sinkronisasi data
  if (viewName === 'dashboard') {
    try { history.replaceState(null, '', '#dashboard'); } catch (_) {}
    switchTab(currentActiveTab || 'whatsapp');
    loadUserData();
    loadData();
    pollWhatsAppStatus();
    startLiveQuotaPolling();
  } else {
    if (viewName === 'landing' && ['#dashboard', '#login', '#checkout'].includes(window.location.hash.toLowerCase())) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (_) {}
    }
    stopLiveQuotaPolling();
  }
}

// ==============================================================
// 2. CHECKOUT & MIDTRANS FLOW (STRICT VERIFICATION & UPGRADE INSTAN)
// ==============================================================
function isLoggedInSession() {
  const token = localStorage.getItem('artapos_token');
  if (!token) return false;
  if (currentUser && currentUser.email) return true;
  try {
    const saved = JSON.parse(localStorage.getItem('artapos_user') || 'null');
    if (saved && saved.email) {
      currentUser = saved;
      return true;
    }
  } catch (e) { }
  return false;
}

function handleCheckoutBackClick() {
  if (isLoggedInSession()) {
    switchView('dashboard');
  } else {
    switchView('landing');
  }
}

function goToCheckoutStep(stepNum) {
  const s1 = document.getElementById('checkoutStep1Pane');
  const s2 = document.getElementById('checkoutStep2Pane');
  const s3 = document.getElementById('checkoutStep3Pane');
  const ind1 = document.getElementById('step1Indicator');
  const ind2 = document.getElementById('step2Indicator');
  const ind3 = document.getElementById('step3Indicator');

  // Jika sudah login (Perpanjang), lewati Langkah 2 (Isi Email)
  if (stepNum === 2 && isLoggedInSession()) {
    stepNum = 3;
  }

  if (s1) s1.classList.toggle('hidden', stepNum !== 1);
  if (s2) s2.classList.toggle('hidden', stepNum !== 2);
  if (s3) s3.classList.toggle('hidden', stepNum !== 3);

  if (ind1) ind1.classList.toggle('active', stepNum >= 1);
  if (ind2) ind2.classList.toggle('active', stepNum >= 2);
  if (ind3) ind3.classList.toggle('active', stepNum >= 3);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleStep1Next() {
  if (isLoggedInSession()) {
    goToCheckoutStep(3);
  } else {
    goToCheckoutStep(2);
  }
}

function handleStep2Next() {
  const emailInput = document.getElementById('orderEmail');
  const email = (emailInput?.value || '').trim().toLowerCase();
  if (!email || !email.endsWith('@gmail.com') || email.length < 11) {
    showAlert('Mohon masukkan email Google (@gmail.com) yang valid.', 'warning');
    if (emailInput) emailInput.focus();
    return;
  }
  const sumEmailTarget = document.getElementById('sumEmailTarget');
  if (sumEmailTarget) sumEmailTarget.textContent = email;
  goToCheckoutStep(3);
}

function openCheckout(planId = 'plus35') {
  trackCtaEvent('cta_register');
  selectCheckoutPlan(planId);
  switchView('checkout');

  const guestSection = document.getElementById('checkoutGuestInputSection');
  const loggedInBanner = document.getElementById('checkoutLoggedInBanner');
  const activeEmailEl = document.getElementById('checkoutActiveUserEmail');
  const activeAvatarEl = document.getElementById('checkoutActiveAvatar');
  const backTextEl = document.getElementById('btnCheckoutBackText');
  const orderEmailInput = document.getElementById('orderEmail');
  const orderStoreInput = document.getElementById('orderStoreName');
  const sumEmailTarget = document.getElementById('sumEmailTarget');
  const step2El = document.getElementById('step2Indicator');
  const step2Line = document.getElementById('step2Line');
  const step3Circle = document.getElementById('step3Circle');
  const step3Title = document.getElementById('checkoutStep3Title');
  const step1NextBtn = document.getElementById('btnStep1NextText');

  if (isLoggedInSession() && currentUser) {
    const userEm = currentUser.email;
    const userSt = currentUser.storeName || currentUser.store_name || 'Toko AI Assistant';

    if (guestSection) guestSection.classList.add('hidden');
    if (loggedInBanner) loggedInBanner.classList.remove('hidden');
    if (step2El) step2El.classList.add('hidden');
    if (step2Line) step2Line.classList.add('hidden');
    if (step3Circle) step3Circle.textContent = '2';
    if (step3Title) step3Title.textContent = '2. Konfirmasi & Bayar';
    if (step1NextBtn) step1NextBtn.textContent = 'Lanjut Bayar';
    if (activeEmailEl) activeEmailEl.textContent = `${userEm} (${userSt})`;
    if (activeAvatarEl) activeAvatarEl.textContent = (userEm[0] || 'A').toUpperCase();
    if (backTextEl) backTextEl.textContent = 'Kembali';

    if (orderEmailInput) orderEmailInput.value = userEm;
    if (orderStoreInput) orderStoreInput.value = userSt;
    if (sumEmailTarget) sumEmailTarget.textContent = userEm;
  } else {
    if (guestSection) guestSection.classList.remove('hidden');
    if (loggedInBanner) loggedInBanner.classList.add('hidden');
    if (step2El) step2El.classList.remove('hidden');
    if (step2Line) step2Line.classList.remove('hidden');
    if (step3Circle) step3Circle.textContent = '3';
    if (step3Title) step3Title.textContent = '3. Konfirmasi & Bayar';
    if (step1NextBtn) step1NextBtn.textContent = 'Lanjut Isi Email';
    if (backTextEl) backTextEl.textContent = 'Kembali';
  }

  goToCheckoutStep(1);
}

function selectCheckoutPlan(planId) {
  if (!ARTAPOS_PLANS[planId]) planId = 'plus35';
  currentSelectedPlan = planId;
  const plan = ARTAPOS_PLANS[planId];

  const radios = document.querySelectorAll('input[name="checkoutPlanRadio"]');
  radios.forEach(radio => {
    const parentLabel = radio.closest('.plan-option');
    if (radio.value === planId) {
      radio.checked = true;
      if (parentLabel) parentLabel.classList.add('selected');
    } else {
      radio.checked = false;
      if (parentLabel) parentLabel.classList.remove('selected');
    }
  });

  const sumPlanName = document.getElementById('sumPlanName');
  const sumPlanQuota = document.getElementById('sumPlanQuota');
  const sumTotalAmount = document.getElementById('sumTotalAmount');
  const sumInvoiceId = document.getElementById('sumInvoiceId');

  if (sumPlanName) sumPlanName.textContent = plan.name;
  if (sumPlanQuota) sumPlanQuota.textContent = `${plan.quota.toLocaleString('id-ID')} balasan / bulan`;
  if (sumTotalAmount) sumTotalAmount.textContent = formatRupiah(plan.price);
  if (sumInvoiceId) sumInvoiceId.textContent = `ARTA-${Date.now().toString().slice(-6)}`;
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'orderEmail') {
    const sumEmailTarget = document.getElementById('sumEmailTarget');
    if (sumEmailTarget) {
      sumEmailTarget.textContent = e.target.value.trim() || 'Belum diisi';
    }
  }
});

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('orderEmail');
  const storeInput = document.getElementById('orderStoreName');
  const email = (emailInput?.value || '').trim().toLowerCase();
  const storeName = (storeInput?.value || '').trim() || 'Toko AI Assistant';

  if (!email || !email.endsWith('@gmail.com') || email.length < 11) {
    alert('⚠️ Mohon gunakan alamat email Google resmi (@gmail.com). Detail akun login unik Anda akan dikirimkan ke email ini.');
    if (emailInput) emailInput.focus();
    return;
  }

  const btnPay = document.getElementById('btnPayMidtrans');
  if (btnPay) {
    btnPay.disabled = true;
    btnPay.innerHTML = '<span>Membuat Tagihan Midtrans...</span>';
  }

  try {
    const res = await apiCall('/api/payment/create-transaction', 'POST', {
      planId: currentSelectedPlan,
      email: email,
      storeName: storeName
    });

    if (btnPay) {
      btnPay.disabled = false;
      btnPay.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg><span>Bayar Sekarang (Midtrans)</span>';
    }

    if (!res || !res.success) {
      alert('Gagal membuat tagihan: ' + (res?.error || 'Koneksi ke Midtrans terganggu. Mohon coba kembali.'));
      return;
    }

    activeOrder = {
      orderId: res.orderId,
      email: email,
      planId: currentSelectedPlan,
      storeName: storeName,
      token: res.token
    };

    showWaitingPaymentUI(res.orderId);

    if (res.token && window.snap && typeof window.snap.pay === 'function') {
      triggerSnapPayment(res.token);
    } else {
      alert('Tagihan pembayaran ' + res.orderId + ' telah dibuat. Silakan lakukan pembayaran dan klik Cek Status Pembayaran.');
    }

  } catch (err) {
    if (btnPay) {
      btnPay.disabled = false;
      btnPay.innerHTML = '<span>Bayar Sekarang (Midtrans)</span>';
    }
    alert('Terjadi kesalahan: ' + err.message);
  }
}

function showWaitingPaymentUI(orderId) {
  const pendingBox = document.getElementById('checkoutPendingBox');
  const pendingOrderId = document.getElementById('pendingOrderId');
  if (pendingBox) pendingBox.classList.remove('hidden');
  if (pendingOrderId) pendingOrderId.textContent = orderId;
}

function triggerSnapPayment(token) {
  if (!token || !window.snap) return;

  window.snap.pay(token, {
    onSuccess: async function (result) {
      console.log('✅ Snap melaporkan selesai:', result);
      await checkActiveOrderPayment();
    },
    onPending: function (result) {
      console.log('⏳ Snap Pending:', result);
      alert('⏳ Tagihan berstatus Menunggu Pembayaran.\n\nSilakan scan QRIS atau transfer melalui Bank/E-Wallet Anda. Akun HANYA akan aktif setelah pembayaran terverifikasi sah oleh Midtrans.');
    },
    onError: function (result) {
      console.error('❌ Midtrans Error:', result);
      alert('Pembayaran gagal atau dibatalkan.');
    },
    onClose: function () {
      console.log('Popup ditutup oleh pengguna.');
      alert('⚠️ Jendela pembayaran ditutup. Pembayaran belum diselesaikan, sehingga akun Anda belum diaktifkan.\n\nJika Anda sudah melakukan transfer/scan QRIS, klik tombol "Cek Status Pembayaran" di bawah.');
    }
  });
}

function reopenMidtransSnap() {
  if (activeOrder && activeOrder.token) {
    triggerSnapPayment(activeOrder.token);
  } else {
    alert('Tidak ada tagihan aktif. Silakan pilih paket dan klik Bayar Sekarang.');
  }
}

// Verifikasi Resmi ke Server Midtrans
async function checkActiveOrderPayment() {
  if (!activeOrder || !activeOrder.orderId) {
    alert('Silakan buat tagihan terlebih dahulu.');
    return;
  }

  const btnCheck = document.getElementById('btnCheckVerify');
  if (btnCheck) {
    btnCheck.disabled = true;
    btnCheck.innerHTML = '<span>Memeriksa ke Server Midtrans...</span>';
  }

  try {
    const res = await apiCall('/api/payment/verify-status', 'POST', {
      orderId: activeOrder.orderId,
      email: activeOrder.email,
      planId: activeOrder.planId,
      storeName: activeOrder.storeName
    });

    if (btnCheck) {
      btnCheck.disabled = false;
      btnCheck.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg><span>Cek Status Pembayaran</span>';
    }

    if (res && res.verified && res.account) {
      // Pembayaran Sah Terverifikasi!
      const plan = ARTAPOS_PLANS[activeOrder.planId] || ARTAPOS_PLANS.plus35;
      const initialPassword = res.account.password;

      // Simpan session token yang diberikan server
      if (res.sessionToken) {
        localStorage.setItem('artapos_token', res.sessionToken);
      }

      const emailPreviewRecipient = document.getElementById('emailPreviewRecipient');
      const emailPreviewPlan = document.getElementById('emailPreviewPlan');
      const emailPreviewUser = document.getElementById('emailPreviewUser');
      const emailPreviewPassword = document.getElementById('emailPreviewPassword');
      const emailSentTime = document.getElementById('emailSentTime');

      if (emailPreviewRecipient) emailPreviewRecipient.textContent = activeOrder.email;
      if (emailPreviewPlan) emailPreviewPlan.textContent = `${plan.name} (${plan.quota.toLocaleString('id-ID')} Token / Bulan)`;
      if (emailPreviewUser) emailPreviewUser.textContent = activeOrder.email;
      if (emailPreviewPassword) emailPreviewPassword.textContent = initialPassword;
      if (emailSentTime) emailSentTime.textContent = getCurrentTime();

      localStorage.setItem('artapos_last_email', activeOrder.email);
      localStorage.setItem('artapos_last_pwd', initialPassword);

      if (isLoggedInSession()) {
        await loadUserData();
        switchView('dashboard');
        switchTab('account');
        showAlert(`🎉 Paket ${plan.name} (+${plan.quota.toLocaleString('id-ID')} Token) berhasil diaktifkan pada akun Anda!`, 'success', 'Pembayaran Berhasil!');
      } else {
        await Swal.fire({
          icon: 'success',
          title: 'Pembayaran Berhasil!',
          html: `Akun <b>${escapeHtml(activeOrder.email)}</b> sudah aktif!<br>Password login: <b>${escapeHtml(initialPassword)}</b>`,
          confirmButtonColor: '#16a34a',
          confirmButtonText: 'Lanjut Masuk',
          didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '9999999'; }
        });
        switchView('email-success');
      }
    } else {
      const statusMid = res?.status || 'pending';
      const pesan = res?.message || 'Pembayaran belum selesai. Silakan selesaikan QRIS/Transfer terlebih dahulu.';
      showAlert(`Status: [${statusMid.toUpperCase()}] — ${pesan}`, 'warning', 'Pembayaran Belum Lunas');
    }
  } catch (err) {
    if (btnCheck) {
      btnCheck.disabled = false;
      btnCheck.innerHTML = '<span>Cek Status Pembayaran</span>';
    }
    alert('Kendala memeriksa status: ' + err.message);
  }
}

// ==============================================================
// 3. SUCCESS PREVIEW & LOGIN HELPERS
// ==============================================================
function goToLoginWithEmail() {
  const lastEmail = localStorage.getItem('artapos_last_email') || '';
  const lastPwd = localStorage.getItem('artapos_last_pwd') || '';
  const loginEmail = document.getElementById('loginEmail');
  const loginPassword = document.getElementById('loginPassword');

  if (loginEmail && lastEmail) {
    loginEmail.value = lastEmail;
  }
  if (loginPassword && lastPwd) {
    loginPassword.value = lastPwd;
  }

  switchView('login');
}

function copyPasswordDefault() {
  const pwd = document.getElementById('emailPreviewPassword')?.textContent || '';
  if (!pwd) return;
  navigator.clipboard.writeText(pwd).then(() => {
    alert('✅ Password berhasil disalin ke clipboard!');
  }).catch(() => {
    alert('Password: ' + pwd);
  });
}

function fillDefaultCredentials() {
  const lastPwd = localStorage.getItem('artapos_last_pwd');
  const loginPassword = document.getElementById('loginPassword');
  if (loginPassword && lastPwd) {
    loginPassword.value = lastPwd;
    loginPassword.focus();
  }
}

function togglePasswordVisibility(fieldId) {
  const field = document.getElementById(fieldId);
  if (!field) return;
  field.type = field.type === 'password' ? 'text' : 'password';
}

// ==============================================================
// 4. AUTHENTICATION & SESSION HANDLING (ANTI BRUTE-FORCE)
// ==============================================================
async function handleLoginSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const pwdInput = document.getElementById('loginPassword');
  const btnSubmit = document.getElementById('btnLoginSubmit');

  const email = (emailInput?.value || '').trim().toLowerCase();
  const password = (pwdInput?.value || '').trim();

  if (!email || !password) {
    alert('Mohon isi email Google dan password Anda.');
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Memeriksa Akun di Cloud...</span>';
  }

  const res = await apiCall('/api/auth/login', 'POST', { email, password });

  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<span>Masuk ke Dashboard</span>';
  }

  if (res && res.success && res.token && res.user) {
    // Simpan token sesi aman & ingat email Google di perangkat
    localStorage.setItem('artapos_token', res.token);
    localStorage.setItem('artapos_user', JSON.stringify(res.user));
    localStorage.setItem('artapos_last_email', res.user.email);
    rememberDetectedGmail(res.user.email);
    currentUser = res.user;

    switchView('dashboard');
    switchTab('whatsapp');

    const remQuota = Math.max(0, Number(res.user.quota_total ?? 0) - Number(res.user.quota_used ?? 0));
    Swal.fire({
      icon: 'success',
      title: 'Berhasil Masuk Dashboard!',
      html: `Selamat datang <b>${res.user.email}</b>.<br>Kode QR WhatsApp siap dipindai • Sisa Kuota: <b>${remQuota.toLocaleString('id-ID')} Token</b>.`,
      timer: 2600,
      showConfirmButton: false,
      customClass: {
        popup: 'swal-custom-popup'
      }
    });
  } else {
    showAlert('Gagal Masuk: ' + (res?.error || 'Email atau password salah. Silakan cek kembali password di email Anda.'), 'error');
  }
}

async function handleLogout() {
  const ok = await showConfirm('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari akun artapos.id?', 'Ya, Keluar');
  if (ok) {
    await apiCall('/api/auth/logout', 'POST', {});
    currentUser = null;
    localStorage.removeItem('artapos_token');
    localStorage.removeItem('artapos_user');
    stopLiveQuotaPolling();
    switchView('landing');
    showToast('Berhasil keluar dari akun.', 'info');
  }
}

// Ambil info akun tenant dari token sesi
async function loadUserData() {
  const token = localStorage.getItem('artapos_token');
  if (!token) return;

  const res = await apiCall('/api/user/me', 'GET');
  if (res && res.authenticated && res.user) {
    currentUser = res.user;
    localStorage.setItem('artapos_user', JSON.stringify(currentUser));
    updateUserDashboardUI(currentUser);
    loadReferralStatus();
    loadUserActivityLogs();
  }
}

function updateUserDashboardUI(user) {
  if (!user) return;

  const sidebarPlanBadge = document.getElementById('sidebarPlanBadge');
  const sidebarUserEmail = document.getElementById('sidebarUserEmail');
  const sidebarUserRoleText = document.getElementById('sidebarUserRoleText');
  const sidebarAvatar = document.getElementById('sidebarAvatar');
  if (sidebarUserRoleText) {
    sidebarUserRoleText.textContent = user.role === 'superadmin' ? '👑 Super Admin' : 'Pelanggan Aktif';
  }
  syncLandingAuthButtons();

  const topbarQuotaCount = document.getElementById('topbarQuotaCount');
  const topbarQuotaTotal = document.getElementById('topbarQuotaTotal');

  const dashPlanBadgeActive = document.getElementById('dashPlanBadgeActive');
  const dashQuotaUsed = document.getElementById('dashQuotaUsed');
  const dashQuotaMax = document.getElementById('dashQuotaMax');
  const dashQuotaRemaining = document.getElementById('dashQuotaRemaining');
  const dashQuotaProgressFill = document.getElementById('dashQuotaProgressFill');
  const dashActiveUntil = document.getElementById('dashActiveUntil');

  const profCurrentEmail = document.getElementById('profCurrentEmail');

  const quotaTotal = Number(user.quota_total) ?? 75;
  const isExpired = Boolean(user.isExpired) || (user.role !== 'superadmin' && user.active_until && new Date(user.active_until) < new Date());
  const quotaUsed = isExpired ? quotaTotal : (Number(user.quota_used) || 0);
  const quotaRemaining = isExpired ? 0 : (user.remaining !== undefined ? Number(user.remaining) : Math.max(0, quotaTotal - quotaUsed));
  const percentage = quotaTotal > 0 ? Math.min(100, Math.round((quotaUsed / quotaTotal) * 100)) : 100;

  if (sidebarPlanBadge) sidebarPlanBadge.textContent = user.plan || 'Paket Bisnis';
  if (sidebarUserEmail) sidebarUserEmail.textContent = user.email || 'user@gmail.com';
  if (sidebarAvatar) sidebarAvatar.textContent = (user.email ? user.email[0] : 'G').toUpperCase();

  // Handle Role Super Admin (Tampilkan Grup Menu Super Admin di Sidebar Kiri)
  const navSuperAdminBtn = document.getElementById('navSuperAdminBtn');
  const sidebarSuperAdminGroup = document.getElementById('sidebarSuperAdminGroup');
  const sidebarUserRole = document.querySelector('.user-role-text');
  if (user.role === 'superadmin') {
    if (navSuperAdminBtn) navSuperAdminBtn.classList.remove('hidden');
    if (sidebarSuperAdminGroup) sidebarSuperAdminGroup.classList.remove('hidden');
    if (sidebarUserRole) sidebarUserRole.textContent = '👑 Super Admin';
  } else {
    if (navSuperAdminBtn) navSuperAdminBtn.classList.add('hidden');
    if (sidebarSuperAdminGroup) sidebarSuperAdminGroup.classList.add('hidden');
    if (sidebarUserRole) sidebarUserRole.textContent = 'Pelanggan Aktif';
  }

  if (topbarQuotaCount) topbarQuotaCount.textContent = quotaRemaining.toLocaleString('id-ID');
  if (topbarQuotaTotal) topbarQuotaTotal.textContent = quotaTotal.toLocaleString('id-ID');

  if (dashPlanBadgeActive) dashPlanBadgeActive.textContent = user.plan || 'Paket Bisnis';
  if (dashQuotaUsed) dashQuotaUsed.textContent = quotaUsed.toLocaleString('id-ID');
  if (dashQuotaMax) dashQuotaMax.textContent = quotaTotal.toLocaleString('id-ID');
  if (dashQuotaRemaining) dashQuotaRemaining.textContent = quotaRemaining.toLocaleString('id-ID');
  if (dashQuotaProgressFill) dashQuotaProgressFill.style.width = `${percentage}%`;

  if (dashActiveUntil) {
    if (isExpired) {
      dashActiveUntil.innerHTML = `<span style="color:#dc2626; font-weight:800;">🔴 Kedaluwarsa (Sisa Token Hangus)</span>`;
    } else if (user.active_until) {
      const d = new Date(user.active_until);
      dashActiveUntil.textContent = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      dashActiveUntil.textContent = '30 Hari Kedepan';
    }
  }

  // Banner Klaim 75 Token Gratis (hanya tampil jika akun baru belum pernah klaim & kuota masih 0)
  const claimBanner = document.getElementById('freeClaimBanner');
  if (claimBanner) {
    if (user.role !== 'superadmin' && !user.free_claimed && quotaTotal === 0) {
      claimBanner.classList.remove('hidden');
    } else {
      claimBanner.classList.add('hidden');
    }
  }

  // Sinkronkan Saklar Bot ON/OFF
  applyBotSwitchUI(user.bot_enabled !== false);
  updateTeachImageQuotaUI(user);

  if (profCurrentEmail) profCurrentEmail.value = user.email || '';
}

// ==============================================================
// 5. STREAM PEMOTONGAN KUOTA REAL-TIME (TANPA REFRESH)
// ==============================================================
function startLiveQuotaPolling() {
  if (quotaLiveTimer) clearInterval(quotaLiveTimer);

  // Poll status kuota setiap 2.5 detik untuk deteksi chat masuk seketika
  quotaLiveTimer = setInterval(async () => {
    if (currentActiveView !== 'dashboard') return;

    const data = await apiCall('/api/user/quota-live', 'GET');
    if (!data) return;

    const quotaTotal = Number(data.quota_total) ?? 75;
    const isExpired = Boolean(data.isExpired);
    const quotaUsed = isExpired ? quotaTotal : (Number(data.quota_used) || 0);
    const remaining = isExpired ? 0 : Number(data.remaining ?? 0);

    // Jika terjadi pengurangan kuota (ada chat WhatsApp yang dibalas AI)
    if (lastKnownQuotaRemaining !== null && remaining < lastKnownQuotaRemaining) {
      flashQuotaUpdate();
    }
    lastKnownQuotaRemaining = remaining;

    const topbarQuotaCount = document.getElementById('topbarQuotaCount');
    const topbarQuotaTotal = document.getElementById('topbarQuotaTotal');
    const dashQuotaUsed = document.getElementById('dashQuotaUsed');
    const dashQuotaRemaining = document.getElementById('dashQuotaRemaining');
    const dashQuotaProgressFill = document.getElementById('dashQuotaProgressFill');

    if (topbarQuotaCount) topbarQuotaCount.textContent = remaining.toLocaleString('id-ID');
    if (topbarQuotaTotal) topbarQuotaTotal.textContent = quotaTotal.toLocaleString('id-ID');
    if (dashQuotaUsed) dashQuotaUsed.textContent = quotaUsed.toLocaleString('id-ID');
    if (dashQuotaRemaining) dashQuotaRemaining.textContent = remaining.toLocaleString('id-ID');

    const percentage = Math.min(100, Math.round((quotaUsed / quotaTotal) * 100));
    if (dashQuotaProgressFill) dashQuotaProgressFill.style.width = `${percentage}%`;

  }, 2500);
}

function stopLiveQuotaPolling() {
  if (quotaLiveTimer) {
    clearInterval(quotaLiveTimer);
    quotaLiveTimer = null;
  }
}

function flashQuotaUpdate() {
  const badge = document.getElementById('topbarQuotaBadge');
  if (badge) {
    badge.style.transform = 'scale(1.08)';
    badge.style.borderColor = '#16a34a';
    setTimeout(() => {
      badge.style.transform = 'scale(1)';
      badge.style.borderColor = '';
    }, 400);
  }
}

// Update Profil (Ganti Gmail & Password Baru)
async function handleUpdateProfile(e) {
  e.preventDefault();
  const newEmailInput = document.getElementById('profNewEmail');
  const newPwdInput = document.getElementById('profNewPassword');
  const btn = document.getElementById('btnUpdateProfile');

  const newEmail = (newEmailInput?.value || '').trim().toLowerCase();
  const newPassword = (newPwdInput?.value || '').trim();

  if (!newEmail && !newPassword) {
    alert('Silakan masukkan email Google baru atau password baru.');
    return;
  }

  if (newEmail && !newEmail.endsWith('@gmail.com')) {
    alert('Email baru harus menggunakan format @gmail.com.');
    return;
  }

  if (newPassword && newPassword.length < 6) {
    alert('Password baru minimal 6 karakter.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Menyimpan ke Cloud...</span>';
  }

  const res = await apiCall('/api/user/update-profile', 'POST', {
    newEmail,
    newPassword
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Simpan Perubahan Akun</span>';
  }

  if (res && res.success) {
    alert('✅ Akun berhasil diperbarui di Cloud!');
    if (newEmail) {
      currentUser.email = newEmail;
      localStorage.setItem('artapos_last_email', newEmail);
    }
    updateUserDashboardUI(currentUser);
    if (newEmailInput) newEmailInput.value = '';
    if (newPwdInput) newPwdInput.value = '';
  } else {
    alert('Gagal update akun: ' + (res?.error || 'Kesalahan sistem.'));
  }
}

// ==============================================================
// 6. DASHBOARD TABS NAVIGATION & MOBILE SIDEBAR
// ==============================================================
function toggleMobileSidebar(open) {
  const sidebar = document.querySelector('.saas-sidebar');
  const overlay = document.getElementById('dashboardOverlay');
  if (!sidebar) return;

  if (open === undefined) {
    const isOpen = sidebar.classList.toggle('sidebar-open');
    if (overlay) {
      overlay.classList.toggle('active', isOpen);
      overlay.classList.toggle('hidden', !isOpen);
    }
  } else if (open) {
    sidebar.classList.add('sidebar-open');
    if (overlay) {
      overlay.classList.add('active');
      overlay.classList.remove('hidden');
    }
  } else {
    sidebar.classList.remove('sidebar-open');
    if (overlay) {
      overlay.classList.remove('active');
      overlay.classList.add('hidden');
    }
  }
}

function switchTab(tabName) {
  // Proteksi 403 di sisi Client: Jika bukan Super Admin mencoba buka tab Super Admin
  if (tabName === 'superadmin' && currentUser && currentUser.role !== 'superadmin') {
    showErrorStateView(
      403,
      'Halaman Super Admin Monitoring hanya dapat diakses oleh Administrator Pusat artapos.id.',
      '/#superadmin (403 Forbidden - Role Unauthorized)'
    );
    return;
  }

  currentActiveTab = tabName;

  // Tutup sidebar mobile otomatis saat memilih tab di layar HP
  toggleMobileSidebar(false);

  const tabs = {
    'whatsapp': document.getElementById('tabWa'),
    'admin': document.getElementById('tabAdmin'),
    'chat': document.getElementById('tabChat'),
    'inventory': document.getElementById('tabInventory'),
    'storeOrders': document.getElementById('tabStoreOrders'),
    'settings': document.getElementById('tabSettings'),
    'account': document.getElementById('tabAccount'),
    'superadmin': document.getElementById('tabSuperAdmin')
  };

  const buttons = {
    'whatsapp': document.getElementById('navWaBtn'),
    'admin': document.getElementById('navAdminBtn'),
    'chat': document.getElementById('navChatBtn'),
    'inventory': document.getElementById('navInventoryBtn'),
    'storeOrders': document.getElementById('navStoreOrdersBtn'),
    'settings': document.getElementById('navSettingsBtn'),
    'account': document.getElementById('navAccountBtn'),
    'superadmin': document.getElementById('navSuperAdminBtn')
  };

  const titles = {
    'whatsapp': { title: 'Koneksi WhatsApp & Kode QR', category: 'WhatsApp Gateway' },
    'admin': { title: 'Knowledge Base & Jawaban Bot (CRUD)', category: 'Manajemen Data' },
    'chat': { title: 'Simulator Web Chat (Testing)', category: 'Uji Coba Sistem' },
    'inventory': { title: 'Inventory & Produk Toko (Live AI)', category: 'Manajemen Stok' },
    'storeOrders': { title: 'Order & Invoice Pelanggan', category: 'Transaksi Toko' },
    'settings': { title: 'Pengaturan Profil Toko', category: 'Konfigurasi' },
    'account': { title: 'Token & Pengaturan Akun', category: 'Langganan' },
    'superadmin': { title: 'Super Admin Monitoring', category: 'Administrator Pusat' }
  };

  Object.keys(tabs).forEach(k => {
    if (tabs[k]) tabs[k].classList.add('hidden');
    if (buttons[k]) buttons[k].classList.remove('active');
  });

  if (tabName !== 'superadmin') {
    ['navSaTrafficBtn', 'navSaUsersBtn', 'navSaNotifBtn', 'navSaKnowledgeBtn', 'navSaOrdersBtn', 'navSaPlansBtn', 'navSaPwdBtn'].forEach(id => {
      document.getElementById(id)?.classList.remove('active');
    });
  }

  if (tabs[tabName]) tabs[tabName].classList.remove('hidden');
  if (buttons[tabName]) buttons[tabName].classList.add('active');

  const topTitle = document.getElementById('topbarTitle');
  const topCategory = document.getElementById('topbarCategory');
  if (topTitle && titles[tabName]) topTitle.textContent = titles[tabName].title;
  if (topCategory && titles[tabName]) topCategory.textContent = titles[tabName].category;

  if (tabName === 'account') loadUserData();
  if (tabName === 'inventory') loadInventoryProducts();
  if (tabName === 'storeOrders') loadStoreOrders();
  if (tabName === 'superadmin') {
    switchAdminSection(currentAdminSection || 'traffic');
    loadAdminData();
    startAdminRealtimeMonitor();
  } else {
    stopAdminRealtimeMonitor();
  }
}

function openSuperAdminPage(sectionKey = 'traffic') {
  currentAdminSection = sectionKey;
  if (currentActiveTab !== 'superadmin') {
    switchTab('superadmin');
  }
  switchAdminSection(sectionKey);
}

// ==============================================================
// 7. WHATSAPP GATEWAY (PER-USER STATUS)
// ==============================================================
let isWaPolling = false;
let waPollTimeout = null;

function scheduleNextWaPoll() {
  if (waPollTimeout) clearTimeout(waPollTimeout);
  const delay = currentWaStatus === 'connected' ? 8000 : 1000;
  waPollTimeout = setTimeout(() => {
    pollWhatsAppStatus();
  }, delay);
}

async function pollWhatsAppStatus() {
  if (currentActiveView !== 'dashboard' || !localStorage.getItem('artapos_token')) {
    scheduleNextWaPoll();
    return;
  }
  if (simulatedConnected) {
    setWaConnectedView('+62 819-4922-3100');
    scheduleNextWaPoll();
    return;
  }
  if (isWaPolling) return;
  isWaPolling = true;

  try {
    const prevStatus = currentWaStatus;
    const data = await apiCall('/api/whatsapp/status', 'GET');
    if (!data) return;

    currentWaStatus = data.status;

    if (data.status === 'locked_unclaimed') {
      const viewConnected = document.getElementById('viewWaConnected');
      const viewScan = document.getElementById('viewWaScan');
      const qrImg = document.getElementById('waQrImage');
      const qrLoading = document.getElementById('qrLoadingState');
      const qrStatusText = document.getElementById('qrStatusText');
      if (viewConnected) viewConnected.classList.add('hidden');
      if (viewScan) viewScan.classList.remove('hidden');
      if (qrImg) qrImg.classList.add('hidden');
      if (qrLoading) qrLoading.classList.add('hidden');
      if (qrStatusText) qrStatusText.textContent = '🔒 Klaim 75 Token Gratis di banner atas (atau pilih paket) dulu untuk membuka QR WhatsApp!';
    } else if (data.status === 'connected') {
      const cleanPhone = data.phone ? (String(data.phone).startsWith('+') ? String(data.phone) : `+${data.phone}`) : 'Terhubung';
      setWaConnectedView(cleanPhone);
      if (prevStatus && prevStatus !== 'connected') {
        showToast('⚡ WhatsApp Berhasil Terhubung!', 'success');
      }
    } else if (data.status === 'scan_qr' && data.qr) {
      setWaScanView(data.qr);
    } else {
      setWaConnectingView();
    }

    if (typeof data.botEnabled === 'boolean' && (Date.now() - lastBotToggleAt > 3500)) {
      applyBotSwitchUI(data.botEnabled);
    }

    if (data.botName) {
      const simName = document.getElementById('simStoreName');
      const simAvatar = document.getElementById('simAvatarLetter');
      if (simName) simName.textContent = data.botName;
      if (simAvatar) simAvatar.textContent = (data.botName[0] || 'T').toUpperCase();
    }
  } finally {
    isWaPolling = false;
    scheduleNextWaPoll();
  }
}

function setWaConnectedView(phoneText) {
  const viewConnected = document.getElementById('viewWaConnected');
  const viewScan = document.getElementById('viewWaScan');
  const heroPhone = document.getElementById('heroPhoneDisplay');
  const topbarPill = document.getElementById('topbarStatusPill');
  const topbarDot = document.getElementById('topbarDotStatus');
  const topbarText = document.getElementById('topbarStatusText');
  const navWaBadge = document.getElementById('navWaBadge');

  if (viewConnected) viewConnected.classList.remove('hidden');
  if (viewScan) viewScan.classList.add('hidden');
  if (heroPhone) heroPhone.textContent = phoneText;

  if (topbarPill) topbarPill.className = 'status-pill-badge connected';
  if (topbarDot) topbarDot.className = 'dot-indicator green';
  if (topbarText) topbarText.textContent = `Online • ${phoneText}`;

  if (navWaBadge) {
    navWaBadge.className = 'badge-nav badge-nav-emerald';
    navWaBadge.textContent = 'Online';
  }
}

function setWaScanView(qrDataUrl) {
  const viewConnected = document.getElementById('viewWaConnected');
  const viewScan = document.getElementById('viewWaScan');
  const qrImg = document.getElementById('waQrImage');
  const qrLoading = document.getElementById('qrLoadingState');
  const qrStatusText = document.getElementById('qrStatusText');
  const topbarPill = document.getElementById('topbarStatusPill');
  const topbarDot = document.getElementById('topbarDotStatus');
  const topbarText = document.getElementById('topbarStatusText');
  const navWaBadge = document.getElementById('navWaBadge');

  if (viewConnected) viewConnected.classList.add('hidden');
  if (viewScan) viewScan.classList.remove('hidden');

  if (qrLoading) qrLoading.classList.add('hidden');
  if (qrImg) {
    qrImg.classList.remove('hidden');
    qrImg.src = qrDataUrl;
  }
  if (qrStatusText) qrStatusText.textContent = '🟢 QR Live • Auto-detect saat discan di HP';

  if (topbarPill) topbarPill.className = 'status-pill-badge scan_qr';
  if (topbarDot) topbarDot.className = 'dot-indicator yellow';
  if (topbarText) topbarText.textContent = 'Menunggu Scan QR';

  if (navWaBadge) {
    navWaBadge.className = 'badge-nav badge-nav-warning';
    navWaBadge.textContent = 'Scan QR';
  }
}

function setWaConnectingView() {
  const viewConnected = document.getElementById('viewWaConnected');
  const viewScan = document.getElementById('viewWaScan');
  const qrImg = document.getElementById('waQrImage');
  const qrLoading = document.getElementById('qrLoadingState');
  const qrStatusText = document.getElementById('qrStatusText');
  const topbarPill = document.getElementById('topbarStatusPill');
  const topbarDot = document.getElementById('topbarDotStatus');
  const topbarText = document.getElementById('topbarStatusText');
  const navWaBadge = document.getElementById('navWaBadge');

  if (viewConnected) viewConnected.classList.add('hidden');
  if (viewScan) viewScan.classList.remove('hidden');

  if (qrImg) qrImg.classList.add('hidden');
  if (qrLoading) qrLoading.classList.remove('hidden');
  if (qrStatusText) qrStatusText.textContent = '⚪ Menghubungkan ke WhatsApp socket...';

  if (topbarPill) topbarPill.className = 'status-pill-badge connecting';
  if (topbarDot) topbarDot.className = 'dot-indicator gray';
  if (topbarText) topbarText.textContent = 'Menghubungkan...';

  if (navWaBadge) {
    navWaBadge.className = 'badge-nav badge-nav-neutral';
    navWaBadge.textContent = 'Loading';
  }
}

async function simulateWaConnected() {
  showToast('Menghubungkan nomor bisnis...', 'info');
  const res = await apiCall('/api/whatsapp/simulate-connect', 'POST', {});
  if (res && res.success) {
    setWaConnectedView(res.phone || '+62 819-4922-3100');
    showToast('⚡ WhatsApp Bisnis Berhasil Terhubung!', 'success');
  } else {
    showAlert('Gagal menghubungkan WhatsApp: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

async function logoutWhatsApp() {
  const ok = await showConfirm('Putus Tautan WhatsApp', 'Putuskan tautan nomor WhatsApp saat ini? Kode QR baru akan dibuat.', 'Ya, Putuskan');
  if (!ok) return;

  const res = await apiCall('/api/whatsapp/logout', 'POST', {});
  if (res && res.success) {
    showAlert('Tautan WhatsApp berhasil diputuskan. Kode QR baru siap discan.', 'success');
    pollWhatsAppStatus();
  }
}

// ==============================================================
// 8. MULTI-TENANT KNOWLEDGE BASE CRUD (ISOLASI DATA PER AKUN)
// ==============================================================
async function loadData(showToastMsg = false) {
  try {
    const list = await apiCall('/api/knowledge', 'GET');
    if (Array.isArray(list)) {
      knowledgeData = list;
      try { localStorage.setItem('artapos_cached_knowledge', JSON.stringify(list)); } catch (e) { }
    } else {
      // Fallback ke cache lokal jika sedang Offline
      try {
        const cached = JSON.parse(localStorage.getItem('artapos_cached_knowledge') || '[]');
        knowledgeData = Array.isArray(cached) ? cached : [];
      } catch (e) {
        knowledgeData = [];
      }
    }
    renderKnowledgeList(knowledgeData);

    const badge = document.getElementById('navKnowledgeBadge');
    const totalCount = document.getElementById('totalKnowledgeCount');
    const kQuotaBadge = document.getElementById('knowledgeQuotaBadge');
    if (badge) badge.textContent = knowledgeData.length;
    if (totalCount) totalCount.textContent = knowledgeData.length;
    if (kQuotaBadge && currentUser) {
      const kLim = Number(currentUser.knowledge_limit || 10);
      kQuotaBadge.textContent = kLim >= 9999 ? `${knowledgeData.length} / Unlimited` : `${knowledgeData.length}/${kLim} Slot`;
    }

    // Muat Konfigurasi Toko milik akun ini
    const cfg = await apiCall('/api/config', 'GET');
    if (cfg && !cfg.error) {
      const inputName = document.getElementById('inputStoreName');
      const inputOwner = document.getElementById('inputOwnerNumber');
      if (inputName && cfg.name) inputName.value = cfg.name;
      if (inputOwner && cfg.ownerNumber) inputOwner.value = cfg.ownerNumber;
    }

    if (showToastMsg) {
      alert('✅ Data Cloud akun Anda berhasil disinkronkan!');
    }
  } catch (err) {
    console.error('Error loadData:', err);
    knowledgeData = [];
    renderKnowledgeList(knowledgeData);
  }
}

function renderKnowledgeList(items) {
  const container = document.getElementById('knowledgeListContainer');
  if (!container) return;

  const searchQuery = (document.getElementById('searchKnowledgeInput')?.value || '').trim();

  if (!items || items.length === 0) {
    if (searchQuery) {
      container.innerHTML = `
        <div class="visual-empty-state-card">
          <div class="ves-icon-badge warn">🔍</div>
          <div class="ves-title">Pencarian Tidak Ditemukan</div>
          <div class="ves-desc">Tidak ada soal atau jawaban bot yang cocok dengan kata kunci <strong>"${escapeHtml(searchQuery)}"</strong>.</div>
          <button type="button" class="ves-btn" onclick="document.getElementById('searchKnowledgeInput').value=''; filterKnowledgeList();">🔄 Reset Pencarian</button>
        </div>
      `;
    } else if (isNetworkOffline) {
      container.innerHTML = `
        <div class="visual-empty-state-card">
          <div class="ves-icon-badge offline">📡</div>
          <div class="ves-title">Mode Offline — Data Belum Tersedia</div>
          <div class="ves-desc">Perangkat sedang terputus dari server dan belum ada data pengetahuan tersimpan di perangkat ini.</div>
          <button type="button" class="ves-btn" onclick="retryNetworkConnection()">🔄 Coba Hubungkan Ulang</button>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="visual-empty-state-card">
          <div class="ves-icon-badge">📭</div>
          <div class="ves-title">Belum Ada Data Pengetahuan (Soal & Jawaban)</div>
          <div class="ves-desc">Database balasan otomatis toko Anda masih kosong. Silakan tambahkan pertanyaan pelanggan dan jawaban bot pada formulir di atas.</div>
          <button type="button" class="ves-btn" onclick="document.getElementById('teachQuestions')?.focus()">➕ Tambah Soal Pertama Sekarang</button>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = items.map(item => {
    const qList = Array.isArray(item.questions) ? item.questions : [item.questions || ''];
    const kwList = Array.isArray(item.keywords) ? item.keywords : [item.keywords || ''];
    const displayQuestion = qList[0] || 'Pertanyaan';
    const displayKw = kwList.filter(Boolean).join(', ');

    return `
      <div class="k-item-card" id="k-item-${item.id}">
        <div class="k-item-main">
          <span class="k-category-pill">${escapeHtml(item.category || 'umum')}</span>
          <div class="k-question-text">❓ ${escapeHtml(displayQuestion)}</div>
          <div class="k-answer-text">💡 ${escapeHtml(item.answer)}</div>
          ${item.image_url ? `<div class="k-item-img-wrap"><img src="${escapeHtml(item.image_url)}" alt="Gambar" class="k-item-thumb"></div>` : ''}
          <div class="k-keywords-meta">🏷️ Kata Kunci: ${escapeHtml(displayKw)}</div>
        </div>
        <div class="k-item-actions">
          <button class="btn-action-edit" onclick="startEditKnowledge(${item.id})">✏️ Edit</button>
          <button class="btn-action-delete" onclick="deleteKnowledge(${item.id})">Hapus ✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function filterKnowledgeList() {
  const query = (document.getElementById('searchKnowledgeInput')?.value || '').toLowerCase().trim();
  if (!query) {
    renderKnowledgeList(knowledgeData);
    return;
  }

  const filtered = knowledgeData.filter(item => {
    const qStr = (Array.isArray(item.questions) ? item.questions.join(' ') : (item.questions || '')).toLowerCase();
    const ansStr = (item.answer || '').toLowerCase();
    const kwStr = (Array.isArray(item.keywords) ? item.keywords.join(' ') : (item.keywords || '')).toLowerCase();
    return qStr.includes(query) || ansStr.includes(query) || kwStr.includes(query);
  });

  renderKnowledgeList(filtered);
}

async function handleTeachSubmit(e) {
  e.preventDefault();
  const editId = document.getElementById('editItemId')?.value;
  const category = document.getElementById('teachCategory')?.value;
  const keywordsStr = document.getElementById('teachKeywords')?.value || '';
  const questionsStr = document.getElementById('teachQuestions')?.value || '';
  const answer = document.getElementById('teachAnswer')?.value || '';
  const image_url = (document.getElementById('teachImageUrl')?.value || '').trim() || null;

  if (keywordsStr.length > 100) { showAlert('Kata kunci maksimal 100 karakter.', 'warning'); return; }
  if (questionsStr.length > 100) { showAlert('Contoh pertanyaan maksimal 100 karakter.', 'warning'); return; }
  if (answer.length > 250) { showAlert('Jawaban bot maksimal 250 karakter.', 'warning'); return; }
  if (hasForbiddenFilePattern(keywordsStr) || hasForbiddenFilePattern(questionsStr) || hasForbiddenFilePattern(answer)) {
    showAlert('⛔ Input tidak boleh mengandung file/skrip terlarang (.php, .html, <, >).', 'error');
    return;
  }

  const questions = questionsStr.split('\n').map(s => s.trim()).filter(Boolean);
  const keywords = keywordsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  if (questions.length === 0 || !answer) {
    showAlert('Pertanyaan dan jawaban bot wajib diisi.', 'warning');
    return;
  }

  const payload = { questions, keywords, answer, category, image_url };

  if (editId) {
    payload.id = editId;
    const res = await apiCall('/api/knowledge', 'PUT', payload);
    if (res && res.success) {
      showToast('✅ Pengetahuan berhasil diperbarui!', 'success');
      cancelEditMode();
      await loadData();
      loadUserData();
    } else {
      showAlert('Gagal update: ' + (res?.error || 'Kesalahan sistem'), 'error');
    }
  } else {
    const res = await apiCall('/api/knowledge', 'POST', payload);
    if (res && res.success) {
      showToast('✅ Pengetahuan baru berhasil disimpan!', 'success');
      document.getElementById('teachForm')?.reset();
      clearTeachImage();
      updateTeachCharCounters();
      await loadData();
      loadUserData();
    } else {
      showAlert('Gagal simpan: ' + (res?.error || 'Kesalahan sistem'), 'error');
    }
  }
}

function startEditKnowledge(id) {
  const item = knowledgeData.find(k => k.id == id);
  if (!item) return;

  const editInput = document.getElementById('editItemId');
  const formTitle = document.getElementById('formKnowledgeTitle');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnCancel = document.getElementById('btnCancelEdit');

  const catSelect = document.getElementById('teachCategory');
  const kwInput = document.getElementById('teachKeywords');
  const qInput = document.getElementById('teachQuestions');
  const ansInput = document.getElementById('teachAnswer');

  if (editInput) editInput.value = item.id;
  if (formTitle) formTitle.textContent = `✏️ Edit Pengetahuan (ID: ${item.id})`;
  if (btnSubmitText) btnSubmitText.textContent = 'Simpan Perubahan ke Cloud';
  if (btnCancel) btnCancel.classList.remove('hidden');

  if (catSelect) catSelect.value = item.category || 'produk';
  if (kwInput) kwInput.value = Array.isArray(item.keywords) ? item.keywords.join(', ') : (item.keywords || '');
  if (qInput) qInput.value = Array.isArray(item.questions) ? item.questions.join('\n') : (item.questions || '');
  if (ansInput) ansInput.value = item.answer || '';

  if (item.image_url) {
    setTeachImagePreview(item.image_url);
  } else {
    clearTeachImage();
  }
  updateTeachCharCounters();
  document.getElementById('teachForm')?.scrollIntoView({ behavior: 'smooth' });
}

function cancelEditMode() {
  const editInput = document.getElementById('editItemId');
  const formTitle = document.getElementById('formKnowledgeTitle');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnCancel = document.getElementById('btnCancelEdit');

  if (editInput) editInput.value = '';
  if (formTitle) formTitle.textContent = '➕ Tambah Pengetahuan Baru Toko';
  if (btnSubmitText) btnSubmitText.textContent = 'Simpan Pengetahuan ke Cloud';
  if (btnCancel) btnCancel.classList.add('hidden');

  document.getElementById('teachForm')?.reset();
  clearTeachImage();
  updateTeachCharCounters();
}

async function deleteKnowledge(id) {
  const ok = await showConfirm('Hapus Pengetahuan', 'Hapus pertanyaan ini dari database toko Anda?', 'Ya, Hapus');
  if (!ok) return;

  const res = await apiCall('/api/knowledge', 'DELETE', { id });
  if (res && res.success) {
    showToast('Item berhasil dihapus dari Cloud.', 'success');
    loadData();
  } else {
    showAlert('Gagal menghapus: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

// ==============================================================
// 9. SIMULATOR WEB CHAT
// ==============================================================
function normalizeText(text) {
  let cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(' ').map(w => ABBREVIATIONS[w] || w);
  return words.join(' ');
}

function findBestAnswer(userMessage) {
  const normUser = normalizeText(userMessage);
  const userWords = normUser.split(' ').filter(w => w.length > 1);

  let bestMatch = null;
  let highestScore = 0;

  for (const item of knowledgeData) {
    let score = 0;
    const keywords = Array.isArray(item.keywords) ? item.keywords : [];
    for (const kw of keywords) {
      const cleanKw = normalizeText(kw);
      if (normUser.includes(cleanKw)) score += 3;
    }

    const questions = Array.isArray(item.questions) ? item.questions : [];
    for (const q of questions) {
      const normQ = normalizeText(q);
      if (normUser === normQ) score += 10;
      else if (normUser.includes(normQ) || normQ.includes(normUser)) score += 5;

      const qWords = normQ.split(' ').filter(w => w.length > 1);
      for (const uw of userWords) {
        if (qWords.includes(uw)) score += 1;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  }

  if (bestMatch && highestScore >= 2) {
    return { found: true, answer: bestMatch.answer, score: highestScore };
  }

  return {
    found: false,
    answer: "Maaf kak, saat ini pertanyaan tersebut belum ada di database kami. Silakan hubungi admin toko ya kak! 🙏",
    score: highestScore
  };
}

function getCurrentTime() {
  const now = new Date();
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

function appendMessage(text, isOutgoing = false) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `msg-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`;

  const formattedText = escapeHtml(text).replace(/\n/g, '<br>');
  msgDiv.innerHTML = `<p>${formattedText}</p><span class="msg-timestamp">${getCurrentTime()}</span>`;

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

async function handleUserSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const query = (input?.value || '').trim();
  if (!query) return;

  if (isMaliciousClientInput(query)) {
    showAlert('🛡️ Proteksi Keamanan: Pesan mengandung skrip terlarang (.php / XSS / SQL Injection) dan telah diblokir!', 'error');
    return;
  }

  appendMessage(query, true);
  if (input) input.value = '';

  // Simulator Web Chat menguji otak AI sesuai paket (TIDAK MEMOTONG KUOTA)
  try {
    const res = await apiCall('/api/ai/reply', 'POST', { message: query, isSimulator: true });
    if (res && res.success && res.found && res.answer) {
      appendMessage(res.answer, false);
      if (res.createdOrder) {
        showToast(`Invoice ${res.createdOrder.invoice_no} berhasil dibuat di Order & Invoice!`, 'success');
      }
      return;
    }
  } catch (_) {}

  setTimeout(() => {
    const result = findBestAnswer(query);
    const rawAns = String(result.answer || '').trim();
    const planLower = String(currentUser?.plan || '').toLowerCase();
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
    appendMessage(finalReplyText, false);
  }, 250);
}

function askQuick(text) {
  const input = document.getElementById('chatInput');
  if (input) {
    input.value = text;
    document.getElementById('chatForm')?.dispatchEvent(new Event('submit'));
  }
}

// ==============================================================
// 9B. INVENTORY PRODUK & ORDER/INVOICE TERHUBUNG AI
// ==============================================================
let inventoryProductsCache = [];
let storeOrdersCache = [];

const CLIENT_FORBIDDEN_INV_PATTERN = /(<[^>]*>|<\?php|<\?=|\.(php|phtml|html|htm|js|jsx|ts|tsx|sh|bash|exe|bat|cmd|py|pl|cgi|asp|aspx|jsp|env|sql|htaccess)\b|javascript:|vbscript:|data:text\/html|on(load|error|click|mouseover|submit|focus)=|\.\.\/|\.\.\\|\b(union\s+select|drop\s+table|delete\s+from|insert\s+into)\b)/i;

async function loadInventoryProducts() {
  const locked = document.getElementById('inventoryLockedBanner');
  const content = document.getElementById('inventoryContentArea');
  const badge = document.getElementById('inventoryAiTierBadge');
  const quotaBadge = document.getElementById('inventoryQuotaBadge');
  const res = await apiCall('/api/products', 'GET');
  if (!res || !res.success) return;

  const used = Number(res.inventoryUsed ?? (res.products || []).length);
  const limit = Number(res.inventoryLimit ?? 0);
  if (quotaBadge) quotaBadge.textContent = `${used}/${limit} Produk`;
  if (badge) badge.textContent = getAiTierDisplayLabel(res.aiTier);

  if (!res.unlocked || limit <= 0) {
    if (locked) locked.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    return;
  }
  if (locked) locked.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  inventoryProductsCache = res.products || [];
  renderInventoryProducts(inventoryProductsCache);
}

function renderInventoryProducts(products) {
  const list = document.getElementById('inventoryListContainer');
  const countEl = document.getElementById('totalProductsCount');
  if (countEl) countEl.textContent = String(products.length);
  if (!list) return;

  if (products.length === 0) {
    list.innerHTML = `<div class="loading-state-box">Belum ada produk di Inventory. Tambahkan produk pertama Anda di atas (murni teks &amp; angka, tanpa foto/file).</div>`;
    return;
  }

  list.innerHTML = products.map(p => {
    const stock = Number(p.stock || 0);
    const stockBadge = stock <= 0
      ? `<span class="badge-nav" style="background:#fee2e2;color:#b91c1c;">Habis (0)</span>`
      : (stock <= 5
        ? `<span class="badge-nav" style="background:#fef3c7;color:#b45309;">Menipis (${stock})</span>`
        : `<span class="badge-nav badge-nav-emerald">Stok: ${stock}</span>`);

    return `
      <div class="knowledge-item-card">
        <div class="knowledge-item-header">
          <div>
            <strong>${escapeHtml(p.name)}</strong> ${p.sku ? `<span style="color:#64748b;font-size:0.78rem;">(${escapeHtml(p.sku)})</span>` : ''}
            ${stockBadge}
          </div>
          <div class="knowledge-item-actions">
            <button type="button" class="btn-edit-sm" onclick="editInventoryProduct(${p.id})">✏️ Edit</button>
            <button type="button" class="btn-delete-sm" onclick="deleteInventoryProduct(${p.id})">🗑️</button>
          </div>
        </div>
        <div class="knowledge-item-answer" style="margin-top:6px;">
          💰 Harga Jual: <strong>Rp ${Number(p.price || 0).toLocaleString('id-ID')}</strong> • Harga Modal: Rp ${Number(p.cost_price || 0).toLocaleString('id-ID')}
          ${p.description ? `<div style="color:#475569;margin-top:4px;">${escapeHtml(p.description)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('editProductId')?.value;
  const name = (document.getElementById('prodName')?.value || '').trim();
  const sku = (document.getElementById('prodSku')?.value || '').trim();
  const description = (document.getElementById('prodDesc')?.value || '').trim();

  if (sku && !/^[A-Za-z0-9_-]{1,40}$/.test(sku)) {
    showAlert('SKU / Kode Barang hanya boleh berisi huruf, angka, tanda hubung (-), atau garis bawah (_).', 'warning');
    return;
  }

  const combinedText = `${name} ${sku} ${description}`;
  if (CLIENT_FORBIDDEN_INV_PATTERN.test(combinedText) || /[<>]/.test(combinedText) || isMaliciousClientInput(combinedText)) {
    showAlert('🛡️ Proteksi Keamanan: Input Inventory hanya boleh berisi teks & angka produk (dilarang memasukkan kode HTML, script, atau ekstensi file seperti .php / .html / .js)!', 'error');
    return;
  }

  const payload = {
    id: id ? Number(id) : undefined,
    name,
    sku,
    cost_price: Number(document.getElementById('prodCostPrice')?.value || 0),
    price: Number(document.getElementById('prodPrice')?.value || 0),
    stock: Number(document.getElementById('prodStock')?.value || 0),
    description
  };

  const res = await apiCall('/api/products', id ? 'PUT' : 'POST', payload);
  if (res && res.success) {
    showToast(id ? 'Produk diperbarui!' : 'Produk ditambahkan ke Inventory!', 'success');
    resetProductForm();
    loadInventoryProducts();
  } else {
    showAlert(res?.error || 'Gagal menyimpan produk.', 'error');
  }
}

function editInventoryProduct(id) {
  const p = inventoryProductsCache.find(x => Number(x.id) === Number(id));
  if (!p) return;
  document.getElementById('editProductId').value = p.id;
  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodSku').value = p.sku || '';
  document.getElementById('prodCostPrice').value = p.cost_price || 0;
  document.getElementById('prodPrice').value = p.price || 0;
  document.getElementById('prodStock').value = p.stock || 0;
  document.getElementById('prodDesc').value = p.description || '';
  document.getElementById('btnSaveProduct').textContent = '💾 Simpan Perubahan Produk';
  document.getElementById('btnCancelEditProduct')?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetProductForm() {
  document.getElementById('editProductId').value = '';
  document.getElementById('productInventoryForm')?.reset();
  document.getElementById('btnSaveProduct').textContent = '💾 Simpan Produk ke Inventory';
  document.getElementById('btnCancelEditProduct')?.classList.add('hidden');
}

async function deleteInventoryProduct(id) {
  const ok = await showConfirm('Hapus Produk', 'Yakin ingin menghapus produk ini dari Inventory?', 'Ya, Hapus');
  if (!ok) return;
  const res = await apiCall('/api/products', 'DELETE', { id });
  if (res && res.success) {
    showToast('Produk dihapus.', 'success');
    loadInventoryProducts();
  } else {
    showAlert(res?.error || 'Gagal menghapus produk.', 'error');
  }
}

async function loadStoreOrders() {
  const locked = document.getElementById('ordersLockedBanner');
  const content = document.getElementById('ordersContentArea');
  const res = await apiCall('/api/store-orders', 'GET');
  if (!res || !res.success) return;

  if (!res.unlocked) {
    if (locked) locked.classList.remove('hidden');
    if (content) content.classList.add('hidden');
    return;
  }
  if (locked) locked.classList.add('hidden');
  if (content) content.classList.remove('hidden');

  storeOrdersCache = res.orders || [];
  renderStoreOrders(storeOrdersCache);
}

function renderStoreOrders(orders) {
  const list = document.getElementById('storeOrdersListContainer');
  const countEl = document.getElementById('storeTotalOrdersCount');
  const revEl = document.getElementById('storeTotalRevenue');
  const profEl = document.getElementById('storeTotalProfit');

  let revenue = 0;
  let profit = 0;
  orders.forEach(o => {
    if (o.status === 'paid' || o.status === 'shipped') {
      revenue += Number(o.subtotal || 0);
      const modal = (o.items || []).reduce((acc, it) => acc + (Number(it.cost_price || 0) * Number(it.qty || 1)), 0);
      profit += Math.max(0, Number(o.subtotal || 0) - modal);
    }
  });

  if (countEl) countEl.textContent = String(orders.length);
  if (revEl) revEl.textContent = `Rp ${revenue.toLocaleString('id-ID')}`;
  if (profEl) profEl.textContent = `Rp ${profit.toLocaleString('id-ID')}`;
  if (!list) return;

  if (orders.length === 0) {
    list.innerHTML = `<div class="loading-state-box">Belum ada order masuk. Ketika pelanggan mengetik "pesan [nama produk]" di WhatsApp, invoice otomatis muncul di sini!</div>`;
    return;
  }

  list.innerHTML = orders.map(o => {
    const itemsText = (o.items || []).map(it => `${escapeHtml(it.name)} x${it.qty}`).join(', ');
    const stColors = {
      pending: 'background:#fef3c7;color:#b45309;',
      paid: 'background:#dcfce7;color:#15803d;',
      shipped: 'background:#dbeafe;color:#1d4ed8;',
      cancelled: 'background:#fee2e2;color:#b91c1c;'
    };
    return `
      <div class="knowledge-item-card">
        <div class="knowledge-item-header">
          <div>
            <strong>${escapeHtml(o.invoice_no)}</strong> • ${escapeHtml(o.customer_name)}
            <span class="badge-nav" style="${stColors[o.status] || ''}">${escapeHtml(o.status).toUpperCase()}</span>
          </div>
          <strong style="color:#16a34a;">Rp ${Number(o.total_amount || 0).toLocaleString('id-ID')}</strong>
        </div>
        <div class="knowledge-item-answer" style="margin-top:6px;">
          <div>🛍️ Item: ${itemsText || '-'}</div>
          <div>📦 Pengiriman: ${o.tracking_no ? `Resi: <strong>${escapeHtml(o.tracking_no)}</strong>` : 'Ongkir &amp; pengiriman dikonfirmasi Admin'}</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
            <button type="button" class="btn-edit-sm" onclick="updateStoreOrderStatus(${o.id}, 'paid')">✅ Tandai Lunas</button>
            <button type="button" class="btn-edit-sm" onclick="updateStoreOrderStatus(${o.id}, 'shipped')">🚚 Kirim + Resi</button>
            <button type="button" class="btn-delete-sm" onclick="updateStoreOrderStatus(${o.id}, 'cancelled')">❌ Batalkan</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function updateStoreOrderStatus(orderId, status) {
  let tracking_no = '';
  if (status === 'shipped') {
    tracking_no = window.prompt('Masukkan Nomor Resi Pengiriman (opsional):', '') || '';
  }
  const res = await apiCall('/api/store-orders', 'PUT', { id: orderId, status, tracking_no });
  if (res && res.success) {
    showToast(`Status order diperbarui ke ${status.toUpperCase()}`, 'success');
    loadStoreOrders();
    loadInventoryProducts();
  } else {
    showAlert(res?.error || 'Gagal memperbarui status order.', 'error');
  }
}

// ==============================================================
// 10. PENGATURAN TOKO
// ==============================================================
async function saveStoreSettings() {
  const inputName = document.getElementById('inputStoreName');
  const inputOwner = document.getElementById('inputOwnerNumber');

  const name = (inputName?.value || '').trim();
  const ownerNumber = (inputOwner?.value || '').trim();

  const res = await apiCall('/api/config', 'POST', { name, ownerNumber });
  if (res && res.success) {
    alert('✅ Pengaturan toko berhasil disimpan ke Cloud!');
    const simName = document.getElementById('simStoreName');
    if (simName && name) simName.textContent = name;
  } else {
    alert('Gagal menyimpan: ' + (res?.error || 'Kesalahan sistem'));
  }
}

function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(knowledgeData, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `artapos-knowledge-${new Date().toISOString().slice(0, 10)}.json`);
  dlAnchorElem.click();
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==============================================================
// 11. SUPER ADMIN WORKSPACE (MONITORING LENGKAP & DETAIL TOKO)
// ==============================================================
let allAdminNotifications = [];
let adminLiveTimer = null;
let currentAdminSection = 'traffic';
let currentVisitorChartMode = 'weekly'; // 'weekly' | 'monthly' | 'yearly'
let currentVisitorChartYear = String(new Date().getFullYear());
let latestVisitStatsCache = null;

function startAdminRealtimeMonitor() {
  stopAdminRealtimeMonitor();
  adminLiveTimer = setInterval(() => {
    if (currentActiveView === 'dashboard' && currentActiveTab === 'superadmin') {
      loadAdminData(true);
    }
  }, 3500);
}

function stopAdminRealtimeMonitor() {
  if (adminLiveTimer) {
    clearInterval(adminLiveTimer);
    adminLiveTimer = null;
  }
}

async function loadAdminData(isSilent = false) {
  const res = await apiCall('/api/admin/overview', 'GET');
  if (!res || !res.success) {
    if (!isSilent) console.warn('Gagal memuat data super admin:', res?.error);
    // Tetap tampilkan grafik & tampilan Empty/Offline State meskipun sedang offline / gagal fetch
    renderAdminVisitorChart(latestVisitStatsCache || { totalVisits: 0, todayVisits: 0, recentVisits: [] });
    filterAdminUsersTable();
    filterAdminNotifications();
    filterAdminKnowledge();
    renderAdminOrdersTable([]);
    return;
  }

  const { stats, users, orders, knowledge, notifications, visitStats } = res;
  allAdminUsers = Array.isArray(users) ? users : [];
  allAdminKnowledge = Array.isArray(knowledge) ? knowledge : [];
  allAdminNotifications = Array.isArray(notifications)
    ? [...notifications].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    : [];

  // Render Real-Time Visitor Traffic Chart
  renderAdminVisitorChart(visitStats || { totalVisits: 0, todayVisits: 0, chartPoints: [], recentVisits: [] });

  // Render Stats
  const elUsers = document.getElementById('adminTotalUsers');
  const elPaid = document.getElementById('adminPaidOrders');
  const elRev = document.getElementById('adminTotalRevenue');
  const elQuota = document.getElementById('adminTotalQuotaUsed');
  const elKnowledge = document.getElementById('adminTotalKnowledge');
  const elWaConnected = document.getElementById('adminWaConnectedCount');
  const elUserBadge = document.getElementById('adminUserCountBadge');
  const elOrderBadge = document.getElementById('adminOrderCountBadge');
  const elKnowledgeBadge = document.getElementById('adminKnowledgeCountBadge');
  const elNotifBadge = document.getElementById('adminNotifCountBadge');

  const subUsers = document.getElementById('subnavUsersCount');
  const subNotif = document.getElementById('subnavNotifCount');
  const subKnowledge = document.getElementById('subnavKnowledgeCount');
  const subOrders = document.getElementById('subnavOrdersCount');

  if (elUsers) elUsers.textContent = Number(stats?.totalUsers || allAdminUsers.length).toLocaleString('id-ID');
  if (elPaid) elPaid.textContent = Number(stats?.totalPaidOrders || 0).toLocaleString('id-ID');
  if (elRev) elRev.textContent = formatRupiah(stats?.totalRevenue || 0);
  if (elQuota) elQuota.textContent = Number(stats?.totalQuotaUsed || 0).toLocaleString('id-ID');
  if (elKnowledge) elKnowledge.textContent = Number(allAdminKnowledge.length).toLocaleString('id-ID');
  if (elWaConnected) {
    const waConnected = allAdminUsers.filter(u => String(u.wa_status || '').toLowerCase() === 'connected').length;
    elWaConnected.textContent = `${waConnected} / ${allAdminUsers.length}`;
  }

  if (elUserBadge) elUserBadge.textContent = `${allAdminUsers.length} Toko`;
  if (elOrderBadge) elOrderBadge.textContent = `${(orders || []).length} Transaksi`;
  if (elKnowledgeBadge) elKnowledgeBadge.textContent = `${allAdminKnowledge.length} Soal & Jawaban`;
  if (elNotifBadge) elNotifBadge.textContent = `${allAdminNotifications.length} Aktivitas`;

  if (subUsers) subUsers.textContent = allAdminUsers.length;
  if (subNotif) subNotif.textContent = allAdminNotifications.length;
  if (subKnowledge) subKnowledge.textContent = allAdminKnowledge.length;
  if (subOrders) subOrders.textContent = (orders || []).length;

  // Update badge di Sidebar Kiri Super Admin
  const sideUsersBadge = document.getElementById('sideUsersBadge');
  const sideNotifBadge = document.getElementById('sideNotifBadge');
  const sideQaBadge = document.getElementById('sideQaBadge');
  if (sideUsersBadge) sideUsersBadge.textContent = allAdminUsers.length;
  if (sideNotifBadge) sideNotifBadge.textContent = allAdminNotifications.length;
  if (sideQaBadge) sideQaBadge.textContent = allAdminKnowledge.length;

  // Populate Dropdown Filter Akun untuk Bank Soal & Jawaban
  const userSelect = document.getElementById('adminKnowledgeUserFilter');
  if (userSelect && document.activeElement !== userSelect) {
    const currentVal = userSelect.value || 'all';
    let optionsHtml = `<option value="all">Semua Akun / Toko (${allAdminKnowledge.length})</option>`;
    allAdminUsers.forEach(u => {
      const uCount = allAdminKnowledge.filter(k => k.user_id === u.id).length;
      optionsHtml += `<option value="${u.id}">${escapeHtml(u.email)} — ${escapeHtml(u.store_name || 'Toko')} (${uCount} Q&A)</option>`;
    });
    userSelect.innerHTML = optionsHtml;
    userSelect.value = currentVal;
  }

  // Render Users Table dengan Filter
  filterAdminUsersTable();

  // Render Notifications Log Table dengan Filter
  filterAdminNotifications();

  // Render Bank Soal & Jawaban Seluruh Akun dengan Filter
  filterAdminKnowledge();

  // Render Orders Table
  renderAdminOrdersTable(orders || []);
}

function setVisitorChartMode(mode) {
  currentVisitorChartMode = mode;
  ['weekly', 'monthly', 'yearly'].forEach(m => {
    const btnId = m === 'weekly' ? 'btnChartModeWeekly' : (m === 'monthly' ? 'btnChartModeMonthly' : 'btnChartModeYearly');
    const el = document.getElementById(btnId);
    if (el) el.classList.toggle('active', m === mode);
  });
  if (latestVisitStatsCache) {
    renderAdminVisitorChart(latestVisitStatsCache);
  }
}

function handleVisitorYearChange(yearVal) {
  currentVisitorChartYear = String(yearVal);
  setVisitorChartMode('yearly');
}

function renderAdminVisitorChart(visitStats) {
  if (visitStats) latestVisitStatsCache = visitStats;
  const statsObj = latestVisitStatsCache || { totalVisits: 0, todayVisits: 0 };

  const totalEl = document.getElementById('adminTotalVisitsVal');
  const todayEl = document.getElementById('adminTodayVisitsVal');
  const subVisitsEl = document.getElementById('subnavVisitsCount');
  const sideVisitsBadge = document.getElementById('sideVisitsBadge');
  const svgContainer = document.getElementById('adminVisitorChartBars');
  const recentStrip = document.getElementById('adminRecentVisitsStrip');
  const titleEl = document.getElementById('lineChartDynamicTitle');
  const legendEl = document.getElementById('lineChartLegendLabel');
  const yearSelect = document.getElementById('visitorChartYearSelect');

  const total = Number(statsObj.totalVisits || 0);
  const today = Number(statsObj.todayVisits || 0);

  if (totalEl) totalEl.textContent = total.toLocaleString('id-ID');
  if (todayEl) todayEl.textContent = `+${today.toLocaleString('id-ID')}`;
  if (subVisitsEl) subVisitsEl.textContent = total.toLocaleString('id-ID');
  if (sideVisitsBadge) sideVisitsBadge.textContent = total.toLocaleString('id-ID');

  // Populate dropdown tahun otomatis (selalu bertambah seiring bertambahnya tahun)
  if (yearSelect && document.activeElement !== yearSelect) {
    const availYears = Array.isArray(statsObj.availableYears) && statsObj.availableYears.length > 0
      ? statsObj.availableYears
      : [String(new Date().getFullYear()), String(new Date().getFullYear() + 1)];

    if (!availYears.includes(currentVisitorChartYear)) {
      currentVisitorChartYear = statsObj.currentYear || availYears[0];
    }
    yearSelect.innerHTML = availYears.map(y => `<option value="${y}" ${y === currentVisitorChartYear ? 'selected' : ''}>Tahun ${y}</option>`).join('');
  }

  let labels = [];
  let counts = [];
  let chartTitleText = '';

  if (currentVisitorChartMode === 'weekly') {
    labels = statsObj.weekly?.labels || ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    counts = statsObj.weekly?.counts || [0, 0, 0, 0, 0, 0, 0];
    chartTitleText = `Jumlah Kunjungan Website artapos.id — Mingguan (Senin - Minggu)`;
  } else if (currentVisitorChartMode === 'monthly') {
    labels = statsObj.monthly?.labels || ['Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4', 'Minggu 5'];
    counts = statsObj.monthly?.counts || [0, 0, 0, 0, 0, 0];
    chartTitleText = `Jumlah Kunjungan Website artapos.id — Bulanan (${statsObj.currentMonthName || 'Bulan Ini'})`;
  } else {
    const shortYr = currentVisitorChartYear.slice(-2);
    labels = [
      `Jan-${shortYr}`, `Feb-${shortYr}`, `Mar-${shortYr}`, `Apr-${shortYr}`,
      `Mei-${shortYr}`, `Jun-${shortYr}`, `Jul-${shortYr}`, `Agu-${shortYr}`,
      `Sep-${shortYr}`, `Okt-${shortYr}`, `Nov-${shortYr}`, `Des-${shortYr}`
    ];
    counts = (statsObj.yearlyByYear && statsObj.yearlyByYear[currentVisitorChartYear])
      ? statsObj.yearlyByYear[currentVisitorChartYear]
      : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    chartTitleText = `Jumlah Kunjungan Website artapos.id — Tahunan (Januari - Desember ${currentVisitorChartYear})`;
  }

  if (titleEl) titleEl.textContent = chartTitleText;
  if (legendEl) legendEl.textContent = chartTitleText;

  if (svgContainer) {
    const rawMax = Math.max(0, ...counts.map(c => Number(c) || 0));
    // Buat skala Y-axis bulat yang rapi (misal 10, 20, 50, 100, dst.)
    let yMax = 10;
    if (rawMax >= 10) {
      const step = Math.ceil(rawMax / 4);
      const mag = Math.pow(10, Math.floor(Math.log10(step)));
      const niceStep = Math.ceil(step / mag) * mag;
      yMax = niceStep * 5;
    }

    const svgW = 860;
    const svgH = 260;
    const padL = 44;
    const padR = 24;
    const padT = 24;
    const padB = 46;
    const plotW = svgW - padL - padR;
    const plotH = svgH - padT - padB;

    // Garis Grid Horizontal Minimalis (ala Vercel / Google Analytics)
    const gridLinesHtml = [];
    for (let i = 0; i <= 4; i++) {
      const val = Math.round((yMax / 4) * i);
      const yPos = padT + plotH - (i / 4) * plotH;
      gridLinesHtml.push(`
        <line x1="${padL}" y1="${yPos}" x2="${svgW - padR}" y2="${yPos}" stroke="#f1f5f9" stroke-width="1.2" />
        <text x="${padL - 10}" y="${yPos + 4}" text-anchor="end" font-size="11" font-weight="600" fill="#94a3b8">${val.toLocaleString('id-ID')}</text>
      `);
    }

    // Hitung koordinat titik (x, y) untuk setiap label
    const n = Math.max(1, labels.length);
    const stepX = n > 1 ? (plotW / (n - 1)) : 0;
    const coords = labels.map((lbl, idx) => {
      const c = Number(counts[idx]) || 0;
      const x = n > 1 ? (padL + idx * stepX) : (padL + plotW / 2);
      const y = padT + plotH - Math.min(1, c / yMax) * plotH;
      return { x, y, val: c, label: lbl, idx };
    });

    const polylinePoints = coords.map(pt => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const areaPoints = `${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${polylinePoints} ${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)}`;

    // Titik aktif default (titik terakhir yang > 0, atau titik tengah)
    let activeIdx = coords.length - 1;
    for (let i = coords.length - 1; i >= 0; i--) {
      if (coords[i].val > 0) { activeIdx = i; break; }
    }
    const activePt = coords[activeIdx];

    const xLabelsHtml = coords.map(pt => {
      const isTilt = labels.length > 7;
      const lblX = pt.x.toFixed(1);
      const lblY = (padT + plotH + 20).toFixed(1);
      const transformAttr = isTilt ? `transform="rotate(-35 ${lblX} ${lblY})" text-anchor="end"` : `text-anchor="middle"`;
      return `<text x="${lblX}" y="${lblY}" ${transformAttr} font-size="11.5" font-weight="600" fill="#64748b">${escapeHtml(pt.label)}</text>`;
    }).join('');

    // Seri tambahan (Klik Daftar & Pendaftar Baru) untuk mode Mingguan
    let extraSeriesHtml = '';
    const regCounts = currentVisitorChartMode === 'weekly' ? (statsObj.weekly?.registerCounts || []) : [];
    const newCounts = currentVisitorChartMode === 'weekly' ? (statsObj.weekly?.newUserCounts || []) : [];
    if (regCounts.length === labels.length) {
      const regPts = regCounts.map((v, idx) => {
        const x = n > 1 ? (padL + idx * stepX) : (padL + plotW / 2);
        const y = padT + plotH - Math.min(1, (Number(v) || 0) / yMax) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      extraSeriesHtml += `<polyline points="${regPts}" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.7" />`;
    }
    if (newCounts.length === labels.length) {
      const newPts = newCounts.map((v, idx) => {
        const x = n > 1 ? (padL + idx * stepX) : (padL + plotW / 2);
        const y = padT + plotH - Math.min(1, (Number(v) || 0) / yMax) * plotH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      extraSeriesHtml += `<polyline points="${newPts}" fill="none" stroke="#4ade80" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />`;
    }

    // Hitboxes transparan per titik untuk hover / tap interaktif
    const hitAreasHtml = coords.map(pt => {
      const regV = Number(regCounts[pt.idx] || 0);
      const newV = Number(newCounts[pt.idx] || 0);
      return `<rect x="${(pt.x - (stepX / 2 || 20)).toFixed(1)}" y="${padT}" width="${(stepX || 40).toFixed(1)}" height="${plotH}" fill="transparent" class="chart-hover-col" data-x="${pt.x.toFixed(1)}" data-y="${pt.y.toFixed(1)}" data-label="${escapeHtml(pt.label)}" data-vis="${pt.val}" data-reg="${regV}" data-new="${newV}" onmouseenter="updateAnalyticsCrosshair(this)" ontouchstart="updateAnalyticsCrosshair(this)" />`;
    }).join('');

    svgContainer.innerHTML = `
      <div class="sleek-chart-wrap" style="position:relative;">
        <div id="analyticsChartTooltip" class="sleek-chart-tooltip">
          <strong>${escapeHtml(activePt.label)}</strong>: ${activePt.val.toLocaleString('id-ID')} Pengunjung
        </div>
        <svg viewBox="0 0 ${svgW} ${svgH}" class="visitor-line-svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#22c55e" stop-opacity="0.28" />
              <stop offset="100%" stop-color="#22c55e" stop-opacity="0.01" />
            </linearGradient>
          </defs>
          ${gridLinesHtml.join('')}
          <polygon points="${areaPoints}" fill="url(#lineAreaGrad)" />
          ${extraSeriesHtml}
          <polyline points="${polylinePoints}" fill="none" stroke="#16a34a" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round" />
          <line id="chartCrosshairLine" x1="${activePt.x.toFixed(1)}" y1="${padT}" x2="${activePt.x.toFixed(1)}" y2="${padT + plotH}" stroke="#64748b" stroke-width="1.3" stroke-dasharray="4 4" />
          <circle id="chartCrosshairDot" cx="${activePt.x.toFixed(1)}" cy="${activePt.y.toFixed(1)}" r="6" fill="#16a34a" stroke="#ffffff" stroke-width="2.5" />
          ${xLabelsHtml}
          ${hitAreasHtml}
        </svg>
      </div>
    `;
  }

  // Update 4 KPI Cards, Funnel CTA, Sumber Trafik & Perangkat
  const regClicks = Number(statsObj.registerClicks || 0);
  const logClicks = Number(statsObj.loginClicks || 0);
  const totUsers = Number(statsObj.totalUsers || allAdminUsers.length || 0);
  const paidUsers = Number(statsObj.paidUsers || 0);
  const weeklyNew = Number(statsObj.weeklyNewUsers || 0);
  const paidOrders = Number(statsObj.paidOrders || 0);
  const denom = Math.max(1, total);

  const elTodaySub = document.getElementById('kpiTodayVisitsSub');
  const elReg = document.getElementById('kpiRegisterClicks');
  const elRegCtr = document.getElementById('kpiRegisterCtrBadge');
  const elLog = document.getElementById('kpiLoginClicks');
  const elLogCtr = document.getElementById('kpiLoginCtrBadge');
  const elTotAcc = document.getElementById('kpiTotalAccounts');
  const elWeekNew = document.getElementById('kpiWeeklyNewBadge');
  const elPaidSub = document.getElementById('kpiPaidAccountsSub');

  if (elTodaySub) elTodaySub.textContent = `${today.toLocaleString('id-ID')} pengunjung hari ini`;
  if (elReg) elReg.textContent = regClicks.toLocaleString('id-ID');
  if (elRegCtr) elRegCtr.textContent = `CTR ${((regClicks / denom) * 100).toFixed(1)}%`;
  if (elLog) elLog.textContent = logClicks.toLocaleString('id-ID');
  if (elLogCtr) elLogCtr.textContent = `CTR ${((logClicks / denom) * 100).toFixed(1)}%`;
  if (elTotAcc) elTotAcc.textContent = totUsers.toLocaleString('id-ID');
  if (elWeekNew) elWeekNew.textContent = `+${weeklyNew.toLocaleString('id-ID')} minggu ini`;
  if (elPaidSub) elPaidSub.textContent = `${paidUsers.toLocaleString('id-ID')} akun aktif berbayar`;

  // Funnel
  const loginPct = Math.min(100, (logClicks / denom) * 100);
  const regPct = Math.min(100, (regClicks / denom) * 100);
  const paidPct = Math.min(100, (paidOrders / denom) * 100);
  const convRate = totUsers > 0 ? ((paidOrders / totUsers) * 100).toFixed(1) : '0.0';

  const fVisVal = document.getElementById('funnelVisitVal');
  const fLogVal = document.getElementById('funnelLoginVal');
  const fLogBar = document.getElementById('funnelLoginBar');
  const fRegVal = document.getElementById('funnelRegisterVal');
  const fRegBar = document.getElementById('funnelRegisterBar');
  const fPaidVal = document.getElementById('funnelPaidVal');
  const fPaidBar = document.getElementById('funnelPaidBar');
  const fConv = document.getElementById('funnelConversionRate');

  if (fVisVal) fVisVal.textContent = `${total.toLocaleString('id-ID')} (100%)`;
  if (fLogVal) fLogVal.textContent = `${logClicks.toLocaleString('id-ID')} (${loginPct.toFixed(1)}%)`;
  if (fLogBar) fLogBar.style.width = `${loginPct}%`;
  if (fRegVal) fRegVal.textContent = `${regClicks.toLocaleString('id-ID')} (${regPct.toFixed(1)}%)`;
  if (fRegBar) fRegBar.style.width = `${regPct}%`;
  if (fPaidVal) fPaidVal.textContent = `${paidOrders.toLocaleString('id-ID')} (${paidPct.toFixed(1)}%)`;
  if (fPaidBar) fPaidBar.style.width = `${paidPct}%`;
  if (fConv) fConv.textContent = `${convRate}%`;

  // Sumber Trafik & Perangkat
  const srcListEl = document.getElementById('trafficSourcesList');
  if (srcListEl) {
    const sources = Array.isArray(statsObj.trafficSources) && statsObj.trafficSources.length > 0
      ? statsObj.trafficSources
      : [
        { name: 'TikTok', pct: 0 },
        { name: 'Google Search', pct: 0 },
        { name: 'Instagram', pct: 0 },
        { name: 'Direct', pct: 100 }
      ];
    srcListEl.innerHTML = sources.map(s => `
      <div>
        <div class="source-item-row">
          <span>${escapeHtml(s.name)}</span>
          <span>${s.pct}%</span>
        </div>
        <div class="funnel-track"><div class="funnel-fill emerald" style="width:${s.pct}%"></div></div>
      </div>
    `).join('');
  }

  const elMob = document.getElementById('deviceMobilePct');
  const elDesk = document.getElementById('deviceDesktopPct');
  if (elMob) elMob.textContent = `${statsObj.deviceSplit?.mobilePct ?? 0}%`;
  if (elDesk) elDesk.textContent = `${statsObj.deviceSplit?.desktopPct ?? 0}%`;

  // Render Daftar Akun Terbaru di Overview
  renderOverviewUsersTable();

  if (recentStrip) {
    const recents = Array.isArray(statsObj.recentVisits) ? statsObj.recentVisits : [];
    if (recents.length === 0) {
      recentStrip.innerHTML = '<span class="rv-chip">Belum ada kunjungan tercatat</span>';
    } else {
      recentStrip.innerHTML = recents.slice(0, 6).map(r => {
        const t = r.created_at ? new Date(r.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        const who = r.visitor_email && r.visitor_email !== 'Pengunjung' ? r.visitor_email : `Pengunjung (${r.ip_address || 'Web'})`;
        return `<span class="rv-chip">🟢 <strong>${escapeHtml(who)}</strong> • ${t}</span>`;
      }).join('');
    }
  }
}

let currentOverviewWaFilter = 'all';

function setOverviewWaFilter(filterKey) {
  currentOverviewWaFilter = filterKey;
  document.getElementById('btnOverviewWaAll')?.classList.toggle('active', filterKey === 'all');
  document.getElementById('btnOverviewWaConn')?.classList.toggle('active', filterKey === 'connected');
  document.getElementById('btnOverviewWaScan')?.classList.toggle('active', filterKey === 'unconnected');
  renderOverviewUsersTable();
}

function setAnalyticsRange(rangeKey) {
  document.getElementById('btnRangeToday')?.classList.toggle('active', rangeKey === 'today');
  document.getElementById('btnRange7d')?.classList.toggle('active', rangeKey === '7d');
  document.getElementById('btnRange30d')?.classList.toggle('active', rangeKey === '30d');
  if (rangeKey === 'today' || rangeKey === '7d') {
    setVisitorChartMode('weekly');
  } else {
    setVisitorChartMode('monthly');
  }
}

function renderOverviewUsersTable() {
  const tbody = document.getElementById('overviewUsersTableBody');
  if (!tbody) return;

  const q = (document.getElementById('overviewUserSearch')?.value || '').trim().toLowerCase();
  const list = allAdminUsers.filter(u => {
    const isConn = String(u.wa_status || '').toLowerCase() === 'connected';
    if (currentOverviewWaFilter === 'connected' && !isConn) return false;
    if (currentOverviewWaFilter === 'unconnected' && isConn) return false;
    if (q && !String(u.email || '').toLowerCase().includes(q) && !String(u.store_name || '').toLowerCase().includes(q)) return false;
    return true;
  }).slice(0, 8);

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:22px; color:#64748b;">Tidak ada akun yang cocok dengan filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(u => {
    const isConn = String(u.wa_status || '').toLowerCase() === 'connected';
    const d = u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const waPill = isConn
      ? '<span class="badge-status-active" style="white-space:nowrap;">● Terhubung</span>'
      : '<span class="badge-status-expired" style="white-space:nowrap;">● Belum Scan</span>';
    return `
      <tr>
        <td data-label="Email"><strong style="color:#0f172a;">${escapeHtml(u.email)}</strong></td>
        <td data-label="Paket"><span class="badge-plan-table">${escapeHtml(u.plan || 'Gratis')}</span></td>
        <td data-label="Status WA">${waPill}</td>
        <td data-label="Tanggal Daftar" style="font-size:0.8rem; color:#64748b; white-space:nowrap;">${d}</td>
        <td data-label="Aksi">
          <button type="button" class="btn-table-action btn-view-detail" onclick="openAdminUserDetail(${u.id})">Detail</button>
        </td>
      </tr>
    `;
  }).join('');
}

function exportAdminAnalyticsCSV() {
  const stats = latestVisitStatsCache || {};
  const lines = [
    ['Metrik', 'Nilai'],
    ['Total Pengunjung Web', stats.totalVisits || 0],
    ['Pengunjung Hari Ini', stats.todayVisits || 0],
    ['Klik Tombol Daftar', stats.registerClicks || 0],
    ['Klik Tombol Masuk', stats.loginClicks || 0],
    ['Total Akun Pendaftar', stats.totalUsers || allAdminUsers.length],
    ['Akun Aktif Berbayar', stats.paidUsers || 0],
    [''],
    ['ID', 'Email', 'Toko', 'Paket', 'Total Token', 'Terpakai', 'Status WA', 'Tanggal Daftar']
  ];
  allAdminUsers.forEach(u => {
    lines.push([
      u.id,
      `"${String(u.email || '').replace(/"/g, '""')}"`,
      `"${String(u.store_name || '').replace(/"/g, '""')}"`,
      `"${String(u.plan || '').replace(/"/g, '""')}"`,
      u.quota_total || 0,
      u.quota_used || 0,
      u.wa_status === 'connected' ? 'Terhubung' : 'Belum Scan',
      u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : ''
    ]);
  });
  const csv = lines.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `artapos-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📊 Laporan CSV berhasil diunduh!', 'success');
}

function filterAdminKnowledge() {
  const searchInput = document.getElementById('adminKnowledgeSearchInput');
  const userFilter = document.getElementById('adminKnowledgeUserFilter');
  const catFilter = document.getElementById('adminKnowledgeCategoryFilter');

  const q = (searchInput?.value || '').trim().toLowerCase();
  const userVal = userFilter?.value || 'all';
  const catVal = (catFilter?.value || 'all').toLowerCase();

  const filtered = allAdminKnowledge.filter(k => {
    const qList = Array.isArray(k.questions) ? k.questions : [String(k.questions || '')];
    const kwList = Array.isArray(k.keywords) ? k.keywords : [String(k.keywords || '')];
    const qStr = qList.join(' ').toLowerCase();
    const kwStr = kwList.join(' ').toLowerCase();
    const ansStr = String(k.answer || '').toLowerCase();
    const emailStr = String(k.email || '').toLowerCase();
    const storeStr = String(k.store_name || '').toLowerCase();

    const matchSearch = !q || qStr.includes(q) || kwStr.includes(q) || ansStr.includes(q) || emailStr.includes(q) || storeStr.includes(q);
    const matchUser = userVal === 'all' || String(k.user_id) === String(userVal);
    const matchCat = catVal === 'all' || String(k.category || '').toLowerCase() === catVal;

    return matchSearch && matchUser && matchCat;
  });

  const badge = document.getElementById('adminKnowledgeCountBadge');
  if (badge) badge.textContent = `${filtered.length} dari ${allAdminKnowledge.length} Soal & Jawaban`;

  renderAdminAllKnowledge(filtered);
}

function renderAdminAllKnowledge(items) {
  const container = document.getElementById('adminAllKnowledgeList');
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `
      <div class="visual-empty-state-card">
        <div class="ves-icon-badge ${isNetworkOffline ? 'offline' : 'warn'}">${isNetworkOffline ? '📡' : '🔍'}</div>
        <div class="ves-title">${isNetworkOffline ? 'Mode Offline — Bank Soal Belum Dapat Dimuat' : 'Tidak Ada Soal & Jawaban Ditemukan'}</div>
        <div class="ves-desc">${isNetworkOffline ? 'Periksa sambungan internet atau server Anda untuk menyinkronkan bank soal seluruh akun.' : 'Belum ada data pengetahuan yang cocok dengan kata kunci atau filter toko/kategori yang dipilih.'}</div>
        <button type="button" class="ves-btn" onclick="document.getElementById('adminKnowledgeSearchInput').value=''; document.getElementById('adminKnowledgeUserFilter').value='all'; document.getElementById('adminKnowledgeCategoryFilter').value='all'; filterAdminKnowledge(); loadAdminData();">🔄 Reset Filter & Muat Ulang</button>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(k => {
    const qList = Array.isArray(k.questions) ? k.questions : [String(k.questions || '')];
    const kwList = Array.isArray(k.keywords) ? k.keywords : [String(k.keywords || '')];
    const d = k.created_at ? new Date(k.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const firstQ = qList[0] || 'Pertanyaan';

    return `
      <div class="admin-qa-card">
        <div class="qa-card-header">
          <div class="qa-account-meta">
            <span class="qa-avatar-icon">🏪</span>
            <div>
              <div class="qa-store-title">
                ${escapeHtml(k.store_name || 'Toko')} 
                <span class="badge-plan-table">${escapeHtml(k.plan || 'Paket Bisnis')}</span>
              </div>
              <div class="qa-user-email">
                👤 <strong>${escapeHtml(k.email)}</strong> • User ID: #${k.user_id}
              </div>
            </div>
          </div>
          <div class="qa-header-actions">
            <span class="k-category-pill">${escapeHtml(k.category || 'umum')}</span>
            <button class="btn-delete-qa" onclick="handleAdminDeleteKnowledge(${k.id}, '${escapeHtml(firstQ)}')" title="Hapus Soal & Jawaban ini">
              🗑️ Hapus
            </button>
          </div>
        </div>

        <div class="qa-card-body">
          <div class="qa-section-box">
            <div class="qa-section-label">❓ Variasi Soal / Pertanyaan Pelanggan (${qList.length}):</div>
            <div class="qa-questions-tags">
              ${qList.map(q => `<span class="qa-q-tag">💬 "${escapeHtml(q)}"</span>`).join('')}
            </div>
          </div>

          <div class="qa-section-box">
            <div class="qa-section-label">💡 Format Jawaban / Balasan Bot AI:</div>
            <div class="qa-answer-bubble">${escapeHtml(k.answer)}</div>
          </div>

          ${kwList.length > 0 && kwList[0] ? `
            <div class="qa-section-box">
              <div class="qa-keywords-meta">
                🏷️ <strong>Kata Kunci:</strong> ${kwList.map(kw => `<span class="qa-kw-tag">${escapeHtml(kw)}</span>`).join(' ')}
              </div>
            </div>
          ` : ''}
        </div>

        <div class="qa-card-footer">
          <span>📅 Dibuat: ${d} • ID: #${k.id}</span>
          <button class="btn-inspect-user" onclick="openAdminUserDetail(${k.user_id})">
            👁️ Buka Profil Toko #${k.user_id}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function handleAdminDeleteKnowledge(knowledgeId, questionTitle) {
  const ok = await showConfirm(
    'Hapus Soal & Jawaban',
    `Apakah Super Admin yakin ingin menghapus data soal "${questionTitle}" dari database toko ini?`,
    'Ya, Hapus'
  );
  if (!ok) return;

  const res = await apiCall('/api/admin/delete-knowledge', 'POST', { id: knowledgeId });
  if (res && res.success) {
    showToast('Soal & jawaban berhasil dihapus!', 'success');
    loadAdminData();
  } else {
    showAlert('Gagal menghapus: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

function switchAdminSection(sectionKey) {
  currentAdminSection = sectionKey;

  const btns = {
    'users': document.getElementById('subnavBtnUsers'),
    'traffic': document.getElementById('subnavBtnTraffic'),
    'notifications': document.getElementById('subnavBtnNotif'),
    'knowledge': document.getElementById('subnavBtnKnowledge'),
    'orders': document.getElementById('subnavBtnOrders'),
    'plans': document.getElementById('subnavBtnPlans'),
    'pwd': document.getElementById('subnavBtnPwd')
  };

  const sideBtns = {
    'users': document.getElementById('navSaUsersBtn'),
    'traffic': document.getElementById('navSaTrafficBtn'),
    'notifications': document.getElementById('navSaNotifBtn'),
    'knowledge': document.getElementById('navSaKnowledgeBtn'),
    'orders': document.getElementById('navSaOrdersBtn'),
    'plans': document.getElementById('navSaPlansBtn'),
    'pwd': document.getElementById('navSaPwdBtn')
  };

  Object.values(btns).forEach(b => { if (b) b.classList.remove('active'); });
  if (btns[sectionKey]) btns[sectionKey].classList.add('active');

  Object.values(sideBtns).forEach(b => { if (b) b.classList.remove('active'); });
  if (sideBtns[sectionKey]) sideBtns[sectionKey].classList.add('active');

  const targets = {
    'users': document.getElementById('adminUsersSection'),
    'traffic': document.getElementById('adminTrafficSection'),
    'notifications': document.getElementById('adminNotificationsSection'),
    'knowledge': document.getElementById('adminKnowledgeSection'),
    'orders': document.getElementById('adminOrdersSection'),
    'plans': document.getElementById('adminPlansSection'),
    'pwd': document.getElementById('adminPwdSection')
  };

  // Pisahkan menjadi halaman tersendiri (tampilkan HANYA menu yang dipilih!)
  Object.keys(targets).forEach(k => {
    if (targets[k]) {
      targets[k].classList.toggle('hidden', k !== sectionKey);
    }
  });

  if (sectionKey === 'plans') {
    if (DYNAMIC_PLANS_LIST.length > 0) {
      renderAdminPlansManager(DYNAMIC_PLANS_LIST);
    } else {
      loadDynamicPlans(false);
    }
  }

  const sectionTitles = {
    'traffic': 'Grafik Kunjungan Website Real-Time',
    'users': 'CRUD Akun Email & Token Toko',
    'notifications': 'Log Aktivitas (Daftar, Login, Logout) & Notifikasi',
    'knowledge': 'Bank Soal & Jawaban Seluruh Akun',
    'orders': 'Riwayat Transaksi Pembayaran',
    'plans': 'Atur Paket, Harga, Token & Kuota Knowledge',
    'pwd': 'Pengaturan Sandi Super Admin'
  };
  const topTitle = document.getElementById('topbarTitle');
  if (topTitle && sectionTitles[sectionKey]) {
    topTitle.textContent = sectionTitles[sectionKey];
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterAdminNotifications() {
  const searchEl = document.getElementById('adminNotifSearchInput');
  const catEl = document.getElementById('adminNotifCategoryFilter');

  const q = (searchEl?.value || '').trim().toLowerCase();
  const cat = (catEl?.value || 'all').toUpperCase();

  const filtered = allAdminNotifications.filter(n => {
    const nCat = String(n.category || '').toUpperCase();
    const matchCat = cat === 'ALL' || nCat === cat || (cat === 'LOGIN' && nCat === 'AUTH');
    const recStr = String(n.recipient || '').toLowerCase();
    const titleStr = String(n.title || '').toLowerCase();
    const msgStr = String(n.message || '').toLowerCase();
    const matchSearch = !q || recStr.includes(q) || titleStr.includes(q) || msgStr.includes(q);
    return matchCat && matchSearch;
  });

  const elBadge = document.getElementById('adminNotifCountBadge');
  if (elBadge) elBadge.textContent = `${filtered.length} dari ${allAdminNotifications.length} Aktivitas`;

  renderAdminNotificationsTable(filtered);
}

function renderAdminNotificationsTable(notifs) {
  const tbody = document.getElementById('adminNotificationsTableBody');
  if (!tbody) return;

  if (!notifs || notifs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 16px;">
          <div class="visual-empty-state-card" style="margin: 0;">
            <div class="ves-icon-badge ${isNetworkOffline ? 'offline' : ''}">${isNetworkOffline ? '📡' : '📋'}</div>
            <div class="ves-title">${isNetworkOffline ? 'Mode Offline — Log Aktivitas Belum Tersinkron' : 'Belum Ada Riwayat Log Aktivitas'}</div>
            <div class="ves-desc">Setiap aktivitas Daftar Baru, Login Masuk, Logout Keluar, Pengiriman Email, Tautan WhatsApp, dan Blokir Firewall akan otomatis tampil di sini.</div>
            <button type="button" class="ves-btn" onclick="document.getElementById('adminNotifSearchInput').value=''; document.getElementById('adminNotifCategoryFilter').value='all'; filterAdminNotifications(); loadAdminData();">🔄 Segarkan Log Aktivitas</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const categoryBadges = {
    'REGISTER': { icon: '📝', bg: '#ecfdf5', color: '#15803d', border: '#86efac', label: 'DAFTAR BARU' },
    'LOGIN': { icon: '🔑', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', label: 'LOGIN MASUK' },
    'AUTH': { icon: '🔑', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff', label: 'LOGIN MASUK' },
    'LOGOUT': { icon: '🚪', bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'LOGOUT KELUAR' },
    'EMAIL': { icon: '📩', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'EMAIL SMTP' },
    'WHATSAPP': { icon: '📱', bg: '#f0fdf4', color: '#166534', border: '#bbf7d0', label: 'WHATSAPP' },
    'ADMIN': { icon: '👑', bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'SUPER ADMIN' },
    'SECURITY': { icon: '🛡️', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'FIREWALL' }
  };

  tbody.innerHTML = notifs.map(n => {
    const catKey = String(n.category || 'INFO').toUpperCase();
    const badge = categoryBadges[catKey] || { icon: '🔔', bg: '#f1f5f9', color: '#334155', border: '#cbd5e1', label: catKey };
    const isErr = n.status === 'error';
    const isWarn = n.status === 'warning';
    const statusText = isErr ? '❌ Gagal' : (isWarn ? '⚠️ Peringatan' : '🟢 Terkirim / Sukses');
    const statusClass = isErr ? 'badge-status-expired' : 'badge-status-active';
    const d = n.created_at ? new Date(n.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' }) : '-';

    return `
      <tr>
        <td><strong>#${n.id}</strong></td>
        <td style="font-size: 12px; color: #64748b; white-space: nowrap;">${d}</td>
        <td>
          <span style="display:inline-flex; align-items:center; gap:5px; background:${badge.bg}; color:${badge.color}; border:1px solid ${badge.border}; padding:3px 9px; border-radius:99px; font-size:0.72rem; font-weight:800; white-space:nowrap;">
            ${badge.icon} ${badge.label}
          </span>
        </td>
        <td><strong style="color:#0f172a;">${escapeHtml(n.recipient)}</strong></td>
        <td>
          <div style="font-weight:700; color:#0f172a; margin-bottom:2px;">${escapeHtml(n.title)}</div>
          <div style="font-size:0.8rem; color:#475569; line-height:1.45;">${escapeHtml(n.message)}</div>
        </td>
        <td><span class="${statusClass}" style="white-space:nowrap;">${statusText}</span></td>
        <td>
          <button type="button" class="btn-delete-qa" onclick="handleAdminDeleteNotification(${n.id})" title="Hapus Log">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleAdminDeleteNotification(id) {
  const res = await apiCall('/api/admin/delete-notification', 'POST', { id });
  if (res && res.success) {
    showToast('Log notifikasi dihapus.', 'info');
    loadAdminData();
  }
}

async function handleAdminClearNotifications() {
  const ok = await showConfirm(
    'Bersihkan Semua Log Notifikasi?',
    'Seluruh riwayat catatan notifikasi akan dikosongkan dari tabel pemantauan.',
    'Ya, Bersihkan'
  );
  if (!ok) return;

  const res = await apiCall('/api/admin/delete-notification', 'POST', { clearAll: true });
  if (res && res.success) {
    showToast('Seluruh log notifikasi berhasil dibersihkan!', 'success');
    loadAdminData();
  }
}

function filterAdminUsersTable() {
  const searchInput = document.getElementById('adminUserSearchInput');
  const planFilter = document.getElementById('adminPlanFilter');
  const roleFilter = document.getElementById('adminRoleFilter');

  const q = (searchInput?.value || '').trim().toLowerCase();
  const planVal = (planFilter?.value || 'all').toLowerCase();
  const roleVal = (roleFilter?.value || 'all').toLowerCase();

  const filtered = allAdminUsers.filter(u => {
    const matchSearch = !q || (u.email && u.email.toLowerCase().includes(q)) || (u.store_name && u.store_name.toLowerCase().includes(q));
    const matchPlan = planVal === 'all' || (u.plan && u.plan.toLowerCase().includes(planVal));
    const matchRole = roleVal === 'all' || (roleVal === 'superadmin' ? u.role === 'superadmin' : u.role !== 'superadmin');
    return matchSearch && matchPlan && matchRole;
  });

  const elUserBadge = document.getElementById('adminUserCountBadge');
  if (elUserBadge) elUserBadge.textContent = `${filtered.length} dari ${allAdminUsers.length} Toko`;

  renderAdminUsersTable(filtered);
}

function renderAdminUsersTable(users) {
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding: 16px;">
          <div class="visual-empty-state-card" style="margin: 0;">
            <div class="ves-icon-badge ${isNetworkOffline ? 'offline' : 'warn'}">${isNetworkOffline ? '📡' : '👥'}</div>
            <div class="ves-title">${isNetworkOffline ? 'Mode Offline — Daftar Akun Belum Dapat Dimuat' : 'Tidak Ada Data Akun Toko Ditemukan'}</div>
            <div class="ves-desc">Tidak ada akun pengguna yang cocok dengan kata kunci pencarian atau filter paket yang Anda pilih.</div>
            <button type="button" class="ves-btn" onclick="document.getElementById('adminUserSearchInput').value=''; document.getElementById('adminPlanFilter').value='all'; document.getElementById('adminRoleFilter').value='all'; filterAdminUsersTable(); loadAdminData();">🔄 Reset Filter & Segarkan</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const total = Number(u.quota_total) || 0;
    const used = Number(u.quota_used) || 0;
    const rem = Math.max(0, total - used);
    const isSuper = u.role === 'superadmin';
    const isExpired = u.active_until && new Date(u.active_until) < new Date();
    const activeDate = u.active_until ? new Date(u.active_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

    let statusBadgeClass = 'badge-status-active';
    let statusBadgeText = '🟢 Aktif';
    if (isExpired) {
      statusBadgeClass = 'badge-status-expired';
      statusBadgeText = '🔴 Kedaluwarsa';
    } else if (rem <= 0) {
      statusBadgeClass = 'badge-status-expired';
      statusBadgeText = '🔴 Token Habis';
    } else if (rem < 20) {
      statusBadgeClass = 'badge-status-warn';
      statusBadgeText = '🟡 Token Menipis';
    }

    return `
      <tr>
        <td data-label="ID"><strong>#${u.id}</strong></td>
        <td data-label="Email Google">
          <div style="font-weight: 700; color: #0f172a;">${escapeHtml(u.email)}</div>
        </td>
        <td data-label="Nama Toko">${escapeHtml(u.store_name || '-')}</td>
        <td data-label="Paket"><span class="badge-plan-table">${escapeHtml(u.plan || 'Gratis')}</span></td>
        <td data-label="Sisa Token"><strong style="color: ${rem > 0 ? '#16a34a' : '#dc2626'}; font-size: 1rem;">${rem.toLocaleString('id-ID')}</strong></td>
        <td data-label="Terpakai / Total"><span style="color: #64748b;">${used.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')}</span></td>
        <td data-label="Masa Aktif"><span style="font-size: 12px; color: #475569;">${activeDate}</span></td>
        <td data-label="Status">
          <span class="${statusBadgeClass}">${statusBadgeText}</span>
        </td>
        <td data-label="Aksi">
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <button class="btn-table-action btn-view-detail" onclick="openAdminUserDetail(${u.id})">
              ✏️ Edit / Detail
            </button>
            ${!isSuper ? `
              <button class="btn-table-action btn-quick-quota" onclick="handleAdminAddQuota(${u.id}, '${escapeHtml(u.email)}')" title="Tambah +1.000 Kuota">
                +1.000
              </button>
              <button class="btn-delete-qa" onclick="handleAdminDeleteUser(${u.id}, '${escapeHtml(u.email)}')" title="Hapus Akun Email Ini">
                🗑️ Hapus
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdminOrdersTable(orders) {
  const tbody = document.getElementById('adminOrdersTableBody');
  if (!tbody) return;

  if (!orders || orders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 16px;">
          <div class="visual-empty-state-card" style="margin: 0;">
            <div class="ves-icon-badge ${isNetworkOffline ? 'offline' : ''}">${isNetworkOffline ? '📡' : '💳'}</div>
            <div class="ves-title">${isNetworkOffline ? 'Mode Offline — Riwayat Transaksi Belum Tersedia' : 'Belum Ada Riwayat Transaksi Pembayaran'}</div>
            <div class="ves-desc">Seluruh tagihan pembelian paket berbayar akan tercatat otomatis di tabel ini.</div>
            <button type="button" class="ves-btn" onclick="loadAdminData()">🔄 Segarkan Data Transaksi</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = orders.map(o => {
    const isSettlement = o.status === 'settlement' || o.status === 'capture';
    const isPending = o.status === 'pending';
    const statusClass = isSettlement ? 'badge-pay-success' : (isPending ? 'badge-pay-pending' : 'badge-pay-failed');
    const statusText = isSettlement ? 'Lunas (Settlement)' : (isPending ? 'Menunggu Bayar' : o.status);
    const d = o.created_at ? new Date(o.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-';

    return `
      <tr>
        <td><code style="font-size: 11px; background: #f1f5f9; padding: 3px 6px; border-radius: 4px;">${escapeHtml(o.order_id)}</code></td>
        <td>${escapeHtml(o.email)}</td>
        <td>${escapeHtml(o.plan)}</td>
        <td><strong>${formatRupiah(o.amount)}</strong></td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td style="font-size: 12px; color: #64748b;">${d}</td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------
// MODAL DETAIL & KELOLA PENGGUNA (SUPER ADMIN)
// ----------------------------------------
async function openAdminUserDetail(userId) {
  showToast('Memuat data lengkap toko...', 'info');

  const res = await apiCall(`/api/admin/user-detail?userId=${userId}`, 'GET');
  if (!res || !res.success || !res.user) {
    showAlert('Gagal memuat detail toko.', 'error');
    return;
  }

  const { user, knowledge, config, orders } = res;

  // Header Modal
  const modalId = document.getElementById('modalUserDetailId');
  const modalEmail = document.getElementById('modalUserDetailEmail');
  if (modalId) modalId.textContent = `#${user.id}`;
  if (modalEmail) modalEmail.textContent = user.email;

  // Form Fields
  const editId = document.getElementById('editUserId');
  const editEmail = document.getElementById('editUserEmail');
  const editStore = document.getElementById('editUserStoreName');
  const editPlan = document.getElementById('editUserPlan');
  const editQuotaTotal = document.getElementById('editUserQuotaTotal');
  const editQuotaUsed = document.getElementById('editUserQuotaUsed');
  const editExtraKnowledge = document.getElementById('editUserExtraKnowledge');
  const editExtraInventory = document.getElementById('editUserExtraInventory');
  const editExtraImages = document.getElementById('editUserExtraImages');
  const editCurrentActive = document.getElementById('editUserCurrentActive');
  const editDaysAdd = document.getElementById('editUserDaysAdd');
  const editNewPwd = document.getElementById('editUserNewPassword');

  if (editId) editId.value = user.id;
  if (editEmail) editEmail.value = user.email || '';
  if (editStore) editStore.value = user.store_name || '';
  if (editPlan) {
    const planVal = user.plan || 'Akun Baru (Belum Klaim)';
    const hasOpt = Array.from(editPlan.options).some(o => o.value === planVal);
    if (!hasOpt) {
      const opt = document.createElement('option');
      opt.value = planVal;
      opt.textContent = planVal;
      editPlan.appendChild(opt);
    }
    editPlan.value = planVal;
  }
  if (editQuotaTotal) editQuotaTotal.value = user.quota_total ?? 0;
  if (editQuotaUsed) editQuotaUsed.value = user.quota_used ?? 0;
  if (editExtraKnowledge) editExtraKnowledge.value = user.extra_knowledge ?? 0;
  if (editExtraInventory) editExtraInventory.value = user.extra_inventory ?? 0;
  if (editExtraImages) editExtraImages.value = user.extra_images ?? 0;
  if (editDaysAdd) editDaysAdd.value = '';
  if (editNewPwd) editNewPwd.value = '';

  if (editCurrentActive) {
    editCurrentActive.textContent = user.active_until
      ? new Date(user.active_until).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Belum ditentukan';
  }

  // Badges Tabs
  const kBadge = document.getElementById('modalKnowledgeCount');
  const oBadge = document.getElementById('modalOrdersCount');
  if (kBadge) kBadge.textContent = (knowledge || []).length;
  if (oBadge) oBadge.textContent = (orders || []).length;

  // Render Knowledge Base Milik Toko Ini
  const kList = document.getElementById('modalKnowledgeList');
  if (kList) {
    if (!knowledge || knowledge.length === 0) {
      kList.innerHTML = '<div style="text-align: center; padding: 24px; color: #94a3b8;">Toko ini belum menambahkan data tanya-jawab bot.</div>';
    } else {
      kList.innerHTML = knowledge.map(item => {
        const qList = Array.isArray(item.questions) ? item.questions : [item.questions || ''];
        const kwList = Array.isArray(item.keywords) ? item.keywords : [item.keywords || ''];
        const firstQ = qList[0] || 'Pertanyaan';
        return `
          <div class="admin-qa-card" style="margin-bottom: 14px;">
            <div class="qa-card-header" style="border-bottom: 1px dashed #e2e8f0; margin-bottom: 10px; padding-bottom: 8px;">
              <span class="k-category-pill">${escapeHtml(item.category || 'umum')}</span>
              <button class="btn-delete-qa" onclick="handleAdminDeleteKnowledge(${item.id}, '${escapeHtml(firstQ)}')">🗑️ Hapus Soal</button>
            </div>
            <div class="qa-card-body">
              <div class="qa-section-box">
                <div class="qa-section-label">❓ Soal / Variasi Pertanyaan (${qList.length}):</div>
                <div class="qa-questions-tags">
                  ${qList.map(q => `<span class="qa-q-tag">💬 "${escapeHtml(q)}"</span>`).join('')}
                </div>
              </div>
              <div class="qa-section-box">
                <div class="qa-section-label">💡 Format Jawaban / Balasan AI WhatsApp:</div>
                <div class="qa-answer-bubble">${escapeHtml(item.answer)}</div>
              </div>
              ${kwList.length > 0 && kwList[0] ? `
                <div class="qa-keywords-meta">
                  🏷️ <strong>Kata Kunci:</strong> ${kwList.map(k => `<span class="qa-kw-tag">${escapeHtml(k)}</span>`).join(' ')}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render Orders Milik Toko Ini
  const oTbody = document.getElementById('modalOrdersTableBody');
  if (oTbody) {
    if (!orders || orders.length === 0) {
      oTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 16px; color: #94a3b8;">Belum ada tagihan Midtrans untuk toko ini.</td></tr>';
    } else {
      oTbody.innerHTML = orders.map(o => {
        const isSettlement = o.status === 'settlement' || o.status === 'capture';
        const isPending = o.status === 'pending';
        const statusClass = isSettlement ? 'badge-pay-success' : (isPending ? 'badge-pay-pending' : 'badge-pay-failed');
        const statusText = isSettlement ? 'Lunas' : (isPending ? 'Pending' : o.status);
        const d = o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
        return `
          <tr>
            <td><code>${escapeHtml(o.order_id)}</code></td>
            <td>${escapeHtml(o.plan)}</td>
            <td><strong>${formatRupiah(o.amount)}</strong></td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td>${d}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // Buka Modal & Set default tab ke Info
  switchModalTab('info');
  const modal = document.getElementById('adminUserDetailModal');
  if (modal) modal.classList.remove('hidden');
}

function closeAdminUserModal() {
  const modal = document.getElementById('adminUserDetailModal');
  if (modal) modal.classList.add('hidden');
}

function switchModalTab(tabKey) {
  const tabs = {
    'info': document.getElementById('modalPaneInfo'),
    'knowledge': document.getElementById('modalPaneKnowledge'),
    'orders': document.getElementById('modalPaneOrders')
  };
  const btns = {
    'info': document.getElementById('modalTabBtnInfo'),
    'knowledge': document.getElementById('modalTabBtnKnowledge'),
    'orders': document.getElementById('modalTabBtnOrders')
  };

  Object.keys(tabs).forEach(k => {
    if (tabs[k]) tabs[k].classList.add('hidden');
    if (btns[k]) btns[k].classList.remove('active');
  });

  if (tabs[tabKey]) tabs[tabKey].classList.remove('hidden');
  if (btns[tabKey]) btns[tabKey].classList.add('active');
}

async function handleAdminSaveUserChanges(e) {
  e.preventDefault();
  const userId = document.getElementById('editUserId')?.value;
  const email = document.getElementById('editUserEmail')?.value?.trim().toLowerCase();
  const storeName = document.getElementById('editUserStoreName')?.value;
  const plan = document.getElementById('editUserPlan')?.value;
  const quota_total = document.getElementById('editUserQuotaTotal')?.value;
  const quota_used = document.getElementById('editUserQuotaUsed')?.value;
  const extra_knowledge = document.getElementById('editUserExtraKnowledge')?.value;
  const extra_inventory = document.getElementById('editUserExtraInventory')?.value;
  const extra_images = document.getElementById('editUserExtraImages')?.value;
  const daysToAdd = document.getElementById('editUserDaysAdd')?.value;
  const newPassword = document.getElementById('editUserNewPassword')?.value;
  const btn = document.getElementById('btnAdminSaveUser');

  if (!email || !email.endsWith('@gmail.com')) {
    showAlert('Email wajib menggunakan format Google (@gmail.com) yang valid.', 'warning');
    return;
  }

  if (newPassword && newPassword.length > 20) {
    showAlert('Password baru maksimal 20 karakter.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
  }

  const payload = {
    userId,
    email,
    storeName,
    plan,
    quota_total: quota_total !== '' ? Number(quota_total) : undefined,
    quota_used: quota_used !== '' ? Number(quota_used) : undefined,
    extra_knowledge: extra_knowledge !== '' ? Number(extra_knowledge) : undefined,
    extra_inventory: extra_inventory !== '' ? Number(extra_inventory) : undefined,
    extra_images: extra_images !== '' ? Number(extra_images) : undefined,
    daysToAdd: daysToAdd ? Number(daysToAdd) : undefined,
    newPassword: newPassword ? newPassword.trim() : undefined
  };

  const res = await apiCall('/api/admin/edit-user-full', 'POST', payload);

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Simpan Perubahan Akun';
  }

  if (res && res.success) {
    showAlert('Data email & akun toko berhasil diperbarui di Cloud!', 'success');
    closeAdminUserModal();
    loadAdminData();
  } else {
    showAlert('Gagal: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

async function openAdminCreateUserModal() {
  const { value: formValues } = await Swal.fire({
    title: '➕ Tambah Akun Email Baru',
    html: `
      <div style="text-align:left; display:flex; flex-direction:column; gap:12px; margin-top:8px;">
        <div>
          <label style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Alamat Email Google (@gmail.com) *</label>
          <input id="swalNewEmail" type="email" maxlength="100" placeholder="contoh: tokobaru@gmail.com" style="width:100%; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem;">
        </div>
        <div>
          <label style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Nama Toko / Bisnis</label>
          <input id="swalNewStore" type="text" maxlength="100" value="Toko AI Assistant" style="width:100%; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem;">
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Paket</label>
            <select id="swalNewPlan" style="width:100%; padding:10px 10px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.86rem;">
              <option value="Paket Gratis (75 Token)">Paket Gratis (75 Token)</option>
              <option value="Paket Hemat 25K">Paket Hemat 25K (300 Token)</option>
              <option value="Paket Plus 35K">Paket Plus 35K (500 Token)</option>
              <option value="Paket Starter 50K">Paket Starter 50K (1.000 Token)</option>
              <option value="Paket Pro 70K">Paket Pro 70K (1.500 Token)</option>
              <option value="Paket Bisnis 100K">Paket Bisnis 100K (2.500 Token)</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Total Token</label>
            <input id="swalNewQuota" type="number" value="75" min="0" style="width:100%; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem;">
          </div>
        </div>
        <div>
          <label style="font-size:0.82rem; font-weight:700; color:#1e293b; display:block; margin-bottom:4px;">Password (Opsional, Kosongkan = Otomatis & Kirim ke Email)</label>
          <input id="swalNewPwd" type="text" maxlength="20" placeholder="Kosongkan agar dibuat otomatis & dikirim ke Gmail" style="width:100%; padding:10px 12px; border:1.5px solid #cbd5e1; border-radius:8px; font-size:0.9rem;">
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Simpan & Kirim Notif Email',
    cancelButtonText: 'Batal',
    confirmButtonColor: '#16a34a',
    customClass: {
      popup: 'swal-custom-popup',
      confirmButton: 'swal-custom-confirm'
    },
    preConfirm: () => {
      const email = document.getElementById('swalNewEmail')?.value?.trim().toLowerCase();
      const storeName = document.getElementById('swalNewStore')?.value?.trim();
      const plan = document.getElementById('swalNewPlan')?.value;
      const quotaTotal = Number(document.getElementById('swalNewQuota')?.value || 100);
      const password = document.getElementById('swalNewPwd')?.value?.trim();

      if (!email || !email.endsWith('@gmail.com') || email.length < 11) {
        Swal.showValidationMessage('Wajib memasukkan email Google (@gmail.com) yang valid!');
        return false;
      }
      if (password && password.length > 20) {
        Swal.showValidationMessage('Password maksimal 20 karakter!');
        return false;
      }
      return { email, storeName, plan, quotaTotal, password };
    }
  });

  if (!formValues) return;

  showToast('Membuat akun & mengirim email notifikasi...', 'info');
  const res = await apiCall('/api/admin/create-user', 'POST', formValues);
  if (res && res.success) {
    showAlert(res.message || 'Akun berhasil ditambahkan!', 'success');
    loadAdminData();
  } else {
    showAlert('Gagal membuat akun: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

async function handleAdminDeleteUser(userId, email) {
  const ok = await showConfirm(
    'Hapus Akun Email Permanen?',
    `Apakah Super Admin yakin ingin menghapus akun ${email} (#${userId}) beserta seluruh sesi dan data knowledge-nya?`,
    'Ya, Hapus Permanen'
  );
  if (!ok) return;

  const res = await apiCall('/api/admin/delete-user', 'POST', { userId });
  if (res && res.success) {
    showToast(`Akun ${email} berhasil dihapus!`, 'success');
    closeAdminUserModal();
    loadAdminData();
  } else {
    showAlert('Gagal menghapus akun: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

async function handleAdminDeleteUserFromModal() {
  const userId = document.getElementById('editUserId')?.value;
  const email = document.getElementById('editUserEmail')?.value || 'akun ini';
  if (!userId) return;
  await handleAdminDeleteUser(userId, email);
}

async function handleAdminChangePassword(e) {
  e.preventDefault();
  const pwdInput = document.getElementById('adminNewPassword');
  const confirmInput = document.getElementById('adminConfirmPassword');
  const btn = document.getElementById('btnAdminSavePwd');

  const newPassword = (pwdInput?.value || '').trim();
  const confirmPassword = (confirmInput?.value || '').trim();

  if (!newPassword || newPassword.length < 6) {
    showAlert('Password baru minimal 6 karakter.', 'warning');
    return;
  }

  if (newPassword.length > 20) {
    showAlert('Password maksimal 20 karakter.', 'warning');
    return;
  }

  if (newPassword !== confirmPassword) {
    showAlert('Konfirmasi password tidak cocok dengan password baru.', 'warning');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Menyimpan ke Cloud...</span>';
  }

  const res = await apiCall('/api/admin/change-password', 'POST', { newPassword });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Perbarui Password Super Admin</span>';
  }

  if (res && res.success) {
    showAlert('Password Super Admin berhasil diperbarui di Cloud!', 'success');
    if (pwdInput) pwdInput.value = '';
    if (confirmInput) confirmInput.value = '';
  } else {
    showAlert('Gagal: ' + (res?.error || 'Kesalahan sistem saat memperbarui password.'), 'error');
  }
}

async function handleAdminAddQuota(userId, email) {
  const ok = await showConfirm(
    'Tambah Kuota Akun',
    `Tambahkan +1.000 kuota balasan otomatis dan perpanjang 30 hari untuk ${email}?`,
    'Ya, Tambahkan'
  );
  if (!ok) return;

  const res = await apiCall('/api/admin/update-user', 'POST', {
    userId,
    quota_total: 1000,
    daysToAdd: 30
  });

  if (res && res.success) {
    showToast(`Kuota ${email} berhasil ditambah +1.000!`, 'success');
    loadAdminData();
  } else {
    showAlert('Gagal: ' + (res?.error || 'Kesalahan sistem'), 'error');
  }
}

// ==============================================================
// GLOBAL EXPORTS UNTUK EVENT HANDLERS
// ==============================================================
window.switchView = switchView;
window.goToCheckoutStep = goToCheckoutStep;
window.handleStep1Next = handleStep1Next;
window.handleStep2Next = handleStep2Next;
window.openCheckout = openCheckout;
window.handleCheckoutBackClick = handleCheckoutBackClick;
window.selectCheckoutPlan = selectCheckoutPlan;
window.handleCheckoutSubmit = handleCheckoutSubmit;
window.reopenMidtransSnap = reopenMidtransSnap;
window.checkActiveOrderPayment = checkActiveOrderPayment;
window.goToLoginWithEmail = goToLoginWithEmail;
window.copyPasswordDefault = copyPasswordDefault;
window.fillDefaultCredentials = fillDefaultCredentials;
window.togglePasswordVisibility = togglePasswordVisibility;
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.switchTab = switchTab;
window.loadData = loadData;
window.loadUserData = loadUserData;
window.logoutWhatsApp = logoutWhatsApp;
window.simulateWaConnected = simulateWaConnected;
window.handleTeachSubmit = handleTeachSubmit;
window.startEditKnowledge = startEditKnowledge;
window.cancelEditMode = cancelEditMode;
window.deleteKnowledge = deleteKnowledge;
window.filterKnowledgeList = filterKnowledgeList;
window.saveStoreSettings = saveStoreSettings;
window.handleUpdateProfile = handleUpdateProfile;
window.handleAdminChangePassword = handleAdminChangePassword;
window.handleAdminAddQuota = handleAdminAddQuota;
window.loadAdminData = loadAdminData;
window.filterAdminUsersTable = filterAdminUsersTable;
window.filterAdminKnowledge = filterAdminKnowledge;
window.handleAdminDeleteKnowledge = handleAdminDeleteKnowledge;
window.switchAdminSection = switchAdminSection;
window.openSuperAdminPage = openSuperAdminPage;
window.setVisitorChartMode = setVisitorChartMode;
window.handleVisitorYearChange = handleVisitorYearChange;
window.openAdminUserDetail = openAdminUserDetail;
window.closeAdminUserModal = closeAdminUserModal;
window.switchModalTab = switchModalTab;
window.handleAdminSaveUserChanges = handleAdminSaveUserChanges;
window.openAdminCreateUserModal = openAdminCreateUserModal;
window.handleAdminDeleteUser = handleAdminDeleteUser;
window.handleAdminDeleteUserFromModal = handleAdminDeleteUserFromModal;
window.filterAdminNotifications = filterAdminNotifications;
window.handleAdminDeleteNotification = handleAdminDeleteNotification;
window.handleAdminClearNotifications = handleAdminClearNotifications;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.showToast = showToast;
window.handleUserSubmit = handleUserSubmit;
window.askQuick = askQuick;
window.exportDataJSON = exportDataJSON;
window.pollWhatsAppStatus = pollWhatsAppStatus;

// ==============================================================
// MODAL DAFTAR GRATIS INTERAKTIF, AUTO-DETECT GOOGLE & FIREWALL
// ==============================================================
const CLIENT_BLOCKED_PATTERNS = [
  /\.php\b/i,
  /<\?php/i,
  /<\?=/,
  /<script\b/i,
  /javascript\s*:/i,
  /\bonerror\s*=/i,
  /\bonload\s*=/i,
  /\bunion\s+select\b/i,
  /\bdrop\s+table\b/i,
  /\.\.\//
];

function isMaliciousClientInput(val = '') {
  if (!val || typeof val !== 'string') return false;
  return CLIENT_BLOCKED_PATTERNS.some(p => p.test(val));
}

function getDetectedDeviceGoogleAccounts() {
  const accounts = new Set();
  try {
    const savedList = JSON.parse(localStorage.getItem('artapos_detected_gmails') || '[]');
    if (Array.isArray(savedList)) {
      savedList.forEach(em => {
        if (typeof em === 'string' && em.endsWith('@gmail.com')) accounts.add(em.toLowerCase());
      });
    }
  } catch (e) { }

  const lastEm = (localStorage.getItem('artapos_last_email') || '').trim().toLowerCase();
  if (lastEm && lastEm.endsWith('@gmail.com')) accounts.add(lastEm);

  try {
    const u = JSON.parse(localStorage.getItem('artapos_user') || 'null');
    if (u && u.email && u.email.endsWith('@gmail.com')) accounts.add(u.email.toLowerCase());
  } catch (e) { }

  return Array.from(accounts);
}

function rememberDetectedGmail(email) {
  if (!email || !email.endsWith('@gmail.com')) return;
  const clean = email.trim().toLowerCase();
  const list = getDetectedDeviceGoogleAccounts();
  if (!list.includes(clean)) list.unshift(clean);
  localStorage.setItem('artapos_detected_gmails', JSON.stringify(list.slice(0, 5)));
}

function renderDetectedGoogleAccountsInModal() {
  const container = document.getElementById('detectedGoogleAccountsList');
  const emailInput = document.getElementById('freeEmail');
  if (!container) return;

  const accounts = getDetectedDeviceGoogleAccounts();
  if (accounts.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Otomatis isi input email dengan akun Google terakhir di perangkat jika masih kosong
  if (emailInput && !emailInput.value) {
    emailInput.value = accounts[0];
  }

  container.innerHTML = accounts.map(em => {
    const initial = em[0].toUpperCase();
    const namePart = em.split('@')[0];
    return `
      <div class="google-account-chip-card" onclick="quickSelectDetectedGmail('${em}')" title="Klik untuk langsung daftar dengan ${em}">
        <div class="g-chip-avatar">${initial}</div>
        <div class="g-chip-info">
          <div class="g-chip-name">${namePart}</div>
          <div class="g-chip-email">${em}</div>
        </div>
        <span class="g-chip-action">Pakai Akun</span>
      </div>
    `;
  }).join('');
}

async function quickSelectDetectedGmail(email) {
  const emailInput = document.getElementById('freeEmail');
  const storeInput = document.getElementById('freeStoreName');
  if (emailInput) emailInput.value = email;
  const storeName = (storeInput?.value || 'Toko AI Assistant').trim();
  await executeFreeRegistration(email, storeName);
}

async function openFreeRegisterModal() {
  trackCtaEvent('cta_register');
  const modal = document.getElementById('modalFreeRegister');
  if (modal) {
    modal.classList.remove('hidden');
    renderDetectedGoogleAccountsInModal();

    // Coba deteksi kredensial otomatis dari browser / HP jika tersedia
    if (window.navigator && navigator.credentials && navigator.credentials.get) {
      try {
        const cred = await navigator.credentials.get({ password: true, mediation: 'Silent' });
        if (cred && cred.id && cred.id.endsWith('@gmail.com')) {
          rememberDetectedGmail(cred.id);
          renderDetectedGoogleAccountsInModal();
        }
      } catch (e) { }
    }

    const emailInput = document.getElementById('freeEmail');
    if (emailInput && !emailInput.value) emailInput.focus();
  }
}

function closeFreeRegisterModal() {
  const modal = document.getElementById('modalFreeRegister');
  if (modal) modal.classList.add('hidden');
}

async function executeFreeRegistration(email, storeName) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanStore = (storeName || 'Toko AI Assistant').trim();

  if (isMaliciousClientInput(cleanEmail) || isMaliciousClientInput(cleanStore)) {
    showAlert('🛡️ Proteksi Keamanan: Input mengandung skrip terlarang (.php / XSS / SQL Injection) dan telah diblokir!', 'error');
    return;
  }

  if (cleanEmail.length > 100 || cleanStore.length > 100) {
    showAlert('Panjang input maksimal 100 karakter.', 'warning');
    return;
  }

  if (!cleanEmail || !cleanEmail.endsWith('@gmail.com') || cleanEmail.length < 11) {
    showAlert('Wajib menggunakan alamat email Google (@gmail.com) yang valid.', 'warning');
    return;
  }

  const btn = document.getElementById('btnSubmitFreeReg');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Mengirim Password ke Email Google...</span>';
  }

  const res = await apiCall('/api/auth/register-free', 'POST', {
    email: cleanEmail,
    storeName: cleanStore
  });

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>Daftar Gratis & Kirim Sandi ke Email</span>';
  }

  if (res && res.success) {
    rememberDetectedGmail(cleanEmail);
    localStorage.setItem('artapos_last_email', cleanEmail);
    closeFreeRegisterModal();

    // Arahkan ke halaman Login dan isi otomatis emailnya
    switchView('login');
    const loginEmailEl = document.getElementById('loginEmail');
    const loginPwdEl = document.getElementById('loginPassword');
    if (loginEmailEl) loginEmailEl.value = cleanEmail;
    if (loginPwdEl) {
      loginPwdEl.value = '';
      setTimeout(() => loginPwdEl.focus(), 300);
    }

    await Swal.fire({
      icon: 'success',
      title: '🎉 Berhasil Didaftarkan!',
      html: `
        <div style="text-align:left; font-size:0.93rem; line-height:1.6; color:#334155;">
          <p style="margin-bottom:10px;">Akun baru dengan <b>10 Template Bot</b> untuk <b>${cleanEmail}</b> telah aktif!</p>
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
            📩 <b>Cek Email Masuk / Folder Spam:</b><br>
            Kami telah mengirimkan <b>Password Login</b> Anda melalui email resmi <code>artapos26@gmail.com</code>.
          </div>
          <p style="margin:0; font-size:0.85rem; color:#64748b;">Silakan masukkan password dari email tersebut pada halaman Login ini untuk memindai Kode QR WhatsApp Anda.</p>
        </div>
      `,
      confirmButtonText: 'Siap, Masuk Sekarang',
      confirmButtonColor: '#16a34a',
      customClass: {
        popup: 'swal-custom-popup',
        confirmButton: 'swal-custom-confirm'
      }
    });
  } else {
    showAlert('Gagal Mendaftar: ' + (res?.error || 'Terjadi kesalahan saat mendaftarkan akun.'), 'error');
  }
}

async function handleFreeRegisterSubmit(e) {
  e.preventDefault();
  const emailInput = document.getElementById('freeEmail');
  const storeInput = document.getElementById('freeStoreName');
  const email = (emailInput?.value || '').trim().toLowerCase();
  const storeName = (storeInput?.value || 'Toko AI Assistant').trim();
  await executeFreeRegistration(email, storeName);
}

async function handleGoogleInstantRegister() {
  // 1. Coba tarik akun dari Credential Manager Browser/HP secara otomatis
  if (window.navigator && navigator.credentials && navigator.credentials.get) {
    try {
      const cred = await navigator.credentials.get({ password: true, mediation: 'optional' });
      if (cred && cred.id && cred.id.endsWith('@gmail.com')) {
        rememberDetectedGmail(cred.id);
        await quickSelectDetectedGmail(cred.id);
        return;
      }
    } catch (e) { }
  }

  // 2. Jika sudah ada email di kotak input atau akun terdeteksi di perangkat, tampilkan Google Account Chooser Interaktif
  const emailInput = document.getElementById('freeEmail');
  const currentVal = (emailInput?.value || '').trim().toLowerCase();
  if (currentVal && currentVal.endsWith('@gmail.com')) {
    await quickSelectDetectedGmail(currentVal);
    return;
  }

  const detected = getDetectedDeviceGoogleAccounts();
  if (detected.length > 0) {
    await quickSelectDetectedGmail(detected[0]);
    return;
  }

  // 3. Jika perangkat benar-benar baru pertama kali dan belum ada cache akun, fokus ke input dengan autofill HP aktif
  if (emailInput) {
    emailInput.focus();
    emailInput.click();
    showToast('Silakan sentuh email Google yang muncul di saran keyboard HP/Browser Anda.', 'info');
  }
}

window.openFreeRegisterModal = openFreeRegisterModal;
window.closeFreeRegisterModal = closeFreeRegisterModal;
window.handleFreeRegisterSubmit = handleFreeRegisterSubmit;
window.handleGoogleInstantRegister = handleGoogleInstantRegister;
window.quickSelectDetectedGmail = quickSelectDetectedGmail;

// ==============================================================
// TAMPILAN LAYAR PENOLAKAN (403, 404) & MODE OFFLINE
// ==============================================================
function showErrorStateView(typeOrCode = 404, customMessage = null, customPath = null) {
  const iconWrap = document.getElementById('errorStateIconWrap');
  const emojiEl = document.getElementById('errorStateEmoji');
  const badgeEl = document.getElementById('errorStateBadge');
  const codeEl = document.getElementById('errorStateCode');
  const titleEl = document.getElementById('errorStateTitle');
  const descEl = document.getElementById('errorStateDesc');
  const pathEl = document.getElementById('errorStatePathBox');

  const key = String(typeOrCode).toLowerCase();

  if (key === '403' || key === 'forbidden') {
    if (iconWrap) { iconWrap.style.background = '#fef2f2'; iconWrap.style.borderColor = '#fecaca'; }
    if (emojiEl) emojiEl.textContent = '🛡️';
    if (badgeEl) {
      badgeEl.style.background = '#fef2f2';
      badgeEl.style.color = '#b91c1c';
      badgeEl.style.borderColor = '#fecaca';
      badgeEl.textContent = '🛡️ FIREWALL KEAMANAN • 403 FORBIDDEN';
    }
    if (codeEl) { codeEl.style.color = '#dc2626'; codeEl.textContent = '403'; }
    if (titleEl) titleEl.textContent = 'Akses Ditolak oleh Sistem Keamanan';
    if (descEl) descEl.textContent = customMessage || 'Maaf, halaman atau fitur ini terkunci. Sistem keamanan berlapis artapos.id menolak akses tanpa otorisasi atau mendeteksi pelanggaran kebijakan 1 Perangkat 1 Akun.';
    if (pathEl) pathEl.textContent = customPath || `Status: 403 Forbidden • URL: ${window.location.href}`;
  } else if (key === 'offline') {
    setNetworkOfflineState(true);
    return;
  } else {
    if (iconWrap) { iconWrap.style.background = '#f0fdf4'; iconWrap.style.borderColor = '#bbf7d0'; }
    if (emojiEl) emojiEl.textContent = '🔍';
    if (badgeEl) {
      badgeEl.style.background = '#f0fdf4';
      badgeEl.style.color = '#15803d';
      badgeEl.style.borderColor = '#bbf7d0';
      badgeEl.textContent = '🔍 HALAMAN TIDAK DITEMUKAN • 404 NOT FOUND';
    }
    if (codeEl) { codeEl.style.color = '#0f172a'; codeEl.textContent = '404'; }
    if (titleEl) titleEl.textContent = 'Halaman Tidak Ditemukan';
    if (descEl) descEl.textContent = customMessage || 'Maaf, halaman atau alamat URL yang Anda cari tidak ditemukan di sistem artapos.id. Silakan kembali ke halaman beranda atau dashboard Anda.';
    if (pathEl) pathEl.textContent = customPath || `Status: 404 Not Found • URL: ${window.location.href}`;
  }

  switchView('error');
}

function handleErrorStateBackHome() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname);
  }
  if (isLoggedInSession()) {
    switchView('dashboard');
  } else {
    switchView('landing');
  }
}

async function retryNetworkConnection() {
  showToast('🔄 Memeriksa sambungan ke server artapos.id...', 'info');
  if (!navigator.onLine) {
    setNetworkOfflineState(true);
    return;
  }
  try {
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    if (res.ok) {
      setNetworkOfflineState(false);
      showToast('🟢 Terhubung kembali ke server artapos.id!', 'success');
      if (currentActiveView === 'error') {
        handleErrorStateBackHome();
      } else if (currentActiveView === 'dashboard') {
        loadUserData();
        loadData();
        if (currentActiveTab === 'superadmin') loadAdminData();
      }
      return;
    }
  } catch (e) { }
  if (!navigator.onLine) setNetworkOfflineState(true);
}

window.showErrorStateView = showErrorStateView;
window.handleErrorStateBackHome = handleErrorStateBackHome;
window.retryNetworkConnection = retryNetworkConnection;

const VALID_APP_HASHES = ['', 'landing', 'login', 'checkout', 'dashboard', 'hero', 'fitur', 'cara-kerja', 'harga', 'faq', 'features', 'how-it-works', 'pricing'];

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (hash === '403') {
    showErrorStateView(403);
  } else if (hash === '404') {
    showErrorStateView(404);
  } else if (hash === 'offline') {
    showErrorStateView('offline');
  } else if (hash && !VALID_APP_HASHES.includes(hash)) {
    showErrorStateView(404, `Rute halaman "#${hash}" tidak ditemukan di aplikasi artapos.id.`, `Rute Tidak Dikenal: /#${hash}`);
  }
});

function updateAnalyticsCrosshair(el) {
  if (!el) return;
  const x = el.getAttribute('data-x');
  const y = el.getAttribute('data-y');
  const lbl = el.getAttribute('data-label') || '';
  const vis = Number(el.getAttribute('data-vis') || 0).toLocaleString('id-ID');
  const reg = Number(el.getAttribute('data-reg') || 0).toLocaleString('id-ID');
  const nw = Number(el.getAttribute('data-new') || 0).toLocaleString('id-ID');

  const line = document.getElementById('chartCrosshairLine');
  const dot = document.getElementById('chartCrosshairDot');
  const tip = document.getElementById('analyticsChartTooltip');
  if (line) { line.setAttribute('x1', x); line.setAttribute('x2', x); }
  if (dot) { dot.setAttribute('cx', x); dot.setAttribute('cy', y); }
  if (tip) {
    tip.innerHTML = `<strong>${escapeHtml(lbl)}</strong> • ${vis} Pengunjung · ${reg} Klik Daftar · ${nw} Pendaftar`;
  }
}

window.updateAnalyticsCrosshair = updateAnalyticsCrosshair;
window.setAnalyticsRange = setAnalyticsRange;
window.setOverviewWaFilter = setOverviewWaFilter;
window.renderOverviewUsersTable = renderOverviewUsersTable;
window.exportAdminAnalyticsCSV = exportAdminAnalyticsCSV;

function detectClientTrafficSource() {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = (params.get('utm_source') || '').toLowerCase();
    const ref = (document.referrer || '').toLowerCase();
    const combined = `${utm} ${ref}`;
    if (combined.includes('tiktok')) return 'TikTok';
    if (combined.includes('google')) return 'Google Search';
    if (combined.includes('instagram') || combined.includes('ig.me')) return 'Instagram';
  } catch (e) { }
  return 'Direct';
}

function trackCtaEvent(eventType) {
  try {
    apiCall('/api/track-event', 'POST', {
      eventType,
      pageView: currentActiveView || 'landing',
      trafficSource: detectClientTrafficSource()
    }).catch(() => { });
  } catch (e) { }
}

// ==============================================================
// INISIALISASI APLIKASI DENGAN PERSISTENCE LOCK
// ==============================================================
async function initApp() {
  console.log('🚀 [INIT] Memuat artapos.id Security Engine...');
  loadDynamicPlans(false);

  if (!navigator.onLine) {
    setNetworkOfflineState(true);
  }

  // Tangkap ?ref=KODE dari URL undangan teman
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refParam = (urlParams.get('ref') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    if (refParam && refParam.length >= 3) {
      localStorage.setItem('artapos_pending_ref', refParam);
    }
  } catch (e) { }

  const token = localStorage.getItem('artapos_token');
  const hash = window.location.hash.replace('#', '').toLowerCase();

  // Jika hash mengarah ke #403, #404, #offline, atau rute asing yang tidak dikenal -> Tampilkan Layar Error
  if (hash === '403') {
    showErrorStateView(403);
    return;
  } else if (hash === '404') {
    showErrorStateView(404);
    return;
  } else if (hash === 'offline') {
    showErrorStateView('offline');
    return;
  } else if (hash && !VALID_APP_HASHES.includes(hash)) {
    showErrorStateView(404, `Rute halaman "#${hash}" tidak ditemukan di aplikasi artapos.id.`, `Rute Tidak Dikenal: /#${hash}`);
    return;
  }

  // Saat klik link utama (tanpa #dashboard), biarkan di Landing Page dulu & ubah tombol "Masuk" jadi "🚀 Dashboard"
  syncLandingAuthButtons();
  if (token && hash === 'dashboard') {
    switchView('dashboard');
    await loadUserData();
  } else if (hash === 'login' && !token) {
    switchView('login');
  } else if (hash === 'checkout') {
    switchView('checkout');
  } else {
    switchView('landing');
    if (token) {
      loadUserData().then(() => syncLandingAuthButtons()).catch(() => {});
    }
  }

  // Catat +1 Kunjungan Website secara Real-Time setiap halaman dibuka
  apiCall('/api/track-visit', 'POST', {
    pageView: currentActiveView || 'landing',
    email: currentUser ? currentUser.email : 'Pengunjung',
    trafficSource: detectClientTrafficSource()
  }).catch(() => { });

  if (token) {
    loadData();
    pollWhatsAppStatus();
  } else {
    scheduleNextWaPoll();
  }

  const welcomeTime = document.getElementById('welcomeTime');
  if (welcomeTime) welcomeTime.textContent = getCurrentTime();
}

// ==============================================================
// SAKLAR BOT ON/OFF, KLAIM 75 TOKEN GRATIS, & KODE REDEEM
// ==============================================================
let lastBotToggleAt = 0;

function applyBotSwitchUI(enabled) {
  const sw = document.getElementById('botToggleSwitch');
  const txt = document.getElementById('botSwitchStatusText');
  const metric = document.getElementById('metricBotAutoReplyText');
  const isOn = Boolean(enabled);
  if (sw) sw.checked = isOn;
  if (txt) {
    txt.innerHTML = isOn
      ? '🟢 Bot Aktif — Membalas pesan pelanggan otomatis'
      : '⏸️ Bot Nonaktif — WhatsApp tetap terhubung tapi bot diam';
  }
  if (metric) {
    metric.textContent = isOn ? 'Aktif 24 Jam Nonstop' : 'Nonaktif (Saklar OFF)';
    metric.style.color = isOn ? '' : '#b45309';
  }
}

async function handleToggleBotSwitch(enabled) {
  lastBotToggleAt = Date.now();
  applyBotSwitchUI(enabled);
  const res = await apiCall('/api/bot/toggle', 'POST', { enabled: Boolean(enabled) });
  if (res && res.success) {
    if (currentUser) currentUser.bot_enabled = Boolean(enabled);
    showToast(res.message || (enabled ? 'Bot diaktifkan.' : 'Bot dinonaktifkan.'), enabled ? 'success' : 'info');
  } else {
    applyBotSwitchUI(!enabled);
    showAlert('Gagal mengubah saklar bot: ' + (res?.error || 'Kesalahan server'), 'error');
  }
}

async function handleClaimFreeTokens() {
  const btn = document.getElementById('btnClaimFreeTokens');
  if (btn) { btn.disabled = true; btn.textContent = 'Memeriksa Akun & Perangkat...'; }
  try {
    const res = await apiCall('/api/auth/claim-free-token', 'POST', {});
    if (res && res.success) {
      await loadUserData();
      showAlert(res.message || '🎉 75 Token Gratis berhasil diklaim!', 'success', 'Klaim Berhasil!');
    } else {
      showAlert(res?.error || 'Klaim token gratis ditolak.', 'error', 'Tidak Dapat Klaim');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Klaim 75 Token Gratis'; }
  }
}

let refCheckTimer = null;
function checkReferralCodeLive(val) {
  const statusEl = document.getElementById('referralCheckStatus');
  const clean = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const input = document.getElementById('referralCreateInput');
  if (input && input.value !== clean) input.value = clean;

  if (!statusEl) return;
  if (!clean) {
    statusEl.textContent = '';
    statusEl.className = 'referral-check-msg';
    return;
  }
  if (clean.length < 3) {
    statusEl.textContent = 'Minimal 3 karakter (maksimal 10 karakter).';
    statusEl.className = 'referral-check-msg warn';
    return;
  }

  statusEl.textContent = '⏳ Mengecek ketersediaan kode di database...';
  statusEl.className = 'referral-check-msg checking';

  if (refCheckTimer) clearTimeout(refCheckTimer);
  refCheckTimer = setTimeout(async () => {
    const res = await apiCall(`/api/referral/check?code=${encodeURIComponent(clean)}`, 'GET');
    if (!res) return;
    if (res.available) {
      statusEl.textContent = res.message || `✅ Kode "${clean}" tersedia!`;
      statusEl.className = 'referral-check-msg ok';
    } else {
      statusEl.textContent = res.message || `❌ Kode "${clean}" sudah dipakai.`;
      statusEl.className = 'referral-check-msg err';
    }
  }, 280);
}

async function loadReferralStatus() {
  const res = await apiCall('/api/referral/status', 'GET');
  if (!res || !res.success) return;

  const createBox = document.getElementById('referralCreateBox');
  const shareBox = document.getElementById('referralShareBox');
  const codeDisp = document.getElementById('myReferralCodeDisplay');
  const linkInput = document.getElementById('myReferralLinkInput');
  const statsText = document.getElementById('myReferralStatsText');
  const redeemedList = document.getElementById('redeemedCodesList');

  if (res.ownCode) {
    if (createBox) createBox.classList.add('hidden');
    if (shareBox) shareBox.classList.remove('hidden');
    if (codeDisp) codeDisp.textContent = res.ownCode;
    const shareUrl = `${window.location.origin}/?ref=${res.ownCode}`;
    if (linkInput) linkInput.value = shareUrl;
    if (statsText) statsText.textContent = `${res.totalInvited || 0} teman bergabung • +${(res.totalBonusEarned || 0).toLocaleString('id-ID')} Token didapat`;
  } else {
    if (createBox) createBox.classList.remove('hidden');
    if (shareBox) shareBox.classList.add('hidden');
  }

  if (redeemedList) {
    const rows = Array.isArray(res.redeemedCodes) ? res.redeemedCodes : [];
    const todayUsed = Number(res.todayRedeemedCount || 0);
    const dailyMax = Number(res.dailyRedeemLimit || 2);
    const quotaChip = `<span style="font-size:0.74rem; color:#475569; font-weight:700;">Kuota Hari Ini: ${todayUsed}/${dailyMax}</span> `;
    if (rows.length > 0) {
      redeemedList.innerHTML = quotaChip + `<span style="font-size:0.75rem; color:#64748b; font-weight:700;">• Sudah diredeem:</span> ` +
        rows.map(r => `<span class="redeem-chip-done">✓ ${escapeHtml(r.referral_code)} (+${r.reward_redeemer || 50})</span>`).join('');
    } else {
      redeemedList.innerHTML = quotaChip;
    }
  }

  // Isi otomatis kode dari link undangan (?ref=KODE) jika ada
  const pendingRef = localStorage.getItem('artapos_pending_ref');
  const redeemInput = document.getElementById('referralRedeemInput');
  if (pendingRef && redeemInput && !redeemInput.value && pendingRef !== res.ownCode) {
    redeemInput.value = pendingRef;
  }
}

async function handleCreateReferralCode() {
  const input = document.getElementById('referralCreateInput');
  const code = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3 || code.length > 10) {
    showAlert('Kode harus 3–10 karakter (huruf/angka tanpa spasi).', 'warning');
    return;
  }
  const ok = await showConfirm('Buat Kode Permanen', `Kode "${code}" hanya bisa dibuat 1 kali dan bersifat permanen. Lanjutkan?`, 'Ya, Buat Permanen');
  if (!ok) return;

  const res = await apiCall('/api/referral/create', 'POST', { code });
  if (res && res.success) {
    showAlert(res.message || `Kode "${res.code}" berhasil dibuat!`, 'success');
    await loadReferralStatus();
  } else {
    showAlert(res?.error || 'Gagal membuat kode undangan.', 'error');
  }
}

async function handleRedeemReferralCode() {
  const input = document.getElementById('referralRedeemInput');
  const code = (input?.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3 || code.length > 10) {
    showAlert('Masukkan kode teman yang valid (3–10 karakter).', 'warning');
    return;
  }
  const btn = document.getElementById('btnRedeemReferral');
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }
  try {
    const deviceFingerprint = typeof getClientDeviceFingerprint === 'function' ? getClientDeviceFingerprint() : '';
    const res = await apiCall('/api/referral/redeem', 'POST', { code, deviceFingerprint });
    if (res && res.success) {
      if (input) input.value = '';
      localStorage.removeItem('artapos_pending_ref');
      await loadUserData();
      showAlert(res.message || '🎉 Berhasil redeem +50 Token Free!', 'success', 'Redeem Berhasil!');
    } else {
      showAlert(res?.error || 'Gagal me-redeem kode.', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Redeem (+50)'; }
  }
}

function copyReferralLink() {
  const linkInput = document.getElementById('myReferralLinkInput');
  if (!linkInput || !linkInput.value) return;
  navigator.clipboard?.writeText(linkInput.value).catch(() => { });
  showToast('📋 Link undangan berhasil disalin!', 'success');
}

function shareReferralWhatsApp() {
  const linkInput = document.getElementById('myReferralLinkInput');
  const code = document.getElementById('myReferralCodeDisplay')?.textContent || '';
  const url = linkInput?.value || window.location.origin;
  const text = `Mau token gratis AI WhatsApp di artapos.id? Daftar sekarang dan masukkan kode undangan *${code}* untuk dapat +50 Token Free! Klik: ${url}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

window.handleToggleBotSwitch = handleToggleBotSwitch;
window.handleClaimFreeTokens = handleClaimFreeTokens;
window.checkReferralCodeLive = checkReferralCodeLive;
window.handleCreateReferralCode = handleCreateReferralCode;
window.handleRedeemReferralCode = handleRedeemReferralCode;
window.copyReferralLink = copyReferralLink;
window.shareReferralWhatsApp = shareReferralWhatsApp;

// ==============================================================
// LUPA PASSWORD (3 STEP: EMAIL REALTIME -> OTP -> PW BARU KUAT)
// ==============================================================
let forgotEmailTimer = null;
let forgotVerifiedEmail = '';
let forgotVerifiedCode = '';

function openForgotPasswordModal() {
  switchView('forgot-password');
  goToForgotStep(1);
  const loginEmail = (document.getElementById('loginEmail')?.value || '').trim();
  const fEmail = document.getElementById('forgotEmail');
  if (fEmail) {
    fEmail.value = loginEmail;
    checkForgotEmailLive(loginEmail);
    setTimeout(() => fEmail.focus(), 100);
  }
}

function closeForgotPasswordModal() {
  switchView('login');
}

function goToForgotStep(step) {
  [1, 2, 3].forEach(n => {
    const el = document.getElementById(`forgotStep${n}`);
    if (el) el.classList.toggle('hidden', n !== step);
  });
}

function hasForbiddenFilePattern(val) {
  const s = String(val || '');
  return isMaliciousClientInput(s) || /\.(php|html?|js|exe|sh)\b/i.test(s) || /[<>]/.test(s);
}

function checkForgotEmailLive(val) {
  const statusEl = document.getElementById('forgotEmailStatus');
  const btn = document.getElementById('btnForgotSendCode');
  const email = String(val || '').trim().toLowerCase();

  if (btn) btn.disabled = true;
  if (!statusEl) return;

  if (!email) {
    statusEl.textContent = '';
    statusEl.className = 'referral-check-msg';
    return;
  }
  if (email.length > 100) {
    statusEl.textContent = 'Maksimal 100 karakter.';
    statusEl.className = 'referral-check-msg err';
    return;
  }
  if (hasForbiddenFilePattern(email)) {
    statusEl.textContent = '⛔ Format/file terlarang (.php, .html, skrip) ditolak!';
    statusEl.className = 'referral-check-msg err';
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    statusEl.textContent = 'Ketik alamat email yang lengkap...';
    statusEl.className = 'referral-check-msg warn';
    return;
  }

  statusEl.textContent = '⏳ Memeriksa email di database...';
  statusEl.className = 'referral-check-msg checking';

  if (forgotEmailTimer) clearTimeout(forgotEmailTimer);
  forgotEmailTimer = setTimeout(async () => {
    const res = await apiCall(`/api/auth/forgot/check-email?email=${encodeURIComponent(email)}`, 'GET');
    if (!res) return;
    if (res.valid && res.registered) {
      statusEl.textContent = res.message || '✅ Email terdaftar! Silakan klik Minta Kode.';
      statusEl.className = 'referral-check-msg ok';
      if (btn) btn.disabled = false;
    } else {
      statusEl.textContent = res.message || '❌ Email tidak terdaftar.';
      statusEl.className = 'referral-check-msg err';
      if (btn) btn.disabled = true;
    }
  }, 280);
}

async function handleForgotSendCode() {
  const email = (document.getElementById('forgotEmail')?.value || '').trim().toLowerCase();
  const btn = document.getElementById('btnForgotSendCode');
  if (!email || hasForbiddenFilePattern(email) || email.length > 100) {
    showAlert('Masukkan email terdaftar yang valid.', 'warning');
    return;
  }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>Mengirim Kode ke Email...</span>'; }
  try {
    const res = await apiCall('/api/auth/forgot/send-code', 'POST', { email });
    if (res && res.success) {
      forgotVerifiedEmail = email;
      const lbl = document.getElementById('forgotTargetEmailLabel');
      if (lbl) lbl.textContent = `(${email})`;
      const otpInput = document.getElementById('forgotOtpCode');
      if (otpInput) otpInput.value = '';
      goToForgotStep(2);
      showToast(res.message || 'Kode 6 digit terkirim ke email Anda!', 'success');
    } else {
      showAlert(res?.error || 'Gagal mengirim kode.', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>Minta Kode</span>'; }
  }
}

async function handleForgotVerifyCode() {
  const code = (document.getElementById('forgotOtpCode')?.value || '').trim();
  const statusEl = document.getElementById('forgotOtpStatus');
  if (!code || code.length < 4 || hasForbiddenFilePattern(code)) {
    if (statusEl) { statusEl.textContent = 'Masukkan 6 digit kode dari email.'; statusEl.className = 'referral-check-msg err'; }
    return;
  }
  const btn = document.getElementById('btnForgotVerifyCode');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>Memeriksa Kode...</span>'; }
  try {
    const res = await apiCall('/api/auth/forgot/verify-code', 'POST', { email: forgotVerifiedEmail, code });
    if (res && res.success) {
      forgotVerifiedCode = code;
      const np = document.getElementById('forgotNewPwd');
      const cp = document.getElementById('forgotConfirmPwd');
      if (np) np.value = '';
      if (cp) cp.value = '';
      validateForgotPwdLive();
      goToForgotStep(3);
      showToast('Kode benar! Silakan buat password baru.', 'success');
    } else {
      if (statusEl) { statusEl.textContent = res?.error || 'Kode salah.'; statusEl.className = 'referral-check-msg err'; }
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>Verifikasi Kode</span>'; }
  }
}

function validateForgotPwdLive() {
  const pw = document.getElementById('forgotNewPwd')?.value || '';
  const cpw = document.getElementById('forgotConfirmPwd')?.value || '';
  const btn = document.getElementById('btnForgotResetSave');

  const okLen = pw.length >= 8 && pw.length <= 20;
  const okUpper = /[A-Z]/.test(pw);
  const okLower = /[a-z]/.test(pw);
  const okSymbol = /[^A-Za-z0-9\s]/.test(pw);
  const okSafe = !hasForbiddenFilePattern(pw);
  const okMatch = pw.length > 0 && pw === cpw;

  const setRule = (id, pass) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'fp-rule-item ' + (pass ? 'ok' : (pw.length > 0 ? 'bad' : ''));
  };
  setRule('fpRuleLen', okLen);
  setRule('fpRuleUpper', okUpper);
  setRule('fpRuleLower', okLower);
  setRule('fpRuleSymbol', okSymbol);
  setRule('fpRuleSafe', okSafe);
  setRule('fpRuleMatch', okMatch);

  if (btn) btn.disabled = !(okLen && okUpper && okLower && okSymbol && okSafe && okMatch);
}

async function handleForgotResetSubmit(e) {
  e.preventDefault();
  const newPassword = document.getElementById('forgotNewPwd')?.value || '';
  const btn = document.getElementById('btnForgotResetSave');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span>Menyimpan Password...</span>'; }
  try {
    const res = await apiCall('/api/auth/forgot/reset-password', 'POST', {
      email: forgotVerifiedEmail,
      code: forgotVerifiedCode,
      newPassword
    });
    if (res && res.success) {
      closeForgotPasswordModal();
      const loginEmail = document.getElementById('loginEmail');
      if (loginEmail) loginEmail.value = forgotVerifiedEmail;
      await Swal.fire({
        icon: 'success',
        title: 'Password Diperbarui!',
        text: res.message || 'Silakan login menggunakan password baru Anda.',
        confirmButtonColor: '#16a34a',
        didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '9999999'; }
      });
    } else {
      showAlert(res?.error || 'Gagal menyimpan password baru.', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>Simpan Password Baru</span>'; }
  }
}

window.openForgotPasswordModal = openForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.goToForgotStep = goToForgotStep;
window.checkForgotEmailLive = checkForgotEmailLive;
window.handleForgotSendCode = handleForgotSendCode;
window.handleForgotVerifyCode = handleForgotVerifyCode;
window.validateForgotPwdLive = validateForgotPwdLive;
window.handleForgotResetSubmit = handleForgotResetSubmit;

// ==============================================================
// LOG AKTIVITAS & REDEEM PER AKUN
// ==============================================================
let cachedUserActivityLogs = [];
let currentUserLogFilter = 'all';

async function loadUserActivityLogs(showToastMsg = false) {
  const res = await apiCall('/api/user/activity-logs', 'GET');
  if (res && res.success) {
    cachedUserActivityLogs = Array.isArray(res.logs) ? res.logs : [];
    renderUserActivityLogs();
    if (showToastMsg) showToast('Log aktivitas diperbarui.', 'success');
  }
}

function setUserLogFilter(filter) {
  currentUserLogFilter = filter || 'all';
  const map = {
    all: 'btnUserLogAll',
    REDEEM: 'btnUserLogRedeem',
    AUTH: 'btnUserLogAuth',
    WHATSAPP: 'btnUserLogWa'
  };
  Object.entries(map).forEach(([k, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', k === currentUserLogFilter);
  });
  renderUserActivityLogs();
}

function renderUserActivityLogs() {
  const container = document.getElementById('userActivityLogsList');
  if (!container) return;

  const list = cachedUserActivityLogs.filter(l => {
    const cat = String(l.category || '').toUpperCase();
    if (currentUserLogFilter === 'all') return true;
    if (currentUserLogFilter === 'REDEEM') return cat === 'REDEEM' || cat === 'REGISTER';
    if (currentUserLogFilter === 'AUTH') return cat === 'LOGIN' || cat === 'LOGOUT' || cat === 'AUTH';
    if (currentUserLogFilter === 'WHATSAPP') return cat === 'WHATSAPP';
    return true;
  });

  if (list.length === 0) {
    container.innerHTML = '<div class="user-log-empty">Belum ada riwayat aktivitas untuk filter ini.</div>';
    return;
  }

  container.innerHTML = list.map(l => {
    const cat = String(l.category || 'INFO').toUpperCase();
    const dt = l.created_at
      ? new Date(l.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '-';
    const dotClass = cat === 'REDEEM' ? 'green' : (cat === 'LOGOUT' ? 'slate' : (cat === 'WHATSAPP' ? 'emerald' : 'blue'));
    return `
      <div class="user-log-row">
        <span class="user-log-dot ${dotClass}"></span>
        <div class="user-log-body">
          <div class="user-log-row-head">
            <span class="user-log-title">${escapeHtml(l.title || '')}</span>
            <span class="user-log-time">${dt}</span>
          </div>
          <div class="user-log-msg">${escapeHtml(l.message || '')}</div>
        </div>
      </div>
    `;
  }).join('');
}

window.loadUserActivityLogs = loadUserActivityLogs;
window.setUserLogFilter = setUserLogFilter;

// ==============================================================
// CHAR COUNTERS, WHATSAPP FORMAT TOOLBAR, & CLOUDINARY UPLOAD
// ==============================================================
function updateTeachCharCounters() {
  const kw = document.getElementById('teachKeywords')?.value || '';
  const q = document.getElementById('teachQuestions')?.value || '';
  const ans = document.getElementById('teachAnswer')?.value || '';

  const kwEl = document.getElementById('kwCharCount');
  const qEl = document.getElementById('qCharCount');
  const ansEl = document.getElementById('ansCharCount');

  if (kwEl) kwEl.textContent = `${kw.length}/100`;
  if (qEl) qEl.textContent = `${q.length}/100`;
  if (ansEl) ansEl.textContent = `${ans.length}/250`;
}

function wrapWaFormat(prefix, suffix) {
  const el = document.getElementById('teachAnswer');
  if (!el) return;
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const val = el.value || '';
  const selected = val.slice(start, end) || 'teks';
  const next = val.slice(0, start) + prefix + selected + suffix + val.slice(end);
  if (next.length > 250) {
    showToast('Maksimal 250 karakter!', 'warning');
    return;
  }
  el.value = next;
  el.focus();
  updateTeachCharCounters();
}

function insertWaEmoji(emoji) {
  const el = document.getElementById('teachAnswer');
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + emoji + el.value.slice(end);
  if (next.length > 250) {
    showToast('Maksimal 250 karakter!', 'warning');
    return;
  }
  el.value = next;
  el.focus();
  updateTeachCharCounters();
}

function updateTeachImageQuotaUI(user) {
  const badge = document.getElementById('teachImageQuotaBadge');
  const btn = document.getElementById('btnPickTeachImage');
  const hint = document.getElementById('teachImageHintText');
  const limit = Number(user?.image_limit ?? 0);
  const used = Number(user?.image_used ?? 0);

  if (badge) badge.textContent = limit > 0 ? `${used}/${limit} Gambar` : 'Paket Gratis (0 Gambar)';
  if (btn) btn.disabled = limit <= 0;
  if (hint) {
    hint.textContent = limit <= 0
      ? 'Upgrade minimal Paket 25K (1 gambar) atau 35K (5 gambar) untuk upload gambar produk.'
      : `Tersisa ${Math.max(0, limit - used)} slot gambar di paket Anda (disimpan di Cloudinary).`;
  }
}

function setTeachImagePreview(url) {
  const hidden = document.getElementById('teachImageUrl');
  const wrap = document.getElementById('teachImagePreviewWrap');
  const img = document.getElementById('teachImagePreviewImg');
  if (hidden) hidden.value = url || '';
  if (img) img.src = url || '';
  if (wrap) wrap.classList.toggle('hidden', !url);
}

function clearTeachImage() {
  setTeachImagePreview('');
  const fileIn = document.getElementById('teachImageFileInput');
  if (fileIn) fileIn.value = '';
}

async function handleTeachImageSelected(input) {
  const file = input?.files?.[0];
  if (!file) return;
  if (/\.(php|html?|js|exe|sh)$/i.test(file.name)) {
    showAlert('⛔ File .php / .html / skrip ditolak!', 'error');
    input.value = '';
    return;
  }
  if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    showAlert('Wajib file gambar (PNG, JPG, WEBP).', 'warning');
    input.value = '';
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    showAlert('Ukuran gambar maksimal 3 MB.', 'warning');
    input.value = '';
    return;
  }

  const btn = document.getElementById('btnPickTeachImage');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Mengupload ke Cloudinary...'; }

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Gagal membaca file.'));
      reader.readAsDataURL(file);
    });
    const res = await apiCall('/api/upload-image', 'POST', { fileName: file.name, dataUrl });
    if (res && res.success && res.url) {
      setTeachImagePreview(res.url);
      if (currentUser) {
        currentUser.image_used = res.used;
        currentUser.image_limit = res.limit;
        updateTeachImageQuotaUI(currentUser);
      }
      showToast('✅ Gambar berhasil diupload ke Cloudinary!', 'success');
    } else {
      showAlert(res?.error || 'Gagal upload gambar.', 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🖼️ Pilih & Upload Gambar'; }
    input.value = '';
  }
}

window.updateTeachCharCounters = updateTeachCharCounters;
window.wrapWaFormat = wrapWaFormat;
window.insertWaEmoji = insertWaEmoji;
window.handleTeachImageSelected = handleTeachImageSelected;
window.clearTeachImage = clearTeachImage;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
