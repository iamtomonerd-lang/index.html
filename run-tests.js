#!/usr/bin/env node
// ============================================================
// ヘッドレス・テストランナー
// ブラウザを使わずに game.js 内のカードテスト(__runCardTests)を実行する。
//   使い方:  node run-tests.js
// 終了コード: 全テスト成功なら 0、失敗があれば 1。
// ============================================================
const { loadGame } = require('./test/loadGame');

let context;
try {
  context = loadGame();
} catch (e) {
  console.error('スクリプト読み込み中にエラー:', e && e.message);
  console.error(e && e.stack);
  process.exit(2);
}

const runCardTests = context.__runCardTests;
if (typeof runCardTests !== 'function') {
  console.error('runCardTests が見つかりませんでした。');
  process.exit(2);
}

let results;
try {
  results = runCardTests();
} catch (e) {
  console.error('テスト実行中にエラー:', e && e.message);
  console.error(e && e.stack);
  process.exit(2);
}

const pass = results.filter(r => r.pass).length;
const fail = results.length - pass;

console.log('========================================');
console.log(`カードテスト結果: ${pass}/${results.length} 成功`);
console.log('========================================');
for (const r of results) {
  const mark = r.pass ? '  OK ' : '>>FAIL';
  console.log(`${mark}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log('========================================');

if (fail > 0) {
  console.log(`\n❌ ${fail}件 失敗`);
  process.exit(1);
} else {
  console.log(`\n✅ 全${results.length}件 成功`);
  process.exit(0);
}
