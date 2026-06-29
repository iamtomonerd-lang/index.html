#!/usr/bin/env node
// ============================================================
// 黒デッキ検証ヘッドレステスト
//   kurogeki / shigoeki スペル効果
//   shiki / ren / yami_jouhouya / skeleton_senshi / itazura_obake / haka_zombie / taisei_zombie / hakaatsume_yatoware クリーチャー効果
//   使い方:  node test/black-deck.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runBlackColorDeckVerifyHeadless = context.runBlackColorDeckVerifyHeadless;
if (!runBlackColorDeckVerifyHeadless) {
  console.error('❌ runBlackColorDeckVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🖤 黒デッキ検証（スペル＋クリーチャー効果）');
console.log('========================================\n');

const r = runBlackColorDeckVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n========================================');
if (r.pass) {
  console.log(`✅ 全${r.results.length}項目 成功 — 黒デッキ効果が部品化されました`);
  process.exit(0);
} else {
  const failed = r.results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
