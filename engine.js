
// 特殊マッチ用: 保存済みデッキやAI学習デッキに関わらず、両者確実に白固定デッキを使う
function buildFixedWhiteDeck() {
  let deck = [];
  DB_WHITE_MAIN.forEach(c => { for (let i=0;i<4;i++) deck.push(c); });
  return shuffle(deck); // 10種×4枚=40枚
}
function buildFixedWhiteLandDeck() {
  let deck = [];
  DB_WHITE_LAND.forEach(l => { for (let i=0;i<2;i++) deck.push(l); });
  return shuffle(deck); // 5種×2枚=10枚
}

// Build decks
function buildMainDeck() {
  try {
    const saved = localStorage.getItem('dcg_deck');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.main && data.main.length === 40) return shuffle([...data.main]);
    }
  } catch(e) {}
  const cards = ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho',
    'serashia_heishi','serashia_junhei','serashia_souryo',
    'bastian','arestia','junigeki','kaizen'];
  let deck = [];
  cards.forEach(c => { for(let i=0;i<4;i++) deck.push(c); });
  return shuffle(deck); // exactly 40
}
// 自分のデッキデータを取得 (dcg_decks_v2 優先、なければ dcg_deck、それもなければデフォルト)
function getMyDeckData() {
  try {
    const v2 = localStorage.getItem('dcg_decks_v2');
    if (v2) {
      const data = JSON.parse(v2);
      if (data && Array.isArray(data.slots) && typeof data.active === 'number') {
        const slot = data.slots[data.active];
        if (slot && Array.isArray(slot.main) && slot.main.length === 40 &&
            Array.isArray(slot.land) && slot.land.length === 10) {
          return { main: slot.main.slice(), land: slot.land.slice() };
        }
      }
    }
  } catch(e) {}
  try {
    const saved = localStorage.getItem('dcg_deck');
    if (saved) {
      const data = JSON.parse(saved);
      if (data && Array.isArray(data.main) && data.main.length === 40 &&
          Array.isArray(data.land) && data.land.length === 10) {
        return { main: data.main.slice(), land: data.land.slice() };
      }
    }
  } catch(e) {}
  // Default fallback
  const defaultLands = ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'];
  const land = defaultLands.flatMap(l=>[l,l]);
  const mainCards = Object.keys(typeof CARD_DB !== 'undefined' ? CARD_DB : {}).filter(id => {
    const c = CARD_DB[id]; return c && c.type !== 'land';
  }).slice(0, 10);
  const main = [];
  for (let i = 0; i < 4 && main.length < 40; i++) mainCards.forEach(id => { if (main.length < 40) main.push(id); });
  return { main, land };
}

// AI用デッキ: ローカル対戦では学習で進化したデッキ(AI_DECK_COUNTS)を使う
// オンライン対戦時は相手プレイヤーの状態なので通常のbuildMainDeckにフォールバック
function buildAIMainDeck() {
  if (typeof NET_MODE !== 'undefined' && NET_MODE === 'host' && NET_GUEST_DECK &&
      Array.isArray(NET_GUEST_DECK.main) && NET_GUEST_DECK.main.length === 40) {
    return shuffle(NET_GUEST_DECK.main.slice());
  }
  if (typeof NET_MODE !== 'undefined' && NET_MODE === 'local' &&
      typeof AI_DECK_COUNTS !== 'undefined' && AI_DECK_COUNTS) {
    const arr = [];
    Object.entries(AI_DECK_COUNTS).forEach(([cid,n]) => { for (let k=0;k<n;k++) arr.push(cid); });
    if (arr.length === 40) return shuffle(arr);
  }
  return buildMainDeck();
}
// AI用土地デッキ: ローカル対戦では学習で進化した土地構成(AI_LAND_COUNTS)を使う
// プレイヤーがデッキ構築した土地をAIが共用しないようデフォルト構成にフォールバック
function buildAILandDeck() {
  if (typeof NET_MODE !== 'undefined' && NET_MODE === 'host' && NET_GUEST_DECK &&
      Array.isArray(NET_GUEST_DECK.land) && NET_GUEST_DECK.land.length === 10) {
    return shuffle(NET_GUEST_DECK.land.slice());
  }
  if (typeof NET_MODE !== 'undefined' && NET_MODE === 'local') {
    if (typeof AI_LAND_COUNTS !== 'undefined' && AI_LAND_COUNTS) {
      const arr = [];
      let valid = true;
      Object.entries(AI_LAND_COUNTS).forEach(([lid,n]) => {
        if (n > 2 && !CARD_DB[lid]?.unlimited) valid = false; // 土地は同名2枚まで（unlimitedカードは除外）
        for (let k=0;k<n;k++) arr.push(lid);
      });
      if (valid && arr.length === 10) return shuffle(arr);
    }
    // ローカル対戦のAIはプレイヤーの構築土地を使わずデフォルト構成
    const lands = ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'];
    return shuffle(lands.flatMap(l=>[l,l]));
  }
  return buildLandDeck();
}
function buildLandDeck() {
  try {
    const saved = localStorage.getItem('dcg_deck');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.land && data.land.length === 10) {
        // 土地は同名2枚まで（旧保存データの3枚以上は無効としてデフォルトへ）
        const cnt = {};
        let valid = true;
        data.land.forEach(l => { cnt[l]=(cnt[l]||0)+1; if (cnt[l]>2 && !CARD_DB[l]?.unlimited) valid=false; });
        if (valid) return shuffle([...data.land]);
      }
    }
  } catch(e) {}
  const lands = ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'];
  let deck = [];
  lands.forEach(l => { deck.push(l); deck.push(l); });
  return shuffle(deck);
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// ── Helper: Get creature name from instance for logging ──
function getCreatureName(player, instId) {
  const inst = G.players[player].field.find(c => c.instanceId === instId);
  if (!inst) return '(未知のクリーチャー)';
  const card = CARD_DB[inst.cardId];
  return card ? card.name : '(未知のカード)';
}

// ============================================================
// GAME STATE
// ============================================================
let G; // global game state
// 観戦モード用グローバル
let SPECTATOR_MODE = false;          // 観戦モードON/OFF
let SPECTATOR_VIEWPOINT = 0;         // 視点: 0=P1(上)/ 1=P2(下)
let SPECTATOR_AUTO_DRIVE = false;    // 自動駆動ON/OFF
let SPECTATOR_TICK_INTERVAL = 3000;  // 自動駆動の間隔(ms) デフォルト3000
// 特殊マッチモード用グローバル
let SPECIAL_MATCH_MODE = false;       // 特殊マッチモードON/OFF
let SPECIAL_MATCH_RECORDS = [];        // 対戦記録 {date, playerWon: boolean}

function initGame() {
  if (typeof REPLAY_HISTORY !== 'undefined') REPLAY_HISTORY = []; // 新ゲームでリプレイ履歴をクリア
  _prevCX = [0, 0];
  const firstPlayer = Math.random() < 0.5 ? 0 : 1; // 先手後手ランダム
  G = {
    turn: 1,
    activePlayer: firstPlayer,
    firstPlayer: firstPlayer, // 先手プレイヤーを記録（先行1ターン目のみドローなし判定用）
    phase: 'untap', // untap, draw, main, combat, end
    priority: 0,
    stack: [],
    players: [
      {
        life: 20,
        deck: SPECIAL_MATCH_MODE ? buildFixedWhiteDeck() : buildMainDeck(),
        landDeck: SPECIAL_MATCH_MODE ? buildFixedWhiteLandDeck() : buildLandDeck(),
        hand: [],
        field: [], // {instanceId, cardId, tapped, damage, sick, charges, tempBuff}
        lands: [], // {instanceId, cardId, tapped, chargeCard}
        artifacts: [], // {instanceId, name, icon, countdown, onLeaveType, owner}
        graveyard: [],
        exile: [],
        mana: {R:0,U:0,G:0,W:0,B:0,C:0},
        mulliganUsed: false,
        attackers: [],
        blockers: {}, // attackerId -> [blockerId]
      },
      {
        life: 20,
        deck: SPECIAL_MATCH_MODE ? buildFixedWhiteDeck() : buildAIMainDeck(),
        landDeck: SPECIAL_MATCH_MODE ? buildFixedWhiteLandDeck() : buildAILandDeck(),
        hand: [],
        field: [],
        lands: [],
        artifacts: [],
        graveyard: [],
        exile: [],
        mana: {R:0,U:0,G:0,W:0,B:0,C:0},
        mulliganUsed: false,
        attackers: [],
        blockers: {},
      }
    ],
    nextInstanceId: 1,
    firstTurn: true,
    awaitingPriority: false,
    priorityFor: null,
    priorityContinuation: null,
    priorityReason: '',
    _pendingCont: null,
    _pendingReason: '',
    _awaitingModal: false,
    _pendingCrystalPay: false,
    chargingMode: false,
    chargeUsedThisTurn: false,
    targetMode: null, // {type, callback}
    attackMode: false,
    blockMode: false,
    selectedAttacker: null,
    selectedCard: null, // {owner, zone, index}
    tempBuffs: [], // {instanceId, power, toughness, untilEnd}
    permanentBuffs: [], // {instanceId, power, toughness}
    landPlacedThisTurn: 0,
    mustAttackCreatures: new Set(),
    blockDrawActive: [false, false], // 介善: ブロック時1ドロー（各プレイヤー、次の自分のターン開始時まで）
    arestiaBuffActive: false,
    combatBlockersAlive: {},
    cantAttackPermanent: new Set(),
    kaizen_used_names: new Set(),
    kaizenBlockDraw: -1, // 介善■3: このターンブロック時ドロー (playerインデックス or -1)

    // AI attack / player block phase
    playerBlockMode: false,
    aiCurrentAttackers: [],      // [{instId, targetType:'player'|'creature', targetInstId}]
    playerBlockAssignments: {},  // aiAtkInstId -> playerBlkInstId
    selectedBlockerToAssign: null,
    directlyAttackedCreatures: new Set(), // player creature instIds being directly targeted
    // Kakutou target tracking
    kakutouTargets: {},          // playerAtkInstId -> aiCreatureInstId
    kakutouTargetMode: false,    // waiting for player to select kakutou target
    pendingKakutouInstId: null,
    combatArrows: [],
    mulliganMode: false,
    mulliganSelected: new Set(),
    // オンライン対戦では両者がマリガンを確定するまで待つ（local/hotseatはP1のみ）
    mulliganDone: [false, NET_MODE === 'host' ? false : true],
  };

  // Draw initial hands
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 7; i++) drawCard(p);
  }

  G.phase = 'main';

  const retireBtn = document.getElementById('btn-retire');
  if (retireBtn) retireBtn.style.display = 'block';

  log('ゲーム開始！', 'important');
  render();
  // ゲーム開始時マリガンを確認
  showStartMulligan();
}

function showStartMulligan() {
  G.mulliganMode = true;
  G.mulliganSelected = new Set();
  // ローカル対戦(AI vs プレイヤー)では、AI(player1)もこの時点でマリガン判断を行う。
  // （以前はAIのマリガンが最初から「完了」固定で、弱い初手を交換できず不利だった）
  if (NET_MODE === 'local') aiMulligan();
  render();
  log('--- マリガン ---', 'important');
  log('戻したいカードをクリックして選択（赤枠・半透明）し「確認」を押すと同枚数引き直します。');
  log('右クリックでカード詳細を確認できます。問題なければ「マリガンしない」を押してください。');
  const mc = document.getElementById('mulligan-controls');
  if (mc) mc.style.display = 'flex';
}

function confirmStartMulligan() {
  if (NET_MODE === 'guest') {
    netSendAction('mulliganConfirm', {selected: Array.from(G.mulliganSelected||[])});
    // ゲスト側は楽観的にUIを閉じて相手を待つ（正式な状態はホストから同期される）
    const mc = document.getElementById('mulligan-controls');
    if (mc) mc.style.display = 'none';
    log('マリガンを確定しました。相手を待っています...');
    return;
  }
  _doConfirmStartMulligan();
}
function _doConfirmStartMulligan() {
  const p = G.players[NET_MY_IDX];
  const chosen = G.mulliganSelected || new Set();
  if (chosen.size > 0) {
    const indicesToReturn = Array.from(chosen).sort((a, b) => b - a);
    indicesToReturn.forEach(i => p.deck.push(p.hand.splice(i, 1)[0]));
    p.deck = shuffle(p.deck);
    for (let i = 0; i < chosen.size; i++) drawCard(NET_MY_IDX);
    p.mulliganUsed = true;
    log(`マリガン: ${chosen.size}枚入れ替え`);
  }
  G.mulliganSelected = new Set();
  if (!G.mulliganDone) G.mulliganDone = [false, true];
  G.mulliganDone[NET_MY_IDX] = true;
  checkMulliganComplete();
}

// 初手(メインデッキ7枚／土地は別デッキなので手札に土地は無い)のカーブを見て、
// 交換すべき手札index配列を返す共通ロジック。実AI(aiMulligan)とシミュ(simMulligan)で共用。
function _mulliganDecision(hand) {
  const costs = hand.map(cid => { const cd = CARD_DB[cid]; return cd && cd.cost ? totalCost(cd.cost) : 0; });
  const cheapCount = costs.filter(c => c <= 3).length;   // コスト3以下＝序盤(〜3ターン)に動ける札

  // Phase4: マリガン戦略強化 - 色バランスと効果を考慮
  let swapCount;
  if (cheapCount >= 2) {
    // 序盤札が十分 → 交換なし、ただし完全なマナロックなら1枚交換
    const whiteCards = hand.filter(cid => {
      const c = CARD_DB[cid];
      return c && c.cost && c.cost.W && c.cost.W > 0;
    }).length;
    if (whiteCards === 0 && hand.some(cid => CARD_DB[cid]?.cost?.W)) swapCount = 1;
    else swapCount = 0;
  } else if (cheapCount === 1) swapCount = 2;  // 序盤の札が1枚 → 高コスト2枚を交換
  else swapCount = 3;                          // 序盤の札が無い → 高コスト3枚を交換

  if (swapCount === 0) return [];
  return hand.map((cid, i) => ({ i, cost: costs[i] }))
             .sort((a, b) => b.cost - a.cost)
             .slice(0, Math.min(swapCount, hand.length))
             .map(o => o.i);
}

// AI(player1)のマリガン: 弱い初手(高コスト偏重)の札を山に戻し、同枚数引き直す。
function aiMulligan() {
  const p = G.players[1];
  if (p.mulliganUsed) return;
  const idxs = _mulliganDecision(p.hand);
  if (idxs.length === 0) {
    log('AI: マリガンなし');
    if (typeof aiThink === 'function') aiThink('序盤に動ける札がそろっているので初手をキープ');
    return;
  }
  idxs.slice().sort((a, b) => b - a).forEach(i => p.deck.push(p.hand.splice(i, 1)[0]));
  p.deck = shuffle(p.deck);
  for (let k = 0; k < idxs.length; k++) drawCard(1);
  p.mulliganUsed = true;
  log(`AI: マリガン（${idxs.length}枚入れ替え）`);
  if (typeof aiThink === 'function') aiThink(`序盤に動ける札が足りないため、コストの重い${idxs.length}枚を引き直し`);
}

function skipStartMulligan() {
  if (NET_MODE === 'guest') {
    netSendAction('mulliganSkip', {});
    const mc = document.getElementById('mulligan-controls');
    if (mc) mc.style.display = 'none';
    log('マリガンなしで確定しました。相手を待っています...');
    return;
  }
  _doSkipStartMulligan();
}
function _doSkipStartMulligan() {
  G.mulliganSelected = new Set();
  if (!G.mulliganDone) G.mulliganDone = [false, true];
  G.mulliganDone[NET_MY_IDX] = true;
  checkMulliganComplete();
}

// 両プレイヤーのマリガンが確定したらゲーム開始
function checkMulliganComplete() {
  const done = G.mulliganDone || [true, true];
  const mc = document.getElementById('mulligan-controls');
  if (done[0] && done[1]) {
    G.mulliganMode = false;
    G.mulliganSelected = new Set();
    if (mc) mc.style.display = 'none';
    startFirstTurn();
  } else {
    // 自分は確定済み → 相手待ち
    if (mc && done[NET_MY_IDX]) mc.style.display = 'none';
    log('相手のマリガンを待っています...');
    render(); updateHints();
  }
}

function startFirstTurn() {
  const fp = G.activePlayer;
  placeLands(fp, 1);
  const fpName = NET_MODE === 'hotseat' ? (fp === 0 ? 'P1のターン' : 'P2のターン')
    : NET_MODE !== 'local' ? (fp === NET_MY_IDX ? 'あなたのターン' : '相手のターン')
    : (fp === 0 ? 'あなたのターン' : 'AIのターン');
  showPhaseFlash('ターン 1', fpName);
  const fpLabel = NET_MODE === 'hotseat' ? (fp === 0 ? 'P1' : 'P2') : fp === 0 ? 'プレイヤー' : 'AI';
  log(`--- ターン${G.turn} ${fpLabel}のターン（先手はランダムで決定） ---`, 'important');
  document.getElementById('btn-mulligan').disabled = true;
  render();
  updateHints();
  if (fp === 1 && NET_MODE === 'local') {
    setTimeout(aiTurn, 600);
  } else if (fp === 1 && NET_MODE === 'hotseat') {
    hotseatShowPass(1);
  }
}

function newInstance(cardId) {
  return {
    instanceId: G.nextInstanceId++, cardId,
    tapped: false, damage: 0, sick: false, chargeCard: null,
    tempPower: 0, tempToughness: 0, entryTurn: G ? G.turn : 1,
    mustAttack: false, noDamageKill: false
  };
}

// ============================================================
// CORE ACTIONS
// ============================================================
const HAND_LIMIT = 10;

// 手札に加える（上限超過分は墓地へ）
function addCardToHand(player, cardId) {
  const p = G.players[player];
  if (p.hand.length >= HAND_LIMIT) {
    p.graveyard.push(cardId);
    const card = CARD_DB[cardId];
    log(`手札上限(${HAND_LIMIT}枚)超過: ${card ? card.name : cardId} は墓地に置かれた`, 'important');
    return false;
  }
  p.hand.push(cardId);
  return true;
}

function drawCard(player) {
  const p = G.players[player];
  if (p.deck.length === 0) {
    log(`プレイヤー${player+1}の山札がなくなりました！`, 'important');
    endGame(1 - player);
    return false;
  }
  const cardId = p.deck.shift();
  const cardName = CARD_DB[cardId]?.name || cardId;
  const result = addCardToHand(player, cardId);
  log(`${cardName}を引いた`);
  animDrawCard(player);
  if (!G.drawCount) G.drawCount = [0, 0];
  G.drawCount[player] = (G.drawCount[player] || 0) + 1;
  if (G.drawCount[player] >= 2) {
    _fireDrawTrigger2nd(player);
  }
  return result;
}

// ── 緑メカニクス共通ヘルパー ──────────────────────────────────

// ランドが場に出た時の誘発処理（開拓・チャージ後に呼ぶ）
function fireLandEntersTriggers(sourcePlayer) {
  const p = G.players[sourcePlayer];
  const opp = 1 - sourcePlayer;
  p.field.forEach(inst => {
    const card = CARD_DB[inst.cardId];
    if (!card) return;
    const _instId = inst.instanceId;
    if (card.landEnterDamage2) {
      triggerEffect(`${card.name} 誘発(ランド)`, card.icon||'🌳', sourcePlayer, () => {
        G.players[opp].life -= 2;
        showFloatDamage(2, opp === 1 ? 'ai' : 'player');
        log(`${card.name}: 相手に2ダメージ`, 'damage');
        render();
      });
    }
    if (card.landEnterDamage1creature) {
      triggerEffect(`${card.name} 誘発(ランド)`, card.icon||'🎊', sourcePlayer, () => {
        if (G.players[opp].field.length === 0) { log(`${card.name}: 対象なし`); render(); continueStack(); return; }
        if (sourcePlayer === 0) {
          G.targetMode = { type:'opponentCreature', sourcePlayer:0, callback:(tgt) => {
            applyDamageToCreature(opp, tgt.instId, 1, sourcePlayer);
            const targetName = getCreatureName(opp, tgt.instId);
            log(`${card.name}: ${targetName}に1ダメージ`, 'damage');
            G.targetMode = null; render(); updateHints(); continueStack();
          }};
          render(); updateHints();
        } else {
          const tgt = G.players[opp].field[0];
          applyDamageToCreature(opp, tgt.instanceId, 1, sourcePlayer);
          log(`AI ${card.name}: 相手クリーチャーに1ダメージ`, 'damage');
          render(); updateHints(); continueStack();
        }
      });
    }
    if (card.landEnterBuff11) {
      triggerEffect(`${card.name} 誘発(ランド)`, card.icon||'🎆', sourcePlayer, () => {
        const instNow = p.field.find(c => c.instanceId === _instId);
        if (instNow) { instNow.tempPower = (instNow.tempPower||0)+1; instNow.tempToughness = (instNow.tempToughness||0)+1; log(`${card.name}: +1/+1`, 'heal'); }
        render();
      });
    }
    if (card.cx9LandEnterDraw && getCXValue(sourcePlayer) >= 9) {
      triggerEffect(`${card.name} 誘発(ランドC9)`, card.icon||'⛩️', sourcePlayer, () => {
        drawCard(sourcePlayer);
        log(`${card.name} 〈C9〉: ランド誘発で1枚引く`);
        render();
      });
    }
  });
}

// 開拓: 土地デッキからn枚を場に出す（タップ状態）
function doKaitaku(player, n) {
  const p = G.players[player];
  if (p.landDeck.length === 0) { log('土地デッキが空です'); return; }
  if (player === 0) {
    _promptKaitaku(player, n);
  } else {
    let placed = 0;
    while (placed < n && p.landDeck.length > 0) {
      const cardId = p.landDeck.shift();
      p.lands.push({ cardId, instanceId: G.nextId++, tapped: true, chargeCard: null });
      log(`AI 開拓: ${CARD_DB[cardId].name} を場に出す`, 'heal');
      fireLandEntersTriggers(player);
      placed++;
    }
    render(); updateHints();
  }
}

function _promptKaitaku(player, remaining) {
  const p = G.players[player];
  if (remaining <= 0 || p.landDeck.length === 0) { render(); updateHints(); return; }
  const unique = [...new Set(p.landDeck)];
  const btns = unique.map(id => {
    const c = CARD_DB[id];
    return `<button onclick="closeModal();G._awaitingModal=false;_pickKaitaku(0,'${id}',${remaining-1});" style="margin:4px;padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">${c.icon||'🌿'} ${c.name}</button>`;
  }).join('');
  showModal('開拓：土地を選ぶ', `<p>土地デッキから1枚選んで場に出す（残り${remaining}）</p>${btns}<button onclick="closeModal();G._awaitingModal=false;continueStack();render();updateHints();" style="margin:4px;padding:6px 14px;background:#555;border:none;color:#ccc;border-radius:4px;cursor:pointer;">スキップ</button>`);
  G._awaitingModal = true;
}

function _pickKaitaku(player, cardId, remaining) {
  const p = G.players[player];
  const idx = p.landDeck.indexOf(cardId);
  if (idx === -1) { render(); updateHints(); return; }
  p.landDeck.splice(idx, 1);
  p.lands.push({ cardId, instanceId: G.nextId++, tapped: true, chargeCard: null });
  log(`開拓: ${CARD_DB[cardId].name} を場に出す`, 'heal');
  fireLandEntersTriggers(player);
  if (remaining > 0) _promptKaitaku(player, remaining);
  else { render(); updateHints(); continueStack(); }
}

// サーチ: 山札から好きなカード1枚を手札に加える
function doSearch(player, n) {
  const p = G.players[player];
  if (p.deck.length === 0) { log('山札が空です'); return; }
  if (player === 0) {
    _promptSearch(player, n);
  } else {
    for (let i = 0; i < n && p.deck.length > 0; i++) {
      const best = p.deck.reduce((a,b) => (totalCost(CARD_DB[a] && CARD_DB[a].cost||{}) >= totalCost(CARD_DB[b] && CARD_DB[b].cost||{})) ? a : b);
      const idx = p.deck.indexOf(best);
      p.deck.splice(idx, 1);
      p.hand.push(best);
      log(`AI サーチ: ${CARD_DB[best].name} を手札に加える`, 'heal');
    }
    for (let j = p.deck.length - 1; j > 0; j--) { const k = Math.floor(Math.random()*(j+1)); [p.deck[j],p.deck[k]]=[p.deck[k],p.deck[j]]; }
    render(); updateHints();
  }
}

function _promptSearch(player, remaining) {
  const p = G.players[player];
  if (remaining <= 0 || p.deck.length === 0) { render(); updateHints(); return; }
  const unique = [...new Set(p.deck)];
  const btns = unique.map(id => {
    const c = CARD_DB[id];
    return `<button onclick="closeModal();G._awaitingModal=false;_pickSearch(0,'${id}',${remaining-1});" style="margin:4px;padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">${c.icon||'📄'} ${c.name}</button>`;
  }).join('');
  showModal('サーチ：カードを選ぶ', `<p>山札から1枚選んで手札に加える</p><div style="max-height:200px;overflow-y:auto;">${btns}</div><button onclick="closeModal();G._awaitingModal=false;continueStack();render();updateHints();" style="margin:8px 4px 0;padding:6px 14px;background:#555;border:none;color:#ccc;border-radius:4px;cursor:pointer;">スキップ</button>`);
  G._awaitingModal = true;
}

function _pickSearch(player, cardId, remaining) {
  const p = G.players[player];
  const idx = p.deck.indexOf(cardId);
  if (idx === -1) { render(); updateHints(); return; }
  p.deck.splice(idx, 1);
  p.hand.push(cardId);
  log(`サーチ: ${CARD_DB[cardId].name} を手札に加える`, 'heal');
  for (let j = p.deck.length - 1; j > 0; j--) { const k = Math.floor(Math.random()*(j+1)); [p.deck[j],p.deck[k]]=[p.deck[k],p.deck[j]]; }
  if (remaining > 0) _promptSearch(player, remaining);
  else { render(); updateHints(); continueStack(); }
}

// フォクリア ETB: 2枚還元してもよい → 2枚引く
function foklyaDoKaizou2Draw2(player) {
  const p = G.players[player];
  const avail = p.lands.filter(l => true); // all lands can be returned
  if (avail.length < 2) { render(); updateHints(); return; }
  const take = avail.slice(0, 2);
  take.forEach(l => {
    const idx = p.lands.findIndex(x => x.instanceId === l.instanceId);
    if (idx !== -1) { p.lands.splice(idx, 1); p.landDeck.push(l.cardId); }
  });
  drawCard(player); drawCard(player);
  log(`フォクリア 還元×2: 2枚引く`, 'heal');
  render(); updateHints();
}

// フォクリア 起動(還元): クリーチャー1体を今ターン保護
function foklyaActivateProtect(player, foklyaInstId) {
  const p = G.players[player];
  if (p.lands.length === 0) { log('フォクリア 還元: 土地がありません'); return; }
  const land = p.lands[0];
  p.lands.splice(0, 1);
  p.landDeck.push(land.cardId);
  log(`フォクリア 還元: ${CARD_DB[land.cardId].name} を土地デッキ底へ`);
  if (player === 0) {
    const owned = p.field;
    if (owned.length === 0) { render(); updateHints(); return; }
    const btns = owned.map(inst => {
      const c = CARD_DB[inst.cardId];
      return `<button onclick="closeModal();G._awaitingModal=false;_foklyaProtectPick(0,${inst.instanceId});" style="margin:4px;padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">${c.icon||'🌳'} ${c.name}</button>`;
    }).join('');
    showModal('フォクリア 保護', `<p>このターン離れなくするクリーチャーを選ぶ</p>${btns}`);
    G._awaitingModal = true;
  } else {
    const tgt = p.field[0];
    if (tgt) { tgt._protectedThisTurn = true; log(`AI フォクリア: ${CARD_DB[tgt.cardId].name} を保護`); }
    render(); updateHints();
  }
}

function _foklyaProtectPick(player, instId) {
  const inst = G.players[player].field.find(c => c.instanceId === instId);
  if (inst) { inst._protectedThisTurn = true; log(`フォクリア: ${CARD_DB[inst.cardId].name} を保護（このターン離れない）`, 'heal'); }
  render(); updateHints();
}

// フォルクス OC: タップ済み土地でも還元できるか
function canKaizouTappedLand(player) {
  return isOCActive(player) && G.players[player].field.some(inst => CARD_DB[inst.cardId] && CARD_DB[inst.cardId].ocKaizouTapped);
}

// ── 黒メカニクス共通ヘルパー ──────────────────────────────────
// 山札の上からn枚を墓地に置く（切削）。実際に置いた枚数を返す
function millCards(player, n) {
  const p = G.players[player];
  let milled = 0;
  const names = [];
  for (let i = 0; i < n && p.deck.length > 0; i++) {
    const cid = p.deck.shift();
    p.graveyard.push(cid);
    names.push(CARD_DB[cid] ? CARD_DB[cid].name : cid);
    milled++;
  }
  if (milled > 0) log(`${player===0?'自分':'相手'}: 山札から${milled}枚墓地へ (${names.join('、')})`);
  return milled;
}

// 効果による破壊（戦闘ダメージ以外）。耐性ゾンビの置換効果を考慮する
function destroyCreatureByEffect(player, instId, sourceName) {
  const p = G.players[player];
  const idx = p.field.findIndex(c => c.instanceId === instId);
  if (idx === -1) return false;
  const inst = p.field[idx];
  const card = CARD_DB[inst.cardId];
  if (inst._protectedThisTurn) { log(`${card.name}: このターン離れない（フォクリア保護）`); return false; }
  // 置換: ダメージ以外で離れる時、手札1枚を捨てて残ってもよい
  if (card.replaceLeaveWithDiscard && p.hand.length > 0) {
    let useReplace = false;
    if (player === 1 && NET_MODE === 'local') {
      useReplace = true; // AIは盤面維持を優先
    } else {
      useReplace = window.confirm(`${card.name}: ダメージ以外で離れます。手札を1枚捨てて場に残しますか？\n[OK] 残す（手札1枚捨て） ／ [キャンセル] 破壊される`);
    }
    if (useReplace) {
      // 解決中の置換のため自動で1枚（最も安いカード）を捨てる
      discardCards(player, 1, 'auto');
      log(`${card.name}: 置換効果 — 手札1枚を捨てて場に残った`, 'important');
      render();
      return false;
    }
  }
  showDestroyAnimation(instId);
  animDestroyParticle(instId);
  p.field.splice(idx, 1);
  p.graveyard.push(inst.cardId);
  if (G._battleDestroyedInstIds) G._battleDestroyedInstIds.add(instId);
  log(`${card.name} が破壊された${sourceName ? '（'+sourceName+'）' : ''}`, 'damage');
  return true;
}

