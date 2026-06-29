/**
 * 2コンテキスト分離オンライン対戦テスト
 *
 * ホスト(player0) と ゲスト(player1) を独立した vm.Context で動かし、
 * PeerJS の代わりに同期IPCをエミュレートします。
 * 各コンテキストは独立した G / NET_MODE / document を持ちます。
 */
'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ─── スクリプト読み込み（複数ファイル分割を共有ローダの連結ソースで吸収）──
const rawJs = require('./loadGame').gameSource();

// vm の let/const 宣言はサンドボックス外のプロパティにならないため、
// globalThis プロキシ経由でコンテキスト外から読み書きできるようにする
function expose(name, decl) {
  return `${decl}\nObject.defineProperty(globalThis,"${name}",{get(){return ${name};},set(v){${name}=v;},configurable:true});`;
}

const patchedJs = rawJs
  .replace(/^let G;/m,            expose('G', 'let G;').replace(/let G;.*\n/,'').replace('let G;','') + 'let G;\nObject.defineProperty(globalThis,"G",{get(){return G;},set(v){G=v;},configurable:true});')
  .replace(/^let NET_MODE\s/m,    'let NET_MODE;\nObject.defineProperty(globalThis,"NET_MODE",{get(){return NET_MODE;},set(v){NET_MODE=v;},configurable:true});\nNET_MODE ')
  .replace(/^let NET_MY_IDX\s/m,  'let NET_MY_IDX;\nObject.defineProperty(globalThis,"NET_MY_IDX",{get(){return NET_MY_IDX;},set(v){NET_MY_IDX=v;},configurable:true});\nNET_MY_IDX ')
  .replace(/^let NET_CONN\s/m,    'let NET_CONN;\nObject.defineProperty(globalThis,"NET_CONN",{get(){return NET_CONN;},set(v){NET_CONN=v;},configurable:true});\nNET_CONN ')
  // const CARD_DB も同様に公開（vmではconstもsandboxプロパティにならない）
  + '\nObject.defineProperty(globalThis,"CARD_DB",{get(){return CARD_DB;},configurable:true});\n';

// ─── コンテキスト生成ヘルパー ──────────────────────────────────────
function makeCtx(label) {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/' });
  const win = dom.window;

  function makeStub() {
    return {
      style: {},
      classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      textContent: '', innerHTML: '', value: '', disabled: false,
      checked: false, src: '',
      appendChild(){}, scrollTop: 0, scrollHeight: 0,
      addEventListener(){}, removeEventListener(){},
      querySelectorAll(){ return []; },
      querySelector(){ return null; },
    };
  }

  const origGetById = win.document.getElementById.bind(win.document);
  win.document.getElementById = (id) => { try { return origGetById(id) || makeStub(); } catch(e){ return makeStub(); } };
  win.document.querySelectorAll = () => [];
  win.document.querySelector = () => null;

  const sandbox = {
    document:     win.document,
    window:       win,
    navigator:    win.navigator,
    screen:       { width: 1280, height: 800, orientation: {} },
    location:     { reload(){} },
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    _pt:          [],    // pending timers
    setInterval(){ return 0; },
    clearTimeout(){},
    clearInterval(){},
    Peer:  class { on(){} },
    alert(){},
    console,
    __label: label,
  };
  // setTimeout をサンドボックス自身の _pt に積む
  sandbox.setTimeout = function(fn) { sandbox._pt.push(fn); return 0; };

  vm.createContext(sandbox);
  vm.runInContext(patchedJs, sandbox);

  // タイマーをすべて即時実行
  sandbox.__flush = function() {
    let n = 0;
    while (sandbox._pt.length && n++ < 2000) {
      sandbox._pt.shift()();
    }
  };

  return sandbox;
}

