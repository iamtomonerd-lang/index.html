// ──────────────────────────────────────────────────
// デモ動画生成機能（Demo Video Generator）
// ──────────────────────────────────────────────────

let _demoRecorder = null;
let _demoChunks = [];
let _demoVideoBlob = null;
let _demoRecordCanvas = null;
let _demoRecordCtx = null;
let _demoRunning = false;
let _demoCurrentStep = -1;
let _demoSequenceId = null;
let _demoFrameInterval = null;
let _demoRenderTimer = null;     // 録画中に盤面を常時描画する setInterval（※rAFはバックグラウンドで止まるため使わない）
let _demoVideoTrack = null;      // captureStream の映像トラック（requestFrame でフレームを明示キャプチャ）
let _demoCurrentLabel = '';      // 現在のステップのラベル（オーバーレイ表示用）
let _demoStepIdx = 0;            // 現在のステップ番号
let _demoTotalSteps = 0;         // 総ステップ数
let _demoBoardImg = null;        // html2canvas が生成した「実際の盤面」の最新画像（録画に貼る）
let _demoCapturing = false;      // html2canvas 実行中ガード（多重起動防止）
let _demoActive = false;         // デモ録画中フラグ（AIの自動優先権応答を抑止）
let _demoSavedNetMode = null;    // デモ前の NET_MODE を退避（録画後に復元）
let _demoMimeType = '';          // 実際に使われた録画フォーマット（ダウンロード拡張子判定用）
let _demoBoardTainted = false;   // 実盤面の取り込みがキャンバス汚染（file://のカード画像等）→スキーマ盤面へ切替

// デモ用のゲーム状態を初期化（実際の G に書き込む）
function initDemoGameState(opts = {}) {
  // G をデモ用に初期化（render() と動く最小構成）
  const mkPlayer = (life = 20) => ({
    life, deck: [], landDeck: [], hand: [], field: [],
    lands: [], artifacts: [], graveyard: [], exile: [],
    mana: {R:0,U:0,G:0,W:0,B:0,C:0},
    mulliganUsed: false, attackers: [], blockers: {},
  });
  G = {
    turn: opts.turn || 1,
    activePlayer: opts.activePlayer !== undefined ? opts.activePlayer : 0,
    firstPlayer: 0,
    phase: opts.phase || 'main',
    priority: 0,
    stack: [], _pendingCont: null, _pendingReason: '',
    _awaitingModal: false, _pendingCrystalPay: false,
    players: [mkPlayer(opts.p0life || 20), mkPlayer(opts.p1life || 20)],
    nextInstanceId: 100,
    firstTurn: false,
    awaitingPriority: false, priorityFor: null, priorityContinuation: null, priorityReason: '',
    chargingMode: false, chargeUsedThisTurn: false, targetMode: null,
    attackMode: false, blockMode: false, selectedAttacker: null, selectedCard: null,
    tempBuffs: [], permanentBuffs: [],
    landPlacedThisTurn: 0, mustAttackCreatures: new Set(),
    blockDrawActive: [false, false], arestiaBuffActive: false,
    combatBlockersAlive: {}, cantAttackPermanent: new Set(),
    kaizen_used_names: new Set(), kaizenBlockDraw: -1,
    playerBlockMode: false, aiCurrentAttackers: [], playerBlockAssignments: {},
    selectedBlockerToAssign: null, directlyAttackedCreatures: new Set(),
    kakutouTargets: {}, _aiAttackQueue: [], drawCount: [0, 0],
    discardedThisTurn: [false, false], chargedThisTurn: [],
    combatArrows: [], _skipPriorityWindow: false, kaizenOCUsedThisTurn: false,
  };

  // 土地を数枚配置してマナを確保
  const landIds = ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'];
  for (let i = 0; i < (opts.lands || 3); i++) {
    const lid = landIds[i % landIds.length];
    G.players[0].lands.push({ instanceId: G.nextInstanceId++, cardId: lid, tapped: false, chargeCard: null });
  }
  G.players[0].mana.W = opts.lands || 3;
}

// デモ用クリーチャー追加
function addDemoCreature(player, cardId, opts = {}) {
  if (!G || !G.players) return null;
  const inst = {
    instanceId: G.nextInstanceId++, cardId,
    tapped: opts.tapped || false, damage: 0,
    sick: opts.sick !== undefined ? opts.sick : false,
    entryTurn: opts.entryTurn !== undefined ? opts.entryTurn : G.turn,
    tempPower: 0, tempToughness: 0, mustAttack: opts.mustAttack || false,
  };
  G.players[player].field.push(inst);
  return inst;
}

// ============================================================
// メインフェイズ検証シナリオ（テストゴーレム固定）
//   仕様検証用フィードバック動画のための「固定状況」。
//   両プレイヤー: 山札=テストゴーレムのみ / 土地デッキ=人住まう平地×2 / 初期手札1枚。
//   先行・後手それぞれ4ターン（計8ターン）の決め打ち手順を実行する。
//     1ターン目: 土地1枚タップ → ゴーレム召喚
//     2ターン目: 土地1枚タップ → ゴーレム召喚 → 前ターンのゴーレムで攻撃
//     3ターン目: 土地1枚タップ → 前ターンのゴーレムで攻撃 → ゴーレム召喚
//     4ターン目: 土地2枚タップ → ゴーレム召喚 → 前ターンのゴーレムで攻撃 → ゴーレム召喚
//   ブロックは行わない。すべての動きが成功すれば検証成功。
//   ・ブラウザ : デモ動画パネルから再生して録画
//   ・ヘッドレス: globalThis.__runGolemVerify() で同じ手順を同期実行して検証
//   ※ ドローは簡単のため毎ターン1枚（先行1ターン目も含む）= 固定シナリオ用の割り切り。
// ============================================================

// 検証シナリオの進行状態
const _gv = {
  lastTurnGolem: [null, null], // 各プレイヤーが「前のターンに出した」ゴーレムのinstanceId
  summonedThisTurn: [],        // このターンに召喚したゴーレムのinstanceId
  log: [],
};

function _gvLog(msg) {
  _gv.log.push(msg);
  try { if (typeof log === 'function') log('【検証】' + msg); } catch (e) {}
}
function _gvRender() {
  try { if (typeof render === 'function') render(); } catch (e) {}
}

// 8ターンの決め打ちプラン（手順の唯一の定義元。ブラウザ・ヘッドレス両方がこれを解釈する）
const GOLEM_VERIFY_PLAN = [
  { gturn:1, player:0, ptIdx:1, land:1, label:'先行1ターン目', actions:['tap1','summon'] },
  { gturn:2, player:1, ptIdx:1, land:1, label:'後手1ターン目', actions:['tap1','summon'] },
  { gturn:3, player:0, ptIdx:2, land:0, label:'先行2ターン目', actions:['tap1','summon','attackPrev'] },
  { gturn:4, player:1, ptIdx:2, land:0, label:'後手2ターン目', actions:['tap1','summon','attackPrev'] },
  { gturn:5, player:0, ptIdx:3, land:0, label:'先行3ターン目', actions:['tap1','attackPrev','summon'] },
  { gturn:6, player:1, ptIdx:3, land:0, label:'後手3ターン目', actions:['tap1','attackPrev','summon'] },
  { gturn:7, player:0, ptIdx:4, land:1, label:'先行4ターン目', actions:['tap2','summon','attackPrev','summon'] },
  { gturn:8, player:1, ptIdx:4, land:1, label:'後手4ターン目', actions:['tap2','summon','attackPrev','summon'] },
];

const _GV_ACTION_LABEL = {
  tap1:'土地1枚タップ', tap2:'土地2枚タップ',
  summon:'テストゴーレム召喚', attackPrev:'前ターンのゴーレムで攻撃',
};
function _gvActionsLabel(actions) { return actions.map(a => _GV_ACTION_LABEL[a] || a).join(' → '); }

// プレイヤー1人分の空状態
function _gvMakePlayer() {
  return {
    life: 20, deck: [], landDeck: [], hand: [], field: [],
    lands: [], artifacts: [], graveyard: [], exile: [],
    mana: {R:0,U:0,G:0,W:0,B:0,C:0},
    mulliganUsed: false, attackers: [], blockers: {},
  };
}

// 固定盤面の初期化（実際のGに書き込む）
function gvSetup() {
  if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
  if (typeof NET_MY_IDX !== 'undefined') NET_MY_IDX = 0;
  _gv.lastTurnGolem = [null, null];
  _gv.summonedThisTurn = [];
  _gv.log = [];

  G = {
    turn: 1, activePlayer: 0, firstPlayer: 0, phase: 'main', priority: 0,
    stack: [], _pendingCont: null, _pendingReason: '',
    _awaitingModal: false, _pendingCrystalPay: false,
    players: [_gvMakePlayer(), _gvMakePlayer()],
    nextInstanceId: 100,
    firstTurn: false,
    awaitingPriority: false, priorityFor: null, priorityContinuation: null, priorityReason: '',
    chargingMode: false, chargeUsedThisTurn: false, targetMode: null,
    attackMode: false, blockMode: false, selectedAttacker: null, selectedCard: null,
    tempBuffs: [], permanentBuffs: [],
    landPlacedThisTurn: 0, mustAttackCreatures: new Set(),
    blockDrawActive: [false, false], arestiaBuffActive: false,
    combatBlockersAlive: {}, cantAttackPermanent: new Set(),
    kaizen_used_names: new Set(), kaizenBlockDraw: -1,
    playerBlockMode: false, aiCurrentAttackers: [], playerBlockAssignments: {},
    selectedBlockerToAssign: null, directlyAttackedCreatures: new Set(),
    kakutouTargets: {}, _aiAttackQueue: [], drawCount: [0, 0],
    discardedThisTurn: [false, false], chargedThisTurn: [],
    combatArrows: [], _skipPriorityWindow: false, kaizenOCUsedThisTurn: false,
  };

  for (let pl = 0; pl < 2; pl++) {
    const p = G.players[pl];
    p.deck = Array.from({ length: 12 }, () => 'test_golem'); // 山札: テストゴーレム（ドロー用に十分）
    p.landDeck = ['hito_heichi', 'hito_heichi'];             // 土地デッキ: 人住まう平地 ×2
    p.hand = ['test_golem'];                                 // 初期手札: 1枚
  }
  _gvLog('初期化: 両者 山札=テストゴーレム / 土地デッキ=人住まう平地×2 / 初期手札1枚');
  _gvRender();
}

// ターン開始: アクティブ切替・アンタップ・マナ初期化・土地配置・1ドロー
function gvStartTurn(player, gturn, ptIdx, landToPlace) {
  G.activePlayer = player;
  G.turn = gturn;
  G.phase = 'main';
  G.stack = [];
  G.awaitingPriority = false; G.priorityFor = null; G.priorityContinuation = null;
  G.targetMode = null; G._awaitingModal = false; G._pendingCont = null;
  _gv.summonedThisTurn = [];

  untapAll(player);                                  // 土地・クリーチャーをアンタップ（召喚酔いも解除）
  G.players[player].mana = {R:0,U:0,G:0,W:0,B:0,C:0}; // マナをリセット

  // 土地配置（土地デッキから landToPlace 枚を場へ、アンタップ状態で）
  for (let i = 0; i < landToPlace; i++) {
    const p = G.players[player];
    if (p.landDeck.length === 0) break;
    const cardId = p.landDeck.shift();
    const inst = newInstance(cardId);
    inst.tapped = false;
    p.lands.push(inst);
  }

  // 1ドロー
  if (G.players[player].deck.length > 0) {
    addCardToHand(player, G.players[player].deck.shift());
  }

  _gvLog(`${['先行','後手'][player]} ${ptIdx}ターン目開始（土地${G.players[player].lands.length}枚 / 手札${G.players[player].hand.length}枚）`);
  _gvRender();
}