// 手札をn枚捨てる。modeで選び方を制御（プレイヤーは選択、AIは価値の低い順）
function discardCards(player, n, mode) {
  const p = G.players[player];
  for (let k = 0; k < n; k++) {
    if (p.hand.length === 0) return;
    if (player === 0 && NET_MODE !== 'guest' && (mode === 'choose' || mode === 'leftmost-or-choose')) {
      // プレイヤーが選んで捨てる（モーダル）
      _promptDiscard(player, n - k);
      return;
    }
    // AIまたは自動: 最もコストの低い（=価値が低いと近似）カードを捨てる
    let worstIdx = 0, worstCost = Infinity;
    p.hand.forEach((cid, i) => {
      const c = CARD_DB[cid];
      const tc = c && c.cost ? totalCost(c.cost) : 0;
      if (tc < worstCost) { worstCost = tc; worstIdx = i; }
    });
    const discarded = p.hand.splice(worstIdx, 1)[0];
    p.graveyard.push(discarded);
    log(`${player===0?'自分':'相手'}: ${CARD_DB[discarded]?.name||discarded} を捨てた`, 'important');
  }
  render();
}

// プレイヤーに手札を選んで捨てさせるモーダル
function _promptDiscard(player, remaining) {
  const p = G.players[player];
  if (p.hand.length === 0) { render(); if (G._discardCont) { const c=G._discardCont; G._discardCont=null; c(); } return; }
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">捨てる手札を1枚選んでください（残り${remaining}枚）:</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="discard-cards"></div>`;
  showModal('手札を捨てる', html);
  const container = document.getElementById('discard-cards');
  // 重複を避けつつ全カード表示
  p.hand.forEach((cid, i) => {
    const card = CARD_DB[cid];
    const el = document.createElement('div');
    el.className = `card color-${card.color||'C'}`;
    el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    el.onclick = () => {
      const removed = p.hand.splice(i, 1)[0];
      p.graveyard.push(removed);
      log(`自分: ${CARD_DB[removed]?.name||removed} を捨てた`, 'important');
      closeModal(); G._awaitingModal = false;
      if (remaining - 1 > 0 && p.hand.length > 0) {
        _promptDiscard(player, remaining - 1);
      } else {
        render(); updateHints();
        if (G._discardCont) { const c=G._discardCont; G._discardCont=null; c(); }
      }
    };
    container.appendChild(el);
  });
}

// 墓地からクリーチャーを場に出す（リアニメイト）。条件に合うものを対象
// filterFn(card)->bool, opts.cantAttack, opts.aiAuto
function reanimateFromGraveyard(player, filterFn, opts) {
  opts = opts || {};
  const p = G.players[player];
  if (p.field.length >= 5) { log('フィールドが満杯のためリアニメイトできません'); return false; }
  const candidates = p.graveyard
    .map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
    .filter(({ card }) => card && card.type === 'creature' && (!filterFn || filterFn(card)));
  if (candidates.length === 0) { log('墓地に対象クリーチャーがいません'); return false; }

  const doReanimate = (cid, gi) => {
    p.graveyard.splice(gi, 1);
    const inst = newInstance(cid);
    inst.sick = true;
    inst.entryTurn = G.turn;
    if (opts.cantAttack) inst.cantAttackThisGame = true;
    _enteringInstIds.add(inst.instanceId);
    p.field.push(inst);
    log(`${CARD_DB[cid].name} を墓地から場に出した`, 'important');
    fireETB(player, inst.instanceId);
    render(); updateHints();
  };

  if (player === 1 || opts.aiAuto || NET_MODE === 'guest') {
    // AI/自動: マナ総量が最大のものを選ぶ
    const best = candidates.reduce((a, b) => totalCost(b.card.cost||{}) > totalCost(a.card.cost||{}) ? b : a);
    doReanimate(best.cid, best.i);
    return true;
  }

  // プレイヤー: モーダルで選択
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">墓地から場に出すクリーチャーを選んでください:</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="reanimate-cards"></div>
    <button onclick="closeModal();G._awaitingModal=false;continueStack();" style="margin-top:8px;padding:6px 12px;">出さない</button>`;
  showModal('リアニメイト', html);
  const container = document.getElementById('reanimate-cards');
  candidates.forEach(({ cid, i, card }) => {
    const el = document.createElement('div');
    el.className = `card color-${card.color||'C'}`;
    el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    el.onclick = () => {
      closeModal(); G._awaitingModal = false;
      doReanimate(cid, i);
      continueStack();
    };
    container.appendChild(el);
  });
  return true;
}

function _fireDrawTrigger2nd(player) {
  const opp = 1 - player;
  G.players[player].field.forEach(creature => {
    const card = CARD_DB[creature.cardId];
    if (!card) return;
    const dmg = card.onDrawTrigger2nd === 'damage2creature' ? 2
              : card.onDrawTrigger2nd === 'damage3creature' ? 3 : 0;
    if (dmg > 0 && G.players[opp].field.length > 0) {
      const target = G.players[opp].field.reduce((a,b) =>
        (getEffectiveToughness(opp,b) - b.damage) < (getEffectiveToughness(opp,a) - a.damage) ? b : a
      );
      applyDamageToCreature(opp, target.instanceId, dmg, player);
      log(`${card.name}: 2枚目ドロー誘発 — ${CARD_DB[target.cardId]?.name||'?'}に${dmg}ダメージ`, 'damage');
      checkDeath();
    }
    // アーカ C6: 2枚目ドロー時 +0/+1（永続）
    if (card.onDrawTrigger2ndC6 === 'buffSelfPlus01' && getCXValue(player) >= 6) {
      addPermanentBuff(player, creature.instanceId, 0, 1);
      log(`${card.name} C6: 2枚目ドロー → +0/+1(永続)`);
    }
    // ネクサ C8: 2枚目ドロー時1枚引く（ターン1:自身）
    if (card.onDrawTrigger2ndC8 === 'draw1self' && getCXValue(player) >= 8) {
      if (creature._nexaDrawTurn !== G.turn) {
        creature._nexaDrawTurn = G.turn;
        const p2 = G.players[player];
        if (p2.deck.length > 0) {
          // Direct draw without triggering another 2nd-draw cycle
          const cid = p2.deck.shift();
          addCardToHand(player, cid);
          G.drawCount[player]++;
          log(`${card.name} C8: 2枚目ドロー → 1枚引く`);
        }
      }
    }
  });
  render();
}

function placeLands(player, count) {
  const p = G.players[player];
  for (let i = 0; i < count; i++) {
    if (p.landDeck.length === 0) break;
    if (p.lands.length >= 10) break;
    const cardId = p.landDeck.shift();
    const inst = newInstance(cardId);
    inst.tapped = false;
    p.lands.push(inst);
    G.landPlacedThisTurn++;
    const card = CARD_DB[cardId];
    // wasure_heichi: draw when charged (chargeCard set later via charge action)
    // chargeDrawTrigger fires when chargeCard is set — handled in chargeToLand
    fireLandEntersTriggers(player);
  }
}

function untapAll(player) {
  const p = G.players[player];
  p.field.forEach(c => { c.tapped = false; c.sick = false; });
  p.lands.forEach(l => { l.tapped = false; });
}

function tapLandForMana(player, instId) {
  const p = G.players[player];
  const land = p.lands.find(l => l.instanceId === instId);
  if (!land || land.tapped) return false;
  animLandTap(instId);
  land.tapped = true;
  const card = CARD_DB[land.cardId];
  const manaType = card.produces || 'C';
  p.mana[manaType] = (p.mana[manaType]||0) + 1;
  log(`土地をタップ: ${manaType}マナを追加`);
  render();
  return true;
}

function canAfford(player, cost) {
  const p = G.players[player];
  const mana = {...p.mana};
  for (const [c, amt] of Object.entries(cost)) {
    if (c === 'C') continue;
    if ((mana[c] || 0) < amt) return false;
    mana[c] -= amt;
  }
  const colorless = cost.C || 0;
  const total = Object.values(mana).reduce((a,b)=>a+b,0);
  return total >= colorless;
}

function payMana(player, cost) {
  const p = G.players[player];
  for (const [c, amt] of Object.entries(cost)) {
    if (c === 'C') continue;
    p.mana[c] -= amt;
  }
  let colorless = cost.C || 0;
  const colors = ['R','U','G','W','B','C'];
  for (const c of colors) {
    if (colorless <= 0) break;
    const take = Math.min(p.mana[c], colorless);
    p.mana[c] -= take;
    colorless -= take;
  }
}

function costToString(cost) {
  let s = '';
  if (cost.C) s += cost.C;
  ['R','U','G','W','B'].forEach(c => { if (cost[c]) s += c.repeat(cost[c]); });
  return s || '0';
}

function playCardFromHand(player, handIndex) {
  const p = G.players[player];
  if (handIndex < 0 || handIndex >= p.hand.length) { log('カードインデックスが無効です'); return; }
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!card) return;

  if (card.type === 'land') {
    log('土地は手札から直接プレイできません（土地デッキから自動配置）');
    return;
  }

  const isMyTurn = G.activePlayer === player;
  const inMain = G.phase === 'main';
  const isQuick = card.keywords && card.keywords.includes('Quick');

  const inPriorityWindow = G.awaitingPriority;
  // Quick は常に使用可能（対象有無に関わらず）
  if (isQuick) {
    // Quick は優先権ウィンドウなしでも使用可能
    // マナがなくても「使用宣言」をできる（ブラフ効果）
    if (player === 0 && !canAfford(player, card.cost)) {
      G._awaitingModal = true;
      showModal(`${card.name} - マナ不足`,
        `<p>${card.name}を使用宣言しますか？（マナが足りませんが、この意思表示を相手に見せられます）</p>
        <button onclick="closeModal();G._awaitingModal=false;playCardFromHandForReal(${player},${handIndex});" style="margin:4px;padding:6px 14px;background:#ff6b6b;border:none;border-radius:4px;color:#fff;cursor:pointer;">使用宣言</button>
        <button onclick="closeModal();G._awaitingModal=false;" style="margin:4px;padding:6px 14px;background:#888;border:none;border-radius:4px;color:#fff;cursor:pointer;">キャンセル</button>`
      );
      return;
    }
  } else {
    // 非Quick: 通常のルール適用
    // ターンプレイヤーは優先権ウィンドウ中も通常通り使える
    // 非ターンプレイヤーはQuickのみ
    if (!isMyTurn) { log('非ターンプレイヤーはQuickのみ使用できます'); return; }
    // メインフェイズ外では優先権ウィンドウ中のみ許可
    if (!inMain && !inPriorityWindow) { log('メインフェイズ以外ではカードをプレイできません'); return; }
    // スタックに何かが積まれていても、自分のターンなら非Quickカードを割込みで積める。
    // （相手ターンに割り込めるのは Quick のみ＝この分岐は上の !isMyTurn 判定で弾き済み）
  }

  // 結晶カード: 本体コストの有無に関わらず、crystalEtb があれば結晶宣言の選択肢を提示
  if (card.crystalEtb && player === 0) {
    const crystalCost = card.crystalEtb;
    const canPayCrystal = (p.mana.W || 0) >= crystalCost;
    const canPayFull = canAfford(player, card.cost);
    if (canPayCrystal || canPayFull) {
      G._awaitingModal = true;
      let modalText = `<p>このカードをどのようにプレイしますか？</p>`;
      if (canPayFull) {
        modalText += `<button onclick="closeModal();G._awaitingModal=false;playCardFromHandAfterCrystal(${player},${handIndex});" style="margin:4px;padding:6px 14px;background:#4a9eff;border:none;border-radius:4px;color:#fff;cursor:pointer;">本体をプレイ（${costToString(card.cost)}）</button>`;
      }
      if (canPayCrystal) {
        modalText += `<button onclick="closeModal();G._awaitingModal=false;declareCrystalOnly(${player},${handIndex});" style="margin:4px;padding:6px 14px;background:#c0a020;border:none;border-radius:4px;color:#fff;cursor:pointer;">アレスティアの旗のみ宣言（白${crystalCost}）</button>`;
      }
      showModal(`${card.name}`, modalText);
      return;
    }
    log('マナが足りません');
    return;
  }

  if (!canAfford(player, card.cost)) { log('マナが足りません'); return; }

  if (card.type === 'spell') {
    if (card.effect === 'junigeki') {
      // 盾撃は1つのスタックアイテムとして解決し、解決時に■1→■2を順次処理する。
      // （クイック割込みは「盾撃の解決前」に行われ、盾撃解決時は■1・■2とも必ず処理される）
      const opp = 1-player;
      const hasOppCreature = G.players[opp].field.length > 0;
      const hasOwnCreature = G.players[player].field.length > 0;
      if (!hasOppCreature && !hasOwnCreature) {
        log(`${card.name}: 対象なしのためプレイできません`);
        return;
      }
      payMana(player, card.cost);
      p.hand.splice(handIndex, 1);
      log(`${card.name} をスタックに積んだ`, 'important');
      // 裏目学習E: 相手（人間）がAIのターン中にクイックを実際に撃った → 記憶して次から構えを警戒
      if (player === 0 && G.activePlayer === 1 && typeof recordUrameEvent === 'function') {
        recordUrameEvent(cardId, 'quick');
      }
      // ■2を処理してから解決を完了する
      const junigekiStep2 = () => {
        if (G.players[player].field.length === 0) {
          log(`${card.name} ■2: 対象なしのためスキップ`);
          p.graveyard.push(cardId);
          render(); updateHints(); continueStack(); return;
        }
        if (player === 1) {
          // AI: 最もパワーの高い自分のクリーチャーを強化
          const tgt = G.players[1].field.reduce((a,b)=>getEffectivePower(1,b)>getEffectivePower(1,a)?b:a);
          addPermanentBuff(player, tgt.instanceId, 0, 1);
          log(`${card.name} ■2: 自クリーチャー+0/+1(永続)`);
          p.graveyard.push(cardId);
          render(); updateHints(); continueStack(); return;
        }
        G.targetMode = { type:'ownCreature', sourcePlayer:player, callback:(tgt) => {
          G.targetMode = null;
          addPermanentBuff(player, tgt.instId, 0, 1);
          const targetName = getCreatureName(player, tgt.instId);
          log(`${card.name} ■2: ${targetName}を+0/+1(永続)`);
          p.graveyard.push(cardId);
          render(); updateHints(); continueStack();
        }};
        render(); updateHints();
      };
      // ■1: 相手クリーチャー1体に2ダメージ → その後■2
      const junigekiStep1 = () => {
        if (G.players[opp].field.length === 0) {
          log(`${card.name} ■1: 対象なしのためスキップ`);
          junigekiStep2(); return;
        }
        if (player === 1) {
          const tgt = G.players[opp].field.reduce((a,b)=>getEffectivePower(opp,b)>getEffectivePower(opp,a)?b:a);
          applyDamageToCreature(opp, tgt.instanceId, 2, player);
          log(`${card.name} ■1: 相手クリーチャーに2ダメージ`);
          checkDeath(); render(); updateHints(); junigekiStep2(); return;
        }
        G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
          G.targetMode = null;
          applyDamageToCreature(opp, tgt.instId, 2, player);
          const targetName = getCreatureName(opp, tgt.instId);
          log(`${card.name} ■1: ${targetName}に2ダメージ`);
          checkDeath(); render(); updateHints(); junigekiStep2();
        }};
        render(); updateHints();
      };
      G.stack.push({ name: card.name, icon:'🛡️', owner:player, resolve: junigekiStep1 });
      renderStack(); render(); updateHints();
      openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
      return;
    }
    if (card.effect === 'kaizen') {
      playKaizen(player, handIndex);
      return;
    }
    if (card.effect === 'raigeki') {
      payMana(player, card.cost);
      p.hand.splice(handIndex, 1);
      log(`${card.name} をスタックに積んだ`, 'important');
      const opp = 1 - player;
      G.stack.push({ name: card.name, icon: card.icon||'⚡', owner: player, resolve: () => {
        p.graveyard.push(cardId);
        if (G.players[opp].field.length === 0) {
          CARD_EFFECTS.raigeki.apply(player, {}); // 対象なし → 効果(1枚引く)のみ
          log(`${card.name}: クリーチャー対象なし → 1枚引く`); render(); updateHints(); continueStack();
          return;
        }
        G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
          G.targetMode = null;
          const targetName = getCreatureName(opp, tgt.instId);
          CARD_EFFECTS.raigeki.apply(player, { oppTargetId: tgt.instId }); // 2ダメージ＋1枚引く
          log(`${card.name}: ${targetName}に2ダメージ`, 'damage');
          log(`${card.name}: 1枚引く`);
          checkDeath(); render(); updateHints(); continueStack();
        }};
        log(`${card.name}: 2ダメージの対象を選択`); render(); updateHints();
      }});
      renderStack(); render(); updateHints();
      openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
      return;
    }
    if (card.effect === 'akageki') {
      payMana(player, card.cost);
      p.hand.splice(handIndex, 1);
      log(`${card.name} をスタックに積んだ`, 'important');
      const opp = 1 - player;
      G.stack.push({ name: card.name, icon: card.icon||'🔥', owner: player, resolve: () => {
        p.graveyard.push(cardId);
        if (player === 1 && NET_MODE === 'local') {
          const oppF = G.players[opp].field;
          const killable = oppF.find(c => getEffectiveToughness(opp,c) - c.damage <= 2);
          if (killable) { applyDamageToCreature(opp, killable.instanceId, 2, player); log(`AI ${card.name}: クリーチャーに2ダメージ`,'damage'); }
          else { G.players[opp].life -= 2; showLifeChange(opp,-2); log(`AI ${card.name}: プレイヤーに2ダメージ`,'damage'); }
          checkDeath(); render(); updateHints(); continueStack(); return;
        }
        if (G.players[opp].field.length === 0) {
          G.players[opp].life -= 2; showLifeChange(opp,-2); log(`${card.name}: プレイヤーに2ダメージ`,'damage'); checkDeath(); render(); updateHints(); continueStack();
          return;
        }
        G._awaitingModal = true;
        showModal(card.name, `<p style="margin-bottom:10px;">2ダメージの対象を選択:</p>
          <button onclick="akagekiChoose(${player},'creature')" style="width:100%;margin-bottom:8px;padding:8px;background:#3a1a1a;border:1px solid #cc4422;color:#fff;border-radius:6px;cursor:pointer;">🔥 相手クリーチャー</button>
          <button onclick="akagekiChoose(${player},'player')" style="width:100%;padding:8px;background:#3a1a1a;border:1px solid #cc4422;color:#fff;border-radius:6px;cursor:pointer;">🎯 相手プレイヤー</button>`);
      }});
      renderStack(); render(); updateHints();
      openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
      return;
    }
    if (card.effect === 'iegeki') {
      playIegeki(player, handIndex);
      return;
    }
    if (card.effect === 'ao_geki') {
      playAoGeki(player, handIndex);
      return;
    }
    if (card.effect === 'chishiki_no_seiri') {
      playChishikiNoSeiri(player, handIndex);
      return;
    }
    if (card.effect === 'mizu_geki') {
      playMizuGeki(player, handIndex);
      return;
    }
    if (card.effect === 'hitei') {
      playHitei(player, handIndex);
      return;
    }
    if (card.effect === 'kurogeki') {
      playKurogeki(player, handIndex);
      return;
    }
    if (card.effect === 'shigoeki') {
      playShigoeki(player, handIndex);
      return;
    }
    if (card.effect === 'kaitaku1spell') {
      playKaitaku1Spell(player, handIndex);
      return;
    }
    if (card.effect === 'mori_kansha') {
      playMoriKansha(player, handIndex);
      return;
    }
    payMana(player, card.cost);
    p.hand.splice(handIndex, 1);
    log(`${card.name} をスタックに積んだ`, 'important');
    G.stack.push({ name: card.name, icon: card.icon||'✨', owner: player, resolve: () => {
      p.graveyard.push(cardId);
      log(`${card.name} 解決`);
      render(); updateHints(); continueStack();
    }});
    renderStack(); render(); updateHints();
    openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
    return;
  }

  // Creature: スタックに積んで解決時に場に出る
  if (p.field.length >= 5) { log('フィールドがいっぱいです（最大5体）'); return; }

  // 結晶コスト選択（アレスティアなど crystalEtb を持つカード）
  if (card.crystalEtb && player === 0) {
    const crystalCost = card.crystalEtb; // 1 = 白1マナ
    const canPayCrystal = (p.mana.W || 0) >= crystalCost;
    if (canPayCrystal) {
      G._awaitingModal = true;
      showModal(`${card.name} 結晶コスト`,
        `<p>結晶${crystalCost}：白${crystalCost}マナを追加で支払い、「アレスティアの旗」を場に出しますか？<br><small>（このカードが離れた時、アレスティアを再召喚します）</small></p>
        <button onclick="closeModal();G._awaitingModal=false;G._pendingCrystalPay=true;playCardFromHandAfterCrystal(${player},${handIndex});" style="margin:4px;padding:6px 14px;background:#c0a020;border:none;border-radius:4px;color:#fff;cursor:pointer;">支払う（白${crystalCost}）</button>
        <button onclick="closeModal();G._awaitingModal=false;G._pendingCrystalPay=false;playCardFromHandAfterCrystal(${player},${handIndex});" style="margin:4px;padding:6px 14px;background:#555;border:none;border-radius:4px;color:#fff;cursor:pointer;">支払わない</button>`
      );
      return;
    }
  }
  // AI の結晶コストは常に支払わない（シンプル実装）
  if (card.crystalEtb && player === 1) {
    G._pendingCrystalPay = false;
  }
  _doPlayCreature(player, handIndex, cardId, card, p);
}

function playCardFromHandForReal(player, handIndex) {
  const p = G.players[player];
  if (handIndex < 0 || handIndex >= p.hand.length) return;
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!card) return;
  if (!canAfford(player, card.cost)) {
    log('【使用宣言失敗】マナが足りません');
    render();
    return;
  }
  playCardFromHand(player, handIndex);
}

function playCardFromHandAfterCrystal(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  _doPlayCreature(player, handIndex, cardId, card, p);
}

function _doPlayCreature(player, handIndex, cardId, card, p) {
  const payCrystal = G._pendingCrystalPay;
  G._pendingCrystalPay = false;
  payMana(player, card.cost);
  if (payCrystal && card.crystalEtb) {
    p.mana.W = Math.max(0, (p.mana.W || 0) - card.crystalEtb);
  }
  p.hand.splice(handIndex, 1);
  const inst = newInstance(cardId);
  inst.sick = true;
  inst.entryTurn = G.turn;
  inst._payCrystal = payCrystal;
  log(`${card.name} をスタックに積んだ (${costToString(card.cost)})${payCrystal ? ' [結晶'+card.crystalEtb+']' : ''}`, 'important');
  G.stack.push({ name: card.name, icon: card.icon||'⚔️', owner: player, resolve: () => {
    if (p.field.length >= 5) { p.graveyard.push(cardId); log(`${card.name}: フィールドが満杯`); return; }
    _enteringInstIds.add(inst.instanceId);
    p.field.push(inst);
    log(`${card.name} が場に出た`, 'important');
    if (inst._payCrystal && card.crystalEtb) {
      spawnCrystalArtifact(player, 2, 'spawnArestia');
    }
    fireETB(player, inst.instanceId);
    render(); updateHints();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}の召喚に対応`);
}

// ============================================================
// KAIZEN SPELL（効果は■区切りで上から順に処理）
// ============================================================
// 効果処理の進行を画面に表示する共通ヘルパー
function showEffectStep(cardName, step, total, desc) {
  log(`${cardName} 効果${step}/${total}: ${desc}`, 'important');
  const banner = document.getElementById('status-banner');
  if (banner) {
    banner.innerHTML = `✨ <b>${cardName}</b> 効果${step}/${total}: ${desc}`;
    banner.style.color = '#ffcc88';
    banner.style.display = 'block';
  }
}

function playKaizen(player, handIndex) {
  const p = G.players[player];
  if (handIndex < 0 || handIndex >= p.hand.length) { log('カードインデックスが無効です'); return; }
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナが足りません'); return; }

  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ (${costToString(card.cost)})`, 'important');

  const ocAtCast = isOCActive(player);
  const opp = 1 - player;

  // ■効果を逆順にスタック積み（LIFOで上から順に解決）
  // OC: クリーチャー展開 (最後に積む = 最後に解決)
  if (ocAtCast) {
    G.stack.push({ name:`${card.name} OC: クリーチャー展開`, icon:'✨', owner:player, fastResolve:true, resolve:() => {
      p.graveyard.push(cardId);
      G._kaizenOCCont = () => continueStack();
      kaizenOCDeploy(player);
    }});
  }
  // 相手クリーチャー1体に5ダメージ (最後に積む = 最初に解決, LIFO)
  G.stack.push({ name:`${card.name}: 相手クリーチャーに5ダメージ`, icon:'✨', owner:player, resolve:() => {
    if (!ocAtCast) p.graveyard.push(cardId);
    if (G.players[opp].field.length === 0) {
      log(`${card.name}: 対象なし`); continueStack(); return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      const targetName = getCreatureName(opp, tgt.instId);
      applyDamageToCreature(opp, tgt.instId, 5, player);
      log(`${card.name}: ${targetName}に5ダメージ`);
      render(); updateHints(); continueStack();
    }};
    render(); updateHints();
  }});

  renderStack(); render(); updateHints();
  openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
}

function kaizenOCDeploy(player) {
  const p = G.players[player];
  const eligible = p.hand.map((cid,i)=>({cid,i,card:CARD_DB[cid]}))
    .filter(({cid,card}) => card.type === 'creature' && totalCost(card.cost) <= 8 && !G.kaizen_used_names.has(card.name));
  if (eligible.length === 0) { log('介善OC: 出せるクリーチャーがありません'); if (G._kaizenOCCont) { const cb = G._kaizenOCCont; G._kaizenOCCont = null; cb(); } return; }
  if (p.field.length >= 5) { log('介善OC: フィールドが満杯のため出せません'); if (G._kaizenOCCont) { const cb = G._kaizenOCCont; G._kaizenOCCont = null; cb(); } return; }

  if (player === 1 && NET_MODE !== 'hotseat') {
    showAIThinking(true);
    const best = mctsPickOption(eligible, (sim, opt) => {
      const p1 = sim.state.players[1];
      if (p1.field.length >= 5) return;
      const idx = p1.hand.indexOf(opt.cid);
      if (idx === -1) return;
      p1.hand.splice(idx, 1);
      const inst = {id:sim.nid++,cardId:opt.cid,tapped:false,damage:0,sick:false,tempPower:0,tempToughness:0,entryTurn:sim.state.turn};
      p1.field.push(inst);
      sim.simETB(1, inst);
      sim.simCheckDeath(0); sim.simCheckDeath(1);
    }) || eligible.reduce((a,b)=>(b.card.power||0)>(a.card.power||0)?b:a);
    showAIThinking(false);
    _kaizenDeployCreature(player, best.cid, best.i);
    if (G._kaizenOCCont) { const cb = G._kaizenOCCont; G._kaizenOCCont = null; cb(); }
    return; // AI同期処理 — closePriorityAndResolveが続きを処理
  }

  // プレイヤー非同期: モーダル待機
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">場に出すクリーチャーを選択（このゲーム中攻撃不可）:</p>
    <div style="display:flex; flex-wrap:wrap; gap:8px;" id="koc-cards"></div>
    <button onclick="closeModal(); G._awaitingModal=false; continueStack();" style="margin-top:10px;width:100%;">出さない（スキップ）</button>`;
  showModal('介善 OC効果', html);
  const container = document.getElementById('koc-cards');
  eligible.forEach(({cid,i,card}) => {
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.innerHTML = buildCardHTML(card);
    el.dataset.cardId = cid;
    el.onclick = () => {
      closeModal();
      _kaizenDeployCreature(player, cid, i);
      G._awaitingModal = false;
      continueStack();
    };
    container.appendChild(el);
  });
}

function _kaizenDeployCreature(player, cid, handIdx) {
  const p = G.players[player];
  const card = CARD_DB[cid];
  if (p.field.length >= 5) { log('介善OC: フィールドが満杯'); return; }
  G.kaizen_used_names.add(card.name);
  const inst2 = newInstance(cid);
  inst2.sick = false;
  G.cantAttackPermanent.add(inst2.instanceId);
  p.hand.splice(handIdx, 1);
  _enteringInstIds.add(inst2.instanceId);
  p.field.push(inst2);
  fireETB(player, inst2.instanceId);
  log(`介善OC: ${card.name} を場に出した（このゲーム中攻撃不可）`, 'important');
  render(); updateHints();
}

// ============================================================
// 赤撃 (akageki): 2ダメージをクリーチャー or プレイヤーに
// ============================================================
function akagekiChoose(player, mode) {
  const opp = 1 - player;
  closeModal(); G._awaitingModal = false;
  if (mode === 'player') {
    G.players[opp].life -= 2; showLifeChange(opp, -2);
    log('赤撃: 相手プレイヤーに2ダメージ', 'damage');
    checkDeath(); render(); updateHints(); continueStack();
  } else {
    if (G.players[opp].field.length === 0) { continueStack(); return; }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      const targetName = getCreatureName(opp, tgt.instId);
      applyDamageToCreature(opp, tgt.instId, 2, player, {noRedirect:true});
      log(`赤撃: ${targetName}に2ダメージ`, 'damage');
      checkDeath(); render(); updateHints(); continueStack();
    }};
    log('赤撃: 2ダメージの対象クリーチャーを選択'); render(); updateHints();
  }
}

