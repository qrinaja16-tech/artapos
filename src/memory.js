import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');
const CHAT_HISTORY_FILE = path.join(DATA_DIR, 'chat_history.json');

// Pastikan folder data tersedia
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inisialisasi file memori jangka panjang jika belum ada
if (!fs.existsSync(MEMORY_FILE)) {
  const initialMemories = [
    {
      id: 1,
      fact: "Saya adalah asisten AI pintar WhatsApp yang ramah, sopan, dan siap membantu menjawab pertanyaan.",
      category: "identitas",
      learnedAt: new Date().toISOString(),
      source: "system"
    }
  ];
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(initialMemories, null, 2), 'utf-8');
}

// Inisialisasi file riwayat percakapan jika belum ada
if (!fs.existsSync(CHAT_HISTORY_FILE)) {
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify({}, null, 2), 'utf-8');
}

class MemoryManager {
  constructor() {
    this.memories = this.loadMemories();
    this.chatHistories = this.loadChatHistories();
  }

  loadMemories() {
    try {
      const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Gagal membaca file memory.json:', err.message);
      return [];
    }
  }

  saveMemories() {
    try {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify(this.memories, null, 2), 'utf-8');
    } catch (err) {
      console.error('Gagal menyimpan file memory.json:', err.message);
    }
  }

  loadChatHistories() {
    try {
      const data = fs.readFileSync(CHAT_HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('Gagal membaca file chat_history.json:', err.message);
      return {};
    }
  }

  saveChatHistories() {
    try {
      fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(this.chatHistories, null, 2), 'utf-8');
    } catch (err) {
      console.error('Gagal menyimpan file chat_history.json:', err.message);
    }
  }

  /**
   * Menambah pengetahuan baru ke dalam ingatan jangka panjang
   */
  addMemory(fact, category = 'umum', source = 'chat') {
    const cleanFact = fact.trim();
    if (!cleanFact) return null;

    // Cek duplikasi sederhana
    const exists = this.memories.some(
      m => m.fact.toLowerCase() === cleanFact.toLowerCase()
    );
    if (exists) return null;

    const newMemory = {
      id: this.memories.length > 0 ? Math.max(...this.memories.map(m => m.id)) + 1 : 1,
      fact: cleanFact,
      category,
      learnedAt: new Date().toISOString(),
      source
    };

    this.memories.push(newMemory);
    this.saveMemories();
    return newMemory;
  }

  getAllMemories() {
    return this.memories;
  }

  deleteMemory(id) {
    const targetId = Number(id);
    const index = this.memories.findIndex(m => m.id === targetId);
    if (index !== -1) {
      const removed = this.memories.splice(index, 1)[0];
      this.saveMemories();
      return removed;
    }
    return null;
  }

  clearMemories() {
    this.memories = [];
    this.saveMemories();
  }

  /**
   * Format seluruh ingatan untuk dimasukkan ke system instruction AI
   */
  formatMemoriesForPrompt() {
    if (this.memories.length === 0) {
      return "- Belum ada ingatan khusus.";
    }
    return this.memories
      .map((m, idx) => `${idx + 1}. [${m.category}] ${m.fact}`)
      .join('\n');
  }

  /**
   * Manajemen riwayat percakapan per user/chat JID
   */
  getHistory(jid) {
    return this.chatHistories[jid] || [];
  }

  appendHistory(jid, role, text) {
    if (!this.chatHistories[jid]) {
      this.chatHistories[jid] = [];
    }
    this.chatHistories[jid].push({
      role, // 'user' atau 'model'
      parts: [{ text }],
      timestamp: Date.now()
    });

    // Batasi riwayat maksimal 14 pesan terakhir (7 pasang tanya-jawab) agar token hemat dan relevan
    if (this.chatHistories[jid].length > 14) {
      this.chatHistories[jid] = this.chatHistories[jid].slice(-14);
    }
    this.saveChatHistories();
  }

  clearHistory(jid) {
    if (this.chatHistories[jid]) {
      delete this.chatHistories[jid];
      this.saveChatHistories();
      return true;
    }
    return false;
  }
}

export const memoryManager = new MemoryManager();