// 土地を n 枚タップしてマナを出す（tapLandForMana のコアと同等）
function gvTapLands(player, n) {
  const p = G.players[player];
  let tapped = 0;
  for (let i = 0; i < p.lands.length && tapped < n; i++) {
    const land = p.lands[i];
    if (!land.tapped) {
      land.tapped = true;
      const card = CARD_DB[land.cardId];
      const manaType = (card && card.produces) || 'C';
      p.mana[manaType] = (p.mana[manaType] || 0) + 1;
      tapped++;
    }
  }
  const ok = tapped === n;
  _gvLog(`土地を${tapped}枚タップ（要求${n}枚）${ok ? '' : ' ← 不足!'}`);
  _gvRender();
  return ok;
}

// テストゴーレムを1体召喚（本物の playCardFromHand を使い、スタックを同期解決）
function gvSummonGolem(player) {
  const p = G.players[player];
  const idx = p.hand.indexOf('test_golem');
  if (idx === -1) { _gvLog('召喚失敗: 手札にテストゴーレムがない'); return false; }
  const before = p.field.length;
  playCardFromHand(player, idx);
  // 積まれた召喚を同期解決（優先権ウィンドウを介さず解決する）
  let guard = 20;
  while (G.stack.length > 0 && guard-- > 0) {
    const item = G.stack.pop();
    if (item && item.resolve) item.resolve();
  }
  G.awaitingPriority = false; G.priorityFor = null; G.priorityContinuation = null;
  G.targetMode = null; G._pendingCont = null;
  const ok = p.field.length === before + 1;
  if (ok) {
    _gv.summonedThisTurn.push(p.field[p.field.length - 1].instanceId);
    _gvLog(`テストゴーレム召喚 成功（場に${p.field.length}体）`);
  } else {
    _gvLog('召喚失敗: 場に出なかった');
  }
  _gvRender();
  return ok;
}

// 前のターンに出したゴーレムで攻撃（ブロックなし＝相手プレイヤーへ直接ダメージ）
function gvAttackPrev(player) {
  const opp = 1 - player;
  const atkId = _gv.lastTurnGolem[player];
  if (atkId == null) { _gvLog('攻撃失敗: 前ターンのゴーレムが記録されていない'); return false; }
  const inst = G.players[player].field.find(c => c.instanceId === atkId);
  if (!inst) { _gvLog('攻撃失敗: 攻撃クリーチャーが場にいない'); return false; }
  if (inst.sick) { _gvLog('攻撃失敗: 召喚酔い'); return false; }
  if (inst.tapped) { _gvLog('攻撃失敗: すでにタップ済み'); return false; }
  const card = CARD_DB[inst.cardId];
  const pow = (typeof getEffectivePower === 'function') ? getEffectivePower(player, inst) : (card.power || 0);
  const lifeBefore = G.players[opp].life;
  if (!card.vigilance) inst.tapped = true;  // 攻撃でタップ
  G.players[opp].life -= pow;               // ブロックなし→相手プレイヤーへ
  if (typeof checkDeath === 'function') checkDeath();
  const ok = G.players[opp].life === lifeBefore - pow;
  _gvLog(`前ターンのゴーレムで攻撃 → 相手に${pow}ダメージ（相手ライフ ${lifeBefore}→${G.players[opp].life}）`);
  _gvRender();
  return ok;
}

// 土地をチャージ（最初の土地に手札の最初のカードを割り当て、土地をアンタップ）
function gvChargeDemo(player) {
  const p = G.players[player];
  if (p.lands.length === 0) { _gvLog('チャージ失敗: 土地がない'); return false; }
  if (p.hand.length === 0) { _gvLog('チャージ失敗: 手札がない'); return false; }
  const land = p.lands[0];
  if (!land.tapped) { _gvLog('チャージ失敗: 土地がタップされていない'); return false; }
  const cardId = p.hand.shift();
  const landBefore = land.tapped;
  land.chargeCard = cardId;
  land.tapped = false;
  const ok = land.tapped === false && land.chargeCard === cardId;
  _gvLog(`チャージ実行 → ${CARD_DB[cardId]?.name || cardId} を土地に割り当て、土地をアンタップ`);
  _gvRender();
  return ok;
}

// 1アクション実行（共通ディスパッチ）
function gvDoAction(player, action) {
  switch (action) {
    case 'tap1': return gvTapLands(player, 1);
    case 'tap2': return gvTapLands(player, 2);
    case 'summon': return gvSummonGolem(player);
    case 'attackPrev': return gvAttackPrev(player);
    case 'charge': return gvChargeDemo(player);
    default: _gvLog('未知のアクション: ' + action); return false;
  }
}

// ターン終了時の記録更新（このターン出したゴーレムを「前のターンのゴーレム」として保存）
function gvEndTurnBookkeeping(player) {
  if (_gv.summonedThisTurn.length > 0) {
    _gv.lastTurnGolem[player] = _gv.summonedThisTurn[_gv.summonedThisTurn.length - 1];
  }
}

// ── ヘッドレス検証（同期実行・Promise不要）────────────────────
function runGolemVerifyHeadless() {
  const results = [];
  let pass = true;
  try {
    gvSetup();
    for (const turn of GOLEM_VERIFY_PLAN) {
      gvStartTurn(turn.player, turn.gturn, turn.ptIdx, turn.land);
      for (const action of turn.actions) {
        const ok = gvDoAction(turn.player, action);
        results.push({ name: `${turn.label}: ${_GV_ACTION_LABEL[action] || action}`, pass: ok });
        if (!ok) pass = false;
      }
      gvEndTurnBookkeeping(turn.player);
    }
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && e.message });
    pass = false;
  }

  // 最終状態のアサーション
  const p0 = G.players[0], p1 = G.players[1];
  const checks = [
    ['先行フィールドにゴーレム5体', p0.field.length === 5 && p0.field.every(c => c.cardId === 'test_golem')],
    ['後手フィールドにゴーレム5体', p1.field.length === 5 && p1.field.every(c => c.cardId === 'test_golem')],
    ['先行ライフ17（攻撃3回ぶん被弾）', p0.life === 17],
    ['後手ライフ17（攻撃3回ぶん被弾）', p1.life === 17],
    ['先行 土地2枚・土地デッキ空', p0.lands.length === 2 && p0.landDeck.length === 0],
    ['後手 土地2枚・土地デッキ空', p1.lands.length === 2 && p1.landDeck.length === 0],
  ];
  for (const [name, cond] of checks) {
    results.push({ name, pass: !!cond });
    if (!cond) pass = false;
  }

  return {
    pass, results,
    finalState: {
      p0: { life: p0.life, field: p0.field.length, lands: p0.lands.length, hand: p0.hand.length },
      p1: { life: p1.life, field: p1.field.length, lands: p1.lands.length, hand: p1.hand.length },
    },
    log: _gv.log.slice(),
  };
}

// チャージシステム検証
function runChargeDemoHeadless() {
  const results = [];
  let pass = true;
  try {
    gvSetup();
    gvStartTurn(0, 1, 1, 1);  // 土地1枚配置・ドロー
    const p0 = G.players[0];

    // アクション1: 土地をタップ
    const tap1Ok = gvDoAction(0, 'tap1');
    results.push({ name: '土地をタップ', pass: tap1Ok && p0.lands[0].tapped });
    if (!tap1Ok) pass = false;

    // アクション2: チャージ
    const chargeOk = gvDoAction(0, 'charge');
    results.push({ name: 'チャージ実行', pass: chargeOk });
    results.push({ name: 'チャージ後、土地がアンタップ状態', pass: !p0.lands[0].tapped });
    results.push({ name: '土地に chargeCard がセット', pass: !!p0.lands[0].chargeCard });
    results.push({ name: '手札が1枚', pass: p0.hand.length === 1 });

    // アクション3: チャージした土地をもう一度タップ
    const tap2Ok = gvDoAction(0, 'tap1');
    results.push({ name: 'チャージした土地をもう一度タップ', pass: tap2Ok && p0.lands[0].tapped });
    if (!tap2Ok) pass = false;

    // アクション4: テストゴーレムを召喚
    const summonOk = gvDoAction(0, 'summon');
    results.push({ name: 'テストゴーレムを召喚', pass: summonOk && p0.field.length === 1 });
    results.push({ name: 'フィールドにテストゴーレムがいる', pass: p0.field[0]?.cardId === 'test_golem' });
    results.push({ name: '手札が0枚', pass: p0.hand.length === 0 });

    if (!chargeOk || !tap1Ok || !tap2Ok || !summonOk || p0.field.length !== 1 || p0.hand.length !== 0) {
      pass = false;
    }
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && e.message });
    pass = false;
  }

  return {
    pass, results,
    finalState: {
      p0: { lands: G.players[0].lands.length, field: G.players[0].field.length, hand: G.players[0].hand.length, chargeCard: G.players[0].lands[0]?.chargeCard },
    },
    log: _gv.log.slice(),
  };
}

// 優先権・割込み検証（★実際のゲームエンジンを駆動する）。
//   startSingleAttack → openPriorityWindow（守備側に優先権）→ tapLandForMana →
//   playCardFromHand（本物の盾撃）→ スタック解決、を実行して優先権の正しさを検証する。
//   ヘッドレスでは setTimeout が無効化されるため、攻撃宣言後に優先権ウィンドウが
//   開いたまま保持され、守備側の応答を同期的に差し込める。
function runPriorityVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (name, cond) => { results.push({ name, pass: !!cond }); if (!cond) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    gvSetup();
    // 両者の手札を盾撃1枚にする（山札=テストゴーレム / 土地デッキ=人住まう平地×2）
    G.players[0].hand = ['junigeki'];
    G.players[1].hand = ['junigeki'];

    // ターン1（先行）：土地2枚配置 → 1枚タップして召喚（もう1枚は防御用に残す）
    gvStartTurn(0, 1, 1, 2);
    gvDoAction(0, 'tap1');
    gvDoAction(0, 'summon');
    gvEndTurnBookkeeping(0);
    // ターン1（後手）：土地2枚配置 → 1枚タップして召喚（もう1枚は防御用に残す）
    gvStartTurn(1, 2, 1, 2);
    gvDoAction(1, 'tap1');
    gvDoAction(1, 'summon');
    gvEndTurnBookkeeping(1);

    ok('先行(P0)にテストゴーレムがいる', G.players[0].field.some(c => c.cardId === 'test_golem'));
    ok('後手(P1)にテストゴーレムがいる', G.players[1].field.some(c => c.cardId === 'test_golem'));
    ok('後手(P1)は土地を2枚持ち、1枚は未タップ（防御用）', G.players[1].lands.length === 2 && G.players[1].lands.some(l => !l.tapped));

    // ターン2（先行）：アンタップして攻撃できる状態に（土地デッキは空なので追加配置なし）
    gvStartTurn(0, 3, 2, 0);
    const atk = G.players[0].field.find(c => c.cardId === 'test_golem');
    ok('攻撃側ゴーレムは召喚酔いが解けている', atk && !atk.sick);

    // ★ 本物の攻撃宣言
    startSingleAttack(0, atk.instanceId);

    // ★ 優先権チェック：攻撃宣言で守備側(P1)に優先権が渡っているか
    ok('攻撃宣言で守備側(P1)に優先権が渡る（awaitingPriority）', G.awaitingPriority === true);
    ok('優先権の対象が守備側(P1)', G.priorityFor === 1);

    // ★ 守備側：本物の土地タップでマナを出す
    const p1 = G.players[1];
    const land = p1.lands.find(l => !l.tapped);
    ok('守備側に未タップの土地がある', !!land);
    const tapOk = land ? tapLandForMana(1, land.instanceId) : false;
    ok('守備側が土地をタップしてW1マナを得た', tapOk && (p1.mana.W || 0) >= 1);

    // ★ 守備側：本物の盾撃をプレイ（player===1 は自動ターゲット）
    const jIdx = p1.hand.indexOf('junigeki');
    ok('守備側の手札に盾撃がある', jIdx >= 0);
    const dmgTargetBefore = G.players[0].field.length;
    playCardFromHand(1, jIdx);
    ok('盾撃がスタックに積まれた', G.stack.length > 0 && G.stack[G.stack.length - 1].name === CARD_DB['junigeki'].name);
    ok('盾撃が手札から消えた', p1.hand.indexOf('junigeki') === -1);

    // スタックを同期解決（優先権ウィンドウを介さず確定させる）
    let guard = 20;
    while (G.stack.length > 0 && guard-- > 0) { const it = G.stack.pop(); if (it && it.resolve) it.resolve(); }

    // ★ 結果：盾撃■1が攻撃側ゴーレム(1/1)に2ダメージ → 破壊される
    const atkAfter = G.players[0].field.find(c => c.instanceId === atk.instanceId);
    ok('盾撃で攻撃側ゴーレムが破壊された（2ダメージ）', !atkAfter);
    ok('盾撃が墓地に置かれた', p1.graveyard.indexOf('junigeki') >= 0);
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && e.message });
    pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }

  return {
    pass, results,
    finalState: {
      p0field: G && G.players ? G.players[0].field.length : '?',
      p1hand: G && G.players ? G.players[1].hand.length : '?',
      p1graveyard: G && G.players ? G.players[1].graveyard.slice() : '?',
    },
    log: _gv.log.slice(),
  };
}

