#!/usr/bin/env node
// ============================================================
// 緑デッキ検証ヘッドレステスト
//   tami_kaitaku / mori_kansha スペル効果
//   foklya / folkusu / kaitakusha / gen_jurei / mori_tami / iwai_tami / matsuri_otoko / kaitaku_miko クリーチャー効果
//   使い方:  node test/green-deck.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runGreenColorDeckVerifyHeadless = context.runGreenColorDeckVerifyHeadless;
if (!runGreenColorDeckVerifyHeadless) {
  console.error('❌ runGreenColorDeckVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('💚 緑デッキ検証（スペル＋クリーチャー効果）');
console.log('========================================\n');

const r = runGreenColorDeckVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n========================================');
if (r.pass) {
  console.log(`✅ 全${r.results.length}項目 成功 — 緑デッキ効果が部品化されました`);
  process.exit(0);
} else {
  const failed = r.results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
