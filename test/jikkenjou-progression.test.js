#!/usr/bin/env node
// ============================================================
// 最小セット（テストゴーレム＋実験場）ゲーム進行ルール検証 ヘッドレステスト
//   カード効果テキストに依らないゲーム進行ルール（マナ→召喚・召喚酔い・
//   土地/ターン・無制限コピー・実エンジン戦闘・永続バフ）を、本物のゲーム関数
//   （playCardFromHand / tapLandForMana / resolveSingleCombat 等）で検証する。
//   使い方:  node test/jikkenjou-progression.test.js
//   終了コード: 全成功なら 0、失敗があれば 1。
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runJikkenjouProgressionHeadless = context.runJikkenjouProgressionHeadless;
if (!runJikkenjouProgressionHeadless) {
  console.error('❌ runJikkenjouProgressionHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🎲 最小セット ゲーム進行ルール検証（テストゴーレム＋実験場）');
console.log('========================================\n');

const r = runJikkenjouProgressionHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n--- 最終状態 ---');
console.log(JSON.stringify(r.finalState));

console.log('\n========================================');
if (r.pass) {
  console.log('✅ 進行ルール検証成功 — マナ→召喚・召喚酔い・土地/ターン・無制限コピー・実エンジン戦闘・永続バフがOOP分割後も正しく動く');
} else {
  console.log('❌ 進行ルール検証失敗');
  process.exit(1);
}
console.log('========================================');