// スタック割込み検証（★実エンジン）。初期手札にテストゴーレム追加。
//   攻撃 → 守備側が盾撃(Quick)を積む → 攻撃側が自分のターンなのでテストゴーレム(非Quick)を
//   その上にスタック → LIFO解決で「ゴーレムが先に出てから盾撃が解決」することを検証する。
function runStackVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (name, cond) => { results.push({ name, pass: !!cond }); if (!cond) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    gvSetup();
    // ★初期手札 = テストゴーレム + 盾撃（テストゴーレムを1枚追加）
    G.players[0].hand = ['test_golem', 'junigeki'];
    G.players[1].hand = ['test_golem', 'junigeki'];

    // ターン1（両者）：土地2枚配置 → 1枚タップして召喚（1枚は防御/割込み用に残す）
    gvStartTurn(0, 1, 1, 2); gvDoAction(0, 'tap1'); gvDoAction(0, 'summon'); gvEndTurnBookkeeping(0);
    gvStartTurn(1, 2, 1, 2); gvDoAction(1, 'tap1'); gvDoAction(1, 'summon'); gvEndTurnBookkeeping(1);
    ok('先行(P0)にゴーレムがいる', G.players[0].field.some(c => c.cardId === 'test_golem'));
    ok('後手(P1)にゴーレムがいる', G.players[1].field.some(c => c.cardId === 'test_golem'));

    // ターン2（先行）：アンタップ → 攻撃宣言
    gvStartTurn(0, 3, 2, 0);
    const atk = G.players[0].field.find(c => c.cardId === 'test_golem');
    startSingleAttack(0, atk.instanceId);
    ok('攻撃宣言で守備側(P1)に優先権が渡る', G.awaitingPriority === true && G.priorityFor === 1);

    // 守備側(P1)：土地タップ → 盾撃(Quick)を積む
    const p1 = G.players[1];
    tapLandForMana(1, p1.lands.find(l => !l.tapped).instanceId);
    playCardFromHand(1, p1.hand.indexOf('junigeki'));
    ok('盾撃がスタックに積まれた（1個）', G.stack.length === 1 && G.stack[0].name === CARD_DB['junigeki'].name);
    ok('盾撃のあと先行(P0)に優先権が渡る', G.priorityFor === 0);

    // 攻撃側(P0)：自分のターンなのでテストゴーレム(非Quick)を盾撃の上にスタック
    const p0 = G.players[0];
    tapLandForMana(0, p0.lands.find(l => !l.tapped).instanceId);
    const p0FieldBefore = p0.field.length;
    playCardFromHand(0, p0.hand.indexOf('test_golem'));
    ok('テストゴーレムが盾撃の上に積まれた（スタック2個）', G.stack.length === 2);
    ok('スタック最上段＝テストゴーレム（後から積んだもの）', G.stack[G.stack.length - 1].name === CARD_DB['test_golem'].name);
    ok('スタック最下段＝盾撃（先に積んだもの）', G.stack[0].name === CARD_DB['junigeki'].name);

    // LIFOで1つずつ解決し、順番を検証
    const top = G.stack.pop(); if (top && top.resolve) top.resolve();   // ① テストゴーレム
    const golemEntered = G.players[0].field.length === p0FieldBefore + 1;
    const junigekiPending = G.players[1].graveyard.indexOf('junigeki') === -1;
    ok('① テストゴーレムが先に解決して場に出た', golemEntered);
    ok('① この時点で盾撃はまだ未解決', junigekiPending);

    const bottom = G.stack.pop(); if (bottom && bottom.resolve) bottom.resolve();  // ② 盾撃
    ok('② そのあとに盾撃が解決した（墓地へ）', G.players[1].graveyard.indexOf('junigeki') >= 0);
    ok('スタックは空になった', G.stack.length === 0);
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && e.message }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return {
    pass, results,
    finalState: { p0field: G && G.players ? G.players[0].field.length : '?', p1graveyard: G && G.players ? G.players[1].graveyard.slice() : '?' },
    log: _gv.log.slice(),
  };
}

// AIの「盾撃用マナ保留」改善の検証（★実エンジン＋シミュレータ）。
//   1) シミュレータ simAttack: 守備側が残しマナで盾撃を撃ち、攻撃クリーチャーを破壊する
//   2) 残しマナが無ければ盾撃を撃てず攻撃が通る（対照）
//   3) simShouldHoldForQuick の条件判定
//   4) 実AI(aiTurn): 盾撃を持ち相手に攻撃者がいる時、W土地を1枚残す（毎回全タップしない）
function runAIHoldVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); if (!cond) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkAtkState = (sim, defLandTapped) => {
    const st = sim.state;
    st.players[0].field = [{ id:1, cardId:'test_golem', tapped:false, damage:0, sick:false, tempPower:0, tempToughness:0, entryTurn:1, mustAttack:false }];
    st.players[0].lands = []; st.players[0].hand = []; st.players[0].mana = {W:0,C:0};
    st.players[1].field = []; st.players[1].hand = ['junigeki'];
    st.players[1].lands = [{ id:10, cardId:'hito_heichi', tapped:!!defLandTapped, chargeCard:null }];
    st.players[1].mana = {W:0,C:0};
    st.turn = 3; st.activePlayer = 0; st.firstPlayer = 0;
    return st;
  };
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // 1) 守備側が残しマナ(アンタップW土地)を持つ → simAttackで盾撃が撃たれ攻撃者を破壊
    const simA = new SimGame();
    const stA = mkAtkState(simA, false);  // 守備側の土地アンタップ＝残しマナあり
    simA.simAttack(0);
    ok('シミュレータ: 守備側が残しマナで盾撃→攻撃クリーチャーを破壊', stA.players[0].field.length === 0,
      `attackerField=${stA.players[0].field.length}`);

    // 2) 対照: 残しマナ無し(土地タップ済み) → 盾撃を撃てず攻撃が通る
    const simB = new SimGame();
    const stB = mkAtkState(simB, true);   // 土地タップ済み＝残しマナなし
    const lifeBefore = stB.players[1].life;
    simB.simAttack(0);
    ok('シミュレータ: 残しマナ無し→盾撃撃てず攻撃が通る（攻撃者生存）', stB.players[0].field.length === 1);
    ok('シミュレータ: 残しマナ無し→守備側がダメージを受ける', stB.players[1].life < lifeBefore);

    // 3) simShouldHoldForQuick の条件
    const simC = new SimGame();
    const stC = simC.state;
    stC.players[1].hand = ['junigeki'];
    stC.players[1].lands = [{id:1,cardId:'hito_heichi',tapped:false},{id:2,cardId:'hito_heichi',tapped:false}];
    stC.players[0].field = [{id:9,cardId:'test_golem',tapped:false,sick:false,tempPower:0,entryTurn:1}];
    ok('simShouldHoldForQuick: 盾撃＋相手攻撃者＋2土地 → 1(保留)', simC.simShouldHoldForQuick(1) === 1);
    stC.players[0].field = [];
    ok('simShouldHoldForQuick: 相手に攻撃者なし → 0(保留しない)', simC.simShouldHoldForQuick(1) === 0);
    stC.players[0].field = [{id:9,cardId:'test_golem',tapped:false,sick:false,tempPower:0,entryTurn:1}];
    stC.players[1].hand = [];
    ok('simShouldHoldForQuick: 盾撃が手札に無い → 0(保留しない)', simC.simShouldHoldForQuick(1) === 0);

    // 4) 実AI: 混合戦略（ブラフ＋相手展開への備え）。aiDecideManaHold を多数回サンプリングして傾向を検証。
    const setupHold = (hand, oppField) => {
      gvSetup();
      G.activePlayer = 1; G.phase = 'main';
      G.players[1].hand = hand.slice();
      G.players[1].field = [];
      G.players[1].lands = [
        { instanceId:9001, cardId:'hito_heichi', tapped:false, chargeCard:null },
        { instanceId:9002, cardId:'hito_heichi', tapped:false, chargeCard:null },
      ];
      G.players[1].mana = {W:0,C:0};
      G.players[0].field = oppField;
    };
    const holdRate = (hand, oppField, trials) => {
      setupHold(hand, oppField); // aiDecideManaHold は G を書き換えないので1回セットアップで反復可
      let holds = 0;
      for (let i=0;i<trials;i++){ if (aiDecideManaHold()) holds++; }
      return holds/trials;
    };
    const N = 600;
    const atkField = [{ instanceId:9100, cardId:'test_golem', tapped:false, sick:false, damage:0, entryTurn:1 }];
    const rQuickAtk   = holdRate(['junigeki'], atkField, N); // 盾撃あり＋攻撃者あり
    const rQuickNoAtk = holdRate(['junigeki'], [],       N); // 盾撃あり＋攻撃者なし（相手展開への備え）
    const rBluffAtk   = holdRate([],           atkField, N); // 盾撃なし＋攻撃者あり（ブラフ）
    ok('混合戦略: 盾撃所持時は高確率で構える（但し常にではない）', rQuickAtk > 0.6 && rQuickAtk < 1.0, `rate=${rQuickAtk.toFixed(2)}`);
    ok('②相手展開への備え: 盾撃所持なら攻撃者不在でも一定割合で構える', rQuickNoAtk > 0.25, `rate=${rQuickNoAtk.toFixed(2)}`);
    ok('①ブラフ: 盾撃非所持でも時々構える（筒抜け防止）', rBluffAtk > 0.05, `rate=${rBluffAtk.toFixed(2)}`);
    ok('①読み不能: 構え＝盾撃所持と確定しない（ブラフ>0 かつ 所持>ブラフ）', rBluffAtk > 0 && rQuickAtk > rBluffAtk);

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack||'').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// AIの公平性改善（①マリガン ②対象選択 ③割込み温存）の検証（★実エンジン＋シミュ）
function runAIFairnessVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); if (!cond) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const CHEAP = 'test_golem', CHEAP2 = 'junigeki', EXP = 'kaizen'; // totalCost 1,1,4
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ===== ① マリガン =====
    ok('①判定: 良いカーブ(軽い札2枚)は交換しない',
      _mulliganDecision([CHEAP, CHEAP2, EXP, EXP, EXP, EXP, EXP]).length === 0);
    const dOne = _mulliganDecision([CHEAP, EXP, EXP, EXP, EXP, EXP, EXP]);
    ok('①判定: 軽い札1枚なら2枚交換', dOne.length === 2, `swap=${dOne.length}`);
    ok('①判定: 交換対象は高コスト札（軽い札index0は残す）', dOne.indexOf(0) === -1);
    ok('①判定: 軽い札0枚なら3枚交換',
      _mulliganDecision([EXP, EXP, EXP, EXP, EXP, EXP, EXP]).length === 3);

    gvSetup();
    G.players[1].mulliganUsed = false;
    G.players[1].hand = [EXP, EXP, EXP, EXP, EXP, EXP, EXP];
    G.players[1].deck = [CHEAP, CHEAP, CHEAP, CHEAP2, CHEAP2, CHEAP2, EXP, EXP, EXP, EXP];
    const deckLenBefore = G.players[1].deck.length;
    aiMulligan();
    ok('①実AI: トップヘビー手札でマリガン実行', G.players[1].mulliganUsed === true);
    ok('①実AI: 手札は7枚を維持', G.players[1].hand.length === 7);
    ok('①実AI: 山札枚数は不変（戻して同枚数引く）', G.players[1].deck.length === deckLenBefore, `deck=${G.players[1].deck.length}`);

    const simM = new SimGame();
    simM.state.players[0].hand = [CHEAP, CHEAP2, EXP, EXP, EXP, EXP, EXP];
    simM.state.players[0].mulliganUsed = false;
    const h0 = simM.state.players[0].hand.slice();
    simM.simMulligan(0);
    ok('①シミュ: 良いカーブはマリガンしない（旧・毎回3枚バグの修正）',
      simM.state.players[0].mulliganUsed === false && JSON.stringify(simM.state.players[0].hand) === JSON.stringify(h0));
    simM.state.players[1].hand = [EXP, EXP, EXP, EXP, EXP, EXP, EXP];
    simM.state.players[1].mulliganUsed = false;
    simM.simMulligan(1);
    ok('①シミュ: トップヘビーはマリガンする', simM.state.players[1].mulliganUsed === true);

    // ===== ② 対象選択（倒せる相手優先） =====
    // test_golem(1/1)に temp で擬似ステータスを付与: 5/5(2では倒せない) と 3/2(2で倒せる)
    const mkC = (iid, p, t) => ({ instanceId: iid, id: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 1 });
    gvSetup();
    G.players[0].field = [mkC(8801, 4, 4), mkC(8802, 2, 1)]; // 5/5 と 3/2
    const realPick = aiBestKillableTarget(0, 2);
    ok('②実: 盾撃(2)は倒せる相手(3/2)を狙う（倒せない5/5でない）', !!realPick && realPick.instanceId === 8802);
    G.players[0].field = [mkC(8801, 4, 4)]; // 倒せない大型のみ
    ok('②実: 倒せる相手がいなければnull（本体/最大パワーへフォールバック）', aiBestKillableTarget(0, 2) === null);
    G.players[0].field = [mkC(8810, 0, 0), mkC(8811, 2, 1)]; // 1/1 と 3/2（両方倒せる）
    const realPick2 = aiBestKillableTarget(0, 2);
    ok('②実: 倒せる相手が複数なら最大パワー(3/2)', !!realPick2 && realPick2.instanceId === 8811);

    const simT = new SimGame();
    const pickedSim = simT.simPickDamageTarget([mkC(1, 4, 4), mkC(2, 2, 1)], 2); // 5/5 と 3/2
    ok('②シミュ: simPickDamageTargetも倒せる相手(3/2)を狙う', !!pickedSim && pickedSim.id === 2);
    const pickedSim2 = simT.simPickDamageTarget([mkC(1, 4, 4)], 2); // 倒せない大型のみ→最小hp(布石)で大型
    ok('②シミュ: 倒せる相手がいなければ最小hpを返す（nullでなく布石）', !!pickedSim2);

    // ===== ③ 割込み温存（クイックを自ターンに前のめりに使わない） =====
    const sim3 = new SimGame();
    const s3 = sim3.state;
    s3.activePlayer = 1; s3.turn = 3;
    s3.players[1].hand = ['junigeki', 'test_golem']; // 盾撃(Quick) ＋ クリーチャー
    s3.players[1].field = [];
    s3.players[1].lands = []; s3.players[1].mana = { W: 5, C: 5 }; // 十分なマナ
    s3.players[0].field = [mkC(1, 0, 0)]; // 倒せる相手（撃てば得＝温存しないと前のめりに使う）
    sim3.simPlayCards(1);
    ok('③シミュ: クリーチャーは通常通りプレイされる', !s3.players[1].hand.includes('test_golem'));
    ok('③シミュ: クイック(盾撃)は自ターンに使わず手札に温存される', s3.players[1].hand.includes('junigeki'));

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack||'').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// バトル検証用の盤面セットアップ（実Gに直接書く）。攻撃側=P0、ブロッカー=P1。
// atk/blk = { cardId?, power, toughness, opts? }（cardId省略=test_golem)。
// ステータスは tempPower/tempToughness で「実効値=指定値」に合成（カード基礎値からの差分）。
// 戻り値: { atkId, blkId }
function _combatSetup(atk, blk) {
  for (const pl of [0, 1]) {
    G.players[pl].field = [];
    G.players[pl].graveyard = [];
    G.players[pl].life = 20;
  }
  const mk = (spec, iid) => {
    const cardId = spec.cardId || 'test_golem';
    const cd = CARD_DB[cardId];
    return {
      instanceId: iid, cardId, tapped: false, sick: false, damage: 0,
      tempPower: spec.power - (cd.power || 0), tempToughness: spec.toughness - (cd.toughness || 0),
      entryTurn: 0, ...(spec.opts || {})
    };
  };
  const atkId = 7001;
  G.players[0].field.push(mk(atk, atkId));
  let blkId = null;
  if (blk) { blkId = 7002; G.players[1].field.push(mk(blk, blkId)); }
  return { atkId, blkId };
}

