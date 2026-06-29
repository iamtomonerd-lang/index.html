#!/usr/bin/env node
// ============================================================
// 青デッキ検証ヘッドレステスト
//   ao_geki / mizu_geki / hitei / chishiki_no_seiri スペル効果
//   chishiki_maju / aaka / bu_in / nexia / omnieru クリーチャー効果
//   使い方:  node test/blue-deck.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runBlueColorDeckVerifyHeadless = context.runBlueColorDeckVerifyHeadless;
if (!runBlueColorDeckVerifyHeadless) {
  console.error('❌ runBlueColorDeckVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🔷 青デッキ検証（スペル＋クリーチャー効果）');
console.log('========================================\n');

const r = runBlueColorDeckVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n========================================');
if (r.pass) {
  console.log(`✅ 全${r.results.length}項目 成功 — 青デッキ効果が部品化されました`);
  process.exit(0);
} else {
  const failed = r.results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