// ============================================================
// 家撃！ (iegeki): 5ダメージ(クリーチャー or プレイヤーへ移し替え可) + OC展開
// ============================================================
function playIegeki(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナが足りません'); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ (${costToString(card.cost)})`, 'important');
  const ocAtCast = isOCActive(player);
  const opp = 1 - player;
  // このターン、相手クリーチャーへのダメージを相手プレイヤーへ移し替え可能にする（毎回確認）
  if (!G.iegekiRedirectTurn) G.iegekiRedirectTurn = [-1, -1];
  G.iegekiRedirectTurn[player] = G.turn;
  log(`${card.name}: このターン、相手クリーチャーへのダメージを相手プレイヤーに移し替えできます`, 'important');

  // OC: 赤クリーチャー展開（先に積む = 後で解決）
  if (ocAtCast) {
    G.stack.push({ name:`${card.name} OC: 赤クリーチャー展開`, icon:card.icon||'💥', owner:player, fastResolve:true, resolve:() => {
      p.graveyard.push(cardId);
      G._iegekiOCCont = () => continueStack();
      iegekiOCDeploy(player);
    }});
  }
  // ■2: 相手クリーチャー1体に5ダメージ（■1の移し替えにより相手プレイヤーも選べる）
  G.stack.push({ name:`${card.name}: 5ダメージ`, icon:card.icon||'💥', owner:player, resolve:() => {
    if (!ocAtCast) p.graveyard.push(cardId);
    if (player === 1 && NET_MODE === 'local') {
      const oppF = G.players[opp].field;
      const killable = oppF.find(c => getEffectiveToughness(opp,c) - c.damage <= 5);
      if (killable) { applyDamageToCreature(opp, killable.instanceId, 5, player); log(`AI ${card.name}: クリーチャーに5ダメージ`,'damage'); }
      else { G.players[opp].life -= 5; showLifeChange(opp,-5); log(`AI ${card.name}: プレイヤーに5ダメージ`,'damage'); }
      checkDeath(); render(); updateHints(); continueStack(); return;
    }
    if (G.players[opp].field.length === 0) {
      G.players[opp].life -= 5; showLifeChange(opp,-5); log(`${card.name}: プレイヤーに5ダメージ`,'damage'); checkDeath(); render(); updateHints(); continueStack();
      return;
    }
    G._awaitingModal = true;
    showModal(card.name, `<p style="margin-bottom:10px;">5ダメージの対象を選択（移し替え可）:</p>
      <button onclick="iegekiChoose(${player},'creature')" style="width:100%;margin-bottom:8px;padding:8px;background:#3a1a1a;border:1px solid #cc4422;color:#fff;border-radius:6px;cursor:pointer;">💥 相手クリーチャー</button>
      <button onclick="iegekiChoose(${player},'player')" style="width:100%;padding:8px;background:#3a1a1a;border:1px solid #cc4422;color:#fff;border-radius:6px;cursor:pointer;">🎯 相手プレイヤーへ移し替え</button>`);
  }});

  renderStack(); render(); updateHints();
  openPriorityWindow(1 - player, G.priorityContinuation, `${card.name}に対応`);
}
function iegekiChoose(player, mode) {
  const opp = 1 - player;
  closeModal(); G._awaitingModal = false;
  if (mode === 'player') {
    G.players[opp].life -= 5; showLifeChange(opp, -5);
    log('家撃！: 相手プレイヤーに5ダメージ', 'damage');
    checkDeath(); render(); updateHints(); continueStack();
  } else {
    if (G.players[opp].field.length === 0) { continueStack(); return; }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      const targetName = getCreatureName(opp, tgt.instId);
      applyDamageToCreature(opp, tgt.instId, 5, player, {noRedirect:true});
      log(`家撃！: ${targetName}に5ダメージ`, 'damage');
      checkDeath(); render(); updateHints(); continueStack();
    }};
    log('家撃！: 5ダメージの対象クリーチャーを選択'); render(); updateHints();
  }
}
function iegekiOCDeploy(player) {
  const p = G.players[player];
  if (!G._iegekiUsed || G._iegekiUsedTurn !== G.turn) { G._iegekiUsed = new Set(); G._iegekiUsedTurn = G.turn; }
  const eligible = p.hand.map((cid,i)=>({cid,i,card:CARD_DB[cid]}))
    .filter(({card}) => card.type === 'creature' && card.color === 'R' && totalCost(card.cost) <= 8 && !G._iegekiUsed.has(card.name));
  if (eligible.length === 0) { log('家撃！OC: 出せる赤クリーチャーがありません'); if (G._iegekiOCCont) { const cb = G._iegekiOCCont; G._iegekiOCCont = null; cb(); } return; }
  if (p.field.length >= 5) { log('家撃！OC: フィールドが満杯のため出せません'); if (G._iegekiOCCont) { const cb = G._iegekiOCCont; G._iegekiOCCont = null; cb(); } return; }

  if (player === 1 && NET_MODE !== 'hotseat') {
    const best = eligible.reduce((a,b)=>(b.card.power||0)>(a.card.power||0)?b:a);
    _iegekiDeployCreature(player, best.cid, best.i);
    if (G._iegekiOCCont) { const cb = G._iegekiOCCont; G._iegekiOCCont = null; cb(); }
    return;
  }
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">場に出す赤クリーチャーを選択（このゲーム中、可能なら攻撃する）:</p>
    <div style="display:flex; flex-wrap:wrap; gap:8px;" id="ieg-cards"></div>
    <button onclick="closeModal(); G._awaitingModal=false; continueStack();" style="margin-top:10px;width:100%;">出さない（スキップ）</button>`;
  showModal('家撃！ OC効果', html);
  const container = document.getElementById('ieg-cards');
  eligible.forEach(({cid,i,card}) => {
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.innerHTML = buildCardHTML(card);
    el.dataset.cardId = cid;
    el.onclick = () => {
      closeModal();
      _iegekiDeployCreature(player, cid, i);
      G._awaitingModal = false;
      continueStack();
    };
    container.appendChild(el);
  });
}
function _iegekiDeployCreature(player, cid, handIdx) {
  const p = G.players[player];
  const card = CARD_DB[cid];
  if (p.field.length >= 5) { log('家撃！OC: フィールドが満杯'); return; }
  G._iegekiUsed.add(card.name);
  const inst2 = newInstance(cid);
  inst2.sick = true;
  inst2.entryTurn = G.turn;
  inst2.mustAttack = true;
  inst2.alwaysMustAttack = true; // このゲーム中、可能なら攻撃する
  G.mustAttackCreatures.add(inst2.instanceId);
  p.hand.splice(handIdx, 1);
  _enteringInstIds.add(inst2.instanceId);
  p.field.push(inst2);
  fireETB(player, inst2.instanceId);
  log(`家撃！OC: ${card.name} を場に出した（可能なら攻撃する）`, 'important');
  render(); updateHints();
}

// ============================================================
// ETB TRIGGERS
// ============================================================
function fireETB(player, instanceId) {
  const inst = G.players[player].field.find(c=>c.instanceId===instanceId);
  if (!inst) return;
  const card = CARD_DB[inst.cardId];
  if (!card.etb) return;
  G.stack.push({
    name: `${card.name} 誘発`,
    icon: card.icon || '✨',
    owner: player,
    resolve: () => resolveETBEffect(player, instanceId)
  });
  renderStack();
}

function resolveETBEffect(player, instanceId) {
  const p = G.players[player];
  const inst = p.field.find(c=>c.instanceId===instanceId);
  if (!inst) return;
  const card = CARD_DB[inst.cardId];
  const opp = 1-player;

  // 恒常「攻撃できない」: 場に出た時に一度だけ登録
  if (card.selfCantAttack) {
    G.cantAttackPermanent.add(instanceId);
  }

  if (card.etb === 'lookKeepWhite') {
    G._lookCont = () => continueStack();
    doLookKeepColored(player, card.lookCount || 3, 'W', card.lookKeep || 1);
  } else if (card.etb === 'mustAttackTarget') {
    const targets = G.players[opp].field;
    if (targets.length === 0) { log(`${card.name} ETB: 対象なしのためスキップ`); continueStack(); return; }
    G.targetMode = { type:'opponentCreature', sourcePlayer: player,
      // 無意義防止D(AI用): 攻撃できない相手に攻撃強制しても無意味 → 攻撃可能な相手を優先
      aiPick: (pool) => _pickAttackForceTarget(pool, opp, card.name),
      callback:(tgt) => {
      const tc = G.players[opp].field.find(x=>x.instanceId===tgt.instId);
      const targetName = getCreatureName(opp, tgt.instId);
      if (tc) { tc.mustAttack = true; G.mustAttackCreatures.add(tgt.instId); }
      log(`${card.name} ETB: ${targetName}に攻撃強制`, 'important');
      G.targetMode = null; render(); updateHints();
      continueStack();
    }};
    log(`${card.name} ETB: 対象を選択（次ターン攻撃強制）`);
    render(); updateHints();
  } else if (card.etb === 'mustAttackTargetThenDraw') {
    const targets = G.players[opp].field;
    if (targets.length === 0) {
      log(`${card.name} ETB: 対象なしのためスキップ`);
      drawCard(player);
      log(`${card.name} ETB: その後、1枚引く`);
      render(); updateHints();
      continueStack();
      return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer: player,
      // 無意義防止D(AI用): 攻撃できない相手に攻撃強制しても無意味 → 攻撃可能な相手を優先
      aiPick: (pool) => _pickAttackForceTarget(pool, opp, card.name),
      callback:(tgt) => {
      const tc = G.players[opp].field.find(x=>x.instanceId===tgt.instId);
      const targetName = getCreatureName(opp, tgt.instId);
      if (tc) { tc.mustAttack = true; G.mustAttackCreatures.add(tgt.instId); }
      log(`${card.name} ETB: ${targetName}に攻撃強制`, 'important');
      drawCard(player);
      log(`${card.name} ETB: その後、1枚引く`);
      G.targetMode = null; render(); updateHints();
      continueStack();
    }};
    log(`${card.name} ETB: 対象を選択（次ターン攻撃強制）`);
    render(); updateHints();
  } else if (card.etb === 'damage2opponent_always_cx6damage3') {
    const hasCX6 = getCXValue(player) >= 6;
    const oppField = G.players[opp].field;
    if (oppField.length > 0) bastianChooseETB(inst.instanceId, hasCX6, player);
  } else if (card.etb === 'damage2creature') {
    const targets = G.players[opp].field;
    if (targets.length === 0) { log(`${card.name} 出た時: 対象なしのためスキップ`); continueStack(); return; }
    G.targetMode = { type:'opponentCreature', sourcePlayer: player, callback:(tgt) => {
      const targetName = getCreatureName(opp, tgt.instId);
      applyDamageToCreature(opp, tgt.instId, 2, player);
      log(`${card.name} 出た時: ${targetName}に2ダメージ`, 'damage');
      G.targetMode = null; checkDeath(); render(); updateHints();
      continueStack();
    }};
    log(`${card.name} 出た時: 対象を選択（2ダメージ）`);
    render(); updateHints();
  } else if (card.etb === 'look3keep1red') {
    doLookKeepColored(player, 3, 'R');
  } else if (card.etb === 'look2keep1red') {
    doLookKeepColored(player, 2, 'R');
  } else if (card.etb === 'draw1') {
    drawCard(player);
    log(`${card.name} 出た時: 1枚引く`);
    render(); updateHints();
    continueStack();
  } else if (card.etb === 'look3keep1blue') {
    doLookKeepColored(player, 3, 'U');
  } else if (card.etb === 'omnieru_hand5') {
    // 出た時: 手札が5枚になるよう調整
    while (p.hand.length < 5 && p.deck.length > 0) {
      drawCard(player);
    }
    if (p.hand.length > 5) {
      const excess = p.hand.splice(5);
      excess.forEach(cid => p.deck.push(cid));
    }
    log(`${card.name} 出た時: 手札を5枚に調整`);
    render(); updateHints();
    continueStack();
  } else if (card.etb === 'look3keep1black') {
    doLookKeepColored(player, 3, 'B');
  } else if (card.etb === 'mill2_damage2') {
    // 墓ゾンビ/レン: 山札の上から2枚墓地に置き、相手クリーチャー1体に2ダメージ
    millCards(player, 2);
    render();
    if (G.players[opp].field.length === 0) { log(`${card.name} 出た時: 切削のみ（対象なし）`); continueStack(); return; }
    G.targetMode = { type:'opponentCreature', sourcePlayer: player, callback:(tgt) => {
      const targetName = getCreatureName(opp, tgt.instId);
      applyDamageToCreature(opp, tgt.instId, 2, player);
      log(`${card.name} 出た時: ${targetName}に2ダメージ`, 'damage');
      G.targetMode = null; checkDeath(); render(); updateHints();
      continueStack();
    }};
    log(`${card.name} 出た時: 2ダメージの対象を選択`);
    render(); updateHints();
  } else if (card.etb === 'opp_discard1') {
    // いたずらお化け: 相手は自身の手札を1枚選んで捨てる
    if (G.players[opp].hand.length === 0) { log(`${card.name} 出た時: 相手の手札が空`); continueStack(); return; }
    // 相手視点で選んで捨てる（プレイヤーが相手=opp=人間ならモーダル、AIなら自動）
    if (opp === 0 && NET_MODE !== 'guest') {
      G._discardCont = () => continueStack();
      _promptDiscard(0, 1);
    } else {
      discardCards(opp, 1, 'auto');
      log(`${card.name} 出た時: 相手は手札を1枚捨てた`, 'important');
      continueStack();
    }
  } else if (card.etb === 'shiki_distribute') {
    // 死を食らうもの シキ: 自分の墓地の枚数分、相手クリーチャー1体と相手プレイヤーに割り振る
    resolveShikiDistribute(player);
  } else if (card.etb === 'foklya_kaizou2draw2') {
    // フォクリア: 2枚還元してもよい → 2枚引く
    const avail = p.lands;
    if (avail.length >= 2) {
      if (player === 0) {
        showModal('フォクリア 出た時', `<p>土地を2枚還元して2枚引きますか？</p><button onclick="closeModal();G._awaitingModal=false;foklyaDoKaizou2Draw2(0);" style="margin:4px;padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">還元して2枚引く</button><button onclick="closeModal();G._awaitingModal=false;continueStack();render();updateHints();" style="margin:4px;padding:6px 14px;background:#555;border:none;color:#ccc;border-radius:4px;cursor:pointer;">しない</button>`);
        G._awaitingModal = true;
        return;
      } else {
        foklyaDoKaizou2Draw2(player);
      }
    }
    continueStack();
  } else if (card.etb === 'folkusu_c6_kaitaku') {
    // フォルクス C6: 開拓1
    if (getCXValue(player) >= 6 && player === 1) {
      doKaitaku(player, 1);
    } else if (getCXValue(player) >= 6 && player === 0) {
      doKaitaku(player, 1); // sets _awaitingModal; _pickKaitaku will call continueStack
      return;
    }
    continueStack();
  } else if (card.etb === 'kaitaku1') {
    // 開拓者・開拓祭りの巫女: 開拓1
    if (player === 0) {
      doKaitaku(player, 1); // sets _awaitingModal; _pickKaitaku will call continueStack
      return;
    }
    doKaitaku(player, 1);
    continueStack();
  } else if (card.etb === 'search1') {
    // 源の樹霊: サーチ1
    if (player === 0) {
      doSearch(player, 1); // sets _awaitingModal; _pickSearch will call continueStack
      return;
    }
    doSearch(player, 1);
    continueStack();
  }
}

// ── 死を食らうもの シキ: ダメージ割り振り ──
function resolveShikiDistribute(player) {
  const opp = 1 - player;
  // 山札の上から5枚墓地に置く
  const millCount = Math.min(5, G.players[player].deck.length);
  for (let i = 0; i < millCount; i++) {
    G.players[player].graveyard.push(G.players[player].deck.shift());
  }
  if (millCount > 0) log(`シキ 出た時: 山札から${millCount}枚墓地に置いた`, 'important');
  const total = G.players[player].graveyard.length;
  if (total <= 0) { log('シキ 出た時: 墓地が空のためダメージなし'); continueStack(); return; }
  const oppField = G.players[opp].field;

  if (player === 1 && NET_MODE === 'local') {
    // AI: 倒せるクリーチャーがいればクリーチャーへ最小限、残りはプレイヤーへ
    let toCreature = 0, target = null;
    if (oppField.length > 0) {
      const weakest = oppField.reduce((a,b) => (getEffectiveToughness(opp,b)-b.damage) < (getEffectiveToughness(opp,a)-a.damage) ? b : a);
      const need = getEffectiveToughness(opp, weakest) - weakest.damage;
      if (need <= total) { toCreature = need; target = weakest; }
    }
    const toPlayer = total - toCreature;
    if (target && toCreature > 0) { applyDamageToCreature(opp, target.instanceId, toCreature, player); log(`AI シキ: クリーチャーに${toCreature}ダメージ`, 'damage'); }
    if (toPlayer > 0) { G.players[opp].life -= toPlayer; showLifeChange(opp, -toPlayer); log(`AI シキ: プレイヤーに${toPlayer}ダメージ`, 'damage'); }
    checkDeath(); render(); updateHints(); continueStack();
    return;
  }

  if (NET_MODE === 'guest') { continueStack(); return; }

  // プレイヤー: 割り振り入力
  if (oppField.length === 0) {
    G.players[opp].life -= total; showLifeChange(opp, -total);
    log(`シキ 出た時: 相手プレイヤーに${total}ダメージ（クリーチャー不在）`, 'damage');
    checkDeath(); render(); updateHints(); continueStack();
    return;
  }
  G._awaitingModal = true;
  G._shikiTotal = total;
  G._shikiDmg = {}; // 各クリーチャーへのダメージマッピング
  oppField.forEach(c => G._shikiDmg[c.instanceId] = 0);

  let creaturesHtml = '';
  oppField.forEach(c => {
    const card = CARD_DB[c.cardId];
    const hp = getEffectiveToughness(opp, c) - c.damage;
    creaturesHtml += `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px;background:#1a1a2a;border-radius:4px;">
        <div style="flex-shrink:0;width:60px;height:84px;border:1px solid #444;border-radius:3px;overflow:hidden;">
          <div class="card color-${card.color||'C'}" style="width:100%;height:100%;padding:4px;font-size:8px;display:flex;flex-direction:column;">${card.icon||'?'}</div>
        </div>
        <div style="flex:1;">
          <div style="font-weight:700;color:#aaa;margin-bottom:4px;">${card.name}</div>
          <div style="font-size:11px;color:#888;margin-bottom:6px;">HP: ${hp}</div>
          <input type="number" id="shiki-dmg-${c.instanceId}" min="0" max="${total}" value="0" onchange="shikiUpdateDamageDisplay()" style="width:60px;padding:4px;background:#0a0a1a;border:1px solid #444;color:#aaa;border-radius:3px;"/>
        </div>
      </div>`;
  });

  const html = `
    <p style="margin-bottom:12px;color:#aaa;">合計 <b style="color:#fff;">${total}</b> ダメージを割り振ります。</p>
    <div style="margin-bottom:12px;max-height:300px;overflow-y:auto;">
      ${creaturesHtml}
    </div>
    <p style="margin-bottom:10px;padding:8px;background:#1a2a1a;border-radius:4px;border-left:3px solid #44aa44;">
      相手プレイヤーへ: <b id="shiki-player-amt" style="color:#44ff88;">${total}</b> ダメージ
    </p>
    <button onclick="shikiConfirm(${player})" style="width:100%;padding:10px;background:#3a1a3a;border:1px solid #884488;color:#fff;border-radius:6px;cursor:pointer;font-weight:700;">確定</button>`;
  showModal('シキ: ダメージ割り振り', html);
}
function shikiUpdateDamageDisplay() {
  const opp = 1 - (parseInt(document.querySelector('[onclick*="shikiConfirm"]').onclick.toString().match(/\d+/)[0]) || 0);
  let totalCreatureDmg = 0;
  Object.keys(G._shikiDmg).forEach(instId => {
    const input = document.getElementById(`shiki-dmg-${instId}`);
    if (input) {
      G._shikiDmg[instId] = Math.max(0, Math.min(G._shikiTotal, parseInt(input.value) || 0));
      input.value = G._shikiDmg[instId];
      totalCreatureDmg += G._shikiDmg[instId];
    }
  });
  const playerDmg = G._shikiTotal - totalCreatureDmg;
  const el = document.getElementById('shiki-player-amt');
  if (el) el.textContent = playerDmg;
}
function shikiConfirm(player) {
  const opp = 1 - player;
  // クリーチャーへのダメージを適用
  let totalCreatureDmg = 0;
  Object.keys(G._shikiDmg).forEach(instId => {
    const dmg = G._shikiDmg[instId];
    if (dmg > 0) {
      applyDamageToCreature(opp, parseInt(instId), dmg, player);
      const inst = G.players[opp].field.find(c => c.instanceId === parseInt(instId));
      if (inst) {
        const card = CARD_DB[inst.cardId];
        log(`シキ: ${card.name}に${dmg}ダメージ`, 'damage');
      }
      totalCreatureDmg += dmg;
    }
  });
  // プレイヤーへのダメージを適用
  const playerDmg = G._shikiTotal - totalCreatureDmg;
  if (playerDmg > 0) {
    G.players[opp].life -= playerDmg;
    showLifeChange(opp, -playerDmg);
    log(`シキ: 相手プレイヤーに${playerDmg}ダメージ`, 'damage');
  }
  closeModal(); G._awaitingModal = false;
  G._shikiDmg = null; G._shikiTarget = null;
  checkDeath(); render(); updateHints(); continueStack();
}

function bastianChooseETB(instanceId, hasCX6Override, playerArg) {
  closeModal();
  const src = playerArg !== undefined ? playerArg : 0;
  const hasCX6 = hasCX6Override !== undefined ? hasCX6Override : getCXValue(src) >= 6;
  const opp = 1 - src;
  G.targetMode = { type:'opponentCreature', sourcePlayer: src, callback:(tgt) => {
    const targetName = getCreatureName(opp, tgt.instId);
    applyDamageToCreature(opp, tgt.instId, 2, src);
    log(`バスティオン 出た時: ${targetName}に2ダメージ`, 'damage');
    G.targetMode = null;
    checkDeath();
    render(); updateHints();
    if (hasCX6 && G.players[opp].field.length > 0) {
      G.targetMode = { type:'opponentCreature', sourcePlayer: src, callback:(tgt2) => {
        const targetName2 = getCreatureName(opp, tgt2.instId);
        applyDamageToCreature(opp, tgt2.instId, 2, src);
        log(`バスティオン 出た時 C6: ${targetName2}に追加2ダメージ`, 'damage');
        G.targetMode = null;
        checkDeath();
        render(); updateHints();
        continueStack();
      }};
      log('バスティオン 出た時 C6: 追加2ダメージの対象を選択');
      render(); updateHints();
      if (src === 1) { aiAutoPickTarget(); }
    } else {
      continueStack();
    }
  }};
  log('バスティオン 出た時: 2ダメージの対象を選択');
  render(); updateHints();
}

function startKakutou(player, instanceId) {
  const inst = G.players[player].field.find(c => c.instanceId === instanceId);
  if (!inst) return;
  const card = CARD_DB[inst.cardId];
  const opp = 1 - player;
  const reachable = G.players[opp].field.filter(c => !CARD_DB[c.cardId].flying || card.flying);
  if (reachable.length === 0) {
    log(`${card.name} 格闘: 対象クリーチャーがいません`);
    return;
  }
  inst.tapped = true;
  G.combatArrows = [{fromId: instanceId, toId: null, color: '#ff8800'}];
  G.kakutouTargetMode = true;
  G.pendingKakutouInstId = instanceId;
  G.kakutouTargets = {};
  log(`${card.name} 格闘: 対象のクリーチャーを選択してください`);
  render(); updateHints();
}
// 後方互換
function bastianChooseKakutou(instanceId) { startKakutou(0, instanceId); }

function doLook3Keep1White(player) {
  const p = G.players[player];
  if (p.deck.length === 0) {
    if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
    return;
  }
  const top3 = p.deck.splice(0, Math.min(3, p.deck.length));
  const whites = top3.filter(cid => CARD_DB[cid] && CARD_DB[cid].color === 'W');

  if (player === 1 && NET_MODE === 'local') {
    // AI: keep a white card if any
    if (whites.length > 0) {
      addCardToHand(player, whites[0]);
      const rest = top3.filter(cid=>cid!==whites[0]);
      rest.forEach(cid=>p.deck.push(cid));
      log(`AI 3ルック1(白): 白カードをキープ`);
    } else {
      top3.forEach(cid=>p.deck.push(cid));
      log(`AI 3ルック1(白): 白カードなし`);
    }
    render(); updateHints();
    if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
    return;
  }

  window._look3Cards = top3;
  window._look3Player = player;
  renderLook3Modal();
}

// ルックモーダルを（再）描画: 盤面確認から戻った時にも使う
function renderLook3Modal() {
  const top3 = window._look3Cards || [];
  const player = window._look3Player || 0;
  const p = G.players[player];
  let html = `<p style="margin-bottom:10px;">白カードを1枚選んで手札に加えてください（白以外は選択不可）:</p>
    <p style="margin-bottom:8px;font-size:11px;color:#888;">右クリック/長押しで効果テキストを右上に表示できます</p>
    <div style="display:flex; flex-wrap:wrap; gap:8px;" id="look3-cards"></div>
    <button onclick="modalPeek()" style="margin-top:10px; width:100%; background:#1a1a3a; border:1px solid #4444aa; color:#aaaaff; padding:8px; border-radius:6px; cursor:pointer;">👁 盤面を確認（手札・墓地・場）</button>
    <button onclick="look3NoKeep()" style="margin-top:8px; width:100%;">白カードなし/パス（全て底へ）</button>`;
  showModal('3ルック1(白)', html);
  window._modalReturnRender = renderLook3Modal;

  const container = document.getElementById('look3-cards');
  top3.forEach((cid, i) => {
    const card = CARD_DB[cid];
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.innerHTML = buildCardHTML(card);
    el.dataset.cardId = cid; // 右クリック/長押しで詳細表示可能に
    const isWhite = card.color === 'W';
    if (!isWhite) { el.style.opacity = '0.4'; el.style.cursor = 'default'; }
    else {
      el.onclick = () => {
        const seenCards = top3.map(c => CARD_DB[c].name).join('・');
        addCardToHand(player, cid);
        const rest = top3.filter(c2=>c2!==cid);
        rest.forEach(c2=>p.deck.push(c2));
        log(`3ルック1: 見たカード『${seenCards}』`);
        log(`3ルック1: ${card.name} をキープ`);
        window._look3Cards = null; window._modalReturnRender = null;
        closeModal(); render(); updateHints();
        if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
      };
    }
    container.appendChild(el);
  });
}
function look3NoKeep() {
  const top3 = window._look3Cards || [];
  const player = window._look3Player || 0;
  const seenCards = top3.map(cid=>CARD_DB[cid].name).join('・');
  top3.forEach(cid=>G.players[player].deck.push(cid));
  log(`3ルック1: 見たカード『${seenCards}』`);
  log('3ルック1: 全て底へ');
  window._look3Cards = null; window._modalReturnRender = null;
  closeModal(); render(); updateHints();
  if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
}

// ── 汎用 NルックK（指定色キープ、K=キープ枚数・省略時1）──────────
const COLOR_NAME_JP = { W:'白', U:'青', B:'黒', R:'赤', G:'緑', C:'無色' };
function doLookKeepColored(player, n, color, keep) {
  keep = keep || 1;
  const p = G.players[player];
  if (p.deck.length === 0) { if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); } return; }
  const top = p.deck.splice(0, Math.min(n, p.deck.length));
  const matches = top.filter(cid => CARD_DB[cid] && CARD_DB[cid].color === color);
  const cname = COLOR_NAME_JP[color] || color;

  if (player === 1 && NET_MODE === 'local') {
    // AI: マッチする色があれば最大keep枚キープ
    if (matches.length > 0) {
      const picked = matches.slice(0, keep);
      picked.forEach(cid => addCardToHand(player, cid));
      const remaining = [...top];
      picked.forEach(cid => { const i = remaining.indexOf(cid); if (i !== -1) remaining.splice(i, 1); });
      remaining.forEach(cid => p.deck.push(cid));
      log(`AI ${n}ルック${keep}(${cname}): ${cname}カードを${picked.length}枚キープ`);
    } else {
      top.forEach(cid => p.deck.push(cid));
      log(`AI ${n}ルック${keep}(${cname}): ${cname}カードなし`);
    }
    if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
    return;
  }

  window._lookCColors = color;
  window._lookCCount = n;
  window._lookCCards = top;
  window._lookCPlayer = player;
  window._lookCKeepTotal = keep;       // このルックで加えられる最大枚数
  window._lookCKeepLeft = keep;        // 残りキープ可能枚数
  window._lookCSeen = top.map(c => CARD_DB[c].name).join('・'); // 最初に見た全カード名
  renderLookColoredModal();
}
function renderLookColoredModal() {
  const top = window._lookCCards || [];
  const player = window._lookCPlayer || 0;
  const color = window._lookCColors || 'R';
  const n = window._lookCCount || top.length;
  const keepTotal = window._lookCKeepTotal || 1;
  const keepLeft = window._lookCKeepLeft != null ? window._lookCKeepLeft : 1;
  const cname = COLOR_NAME_JP[color] || color;
  const p = G.players[player];
  let html = `<p style="margin-bottom:10px;">${cname}カードを${keepTotal > 1 ? `最大${keepTotal}枚（あと${keepLeft}枚）` : '1枚'}選んで手札に加えてください（${cname}以外は選択不可）:</p>
    <p style="margin-bottom:8px;font-size:11px;color:#888;">右クリック/長押しで効果テキストを右上に表示できます</p>
    <div style="display:flex; flex-wrap:wrap; gap:8px;" id="lookc-cards"></div>
    <button onclick="modalPeek()" style="margin-top:10px; width:100%; background:#1a1a3a; border:1px solid #4444aa; color:#aaaaff; padding:8px; border-radius:6px; cursor:pointer;">👁 盤面を確認（手札・墓地・場）</button>
    <button onclick="lookColoredNoKeep()" style="margin-top:8px; width:100%;">${keepTotal > 1 && keepLeft < keepTotal ? '選択を終了（残りを底へ）' : cname + 'カードなし/パス（全て底へ）'}</button>`;
  showModal(`${n}ルック${keepTotal}(${cname})`, html);
  window._modalReturnRender = renderLookColoredModal;

  const container = document.getElementById('lookc-cards');
  top.forEach(cid => {
    const card = CARD_DB[cid];
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.innerHTML = buildCardHTML(card);
    el.dataset.cardId = cid;
    const ok = card.color === color;
    if (!ok) { el.style.opacity = '0.4'; el.style.cursor = 'default'; }
    else {
      el.onclick = () => {
        addCardToHand(player, cid);
        const i = top.indexOf(cid);
        if (i !== -1) top.splice(i, 1);
        log(`${n}ルック${keepTotal}: ${card.name} をキープ`);
        window._lookCKeepLeft = keepLeft - 1;
        // まだキープできて、選べる色カードが残っていれば選択を続行
        const stillSelectable = top.some(c2 => CARD_DB[c2].color === color);
        if (window._lookCKeepLeft > 0 && stillSelectable) {
          renderLookColoredModal();
          return;
        }
        // 終了: 残りを底へ
        finishLookColored();
      };
    }
    container.appendChild(el);
  });
}
function finishLookColored() {
  const top = window._lookCCards || [];
  const player = window._lookCPlayer || 0;
  const n = window._lookCCount || 0;
  const keepTotal = window._lookCKeepTotal || 1;
  const seenCards = window._lookCSeen || top.map(cid => CARD_DB[cid].name).join('・');
  top.forEach(cid => G.players[player].deck.push(cid));
  log(`${n}ルック${keepTotal}: 見たカード『${seenCards}』`);
  if (top.length > 0) log(`${n}ルック${keepTotal}: 残り${top.length}枚を底へ`);
  window._lookCCards = null; window._modalReturnRender = null; window._lookCSeen = null;
  closeModal(); render(); updateHints();
  if (G._lookCont) { const cb = G._lookCont; G._lookCont = null; cb(); }
}
function lookColoredNoKeep() {
  finishLookColored();
}

// ── モーダル一時非表示（盤面確認） ───────────────────────────
function modalPeek() {
  closeModal();
  hideCardDetail();
  if (document.getElementById('modal-peek-return')) return;
  const btn = document.createElement('button');
  btn.id = 'modal-peek-return';
  btn.textContent = '↩ カード選択に戻る';
  btn.onclick = modalPeekReturn;
  document.body.appendChild(btn);
  log('盤面確認中: 手札・墓地・場を確認できます。「カード選択に戻る」で選択に戻ります');
}
function modalPeekReturn() {
  const btn = document.getElementById('modal-peek-return');
  if (btn) btn.remove();
  if (window._modalReturnRender) {
    window._modalReturnRender(); // ルックモーダルを再構築（クリックハンドラ含む）
  } else {
    document.getElementById('modal').classList.add('active');
  }
}

function addPermanentBuff(player, instanceId, power, toughness) {
  G.permanentBuffs.push({instanceId, power, toughness});
}

function declareCrystalOnly(player, handIndex) {
  const p = G.players[player];
  if (handIndex < 0 || handIndex >= p.hand.length) return;
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!card || !card.crystalEtb) return;
  const crystalCost = card.crystalEtb;
  if ((p.mana.W || 0) < crystalCost) { log('白マナが足りません'); return; }
  p.mana.W -= crystalCost;
  p.hand.splice(handIndex, 1);
  p.graveyard.push(cardId);
  log(`${card.name} 結晶宣言：白${crystalCost}マナを支払い、アレスティアの旗を展開`, 'important');
  spawnCrystalArtifact(player, 2, 'spawnArestia');
  render();
}

function spawnCrystalArtifact(player, countdown, onLeaveType) {
  if (!G.players[player].artifacts) G.players[player].artifacts = [];
  const art = {
    instanceId: G.nextInstanceId++,
    name: 'アレスティアの旗',
    icon: '🚩',
    countdown: countdown,
    onLeaveType: onLeaveType,
    owner: player
  };
  G.players[player].artifacts.push(art);
  log(`${art.name}: 場に出た (カウントダウン${countdown})`, 'important');
  render();
  return art;
}

function triggerArtifactLeave(player, art) {
  log(`${art.name}: 場を離れた`, 'important');
  if (art.onLeaveType === 'spawnArestia') {
    // 条件チェック: CX6以上 & 白を含む土地3枚以上
    const cx = getCXValue(player);
    const whiteLands = G.players[player].lands.filter(l => CARD_DB[l.cardId].color === 'W').length;
    const canSpawn = cx >= 6 && whiteLands >= 3 && G.players[player].field.length < 5;
    if (!canSpawn) {
      if (G.players[player].field.length >= 5) {
        log('アレスティアの旗: フィールドが満杯のため召喚できません');
      } else {
        // 条件不足: カウントダウン1で場に残る
        art.countdown = 1;
        G.players[player].artifacts.push(art);
        log(`アレスティアの旗: 条件未達(CX${cx}/白土地${whiteLands}) → カウントダウン1で残留`, 'important');
        render();
      }
      return;
    }
    const inst = newInstance('arestia');
    inst.sick = true;
    inst.entryTurn = G.turn;
    G.players[player].field.push(inst);
    log('アレスティアの旗: 戦乙女 アレスティアを場に出した', 'important');
    fireETB(player, inst.instanceId);
    render();
  }
}

function spawnCopyWithReducedToughness(player, instId) {
  const inst = G.players[player].field.find(c => c.instanceId === instId);
  if (!inst) return;
  const card = CARD_DB[inst.cardId];
  const baseT = card.toughness; // 元のタフネス（バフ前）を参照
  if (baseT <= 1) return;      // 基本タフネスが1以下ならコピー不可
  const newInstId = G.nextInstanceId++;
  const newInst = {
    cardId: inst.cardId,
    instanceId: newInstId,
    tapped: false,
    damage: 0,
    summoningSickness: true,
    sick: true
  };
  G.players[player].field.push(newInst);
  // 基本タフネス-1 になるよう永続バフで調整
  addPermanentBuff(player, newInstId, 0, -1);
  log(`${card.name}: タフネス${baseT - 1}のコピーを展開`, 'important');
  fireETB(player, newInstId);
  render();
}

function addTempBuff(player, instanceId, power, toughness) {
  const inst = G.players[player].field.find(c => c.instanceId === instanceId);
  if (!inst) return;
  inst.tempPower  = (inst.tempPower  || 0) + power;
  inst.tempToughness = (inst.tempToughness || 0) + toughness;
  G.tempBuffs.push({instanceId, power, toughness});
}

function getPermanentBuff(instanceId) {
  let pw=0, th=0;
  G.permanentBuffs.forEach(b=>{ if(b.instanceId===instanceId){pw+=b.power;th+=b.toughness;} });
  return {power:pw, toughness:th};
}

function applyDamageToCreature(player, instId, amount, sourcePlayer, opts) {
  const pf = G.players[player];
  const c = pf.field.find(x=>x.instanceId===instId);
  if (!c) return;
  // 家撃！: このターン「相手クリーチャーへ与えるダメージを相手プレイヤーに移し替えてもよい」
  // sourcePlayer が移し替え有効・対象が相手クリーチャー・ダメージ>0 のとき、毎回任意で移し替える
  if (!(opts && opts.noRedirect) && sourcePlayer !== undefined && sourcePlayer !== null
      && player === 1 - sourcePlayer && amount > 0
      && G.iegekiRedirectTurn && G.iegekiRedirectTurn[sourcePlayer] === G.turn) {
    let redirect = false;
    if (sourcePlayer === 0 && NET_MODE === 'local') {
      redirect = window.confirm(
        `家撃！移し替え：この${amount}ダメージ（対象: ${CARD_DB[c.cardId].name}）を相手プレイヤーに移し替えますか？\n[OK] プレイヤーへ ／ [キャンセル] このクリーチャーへ`);
    } else if (sourcePlayer === 1) {
      // AI: そのクリーチャーを倒せない場合はプレイヤーへ移し替えた方が良いと判断
      if (getEffectiveToughness(player, c) - c.damage > amount) redirect = true;
    }
    if (redirect) {
      G.players[player].life -= amount;
      showLifeChange(player, -amount);
      log(`家撃！移し替え: 相手プレイヤーに${amount}ダメージ`, 'damage');
      checkDeath();
      return;
    }
  }
  c.damage += amount;
  showCreatureDamage(instId, amount);
  if (sourcePlayer !== undefined && sourcePlayer !== null) {
    const srcField = G.players[sourcePlayer] ? G.players[sourcePlayer].field : [];
    const atkInst = srcField.find(x => x.attacking);
    const atkEl = atkInst ? getCardEl(atkInst.instanceId) : (srcField.length ? getCardEl(srcField[0].instanceId) : null);
    const tgtEl = getCardEl(instId);
    if (atkEl || tgtEl) animCombatCollision(atkEl, tgtEl);
  }
  checkCreatureDeath(player, instId, sourcePlayer);
}

// クリーチャーの上にダメージ数字をポップ表示 + ヒットフラッシュ
function showCreatureDamage(instId, amount) {
  try {
    const cardEl = document.querySelector(`[data-inst="${instId}"]`);
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    // 浮かび上がるダメージ数字
    const el = document.createElement('div');
    el.className = 'float-damage';
    el.style.color = '#ff4422';
    el.textContent = `-${amount}`;
    el.style.left = (rect.left + rect.width/2 - 14) + 'px';
    el.style.top  = (rect.top + rect.height / 4) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
    // カードを赤くフラッシュ + 揺らす
    cardEl.classList.remove('hit-flash', 'damaged');
    void cardEl.offsetWidth;
    cardEl.classList.add('hit-flash', 'damaged');
    setTimeout(() => { if (cardEl.isConnected) { cardEl.classList.remove('hit-flash', 'damaged'); } }, 450);
  } catch(e) {}
}

// ライフ増減フラッシュ + 数字ポップ
function showLifeChange(playerIdx, delta) {
  try {
    const elId = playerIdx === NET_MY_IDX ? 'player-life' : 'ai-life';
    const el = document.getElementById(elId);
    if (!el) return;
    const isHit = delta < 0;
    el.classList.remove('life-hit', 'life-heal');
    void el.offsetWidth;
    el.classList.add(isHit ? 'life-hit' : 'life-heal');
    setTimeout(() => el.classList.remove('life-hit', 'life-heal'), 700);
    // 浮かび上がる数字
    const rect = el.getBoundingClientRect();
    const floatEl = document.createElement('div');
    floatEl.className = 'life-float';
    floatEl.style.color = isHit ? '#ff4422' : '#44ff88';
    floatEl.textContent = (isHit ? '' : '+') + delta;
    floatEl.style.left = (rect.left + rect.width/2 - 20) + 'px';
    floatEl.style.top  = (rect.top - 10) + 'px';
    document.body.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 1500);
  } catch(e) {}
}

// 破壊時のフェードアウト演出: render()前にゴーストを作って消す
function showDestroyAnimation(instId) {
  try {
    const cardEl = document.querySelector(`[data-inst="${instId}"]`);
    if (!cardEl) return;
    const rect = cardEl.getBoundingClientRect();
    const ghost = cardEl.cloneNode(true);
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:80;pointer-events:none;animation:die 0.5s forwards;`;
    document.body.appendChild(ghost);
    setTimeout(() => ghost.remove(), 600);
  } catch(e) {}
}

