#!/usr/bin/env node
// ============================================================
// AI公平性改善（マリガン・対象選択・割込み温存）の検証ヘッドレステスト
//   攻撃宣言 → 守備側に優先権 → 土地タップ → 盾撃（Quick）で割込み → 解決
//   を本物のゲーム関数で実行し、優先権の挙動が正しいか検証する。
//   使い方:  node test/priority.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runAIFairnessVerifyHeadless = context.runAIFairnessVerifyHeadless;
if (!runAIFairnessVerifyHeadless) {
  console.error('❌ runAIFairnessVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('⚖️  AI公平性改善（マリガン・対象選択・割込み温存）の検証');
console.log('========================================\n');

const r = runAIFairnessVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n--- 最終状態 ---');
console.log(JSON.stringify(r.finalState));

console.log('\n========================================');
if (r.pass) {
  console.log('✅ 優先権検証成功 — AIの公平性改善が機能している');
} else {
  console.log('❌ 優先権検証失敗');
  console.log('\n--- ログ ---');
  console.log(r.log.join('\n'));
  process.exit(1);
}
console.log('========================================');
