// ============================================================
// MCTSスペック計測ベンチ（純スペックE）
//   実行: node test/bench-mcts.js
//   1) クローン等価性: fastCloneState と JSON方式が同じ結果を作るか
//   2) 探索速度: 同じ500msで旧方式/新方式それぞれ何回探索できるか
//   3) 時間バンク: 自明な局面の早期終了と貯金
// ============================================================
const path = require('path');
const { gameSource, makeSandbox } = require(path.join(__dirname, 'loadGame.js'));
const vm = require('vm');

const sandbox = makeSandbox();
const context = vm.createContext(sandbox);
vm.runInContext(gameSource(), context, { filename: 'game.js', timeout: 30000 });
function run(code) { return vm.runInContext(code, context, { timeout: 240000 }); }

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// ── 中盤らしい局面を構築 ──
run(`
NET_MODE = 'local';
initGame();
G.activePlayer = 1;
G.phase = 'main';
G.turn = 6;
G.mulliganMode = false;
G.players[0].field = [newInstance('serashia_heishi'), newInstance('serashia_junhei')];
G.players[1].field = [newInstance('shinmai_heishi')];
[...G.players[0].field, ...G.players[1].field].forEach(c => { c.sick = false; c.entryTurn = 1; });
G.players[1].hand = ['shinmai_heishi','eiyuu_kouho','junigeki','serashia_souryo','kaizen'];
G.players[1].lands = [];
for (let i = 0; i < 8; i++) { const l = newInstance('hito_heichi'); l.tapped = false; G.players[1].lands.push(l); }
G.players[1].mana = { W: 8, C: 0 };
`);

// ── 1) クローン等価性 ──
console.log('[1] クローン等価性（fastClone vs JSON方式）');
run(`
const st = mctsStateFromG();
const a = JSON.stringify(_fastCloneAny(st));
const b = JSON.stringify(JSON.parse(JSON.stringify(st)));
globalThis.__same = (a === b);
// 独立性: クローンを書き換えても元が変わらない
const c = _fastCloneAny(st);
c.players[1].life = -999;
globalThis.__indep = st.players[1].life !== -999;
`);
check('同じ状態が複製される', run('globalThis.__same'));
check('複製は元と独立（書き換えが漏れない）', run('globalThis.__indep'));

// ── 2) 探索速度（秒間反復数・実測時間ベース）──
// 早期終了や時間バンクで1回の探索時間は変動するため、
// 「反復数 ÷ 実際にかかった時間」のレートで比較する。
// 旧/新を交互に測ってマシン負荷のドリフトも打ち消す。
console.log('\n[2] 探索速度（秒間何回考えられるか）');
run(`mctsSearch(300); mctsSearch(300);`); // JITウォームアップ
const rates = run(`
let oldIters = 0, oldMs = 0, newIters = 0, newMs = 0;
for (let i = 0; i < 6; i++) {
  USE_FAST_CLONE = (i % 2 === 1);
  MCTS_TIME_BANK = 0;
  const t0 = Date.now();
  mctsSearch(400);
  const el = Math.max(1, Date.now() - t0);
  if (USE_FAST_CLONE) { newIters += MCTS_LAST_ITERS; newMs += el; }
  else { oldIters += MCTS_LAST_ITERS; oldMs += el; }
}
USE_FAST_CLONE = true;
JSON.stringify({ oldRate: Math.round(oldIters / oldMs * 1000), newRate: Math.round(newIters / newMs * 1000) });
`);
const { oldRate, newRate } = JSON.parse(rates);
console.log(`   JSON方式(既定): ${oldRate} 回/秒`);
console.log(`   JS再帰コピー:   ${newRate} 回/秒`);
console.log(`   比率(既定/代替): ${(oldRate / Math.max(1, newRate)).toFixed(2)}倍`);
// 既定（USE_FAST_CLONE=false=JSON）が代替より遅くなっていないことを確認。
// 環境更新で逆転したらこのチェックが教えてくれる → その時は既定を切り替える。
check('既定のクローン方式が代替と同等以上', oldRate > newRate * 0.9);
run('USE_FAST_CLONE = false;'); // 既定に戻す

// ── 3) 時間バンク ──
console.log('\n[3] 時間バンク（自明な局面は即決して貯金）');
run(`
MCTS_TIME_BANK = 0;
G.players[1].hand = [];         // 出せるカードなし → 選択肢はpassのみ
G.players[1].mana = { W: 0 };
globalThis.__t0 = Date.now();
globalThis.__plays = mctsSearch(500);
globalThis.__elapsed = Date.now() - globalThis.__t0;
globalThis.__bank = MCTS_TIME_BANK;
`);
check('選択肢が無い局面は即決（50ms未満）', run('globalThis.__elapsed < 50'));
check('浮いた時間が貯金される（500ms）', run('globalThis.__bank === 500'));
check('即決の答えは空（プレイなし）', run('Array.isArray(globalThis.__plays) && globalThis.__plays.length === 0'));

console.log(`\n========================================`);
console.log(fail === 0 ? `✅ 全${pass}件 成功` : `❌ ${fail}件失敗 / ${pass}件成功`);
process.exit(fail === 0 ? 0 : 1);