function applyDamage3(sourcePlayer, target) {
  if (target.type === 'player') {
    G.players[target.player].life -= 3;
    showFloatDamage(3, target.player === 0 ? 'player' : 'ai');
    checkDeath();
  } else if (target.type === 'creature') {
    applyDamageToCreature(target.player, target.instId, 3, sourcePlayer);
  }
}

function checkCreatureDeath(player, instId, sourcePlayer) {
  const p = G.players[player];
  const idx = p.field.findIndex(x => x.instanceId === instId);
  if (idx === -1) return false;
  const c = p.field[idx];
  const card = CARD_DB[c.cardId];
  const permBuff = getPermanentBuff(c.instanceId);
  const toughness = card.toughness + (c.tempToughness||0) + permBuff.toughness + getCXBonus(player, c).toughness;
  const dead = c.damage >= toughness || (c.damage > 0 && c._deathtouched);
  if (dead && c._protectedThisTurn) { log(`${card.name}: このターン離れない（フォクリア保護）`); return false; }
  if (dead && c.noDamageKill) {
    // 介善■2 置き換え効果: 離れる代わりに現在のP/Tを入れ替える（ダメージは引き継ぐ）
    c.noDamageKill = false;
    const effP = getEffectivePower(player, c);
    const effT = toughness; // すでに計算済み
    // P/T入れ替えバフ: effT-effP をパワーに、effP-effT をタフネスに加算
    addPermanentBuff(player, c.instanceId, effT - effP, effP - effT);
    log(`${card.name}: 介善■2 — P/Tを入れ替え ${effP}/${effT} → ${effT}/${effP}（ダメージ${c.damage}を引き継ぎ）`);
    // 入れ替え後の新タフネスで再チェック
    if (c.damage >= effP) { // 新タフネス = 旧パワー
      showDestroyAnimation(instId);
      p.field.splice(idx, 1);
      p.graveyard.push(c.cardId);
      if (G._battleDestroyedInstIds) G._battleDestroyedInstIds.add(instId);
      log(`${card.name} が破壊された（P/T入れ替え後）`, 'damage');
      return true;
    }
    return false;
  }
  if (dead) {
    showDestroyAnimation(instId);
    animDestroyParticle(instId);
    p.field.splice(idx, 1);
    p.graveyard.push(c.cardId);
    if (G._battleDestroyedInstIds) G._battleDestroyedInstIds.add(instId);
    log(`${card.name} が破壊された`, 'damage');
    return true;
  }
  return false;
}

function checkDeath() {
  for (let i = 0; i < 2; i++) {
    if (G.players[i].life <= 0) { endGame(1 - i); }
  }
}

// ── アニメーション関数群 ────────────────────────────────────────
let _prevCX = [0, 0];

function animDrawCard(player) {
  if (player !== (typeof NET_MY_IDX !== 'undefined' ? NET_MY_IDX : 0)) return;
  setTimeout(() => {
    const hand = document.getElementById('player-hand-row');
    if (!hand) return;
    const cards = hand.querySelectorAll('.card');
    const last = cards[cards.length - 1];
    if (last) { last.classList.add('draw-anim'); setTimeout(() => last.classList.remove('draw-anim'), 400); }
  }, 60);
}

function animLandTap(instId) {
  setTimeout(() => {
    const el = document.querySelector(`[data-inst="${instId}"]`);
    if (el) { el.style.animation='none'; el.offsetHeight; el.style.animation='landTapGlow 0.5s ease-out'; setTimeout(()=>{el.style.animation='';},500); }
  }, 10);
}

function animCXChange(player, newVal) {
  const old = _prevCX[player];
  if (newVal > old) {
    const ringId = player === (typeof NET_MY_IDX !== 'undefined' ? NET_MY_IDX : 0) ? 'player-cx-ring' : 'opp-cx-ring';
    const el = document.getElementById(ringId);
    if (el) {
      el.style.transition = 'stroke 0.2s';
      el.style.stroke = '#aaffaa';
      setTimeout(() => { el.style.stroke = ''; el.style.transition = ''; }, 400);
    }
    if (newVal >= 10 && old < 10) animOCReached(player);
  }
  _prevCX[player] = newVal;
}

function animOCReached(player) {
  const el = document.getElementById('oc-flash-overlay');
  if (!el) return;
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'ocFlash 1.2s forwards';
  const myIdx = typeof NET_MY_IDX !== 'undefined' ? NET_MY_IDX : 0;
  showPhaseFlash('⚡ OC 解放！', player === myIdx ? 'あなたのOCが発動' : '相手のOCが発動');
}

function animSpellResolve(x, y) {
  const el = document.getElementById('spell-resolve-ring');
  if (!el) return;
  el.style.left = (x - 45) + 'px'; el.style.top = (y - 45) + 'px';
  el.style.display = 'block'; el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'spellResolveFlash 0.5s forwards';
  setTimeout(() => { el.style.display = 'none'; }, 600);
}

function animCombatCollision(atkEl, blkEl) {
  const el = document.getElementById('collision-burst');
  if (!el) return;
  let cx, cy;
  if (atkEl && blkEl) {
    const ar = atkEl.getBoundingClientRect(), br = blkEl.getBoundingClientRect();
    cx = (ar.left + ar.right + br.left + br.right) / 4;
    cy = (ar.top + ar.bottom + br.top + br.bottom) / 4;
  } else if (atkEl) {
    const r = atkEl.getBoundingClientRect();
    cx = (r.left + r.right) / 2; cy = (r.top + r.bottom) / 2;
  } else if (blkEl) {
    const r = blkEl.getBoundingClientRect();
    cx = (r.left + r.right) / 2; cy = (r.top + r.bottom) / 2;
  } else return;
  el.style.left = (cx - 30) + 'px'; el.style.top = (cy - 30) + 'px';
  el.style.display = 'block'; el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'collisionBurst 0.45s forwards';
  setTimeout(() => { el.style.display = 'none'; }, 500);
}

