// ============================================================
// PERSISTENCE MANAGER — IndexedDB + localStorage フォールバック
// ============================================================
// Service Workerのキャッシュクリアに強く、ブラウザ設定変更でも
// 独立した領域として保護される永続化システム。

const DB_NAME = 'dcg-game-data';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

let _db = null;

// IndexedDB 初期化
async function initPersistence() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.warn('IndexedDB init failed, using localStorage fallback');
      resolve(false);
    };

    request.onsuccess = () => {
      _db = request.result;
      resolve(true);
    };

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

// キー一覧（管理対象データ）
const PERSIST_KEYS = [
  'dcg_record',              // 戦績
  'dcg_decks_v2',            // デッキ保存
  'dcg_card_dossier',        // カードカルテ
  'CARD_KNOWLEDGE',          // カード知識ベース
  'CARD_KNOWLEDGE_VERIFY',   // 知識検証ゲート結果
  'aiWeights',               // AI学習重み
  'specialMatchRecords',     // 特殊マッチ戦績
  'eloRating',               // ELOレーティング
  'eloHistory'               // レーティング履歴
];

const PersistenceManager = {

  // セーブ（IndexedDB → localStorage フォールバック）
  async save(key, data) {
    if (!PERSIST_KEYS.includes(key)) {
      console.warn(`Unknown persist key: ${key}`);
      return false;
    }

    const value = typeof data === 'string' ? data : JSON.stringify(data);

    // IndexedDB に保存
    if (_db) {
      try {
        await new Promise((resolve, reject) => {
          const tx = _db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.put({
            key,
            value,
            timestamp: Date.now(),
            version: DB_VERSION
          });
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
        return true;
      } catch (e) {
        console.warn(`IndexedDB save failed for ${key}, falling back to localStorage`, e);
      }
    }

    // フォールバック: localStorage（オーバーライド前の実体を使用し無限再帰を回避）
    try {
      _originalLocalStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.error(`All persist methods failed for ${key}`, e);
      return false;
    }
  },

  // ロード（IndexedDB → localStorage フォールバック）
  async load(key) {
    if (!PERSIST_KEYS.includes(key)) {
      return null;
    }

    // IndexedDB から取得
    if (_db) {
      try {
        const value = await new Promise((resolve, reject) => {
          const tx = _db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const record = request.result;
            resolve(record ? record.value : null);
          };
        });
        if (value) return JSON.parse(value);
      } catch (e) {
        console.warn(`IndexedDB load failed for ${key}, trying localStorage`, e);
      }
    }

    // フォールバック: localStorage（オーバーライド前の実体を使用し無限再帰を回避）
    const stored = _originalLocalStorage.getItem(key);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return stored;
      }
    }

    return null;
  },

  // バッチ保存（複数キーを一度に）
  async saveAll(dataMap) {
    const results = await Promise.all(
      Object.entries(dataMap).map(([key, value]) =>
        this.save(key, value)
      )
    );
    return results.every(r => r);
  },

  // バッチロード
  async loadAll() {
    const results = {};
    for (const key of PERSIST_KEYS) {
      results[key] = await this.load(key);
    }
    return results;
  },

  // 削除
  async delete(key) {
    if (_db) {
      try {
        await new Promise((resolve, reject) => {
          const tx = _db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      } catch (e) {
        console.warn(`IndexedDB delete failed for ${key}`, e);
      }
    }
    _originalLocalStorage.removeItem(key);
  },

  // 全削除
  async clear() {
    if (_db) {
      try {
        await new Promise((resolve, reject) => {
          const tx = _db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const request = store.clear();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      } catch (e) {
        console.warn('IndexedDB clear failed', e);
      }
    }
    PERSIST_KEYS.forEach(key => _originalLocalStorage.removeItem(key));
  },

  // ストレージ状態確認
  async getStatus() {
    let idbCount = 0;
    let idbSize = 0;

    if (_db) {
      try {
        const records = await new Promise((resolve, reject) => {
          const tx = _db.transaction([STORE_NAME], 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const recs = request.result;
            idbCount = recs.length;
            idbSize = JSON.stringify(recs).length;
            resolve(recs);
          };
        });
      } catch (e) {
        console.warn('Could not get IndexedDB status', e);
      }
    }

    const lsSize = Object.keys(localStorage)
      .filter(k => PERSIST_KEYS.includes(k))
      .reduce((sum, k) => sum + localStorage.getItem(k).length, 0);

    return {
      indexedDB: { available: !!_db, records: idbCount, bytes: idbSize },
      localStorage: { records: PERSIST_KEYS.filter(k => localStorage.getItem(k)).length, bytes: lsSize },
      timestamp: new Date().toISOString()
    };
  }
};

// ページ読み込み時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initPersistence());
} else {
  initPersistence();
}

// 既存のlocalStorageインターフェースとの互換性維持
// （既存コードの setItem/getItem をそのままでも動作）
const _originalLocalStorage = {
  setItem: localStorage.setItem.bind(localStorage),
  getItem: localStorage.getItem.bind(localStorage),
  removeItem: localStorage.removeItem.bind(localStorage)
};

// localStorage の setItem を上書き（自動で IndexedDB にも保存）
localStorage.setItem = function(key, value) {
  _originalLocalStorage.setItem(key, value);
  if (PERSIST_KEYS.includes(key)) {
    PersistenceManager.save(key, value).catch(e =>
      console.warn(`Background persist failed for ${key}`, e)
    );
  }
};

// localStorage の getItem を上書き（互換性：同期取得）
// （非同期なので実際は localStorage から直接取得、バックグラウンドで同期）
localStorage.getItem = function(key) {
  const value = _originalLocalStorage.getItem(key);
  if (PERSIST_KEYS.includes(key) && !value) {
    // IndexedDB から復元試行（非同期なので次回以降有効）
    PersistenceManager.load(key).then(idbValue => {
      if (idbValue) {
        const stringValue = typeof idbValue === 'string' ? idbValue : JSON.stringify(idbValue);
        _originalLocalStorage.setItem(key, stringValue);
      }
    }).catch(e => console.warn(`Background restore failed for ${key}`, e));
  }
  return value;
};