// ─── 通信ブリッジ ─────────────────────────────────────────────────
function connectPair(host, guest) {
  // ホスト → ゲスト 同期
  host.NET_CONN = {
    open: true,
    send(msg) {
      if (msg.type === 'state') {
        guest.netApplyStateFromHost(msg.state);
        guest.__flush();
      }
    }
  };

  // ゲスト → ホスト アクション
  guest.NET_CONN = {
    open: true,
    send(msg) {
      if (msg.type === 'action') {
        host.netExecuteGuestAction(msg);
        host.__flush();
        host.netSyncToGuest();
        host.__flush();
      }
    }
  };

  host.NET_MODE  = 'host'; host.NET_MY_IDX  = 0;
  guest.NET_MODE = 'guest'; guest.NET_MY_IDX = 1;
}

// ─── テストフレームワーク ─────────────────────────────────────────
const results = [];
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    passed++;
  } catch(e) {
    results.push({ name, pass: false, error: e.message });
    failed++;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || ''}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── セットアップ共通処理 ─────────────────────────────────────────
function setup() {
  const host  = makeCtx('HOST');
  const guest = makeCtx('GUEST');
  connectPair(host, guest);
  return { host, guest };
}

function startGame({ host, guest }) {
  host.initGame();
  host.__flush();
  guest.__flush();
}

function bothSkipMulligan({ host, guest }) {
  host.skipStartMulligan();
  host.__flush(); guest.__flush();
  guest.skipStartMulligan();  // netSendAction('mulliganSkip') → ホストで実行 → sync
  guest.__flush(); host.__flush(); guest.__flush();
}

// 優先権ウィンドウをすべてパスして進める
function passAllWindows(host, guest, maxIter = 30) {
  let g = 0;
  while (host.G.awaitingPriority && g++ < maxIter) {
    if (host.G.priorityFor === 1) {
      guest.passPriority();
      guest.__flush(); host.__flush(); guest.__flush();
    } else {
      host.passPriority();
      host.__flush(); guest.__flush();
    }
  }
}

// 先手がactivePlayer===want になるまで最大maxTry回initを繰り返す
function setupWithFirstPlayer(want, maxTry = 30) {
  for (let i = 0; i < maxTry; i++) {
    const pair = setup();
    startGame(pair);
    bothSkipMulligan(pair);
    if (pair.host.G.activePlayer === want) return pair;
  }
  return null;
}

// ─── テスト群 ─────────────────────────────────────────────────────

test('マリガン: initGame後に mulliganMode=true（両者）', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  assert(host.G.mulliganMode === true,  'host.mulliganMode != true');
  assert(guest.G.mulliganMode === true, 'guest.mulliganMode != true');
});

test('マリガン: ホストのみ確定 → ゲーム未開始・mulliganMode=true', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  host.skipStartMulligan(); host.__flush(); guest.__flush();
  eq(host.G.mulliganDone[0], true,  'host mulliganDone[0] != true');
  eq(host.G.mulliganDone[1], false, 'host mulliganDone[1] != false');
  eq(host.G.mulliganMode,    true,  'mulliganMode がまだ true でない');
});

test('マリガン: 両者スキップ → phase=main でゲーム開始', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  bothSkipMulligan({ host, guest });
  eq(host.G.mulliganMode, false, 'host: mulliganMode が残っている');
  eq(host.G.phase,        'main', 'host: phase != main');
  eq(guest.G.phase,       'main', 'guest: phase != main');
});

test('マリガン後の同期: turn・activePlayer・phase が一致', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  bothSkipMulligan({ host, guest });
  eq(guest.G.turn,         host.G.turn,         'turn 不一致');
  eq(guest.G.activePlayer, host.G.activePlayer,  'activePlayer 不一致');
  eq(guest.G.phase,        host.G.phase,          'phase 不一致');
});

test('マリガン: ゲストが2枚選択して引き直し → mulliganUsed=true', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  // ホストはスキップ
  host.skipStartMulligan(); host.__flush(); guest.__flush();
  // ゲストは2枚選択してマリガン（vmコンテキスト内のSetはグローバルと同一）
  guest.G.mulliganSelected = new Set([0, 1]);
  const beforeLen = guest.G.players[1].hand.length;
  guest.confirmStartMulligan();
  guest.__flush(); host.__flush(); guest.__flush();
  eq(host.G.mulliganMode, false, 'マリガン後もmulliganModeがtrue');
  eq(host.G.players[1].hand.length, beforeLen, '手札枚数が変わった');
  assert(host.G.players[1].mulliganUsed === true, 'mulliganUsed != true');
});