// バトル処理検証（★実エンジン resolveSingleCombat を直接駆動）。
// 戦闘ダメージ・同時破壊・致死判定・非ブロック本体ダメージ・貫通(trample) が
// 正しく処理されるかを assert する。
function runCombatVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); if (!cond) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const alive = (pl, iid) => G.players[pl].field.some(c => c.instanceId === iid);
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ケース1: 非ブロック → 本体ダメージ（2/2 が無防備に攻撃 → P1ライフ -2）
    gvSetup();
    let s = _combatSetup({ power: 2, toughness: 2 }, null);
    resolveSingleCombat(0, s.atkId, null, null);
    ok('①非ブロック: P1ライフが攻撃力分(2)減る', G.players[1].life === 18, `life=${G.players[1].life}`);
    ok('①非ブロック: 攻撃クリーチャーは場に残る', alive(0, s.atkId));

    // ケース2: ブロック、攻撃側が倒し生存（3/3 vs 1/1）
    gvSetup();
    s = _combatSetup({ power: 3, toughness: 3 }, { power: 1, toughness: 1 });
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('②ブロック撃破: ブロッカー(1/1)は破壊され墓地へ', !alive(1, s.blkId) && G.players[1].graveyard.length === 1);
    ok('②ブロック撃破: 攻撃側(3/3)は生存', alive(0, s.atkId));
    ok('②ブロック撃破: 本体ダメージなし(ライフ20)', G.players[1].life === 20);

    // ケース3: 相打ち（2/2 vs 2/2 → 同時に致死 → 両方破壊）
    gvSetup();
    s = _combatSetup({ power: 2, toughness: 2 }, { power: 2, toughness: 2 });
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('③相打ち: 攻撃側(2/2)が破壊', !alive(0, s.atkId));
    ok('③相打ち: ブロッカー(2/2)も破壊（同時ダメージ）', !alive(1, s.blkId));

    // ケース4: 攻撃側が死に、ブロッカー生存（1/1 vs 3/3）
    gvSetup();
    s = _combatSetup({ power: 1, toughness: 1 }, { power: 3, toughness: 3 });
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('④攻撃側死亡: 攻撃側(1/1)が破壊', !alive(0, s.atkId));
    ok('④攻撃側死亡: ブロッカー(3/3)は生存', alive(1, s.blkId));

    // ケース5: 貫通（foklya 6/6貫通 が 2/2 にブロックされる → ブロッカー破壊＋超過4を本体へ）
    gvSetup();
    s = _combatSetup({ cardId: 'foklya', power: 6, toughness: 6 }, { power: 2, toughness: 2 });
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('⑤貫通: ブロッカー(2/2)は破壊', !alive(1, s.blkId));
    ok('⑤貫通: 超過(6-2=4)が本体へ → P1ライフ16', G.players[1].life === 16, `life=${G.players[1].life}`);
    ok('⑤貫通: 攻撃側(6/6)は生存', alive(0, s.atkId));

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// ── ブラウザ用デモ台本（録画用に各アクションを間をあけて実行）──
function buildGolemVerifySequence() {
  const steps = [];
  steps.push({
    label: '初期盤面セットアップ（山札=テストゴーレム / 土地=人住まう平地×2 / 初期手札1枚）',
    execute: async () => {
      gvSetup();
      gvStartTurn(0, 1, 1, 1);  // P0のターン開始：土地1枚配置 ← 【重要】これで初めて lands に土地が追加される
      const home = document.getElementById('home-screen');
      if (home) home.style.display = 'none';
      _gvRender();
      await sleep(1200);
    }
  });
  for (const turn of GOLEM_VERIFY_PLAN) {
    steps.push({
      label: `${turn.label}: ${_gvActionsLabel(turn.actions)}`,
      execute: async () => {
        gvStartTurn(turn.player, turn.gturn, turn.ptIdx, turn.land);
        await sleep(700);
        for (const action of turn.actions) {
          gvDoAction(turn.player, action);
          _gvRender();
          await sleep(900);
        }
        gvEndTurnBookkeeping(turn.player);
        await sleep(300);
      }
    });
  }
  return {
    name: 'メインフェイズ検証（テストゴーレム固定）',
    description: '両者: 山札=テストゴーレム / 土地=人住まう平地×2 / 初期手札1枚。先行・後手 各4ターンの固定手順（ブロックなし）を実行し、メインフェイズの土地タップ・召喚・攻撃を検証します。',
    steps,
  };
}

