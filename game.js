function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ゲーム起動時の初期化（レート・トロフィーを保持）
if (typeof initializeGameData === 'function') {
  initializeGameData();
}
