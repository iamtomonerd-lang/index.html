#!/usr/bin/env node
// ============================================================
// スタートデッキ5種類（白赤青黒緑）の完全ゲーム進行ルール検証
//   各色デッキ：ターン開始→土地展開→マナ生成→スペル発動→クリーチャー効果
//   使い方:  node test/progression-all-colors.test.js
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runAllColorDecksProgressionVerifyHeadless = context.runAllColorDecksProgressionVerifyHeadless;
if (!runAllColorDecksProgressionVerifyHeadless) {
  console.error('❌ runAllColorDecksProgressionVerifyHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🎮 スタートデッキ5種類の完全ゲーム進行検証');
console.log('========================================\n');

const r = runAllColorDecksProgressionVerifyHeadless();
r.results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

console.log('\n========================================');
if (r.pass) {
  console.log(`✅ 全${r.results.length}項目 成功`);
  console.log('✅ 5色すべてのデッキが正常に動作します');
  console.log('✅ ターン進行・マナ生成・カード発動・戦闘ルールが確認されました');
  process.exit(0);
} else {
  const failed = r.results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
