import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  dbGetAllKnowledge,
  dbAddKnowledge,
  dbUpdateKnowledge,
  dbDeleteKnowledge,
  dbGetUnanswered,
  dbAddUnanswered,
  dbDeleteUnanswered
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'knowledge.json');
const UNANSWERED_FILE = path.join(DATA_DIR, 'unanswered.json');

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

class KnowledgeManager {
  constructor() {
    this.knowledgeCache = [];
    this.lastCacheTime = 0;
    this.cacheTTL = 2000; // Cache 2 detik agar super cepat dan selalu sync dengan TiDB
  }

  /**
   * Muat data dari TiDB Cloud (dengan fallback file lokal jika offline)
   */
  async loadKnowledge() {
    const now = Date.now();
    if (this.knowledgeCache.length > 0 && (now - this.lastCacheTime < this.cacheTTL)) {
      return this.knowledgeCache;
    }

    try {
      const fromDb = await dbGetAllKnowledge();
      if (Array.isArray(fromDb) && fromDb.length > 0) {
        this.knowledgeCache = fromDb;
        this.lastCacheTime = now;
        // Backup ke lokal
        fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(fromDb, null, 2), 'utf-8');
        return fromDb;
      }
    } catch (e) {
      console.warn('⚠️ Gagal mengambil dari TiDB, menggunakan data lokal.');
    }

    // Fallback file lokal
    try {
      if (fs.existsSync(KNOWLEDGE_FILE)) {
        this.knowledgeCache = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf-8'));
        this.lastCacheTime = now;
        return this.knowledgeCache;
      }
    } catch (err) {}

    return [];
  }

  normalizeText(text) {
    if (!text) return '';
    let cleaned = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').map(w => ABBREVIATIONS[w] || w);
    return words.join(' ');
  }

  /**
   * Cari jawaban yang paling cocok dari TiDB Cloud berdasarkan userId pemilik toko
   */
  async findAnswer(userMessage, userId = null) {
    let list = [];
    if (userId) {
      try {
        list = await dbGetAllKnowledge(userId);
      } catch (e) {
        list = await this.loadKnowledge();
      }
    } else {
      list = await this.loadKnowledge();
    }
    const raw = userMessage.trim().toLowerCase();
    const normalized = this.normalizeText(userMessage);
    const userWords = new Set(normalized.split(' ').filter(w => w.length >= 2));

    let bestMatch = null;
    let highestScore = 0;

    for (const item of list) {
      let score = 0;

      // 1. Cek kalimat langsung
      for (const q of (item.questions || [])) {
        const cleanQ = q.trim().toLowerCase();
        const normQ = this.normalizeText(q);

        if (raw === cleanQ || normalized === normQ) {
          return { found: true, answer: item.answer, score: 1.0, item };
        }

        if (normQ.length >= 2 && (normalized.includes(normQ) || normQ.includes(normalized))) {
          score = Math.max(score, 0.90);
        }
      }

      // 2. Cek kata kunci
      if (item.keywords && item.keywords.length > 0) {
        let matchedCount = 0;
        for (const kw of item.keywords) {
          const normKw = this.normalizeText(kw);
          if (normKw.length >= 2) {
            if (userWords.has(normKw) || normalized.includes(normKw)) {
              matchedCount++;
            }
          }
        }

        if (matchedCount > 0) {
          const ratio = matchedCount / item.keywords.length;
          const kwScore = (matchedCount >= 2 ? 0.75 : 0.60) + (ratio * 0.25);
          score = Math.max(score, kwScore);
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    if (highestScore >= 0.45 && bestMatch) {
      return { found: true, answer: bestMatch.answer, score: highestScore, item: bestMatch };
    }

    return { found: false, answer: null, score: highestScore };
  }

  async addKnowledge({ questions, keywords = [], answer, category = 'umum' }) {
    this.lastCacheTime = 0; // Hancurkan cache agar langsung ambil baru
    const added = await dbAddKnowledge({ questions, keywords, answer, category });
    await this.loadKnowledge();
    return added;
  }

  async updateKnowledge(id, { questions, keywords = [], answer, category = 'umum' }) {
    this.lastCacheTime = 0;
    const updated = await dbUpdateKnowledge(id, { questions, keywords, answer, category });
    await this.loadKnowledge();
    return updated;
  }

  async deleteKnowledge(id) {
    this.lastCacheTime = 0;
    const deleted = await dbDeleteKnowledge(id);
    await this.loadKnowledge();
    return deleted;
  }

  async recordUnanswered(senderName, senderJid, question) {
    return await dbAddUnanswered(senderName, senderJid, question);
  }

  async getUnanswered() {
    return await dbGetUnanswered();
  }

  async clearUnanswered(id) {
    return await dbDeleteUnanswered(id);
  }
}

export const knowledgeManager = new KnowledgeManager();
