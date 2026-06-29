#!/usr/bin/env node
// ============================================================
// カード効果の統合検証（盾撃）ヘッドレステスト
//   攻撃宣言 → 守備側に優先権 → 土地タップ → 盾撃（Quick）で割込み → 解決
//   を本物のゲーム関数で実行し、優先権の挙動が正しいか検証する。
//   使い方:  node test/priority.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runEffectConsolidationVerifyHeadless = context.runEffectConsolidationVerifyHeadless;
if (!runEffectConsolidationVerifyHeadless) {
  console.error('❌ runEffectConsolidationVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('⚖️  カード効果の統合検証（盾撃）');
console.log('========================================\n');

const r = runEffectConsolidationVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n--- 最終状態 ---');
console.log(JSON.stringify(r.finalState));

console.log('\n========================================');
if (r.pass) {
  console.log('✅ 優先権検証成功 — 効果が単一ソース化され、AIの追加ダメージ・バグが排除された');
} else {
  console.log('❌ 優先権検証失敗');
  console.log('\n--- ログ ---');
  console.log(r.log.join('\n'));
  process.exit(1);
}
console.log('========================================');
