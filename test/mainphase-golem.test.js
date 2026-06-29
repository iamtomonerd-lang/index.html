#!/usr/bin/env node
// ============================================================
// メインフェイズ検証シナリオ（テストゴーレム固定）ヘッドレステスト
//   ブラウザを使わずに index.html 内の __runGolemVerify() を実行し、
//   固定手順（先行・後手 各4ターン）の全アクションが成功するか検証する。
//   使い方:  node test/mainphase-golem.test.js
//   終了コード: 全成功なら 0、失敗があれば 1。
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

const runGolemVerify = context.__runGolemVerify;
if (typeof runGolemVerify !== 'function') {
  console.error('__runGolemVerify が見つかりませんでした。');
  process.exit(2);
}

let report;
try {
  report = runGolemVerify();
} catch (e) {
  console.error('検証実行中にエラー:', e && e.message);
  console.error(e && e.stack);
  process.exit(2);
}

const pass = report.results.filter(r => r.pass).length;
const fail = report.results.length - pass;

console.log('========================================');
console.log('メインフェイズ検証（テストゴーレム固定）');
console.log('========================================');
for (const r of report.results) {
  const mark = r.pass ? '  OK ' : '>>NG ';
  console.log(`${mark}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log('----------------------------------------');
console.log('最終状態:', JSON.stringify(report.finalState));
console.log('========================================');

if (report.pass && fail === 0) {
  console.log(`\n✅ 全${report.results.length}項目 成功 — フィードバック動画を生成できる状態です`);
  process.exit(0);
} else {
  console.log(`\n❌ ${fail}項目 失敗`);
  process.exit(1);
}