function animDestroyParticle(instId) {
  const el = document.querySelector(`[data-inst="${instId}"]`);
  if (!el) return;
  const r = el.getBoundingClientRect();
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const colors = ['#ff4444','#ff8800','#ffcc00','#ff44aa','#ffffff'];
  for (let i = 0; i < 10; i++) {
    const p = document.createElement('div');
    const angle = (i / 10) * Math.PI * 2;
    const dist = 40 + Math.random() * 40;
    p.style.cssText = `position:fixed;width:8px;height:8px;border-radius:50%;z-index:990;
      background:${colors[i % colors.length]};left:${cx-4}px;top:${cy-4}px;pointer-events:none;
      --px:${Math.cos(angle)*dist}px;--py:${Math.sin(angle)*dist}px;
      animation:particleFly 0.6s ease-out forwards;animation-delay:${i*0.02}s;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

function animGameWin() {
  const el = document.getElementById('win-overlay');
  if (el) { el.style.animation='none'; el.offsetHeight; el.style.animation='winOverlay 2s forwards'; }
  const colors = ['#ffcc00','#ff4488','#44aaff','#44ff88','#ff8800','#ffffff'];
  for (let i = 0; i < 40; i++) {
    const c = document.createElement('div');
    const size = 6 + Math.random() * 8;
    c.style.cssText = `position:fixed;width:${size}px;height:${size}px;border-radius:${Math.random()>.5?'50%':'2px'};
      background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${Math.random()*100}vw;top:-10px;z-index:1000;pointer-events:none;
      animation:confettiFall ${1.5+Math.random()*2}s ease-in forwards;animation-delay:${Math.random()*1}s;`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

function animGameLose() {
  const el = document.getElementById('lose-overlay');
  if (!el) return;
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'loseOverlay 1.5s forwards';
  setTimeout(() => { el.style.opacity = '0'; el.style.animation = ''; }, 3500);
}

function animEloChange(delta, newR, oldTier, newTier) {
  const el = document.getElementById('elo-float-el');
  if (!el) return;
  const sign = delta >= 0 ? '+' : '';
  el.textContent = sign + delta;
  el.style.color = delta >= 0 ? '#44ff88' : '#ff4444';
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'eloFloat 2s forwards';
  if (newTier && oldTier && newTier.name !== oldTier.name && delta > 0) {
    setTimeout(() => animTierPromotion(newTier), 800);
  }
}

function animTierPromotion(tier) {
  const el = document.getElementById('tier-promo-el');
  if (!el) return;
  el.innerHTML = `${tier.icon}<br><span style="font-size:18px;color:${tier.color}">${tier.name} 昇格！</span>`;
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'tierPromo 2.5s forwards';
}

function animTrophyGet(rank) {
  const el = document.getElementById('trophy-pop-el');
  if (!el) return;
  el.textContent = rank.icon;
  el.style.animation = 'none'; el.offsetHeight;
  el.style.animation = 'trophyPop 1.5s forwards';
  setTimeout(() => { el.style.opacity = '0'; el.style.animation = ''; }, 2000);
}

function getCardEl(instId) {
  return document.querySelector(`[data-inst="${instId}"]`);
}

// ── トロフィー・実績 ──────────────────────────────────────────
function trophyLoad() {
  try { return JSON.parse(localStorage.getItem('dcg_trophy') || '{}'); } catch(e) { return {}; }
}
function trophySave(t) {
  try { localStorage.setItem('dcg_trophy', JSON.stringify(t)); } catch(e) {}
}

// ── ゲームバージョン管理（レート・トロフィーの自動保持） ──
// バージョン更新時にレート・トロフィー・勝敗記録を失わないようにマイグレーションする。
function initializeGameData() {
  const prevVersion = (() => {
    try { return JSON.parse(localStorage.getItem('dcg_game_meta') || '{}').version; } catch(e) { return 0; }
  })();

  if (prevVersion !== GAME_VERSION) {
    // バージョン変更を検出＝新しいバージョンへのアップグレード
    // レート・トロフィー・勝敗記録は保持（何もしない、既に localStorage に在る）
    // バージョンメタデータを更新
    try {
      localStorage.setItem('dcg_game_meta', JSON.stringify({ version: GAME_VERSION, updated: new Date().toISOString() }));
    } catch(e) {}
  }
}

// デッキ構築からユニークキーを生成（メイン＋土地をソート）
function deckKey(mainCards, landCards) {
  return [...mainCards].sort().join(',') + '|' + [...landCards].sort().join(',');
}
// ゲーム終了時のデッキ名を取得（dcg_decks_v2のactiveスロット名）
function currentDeckName() {
  try {
    const v2 = localStorage.getItem('dcg_decks_v2');
    if (v2) {
      const data = JSON.parse(v2);
      if (data && Array.isArray(data.slots) && typeof data.active === 'number') {
        return data.slots[data.active].name || 'デッキ' + (data.active + 1);
      }
    }
  } catch(e) {}
  return 'デッキ1';
}
function trophyRecord(newRating, mainCards, landCards) {
  const t = trophyLoad();
  t.peakRating = Math.max(t.peakRating || 0, newRating);
  if (!t.deckPeak) t.deckPeak = {};
  const key = deckKey(mainCards, landCards);
  const name = currentDeckName();
  const prev = t.deckPeak[key] || { name, rating: 0 };
  // 名前はユーザーが後で変更できるので上書きしない（既存エントリは保持）
  if (!t.deckPeak[key]) prev.name = name;
  prev.rating = Math.max(prev.rating, newRating);
  t.deckPeak[key] = prev;
  if (!t.cardPeak) t.cardPeak = {};
  const allUsed = [...new Set([...mainCards, ...landCards])];
  allUsed.forEach(id => {
    t.cardPeak[id] = Math.max(t.cardPeak[id] || 0, newRating);
  });
  trophySave(t);
  return key;
}
// カードトロフィーランク（Eloティアとは独立）
function cardTrophyRank(r) {
  if (r >= 1800) return { icon: '🥇', label: '金', color: '#ffcc44' };
  if (r >= 1700) return { icon: '🥈', label: '銀', color: '#cccccc' };
  if (r >= 1600) return { icon: '🥉', label: '銅', color: '#cd7f32' };
  return null;
}
// トロフィー画面でデッキ名を編集して保存
function trophyRenameDeck(key) {
  const t = trophyLoad();
  if (!t.deckPeak || !t.deckPeak[key]) return;
  const newName = prompt('デッキ名を入力してください:', t.deckPeak[key].name);
  if (newName === null) return;
  t.deckPeak[key].name = newName.trim() || t.deckPeak[key].name;
  trophySave(t);
  showTrophyPanel();
}

function showTrophyPanel() {
  try {
    const t = trophyLoad();
    const peak = t.peakRating || 0;
    const peakTier = eloTierOf(peak);

  // デッキ別（構築単位、名前編集可）
  const deckEntries = Object.entries(t.deckPeak || {}).sort((a,b) => b[1].rating - a[1].rating);
  let deckHtml = '';
  deckEntries.forEach(([key, d]) => {
    const tier = eloTierOf(d.rating);
    const safeKey = key.replace(/'/g, "\\'");
    deckHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid #1a1a2a;gap:6px;">
      <span style="font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${d.name}</span>
      <button onclick="trophyRenameDeck('${safeKey}')" style="font-size:10px;padding:2px 6px;background:#1a1a3a;border:1px solid #3a3a6a;color:#8888cc;border-radius:4px;cursor:pointer;flex-shrink:0;">✏️</button>
      <span style="color:${tier.color};font-size:13px;font-weight:bold;white-space:nowrap;flex-shrink:0;">${tier.icon} ${d.rating}</span>
    </div>`;
  });
  if (!deckHtml) deckHtml = '<div style="color:#555;font-size:12px;padding:4px 0;">まだ記録なし</div>';

  // カード別（CARD_DB全カード、土地含む）
  const cardPeak = t.cardPeak || {};
  const allCards = Object.values(CARD_DB);
  const sorted = [...allCards].sort((a,b) => (cardPeak[b.id]||0) - (cardPeak[a.id]||0));
  let cardHtml = '';
  sorted.forEach(card => {
    const r = cardPeak[card.id] || 0;
    const rank = r ? cardTrophyRank(r) : null;
    cardHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 4px;border-bottom:1px solid #111120;">
      <span style="font-size:11px;">${card.icon||''} ${card.name}</span>
      <span style="color:${rank?rank.color:'#444'};font-size:11px;font-weight:bold;">${rank ? rank.icon+' '+rank.label+(r?' ('+r+')':'') : r ? r : '─'}</span>
    </div>`;
  });

  showModal('🏆 トロフィー', `
    <div style="text-align:center;margin-bottom:12px;padding:10px;background:#111122;border-radius:8px;border:1px solid #2a2a4a;">
      <div style="font-size:11px;color:#888;margin-bottom:4px;">総合最高レート</div>
      <div style="font-size:28px;font-weight:bold;color:${peakTier.color}">${peak ? peakTier.icon+' '+peak : '─'}</div>
      <div style="font-size:13px;color:${peakTier.color}">${peak ? peakTier.name : '未挑戦'}</div>
    </div>
    <div style="font-size:12px;color:#888;margin-bottom:4px;">デッキ別最高レート <span style="color:#666;font-size:10px;">（✏️で名前変更）</span></div>
    <div style="margin-bottom:12px;max-height:160px;overflow-y:auto;">${deckHtml}</div>
    <div style="font-size:12px;color:#888;margin-bottom:2px;">カード別トロフィー</div>
    <div style="font-size:10px;color:#666;margin-bottom:4px;">🥇金 1800以上 ／ 🥈銀 1700以上 ／ 🥉銅 1600以上</div>
    <div style="max-height:200px;overflow-y:auto;margin-bottom:12px;">${cardHtml}</div>
    <button onclick="closeModal();" style="width:100%;padding:10px;background:#12121e;border:1px solid #4a4a6a;color:#aaaacc;border-radius:6px;cursor:pointer;">閉じる</button>
  `);
  } catch(e) {
    console.error('トロフィーパネル表示エラー:', e);
    showModal('エラー', `<p>トロフィー情報の表示に失敗しました：</p><p style="color:#ff6666;font-size:12px;">${e.message}</p><button onclick="closeModal();" style="width:100%;padding:10px;">OK</button>`);
  }
}

// ── Elo レーティングシステム ──────────────────────────────────
const ELO_TIERS = [
  { name: 'Bronze',   min: 0,    max: 999,  color: '#cd7f32', icon: '🥉', mctsScale: 0.15, mistakeRate: 0.30 },
  { name: 'Silver',   min: 1000, max: 1299, color: '#a0a0b0', icon: '🥈', mctsScale: 0.40, mistakeRate: 0.15 },
  { name: 'Gold',     min: 1300, max: 1599, color: '#ccaa33', icon: '🥇', mctsScale: 1.00, mistakeRate: 0.05 },
  { name: 'Platinum', min: 1600, max: 1899, color: '#88ccff', icon: '💎', mctsScale: 2.00, mistakeRate: 0.01 },
  { name: 'Master',   min: 1900, max: 9999, color: '#ff88ff', icon: '👑', mctsScale: 4.00, mistakeRate: 0.00 },
];
let RATED_MODE = false;
let RATED_OPP_RATING = 1500;

function eloGetRating() {
  try { return JSON.parse(localStorage.getItem('dcg_elo') || '{"rating":1500}').rating; } catch(e) { return 1500; }
}
function eloSaveRating(r) {
  try { localStorage.setItem('dcg_elo', JSON.stringify({rating: Math.max(0, Math.round(r))})); } catch(e) {}
}
function eloTierOf(r) {
  return ELO_TIERS.find(t => r >= t.min && r <= t.max) || ELO_TIERS[ELO_TIERS.length - 1];
}
function eloCalcDelta(myRating, oppRating, won) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppRating - myRating) / 400));
  return Math.round(K * ((won ? 1 : 0) - expected));
}
// Box-Muller正規分布で対戦相手レートを生成（σ≈100、中心=自分レート）
function eloOppRatingForMyRating(myRating) {
  // Box-Muller正規分布: σ=125で、近いレートほど当たりやすい（±300制限）
  // σ=125の正規分布では、95%が±250以内に収まる
  let u, v, s;
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u*u + v*v; } while (s >= 1 || s === 0);
  const gauss = u * Math.sqrt(-2 * Math.log(s) / s);
  const sigma = 125;
  const raw = Math.round(myRating + gauss * sigma);
  return Math.max(0, Math.min(2500, Math.max(myRating - 300, Math.min(myRating + 300, raw))));
}

function endGame(winner) {
  if (G.phase !== 'ended' && typeof NET_MODE !== 'undefined' && NET_MODE === 'local') {
    try {
      const rec = JSON.parse(localStorage.getItem('dcg_record') || '{"wins":0,"losses":0}');
      if (winner === 0) rec.wins = (rec.wins || 0) + 1;
      else rec.losses = (rec.losses || 0) + 1;
      localStorage.setItem('dcg_record', JSON.stringify(rec));
    } catch(e) {}
    // 特殊マッチの記録
    if (SPECIAL_MATCH_MODE) {
      onSpecialMatchEnd(winner === 0);
    }

    // Phase E: Pattern Blocker（AIが負けた場合、パターンを記録）
    if (winner === 0 && typeof recordLossPattern === 'function') {
      // プレイヤー勝利 = AI敗北 → パターン記録
      const turn = G.turn || 1;
      const aiPlayer = G.players[1];
      const playerField = G.players[0].field;
      if (playerField.length > 0) {
        const topThreat = playerField.reduce((a,b)=>
          getEffectivePower(0,b) > getEffectivePower(0,a) ? b : a
        );
        recordLossPattern({
          turn, atkPlayer: 0, defPlayer: 1,
          atkPow: getEffectivePower(0, topThreat),
          atkTou: getEffectiveToughness(0, topThreat),
          blkTou: aiPlayer.field.length > 0 ?
            Math.max(...aiPlayer.field.map(c=>getEffectiveToughness(1,c))) : 0,
          outcome: 'loss'
        });
      }
    }
  }
  const who = NET_MODE === 'hotseat' ? (winner === 0 ? 'P1の' : 'P2の') : winner === 0 ? 'あなたの' : 'AIの';
  log(`ゲーム終了！ ${who}勝利！`, 'important');
  recordReplaySnapshot(`ゲーム終了 (${who}勝利)`);
  // 勝敗アニメ
  if (NET_MODE === 'local') {
    if (winner === 0) setTimeout(animGameWin, 200);
    else setTimeout(animGameLose, 200);
  }
  // Elo処理
  let _eloHtml = '';
  if (RATED_MODE && NET_MODE === 'local') {
    const oldR = eloGetRating();
    const oldTier = eloTierOf(oldR);
    const delta = eloCalcDelta(oldR, RATED_OPP_RATING, winner === 0);
    const newR = oldR + delta;
    eloSaveRating(newR);
    // トロフィー記録（メイン＋土地の全構築で保存）
    const p0 = G.players[0];
    const playerMainCards = p0.deck.concat(p0.hand, p0.field.map(c=>c.cardId), p0.graveyard, p0.exile||[]);
    const playerLandCards = p0.lands.map(l=>l.cardId).concat(p0.landDeck||[]);
    trophyRecord(newR, playerMainCards, playerLandCards);
    RATED_MODE = false;
    const newTier = eloTierOf(newR);
    setTimeout(() => animEloChange(delta, newR, oldTier, newTier), 700);
    // トロフィー新獲得チェック
    const tData = trophyLoad();
    const allUsed = [...new Set([...playerMainCards, ...playerLandCards])];
    const topRank = allUsed.map(id => cardTrophyRank(tData.cardPeak[id]||0)).filter(Boolean)
      .sort((a,b) => b.icon.length - a.icon.length)[0];
    if (topRank) setTimeout(() => animTrophyGet(topRank), 1400);
    const sign = delta >= 0 ? '+' : '';
    _eloHtml = `<div style="text-align:center;margin:10px 0 14px;padding:10px;background:#111122;border-radius:8px;border:1px solid #2a2a4a;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;">レート変動</div>
      <div style="font-size:24px;font-weight:bold;color:${delta>=0?'#44ff88':'#ff4444'}">${sign}${delta}</div>
      <div style="font-size:15px;color:${newTier.color};margin-top:4px;">${newTier.icon} ${newR} — ${newTier.name}</div>
    </div>`;
  } else if (NET_MODE === 'local') {
    // 非レート対戦でもトロフィーを記録（基準レート=1500）
    const p0 = G.players[0];
    const playerMainCards = p0.deck.concat(p0.hand, p0.field.map(c=>c.cardId), p0.graveyard, p0.exile||[]);
    const playerLandCards = p0.lands.map(l=>l.cardId).concat(p0.landDeck||[]);
    trophyRecord(1500, playerMainCards, playerLandCards);
    const tData = trophyLoad();
    const allUsed = [...new Set([...playerMainCards, ...playerLandCards])];
    const topRank = allUsed.map(id => cardTrophyRank(tData.cardPeak[id]||0)).filter(Boolean)
      .sort((a,b) => b.icon.length - a.icon.length)[0];
    if (topRank) setTimeout(() => animTrophyGet(topRank), 1400);
  }
  showModal('ゲーム終了', `<p style="font-size:24px; text-align:center; margin:20px 0;">${who}勝利！</p>${_eloHtml}<button onclick="closeModal();resetBoardAndRestart();" style="width:100%;padding:10px;margin-bottom:8px;">もう一度プレイ</button><button onclick="closeModal();showReplayViewer();" style="width:100%;padding:10px;margin-bottom:8px;background:#1a1a3a;border:1px solid #4444aa;color:#aaaaff;border-radius:6px;cursor:pointer;">📽️ リプレイを見る</button><button onclick="closeModal();resetBoardAndHome();" style="width:100%;padding:10px;background:#12121e;border:1px solid #4a4a6a;color:#aaaacc;border-radius:6px;cursor:pointer;">🏠 ホームに戻る</button>`);
  G.phase = 'ended';
}

// ── 盤面リセット: 対戦終了後にゲーム状態を初期化 ──
function resetBoardAndRestart() {
  // 同モードでもう一度: ログをクリアし、initGameが全状態をリセット
  const logEl = document.getElementById('log');
  if (logEl) logEl.innerHTML = '';
  initGame();
}

function resetBoardAndHome() {
  // ログと盤面をクリアしてホームへ（次の対戦はinitGameで完全リセット）
  const logEl = document.getElementById('log');
  if (logEl) logEl.innerHTML = '';
  if (G) {
    G.phase = 'ended';
    G.stack = [];
    G.combatArrows = [];
    G.targetMode = null;
  }
  showHomeScreen();
}

// ── リタイア（投了）────────────────────────────────────────
function confirmRetire() {
  if (!G || G.phase === 'ended') { resetBoardAndHome(); return; }
  const ratedNote = RATED_MODE ? '<br><span style="color:#ffcc44;font-size:12px;">⚠️ レート戦中 — 敗北としてレートが変動します</span>' : '';
  showModal('リタイア確認', `
    <p style="margin-bottom:16px;">対戦をリタイアしてホームに戻りますか？<br><span style="color:#888;font-size:12px;">（AI対戦の場合は敗北として記録されます）</span>${ratedNote}</p>
    <button onclick="closeModal();doRetire();" style="width:100%;padding:12px;background:#2a1212;border:1px solid #884444;color:#ffaaaa;border-radius:6px;cursor:pointer;font-weight:700;font-size:14px;">🏳️ リタイアする</button>`);
}

function doRetire() {
  if (G && G.phase !== 'ended' && NET_MODE === 'local') {
    try {
      const rec = JSON.parse(localStorage.getItem('dcg_record') || '{"wins":0,"losses":0}');
      rec.losses = (rec.losses || 0) + 1;
      localStorage.setItem('dcg_record', JSON.stringify(rec));
    } catch(e) {}
    // 特殊マッチ中のリタイアは「AIの勝ち」として記録する（記録漏れ防止）
    if (SPECIAL_MATCH_MODE) {
      recordSpecialMatchResult(true);
      updateSpecialMatchDisplay();
    }
    // レート戦中のリタイアはElo敗北処理
    if (RATED_MODE) {
      const oldR = eloGetRating();
      const delta = eloCalcDelta(oldR, RATED_OPP_RATING, false);
      const newR = oldR + delta;
      eloSaveRating(newR);
      const p0 = G.players[0];
      const mainCards = p0.deck.concat(p0.hand, p0.field.map(c=>c.cardId), p0.graveyard, p0.exile||[]);
      const landCards = p0.lands.map(l=>l.cardId).concat(p0.landDeck||[]);
      trophyRecord(newR, mainCards, landCards);
      RATED_MODE = false;
      const tier = eloTierOf(newR);
      const sign = delta >= 0 ? '+' : '';
      log(`レート変動: ${sign}${delta} → ${tier.icon} ${newR} (${tier.name})`, 'important');
    }
  }
  if (G) G.phase = 'ended';
  log('🏳️ リタイアしました', 'important');
  resetBoardAndHome();
}

// フリーズ・バグ時の強制脱出（Elo変動なし）
function emergencyEscape() {
  RATED_MODE = false; // レート変動させない
  if (G) {
    G.phase = 'ended';
    G.stack = [];
    G.targetMode = null;
    G.awaitingPriority = false;
    G.attackMode = false;
    G.blockMode = false;
    G.combatArrows = [];
  }
  // タイマー等の残留を全てクリア
  clearAllAITimers();
  const logEl = document.getElementById('log');
  if (logEl) logEl.innerHTML = '';
  showHomeScreen();
}

// AI関連タイマーを強制クリア
let _aiTimerIds = [];
function trackAITimer(id) { _aiTimerIds.push(id); return id; }
function clearAllAITimers() {
  _aiTimerIds.forEach(id => { try { clearTimeout(id); clearInterval(id); } catch(e){} });
  _aiTimerIds = [];
}

// リタイアボタン長押し（3秒）でフリーズ脱出
let _retireHoldTimer = null;
let _retireHoldStart = 0;
let _retireTriggered = false;
function retireHoldStart(e) {
  e && e.preventDefault && e.preventDefault();
  _retireHoldStart = Date.now();
  _retireTriggered = false;
  const btn = document.getElementById('btn-retire');
  _retireHoldTimer = setTimeout(() => {
    _retireTriggered = true;
    if (btn) btn.textContent = '🏳️ リタイア';
    emergencyEscape();
  }, 3000);
  // 視覚フィードバック: 徐々にボタンが赤くなる
  if (btn) btn.style.transition = 'background 3s';
  if (btn) btn.style.background = 'rgba(120,20,20,0.95)';
}
function retireHoldEnd(e) {
  if (_retireHoldTimer) { clearTimeout(_retireHoldTimer); _retireHoldTimer = null; }
  const btn = document.getElementById('btn-retire');
  if (btn) { btn.style.transition = ''; btn.style.background = ''; btn.textContent = '🏳️ リタイア'; }
  if (!_retireTriggered && e !== null && (Date.now() - _retireHoldStart) < 800) {
    // 短タップ → 通常のリタイア確認
    confirmRetire();
  }
}

// ============================================================
// REPLAY (ターン毎の盤面スナップショットを記録してステップ再生)
// ============================================================
let REPLAY_HISTORY = [];
let _enteringInstIds = new Set(); // カード入場アニメーション用

function recordReplaySnapshot(label) {
  try {
    if (!G) return;
    if (REPLAY_HISTORY.length >= 200) REPLAY_HISTORY.shift();
    const snap = JSON.parse(JSON.stringify(G, (_,v)=> v instanceof Set ? [...v] : v));
    REPLAY_HISTORY.push({ label, snap });
  } catch(e) {}
}

function _replayRestore(snap) {
  G = JSON.parse(JSON.stringify(snap));
  G.mustAttackCreatures = new Set(G.mustAttackCreatures||[]);
  G.cantAttackPermanent = new Set(G.cantAttackPermanent||[]);
  G.kaizen_used_names   = new Set(G.kaizen_used_names||[]);
  G.directlyAttackedCreatures = new Set(G.directlyAttackedCreatures||[]);
  if (G.mulliganSelected) G.mulliganSelected = new Set(G.mulliganSelected);
  G.targetMode = null; G.combatArrows = [];
}

let _replayIndex = 0;
function showReplayViewer() {
  if (REPLAY_HISTORY.length === 0) { showModal('📽️ リプレイ', '<p style="color:#888;">記録がありません</p>'); return; }
  _replayIndex = 0;
  let bar = document.getElementById('replay-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'replay-bar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:700;background:rgba(8,8,22,0.96);border-top:2px solid #4444aa;display:flex;align-items:center;justify-content:center;gap:14px;padding:10px;';
    bar.innerHTML = `
      <button onclick="replayStep(-1)" style="padding:10px 22px;font-size:18px;background:#1a1a3a;border:1px solid #4444aa;color:#aaaaff;border-radius:8px;cursor:pointer;">◀ 前</button>
      <span id="replay-label" style="color:#ccccff;font-size:14px;min-width:200px;text-align:center;"></span>
      <button onclick="replayStep(1)" style="padding:10px 22px;font-size:18px;background:#1a1a3a;border:1px solid #4444aa;color:#aaaaff;border-radius:8px;cursor:pointer;">次 ▶</button>
      <button onclick="closeReplayViewer()" style="padding:10px 18px;font-size:14px;background:#3a1a1a;border:1px solid #aa4444;color:#ffaaaa;border-radius:8px;cursor:pointer;">✕ 終了</button>`;
    document.body.appendChild(bar);
    // リプレイ中の盤面操作を吸収する透明シールド
    const shield = document.createElement('div');
    shield.id = 'replay-shield';
    shield.style.cssText = 'position:fixed;inset:0;z-index:690;background:transparent;';
    document.body.appendChild(shield);
  }
  bar.style.display = 'flex';
  const shield = document.getElementById('replay-shield');
  if (shield) shield.style.display = 'block';
  replayShow(0);
}

function replayStep(dir) {
  replayShow(Math.max(0, Math.min(REPLAY_HISTORY.length - 1, _replayIndex + dir)));
}

function replayShow(i) {
  _replayIndex = i;
  const entry = REPLAY_HISTORY[i];
  _replayRestore(entry.snap);
  const labelEl = document.getElementById('replay-label');
  if (labelEl) labelEl.textContent = `${i+1}/${REPLAY_HISTORY.length}: ${entry.label}`;
  render();
}

function closeReplayViewer() {
  const bar = document.getElementById('replay-bar');
  const shield = document.getElementById('replay-shield');
  if (bar) bar.style.display = 'none';
  if (shield) shield.style.display = 'none';
  // 最終状態(ゲーム終了時)に戻す
  const last = REPLAY_HISTORY[REPLAY_HISTORY.length - 1];
  if (last) { _replayRestore(last.snap); G.phase = 'ended'; render(); }
  showHomeScreen();
}

// ============================================================
// PHASE MANAGEMENT
// ============================================================
function endPhase() {
  if (SPECTATOR_MODE) return; // 観戦モード中は操作不可
  if (NET_MODE === 'guest' && netCanAct()) { netSendAction('endPhase', {}); return; }
  if (G.phase === 'ended') return;
  // Open priority window for non-active player before ending phase
  if (!G.awaitingPriority && !G._skipPriorityWindow && !G.playerBlockMode) {
    const opponent = 1 - G.activePlayer;
    G._skipPriorityWindow = true;
    openPriorityWindow(opponent, () => {
      // フラグはtrueのまま再入 → ウィンドウ再オープンせず本処理へ（下でリセット）
      endPhase();
    }, 'フェイズ終了時');
    return;
  }
  G._skipPriorityWindow = false;
  clearTargetMode();

  // メインフェイズ終了（人間が操作する側のターン: local=P0 / hotseat・host=両方）
  const humanAp = NET_MODE === 'local' ? 0 : G.activePlayer;
  if (G.phase === 'main' && G.activePlayer === humanAp) {
    // mustAttackクリーチャーが残っていれば強制攻撃
    const ap = G.activePlayer;
    const mustAtkers = G.players[ap].field.filter(c =>
      c.mustAttack && canCreatureAttack(ap, c)
    );
    if (mustAtkers.length > 0) {
      log(`⚠️ ${CARD_DB[mustAtkers[0].cardId].name} は可能なら攻撃しなければなりません`, 'important');
      startSingleAttack(ap, mustAtkers[0].instanceId);
      return;
    }
    endTurn();
    return;
  }

  // プレイヤーブロック確定 (AI turn: player assigns blockers for one AI attacker)
  if (G.playerBlockMode) {
    G.playerBlockMode = false;
    G.selectedBlockerToAssign = null;
    render();
    setTimeout(() => resolveAICombat(), 300);
    return;
  }

  endTurn();
}

function canCreatureAttack(player, inst) {
  const card = CARD_DB[inst.cardId];
  if (G.cantAttackPermanent.has(inst.instanceId)) return false;
  if (inst.tapped) return false;
  // 召喚酔いしていない → 通常攻撃（相手プレイヤーへ攻撃）可能
  if (!inst.sick) return true;
  // 速攻: 召喚酔いを無視して攻撃できる
  if (card.haste) return true;
  // 格闘: 出たターン／得たターンは、召喚酔い中でも相手クリーチャー(飛行考慮)を攻撃できる
  const hasKakutou = (card.kakutou && inst.entryTurn === G.turn) || inst.grantedKakutouTurn === G.turn;
  if (hasKakutou) {
    const reachable = G.players[1-player].field.filter(c => card.flying || !CARD_DB[c.cardId].flying);
    return reachable.length > 0;
  }
  return false;
}

function kakutouTargetsOnly(player) {
  // Returns true if this attacker should only target tapped creatures
  // Used at declaration time for kakutou creatures on entry turn
  return false; // resolved in combat - kakutou on entry can only hit tapped
}

// ============================================================
// SINGLE CREATURE ATTACK (main phase, one at a time)
// ============================================================
function startSingleAttack(player, atkInstId) {
  const p = G.players[player];
  const opp = 1 - player;
  const inst = p.field.find(c => c.instanceId === atkInstId);
  if (!inst) return;
  const card = CARD_DB[inst.cardId];

  // 攻撃アニメーション: viewer目線でP0(下)は上へ・P1(上)は下へ
  const atkEl = document.querySelector(`[data-inst="${atkInstId}"]`);
  if (atkEl) {
    const atkClass = player === NET_MY_IDX ? 'attacking-up' : 'attacking-down';
    atkEl.classList.remove('attacking-up', 'attacking-down');
    void atkEl.offsetWidth;
    atkEl.classList.add(atkClass);
    setTimeout(() => atkEl.classList.remove(atkClass), 450);
  }

  // Tap attacker (vigilance stays untapped)
  if (!card.vigilance) inst.tapped = true;

  G.combatArrows = [{fromId: atkInstId, toId: null, color: '#ff8800'}];

  // アレスティア passive: 攻撃宣言時、守備側がアレスティアを持っていれば守備側全クリーチャー+1/+1
  const oppHasArestia = G.players[opp].field.some(c => CARD_DB[c.cardId].id === 'arestia');
  if (oppHasArestia) {
    G.players[opp].field.forEach(c => addPermanentBuff(opp, c.instanceId, 1, 1));
    log('アレスティア: 全クリーチャー+1/+1（永続）');
  }

  // 格闘: select target creature first, then priority window after target chosen
  if (card.kakutou && inst.entryTurn === G.turn) {
    const reachable = G.players[opp].field.filter(c => card.flying || !CARD_DB[c.cardId].flying);
    if (reachable.length === 0) {
      log(`${card.name} 格闘: 対象クリーチャーがいません`);
      if (!card.vigilance) inst.tapped = false;
      G.combatArrows = [];
      render(); updateHints(); return;
    }
    G.kakutouTargetMode = true;
    G.pendingKakutouInstId = atkInstId;
    G.kakutouTargets = {};
    log(`${card.name} 格闘: 攻撃する相手クリーチャーを選択してください`);
    render(); updateHints();
    return;
  }

  // Normal attack: open priority window for non-turn player before combat resolves
  log(`${card.name} が攻撃宣言`);
  fireAttackTriggers(player, atkInstId);
  render();
  openPriorityWindow(opp, () => {
    // After priority window: check attacker still alive
    const stillAlive = G.players[player].field.find(c => c.instanceId === atkInstId);
    if (!stillAlive) {
      log('攻撃クリーチャーが破壊されたため攻撃中止');
      G.combatArrows = [];
      render(); updateHints();
      if (player === 1) setTimeout(() => continueAIAttack(), 300);
      return;
    }
    if (NET_MODE === 'hotseat' || NET_MODE === 'host') {
      // 人間が守備側（ホットシート/オンライン）: 守備側プレイヤーが自分でブロックを宣言
      const atkInst2 = G.players[player].field.find(c => c.instanceId === atkInstId);
      const eligible = G.players[opp].field.filter(c => {
        const bc = CARD_DB[c.cardId];
        return (!c.tapped || (bc.ocBlockWhileTapped && isOCActive(opp))) && canFlyBlock(atkInst2, c);
      });
      if (eligible.length === 0) {
        resolveSingleCombat(player, atkInstId, null, null);
        return;
      }
      G.aiCurrentAttackers = [{instId: atkInstId, targetType:'player', targetInstId:null}];
      G.playerBlockMode = true;
      G.playerBlockDefender = opp;
      G.playerBlockAssignments = {};
      G.selectedBlockerToAssign = null;
      G._pendingBlockAtkP = player;
      log(`--- ${card.name} に対してブロッカーを宣言（任意）→「ブロック確定」 ---`, 'important');
      render(); updateHints();
      return;
    }
    const aiBlocker = pickAIBlockerFor(player, atkInstId);
    if (aiBlocker) {
      G.combatArrows = [{fromId: atkInstId, toId: aiBlocker.instanceId, color: '#ff4444'}];
      render();
      setTimeout(() => resolveSingleCombat(player, atkInstId, null, aiBlocker.instanceId), 400);
    } else {
      resolveSingleCombat(player, atkInstId, null, null);
    }
  }, '攻撃宣言に対応');
}

function pickAIBlockerFor(atkPlayer, atkInstId, excludeInstId) {
  const opp = 1 - atkPlayer;
  const oppField = G.players[opp].field;
  const atkInst = G.players[atkPlayer].field.find(c => c.instanceId === atkInstId);
  if (!atkInst) return null;
  // 格闘の攻撃先に指定されているクリーチャーはブロックできない
  const kkTargeted = new Set(Object.values(G.kakutouTargets || {}));
  if (G.directlyAttackedCreatures) G.directlyAttackedCreatures.forEach(id => kkTargeted.add(id));
  const eligible = oppField.filter(b => {
    if (excludeInstId != null && b.instanceId === excludeInstId) return false; // 格闘対象はブロック不可
    if (kkTargeted.has(b.instanceId)) return false; // 格闘の攻撃先はブロック不可
    const bc = CARD_DB[b.cardId];
    return (!b.tapped || (bc.ocBlockWhileTapped && isOCActive(opp))) && canFlyBlock(atkInst, b);
  });
  if (!eligible.length) return null;
  // 評価スコアで最善ブロッカーを選択
  let bestBlocker = null, bestVal = -Infinity;
  for (const b of eligible) {
    if (!aiShouldBlock(atkInst, b, atkPlayer)) continue;
    const atkPow = getEffectivePower(atkPlayer, atkInst);
    const blkPow = getEffectivePower(opp, b);
    const blkTou = getEffectiveToughness(opp, b);
    const atkTou = getEffectiveToughness(atkPlayer, atkInst);
    const bSurvives = (blkTou - b.damage) > atkPow;
    const aDies = (atkTou - atkInst.damage) <= blkPow;
    const val = (aDies ? AI_WEIGHTS.fieldPower * atkPow + AI_WEIGHTS.fieldCount : 0)
              - (bSurvives ? 0 : AI_WEIGHTS.fieldPower * blkPow + AI_WEIGHTS.fieldCount);
    if (val > bestVal) { bestVal = val; bestBlocker = b; }
  }
  // D. AI思考表示: ブロック判断の理由をログに出す
  if (typeof aiThink === 'function') {
    if (bestBlocker) {
      const bName = CARD_DB[bestBlocker.cardId].name;
      const atkPow = getEffectivePower(atkPlayer, atkInst);
      const bPow = getEffectivePower(opp, bestBlocker);
      const bTou = getEffectiveToughness(opp, bestBlocker);
      const aTou = getEffectiveToughness(atkPlayer, atkInst);
      const bSurv = (bTou - bestBlocker.damage) > atkPow;
      const aDie = (aTou - atkInst.damage) <= bPow;
      if (aDie && bSurv) aiThink(`「${bName}」でブロック — 一方的に倒せると判断`);
      else if (aDie) aiThink(`「${bName}」でブロック — 相打ちでも攻撃を止める価値があると判断`);
      else if (bSurv) aiThink(`「${bName}」でブロック — 生き残ってダメージを防げると判断`);
      else aiThink(`「${bName}」でブロック — 被害覚悟で本体を守る`);
    } else {
      aiThink('ブロックしない — ブロックしても損になると判断（攻撃を通す）');
    }
  }
  return bestBlocker;
}

function resolveSingleCombat(atkPlayer, atkInstId, kakutouTargetId, blockerInstId) {
  const opp = 1 - atkPlayer;
  // この攻撃の格闘対象指定はここで消費される（残留すると以後ブロック不可のままになる）
  if (G.kakutouTargets) delete G.kakutouTargets[atkInstId];
  const atkInst = G.players[atkPlayer].field.find(c => c.instanceId === atkInstId);
  if (!atkInst) {
    G.combatArrows = []; render();
    if (atkPlayer === 1) setTimeout(() => continueAIAttack(), 300);
    return;
  }
  // アレスティア■3用: バトル開始時の防御側フィールドと、バトル中に破壊されたインスタンスを追跡
  const defFieldBefore = G.players[opp].field.map(c => c.instanceId);
  G._battleDestroyedInstIds = new Set();
  const atkCard = CARD_DB[atkInst.cardId];
  const atkPow = getEffectivePower(atkPlayer, atkInst);
  // 攻撃中ダメージ無効: ミチル(自身)・メグル(自軍全体) が場にいれば攻撃クリーチャーは戦闘ダメージを受けない
  const atkInvuln = atkCard.noDmgWhileAttacking ||
    G.players[atkPlayer].field.some(c => CARD_DB[c.cardId].alliesInvulnWhileAttacking);

  if (kakutouTargetId) {
    // 格闘: mutual damage with target creature
    const tgtInst = G.players[opp].field.find(c => c.instanceId === kakutouTargetId);
    if (tgtInst) {
      const tgtPow = getEffectivePower(opp, tgtInst);
      tgtInst.damage += atkPow;
      if (!atkInvuln) atkInst.damage += tgtPow;
      // 聖印: ダメージを与えたクリーチャーの持ち主が同量ライフ回復
      if (atkCard.lifelink && atkPow > 0) { G.players[atkPlayer].life += atkPow; showLifeChange(atkPlayer, atkPow); log(`${atkCard.name} 聖印: ライフ+${atkPow}`, 'heal'); }
      if (CARD_DB[tgtInst.cardId].lifelink && tgtPow > 0 && !atkInvuln) { G.players[opp].life += tgtPow; showLifeChange(opp, tgtPow); log(`${CARD_DB[tgtInst.cardId].name} 聖印: ライフ+${tgtPow}`, 'heal'); }
      // 接死
      if (atkCard.deathtouch && atkPow > 0) tgtInst._deathtouched = true;
      if (CARD_DB[tgtInst.cardId].deathtouch && tgtPow > 0 && !atkInvuln) atkInst._deathtouched = true;
      log(`${atkCard.name} 格闘 → ${CARD_DB[tgtInst.cardId].name}: ${atkPow}ダメージ${atkInvuln ? '（被ダメージ無効）' : '交換'}`, 'damage');
      checkCreatureDeath(opp, kakutouTargetId, atkPlayer);
      checkCreatureDeath(atkPlayer, atkInstId, opp);
    }
  } else if (blockerInstId) {
    // Blocked: mutual damage
    const blkInst = G.players[opp].field.find(c => c.instanceId === blockerInstId);
    if (blkInst) {
      const blkCard = CARD_DB[blkInst.cardId];
      const blkPow = getEffectivePower(opp, blkInst);
      blkInst.damage += atkPow;
      if (!atkInvuln) atkInst.damage += blkPow;
      // 聖印: ダメージを与えたクリーチャーの持ち主が同量ライフ回復
      if (atkCard.lifelink && atkPow > 0) { G.players[atkPlayer].life += atkPow; showLifeChange(atkPlayer, atkPow); log(`${atkCard.name} 聖印: ライフ+${atkPow}`, 'heal'); }
      if (blkCard.lifelink && blkPow > 0 && !atkInvuln) { G.players[opp].life += blkPow; showLifeChange(opp, blkPow); log(`${blkCard.name} 聖印: ライフ+${blkPow}`, 'heal'); }
      // 接死
      if (atkCard.deathtouch && atkPow > 0) blkInst._deathtouched = true;
      if (blkCard.deathtouch && blkPow > 0 && !atkInvuln) atkInst._deathtouched = true;
      log(`${atkCard.name} vs ${blkCard.name}: ${atkPow}/${atkInvuln ? 0 : blkPow}ダメージ交換`, 'damage');
      if (atkCard.trample) {
        const blkTou = getEffectiveToughness(opp, blkInst);
        const excess = Math.max(0, atkPow - blkTou);
        if (excess > 0) { G.players[opp].life -= excess; showFloatDamage(excess, opp === 1 ? 'ai' : 'player'); log(`${atkCard.name} 貫通: ${excess}超過ダメージ`, 'damage'); }
      }
      checkCreatureDeath(opp, blockerInstId, atkPlayer);
      checkCreatureDeath(atkPlayer, atkInstId, opp);
      // onBlock triggers → push to stack
      if (blkCard.onBlock === 'draw1') {
        triggerEffect(`${blkCard.name} ブロック誘発`, blkCard.icon||'✨', opp, () => {
          drawCard(opp);
          log(`${blkCard.name}: 1ドロー`);
          // 「その後」: 同じスタック項目内でコピー処理も行う
          if (blkCard.onBlockCopy) {
            const blkInstNow = G.players[opp].field.find(c => c.instanceId === blockerInstId);
            if (blkInstNow && blkCard.toughness > 1) {
              if (opp === 0) {
                const capInstId = blkInstNow.instanceId;
                showModal(`${blkCard.name} コピー`, `<p>タフネス${blkCard.toughness - 1}のコピーを出しますか？</p><button onclick="closeModal();G._awaitingModal=false;spawnCopyWithReducedToughness(0,${capInstId});render();updateHints();continueStack();" style="margin:4px;padding:6px 12px;background:#4a9eff;border:none;border-radius:4px;color:#fff;cursor:pointer;">はい</button><button onclick="closeModal();G._awaitingModal=false;updateHints();continueStack();" style="margin:4px;padding:6px 12px;background:#888;border:none;border-radius:4px;color:#fff;cursor:pointer;">いいえ</button>`);
                G._awaitingModal = true;
                return;
              } else {
                spawnCopyWithReducedToughness(opp, blockerInstId);
              }
            }
          }
          render(); continueStack();
        });
      }
      if (blkCard.onBlock === 'gain3life') {
        triggerEffect(`${blkCard.name} ブロック誘発`, blkCard.icon||'✨', opp, () => {
          G.players[opp].life += 3; showLifeChange(opp, +3);
          log(`${blkCard.name}: ライフ+3`);
          render();
        });
      }
      if (blkCard.onBlock === 'damage2attacker' || blkCard.onBlock === 'damage2attackerAndCopy') {
        if (opp === 0) {
          triggerEffect(`${blkCard.name} ブロック誘発`, blkCard.icon||'✨', opp, () => {
            const validTargets = G.players[atkPlayer].field;
            if (validTargets.length > 0) {
              G.targetMode = { type:'opponentCreature', callback:(tgt) => {
                applyDamageToCreature(atkPlayer, tgt.instId, 2, opp);
                log(`${blkCard.name}: 相手クリーチャーに2ダメージ`, 'damage');
                G.targetMode = null; checkDeath(); render(); updateHints();
                continueStack();
              }};
              log(`${blkCard.name}: 2ダメージの対象を選択（紫枠のクリーチャー）`);
              render(); updateHints();
            } else {
              log(`${blkCard.name}: 相手クリーチャーなし、2ダメージ無効`);
              continueStack();
            }
          });
        } else {
          triggerEffect(`${blkCard.name} ブロック誘発`, blkCard.icon||'✨', opp, () => {
            const atkInstNow = G.players[atkPlayer].field.find(c => c.instanceId === atkInstId);
            if (atkInstNow) {
              atkInstNow.damage += 2;
              log(`${blkCard.name}: 攻撃クリーチャーに2ダメージ`, 'damage');
              render();
            }
            continueStack();
          });
        }
      }
      if (blkCard.onBlock === 'damage2attackerAndCopy') {
        const blkInstNow = G.players[opp].field.find(c => c.instanceId === blockerInstId);
        if (blkInstNow && blkCard.toughness > 1) {
          if (opp === 0) {
            const capInstId2 = blkInstNow.instanceId;
            triggerEffect(`${blkCard.name} コピー誘発`, blkCard.icon||'🛡️', opp, () => {
              showModal(`${blkCard.name} コピー`, `<p>タフネス${blkCard.toughness - 1}のコピーを出しますか？</p><button onclick="closeModal();G._awaitingModal=false;spawnCopyWithReducedToughness(0,${capInstId2});render();continueStack();" style="margin:4px;padding:6px 12px;background:#4a9eff;border:none;border-radius:4px;color:#fff;cursor:pointer;">はい</button><button onclick="closeModal();G._awaitingModal=false;continueStack();" style="margin:4px;padding:6px 12px;background:#888;border:none;border-radius:4px;color:#fff;cursor:pointer;">いいえ</button>`);
              G._awaitingModal = true;
            });
          } else {
            triggerEffect(`${blkCard.name} コピー誘発(AI)`, blkCard.icon||'🛡️', opp, () => {
              spawnCopyWithReducedToughness(opp, blockerInstId);
              continueStack();
            });
          }
        }
      }
      // onBlockCopy: ブロック時コピー（元の基本タフネスが2以上の時のみ）
      // draw1 の「その後」で既に処理されたら、ここではスキップ
      if (blkCard.onBlockCopy && blkCard.onBlock !== 'draw1') {
        const blkInstNow = G.players[opp].field.find(c => c.instanceId === blockerInstId);
        if (blkInstNow && blkCard.toughness > 1) {
          const copyCount = typeof blkCard.onBlockCopy === 'number' ? blkCard.onBlockCopy : 1;
          for (let i = 0; i < copyCount; i++) {
            if (opp === 0) {
              const capInstId = blkInstNow.instanceId;
              triggerEffect(`${blkCard.name} コピー誘発${copyCount > 1 ? ` (${i+1}/${copyCount})` : ''}`, blkCard.icon||'🛡️', 0, () => {
                showModal(`${blkCard.name} コピー`, `<p>タフネス${blkCard.toughness - 1}のコピーを出しますか？</p><button onclick="closeModal();G._awaitingModal=false;spawnCopyWithReducedToughness(0,${capInstId});render();continueStack();" style="margin:4px;padding:6px 12px;background:#4a9eff;border:none;border-radius:4px;color:#fff;cursor:pointer;">はい</button><button onclick="closeModal();G._awaitingModal=false;continueStack();" style="margin:4px;padding:6px 12px;background:#888;border:none;border-radius:4px;color:#fff;cursor:pointer;">いいえ</button>`);
                G._awaitingModal = true;
              });
            } else {
              triggerEffect(`${blkCard.name} コピー誘発${copyCount > 1 ? ` (${i+1}/${copyCount})(AI)` : '(AI)'}`, blkCard.icon||'🛡️', 1, () => {
                spawnCopyWithReducedToughness(1, blockerInstId);
                continueStack();
              });
            }
          }
        }
      }
      if (blkCard.cx8Block === 'buff1ally' && getCXValue(opp) >= 8) {
        triggerEffect(`${blkCard.name} C8ブロック誘発`, blkCard.icon||'✨', opp, () => {
          if (opp === 0) {
            G.targetMode = { type:'ownCreature', owner:0, callback:(tgt) => {
              addPermanentBuff(0, tgt.instId, 1, 1);
              log(`${blkCard.name} C8: 味方+1/+1`, 'important');
              G.targetMode = null; render(); updateHints();
              continueStack();
            }};
            render();
          } else {
            const ally = G.players[1].field.find(c=>c.instanceId!==blockerInstId);
            if (ally) { addPermanentBuff(1, ally.instanceId, 1, 1); log(`AI ${blkCard.name} C8: 味方+1/+1`,'important'); }
            render(); continueStack();
          }
        });
      }
      if (blkCard.cx8Block === 'buffAllAlly' && getCXValue(opp) >= 8) {
        triggerEffect(`${blkCard.name} C8ブロック誘発`, blkCard.icon||'✨', opp, () => {
          G.players[opp].field.forEach(c => addPermanentBuff(opp, c.instanceId, 1, 1));
          log(`${opp===1?'AI ':''}${blkCard.name} C8: 自分のクリーチャー全て+1/+1`, 'important');
          render(); continueStack();
        });
      }
      // 介善■3: このターン自クリーチャーブロック時1ドロー
      if (G.kaizenBlockDraw === opp) {
        triggerEffect('介善 ■3 ブロック誘発', '✨', opp, () => {
          drawCard(opp); log('介善 ■3: ブロック時1ドロー');
          render();
        });
      }
    }
  } else {
    // Unblocked: deal damage to opponent player
    G.players[opp].life -= atkPow;
    showFloatDamage(atkPow, opp === 0 ? 'player' : 'ai');
    log(`${atkCard.name} が${atkPow}ダメージ！`, 'damage');
    // 聖印: プレイヤーへの攻撃でダメージを与えても発動
    if (atkCard.lifelink && atkPow > 0) { G.players[atkPlayer].life += atkPow; showLifeChange(atkPlayer, atkPow); log(`${atkCard.name} 聖印: ライフ+${atkPow}`, 'heal'); }
  }

  // Vigilance untap
  if (atkCard.vigilance) atkInst.tapped = false;

  // 2回攻撃: このターン最初の攻撃時にアンタップ（もう一度攻撃可能）
  const hasDoubleAttack = (atkCard.keywords && atkCard.keywords.includes('2回攻撃')) ||
    (atkCard.ocDoubleAttack && isOCActive(atkPlayer));
  const atkStillAlive = G.players[atkPlayer].field.find(c => c.instanceId === atkInstId);
  if (hasDoubleAttack && atkStillAlive && atkInst._dblAtkTurn !== G.turn) {
    atkInst._dblAtkTurn = G.turn;
    atkInst.tapped = false;
    log(`${atkCard.name}: 2回攻撃 — アンタップしてもう一度攻撃できる`, 'important');
    // AIの場合は攻撃キューに再投入
    if (atkPlayer === 1 && G._aiAttackQueue) G._aiAttackQueue.push(atkInstId);
  }

  checkDeath();
  G.combatArrows = [];

  // アレスティア ■3: ブロック終了時、このバトル中自クリーチャーが1体も破壊されていなければ相手プレイヤーに2ダメージ
  // 破壊 = 墓地行き。手札バウンスや追放は破壊ではない (_battleDestroyedInstIds で追跡)
  // アレスティア自身が破壊された場合も _battleDestroyedInstIds に含まれるため自動的に不発
  if (blockerInstId) {
    const defHasArestia = G.players[opp].field.some(c => CARD_DB[c.cardId].id === 'arestia');
    if (defHasArestia) {
      // 防御側クリーチャーが1体でも破壊されたか (defFieldBefore = バトル開始時の防御側instanceId一覧)
      const ownCreatureDestroyed = [...G._battleDestroyedInstIds].some(id => defFieldBefore.includes(id));
      if (!ownCreatureDestroyed) {
        const capAtkP = atkPlayer;
        triggerEffect('アレスティア ■3 ブロック終了誘発', '⚡', opp, () => {
          G.players[capAtkP].life -= 2;
          showLifeChange(capAtkP, -2);
          log('アレスティア ■3: 相手プレイヤーへ2ダメージ', 'damage');
          render();
        });
      }
    }
  }

  render();
  log('---');

  // If AI is attacking: continue AI attack queue
  // If stack has triggers, open priority window first; continuation will call continueAIAttack
  if (atkPlayer === 1) {
    if (G.stack.length > 0) {
      openPriorityWindow(opp, () => setTimeout(() => continueAIAttack(), 400), '戦闘誘発効果');
    } else if (!G.targetMode) {
      setTimeout(() => continueAIAttack(), 400);
    }
  } else if (G.stack.length > 0 && !G.awaitingPriority && !G.targetMode && !G._awaitingModal) {
    // 人間の攻撃: AIブロック誘発などがスタックに積まれたまま放置されると進行不能になるため、
    // ここで優先権ウィンドウを開いて解決を開始する（呼び出し元は priorityContinuation で続行を接続できる）
    openPriorityWindow(opp, null, '戦闘誘発効果');
  }
}

function endTurnAfterMainPhase() {
  if (G.awaitingPriority) { endTurn(); return; }

  // 人間プレイヤーのターンなら攻撃フェーズを開く
  if (G.activePlayer === 0) {
    playerAttackPhase();
    return;
  }

  // AI のターン（既存フロー）
  const nonTurn = 1 - G.activePlayer;
  openPriorityWindow(nonTurn, () => endTurn(), 'ターン終了時');
}

// ═══════════════════════════════════════════════════════════
// 人間プレイヤーの攻撃フェーズ
// ═══════════════════════════════════════════════════════════

function getAttackCandidates(player) {
  const field = G.players[player].field;
  const opp = G.players[1 - player];
  const candidates = [];

  field.forEach(c => {
    const card = CARD_DB[c.cardId];
    if (G.cantAttackPermanent.has(c.instanceId)) return;
    if (c.tapped && !card.vigilance) return;
    if (c.sick) {
      if (card.haste) { candidates.push(c); return; }
      if (card.kakutou && c.entryTurn === G.turn && opp.field.length > 0) candidates.push(c);
      return;
    }
    candidates.push(c);
  });

  return candidates;
}

function playerAttackPhase() {
  const candidates = getAttackCandidates(0);

  if (candidates.length === 0) {
    // 攻撃可能なクリーチャーなし
    log('攻撃可能なクリーチャーがありません');
    G.playerChoosingAttackers = false;
    G.playerSelectedAttackers = [];
    aiAttackPhase();
    return;
  }

  // UI: 攻撃するクリーチャーを選択
  G.playerChoosingAttackers = true;
  G.playerSelectedAttackers = [];
  G.playerAttackCandidates = candidates;
  G.playerPassOption = true; // Pass/Hold オプション有効

  log('⚔️ 攻撃するクリーチャーを選択してください（またはパス）', 'important');
  render(); updateHints();
}

// ───────────────────────────────────────────────────────
// Pass/Hold - 攻撃しない判断
// ───────────────────────────────────────────────────────
function playerAttackPass() {
  if (!G.playerChoosingAttackers) return;
  G.playerChoosingAttackers = false;
  G.playerPassOption = false;
  G.playerSelectedAttackers = [];
  G.playerAttackOrder = [];
  log('攻撃をパスします。相手ターンへ移行します。', 'important');
  aiAttackPhase();
}

function togglePlayerAttacker(creatureInstId) {
  if (!G.playerChoosingAttackers) return;
  if (!G.playerSelectedAttackers) G.playerSelectedAttackers = [];

  const idx = G.playerSelectedAttackers.indexOf(creatureInstId);
  if (idx === -1) {
    // 追加
    G.playerSelectedAttackers.push(creatureInstId);
    log(`➕ 攻撃宣言: ${CARD_DB[G.players[0].field.find(c => c.instanceId === creatureInstId)?.cardId]?.name || 'クリーチャー'}`);
  } else {
    // 削除
    const card = CARD_DB[G.players[0].field.find(c => c.instanceId === creatureInstId)?.cardId];
    G.playerSelectedAttackers.splice(idx, 1);
    log(`❌ 攻撃取り消し: ${card?.name || 'クリーチャー'}`);
  }

  render(); updateHints();
}

function playerAttackConfirm() {
  if (!G.playerChoosingAttackers) return;

  G.playerChoosingAttackers = false;
  const p = G.players[0];

  // 選択されたクリーチャーをタップ
  G.playerSelectedAttackers.forEach(instId => {
    const c = p.field.find(x => x.instanceId === instId);
    if (c) {
      const card = CARD_DB[c.cardId];
      if (!card.vigilance) c.tapped = true;
      log(`攻撃宣言: ${card.name}`, 'important');
    }
  });

  // 攻撃順序選択フェーズへ
  if (G.playerSelectedAttackers.length > 0) {
    if (G.playerSelectedAttackers.length === 1) {
      // クリーチャー1体ならスキップ
      playerAttackQueueStart();
    } else {
      // 複数攻撃 → 順序選択UI
      playerAttackOrderSelect();
    }
  } else {
    log('攻撃なし → ターン終了');
    aiAttackPhase();
  }
}

// ───────────────────────────────────────────────────────
// 攻撃順序選択
// ───────────────────────────────────────────────────────
function playerAttackOrderSelect() {
  G.playerChoosingAttackOrder = true;
  G.playerAttackOrder = [...G.playerSelectedAttackers]; // デフォルト順序
  log('複数クリーチャーで攻撃します。攻撃順序を選択してください。');
  render();
}

function playerAttackOrderConfirm() {
  G.playerChoosingAttackOrder = false;
  playerAttackQueueStart();
}

function swapAttackOrder(idx1, idx2) {
  if (!G.playerAttackOrder) return;
  [G.playerAttackOrder[idx1], G.playerAttackOrder[idx2]] =
  [G.playerAttackOrder[idx2], G.playerAttackOrder[idx1]];
  render();
}

function playerAttackQueueStart() {
  // 人間プレイヤーの攻撃をキューに積む（順序付き）
  G._playerAttackQueue = [...(G.playerAttackOrder || G.playerSelectedAttackers)];
  setTimeout(() => continuePlayerAttack(), 400);
}

// 格闘解決後: 攻撃キュー進行中なら次の攻撃へ戻る（ブロック誘発の解決待ちがあればその後で）
function resumeAttackQueueAfterKakutou() {
  if (!G._kakutouFromQueue) return;
  G._kakutouFromQueue = false;
  if (G.awaitingPriority) {
    G.priorityContinuation = () => setTimeout(() => continuePlayerAttack(), 300);
  } else {
    setTimeout(() => continuePlayerAttack(), 400);
  }
}

function continuePlayerAttack() {
  if (G.phase === 'ended' || !G._playerAttackQueue || G._playerAttackQueue.length === 0) {
    // 人間の攻撃完了 → AI のターンへ移行
    aiAttackPhase();
    return;
  }

  const atkInstId = G._playerAttackQueue.shift();
  const p = G.players[0];
  const atkInst = p.field.find(c => c.instanceId === atkInstId);
  if (!atkInst) { setTimeout(() => continuePlayerAttack(), 100); return; }

  // 次の攻撃をAIブロック判定へ
  const card = CARD_DB[atkInst.cardId];

  // 格闘(出たターン): クリーチャーを対象に取って戦闘する。対象選択へ移行し、
  // 解決後にキューを再開する（render.jsの格闘クリック処理が_kakutouFromQueueを見て戻す）
  if (NET_MODE === 'local' && card.kakutou && atkInst.entryTurn === G.turn) {
    const reachable = G.players[1].field.filter(c => card.flying || !CARD_DB[c.cardId].flying);
    if (reachable.length === 0) {
      log(`${card.name} 格闘: 対象にできるクリーチャーがいないため攻撃できません`);
      setTimeout(() => continuePlayerAttack(), 200);
      return;
    }
    G.kakutouTargetMode = true;
    G.pendingKakutouInstId = atkInstId;
    G._kakutouFromQueue = true;
    log(`${card.name} 格闘: 攻撃対象のクリーチャーを選択してください`, 'important');
    render(); updateHints();
    return;
  }

  log(`プレイヤー: ${card.name} で攻撃`, 'important');

  // AI がブロック可能か確認して優先権を開く
  const eligible = G.players[1].field.filter(b => {
    const bc = CARD_DB[b.cardId];
    return (!b.tapped || (bc.ocBlockWhileTapped && isOCActive(1))) && canFlyBlock(atkInst, b);
  });

  if (eligible.length === 0) {
    // ブロック不可 → 直接ダメージ
    log(`${card.name} はブロック不可 → 直接ダメージ`, 'damage');
    G.players[1].life -= getEffectivePower(0, atkInst);
    showLifeChange(1, -getEffectivePower(0, atkInst));
    setTimeout(() => continuePlayerAttack(), 300);
  } else {
    // AI がブロック可能 → 優先権ウィンドウでAIがブロック判定
    G.aiCurrentAttackers = [{instId: atkInstId, targetType:'player', targetInstId:null}];
    G.playerBlockMode = false;  // AI がブロック決定
    G.aiBlockDefender = 0;       // プレイヤーを守備側
    G._pendingBlockAtkP = 0;     // 攻撃側がプレイヤー

    openPriorityWindow(1, () => {
      const blocker = pickAIBlockerFor(0, atkInstId);
      if (blocker) {
        G.combatArrows = [{fromId: atkInstId, toId: blocker.instanceId, color: '#ff4444'}];
        log(`AI: ${CARD_DB[blocker.cardId].name} でブロック`, 'defend');
        render();
        setTimeout(() => {
          resolveSingleCombat(0, atkInstId, null, blocker.instanceId);
          if (G.awaitingPriority) {
            // ブロック誘発の解決待ち → 解決が終わってから次の攻撃へ
            G.priorityContinuation = () => setTimeout(() => continuePlayerAttack(), 300);
          } else {
            setTimeout(() => continuePlayerAttack(), 400);
          }
        }, 400);
      } else {
        log(`${card.name} はブロック不可 → 直接ダメージ`, 'damage');
        G.players[1].life -= getEffectivePower(0, atkInst);
        showLifeChange(1, -getEffectivePower(0, atkInst));
        checkDeath();
        setTimeout(() => continuePlayerAttack(), 400);
      }
    }, `${card.name} へのブロック`);
  }
}

function aiAttackPhase() {
  // 元々の aiAttack() をここから呼ぶ
  aiAttack();
}

// ターン終了時のクリーチャー誘発（自分の終了ステップ）
// 安定性のため同期的に自動解決する
function fireEndTurnEffects(player) {
  const p = G.players[player];
  // フィールドのスナップショット（処理中の変化に影響されないよう）
  [...p.field].forEach(c => {
    const card = CARD_DB[c.cardId];
    if (!card || !card.endTurnEffect) return;
    // 場にまだ存在するか確認
    if (!p.field.find(x => x.instanceId === c.instanceId)) return;

    if (card.endTurnEffect === 'hakaatsume_look2split') {
      // 山札の上から2枚見て、1枚手札・1枚墓地（自動: 高コストを手札へ）
      if (p.deck.length === 0) return;
      const a = p.deck.shift();
      const b = p.deck.length > 0 ? p.deck.shift() : null;
      if (b === null) {
        addCardToHand(player, a);
        log(`${card.name} 終了時: ${CARD_DB[a]?.name}を手札に（山札残り0）`);
      } else {
        const ca = totalCost(CARD_DB[a]?.cost || {});
        const cb = totalCost(CARD_DB[b]?.cost || {});
        const keep = ca >= cb ? a : b;
        const mill = ca >= cb ? b : a;
        addCardToHand(player, keep);
        p.graveyard.push(mill);
        log(`${card.name} 終了時: ${CARD_DB[keep]?.name}を手札・${CARD_DB[mill]?.name}を墓地へ`);
      }
    } else if (card.endTurnEffect === 'taisei_c8_reanimate3') {
      // C8: 墓地からマナ総量3以下のクリーチャー1体を出す（自動: 最高コスト）
      if (getCXValue(player) < 8) return;
      if (p.field.length >= 5) return;
      const filter = cc => cc.type === 'creature' && totalCost(cc.cost || {}) <= 3;
      const cands = p.graveyard.map((cid,i)=>({cid,i,card:CARD_DB[cid]})).filter(({card})=>card&&filter(card));
      if (cands.length === 0) return;
      const best = cands.reduce((x,y)=> totalCost(y.card.cost||{}) > totalCost(x.card.cost||{}) ? y : x);
      p.graveyard.splice(best.i, 1);
      const inst = newInstance(best.cid); inst.sick = true; inst.entryTurn = G.turn;
      _enteringInstIds.add(inst.instanceId);
      p.field.push(inst);
      // 注: ターン終了処理中はスタックを解決しないため、リアニメイト時はETBを誘発しない
      log(`${card.name} C8終了時: ${best.card.name}を墓地から場に出した（ETBなし）`, 'important');
    }
  });
  render();
}

function endTurn() {
  // ターン終了時のクリーチャー誘発（終了プレイヤーの分）
  fireEndTurnEffects(G.activePlayer);
  // 中央にターン終了を表示
  const _endingP = G.activePlayer;
  const _endLabel = NET_MODE === 'hotseat' ? (_endingP === 0 ? 'P1' : 'P2')
    : NET_MODE !== 'local' ? (_endingP === NET_MY_IDX ? 'あなた' : '相手')
    : (_endingP === 0 ? 'あなた' : 'AI');
  showPhaseFlash('ターン終了', `${_endLabel}のターン`);
  // Clear temp buffs and any leftover modes
  G.tempBuffs = [];
  G.targetMode = null;
  G.kakutouTargetMode = false;
  G.pendingKakutouInstId = null;
  G.kakutouTargets = {};
  if (G.directlyAttackedCreatures) G.directlyAttackedCreatures.clear();
  G.kaizen_used_names.clear(); // 介善OCの「ターン1:同名」制限はターン毎にリセット
  G.players.forEach(p => {
    p.field.forEach(c => { c.tempPower = 0; c.tempToughness = 0; });
    p.mana = {R:0,U:0,G:0,W:0,B:0,C:0};
  });
  G.players[0].field.forEach(c => { c.noDamageKill = false; c._protectedThisTurn = false; });
  G.players[1].field.forEach(c => { c.noDamageKill = false; c._protectedThisTurn = false; });
  G.kaizenBlockDraw = -1;
  G.attackMode = false;
  G.blockMode = false;
  G.chargingMode = false;
  G.chargeUsedThisTurn = false;
  G.iegekiRedirectTurn = [-1, -1];

  G.activePlayer = 1 - G.activePlayer;
  G.turn++;
  G.drawCount = [0, 0];
  G.landPlacedThisTurn = 0;
  G.phase = 'untap';

  // 介善ブロック時ドロー: 「次の自分のターン開始時まで」→ 新アクティブプレイヤーの効果はここで失効
  if (!G.blockDrawActive) G.blockDrawActive = [false, false];
  if (G.blockDrawActive[G.activePlayer]) {
    G.blockDrawActive[G.activePlayer] = false;
    log('介善のブロック時ドロー効果が終了（自分のターン開始）');
  }

  // アーティファクト カウントダウン処理（アクティブプレイヤーのターン開始時）
  const ap = G.activePlayer;
  {
    const arts = G.players[ap].artifacts;
    if (arts && arts.length > 0) {
      for (let i = arts.length - 1; i >= 0; i--) {
        arts[i].countdown--;
        log(`${arts[i].name}: カウントダウン → ${arts[i].countdown}`);
        if (arts[i].countdown <= 0) {
          const art = arts.splice(i, 1)[0];
          triggerArtifactLeave(ap, art);
        }
      }
      render();
    }
  }
  const apName = NET_MODE === 'hotseat' ? (ap === 0 ? 'P1のターン' : 'P2のターン')
    : NET_MODE !== 'local' ? (ap === NET_MY_IDX ? 'あなたのターン' : '相手のターン')
    : (ap === 0 ? 'あなたのターン' : 'AIのターン');
  showPhaseFlash(`ターン ${G.turn}`, apName);
  const apLabel = NET_MODE === 'hotseat' ? (ap === 0 ? 'P1' : 'P2') : ap === 0 ? 'プレイヤー' : 'AI';
  log(`--- ターン${G.turn} ${apLabel}のターン ---`, 'important');
  recordReplaySnapshot(`ターン${G.turn} ${apName}`);

  // Untap
  untapAll(ap);

  // 「このゲーム中、可能なら攻撃する」クリーチャー(家撃！OC等)は毎ターン攻撃強制を再付与
  G.players[ap].field.forEach(c => {
    if (c.alwaysMustAttack) { c.mustAttack = true; G.mustAttackCreatures.add(c.instanceId); }
  });

  // 直前のターンを終えたプレイヤー(1-ap)のmustAttackをクリア。
  // アクティブプレイヤー(ap)側はETBで付与された攻撃強制が残っているためクリアしない。
  const prevAp = 1 - ap;
  G.players[prevAp].field.forEach(c => { c.mustAttack = false; G.mustAttackCreatures.delete(c.instanceId); });

  // アレスティア passive: 相手がアレスティアを持つ → アクティブプレイヤーのクリーチャーはmustAttack
  // 両者アレスティアの場合も一方向のみ（アクティブ側に適用）
  const opp = prevAp;
  const oppHasArestia = G.players[opp].field.some(c=>CARD_DB[c.cardId].id==='arestia');
  if (oppHasArestia) {
    G.players[ap].field.forEach(c => {
      if (!c.tapped && !c.sick) { c.mustAttack = true; G.mustAttackCreatures.add(c.instanceId); }
    });
  }

  G.phase = 'draw';
  placeLands(ap, 2);
  // 先行（firstPlayer）の最初のターンのみドローなし。後手の1ターン目は引ける。
  const isFirstPlayerFirstTurn = (ap === G.firstPlayer && G.turn === 1);
  if (!isFirstPlayerFirstTurn) drawCard(ap);
  G.firstTurn = false; // 旧フラグも互換のため更新

  // オムニエル / アーカOC ターン開始時効果
  G.players[ap].field.forEach(c => {
    const card = CARD_DB[c.cardId];
    if (!card) return;
    if (card.id === 'omnieru') {
      const p2 = G.players[ap];
      while (p2.hand.length < 5 && p2.deck.length > 0) {
        const cid = p2.deck.shift();
        addCardToHand(ap, cid);
        G.drawCount[ap]++;
      }
      if (p2.hand.length > 5) {
        const excess = p2.hand.splice(5);
        excess.forEach(cid => p2.deck.push(cid));
      }
      log(`${card.name} ターン開始時: 手札を5枚に調整`);
    }
    if (card.id === 'aaka' && isOCActive(ap)) {
      drawCard(ap);
      log(`${card.name} OC ターン開始時: 1枚引く`);
    }
  });

  G.phase = 'main';
  render();

  // メインフェイズ開始前に非ターンプレイヤーへ優先権
  const nonTurn = 1 - ap;
  openPriorityWindow(nonTurn, () => {
    if (ap === 1) {
      if (NET_MODE === 'hotseat') {
        hotseatShowPass(1);
      } else if (NET_MODE !== 'local') {
        log('相手のターンです（オンライン）');
        netPostTurnEnd();
      } else {
        setTimeout(aiTurn, 300);
      }
    } else {
      if (NET_MODE === 'hotseat' && G.turn > 1) {
        hotseatShowPass(0);
      } else {
        log('あなたのメインフェイズ');
        document.getElementById('btn-mulligan').disabled = true;
        updateHints();
      }
    }
  }, 'ターン開始時');
  netPostTurnEnd();
}

// ============================================================
// CHARGE SYSTEM
// ============================================================
function startCharge() {
  if (SPECTATOR_MODE) return; // 観戦モード中は操作不可
  if (NET_MODE === 'guest') { netSendAction('charge', {}); return; }
  // チャージは自分のターンのみ可能 → 操作主体は常にアクティブプレイヤー
  // (local: ボタンはP0のターンのみ有効 / host: ゲストの中継はゲストのターンのみ)
  const charger = NET_MODE === 'local' ? 0 : G.activePlayer;
  if (G.activePlayer !== charger) { log('あなたのターンではありません'); return; }
  if (G.phase !== 'main') { log('メインフェイズ中のみチャージできます'); return; }
  if (G.chargeUsedThisTurn) { log('チャージはターンに1回のみです'); return; }
  if (G.players[charger].hand.length === 0) { log('手札がありません'); return; }

  // Check if any land can still be charged
  const validLands = G.players[charger].lands.filter(l => !l.chargeCard);
  if (validLands.length === 0) { log('チャージできる土地がありません'); return; }

  G.chargingMode = true;
  log('チャージするカードを手札から選んでください');
  render(); updateHints();
}

function doCharge(handIndex) {
  const charger = NET_MODE === 'local' ? 0 : G.activePlayer;
  const p = G.players[charger];
  if (handIndex < 0 || handIndex >= p.hand.length) { log('カードインデックスが無効です'); return; }
  const cardId = p.hand[handIndex];
  // Now need to pick a land
  G.chargingMode = 'pick_land';
  G.selectedCard = {owner: charger, zone: 'hand', index: handIndex};
  log('土地を選んでください（チャージカードを置く）');
  render(); updateHints();
}

function chargeToLand(landInstId) {
  const charger = NET_MODE === 'local' ? 0 : G.activePlayer;
  const p = G.players[charger];
  const land = p.lands.find(l => l.instanceId === landInstId);
  if (!land || land.chargeCard) {
    log('その土地にはチャージできません');
    G.chargingMode = false;
    G.selectedCard = null;
    render(); updateHints();
    return;
  }
  if (!G.selectedCard) { log('チャージするカードが選択されていません'); return; }
  const hi = G.selectedCard.index;
  if (hi < 0 || hi >= p.hand.length) { log('カードインデックスが無効です'); return; }
  const cardId = p.hand[hi];
  p.hand.splice(hi, 1);
  land.chargeCard = cardId;
  land.tapped = false; // チャージで土地をアンタップ（再起動可能）
  G.chargingMode = false;
  G.selectedCard = null;
  G.chargeUsedThisTurn = true;
  log(`チャージ: ${CARD_DB[cardId].name} を土地に置き、土地をアンタップ`);
  // wasure_heichi: draw 1 when charged
  const landCard = CARD_DB[land.cardId];
  if (landCard.chargeDrawTrigger) {
    drawCard(charger);
    log(`${landCard.name}: カードを1枚引く`);
  }
  fireLandEntersTriggers(charger);
  render(); updateHints();
}

// チャージ不要のタップ起動能力（実験場の +1/+1 など）。土地をタップして部品(FX)を実行する。
// 効果本体は card-effects.js の FX に集約し、ここは「タップ＋対象選択」の段取りだけ担う。
function activateLandTapAbility(player, instId) {
  const p = G.players[player];
  const land = p.lands.find(l => l.instanceId === instId);
  if (!land || land.tapped) { log('その土地はタップ済みです'); return; }
  const landCard = CARD_DB[land.cardId];
  if (!landCard || !landCard.tapAbility) return;
  if (landCard.tapAbility === 'buffPlus11') {
    if (p.field.length === 0) { log(`${landCard.name}: 強化する自分のクリーチャーがいません`); return; }
    G.targetMode = { type:'ownCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      land.tapped = true;
      FX.buffCreature(player, tgt.instId, 1, 1); // 効果の本体は部品に集約
      log(`${landCard.name}: 自分のクリーチャーを+1/+1（永続）`, 'important');
      render(); updateHints();
    }};
    log(`${landCard.name}: +1/+1する自分のクリーチャーを選択してください`);
    render(); updateHints();
  }
}

function activateChargedLand(player, instId) {
  const p = G.players[player];
  const land = p.lands.find(l => l.instanceId === instId);
  if (!land || !land.chargeCard) return;
  const landCard = CARD_DB[land.cardId];
  if (!landCard.chargedAbility) return;
  const opp = 1-player;

  if (landCard.chargedAbility === 'look3keep1white') {
    // Cost: タップ(この土地) + W3
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {W:3})) { log('マナ不足 (白3)'); return; }
    land.tapped = true;
    payMana(player, {W:3});
    log(`${landCard.name}: 3ルック1(白) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { doLook3Keep1White(player); render(); updateHints(); continueStack(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'lookKeepWhite') {
    // Cost: タップ(この土地) + W2
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {W:2})) { log('マナ不足 (白2)'); return; }
    const n = landCard.chargeLookCount || 3;
    land.tapped = true;
    payMana(player, {W:2});
    log(`${landCard.name}: ${n}ルック1(白) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(${n}ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { G._lookCont = () => continueStack(); doLookKeepColored(player, n, 'W'); render(); updateHints(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'kaizouReturn') {
    // shigen_heichi: OC + tap -> produce WW, send to land deck bottom
    if (!isOCActive(player)) { log('OC未達成'); return; }
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name} 還元: スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(還元WW)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        p.mana.W = (p.mana.W||0)+3;
        const idx = p.lands.findIndex(l=>l.instanceId===instId);
        if (idx !== -1) { p.lands.splice(idx,1); p.landDeck.push(land.cardId); }
        log(`${landCard.name} 還元: WW追加、土地デッキ底へ`, 'heal');
        render(); updateHints(); continueStack();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'damage5opponent') {
    // kemono_heichi: 自身を土地デッキ底へ送り → 相手クリーチャーに5ダメージ
    const lIdx = p.lands.findIndex(l=>l.instanceId===instId);
    if (lIdx === -1) return;
    p.lands.splice(lIdx, 1);
    p.landDeck.push(landCard.id);
    if (land.chargeCard) p.exile.push(land.chargeCard);
    log(`${landCard.name} 還元: 土地デッキ底へ → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(5ダメージ)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        if (G.players[opp].field.length === 0) { log(`${landCard.name} 還元: 対象なしのためスキップ`); render(); updateHints(); continueStack(); return; }
        G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
          applyDamageToCreature(opp, tgt.instId, 5, player);
          log(`${landCard.name} 還元: 5ダメージ`, 'damage');
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('対象を選択（5ダメージ）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'damage3opponentDraw') {
    // kemono_heichi: 自身を土地デッキ底へ送り → 相手クリーチャーに3ダメージ。その後1枚引く
    const lIdx = p.lands.findIndex(l=>l.instanceId===instId);
    if (lIdx === -1) return;
    p.lands.splice(lIdx, 1);
    p.landDeck.push(landCard.id);
    if (land.chargeCard) p.exile.push(land.chargeCard);
    log(`${landCard.name} 還元: 土地デッキ底へ → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ダメージ)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        if (G.players[opp].field.length === 0) {
          log(`${landCard.name} 還元: 対象なしのためスキップ`);
          drawCard(player);
          log(`${landCard.name} 還元: その後、1枚引く`);
          render(); updateHints(); continueStack(); return;
        }
        G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
          applyDamageToCreature(opp, tgt.instId, 3, player);
          log(`${landCard.name} 還元: 3ダメージ`, 'damage');
          drawCard(player);
          log(`${landCard.name} 還元: その後、1枚引く`);
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('対象を選択（3ダメージ）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'look3keep1red') {
    // hito_yama: cost タップ + R3 -> 3ルック1(赤)
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {R:3})) { log('マナ不足 (赤3)'); return; }
    land.tapped = true;
    payMana(player, {R:3});
    log(`${landCard.name}: 3ルック1(赤) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { G._lookCont = () => continueStack(); doLookKeepColored(player, 3, 'R'); render(); updateHints(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'kaizouReturnRed') {
    // shigen_yama: OC + tap -> produce RRR, send to land deck bottom
    if (!isOCActive(player)) { log('OC未達成'); return; }
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name} 還元: スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(還元RRR)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        p.mana.R = (p.mana.R||0)+3;
        const idx = p.lands.findIndex(l=>l.instanceId===instId);
        if (idx !== -1) { p.lands.splice(idx,1); p.landDeck.push(land.cardId); }
        log(`${landCard.name} 還元: 赤3追加、土地デッキ底へ`, 'heal');
        render(); updateHints(); continueStack();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'giveKakutouBuffRed') {
    // daikazoku_ie: tap -> give own red creature 格闘 + +1/+0 permanent
    if (land.tapped) { log('タップ済み'); return; }
    const reds = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'R');
    if (reds.length === 0) { log(`${landCard.name}: 赤クリーチャーがいません`); return; }
    land.tapped = true;
    log(`${landCard.name}: 赤クリーチャーに格闘＋1/+0 → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(格闘+1/+0)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        const rs = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'R');
        if (rs.length === 0) { log(`${landCard.name}: 赤クリーチャーなし`); continueStack(); return; }
        G.targetMode = { type:'ownCreature', sourcePlayer: player, aiPick: pool => pool.filter(c => CARD_DB[c.cardId].color === 'R').reduce((a,b) => getEffectivePower(player,b) > getEffectivePower(player,a) ? b : a), callback:(tgt) => {
          const tc = G.players[player].field.find(x => x.instanceId === tgt.instId);
          if (tc && CARD_DB[tc.cardId].color === 'R') {
            addPermanentBuff(player, tgt.instId, 1, 0);
            tc.grantedKakutouTurn = G.turn;
            log(`${landCard.name}: 赤クリーチャーに格闘＋1/+0（このターン格闘可能）`);
          }
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('赤クリーチャーを選択（格闘＋1/+0）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'buffWhiteCreature') {
    // serashia_miyako: tap -> give own white creature +0/+2 permanent
    if (land.tapped) { log('タップ済み'); return; }
    const whites = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'W');
    if (whites.length === 0) { log(`${landCard.name}: 白クリーチャーがいません`); return; }
    land.tapped = true;
    log(`${landCard.name}: 白クリーチャー+0/+2 → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(白+0/+2)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        const ws = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'W');
        if (ws.length === 0) { log(`${landCard.name}: 白クリーチャーなし`); continueStack(); return; }
        G.targetMode = { type:'ownCreature', sourcePlayer: player, aiPick: pool => pool.filter(c => CARD_DB[c.cardId].color === 'W').reduce((a,b) => getEffectiveToughness(player,b) < getEffectiveToughness(player,a) ? b : a), callback:(tgt) => {
          const tc = G.players[player].field.find(x => x.instanceId === tgt.instId);
          if (tc && CARD_DB[tc.cardId].color === 'W') {
            addPermanentBuff(player, tgt.instId, 0, 2);
            log(`${landCard.name}: 白クリーチャー+0/+2(永続)`);
          }
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('白クリーチャーを選択（+0/+2永続）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'buffWhiteCreatureDraw') {
    // serashia_miyako: tap -> give own white creature +0/+3 permanent. その後1枚引く
    if (land.tapped) { log('タップ済み'); return; }
    const whites = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'W');
    if (whites.length === 0) { log(`${landCard.name}: 白クリーチャーがいません`); return; }
    land.tapped = true;
    log(`${landCard.name}: 白クリーチャー+0/+3 → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(白+0/+3)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        const ws = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'W');
        if (ws.length === 0) {
          log(`${landCard.name}: 白クリーチャーなし`);
          drawCard(player);
          log(`${landCard.name}: その後、1枚引く`);
          render(); updateHints(); continueStack(); return;
        }
        G.targetMode = { type:'ownCreature', sourcePlayer: player, aiPick: pool => pool.filter(c => CARD_DB[c.cardId].color === 'W').reduce((a,b) => getEffectiveToughness(player,b) < getEffectiveToughness(player,a) ? b : a), callback:(tgt) => {
          const tc = G.players[player].field.find(x => x.instanceId === tgt.instId);
          if (tc && CARD_DB[tc.cardId].color === 'W') {
            addPermanentBuff(player, tgt.instId, 0, 3);
            log(`${landCard.name}: 白クリーチャー+0/+3(永続)`);
          }
          drawCard(player);
          log(`${landCard.name}: その後、1枚引く`);
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('白クリーチャーを選択（+0/+3永続）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'look3keep1blue') {
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {U:3})) { log('マナ不足 (青3)'); return; }
    land.tapped = true;
    payMana(player, {U:3});
    log(`${landCard.name}: 3ルック1(青) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { G._lookCont = () => continueStack(); doLookKeepColored(player, 3, 'U'); render(); updateHints(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'kaizouReturnBlue') {
    if (!isOCActive(player)) { log('OC未達成'); return; }
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name} 還元: スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(還元UUU)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        p.mana.U = (p.mana.U||0)+3;
        const idx = p.lands.findIndex(l=>l.instanceId===instId);
        if (idx !== -1) { p.lands.splice(idx,1); p.landDeck.push(land.cardId); }
        log(`${landCard.name} 還元: 青3追加、土地デッキ底へ`, 'heal');
        render(); updateHints(); continueStack();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'giveDrawTriggerBlue') {
    if (land.tapped) { log('タップ済み'); return; }
    const blues = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'U');
    if (blues.length === 0) { log(`${landCard.name}: 青クリーチャーがいません`); return; }
    land.tapped = true;
    log(`${landCard.name}: 青クリーチャーに「攻撃時1枚引く」 → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(攻撃時ドロー)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        const bs = G.players[player].field.filter(c => CARD_DB[c.cardId].color === 'U');
        if (bs.length === 0) { log(`${landCard.name}: 青クリーチャーなし`); continueStack(); return; }
        G.targetMode = { type:'ownCreature', sourcePlayer: player,
          aiPick: pool => pool.filter(c => CARD_DB[c.cardId].color === 'U').reduce((a,b) => getEffectivePower(player,b) > getEffectivePower(player,a) ? b : a),
          callback:(tgt) => {
            const tc = G.players[player].field.find(x => x.instanceId === tgt.instId);
            if (tc && CARD_DB[tc.cardId].color === 'U') {
              tc.grantedDrawOnAttackTurn = G.turn;
              log(`${landCard.name}: ${CARD_DB[tc.cardId].name}に「攻撃時1枚引く」を付与（このターン）`);
            }
            G.targetMode = null; render(); updateHints();
            continueStack();
          }};
        log('青クリーチャーを選択（攻撃時1枚引く）');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'look3keep1black') {
    // 人住まう沼: タップ + 黒3 → 3ルック1(黒)
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {B:3})) { log('マナ不足 (黒3)'); return; }
    land.tapped = true;
    payMana(player, {B:3});
    log(`${landCard.name}: 3ルック1(黒) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { G._lookCont = () => continueStack(); doLookKeepColored(player, 3, 'B'); render(); updateHints(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'kaizouReturnBlack') {
    // 資源豊富な沼: OC + tap → 黒3生成、土地デッキ底へ
    if (!isOCActive(player)) { log('OC未達成'); return; }
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name} 還元: スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(還元BBB)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        p.mana.B = (p.mana.B||0)+3;
        const idx = p.lands.findIndex(l=>l.instanceId===instId);
        if (idx !== -1) { p.lands.splice(idx,1); p.landDeck.push(land.cardId); }
        log(`${landCard.name} 還元: 黒3追加、土地デッキ底へ`, 'heal');
        render(); updateHints(); continueStack();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'look3keep1green') {
    // 人住まう森: タップ + 緑3 → 3ルック1(緑)
    if (land.tapped) { log(`${landCard.name}: タップ済みのため起動できません`); return; }
    if (!canAfford(player, {G:3})) { log('マナ不足 (緑3)'); return; }
    land.tapped = true;
    payMana(player, {G:3});
    log(`${landCard.name}: 3ルック1(緑) → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(3ルック1)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => { G._lookCont = () => continueStack(); doLookKeepColored(player, 3, 'G'); render(); updateHints(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  } else if (landCard.chargedAbility === 'kaizouReturnGreen') {
    // 資源豊富な森: OC + tap → 緑3生成、土地デッキ底へ
    if (!isOCActive(player)) { log('OC未達成'); return; }
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name} 還元: スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(還元GGG)`,
      icon: landCard.icon || '✨',
      owner: player,
      resolve: () => {
        p.mana.G = (p.mana.G||0)+3;
        const idx = p.lands.findIndex(l=>l.instanceId===instId);
        if (idx !== -1) { p.lands.splice(idx,1); p.landDeck.push(land.cardId); }
        log(`${landCard.name} 還元: 緑3追加、土地デッキ底へ`, 'heal');
        render(); updateHints(); continueStack();
      }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 還元起動`);
  } else if (landCard.chargedAbility === 'untapOtherLand') {
    // 祭りの会場: タップ → この土地以外の土地を1つアンタップ
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    const otherTapped = p.lands.filter(l => l.instanceId !== instId && l.tapped);
    if (otherTapped.length === 0) { log(`${landCard.name}: アンタップできる土地がない`); render(); return; }
    const target = otherTapped[0];
    target.tapped = false;
    log(`${landCard.name}: ${CARD_DB[target.cardId].name}をアンタップ`, 'heal');
    render(); updateHints();
  } else if (landCard.chargedAbility === 'mill4') {
    // 荒れた墓: タップ → 自分の山札から4枚墓地に置く
    if (land.tapped) { log('タップ済み'); return; }
    land.tapped = true;
    log(`${landCard.name}: 切削4 → スタックに積む`);
    G.stack.push({
      name: `${landCard.name} 起動(切削4)`,
      icon: landCard.icon || '⚰️',
      owner: player,
      resolve: () => { millCards(player, 4); render(); updateHints(); continueStack(); }
    });
    renderStack();
    openPriorityWindow(opp, null, `${landCard.name} 起動`);
  }
}

// ============================================================
// COMBAT
// ============================================================
function getEffectivePower(player, inst) {
  const card = CARD_DB[inst.cardId];
  const pb = getPermanentBuff(inst.instanceId);
  return card.power + (inst.tempPower||0) + pb.power + getCXBonus(player, inst).power;
}
function getEffectiveToughness(player, inst) {
  const card = CARD_DB[inst.cardId];
  const pb = getPermanentBuff(inst.instanceId);
  return card.toughness + (inst.tempToughness||0) + pb.toughness + getCXBonus(player, inst).toughness;
}

function toggleAttacker(instId) {
  const p = G.players[0];
  const creature = p.field.find(c => c.instanceId === instId);
  if (!creature) return;
  if (!canCreatureAttack(0, creature)) return;
  const card = CARD_DB[creature.cardId];
  const idx = p.attackers.indexOf(instId);
  if (idx === -1) {
    p.attackers.push(instId);
    if (!card.vigilance) creature.tapped = true;
    log(`攻撃宣言: ${card.name}`);
    // 格闘: 出たターンはクリーチャーを対象に選ぶ
    if (card.kakutou && creature.entryTurn === G.turn) {
      // 対象可能クリーチャー確認 (飛行制限込み)
      const reachable = G.players[1].field.filter(c => card.flying || !CARD_DB[c.cardId].flying);
      if (reachable.length === 0) {
        // 対象なし → 攻撃取り消し
        p.attackers.splice(p.attackers.indexOf(instId), 1);
        if (!card.vigilance) creature.tapped = false;
        log('格闘: 対象にできるクリーチャーがいません');
        render(); updateHints();
        return;
      }
      G.kakutouTargetMode = true;
      G.pendingKakutouInstId = instId;
      log('格闘: 攻撃対象のクリーチャーを選択してください');
    }
  } else {
    p.attackers.splice(idx, 1);
    if (!card.vigilance) creature.tapped = false;
    delete G.kakutouTargets[instId];
    G.kakutouTargetMode = false;
    G.pendingKakutouInstId = null;
  }
  render(); updateHints();
}

function canFlyBlock(attackerInst, blockerInst) {
  const atkCard = CARD_DB[attackerInst.cardId];
  const blkCard = CARD_DB[blockerInst.cardId];
  const atkFlying = atkCard.flying || false;
  const blkFlying = blkCard.flying || false;
  // Flying attacker can only be blocked by flying
  if (atkFlying && !blkFlying) return false;
  // Non-flying blocker can block non-flying
  return true;
}

function aiDeclareBlockers() {
  const ai = G.players[1];
  const player = G.players[0];
  player.blockers = {};
  const attackerInsts = player.attackers.map(id => player.field.find(c=>c.instanceId===id)).filter(Boolean);
  if (attackerInsts.length === 0) return;

  // MCTSで最善のブロック割り当てを決定
  showAIThinking(true);
  const assignment = mctsPickBlockers(attackerInsts); // {atkInstId: blkInstId}
  showAIThinking(false);
  const usedBlockers = new Set();
  for (const [atkId, blkId] of Object.entries(assignment)) {
    if (usedBlockers.has(blkId)) continue;
    const attacker = player.field.find(c=>c.instanceId===atkId);
    const blocker = ai.field.find(c=>c.instanceId===blkId);
    if (!attacker || !blocker) continue;
    if (!canFlyBlock(attacker, blocker)) continue;
    player.blockers[atkId] = [blkId];
    usedBlockers.add(blkId);
    log(`AIブロック(MCTS): ${CARD_DB[blocker.cardId].name} が ${CARD_DB[attacker.cardId].name} をブロック`);
  }
}

function resolveCombat() {
  const player = G.players[0];
  const ai = G.players[1];
  G.combatBlockersAlive = {};

  // アレスティア passive: if AI has arestia and player attacks, player's creatures all got +1/+1 temp (already applied in startCombat)

  player.attackers.forEach(atkId => {
    const attacker = player.field.find(c => c.instanceId === atkId);
    if (!attacker) return;
    const atkCard = CARD_DB[attacker.cardId];
    const atkPow = getEffectivePower(0, attacker);
    const blockerIds = player.blockers[atkId] || [];

    if (blockerIds.length === 0) {
      // 格闘: 出たターンはクリーチャーのみ攻撃、対象クリーチャーに直接ダメージ
      if (atkCard.kakutou && attacker.entryTurn === G.turn) {
        const tgtId = G.kakutouTargets[atkId];
        const tgtInst = tgtId ? ai.field.find(c=>c.instanceId===tgtId) : null;
        if (tgtInst) {
          const tgtPow = getEffectivePower(1, tgtInst);
          tgtInst.damage += atkPow;
          attacker.damage += tgtPow;
          // 接死: ダメージ>0なら相手を破壊フラグ
          if (atkCard.deathtouch && atkPow > 0) tgtInst._deathtouched = true;
          if (CARD_DB[tgtInst.cardId].deathtouch && tgtPow > 0) attacker._deathtouched = true;
          log(`${atkCard.name} (格闘) が ${CARD_DB[tgtInst.cardId].name} に${atkPow}ダメージ`, 'damage');
          checkCreatureDeath(1, tgtId, 0);
          checkCreatureDeath(0, atkId, 1);
        }
        return;
      }
      ai.life -= atkPow;
      showFloatDamage(atkPow, 'ai');
      log(`${atkCard.name} が${atkPow}ダメージを与えた`, 'damage');
    } else {
      blockerIds.forEach(blkId => {
        const blocker = ai.field.find(c => c.instanceId === blkId);
        if (!blocker) return;
        const blkCard = CARD_DB[blocker.cardId];
        const blkPow = getEffectivePower(1, blocker);

        blocker.damage += atkPow;
        attacker.damage += blkPow;

        // 接死: ダメージ>0で相手を破壊フラグ
        if (atkCard.deathtouch && atkPow > 0) blocker._deathtouched = true;
        if (blkCard.deathtouch && blkPow > 0) attacker._deathtouched = true;

        // 貫通: 超過ダメージは相手プレイヤーへ
        if (atkCard.trample) {
          const blkTou = getEffectiveToughness(1, blocker);
          const excess = Math.max(0, atkPow - blkTou);
          if (excess > 0) { ai.life -= excess; showFloatDamage(excess, 'ai'); log(`${atkCard.name} 貫通: ${excess}超過ダメージ`, 'damage'); }
        }

        const blockerDied = checkCreatureDeath(1, blkId, 0);
        G.combatBlockersAlive[blkId] = !blockerDied;

        // onBlock triggers → push to stack (AI blocker)
        const _blkId = blkId, _atkId = atkId;
        if (blkCard.onBlock === 'damage2attacker' || blkCard.onBlock === 'damage2attackerAndCopy') {
          triggerEffect(`${blkCard.name} ブロック誘発(2ダメージ)`, blkCard.icon||'✨', 1, () => {
            const atkNow = player.field.find(c=>c.instanceId===_atkId);
            if (atkNow) { atkNow.damage += 2; log(`${blkCard.name} ブロック: 攻撃クリーチャーに2ダメージ`, 'damage'); checkDeath(); render(); }
          });
        }
        if (blkCard.onBlock === 'damage2attackerAndCopy') {
          triggerEffect(`${blkCard.name} コピー誘発(AI)`, blkCard.icon||'🛡️', 1, () => {
            const blkNow = ai.field.find(c=>c.instanceId===_blkId);
            if (blkNow && getEffectiveToughness(1, blkNow) > 1) { spawnCopyWithReducedToughness(1, _blkId); }
          });
        }
        if (blkCard.onBlockCopy) {
          const copyCount = typeof blkCard.onBlockCopy === 'number' ? blkCard.onBlockCopy : 1;
          for (let i = 0; i < copyCount; i++) {
            triggerEffect(`${blkCard.name} コピー誘発${copyCount > 1 ? ` (${i+1}/${copyCount})(AI)` : '(AI)'}`, blkCard.icon||'🛡️', 1, () => {
              const blkNow = ai.field.find(c=>c.instanceId===_blkId);
              if (blkNow && getEffectiveToughness(1, blkNow) > 1) { spawnCopyWithReducedToughness(1, _blkId); }
              continueStack();
            });
          }
        }
        if (blkCard.onBlock === 'draw1') {
          triggerEffect(`${blkCard.name} ブロック誘発(1ドロー)`, blkCard.icon||'✨', 1, () => {
            drawCard(1); log(`AI ${blkCard.name} ブロック: 1ドロー`); continueStack();
          });
        }
        if (blkCard.onBlock === 'gain3life') {
          triggerEffect(`${blkCard.name} ブロック誘発(回復)`, blkCard.icon||'✨', 1, () => {
            ai.life += 3; showLifeChange(1, +3); log(`AI ${blkCard.name} ブロック: ライフ3回復`, 'heal'); continueStack();
          });
        }
        if (blkCard.cx8Block === 'buff1ally' && getCXValue(1) >= 8) {
          triggerEffect(`${blkCard.name} C8ブロック誘発`, blkCard.icon||'✨', 1, () => {
            const allies = ai.field.filter(c=>c.instanceId!==_blkId);
            if (allies.length > 0) { addPermanentBuff(1, allies[0].instanceId, 1, 1); log(`AI ${blkCard.name} C8ブロック: 味方+1/+1`); }
            continueStack();
          });
        }
        if (G.blockDrawActive && G.blockDrawActive[1]) {
          triggerEffect('介善 誘発(ブロック時1ドロー)', '✨', 1, () => {
            drawCard(1); log('AI 介善: ブロック時1ドロー'); continueStack();
          });
        }
      });
      checkCreatureDeath(0, atkId, 1);
    }
  });

  // アレスティア block-completion: 削除 (アレスティアはonAttackCopyに変更)

  // Vigilance: untap vigilant attackers
  player.attackers.forEach(atkId => {
    const atk = player.field.find(c=>c.instanceId===atkId);
    if (atk && CARD_DB[atk.cardId].vigilance) { atk.tapped = false; }
  });

  checkDeath();
  G.players[0].attackers = [];
  G.players[0].blockers = {};
  G.attackMode = false;
  G.phase = 'main';
  render();
  if (G.stack.length > 0) {
    openPriorityWindow(1, () => setTimeout(() => endTurnAfterMainPhase(), 400), '戦闘誘発効果');
  } else {
    setTimeout(() => endTurnAfterMainPhase(), 400);
  }
}

function getCXBonus(player, creature) {
  const card = CARD_DB[creature.cardId];
  if (!card.keywords) return {power:0, toughness:0};
  const cx = getCXValue(player);
  if (card.id === 'bastian' && card.cx8Buff && cx >= 8) return {power:3, toughness:3};
  if (card.cx8Buff33 && cx >= 8) return {power:3, toughness:3};
  if (card.ocBuff44 && isOCActive(player)) return {power:4, toughness:4};
  return {power:0, toughness:0};
}

function getCXValue(player) {
  const p = G.players[player];
  let landCount = p.lands.length;
  let chargeCount = p.lands.filter(l => l.chargeCard).length;
  return landCount + chargeCount;
}

function isOCActive(player) {
  return getCXValue(player) >= 10;
}

// ============================================================
// PRIORITY WINDOW SYSTEM
// ============================================================

function triggerEffect(name, icon, owner, resolveFn) {
  G.stack.push({ name, icon: icon||'✨', owner, resolve: resolveFn });
  renderStack();
}

// ============================================================
// ATTACK TRIGGERS (攻撃時 / 自分のクリーチャーのアタック時)
// 通常攻撃の宣言時、戦闘前の優先権ウィンドウで解決される
// ============================================================
function fireAttackTriggers(player, atkInstId) {
  const p = G.players[player];
  const opp = 1 - player;
  const atk = p.field.find(c => c.instanceId === atkInstId);
  if (!atk) return;

  // 0) 守備側の「相手の攻撃時」誘発（セラシアの僧侶など）
  G.players[opp].field.forEach(c => {
    const cc = CARD_DB[c.cardId];
    if (cc.onOpponentAttack === 'damage2opponent') {
      triggerEffect(`${cc.name} 誘発（相手の攻撃時）`, cc.icon || '🙏', opp, () => {
        if (p.field.length === 0) { log(`${cc.name}: 対象なし`); render(); updateHints(); return; }
        G.targetMode = { type:'opponentCreature', sourcePlayer: opp, callback:(tgt) => {
          G.targetMode = null;
          applyDamageToCreature(player, tgt.instId, 2, opp);
          log(`${cc.name}: 相手クリーチャーに2ダメージ`, 'damage');
          // 裏目学習E: AIの攻撃がこの誘発で罰されたら記憶（次から警戒）
          if (player === 1 && typeof recordUrameEvent === 'function') recordUrameEvent(cc.id, 'attackTrigger');
          checkDeath(); render(); updateHints(); continueStack();
        }};
        log(`${cc.name}: 2ダメージの対象を選択`);
        render(); updateHints();
      });
    }
  });

  // 1) 味方のアタックに反応する常在誘発（メグル・ミチルC6 など、攻撃クリーチャー自身も含む）
  p.field.forEach(c => {
    const cc = CARD_DB[c.cardId];
    if (cc.onAllyAttack === 'meguruAllDamage') {
      triggerEffect(`${cc.name} 誘発（味方の攻撃）`, cc.icon || '😊', player, () => {
        [...G.players[opp].field].forEach(t => applyDamageToCreature(opp, t.instanceId, 1, player));
        G.players[opp].life -= 1; showLifeChange(opp, -1);
        drawCard(player);
        log(`${cc.name}: 相手クリーチャーとプレイヤー全てに1ダメージ＋1ドロー`, 'damage');
        checkDeath(); render(); updateHints();
      });
    } else if (cc.onAllyAttack === 'michiruC6Draw' && getCXValue(player) >= 6) {
      if (p.hand.length <= 4) {
        triggerEffect(`${cc.name} C6誘発`, cc.icon || '⚔️', player, () => {
          drawCard(player);
          log(`${cc.name} C6: 手札4枚以下のため1ドロー`);
          render(); updateHints();
        });
      }
    }
  });

  // 2) 攻撃クリーチャー自身の「攻撃時」効果
  const card = CARD_DB[atk.cardId];
  const dmgToCreature = (label, amount) => {
    triggerEffect(`${card.name} ${label}`, card.icon || '⚔️', player, () => {
      if (G.players[opp].field.length === 0) { log(`${card.name} ${label}: 対象なし`); return; }
      G.targetMode = { type:'opponentCreature', sourcePlayer: player, callback:(tgt) => {
        G.targetMode = null;
        applyDamageToCreature(opp, tgt.instId, amount, player);
        log(`${card.name} ${label}: ${amount}ダメージ`, 'damage');
        checkDeath(); render(); updateHints(); continueStack();
      }};
      log(`${card.name} ${label}: 対象を選択（${amount}ダメージ）`);
      render(); updateHints();
    });
  };
  // 学院付与: grantedDrawOnAttackTurn
  if (atk.grantedDrawOnAttackTurn === G.turn) {
    triggerEffect(`${card.name} 攻撃時(学院)`, card.icon || '📚', player, () => {
      drawCard(player); log(`${card.name}: 攻撃時1枚引く（学院付与）`); render(); updateHints();
    });
  }
  if (!card.onAttack) return;
  if (card.onAttack === 'draw1') {
    triggerEffect(`${card.name} 攻撃時`, card.icon || '🐉', player, () => {
      drawCard(player); log(`${card.name} 攻撃時: 1枚引く`); render(); updateHints();
    });
  } else if (card.onAttack === 'damage2creature') {
    dmgToCreature('攻撃時', 2);
  } else if (card.onAttack === 'damage4creature') {
    dmgToCreature('攻撃時', 4);
  } else if (card.onAttack === 'ren_c6_graveyard_damage') {
    // レン C6: アタック時、相手クリーチャー1体に「自分の墓地2枚につき1ダメージ」
    if (getCXValue(player) >= 6) {
      const amount = Math.floor(p.graveyard.length / 2);
      triggerEffect(`${card.name} C6攻撃時`, card.icon || '☠️', player, () => {
        if (amount <= 0) { log(`${card.name} C6攻撃時: 墓地が少なくダメージ0`); render(); return; }
        if (G.players[opp].field.length === 0) { log(`${card.name} C6攻撃時: 対象なし`); return; }
        G.targetMode = { type:'opponentCreature', sourcePlayer: player, callback:(tgt) => {
          G.targetMode = null;
          applyDamageToCreature(opp, tgt.instId, amount, player);
          log(`${card.name} C6攻撃時: 墓地${p.graveyard.length}枚 → ${amount}ダメージ`, 'damage');
          checkDeath(); render(); updateHints(); continueStack();
        }};
        log(`${card.name} C6攻撃時: ${amount}ダメージの対象を選択`);
        render(); updateHints();
      });
    }
  } else if (card.onAttack === 'ayumuC7') {
    if (getCXValue(player) >= 7) {
      // 1枚引く → その後、相手クリーチャー1体に5ダメージ（同一誘発内で順次処理）
      triggerEffect(`${card.name} C7攻撃時`, card.icon || '🏹', player, () => {
        drawCard(player); log(`${card.name} C7攻撃時: 1枚引く`);
        if (G.players[opp].field.length === 0) { log(`${card.name} C7: 5ダメージ対象なし`); render(); updateHints(); return; }
        G.targetMode = { type:'opponentCreature', sourcePlayer: player, callback:(tgt) => {
          G.targetMode = null;
          applyDamageToCreature(opp, tgt.instId, 5, player);
          log(`${card.name} C7攻撃時: 5ダメージ`, 'damage');
          checkDeath(); render(); updateHints(); continueStack();
        }};
        log(`${card.name} C7攻撃時: 5ダメージの対象を選択`);
        render(); updateHints();
      });
    }
  }
}

function openPriorityWindow(forPlayer, continuation, reason) {
  G.awaitingPriority = true;
  G.priorityFor = forPlayer;
  G.priorityContinuation = continuation;
  if (reason) G.priorityReason = reason;
  else if (!G.priorityReason) G.priorityReason = G.stack.length > 0 ? `${G.stack[G.stack.length-1].name}に対応` : '';
  render();
  updateHints();
  // デモ録画中は AI 自動応答もタイムアウト強制解決もスケジュールしない（手動で決定的に解決する）
  if (_demoActive) return;
  if (NET_MODE === 'local' && forPlayer === 1) {
    setTimeout(() => aiHandlePriority(), 700);
    // フェイルセーフ: AI応答が5秒以上かかる場合は強制的に解決
    setTimeout(() => { if (G.awaitingPriority && G.priorityFor === 1) { log('AI応答タイムアウト: 強制解決', 'important'); closePriorityAndResolve(); } }, 5000);
  } else if (NET_MODE === 'hotseat' && forPlayer !== G.activePlayer) {
    // ホットシート: 非アクティブ側の優先権は自動パス（手札が隠れているため）
    setTimeout(() => { if (G.awaitingPriority) closePriorityAndResolve(); }, 400);
  }
}

function continueStack() {
  const cont = G._pendingCont;
  const reason = G._pendingReason || '';
  G._pendingCont = null;
  G._pendingReason = '';
  if (G.stack.length > 0) {
    const next = G.stack[G.stack.length - 1];
    if (next.fastResolve) {
      setTimeout(() => _resolveNextFast(cont, reason), 200);
    } else {
      setTimeout(() => openPriorityWindow(1 - G.activePlayer, cont, reason), 300);
    }
  } else if (cont) {
    setTimeout(cont, 50);
  }
}

function closePriorityAndResolve() {
  G.awaitingPriority = false;
  G.priorityFor = null;
  const cont = G.priorityContinuation;
  G.priorityContinuation = null;
  const reason = G.priorityReason;
  G.priorityReason = '';

  if (G.stack.length > 0) {
    // LIFO: 最後に積んだものを解決
    const item = G.stack.pop();
    log(`スタック解決: ${item.icon||''} ${item.name}`, 'important');
    G._pendingCont = cont;
    G._pendingReason = reason;
    if (item.resolve) item.resolve();
    renderStack();
    render();
    if (G.targetMode && G.targetMode.sourcePlayer === 1) { aiAutoPickTarget(); }
    if (G.targetMode || G._awaitingModal) return; // 非同期待機中 → continueStack()を待つ
    // continueStack()が既に_pendingContをクリアして続行を処理済みなら二重発火しない
    if (G._pendingCont === null) return;
    G._pendingCont = null;
    G._pendingReason = '';
    // まだスタックが残っていれば: fastResolveなら即解決、それ以外は優先権ウィンドウ
    if (G.stack.length > 0) {
      const next = G.stack[G.stack.length - 1];
      if (next.fastResolve) {
        setTimeout(() => _resolveNextFast(cont, reason), 200);
      } else {
        setTimeout(() => openPriorityWindow(1 - G.activePlayer, cont, reason), 400);
      }
      return;
    }
  }
  // スタック空 → continuation実行
  if (cont) setTimeout(cont, 50);
}

// 同一カードの■効果を優先権ウィンドウなしで連続解決する
function _resolveNextFast(cont, reason) {
  if (G.stack.length === 0) { if (cont) setTimeout(cont, 50); return; }
  const item = G.stack.pop();
  log(`スタック解決: ${item.icon||''} ${item.name}`, 'important');
  G._pendingCont = cont;
  G._pendingReason = reason;
  if (item.resolve) item.resolve();
  renderStack(); render();
  if (G.targetMode && G.targetMode.sourcePlayer === 1) { aiAutoPickTarget(); }
  if (G.targetMode || G._awaitingModal) return; // 非同期待機中
  if (G._pendingCont === null) return; // continueStack()が既に続行を処理済み
  G._pendingCont = null;
  G._pendingReason = '';
  if (G.stack.length > 0) {
    const next = G.stack[G.stack.length - 1];
    if (next.fastResolve) {
      setTimeout(() => _resolveNextFast(cont, reason), 200);
    } else {
      setTimeout(() => openPriorityWindow(1 - G.activePlayer, cont, reason), 400);
    }
  } else if (cont) {
    setTimeout(cont, 50);
  }
}

// 攻撃強制ETBのAI対象選択: 攻撃できないクリーチャー（兵士など）を選んでも
// 効果が完全に無意味になるため、攻撃可能な相手の中から最大パワーを選ぶ。
function _pickAttackForceTarget(pool, oppIdx, srcName) {
  const attackable = pool.filter(c =>
    !CARD_DB[c.cardId].selfCantAttack && !G.cantAttackPermanent.has(c.instanceId));
  const from = attackable.length > 0 ? attackable : pool;
  if (typeof aiThink === 'function' && attackable.length > 0 && attackable.length < pool.length) {
    aiThink(`${srcName}の攻撃強制: 攻撃できない相手は選ばない（効果が無意味になるため）`);
  }
  return from.reduce((a, b) =>
    getEffectivePower(oppIdx, b) > getEffectivePower(oppIdx, a) ? b : a);
}

function aiAutoPickTarget() {
  if (!G.targetMode) return;
  const tm = G.targetMode;
  const src = tm.sourcePlayer !== undefined ? tm.sourcePlayer : G.activePlayer;
  const opp = 1 - src;
  let pool;
  if (tm.type === 'opponentCreature') pool = G.players[opp].field;
  else if (tm.type === 'ownCreature') pool = G.players[src].field;
  else pool = [];
  if (pool.length === 0) { G.targetMode = null; continueStack(); return; }
  let target;
  if (tm.aiPick) {
    target = tm.aiPick(pool);
  } else if (tm.type === 'opponentCreature') {
    target = pool.reduce((best, c) =>
      (CARD_DB[c.cardId].power||0)+(c.tempPower||0) > (CARD_DB[best.cardId].power||0)+(best.tempPower||0) ? c : best);
  } else {
    target = pool.reduce((best, c) =>
      getEffectiveToughness(src, c) - c.damage < getEffectiveToughness(src, best) - best.damage ? c : best);
  }
  G.targetMode = null;
  tm.callback({ instId: target.instanceId });
}

function aiHandlePriority() {
  if (_demoActive) return; // デモ録画中はAIの自動応答を抑止（手動で割込みを見せるため）
  if (!G.awaitingPriority || G.priorityFor !== 1) return;
  const ai = G.players[1];
  const player = G.players[0];

  // Quick呪文が実際に存在するかを先に確認
  // 無意義防止A: 空振りになるクイックは候補から外す（quiet=毎回の優先権でログを出さない）
  const quickSpells = ai.hand.map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
    .filter(({ card }) => card.keywords && card.keywords.includes('Quick') && canAfford(1, card.cost))
    .filter(({ cid }) => typeof gateMeaninglessCast !== 'function' ||
      gateMeaninglessCast(cid, 1, { quiet: true }));

  // Quick呪文がある場合のみ、残りのアンタップ土地からマナを生成（Quick対応用に保留していた分）
  if (quickSpells.length > 0) {
    ai.lands.filter(l => !l.tapped).forEach(land => tapLandForMana(1, land.instanceId));
  }

  // スタック上位の効果を先にロールアウト状態に適用してから評価
  // （ETB誘発・onBlock誘発への対応判断を精度良くするため）
  const stackTop = G.stack.length > 0 ? G.stack[G.stack.length - 1] : null;

  const options = [{type:'pass'}, ...quickSpells.map(item => ({type:'play', item}))];
  showAIThinking(true);
  const best = mctsPickOption(options, (sim, opt) => {
    // スタック上位の効果をロールアウト開始前に適用（近似）
    if (stackTop && stackTop.owner === 0) {
      // 相手側の誘発効果: 既にシム状態に反映されているため追加処理不要
    }
    if (opt.type === 'pass') return;
    const p1 = sim.state.players[1];
    sim.payMana(p1, opt.item.card.cost);
    sim.simSpellEffect(1, opt.item.card);
  });
  showAIThinking(false);
  let chosen = (best && best.type === 'play') ? best.item : null;

  if (chosen) {
    const { cid, i, card } = chosen;
    log(`AI: ${card.name} を対応で使用 (Quick)`, 'important');
    showAIBalloon(`⚡ ${card.icon} ${card.name} 対応！`);
    payMana(1, card.cost);
    ai.hand.splice(i, 1);
    G.stack.push({ name: card.name, icon: card.icon || '✨', owner: 1, resolve: () => {
      ai.graveyard.push(cid);
      aiPlaySpellEffect(card);
    }});
    renderStack();
  } else {
    // AIが対応せず優先権をパスしたことを中央バーに表示
    log('AI: 優先権パス');
    showPhaseFlash('AI 優先権パス', G.stack.length > 0 ? `${G.stack[G.stack.length-1].name} を解決` : '');
  }
  closePriorityAndResolve();
}

function passPriority() {
  if (SPECTATOR_MODE) return; // 観戦モード中は操作不可
  if (NET_MODE === 'guest') {
    // 自分に優先権がある時のみパスを送信（相手の優先権は奪えない）
    if (G.awaitingPriority && G.priorityFor === NET_MY_IDX) netSendAction('passPriority', {});
    return;
  }
  if (NET_MODE === 'host' && G.awaitingPriority && G.priorityFor !== NET_MY_IDX) return;
  if (G.awaitingPriority) {
    closePriorityAndResolve();
    return;
  }
  if (G.stack.length > 0) {
    resolveStack();
  }
}

function resolveStack() {
  if (G.stack.length === 0) return;
  const item = G.stack.pop();
  log(`スタックを解決: ${item.name}`);
  const stackEl = document.getElementById('stack-display');
  if (stackEl) { const r = stackEl.getBoundingClientRect(); animSpellResolve((r.left+r.right)/2, (r.top+r.bottom)/2); }
  if (item.resolve) item.resolve();
  render();
}

// ============================================================
// MULLIGAN
// ============================================================
function doMulligan() {
  if (SPECTATOR_MODE) return; // 観戦モード中は操作不可
  const p = G.players[0];
  if (p.mulliganUsed) { log('マリガンは1回のみ使用できます'); return; }
  p.mulliganUsed = true;
  document.getElementById('btn-mulligan').disabled = true;

  // Show mulligan modal - choose cards to return
  const cards = p.hand.map((cid, i) => ({cid, i}));
  let chosen = new Set();

  const html = `
    <p style="margin-bottom:10px; font-size:11px;">戻すカードを選択（選択したカードをデッキの底に戻し、同じ枚数ドロー）</p>
    <div style="display:flex; flex-wrap:wrap; gap:6px;" id="mulligan-cards"></div>
    <button onclick="confirmMulligan()" style="margin-top:10px; width:100%;">確認</button>
  `;
  showModal('マリガン', html);

  const container = document.getElementById('mulligan-cards');
  cards.forEach(({cid, i}) => {
    const card = CARD_DB[cid];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;';
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    const info = document.createElement('div');
    info.style.cssText = 'width:84px;font-size:9px;color:#ccc;line-height:1.4;text-align:left;background:#1a1a2a;border:1px solid #333;border-radius:4px;padding:4px;white-space:pre-wrap;';
    info.textContent = (card.text || '（テキストなし）');
    wrap.appendChild(el);
    wrap.appendChild(info);
    wrap.onclick = () => {
      if (chosen.has(i)) { chosen.delete(i); wrap.style.opacity = '1'; }
      else { chosen.add(i); wrap.style.opacity = '0.4'; }
      window._mulliganChosen = chosen;
    };
    container.appendChild(wrap);
  });
  window._mulliganHand = p.hand;
  window._mulliganChosen = chosen;
}

function confirmMulligan() {
  const p = G.players[0];
  const chosen = window._mulliganChosen || new Set();
  const count = chosen.size;
  if (count === 0) { closeModal(); return; }
  // Return chosen cards to deck bottom
  const newHand = [];
  p.hand.forEach((cid, i) => {
    if (chosen.has(i)) { p.deck.push(cid); }
    else { newHand.push(cid); }
  });
  p.hand = newHand;
  // Shuffle deck
  p.deck = shuffle(p.deck);
  // Draw same count
  for (let i = 0; i < count; i++) drawCard(0);
  closeModal();
  log(`マリガン: ${count}枚入れ替え`);
  render();
}

// ============================================================
// 観戦モード (AI vs AI Spectator Mode)
// ============================================================
function startSpectatorFromHome() {
  // ホーム画面から観戦モードを起動
  const homeScreen = document.querySelector('.home-screen, [id*=home]');
  if (homeScreen) homeScreen.style.display = 'none';

  startSpectatorMode();
}

function startSpectatorMode() {
  SPECTATOR_MODE = true;
  SPECTATOR_VIEWPOINT = 0;
  SPECTATOR_AUTO_DRIVE = true;
  NET_MODE = 'local';
  initGame();
  closeModal();

  // マリガンボタンを隠す（観戦モードではマリガンを許可しない）
  const btnMulligan = document.getElementById('btn-mulligan');
  if (btnMulligan) btnMulligan.style.display = 'none';

  // マリガンモードを強制的に無効化（観戦モードではマリガンを許可しない）
  if (G) G.mulliganMode = false;

  log('🎬 観戦モード開始。両AI が対戦します。');
  render();
  updateSpectatorDisplay();

  // マリガンUIを完全に隠す（render()の後に再度確認）
  const btnMulliganConfirm = document.getElementById('mulligan-controls');
  if (btnMulliganConfirm) btnMulliganConfirm.style.display = 'none';

  // 自動駆動開始（SPECTATOR_TICK_INTERVAL で設定された間隔）
  if (window._spectatorTimer) clearInterval(window._spectatorTimer);
  window._spectatorTimer = setInterval(() => {
    if (!G || G.phase === 'ended') {
      SPECTATOR_AUTO_DRIVE = false;
      clearInterval(window._spectatorTimer);
      log('🎬 観戦モード終了。対戦が終わりました。');
      updateSpectatorControls();
      return;
    }
    // 自動駆動ティック（両AIが自動で進行）
    if (!SPECTATOR_AUTO_DRIVE || !G || G.phase === 'ended') return;
    try {
      // 優先権状態：自動でパス
      if (G.awaitingPriority) {
        passPriority();
        render();
        return;
      }
      // ブロック状態：自動でフェーズ終了
      if (G.playerBlockMode) {
        endPhase();
        render();
        return;
      }
      // mainフェーズ：AIターン実行
      if (G.phase === 'main' && G.activePlayer === 1) {
        aiTurn();
        render();
        return;
      }
      // その他のフェーズ：自動で次フェーズへ
      endPhase();
      render();
    } catch(e) { console.error('Spectator error:', e); }
  }, SPECTATOR_TICK_INTERVAL);

  updateSpectatorControls();
}

function switchSpectatorViewpoint() {
  if (!SPECTATOR_MODE) return;
  SPECTATOR_VIEWPOINT = 1 - SPECTATOR_VIEWPOINT;
  log(`📍 視点切り替え: ${SPECTATOR_VIEWPOINT === 0 ? 'P1（下）' : 'P2（上）'}`);
  render();
  updateSpectatorDisplay();
}

function toggleSpectatorAutoDrive() {
  if (!SPECTATOR_MODE) return;
  SPECTATOR_AUTO_DRIVE = !SPECTATOR_AUTO_DRIVE;
  log(`⏸️ 自動駆動: ${SPECTATOR_AUTO_DRIVE ? 'ON' : 'OFF'} (${SPECTATOR_TICK_INTERVAL}ms間隔)`);
  if (SPECTATOR_AUTO_DRIVE && !window._spectatorTimer) {
    // 再開
    window._spectatorTimer = setInterval(() => {
      if (!SPECTATOR_AUTO_DRIVE || !G || G.phase === 'ended') {
        clearInterval(window._spectatorTimer);
        return;
      }
      try {
        if (G.awaitingPriority) { passPriority(); }
        else if (G.playerBlockMode) { endPhase(); }
        else if (G.activePlayer === 0 && G.phase === 'main') { endTurn(); }
        else if (G.activePlayer === 1 && G.phase === 'main') { aiTurn(); }
      } catch(e) {}
    }, SPECTATOR_TICK_INTERVAL);
  } else if (!SPECTATOR_AUTO_DRIVE && window._spectatorTimer) {
    clearInterval(window._spectatorTimer);
  }
  updateSpectatorControls();
}

function setSpectatorSpeed(msInterval) {
  SPECTATOR_TICK_INTERVAL = msInterval;
  const speedNames = { 200: '🚀 高速', 500: '▶️ 通常', 1000: '🐢 遅速', 2000: '🐌 超遅' };
  log(`⏱️ ゲーム速度: ${speedNames[msInterval] || msInterval + 'ms'}`);

  // 自動駆動中ならタイマーを再開
  if (SPECTATOR_AUTO_DRIVE && window._spectatorTimer) {
    clearInterval(window._spectatorTimer);
    window._spectatorTimer = setInterval(() => {
      if (!SPECTATOR_AUTO_DRIVE || !G || G.phase === 'ended') {
        clearInterval(window._spectatorTimer);
        return;
      }
      try {
        if (G.awaitingPriority) { passPriority(); }
        else if (G.playerBlockMode) { endPhase(); }
        else if (G.activePlayer === 0 && G.phase === 'main') { endTurn(); }
        else if (G.activePlayer === 1 && G.phase === 'main') { aiTurn(); }
      } catch(e) {}
    }, SPECTATOR_TICK_INTERVAL);
  }
}

function pauseSpectatorGame() {
  if (!SPECTATOR_MODE) return;
  SPECTATOR_AUTO_DRIVE = false;
  if (window._spectatorTimer) {
    clearInterval(window._spectatorTimer);
    window._spectatorTimer = null;
  }
  log('⏸️ 試合を一時停止しました。「次フェイズ」ボタンで進めてください。');
  render();
  updateSpectatorControls();
}

function resumeSpectatorGame() {
  if (!SPECTATOR_MODE) return;
  SPECTATOR_AUTO_DRIVE = true;
  log(`▶️ 試合を再開します（${SPECTATOR_TICK_INTERVAL}ms間隔）`);

  if (!window._spectatorTimer) {
    window._spectatorTimer = setInterval(() => {
      if (!SPECTATOR_AUTO_DRIVE || !G || G.phase === 'ended') {
        clearInterval(window._spectatorTimer);
        window._spectatorTimer = null;
        return;
      }
      try {
        if (G.awaitingPriority) { passPriority(); }
        else if (G.playerBlockMode) { endPhase(); }
        else if (G.activePlayer === 0 && G.phase === 'main') { endTurn(); }
        else if (G.activePlayer === 1 && G.phase === 'main') { aiTurn(); }
      } catch(e) {}
    }, SPECTATOR_TICK_INTERVAL);
  }
  render();
  updateSpectatorControls();
}

function nextSpectatorPhase() {
  if (!SPECTATOR_MODE || !G || G.phase === 'ended') return;
  try {
    if (G.awaitingPriority) { passPriority(); }
    else if (G.playerBlockMode) { endPhase(); }
    else if (G.activePlayer === 0 && G.phase === 'main') { endTurn(); }
    else if (G.activePlayer === 1 && G.phase === 'main') { aiTurn(); }
  } catch(e) { console.error(e); }
  render();
  updateHints();
}

function updateSpectatorControls() {
  const btn = document.getElementById('btn-spectator-switch');
  const btnAuto = document.getElementById('btn-spectator-auto');
  const speedMenu = document.getElementById('spectator-speed-menu');
  const pauseBtn = document.getElementById('btn-spectator-pause');
  const resumeBtn = document.getElementById('btn-spectator-resume');
  const nextBtn = document.getElementById('btn-spectator-next');

  if (btn) btn.style.display = SPECTATOR_MODE ? 'block' : 'none';
  if (btnAuto) btnAuto.style.display = SPECTATOR_MODE && SPECTATOR_AUTO_DRIVE ? 'block' : 'none';
  if (pauseBtn) pauseBtn.style.display = SPECTATOR_MODE && SPECTATOR_AUTO_DRIVE ? 'block' : 'none';
  if (resumeBtn) resumeBtn.style.display = SPECTATOR_MODE && !SPECTATOR_AUTO_DRIVE ? 'block' : 'none';
  if (nextBtn) nextBtn.style.display = SPECTATOR_MODE && !SPECTATOR_AUTO_DRIVE ? 'block' : 'none';
  if (speedMenu) speedMenu.style.display = SPECTATOR_MODE ? 'flex' : 'none';
}

// ============================================================
// 特殊マッチモード
// ============================================================
function loadSpecialMatchRecords() {
  const stored = localStorage.getItem('specialMatchRecords');
  if (stored) {
    try {
      SPECIAL_MATCH_RECORDS = JSON.parse(stored);
    } catch(e) {
      SPECIAL_MATCH_RECORDS = [];
    }
  }
}

function saveSpecialMatchRecords() {
  localStorage.setItem('specialMatchRecords', JSON.stringify(SPECIAL_MATCH_RECORDS));
}

function recordSpecialMatchResult(aiWon) {
  if (!SPECIAL_MATCH_MODE) return;
  SPECIAL_MATCH_RECORDS.push({date: new Date().toISOString(), aiWon});
  // 直近20戦を保持
  if (SPECIAL_MATCH_RECORDS.length > 20) {
    SPECIAL_MATCH_RECORDS.shift();
  }
  saveSpecialMatchRecords();
}

function getSpecialMatchStats() {
  const aiWins = SPECIAL_MATCH_RECORDS.filter(r=>r.aiWon).length;
  const total = SPECIAL_MATCH_RECORDS.length;
  const rate = total > 0 ? Math.round(aiWins * 100 / total) : 0;
  return {aiWins, total, aiLoss: total - aiWins, rate};
}

function updateSpecialMatchDisplay() {
  const stats = getSpecialMatchStats();
  const statsDiv = document.getElementById('special-match-stats');
  if (statsDiv) {
    document.getElementById('special-match-wins').textContent = stats.aiWins;
    document.getElementById('special-match-loss').textContent = stats.aiLoss;
    document.getElementById('special-match-rate').textContent = stats.rate;
    statsDiv.style.display = stats.total > 0 ? 'block' : 'none';
  }
}

function startSpecialMatch() {
  loadSpecialMatchRecords();
  updateSpecialMatchDisplay();
  const stats = getSpecialMatchStats();

  if (stats.aiWins >= 15) {
    alert(`✅ 成功! AI が直近20戦で${stats.aiWins}勝達成しました。\nレート: ${stats.rate}%`);
    return;
  }

  SPECIAL_MATCH_MODE = true;
  NET_MODE = 'local';
  NET_MY_IDX = 0;
  const homeScreen = document.getElementById('home-screen');
  if (homeScreen) homeScreen.style.display = 'none';
  const lobby = document.getElementById('net-lobby');
  if (lobby) lobby.style.display = 'none';
  initGame();
}

function onSpecialMatchEnd(playerWon) {
  const aiWon = !playerWon;
  recordSpecialMatchResult(aiWon);
  updateSpecialMatchDisplay();
  const stats = getSpecialMatchStats();

  if (stats.aiWins >= 15) {
    alert(`✅ 成功! AI が直近20戦で${stats.aiWins}勝達成しました。\nレート: ${stats.rate}%`);
  } else {
    alert(`現在 AI ${stats.aiWins}勝/${stats.aiLoss}敗 (${stats.rate}%)\n あと${15-stats.aiWins}勝で達成。`);
    if (confirm('5000回学習を追加して続行しますか?')) {
      setTimeout(() => runSpecialMatchLearning(5000), 500);
    }
  }

  if (stats.total < 20 && confirm('次の試合を開始しますか?')) {
    setTimeout(() => startSpecialMatch(), 500);
  }
}

function runSpecialMatchLearning(gameCount) {
  // 白ミラー(特殊マッチ構成)で進化学習し、旧AIより強くなった時だけ採用して保存する。
  // 保存先: localStorage 'dcg_ai_white' — 起動時に loadAIColorWeights('white') が自動で読み込む。
  const mainCounts = {}; DB_WHITE_MAIN.forEach(id => { mainCounts[id] = 4; });
  const landCounts = {}; DB_WHITE_LAND.forEach(id => { landCounts[id] = 2; });
  // Phase5: 学習パラメータ最適化
  const POP = 10;        // 集団サイズ拡大 (8→10)
  const GENS = 8;        // ジェネレーション数増加 (5→8)
  const pairsPerGen = POP * (POP - 1) / 2; // 45
  const valN = 500;      // 検証戦数増加 (300→500)
  const batchN = Math.max(12, Math.floor((gameCount - valN) / (pairsPerGen * GENS)));
  // 「最新の旧AI」= 学習開始時点の現行重み。集団の1体として無変異で参加させ(追加学習)、
  // 学習後の安全弁検証もこの旧AIと対戦して判定する。
  const old = JSON.parse(JSON.stringify(AI_WEIGHTS));
  const oldJson = JSON.stringify(old);
  let pop = Array.from({ length: POP }, (_, i) => i === 0 ? { ...old } : adaptiveMutate(old));
  let gen = 0;

  function updateProgress(txt) {
    const el = document.getElementById('sm-learn-progress');
    if (el) el.textContent = txt;
  }

  // C. 学習ライブ実況: 世代ごとの出来事をモーダル内に追記する
  function appendLearnLive(txt, color) {
    const el = document.getElementById('sm-learn-live');
    if (!el) return;
    const d = document.createElement('div');
    d.textContent = txt;
    if (color) d.style.color = color;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  function runGeneration() {
    try {
      if (gen >= GENS) { finish(); return; }
      const scores = new Array(POP).fill(0);
      for (let i = 0; i < POP; i++) for (let j = i + 1; j < POP; j++) {
        const wr = runTrainingBatch(pop[i], pop[j], batchN, mainCounts, mainCounts, landCounts, landCounts);
        if (wr > 0.5) scores[i]++; else scores[j]++;
      }
      const ranked = pop.map((w, i) => ({ w, s: scores[i] })).sort((a, b) => b.s - a.s);
      // ライブ実況: この世代の首位が現行AIか、学習で生まれた改良候補か
      const champIsOld = JSON.stringify(ranked[0].w) === oldJson;
      appendLearnLive(
        `第${gen + 1}世代: ${champIsOld ? '現行AIが首位を守りました' : '改良候補が首位に立ちました！'}（総当たり${POP - 1}戦中 ${ranked[0].s}勝）`,
        champIsOld ? '#aaa' : '#88ff99'
      );
      pop = [ranked[0].w, ranked[1].w,
             crossoverWeights(ranked[0].w, ranked[1].w),
             crossoverWeights(ranked[1].w, ranked[2] ? ranked[2].w : ranked[0].w)];
      while (pop.length < POP - 1) pop.push(adaptiveMutate(ranked[Math.floor(Math.random() * 3)].w));
      // 最新の旧AIが淘汰されていたら無変異で1体再投入（毎世代の基準として維持し追加学習させる）
      if (!pop.some(w => JSON.stringify(w) === oldJson)) pop.push({ ...old });
      while (pop.length < POP) pop.push(adaptiveMutate(ranked[Math.floor(Math.random() * 3)].w));
      gen++;
      const done = gen * pairsPerGen * batchN;
      log(`🤖 学習進行: 世代 ${gen}/${GENS} (${done}ゲーム消化)`, 'important');
      updateProgress(`世代 ${gen}/${GENS} — ${done}ゲーム消化`);
      setTimeout(runGeneration, 50);
    } catch(e) {
      console.error('学習エラー:', e);
      closeModal();
      alert(`学習中にエラーが発生しました: ${e.message}`);
    }
  }

  function finish() {
    updateProgress('新旧AIの検証対戦中...');
    setTimeout(() => {
      try {
        const best = { ...pop[0], _version: AI_WEIGHTS_VERSION };
        const wr = runTrainingBatch(best, old, valN, mainCounts, mainCounts, landCounts, landCounts);
        closeModal();
        const pct = (wr * 100).toFixed(1);
        const adopted = wr >= 0.52; // ノイズ程度の差では採用しない（52%以上で明確な改善とみなす）
        // A. 学習履歴ノートに記録（採用/見送りどちらも残す）
        if (typeof recordAILearnEvent === 'function') {
          recordAILearnEvent({
            date: new Date().toISOString(),
            games: gameCount, gens: GENS,
            winRate: +pct, adopted,
          });
        }
        // B. 学習前後の性格比較（採用時のみ「新しい性格」を表示）
        const personaBefore = (typeof getAIPersona === 'function') ? getAIPersona(old) : null;
        const personaAfter = (typeof getAIPersona === 'function') ? getAIPersona(best) : null;
        if (adopted) {
          AI_WEIGHTS = best;
          if (typeof AI_TRAIN_STATS !== 'undefined') {
            AI_TRAIN_STATS.games = (AI_TRAIN_STATS.games || 0) + gameCount;
            AI_TRAIN_STATS.epoch = (AI_TRAIN_STATS.epoch || 0) + GENS;
          }
          saveAIColorWeights('white'); // localStorageへ永続化（リロード後も自動読込）
          log(`🤖 学習完了: 新AIを採用・保存（新vs旧 勝率${pct}%）`, 'important');
        } else {
          log(`🤖 学習完了: 改善なしのため現在のAIを維持（新vs旧 勝率${pct}%）`, 'important');
        }
        // 結果画面: 判定＋性格の変化をゲージで表示
        let resultHTML;
        if (adopted) {
          resultHTML = `<div style="text-align:center;color:#66ff88;font-size:14px;margin-bottom:8px;"><strong>✅ 新AIを採用しました！</strong></div>
            <div style="text-align:center;font-size:12px;color:#ccc;margin-bottom:10px;">新AIが旧AIに勝率 <strong style="color:#88ff99;">${pct}%</strong> で勝ち越し（${valN}戦で検証）<br><span style="font-size:10px;color:#888;">保存済み — リロード後も自動で読み込まれます</span></div>`;
        } else {
          resultHTML = `<div style="text-align:center;color:#ffaa66;font-size:14px;margin-bottom:8px;"><strong>今回は見送り</strong></div>
            <div style="text-align:center;font-size:12px;color:#ccc;margin-bottom:10px;">新AIの勝率が <strong style="color:#ffcc88;">${pct}%</strong> で、明確な改善（52%以上）に届きませんでした。<br><span style="font-size:10px;color:#888;">現在のAIをそのまま使います</span></div>`;
        }
        if (personaBefore && personaAfter && typeof renderPersonaHTML === 'function') {
          const title = adopted ? '🎭 性格の変化（学習前 → 学習後）' : '🎭 見送った新AIの性格（参考: 現AIとの差）';
          resultHTML += `<div style="background:rgba(255,255,255,0.03);border:1px solid #333;border-radius:8px;padding:10px 12px;text-align:left;">
            <div style="font-size:12px;color:#aad4ff;margin-bottom:8px;font-weight:bold;">${title}</div>
            ${renderPersonaHTML(personaAfter, personaBefore)}</div>`;
        }
        resultHTML += `<div style="text-align:center;margin-top:10px;"><button onclick="closeModal();showAIInsightPanel();" style="padding:6px 14px;background:#1a2a4a;border:1px solid #6688cc;color:#aaccff;border-radius:6px;font-size:12px;">🧠 AIの中身をくわしく見る</button></div>`;
        showModal('🧠 学習結果', resultHTML);
      } catch(e) {
        console.error('学習エラー:', e);
        closeModal();
        alert(`学習中にエラーが発生しました: ${e.message}`);
      }
    }, 50);
  }

  log(`🤖 約${gameCount}回の学習を開始します...`, 'important');
  showModal('学習中', `<p style="text-align:center;color:#88ff88;font-size:14px;"><strong>約${gameCount}回のゲームを学習中...</strong></p>
    <p id="sm-learn-progress" style="text-align:center;font-size:12px;color:#aaa;">世代 0/${GENS}</p>
    <div id="sm-learn-live" style="max-height:140px;overflow-y:auto;font-size:11px;color:#ccc;text-align:left;background:rgba(0,0,0,0.3);border:1px solid #2a2a3a;border-radius:6px;padding:6px 10px;margin:8px 0;"></div>
    <p style="text-align:center;font-size:12px;color:#aaa;">ブラウザを閉じないでください</p>`);
  setTimeout(runGeneration, 100);
}
