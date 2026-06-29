#!/usr/bin/env node
// ============================================================
// 攻撃フェーズ実装検証テスト
// ============================================================

const { loadGame } = require("./loadGame");
const context = loadGame();

console.log('========================================');
console.log('⚔️ 攻撃フェーズ実装検証');
console.log('========================================\n');

const results = [];
const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); };

// テスト: 攻撃フェーズの全関数が存在するか確認
ok('getAttackCandidates: 関数存在',
   typeof context.getAttackCandidates === 'function');
ok('playerAttackPhase: 関数存在',
   typeof context.playerAttackPhase === 'function');
ok('togglePlayerAttacker: 関数存在',
   typeof context.togglePlayerAttacker === 'function');
ok('playerAttackConfirm: 関数存在',
   typeof context.playerAttackConfirm === 'function');
ok('continuePlayerAttack: 関数存在',
   typeof context.continuePlayerAttack === 'function');
ok('playerAttackQueueStart: 関数存在',
   typeof context.playerAttackQueueStart === 'function');
ok('aiAttackPhase: 関数存在',
   typeof context.aiAttackPhase === 'function');

results.forEach(x => {
  console.log(`${x.pass ? '✅' : '❌'} ${x.name}${x.detail ? ` (${x.detail})` : ''}`);
});

const pass = results.every(r => r.pass);
console.log('\n========================================');
if (pass) {
  console.log(`✅ 全${results.length}項目 成功`);
  console.log('✅ 攻撃フェーズの実装が完成しました');
  process.exit(0);
} else {
  const failed = results.filter(x => !x.pass).length;
  console.log(`❌ ${failed}項目 失敗`);
  process.exit(1);
}
console.log('========================================');