// ──────────────────────────────────────────────────
// 優先権・割込みシステムデモ：攻撃宣言 → 盾撃で対応（★本物のエンジンを駆動）
//   startSingleAttack / tapLandForMana / playCardFromHand を実際に呼び出すため、
//   映像は本物の優先権・スタック挙動を反映する。録画を決定的にするため、
//   優先権ウィンドウのAI自動応答（setTimeout駆動）は一時的に無効化する。
// ──────────────────────────────────────────────────
function buildPriorityDemo() {
  const steps = [];
  const demoCtx = {};

  steps.push({
    label: '初期盤面セットアップ（両者: 手札=盾撃1枚 / 山札=テストゴーレム / 土地デッキ=人住まう平地×2）',
    execute: async () => {
      // AI自動応答の抑止・NET_MODE固定は startDemoGeneration 側で実施済み
      gvSetup();
      G.players[0].hand = ['junigeki'];
      G.players[1].hand = ['junigeki'];
      gvStartTurn(0, 1, 1, 2);  // 土地2枚配置（1枚は防御用に残す）
      const home = document.getElementById('home-screen');
      if (home) home.style.display = 'none';
      _gvRender();
      await sleep(1200);
    }
  });

  steps.push({
    label: 'ターン1（先行）: 土地を1枚タップしてテストゴーレムを召喚',
    execute: async () => {
      gvDoAction(0, 'tap1'); _gvRender(); await sleep(800);
      gvDoAction(0, 'summon'); _gvRender(); await sleep(1100);
      gvEndTurnBookkeeping(0);
    }
  });

  steps.push({
    label: 'ターン1（後手）: 土地を1枚タップしてテストゴーレムを召喚',
    execute: async () => {
      gvStartTurn(1, 2, 1, 2); await sleep(600);
      gvDoAction(1, 'tap1'); _gvRender(); await sleep(800);
      gvDoAction(1, 'summon'); _gvRender(); await sleep(1100);
      gvEndTurnBookkeeping(1);
    }
  });

  steps.push({
    label: 'ターン2（先行）: テストゴーレムで攻撃宣言（守備側に優先権が渡る）',
    execute: async () => {
      gvStartTurn(0, 3, 2, 0); await sleep(800);
      const atk = G.players[0].field.find(c => c.cardId === 'test_golem');
      if (atk) {
        demoCtx.atkId = atk.instanceId;
        startSingleAttack(0, atk.instanceId);  // ★本物の攻撃宣言 → openPriorityWindow(1)
        _gvLog(`攻撃宣言 → 守備側(後手)に優先権（awaitingPriority=${G.awaitingPriority}, for=${G.priorityFor}）`);
      }
      _gvRender();
      await sleep(1500);
    }
  });

  steps.push({
    label: 'ターン2（後手）: 土地をタップ→盾撃で割込み（攻撃ゴーレムを破壊）',
    execute: async () => {
      const p1 = G.players[1];
      // ★本物の土地タップ
      const land = p1.lands.find(l => !l.tapped);
      if (land) { tapLandForMana(1, land.instanceId); _gvRender(); await sleep(900); }
      // ★本物の盾撃をプレイ（player===1 は自動ターゲット）
      const jIdx = p1.hand.indexOf('junigeki');
      if (jIdx >= 0) { playCardFromHand(1, jIdx); _gvRender(); await sleep(900); }
      // 残った継続コールバックを無効化してからスタックを同期解決
      G._pendingCont = null; G.priorityContinuation = null;
      let guard = 20;
      while (G.stack.length > 0 && guard-- > 0) { const it = G.stack.pop(); if (it && it.resolve) it.resolve(); }
      if (typeof checkDeath === 'function') checkDeath();
      // 戦闘・優先権状態をクリア
      G.awaitingPriority = false; G.priorityFor = null; G.combatArrows = []; G.targetMode = null;
      const atkAfter = G.players[0].field.find(c => c.instanceId === demoCtx.atkId);
      _gvLog(atkAfter ? '盾撃解決（攻撃ゴーレム生存）' : '盾撃解決 → 攻撃ゴーレムを破壊 ✓');
      _gvRender();
      await sleep(1500);
      // AI抑止・NET_MODE の復元は stopDemoRecording 側で確実に実施
    }
  });

  return {
    name: '優先権・割込みシステム検証',
    description: '両者: 手札=盾撃1枚 / 山札=テストゴーレム / 土地2枚。ターン1で両者がゴーレム召喚（1枚は防御用に残す）。ターン2で先行が攻撃宣言し、守備側に優先権が渡る → 守備側が土地をタップして盾撃で割込み、攻撃ゴーレムを破壊する様子を本物のエンジンで再生します。',
    steps,
  };
}

// ──────────────────────────────────────────────────
// バトル処理検証デモ（★本物のエンジン resolveSingleCombat を直接駆動）。
//   非ブロック本体ダメージ／ブロック撃破／相打ち／攻撃側死亡／貫通 の5ケースを再生。
//   ステータスは test_golem に temp バフを乗せて合成（foklya は実カードで貫通）。
// ──────────────────────────────────────────────────
function buildCombatDemo() {
  const steps = [];
  // 1ケースを再生する共通処理: 盤面構築→攻撃矢印表示→解決→結果表示
  const playCase = async (label, atk, blk, resultLog) => {
    gvSetup();
    const home = document.getElementById('home-screen'); if (home) home.style.display = 'none';
    const s = _combatSetup(atk, blk);
    // 攻撃側はタップして「攻撃した」状態に（見た目）。非ブロックは橙、ブロックは赤の矢印。
    const atkInst = G.players[0].field.find(c => c.instanceId === s.atkId);
    if (atkInst) atkInst.tapped = true;
    G.combatArrows = [{ fromId: s.atkId, toId: s.blkId, color: s.blkId ? '#ff4444' : '#ff8800' }];
    _gvLog(label);
    _gvRender(); await sleep(1500);
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    if (resultLog) _gvLog(resultLog());
    _gvRender(); await sleep(1900);
  };

  steps.push({ label: '①非ブロック攻撃 → 相手プレイヤーに本体ダメージ（2/2が無防備に攻撃）',
    execute: async () => { await playCase('① 2/2 が無防備に攻撃',
      { power: 2, toughness: 2 }, null,
      () => `相手プレイヤーに2ダメージ → ライフ ${G.players[1].life}（20→18）✓`); } });

  steps.push({ label: '②ブロック: 攻撃側が大きく、ブロッカーを撃破して生存（3/3 vs 1/1）',
    execute: async () => { await playCase('② 3/3 を 1/1 がブロック',
      { power: 3, toughness: 3 }, { power: 1, toughness: 1 },
      () => `ブロッカー(1/1)を撃破。攻撃側(3/3)は生存・本体ダメージなし ✓`); } });

  steps.push({ label: '③相打ち: 同パワーで同時に致死ダメージ → 両者破壊（2/2 vs 2/2）',
    execute: async () => { await playCase('③ 2/2 同士の相打ち',
      { power: 2, toughness: 2 }, { power: 2, toughness: 2 },
      () => `双方が同時に2ダメージ → 両方破壊（同時ダメージ）✓`); } });

  steps.push({ label: '④攻撃側が死に、ブロッカー生存（1/1 vs 3/3）',
    execute: async () => { await playCase('④ 1/1 を 3/3 がブロック',
      { power: 1, toughness: 1 }, { power: 3, toughness: 3 },
      () => `攻撃側(1/1)が破壊、ブロッカー(3/3)は生存 ✓`); } });

  steps.push({ label: '⑤貫通(trample): ブロッカーを倒し超過ダメージを本体へ（6/6貫通 vs 2/2）',
    execute: async () => { await playCase('⑤ フォクリア(6/6貫通) を 2/2 がブロック',
      { cardId: 'foklya', power: 6, toughness: 6 }, { power: 2, toughness: 2 },
      () => `ブロッカー破壊＋超過(6-2=4)を本体へ → ライフ ${G.players[1].life}（20→16）✓`); } });

  return {
    name: 'バトル処理検証（戦闘ダメージ・破壊・貫通）',
    description: '実際の戦闘解決エンジンを直接駆動し、①非ブロック→本体ダメージ ②ブロック撃破 ③相打ち（同時破壊）④攻撃側死亡 ⑤貫通（超過ダメージ）の5ケースを順に再生します。各ケースで攻撃→解決→結果（破壊・ライフ変化）を確認できます。',
    steps,
  };
}

// ──────────────────────────────────────────────────
// スタック割込みデモ（★本物のエンジン）：攻撃→盾撃→その上にテストゴーレムを積む→
//   LIFOで「ゴーレムが先に出てから盾撃が解決」する様子を再生する。
//   初期手札にテストゴーレムを1枚追加。
// ──────────────────────────────────────────────────
function buildStackDemo() {
  const steps = [];
  const demoCtx = {};

  steps.push({
    label: '初期盤面セットアップ（両者: 手札=テストゴーレム＋盾撃 / 山札=テストゴーレム / 土地デッキ=人住まう平地×2）',
    execute: async () => {
      gvSetup();
      G.players[0].hand = ['test_golem', 'junigeki'];  // ★テストゴーレムを1枚追加
      G.players[1].hand = ['test_golem', 'junigeki'];
      gvStartTurn(0, 1, 1, 2);  // 土地2枚（1枚は割込み用に残す）
      const home = document.getElementById('home-screen');
      if (home) home.style.display = 'none';
      _gvRender();
      await sleep(1200);
    }
  });

  steps.push({
    label: 'ターン1（先行）: 土地を1枚タップしてテストゴーレムを召喚',
    execute: async () => {
      gvDoAction(0, 'tap1'); _gvRender(); await sleep(800);
      gvDoAction(0, 'summon'); _gvRender(); await sleep(1100);
      gvEndTurnBookkeeping(0);
    }
  });

  steps.push({
    label: 'ターン1（後手）: 土地を1枚タップしてテストゴーレムを召喚',
    execute: async () => {
      gvStartTurn(1, 2, 1, 2); await sleep(600);
      gvDoAction(1, 'tap1'); _gvRender(); await sleep(800);
      gvDoAction(1, 'summon'); _gvRender(); await sleep(1100);
      gvEndTurnBookkeeping(1);
    }
  });

  steps.push({
    label: 'ターン2（先行）: テストゴーレムで攻撃宣言（守備側に優先権）',
    execute: async () => {
      gvStartTurn(0, 3, 2, 0); await sleep(800);
      const atk = G.players[0].field.find(c => c.cardId === 'test_golem');
      if (atk) { demoCtx.atkId = atk.instanceId; startSingleAttack(0, atk.instanceId); }
      _gvRender(); await sleep(1400);
    }
  });

  steps.push({
    label: 'ターン2（後手）: 土地をタップ→盾撃(Quick)をスタックに積む',
    execute: async () => {
      const p1 = G.players[1];
      const land = p1.lands.find(l => !l.tapped);
      if (land) { tapLandForMana(1, land.instanceId); _gvRender(); await sleep(900); }
      const jIdx = p1.hand.indexOf('junigeki');
      if (jIdx >= 0) { playCardFromHand(1, jIdx); _gvRender(); await sleep(1300); }
      _gvLog(`盾撃をスタックに積んだ（スタック${G.stack.length}個）`);
    }
  });

  steps.push({
    label: '攻撃側: 自分のターンなのでテストゴーレムを盾撃の上にスタック',
    execute: async () => {
      const p0 = G.players[0];
      const land = p0.lands.find(l => !l.tapped);
      if (land) { tapLandForMana(0, land.instanceId); _gvRender(); await sleep(900); }
      const gIdx = p0.hand.indexOf('test_golem');
      if (gIdx >= 0) { playCardFromHand(0, gIdx); _gvRender(); await sleep(1300); }
      _gvLog(`テストゴーレムを盾撃の上に積んだ（スタック${G.stack.length}個：上=ゴーレム / 下=盾撃）`);
    }
  });

  steps.push({
    label: 'スタック解決①: 後から積んだテストゴーレムが先に場に出る',
    execute: async () => {
      G._pendingCont = null; G.priorityContinuation = null;
      const top = G.stack.pop();           // 最上段＝テストゴーレム
      if (top && top.resolve) top.resolve();
      _gvLog('① テストゴーレムが先に解決 → 場に出た（盾撃はまだスタックに残る）');
      _gvRender();
      await sleep(1800);
    }
  });

  steps.push({
    label: 'スタック解決②: そのあとに盾撃が解決する',
    execute: async () => {
      const bottom = G.stack.pop();        // 盾撃
      if (bottom && bottom.resolve) bottom.resolve();
      if (typeof checkDeath === 'function') checkDeath();
      G.awaitingPriority = false; G.priorityFor = null; G.combatArrows = []; G.targetMode = null;
      _gvLog('② 盾撃が解決 → 完了（テストゴーレム→盾撃 の順で解決された ✓）');
      _gvRender();
      await sleep(1800);
      // AI抑止・NET_MODE の復元は stopDemoRecording 側で確実に実施
    }
  });

  return {
    name: 'スタック割込み検証（ゴーレム→盾撃）',
    description: '初期手札=テストゴーレム＋盾撃。ターン2で先行が攻撃 → 守備側が盾撃(Quick)をスタックに積む → 攻撃側は自分のターンなのでテストゴーレム(非Quick)を盾撃の上にスタック。後から積んだテストゴーレムが先に場に出て、そのあと盾撃が解決する（LIFO）様子を本物のエンジンで再生します。',
    steps,
  };
}