test('ゲスト先手ケース: activePlayer=1 が両者に同期される', () => {
  const pair = setupWithFirstPlayer(1);
  assert(pair !== null, 'ゲスト先手が30回試しても出なかった');
  const { host, guest } = pair;
  eq(host.G.activePlayer,  1, 'host: activePlayer != 1');
  eq(guest.G.activePlayer, 1, 'guest: activePlayer != 1');
});

test('フェイズ終了: ホスト先手 → 優先権パス後に turn=2・guest手番', () => {
  const pair = setupWithFirstPlayer(0);
  assert(pair !== null, 'ホスト先手が出なかった');
  const { host, guest } = pair;
  host.endPhase(); host.__flush(); guest.__flush();
  passAllWindows(host, guest);
  eq(host.G.turn,          2, 'turn が 2 でない');
  eq(host.G.activePlayer,  1, 'host: activePlayer != 1（ゲスト手番）');
  eq(guest.G.turn,         2, 'guest: turn != 2');
  eq(guest.G.activePlayer, 1, 'guest: activePlayer != 1');
});

test('フェイズ終了: ゲスト先手 → ゲストがフェイズ終了 → turn=2・ホスト手番', () => {
  const pair = setupWithFirstPlayer(1);
  assert(pair !== null, 'ゲスト先手が出なかった');
  const { host, guest } = pair;
  guest.endPhase(); guest.__flush(); host.__flush(); guest.__flush();
  passAllWindows(host, guest);
  eq(host.G.turn,          2, 'turn が 2 でない');
  eq(host.G.activePlayer,  0, 'host: activePlayer != 0（ホスト手番）');
  eq(guest.G.activePlayer, 0, 'guest: activePlayer != 0');
});

test('ターン交代: ホスト先手 → 2往復して turn=3 に到達', () => {
  const pair = setupWithFirstPlayer(0);
  assert(pair !== null, 'ホスト先手が出なかった');
  const { host, guest } = pair;

  // turn1: ホストがフェイズ終了
  host.endPhase(); host.__flush(); guest.__flush();
  passAllWindows(host, guest);
  eq(host.G.activePlayer, 1, 'turn2: activePlayer != 1');

  // turn2: ゲストがフェイズ終了
  guest.endPhase(); guest.__flush(); host.__flush(); guest.__flush();
  passAllWindows(host, guest);

  eq(host.G.turn,          3, `turn が 3 でない (${host.G.turn})`);
  eq(host.G.activePlayer,  0, 'turn3: activePlayer != 0');
  eq(guest.G.turn,         3, `guest: turn != 3`);
  eq(guest.G.activePlayer, 0, 'guest: activePlayer != 0');
});

test('カードプレイ: ゲスト先手でゲストが手札からカードをプレイ → 手札-1', () => {
  let found = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const pair = setup();
    startGame(pair);
    bothSkipMulligan(pair);
    const { host, guest } = pair;
    if (host.G.activePlayer !== 1) continue;

    // 十分なマナを付与
    ['R','U','G','W','B','C'].forEach(c => { host.G.players[1].mana[c] = 10; });
    host.netSyncToGuest(); host.__flush(); guest.__flush();

    const hand = guest.G.players[1].hand;
    let playIdx = -1;
    for (let i = 0; i < hand.length; i++) {
      const card = host.CARD_DB[hand[i]] || guest.CARD_DB[hand[i]];
      if (card && card.type !== 'land') { playIdx = i; break; }
    }
    if (playIdx === -1) continue;

    const before = guest.G.players[1].hand.length;
    guest.handleHandClick(1, playIdx);
    guest.__flush(); host.__flush(); guest.__flush();

    assert(host.G.players[1].hand.length < before,
      `手札が減っていない (before=${before}, after=${host.G.players[1].hand.length})`);
    found = true;
    break;
  }
  assert(found, 'ゲスト先手 + 非土地カードのケースが出なかった');
});

