#!/usr/bin/env node
// ============================================================
// AI 5色デッキ対応検証ヘッドレステスト
//   aiPlaySpellEffect と simSpellEffect が全15スペル効果に対応
//   使い方:  node test/ai-five-colors.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runAIFiveColorVerifyHeadless = context.runAIFiveColorVerifyHeadless;
if (!runAIFiveColorVerifyHeadless) {
  console.error('❌ runAIFiveColorVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🤖 AI 5色デッキ対応検証');
console.log('========================================\n');

const r = runAIFiveColorVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n========================================');
if (r.pass) {
  console.log(`✅ 全${r.results.length}項目 成功`);
  console.log('✅ AIが5色すべてのスペルを理解して発動できます');
  console.log('✅ AIが各色の戦略的なカード選択ができます');
  process.exit(0);
} else {
  const failed = r.results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