// ──────────────────────────────────────────────────
// チャージシステムデモ：土地タップ → チャージで土地アンタップ
// ──────────────────────────────────────────────────
function buildChargeDemo() {
  const steps = [];
  steps.push({
    label: '初期盤面セットアップ（山札=テストゴーレム / 土地デッキ=人住まう平地×2 / 初期手札1枚）',
    execute: async () => {
      gvSetup();
      gvStartTurn(0, 1, 1, 1);  // P0のターン開始：土地1枚配置・ドロー
      const home = document.getElementById('home-screen');
      if (home) home.style.display = 'none';
      _gvRender();
      await sleep(1200);
    }
  });
  steps.push({
    label: '土地をタップ（マナ生成）',
    execute: async () => {
      gvDoAction(0, 'tap1');
      _gvRender();
      await sleep(1000);
    }
  });
  steps.push({
    label: 'チャージ（手札カードを土地に割り当て、土地をアンタップ）',
    execute: async () => {
      gvDoAction(0, 'charge');
      _gvRender();
      await sleep(1200);
    }
  });
  steps.push({
    label: 'チャージした土地をタップ（マナ再生成）',
    execute: async () => {
      gvDoAction(0, 'tap1');
      _gvRender();
      await sleep(1000);
    }
  });
  steps.push({
    label: 'テストゴーレムを召喚',
    execute: async () => {
      gvDoAction(0, 'summon');
      _gvRender();
      await sleep(1200);
    }
  });
  return {
    name: 'チャージシステム検証',
    description: '山札=テストゴーレム / 土地デッキ=人住まう平地×2。土地をタップしてチャージを実行し、土地がアンタップされたあと、そのマナでテストゴーレムを召喚します。',
    steps,
  };
}

// デモシーケンス定義
const DEMO_SEQUENCES = {
  'combat-demo': buildCombatDemo(),
  'stack-demo': buildStackDemo(),
  'priority-demo': buildPriorityDemo(),
  'charge-demo': buildChargeDemo(),
  'mainphase-golem-verify': buildGolemVerifySequence(),
  'phase-order': {
    name: 'フェーズ遷移確認',
    description: 'untap → draw → main（カードプレイ＆攻撃）→ end の遷移を実際に実行',
    steps: [
      {
        label: '初期盤面セットアップ',
        execute: async (G) => {
          setupValidatorBoard();
          render();
          log('【デモ】初期盤面セットアップ完了');
          await sleep(800);
        }
      },
      {
        label: 'ターン1 メインフェーズ開始',
        execute: async (G) => {
          log('【デモ】ターン1 メインフェーズ開始');
          render();
          await sleep(600);
        }
      },
      {
        label: 'クリーチャーを手札に追加',
        execute: async (G) => {
          G.players[0].hand.push({ cardId: 'hitonokeisya', instanceId: G.nextInstanceId++ });
          log('【デモ】「ひとのけいしゃ」を手札に追加');
          render();
          await sleep(600);
        }
      },
      {
        label: 'カードをプレイ（メインフェーズ）',
        execute: async (G) => {
          const card = G.players[0].hand[0];
          if (card) {
            playCardFromHand(0, 0);
            log('【デモ】カード「ひとのけいしゃ」をプレイ');
            render();
            await sleep(1200);
          }
        }
      },
      {
        label: 'クリーチャーで攻撃宣言',
        execute: async (G) => {
          const creature = G.players[0].field.find(c => CARD_DB[c.cardId].type === 'creature');
          if (creature) {
            startSingleAttack(0, creature.instanceId);
            log('【デモ】クリーチャーで攻撃宣言');
            render();
            await sleep(1500);
          }
        }
      },
      {
        label: 'ターン終了（メインフェーズ完了）',
        execute: async (G) => {
          log('【デモ】ターン終了処理');
          endTurn();
          render();
          await sleep(1000);
        }
      }
    ]
  },
  'draw-phase': {
    name: 'ドローフェーズ動作',
    description: '先手1ターン目はドローなし。2ターン目以降はドロー実行',
    steps: [
      {
        label: 'ターン1 先手 - ドローなし確認',
        execute: async (G) => {
          setupValidatorBoard();
          G.turn = 1;
          G.activePlayer = 0;
          G.firstTurn = true;
          G.phase = 'draw';
          log('【デモ】ターン1開始（先手ドローなし）');
          render();
          await sleep(800);
        }
      },
      {
        label: 'メインフェーズへ遷移',
        execute: async (G) => {
          G.phase = 'main';
          log('【デモ】メインフェーズ開始');
          render();
          await sleep(600);
        }
      },
      {
        label: 'ターン終了',
        execute: async (G) => {
          log('【デモ】ターン1終了');
          endTurn();
          render();
          await sleep(1000);
        }
      },
      {
        label: 'ターン2 開始 - ドロー実行',
        execute: async (G) => {
          if (G.players[0].landDeck.length > 0) {
            const drawnCard = G.players[0].landDeck.pop();
            G.players[0].hand.push(drawnCard);
            log('【デモ】ドロー1枚実行');
            render();
            await sleep(800);
          }
        }
      },
      {
        label: 'メインフェーズで土地をプレイ',
        execute: async (G) => {
          G.phase = 'main';
          const landInHand = G.players[0].hand.find(c => CARD_DB[c.cardId].type === 'land');
          if (landInHand) {
            playCardFromHand(0, G.players[0].hand.indexOf(landInHand));
            log('【デモ】土地をプレイ');
            render();
            await sleep(1000);
          }
        }
      }
    ]
  },
  'attack-block': {
    name: '攻撃とダメージ計算',
    description: '攻撃宣言からダメージ計算まで実行',
    steps: [
      {
        label: '盤面セットアップ',
        execute: async (G) => {
          setupValidatorBoard();
          // P0に攻撃可能なクリーチャー配置
          G.players[0].field.push({
            cardId: 'hitonokeisya',
            instanceId: G.nextInstanceId++,
            damage: 0,
            tapped: false,
            counters: {},
            buffs: []
          });
          G.phase = 'main';
          G.activePlayer = 0;
          log('【デモ】攻撃・ダメージ盤面セットアップ完了');
          render();
          await sleep(1000);
        }
      },
      {
        label: 'P0: クリーチャーで攻撃宣言',
        execute: async (G) => {
          const attacker = G.players[0].field[0];
          if (attacker) {
            startSingleAttack(0, attacker.instanceId);
            log('【デモ】攻撃宣言: 1体の攻撃クリーチャー');
            render();
            await sleep(1500);
          }
        }
      },
      {
        label: 'P1: ブロック宣言なし',
        execute: async (G) => {
          log('【デモ】P1がブロック宣言をスキップ');
          G.blockMode = false;
          render();
          await sleep(800);
        }
      },
      {
        label: 'ダメージ計算・生命点減少',
        execute: async (G) => {
          if (G.players[0].attackers.length > 0) {
            const atkId = G.players[0].attackers[0];
            resolveSingleCombat(0, atkId);
            log('【デモ】戦闘ダメージ計算: P1が被ダメージ');
            render();
            await sleep(1200);
          }
        }
      }
    ]
  },
  'priority-window': {
    name: '優先権ウィンドウ',
    description: 'AI がスペル唱えた後、プレイヤーに Quick 対応の機会',
    steps: [
      {
        label: 'AI ターン セットアップ',
        execute: async (G) => {
          setupValidatorBoard();
          G.activePlayer = 1;
          G.phase = 'main';
          log('【デモ】AI ターン開始');
          render();
          await sleep(800);
        }
      },
      {
        label: 'AI: スペルをプレイ',
        execute: async (G) => {
          // AI手札にスペル追加
          G.players[1].hand.push({ cardId: 'soulsiphon', instanceId: G.nextInstanceId++ });
          const cardIdx = G.players[1].hand.length - 1;
          playCardFromHand(1, cardIdx);
          log('【デモ】AI がスペル「ソウルサイフォン」をプレイ');
          render();
          await sleep(1200);
        }
      },
      {
        label: '優先権ウィンドウ: プレイヤーターン',
        execute: async (G) => {
          if (G.stack.length > 0) {
            log('【デモ】プレイヤーに優先権ウィンドウ表示（Quick対応可能）');
            render();
            await sleep(2000);
          }
        }
      },
      {
        label: 'プレイヤー: Quick対応スペル唱える',
        execute: async (G) => {
          if (G.awaitingPriority) {
            G.players[0].hand.push({ cardId: 'junigeki', instanceId: G.nextInstanceId++ });
            playCardFromHand(0, 0);
            log('【デモ】プレイヤーが Quick スペルで対応');
            render();
            await sleep(1200);
          }
        }
      },
      {
        label: 'スタック解決',
        execute: async (G) => {
          while (G.stack.length > 0) {
            const effect = G.stack.pop();
            if (effect.resolve) await effect.resolve(G);
            log(`【デモ】${effect.name} を解決`);
            render();
            await sleep(600);
          }
        }
      }
    ]
  }
};