test('権限ガード: 相手ターン中にゲストがフェイズ終了 → ターン不変', () => {
  const pair = setupWithFirstPlayer(0);
  assert(pair !== null, 'ホスト先手が出なかった');
  const { host, guest } = pair;
  const turnBefore = host.G.turn;
  // netCanAct() = false なので送信しないはず
  guest.endPhase(); guest.__flush(); host.__flush();
  eq(host.G.turn, turnBefore, 'ゲストが勝手にターンを進めた');
});

test('権限ガード: 相手ターン中にホストがパス → 優先権ウィンドウを奪わない', () => {
  const pair = setupWithFirstPlayer(0);
  assert(pair !== null);
  const { host, guest } = pair;
  // フェイズ終了 → 優先権ウィンドウ(P1向け)を開く
  host.endPhase(); host.__flush(); guest.__flush();
  assert(host.G.awaitingPriority, '優先権ウィンドウが開かない');
  eq(host.G.priorityFor, 1, 'P1向けの優先権でない');
  const reasonBefore = host.G.priorityReason;
  // ホストが自分からパスしようとしても無視されるはず
  host.passPriority(); host.__flush();
  assert(host.G.awaitingPriority, 'ホストが勝手に優先権を閉じた');
  eq(host.G.priorityFor, 1, 'priorityFor が変わった');
});

test('状態同期: Set型（directlyAttackedCreatures）がゲスト側でもSetに復元', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  bothSkipMulligan({ host, guest });
  const isSet = v => v != null && typeof v.has === 'function' && typeof v.add === 'function';
  assert(isSet(guest.G.directlyAttackedCreatures),
    'directlyAttackedCreatures が Set でない');
  assert(isSet(guest.G.mustAttackCreatures),
    'mustAttackCreatures が Set でない');
});

test('状態同期: 両者のhealth・deck枚数が一致', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  bothSkipMulligan({ host, guest });
  eq(guest.G.players[0].health, host.G.players[0].health, 'P0 health 不一致');
  eq(guest.G.players[1].health, host.G.players[1].health, 'P1 health 不一致');
  eq(guest.G.players[0].deck.length, host.G.players[0].deck.length, 'P0 deck 不一致');
  eq(guest.G.players[1].deck.length, host.G.players[1].deck.length, 'P1 deck 不一致');
});

test('状態同期: マリガン後の手札枚数が両者で一致', () => {
  const { host, guest } = setup();
  startGame({ host, guest });
  bothSkipMulligan({ host, guest });
  eq(guest.G.players[0].hand.length, host.G.players[0].hand.length, 'P0 hand 不一致');
  eq(guest.G.players[1].hand.length, host.G.players[1].hand.length, 'P1 hand 不一致');
});

test('ターンチャージ: ゲスト先手でゲストがチャージできる', () => {
  let found = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const pair = setup();
    startGame(pair);
    bothSkipMulligan(pair);
    const { host, guest } = pair;
    if (host.G.activePlayer !== 1) continue;
    if (guest.G.players[1].hand.length === 0) continue;
    if (guest.G.players[1].lands.every(l => l.chargeCard)) continue;

    guest.startCharge();  // netSendAction('charge') → ホストで startCharge()
    guest.__flush(); host.__flush(); guest.__flush();

    assert(host.G.chargingMode !== false,
      `chargingMode が false のまま (${JSON.stringify(host.G.chargingMode)})`);
    found = true;
    break;
  }
  assert(found, 'ゲスト先手 + チャージ可能ケースが出なかった');
});

// ─── 結果表示 ─────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
console.log('  オンライン対戦 2コンテキスト分離テスト');
console.log('══════════════════════════════════════');
results.forEach(r => {
  const icon = r.pass ? '✅' : '❌';
  console.log(`${icon} ${r.name}`);
  if (!r.pass) console.log(`   └─ ${r.error}`);
});
console.log('──────────────────────────────────────');
console.log(`TOTAL: ${results.length}  PASS: ${passed}  FAIL: ${failed}`);
console.log('');
process.exit(failed > 0 ? 1 : 0);
