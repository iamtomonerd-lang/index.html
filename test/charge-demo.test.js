#!/usr/bin/env node
// チャージシステムデモの検証テスト

const { loadGame } = require("./loadGame");
const context = loadGame();

const runChargeDemoHeadless = context.runChargeDemoHeadless;
if (!runChargeDemoHeadless) {
  console.error('❌ runChargeDemoHeadless 関数が見つかりません');
  process.exit(1);
}

console.log('========================================');
console.log('🔄 チャージシステムデモ テスト');
console.log('========================================\n');

const testResult = runChargeDemoHeadless();

testResult.results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
});

console.log('\n========================================');
if (testResult.pass) {
  console.log('✅ チャージシステム検証成功 — 土地タップ→チャージでアンタップされます');
} else {
  console.log('❌ チャージシステム検証失敗');
  process.exit(1);
}
console.log('========================================');