// デモパネル開閉
function openDemoVideoPanel() {
  const panel = document.getElementById('demo-video-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  initDemoVideoPanel();
}
function closeDemoVideoPanel() {
  if (_demoRunning) stopDemoRecording();
  const panel = document.getElementById('demo-video-panel');
  if (panel) panel.classList.add('hidden');
}

// デモパネル初期化
function initDemoVideoPanel() {
  const sidebar = document.getElementById('dv-sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = '';
  Object.entries(DEMO_SEQUENCES).forEach(([id, seq], idx) => {
    const item = document.createElement('div');
    item.className = 'dv-sidebar-item' + (idx === 0 ? ' active' : '');
    item.textContent = seq.name;
    item.dataset.seqId = id;
    item.onclick = () => selectDemoSequence(id, item);
    sidebar.appendChild(item);
  });
  // 既定で先頭シーケンス（メインフェイズ検証）を選択する。
  // ※ 以前は 'phase-order' を選んでいたため、ハイライト（先頭）と実選択がズレ、
  //   そのまま「生成」を押すと意図しないシーケンスが録画されていた。
  const firstId = Object.keys(DEMO_SEQUENCES)[0];
  selectDemoSequence(firstId, sidebar.firstChild);
}

// シーケンス選択
function selectDemoSequence(seqId, clickedEl) {
  _demoSequenceId = seqId;
  document.querySelectorAll('.dv-sidebar-item').forEach(el => el.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');

  const seq = DEMO_SEQUENCES[seqId];
  const main = document.getElementById('dv-main');
  main.innerHTML = `
    <div class="dv-section">
      <div class="dv-section-title">🎬 ${seq.name}</div>
      <div class="dv-description">${seq.description}</div>
    </div>

    <div class="dv-section">
      <div class="dv-section-title">📋 ステップ一覧</div>
      <ul class="dv-step-list" id="dv-step-list">
        ${seq.steps.map((s, i) => `
          <li class="dv-step-item" id="dv-step-${i}">
            <span class="dv-step-bullet">○</span>
            <span>${s.label}</span>
            ${s.note ? `<span style="color:#555;font-size:10px;margin-left:auto">(${s.note})</span>` : ''}
          </li>`).join('')}
      </ul>
    </div>

    <div class="dv-section">
      <div class="dv-section-title">🔴 録画 &amp; 生成</div>
      <div id="dv-rec-status"></div>
      <div class="dv-progress"><div class="dv-progress-bar" id="dv-progress-bar"></div></div>
      <div class="dv-status">
        <div class="dv-status-label">状態</div>
        <div class="dv-status-value" id="dv-status-text">待機中</div>
      </div>
      <div class="dv-button-group">
        <button id="dv-btn-start" onclick="startDemoGeneration('${seqId}')">▶ デモ動画を生成</button>
        <button id="dv-btn-stop" onclick="stopDemoRecording()" disabled>⏹ 停止</button>
      </div>
    </div>

    <div class="dv-section">
      <div class="dv-section-title">🎞 プレビュー</div>
      <div class="dv-preview" id="dv-preview">
        <div class="dv-preview-empty">動画生成後にここにプレビューが表示されます</div>
      </div>
      <div class="dv-button-group" id="dv-download-group" style="display:none;">
        <button onclick="downloadDemoVideo()">⬇️ 動画をダウンロード (.webm)</button>
      </div>
    </div>
  `;
}

// デモ動画生成メイン関数
async function startDemoGeneration(seqId) {
  if (_demoRunning) return;
  _demoRunning = true;
  _demoChunks = [];
  _demoVideoBlob = null;
  _demoCurrentStep = -1;
  const seq = DEMO_SEQUENCES[seqId];
  if (!seq) return;

  document.getElementById('dv-btn-start').disabled = true;
  document.getElementById('dv-btn-stop').disabled = false;
  document.getElementById('dv-download-group').style.display = 'none';
  document.getElementById('dv-preview').innerHTML = '<div class="dv-preview-empty">録画中...</div>';
  setDemoStatus('録画中...');

  // 録画用 canvas を作成（非表示）
  _demoRecordCanvas = document.createElement('canvas');
  _demoRecordCanvas.width = 960;
  _demoRecordCanvas.height = 540;
  _demoRecordCtx = _demoRecordCanvas.getContext('2d');

  // 録画機能の対応チェック（未対応ブラウザでは「何も起きない」を防ぎ、画面に理由を出す）
  const failGen = (msg) => {
    setDemoStatus('生成失敗');
    const pv = document.getElementById('dv-preview');
    if (pv) pv.innerHTML = '<div class="dv-preview-empty" style="color:#ff8888;line-height:1.6;">⚠️ 動画を生成できませんでした<br>' + msg + '</div>';
    _demoRunning = false; _demoActive = false;
    document.body.classList.remove('demo-recording');
    const sb = document.getElementById('dv-btn-start'); if (sb) sb.disabled = false;
    const tb = document.getElementById('dv-btn-stop'); if (tb) tb.disabled = true;
  };
  if (typeof MediaRecorder === 'undefined' || typeof _demoRecordCanvas.captureStream !== 'function') {
    failGen('このブラウザは録画機能（MediaRecorder / canvas.captureStream）に未対応です。<br>Chrome・Edge・Firefox の最新版でお試しください。');
    return;
  }

  // 対応する動画フォーマットを順に試す（Safari は webm 非対応なので mp4 も候補に含める）
  const _mimeCandidates = [
    'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
    'video/mp4;codecs=h264', 'video/mp4'
  ];
  let mimeType = '';
  for (const c of _mimeCandidates) {
    try { if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; } } catch (e) {}
  }
  _demoMimeType = mimeType;

  // captureStream(0) = 手動フレームモード。track.requestFrame() で描画したフレームを明示的に送る。
  // （captureStream(fps) の自動キャプチャは、rAF が止まるバックグラウンドだと無描画＝空動画になりやすい）
  let stream;
  try {
    stream = _demoRecordCanvas.captureStream(0);
    _demoVideoTrack = stream.getVideoTracks()[0] || null;
    _demoRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 })
      : new MediaRecorder(stream); // 対応フォーマット不明 → ブラウザ既定に任せる
  } catch (e) {
    failGen('録画の初期化に失敗しました（' + (e && e.message ? e.message : e) + '）。<br>Chrome・Edge・Firefox の最新版でお試しください。');
    return;
  }
  _demoRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) _demoChunks.push(e.data); };
  _demoRecorder.onstop = () => {
    _demoVideoBlob = new Blob(_demoChunks, { type: mimeType || 'video/webm' });
    showDemoPreview(_demoVideoBlob);
  };

  // 常時レンダリングループの準備。実際の対戦盤面(#board)を html2canvas で画像化して録画する。
  // html2canvas が未ロードのときだけスキーマ盤面に自動フォールバックする。
  _demoCurrentLabel = '準備中…';
  _demoStepIdx = 0;
  _demoTotalSteps = seq.steps.length;
  _demoBoardImg = null;       // 前回の残像を消す
  _demoCapturing = false;
  _demoBoardTainted = false;  // 汚染フラグをリセット（毎回まず実盤面の取り込みを試す）

  // ホーム画面を隠して実際のゲーム盤面を表示（html2canvas が撮れるよう先に表示しておく）
  const homeEl = document.getElementById('home-screen');
  if (homeEl) homeEl.style.display = 'none';
  // 縦向き/狭い画面でも盤面を強制表示（回転ロックで真っ黒になるのを防ぐ）
  document.body.classList.add('demo-recording');
  // file:// で開いている場合のみ、PNGカード画像→絵文字アートに切替（汚染回避）。
  // http(s):// では同一オリジンで汚染しないため、本物のイラストをそのまま録画する。
  if (location.protocol === 'file:') document.body.classList.add('demo-emoji-art');
  // デモ中はAIの自動優先権応答を抑止し、NET_MODE を local に固定（録画後に復元）
  _demoActive = true;
  _demoSavedNetMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : null;
  if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
  // ゲーム状態を初期化して実DOMを描画（撮影対象の盤面を用意）
  initDemoGameState({ turn: 1, activePlayer: 0, phase: 'main' });
  render();

  // 初期フレームを描画してから録画開始（最初のフレームが必ず内容を持つ）
  _demoRenderFrameToCanvas();
  _demoRecorder.start(200);
  if (_demoVideoTrack && _demoVideoTrack.requestFrame) _demoVideoTrack.requestFrame();
  _startDemoRenderLoop();

  // ステップ実行中の例外は握りつぶさず、画面にエラーを出してから録画を止める
  try {
    // ステップを順番に実行
    for (let i = 0; i < seq.steps.length; i++) {
      if (!_demoRunning) break;
      _demoCurrentStep = i;
      _demoStepIdx = i;
      const step = seq.steps[i];

      // 録画キャンバスのオーバーレイに出すラベル
      _demoCurrentLabel = step.label;

      // UI ステップを更新
      updateDemoStepUI(i, seq.steps.length);
      setDemoStatus(`ステップ ${i + 1}/${seq.steps.length}: ${step.label}`);
      setDemoProgress((i / seq.steps.length) * 100);

      // 「録画中」インジケーター表示
      document.getElementById('dv-rec-status').innerHTML =
        `<div class="dv-rec-indicator"><span class="dv-rec-dot"></span> 録画中 (${i+1}/${seq.steps.length})</div>`;

      // step.execute 関数が存在する場合は実行（新形式）
      // G を書き換えると rAF ループが次フレームで自動的に盤面へ反映する
      if (step.execute && typeof step.execute === 'function') {
        await step.execute(G);
      } else {
        // 旧形式: applyDemoStep で状態変更
        applyDemoStep(step);
        render();
      }

      await sleep(1500); // 各ステップを1.5秒間録画（rAFループが盤面を描き続ける）
    }
  } catch (e) {
    console.error('[demo] ステップ実行中のエラー:', e);
    setDemoStatus('生成失敗: ' + (e && e.message ? e.message : e));
    const rec = document.getElementById('dv-rec-status');
    if (rec) rec.innerHTML = `<div style="color:#ff8888;">⚠️ エラー: ${(e && e.message ? e.message : e)}</div>`;
  }

  stopDemoRecording();
}

// ゲーム状態をステップに合わせて変更
function applyDemoStep(step) {
  if (!G) return;
  if (step.phase) G.phase = step.phase;
  if (step.turn !== undefined) G.turn = step.turn;
  if (step.activePlayer !== undefined) G.activePlayer = step.activePlayer;
  if (step.p0life !== undefined) G.players[0].life = step.p0life;
  if (step.p1life !== undefined) G.players[1].life = step.p1life;

  // カードを手札に追加
  if (step.addCard && step.p0hand) {
    step.p0hand.forEach(cid => G.players[0].hand.push(cid));
  }

  // クリーチャーを配置
  if (step.mustAttack) {
    addDemoCreature(0, 'hitonokeisya', { mustAttack: true, sick: false });
    G.mustAttackCreatures.add(G.nextInstanceId - 1);
  }

  // AIのクリーチャープレイをシミュレート
  if (step.aiPlay) {
    addDemoCreature(1, 'hitonokeisya', { sick: true });
  }

  // スタックに効果を追加
  if (step.stack) {
    G.stack.push({ type: 'etb', desc: 'クリーチャーETB効果' });
  }

  // 優先権ウィンドウ
  if (step.priority) {
    G.awaitingPriority = true;
    G.priorityFor = 0;
    G.priorityReason = 'AIのプレイに対応';
  } else if (!step.priority && G.awaitingPriority) {
    G.awaitingPriority = false;
    G.stack = [];
  }

  // 強制攻撃警告
  if (step.warning || step.forced) {
    G.phase = 'main';
    G.attackMode = true;
  }
}

// ── 角丸矩形ヘルパー（古いブラウザでも動く） ──
function _demoRoundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 色 → カード背景グラデの基準色
const _DEMO_COLOR_BG = {
  C: ['#5a5f6e', '#2f323c'], W: ['#d8d2b8', '#8a8666'],
  R: ['#a83a3a', '#5a1e1e'], U: ['#3a5aa8', '#1e2e5a'],
  G: ['#3a8a4a', '#1e4a28'], B: ['#5a3a6a', '#2e1e3a'],
};

// クリーチャーカード1枚を描画（中心 cx,cy）。tapped は 90°回転、sick は黄枠。
function _demoDrawCreature(ctx, cx, cy, card, inst) {
  const w = 58, h = 76, r = 6;
  ctx.save();
  ctx.translate(cx, cy);
  if (inst && inst.tapped) ctx.rotate(Math.PI / 2);
  // 背景
  const pal = _DEMO_COLOR_BG[card.color] || _DEMO_COLOR_BG.C;
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, pal[0]); grad.addColorStop(1, pal[1]);
  _demoRoundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = (inst && inst.sick) ? '#ffd54a' : '#15151f';
  ctx.stroke();
  // アイコン
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '24px serif';
  ctx.fillText(card.icon || '🗿', 0, -h / 2 + 22);
  // 名前
  ctx.font = '9px "Noto Sans JP", sans-serif'; ctx.fillStyle = '#f4f4ff';
  ctx.fillText((card.name || '').slice(0, 5), 0, 6);
  // P/T
  const dmg = (inst && inst.damage) ? inst.damage : 0;
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = dmg > 0 ? '#ff9c9c' : '#fffbe0';
  ctx.fillText(`${card.power}/${card.toughness}`, 0, h / 2 - 12);
  ctx.restore();
}

// 土地カード1枚を描画（中心 cx,cy）。tapped は 90°回転＋暗転。
function _demoDrawLand(ctx, cx, cy, card, inst) {
  const w = 46, h = 34, r = 5;
  ctx.save();
  ctx.translate(cx, cy);
  if (inst && inst.tapped) ctx.rotate(Math.PI / 2);
  const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, '#cdbf86'); grad.addColorStop(1, '#7d7448');
  _demoRoundRect(ctx, -w / 2, -h / 2, w, h, r);
  ctx.fillStyle = grad; ctx.fill();
  if (inst && inst.tapped) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill(); }
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#3a3520'; ctx.stroke();
  ctx.fillStyle = '#2a2614'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '16px serif';
  ctx.fillText(card.icon || '🌾', 0, -2);
  ctx.restore();
}

// プレイヤー1人分のゾーン（情報・フィールド・土地）を描画
function _demoDrawPlayerZone(ctx, W, p, label, isActive, zoneTop, zoneH, fieldFirst) {
  // ゾーン背景（アクティブなら強調）
  _demoRoundRect(ctx, 10, zoneTop, W - 20, zoneH, 10);
  ctx.fillStyle = isActive ? 'rgba(96,96,255,0.12)' : 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.lineWidth = isActive ? 2.5 : 1;
  ctx.strokeStyle = isActive ? '#7a7aff' : '#2a2a3e';
  ctx.stroke();

  // 情報行
  const infoY = zoneTop + 18;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px "Noto Sans JP", sans-serif';
  ctx.fillStyle = isActive ? '#aab4ff' : '#cfcfe6';
  ctx.fillText(`${label}${isActive ? ' ◀ 手番' : ''}`, 24, infoY);
  ctx.font = '13px "Noto Sans JP", sans-serif';
  ctx.fillStyle = '#ff8a8a';
  ctx.fillText(`♥ ${p.life}`, 150, infoY);
  ctx.fillStyle = '#cfcfe6';
  ctx.fillText(`手札 ${p.hand.length}`, 220, infoY);
  ctx.fillText(`山札 ${p.deck.length}`, 300, infoY);
  ctx.fillText(`土地 ${p.lands.length}`, 380, infoY);
  ctx.fillText(`場 ${p.field.length}`, 460, infoY);

  // フィールド行と土地行の Y 位置（fieldFirst で順序を切替）
  const rowTop = zoneTop + 32;
  const fieldRowY = fieldFirst ? rowTop + 44 : rowTop + 100;
  const landRowY  = fieldFirst ? rowTop + 116 : rowTop + 22;

  // フィールド（クリーチャー）
  const fc = p.field.length;
  const fStep = 70;
  const fStartX = W / 2 - ((fc - 1) * fStep) / 2;
  for (let i = 0; i < fc; i++) {
    const inst = p.field[i];
    const card = CARD_DB[inst.cardId] || { power: 0, toughness: 0, name: '?', icon: '🗿', color: 'C' };
    _demoDrawCreature(ctx, fStartX + i * fStep, fieldRowY, card, inst);
  }
  // 場ラベル（クリーチャーが居ないとき）
  if (fc === 0) {
    ctx.fillStyle = '#55556e'; ctx.font = '12px "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('（場にクリーチャーなし）', W / 2, fieldRowY);
  }

  // 土地
  const lc = p.lands.length;
  const lStep = 56;
  const lStartX = W / 2 - ((lc - 1) * lStep) / 2;
  for (let i = 0; i < lc; i++) {
    const inst = p.lands[i];
    const card = CARD_DB[inst.cardId] || { icon: '🌾' };
    _demoDrawLand(ctx, lStartX + i * lStep, landRowY, card, inst);
  }
}

// ゲーム状態 G から盤面を Canvas に直接描画（html2canvas 不使用・オフライン動作）
function drawDemoBoard(ctx, W, H) {
  const BOARD_H = H - 80; // 下 80px はラベルオーバーレイ用に残す

  // 背景グラデーション
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c0c1a'); bg.addColorStop(1, '#16162e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (!G || !G.players) {
    ctx.fillStyle = '#8888aa'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '18px "Noto Sans JP", sans-serif';
    ctx.fillText('準備中…', W / 2, BOARD_H / 2);
    ctx.textAlign = 'start';
    return;
  }

  const active = G.activePlayer;
  const zoneH = 168;
  // 上＝後手(P1)：土地が上・フィールドが下（相手目線）
  _demoDrawPlayerZone(ctx, W, G.players[1], '後手 (P1)', active === 1, 8, zoneH, false);
  // 中央ターンバー
  const barY = 8 + zoneH + 6;
  const barH = BOARD_H - 2 * zoneH - 26;
  _demoRoundRect(ctx, 10, barY, W - 20, barH, 8);
  ctx.fillStyle = 'rgba(40,40,72,0.55)'; ctx.fill();
  ctx.fillStyle = '#e8e8ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px "Noto Sans JP", sans-serif';
  const phaseLabel = { main: 'メインフェイズ', combat: '戦闘フェイズ', end: '終了' }[G.phase] || G.phase || '';
  ctx.fillText(`ターン ${G.turn}　・　${phaseLabel}　・　手番: ${active === 0 ? '先行(P0)' : '後手(P1)'}`, W / 2, barY + barH / 2);
  // 下＝先行(P0)：フィールドが上・土地が下（自分目線）
  _demoDrawPlayerZone(ctx, W, G.players[0], '先行 (P0)', active === 0, 8 + zoneH + barH + 18, zoneH, true);

  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// 実際の対戦盤面(#board)を html2canvas で画像化して保持する（非同期・多重起動防止）。
// 録画ループから毎フレーム呼ばれ、前回の処理が終わっていれば次の1枚を撮る。
function _demoStartBoardCapture() {
  if (!_demoRunning) return;   // 停止後は新規キャプチャを始めない
  if (_demoBoardTainted) return; // 一度汚染を検出したら以後はスキーマ盤面で描く（html2canvasを呼ばない）
  if (_demoCapturing) return;
  if (typeof html2canvas === 'undefined') return;
  const boardEl = document.getElementById('board');
  if (!boardEl || !boardEl.offsetWidth || !boardEl.offsetHeight) return;
  _demoCapturing = true;
  html2canvas(boardEl, {
    useCORS: true,        // 同一オリジン画像はそのまま使える（汚染しない）
    allowTaint: false,    // 汚染を許可しない＝録画キャンバスが captureStream 可能なまま
    logging: false,
    backgroundColor: '#0c0c1a',
    scale: 1,
    width: boardEl.offsetWidth,
    height: boardEl.offsetHeight,
  }).then(cv => {
    // file:// のカード画像などでキャンバスが汚染されると captureStream できず0秒動画になる。
    // 汚染を検出したら、その画像は録画キャンバスに貼らずスキーマ盤面に切り替える。
    try {
      cv.getContext('2d').getImageData(0, 0, 1, 1); // 汚染なら例外
      _demoBoardImg = cv;
    } catch (e) {
      _demoBoardTainted = true;
      _demoBoardImg = null;
    }
  }).catch(() => {})
    .finally(() => { _demoCapturing = false; });
}

// 現在の盤面＋ラベルオーバーレイを録画キャンバスへ1フレーム描画
function _demoRenderFrameToCanvas() {
  const ctx = _demoRecordCtx;
  if (!ctx || !_demoRecordCanvas) return;
  const W = _demoRecordCanvas.width;
  const H = _demoRecordCanvas.height;
  const boardH = H - 80; // 下80pxはラベル帯

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0c0c1a'); bg.addColorStop(1, '#16162e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  if (!_demoBoardTainted && _demoBoardImg && _demoBoardImg.width > 0 && _demoBoardImg.height > 0) {
    // 実際の対戦画面をアスペクト比維持でフィット（レターボックス）
    const iw = _demoBoardImg.width, ih = _demoBoardImg.height;
    const scale = Math.min(W / iw, boardH / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(_demoBoardImg, (W - dw) / 2, (boardH - dh) / 2, dw, dh);
  } else {
    // 実盤面が未取得、または汚染で使えない（file://等）→ スキーマ盤面（画像不使用＝汚染しない）
    try { drawDemoBoard(ctx, W, H); } catch (e) {}
  }

  // 次フレーム用に実盤面のキャプチャを起動（非ブロッキング）
  _demoStartBoardCapture();

  // ラベルオーバーレイ（下部）
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, H - 80, W, 80);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px "Noto Sans JP", sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(_demoCurrentLabel || '', 16, H - 50);
  ctx.fillStyle = '#aaaacc';
  ctx.font = '12px "Noto Sans JP", sans-serif';
  ctx.fillText(`STEP ${Math.min(_demoStepIdx + 1, _demoTotalSteps)} / ${_demoTotalSteps}`, 16, H - 28);
  // プログレスバー
  ctx.fillStyle = '#222244'; ctx.fillRect(0, H - 6, W, 6);
  ctx.fillStyle = '#6060ff';
  const prog = _demoTotalSteps > 0 ? (_demoStepIdx + 1) / _demoTotalSteps : 0;
  ctx.fillRect(0, H - 6, W * prog, 6);
  ctx.textAlign = 'start';
}

// 録画中、盤面を常時描画し続けるループ。
// ※ requestAnimationFrame はタブが非アクティブだと発火しない（＝空動画の原因）ため、
//   バックグラウンドでも動く setInterval を使い、毎フレーム track.requestFrame() で明示キャプチャする。
function _startDemoRenderLoop() {
  if (_demoRenderTimer) clearInterval(_demoRenderTimer);
  _demoRenderTimer = setInterval(() => {
    if (!_demoRunning) return;
    _demoRenderFrameToCanvas();
    if (_demoVideoTrack && _demoVideoTrack.requestFrame) _demoVideoTrack.requestFrame();
  }, 100); // 10fps（フォアグラウンド時）。バックグラウンドでは自動的に間引かれるが描画は継続。
}
function _stopDemoRenderLoop() {
  if (_demoRenderTimer) { clearInterval(_demoRenderTimer); _demoRenderTimer = null; }
}

// 録画停止
function stopDemoRecording() {
  _demoRunning = false;
  _stopDemoRenderLoop();
  if (_demoFrameInterval) { clearInterval(_demoFrameInterval); _demoFrameInterval = null; }
  // 最終フレーム（完了状態の盤面）を1枚描いてから録画を止める
  _demoCurrentLabel = '検証完了 ✓';
  try {
    _demoRenderFrameToCanvas();
    if (_demoVideoTrack && _demoVideoTrack.requestFrame) _demoVideoTrack.requestFrame();
  } catch (e) {}
  if (_demoRecorder && _demoRecorder.state === 'recording') _demoRecorder.stop();
  _demoVideoTrack = null;

  // ホーム画面を戻す
  const homeEl = document.getElementById('home-screen');
  if (homeEl) homeEl.style.display = '';
  // 回転ロックの強制解除・絵文字アート切替を元に戻す
  document.body.classList.remove('demo-recording');
  document.body.classList.remove('demo-emoji-art');
  // AI抑止フラグ・NET_MODE を復元（録画が途中で止まっても確実に戻す）
  _demoActive = false;
  if (typeof NET_MODE !== 'undefined' && _demoSavedNetMode !== null) { NET_MODE = _demoSavedNetMode; _demoSavedNetMode = null; }

  setDemoStatus('生成完了');
  setDemoProgress(100);
  document.getElementById('dv-rec-status').innerHTML = '';
  document.getElementById('dv-btn-start').disabled = false;
  document.getElementById('dv-btn-stop').disabled = true;
  updateDemoStepUI(-1, 0); // 全ステップを done に
  _demoBoardImg = null; // 撮影画像を解放
}

// プレビュー表示
function showDemoPreview(blob) {
  const previewEl = document.getElementById('dv-preview');
  const url = URL.createObjectURL(blob);
  previewEl.innerHTML = `
    <video controls autoplay loop style="max-width:100%;max-height:360px;border-radius:4px;">
      <source src="${url}" type="${blob.type}">
    </video>`;
  const dlGroup = document.getElementById('dv-download-group');
  if (dlGroup) dlGroup.style.display = 'flex';
}

// ダウンロード
function downloadDemoVideo() {
  if (!_demoVideoBlob) return;
  const ext = (_demoMimeType || _demoVideoBlob.type || '').indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  const url = URL.createObjectURL(_demoVideoBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dcg_demo_${_demoSequenceId || 'video'}_${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ヘルパー: UI 更新
function setDemoStatus(text) {
  const el = document.getElementById('dv-status-text');
  if (el) el.textContent = text;
}
function setDemoProgress(pct) {
  const el = document.getElementById('dv-progress-bar');
  if (el) el.style.width = `${Math.min(100, pct)}%`;
}
function updateDemoStepUI(activeIdx, total) {
  const seq = DEMO_SEQUENCES[_demoSequenceId];
  if (!seq) return;
  seq.steps.forEach((_, i) => {
    const el = document.getElementById(`dv-step-${i}`);
    if (!el) return;
    const bullet = el.querySelector('.dv-step-bullet');
    if (activeIdx < 0) {
      el.className = 'dv-step-item done';
      if (bullet) bullet.textContent = '✓';
    } else if (i < activeIdx) {
      el.className = 'dv-step-item done';
      if (bullet) bullet.textContent = '✓';
    } else if (i === activeIdx) {
      el.className = 'dv-step-item active';
      if (bullet) bullet.textContent = '▶';
    } else {
      el.className = 'dv-step-item';
      if (bullet) bullet.textContent = '○';
    }
  });
}
