// ============================================================
// AI WEIGHTS & EVALUATION SYSTEM (v3)
// ============================================================

const AI_WEIGHTS_VERSION = 3;
const GAME_VERSION = 1;  // バージョン更新時にレート・トロフィーを保持するためのマイジョン管理
// 学習対象のメインデッキカードプール（カード追加時はここに追記）
const AI_CARD_POOL = ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho',
  'serashia_heishi','serashia_junhei','serashia_souryo',
  'bastian','arestia','junigeki','kaizen'];
const AI_WEIGHTS_DEFAULT = {
  _version: 3,
  life: 2.0, fieldPower: 0.8, fieldToughness: 0.3, fieldCount: 1.2,
  handAdv: 0.4, threshold: 0.12, blockRisk: 0.6,
  manaEff: 0.15,        // #9: penalise unplayable hand cards
  lateLifeBonus: 1.2,   // #7: extra life weight when life < 10
  earlyFieldBonus: 0.4, // #7: extra field weight in turns 1-6
  attackBias: 0.2,      // #2: bias toward attacking
};
// カード個別のプレイ優先度（遺伝的アルゴリズムの学習対象、負値=使わない方が良い）
AI_CARD_POOL.forEach(id => { AI_WEIGHTS_DEFAULT['card_' + id] = 0; });

// 5色ごとのデフォルトAI重み（GA訓練済み）
const AI_WEIGHTS_BY_COLOR = {
  // ★①②③改良シミュ上で再学習（新vs旧 独立2000戦で56.6%勝率を確認）
  white: {"_version":3,"life":1.844289694702525,"fieldPower":1.468307902343737,"fieldToughness":-1.3466340096452105,"fieldCount":0.5859891279819026,"handAdv":0.40731278291790235,"threshold":0.13357177227353967,"blockRisk":1.9312776544889783,"manaEff":0.2351613834052521,"lateLifeBonus":1.485150879788745,"earlyFieldBonus":1.2616243807240535,"attackBias":1.3146395995969304,"card_eiyuu_kouho":-0.03954644016924461,"card_bastian":0.07515126398628796,"card_ten_kara_shisha":0.12369255684193897,"card_junigeki":-0.08530524354422178},
  // ★①②③改良シミュ上で再学習（新vs旧 独立2000戦で57.1%勝率を確認）
  red: {"_version":3,"life":1.9946166859084533,"fieldPower":0.24429485743678117,"fieldToughness":-0.1134492873469306,"fieldCount":2.4040508113024566,"handAdv":0.39098495392084665,"threshold":-0.32024321532222383,"blockRisk":0.3471084044946248,"manaEff":0.39652807414732805,"lateLifeBonus":0.7814233715673672,"earlyFieldBonus":0.01,"attackBias":1.0900091398110843,"card_junigeki":0.02630194579685612,"card_kaizen":0.04523798625645217,"card_bastian":0.0395906854596344,"card_serashia_souryo":0.12057534728038993},
  blue: {"_version":2.7600338727029583,"life":1.5162663392934754,"fieldPower":0.054393817196375316,"fieldToughness":-0.3261014734229055,"fieldCount":0.5624219597979176,"handAdv":1.0721034171747037,"threshold":0.7683417770129424,"blockRisk":0.8654341499174704,"manaEff":0.8606444215817621,"lateLifeBonus":1.728068363152647,"earlyFieldBonus":-0.19674927257588282,"attackBias":0.6575112110255236},
  // ★①②③改良シミュ上で再学習（新vs旧 独立2000戦で55.2%勝率を確認）
  black: {"_version":3,"life":2.634203866921577,"fieldPower":1.026956387929416,"fieldToughness":0.01,"fieldCount":0.5090036811684187,"handAdv":0.052084965102066415,"threshold":0.3046258877560888,"blockRisk":1.5113573723998444,"manaEff":0.35506812858874764,"lateLifeBonus":1.2811926717945532,"earlyFieldBonus":-0.6106690187796376,"attackBias":0.09207111667534337,"card_eiyuu_kouho":0.09708356059738535,"card_shinmai_heishi":0.13365712078174866,"card_arestia":0.12130674317271883,"card_bastian":0.011107997900564028,"card_junigeki":-0.012815998015973707},
  green: {"_version":3.7023490205374174,"life":1.608589414366043,"fieldPower":0.38530587756828366,"fieldToughness":0.19124289225406887,"fieldCount":1.6515276437340753,"handAdv":0.14396764139991136,"threshold":0.28368384301751365,"blockRisk":0.4700807925823994,"manaEff":1.2718997984489877,"lateLifeBonus":0.46957894086459917,"earlyFieldBonus":-0.12094708387591013,"attackBias":1.5706485340064686},
};

let AI_WEIGHTS = JSON.parse(JSON.stringify(AI_WEIGHTS_DEFAULT));
// ── 思考バージョン切替（AI強化のA/B検証用）─────────────────────────
// 'v2' = 改良版（評価関数バグ修正＋特徴量拡張）。実ゲーム・学習の既定。
// SIM_BRAIN_FORCE: 測定時に [P0, P1] の脳を個別指定（例 ['v2','v1']）。null で既定。
let SIM_DEFAULT_BRAIN = 'v2';
let SIM_BRAIN_FORCE = null;
// v2の各改良を個別にON/OFF（A/B切り分け用）。既定は全ON。
let V2_FLAGS = {
  evalClamp: true,   // タフネス等の符号是正
  evalExtra: true,   // 回避/リーサル距離/被リーサル/空盤面 などの追加特徴
  spellFace: true,   // バーンのリーサル本体撃ち
};
let AI_TRAIN_STATS = { games: 0, wins: 0, epoch: 0 };
let CARD_STATS = {};       // バランス統計 {cardId: {played, wins}} シミュレーション対戦から収集
let AI_DECK_COUNTS = null; // AI自動構築デッキ {cardId: 枚数} null=デフォルト(全カード4枚)
let AI_LAND_COUNTS = null; // AI自動構築土地デッキ {landId: 枚数} null=デフォルト(各2枚)
const AI_LAND_POOL = ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'];

// 5色ごとのAI学習データ
const AI_COLOR_KEYS = { white:'dcg_ai_white', red:'dcg_ai_red', blue:'dcg_ai_blue', black:'dcg_ai_black', green:'dcg_ai_green' };
let AI_CURRENT_COLOR = null; // 現在訓練中の色

// AIの色別学習データをlocalStorageから読み込む（デフォルト重みを優先）
function loadAIColorWeights(colorKey) {
  try {
    // デフォルト重みを先に適用（新キーもAI_WEIGHTS_DEFAULTから継承）
    const defaultWeights = AI_WEIGHTS_BY_COLOR[colorKey] || AI_WEIGHTS_DEFAULT;
    AI_WEIGHTS = { ...AI_WEIGHTS_DEFAULT, ...defaultWeights };
    AI_TRAIN_STATS = { games: 500000, wins: 250000, epoch: 1000 }; // デフォルトの学習統計
    CARD_STATS = {};
    AI_DECK_COUNTS = null;
    AI_LAND_COUNTS = null;
    AI_CURRENT_COLOR = colorKey;

    // localStorageに上書きデータがあれば適用
    const lsKey = AI_COLOR_KEYS[colorKey];
    if (lsKey) {
      const saved = localStorage.getItem(lsKey);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.weights && data._version === AI_WEIGHTS_VERSION) {
          AI_WEIGHTS = { ...AI_WEIGHTS, ...data.weights };
          if (data.stats) AI_TRAIN_STATS = data.stats;
          if (data.cardStats) CARD_STATS = data.cardStats;
          if (data.aiDeck) AI_DECK_COUNTS = data.aiDeck;
          if (data.aiLand) AI_LAND_COUNTS = data.aiLand;
        }
      }
    }
    return true;
  } catch(e) {
    console.error('Failed to load AI weights for color:', colorKey, e);
  }
  return false;
}

// AIの色別学習データをlocalStorageに保存する
function saveAIColorWeights(colorKey) {
  try {
    const lsKey = AI_COLOR_KEYS[colorKey];
    if (!lsKey) return;
    const data = { _version: AI_WEIGHTS_VERSION, weights: AI_WEIGHTS, stats: AI_TRAIN_STATS, cardStats: CARD_STATS, aiDeck: AI_DECK_COUNTS, aiLand: AI_LAND_COUNTS };
    localStorage.setItem(lsKey, JSON.stringify(data));
  } catch(e) {}
}

// デフォルトで白色のAI重みを読み込む（デフォルト50万戦の学習結果が使用される）
loadAIColorWeights('white');

function evalBoardScore(player) {
  const me = G.players[player], opp = G.players[1-player];
  if (me.life <= 0) return -99999;
  if (opp.life <= 0) return 99999;
  const w = AI_WEIGHTS;
  const myPow  = me.field.reduce((s,c)=>s+getEffectivePower(player,c),0);
  const oppPow = opp.field.reduce((s,c)=>s+getEffectivePower(1-player,c),0);
  const myTou  = me.field.reduce((s,c)=>s+getEffectiveToughness(player,c),0);
  const oppTou = opp.field.reduce((s,c)=>s+getEffectiveToughness(1-player,c),0);
  let score = w.life*(me.life-opp.life)
            + w.fieldPower*(myPow-oppPow)
            + w.fieldToughness*(myTou-oppTou)
            + w.fieldCount*(me.field.length-opp.field.length)
            + w.handAdv*(me.hand.length-opp.hand.length)
            + w.threshold*getCXValue(player);

  // Phase1: 局面類型化（序中終盤戦略） - 既存の重みを活用
  const turn = G.turn || 1;
  if (turn <= 4) {
    // 序盤: フィールド構築に重点
    score += w.earlyFieldBonus * me.field.length;
  } else if (turn <= 10) {
    // 中盤: バランス戦略
    score += w.earlyFieldBonus * 0.5 * me.field.length;
    // ダメージ計算を考慮（中盤から攻撃性を高める）
    if (myPow > 0) score += w.attackBias * myPow * 0.3;
  } else {
    // 終盤: ダメージ・リーサル計算重視
    if (myPow > 0) score += w.attackBias * myPow * 0.8;
    // あと何ターンでリーサルできるか計算
    const turnsToKill = oppPow > 0 ? Math.ceil(opp.life / myPow) : 999;
    const turnsToLose = myPow > 0 ? Math.ceil(me.life / oppPow) : 999;
    if (turnsToKill < turnsToLose) score += 5.0; // リーサル見えたらスコア大幅ボーナス
  }

  if (me.life < 10) score += w.lateLifeBonus*(me.life-opp.life);
  const unplayable = me.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&!canAfford(player,c.cost);}).length;
  score -= w.manaEff*unplayable;
  return score;
}

function aiPickBestCard(handItems) {
  // Rated mode: lower tiers randomly skip optimal play
  if (RATED_MODE && handItems.length > 0 && Math.random() < eloTierOf(RATED_OPP_RATING).mistakeRate) return null;
  const ai = G.players[1];
  const player = G.players[0];
  const myLife = ai.life, oppLife = player.life;
  const myField = ai.field.length, oppField = player.field.length;
  const turn = G.turn || 1;

  let best = null, bestScore = -Infinity;
  for (const item of handItems) {
    const { card } = item;
    const cost = totalCost(card.cost || {});
    let score = AI_WEIGHTS['card_' + card.id] || 0;

    if (card.type === 'creature') {
      const pow = card.power || 0, tou = card.toughness || 0;
      score += AI_WEIGHTS.fieldPower * pow + AI_WEIGHTS.fieldToughness * tou + AI_WEIGHTS.fieldCount;
      // Phase2: ターン数に応じたカード価値動的調整
      if (turn <= 4) {
        // 序盤: パワー/タフネスバランス重視
        score += (pow + tou) * 0.2;
      } else if (turn <= 10) {
        // 中盤: パワー優先（攻撃準備）
        score += pow * 0.3;
      } else {
        // 終盤: パワー重視（ダメージ計算）
        score += pow * 0.6;
      }
      // Prefer creatures when we have fewer on field
      if (myField < oppField) score += 1.5;
      // Prefer big creatures when losing on life
      if (myLife < oppLife) score += pow * 0.5;
      // Don't play creatures if field is already dominant
      if (myField >= 4 && myField > oppField) score -= 1.0;
    } else if (card.type === 'spell') {
      // Evaluate spell based on board state
      if (card.effect === 'junigeki') {
        // Good when opponent has creatures to damage
        score += oppField > 0 ? 2.5 : 0.5;
        // Better when we have a creature to buff
        score += myField > 0 ? 0.5 : 0;
      } else if (card.effect === 'kaizen') {
        // Very strong when opponent has creatures
        score += oppField > 0 ? 4.0 : 1.5;
        // Better when losing (disrupts opponent's big creature)
        score += myLife < oppLife ? 1.5 : 0;
      }
      score += cost * 0.05; // slight preference for expensive (powerful) spells
    }

    if (score > bestScore) { bestScore = score; best = item; }
  }

  // Phase B: Hard Constraints（カード選択の妥当性チェック）
  if (best) {
    const card = best.card;
    const cost = totalCost(card.cost || {});
    // マナ浪費チェック: ほぼ無意味なカード使用は禁止
    if (cost > 0 && card.type === 'creature') {
      const pow = card.power || 0;
      if (cost > pow * 2 && oppField === 0 && myField >= 3) {
        // 相手の場が空で自分が有利なのに、高コストの低パワークリーチャーを使う = 無意味
        if (typeof aiThink === 'function') aiThink(`⚠️ Hard Constraints: ${card.name} はコスト対効果が低いためパス`);
        best = null;
      }
    }
  }

  // Phase C + D: Decision Audit & Context-Aware Fallback
  if (best && typeof recordDecisionAudit === 'function' && typeof calculateSanityScore === 'function') {
    const card = best.card;
    const context = {
      decision: 'play_card',
      improvesBoard: (card.type === 'creature') ? 1 : (oppField > 0 ? 2 : 0),
      manaEfficiency: (totalCost(card.cost || {}) > 0) ? (card.power || 1) / totalCost(card.cost) : 1
    };
    const score = calculateSanityScore('play_card', context);
    recordDecisionAudit('play_card', {cardId: card.id, turn}, score);

    // Phase D: 妥当性スコアが極端に低い場合、より安全な（スコア低い）カード選択に切り替え
    if (score < 30 && handItems.length > 1) {
      const alternatives = handItems.filter(h => h !== best);
      const safer = alternatives[Math.floor(Math.random() * alternatives.length)];
      if (safer && typeof aiThink === 'function') {
        aiThink(`フォールバック: より妥当性の高い判断に切り替え（${score}→改善）`);
      }
      return safer || best;
    }
  }

  return best;
}

function aiShouldBlock(atkInst, blkInst, atkPlayer) {
  const w = AI_WEIGHTS;
  const defender = 1-atkPlayer;
  const me = G.players[defender];
  const opp = G.players[atkPlayer];
  const atkPow = getEffectivePower(atkPlayer,atkInst);
  const blkPow = getEffectivePower(defender,blkInst);
  const blkTou = getEffectiveToughness(defender,blkInst);
  const atkTou = getEffectiveToughness(atkPlayer,atkInst);
  const atkCard = CARD_DB[atkInst.cardId] || {};
  const blkCard = CARD_DB[blkInst.cardId] || {};
  // 裏目ケアA: 接死持ちの攻撃はタフネスで耐えられない／自分の接死ブロックは相手を必ず倒せる
  const blkSurvives = !(atkCard.deathtouch && atkPow > 0) && (blkTou-blkInst.damage) > atkPow;
  const atkDies = ((atkTou-atkInst.damage) <= blkPow) || (blkCard.deathtouch && blkPow > 0);
  let blockValue = 0;
  if (atkDies) blockValue += w.fieldPower*atkPow + w.fieldCount;
  if (!blkSurvives) blockValue -= w.fieldPower*blkPow + w.fieldCount;

  // Phase3: ブロック判定強化 - 終盤ではブロック優先度を高める
  const turn = G.turn || 1;
  if (turn >= 11 && me.life < 15) {
    blockValue += 3.0;
  } else if (turn <= 4 && atkPow <= 2) {
    blockValue -= 0.5;
  }

  // 裏目ケアA: 貫通持ちを小さいクリーチャーでブロックしても超過分は通る
  // → 「ブロックで実際に防げるダメージ」で価値を評価（無駄なチャンプブロックを避ける）
  const preventedPow = (atkCard.trample && !blkSurvives)
    ? Math.min(atkPow, Math.max(0, blkTou - blkInst.damage))
    : atkPow;

  const baseDecision = (blockValue + w.life*preventedPow*w.blockRisk) > 0;

  // Phase A: Sanity Check（妥当性再確認）
  if (baseDecision && typeof sanitizeBlockDecision === 'function') {
    if (!sanitizeBlockDecision(atkInst, blkInst, atkPlayer)) return false;
  }

  // Phase E: Pattern Blocker（過去に負けたパターンの回避）
  if (baseDecision && typeof shouldBlockPattern === 'function') {
    const situation = {turn, atkPow, blkTou, atkTou, blkSurvives, atkDies, atkPlayer, defPlayer: defender};
    if (shouldBlockPattern(situation)) {
      if (typeof aiThink === 'function') aiThink('パターンマッチ: 過去に失敗したブロック方法は回避');
      return false;
    }
  }

  // Phase C: Decision Audit Log（監査記録）
  if (typeof recordDecisionAudit === 'function' && typeof calculateSanityScore === 'function') {
    const score = calculateSanityScore('block', {atkPow, blkTou, blkSurvives, atkDies, lifeGap: me.life - opp.life});
    recordDecisionAudit('block', {atkPow, blkTou, turn}, score);
  }

  return baseDecision;
}

// ============================================================
// HEADLESS SIMULATION (v3 — full rule parity)
// ============================================================

class SimGame {
  constructor(w0, w1, d0, d1, l0, l1) {
    this.w = [w0||AI_WEIGHTS, w1||AI_WEIGHTS];
    this.decks = [d0||null, d1||null];     // メインデッキ構成 {cardId: 枚数} or null=デフォルト
    this.landDecks = [l0||null, l1||null]; // 土地デッキ構成 {landId: 枚数} or null=デフォルト
    this.nid = 1;
    this.maxTurns = 50;
    this.tdScores = [[], []]; // #10: intermediate eval scores per player
    this.playedCards = [new Map(), new Map()]; // {cardId → {count, turns[]}} バランス統計用
    // 思考バージョン（プレイヤー別）。'v2'=改良版（既定） / 'v1'=旧版（A/B検証・安全フォールバック用）。
    // SIM_BRAIN_FORCE が設定されていれば測定用にそれを優先する。
    const _db = (typeof SIM_DEFAULT_BRAIN !== 'undefined') ? SIM_DEFAULT_BRAIN : 'v2';
    this.brain = (typeof SIM_BRAIN_FORCE !== 'undefined' && SIM_BRAIN_FORCE)
      ? [SIM_BRAIN_FORCE[0], SIM_BRAIN_FORCE[1]]
      : [_db, _db];
    this.state = this.initState();
  }

  // MCTS等で直後に state を差し替える用途の軽量生成。重い初期デッキ生成(40枚×2シャッフル)を省く。
  // state は null のまま返すので、呼び出し側で必ず sim.state を設定すること。
  static lite() {
    const g = Object.create(SimGame.prototype);
    g.w = [AI_WEIGHTS, AI_WEIGHTS];
    g.decks = [null, null];
    g.landDecks = [null, null];
    g.nid = 1;
    g.maxTurns = 50;
    g.tdScores = [[], []];
    g.playedCards = [new Map(), new Map()];
    const _db = (typeof SIM_DEFAULT_BRAIN !== 'undefined') ? SIM_DEFAULT_BRAIN : 'v2';
    g.brain = (typeof SIM_BRAIN_FORCE !== 'undefined' && SIM_BRAIN_FORCE)
      ? [SIM_BRAIN_FORCE[0], SIM_BRAIN_FORCE[1]]
      : [_db, _db];
    g.state = null;
    return g;
  }

  mkDeck(idx) {
    const counts = this.decks[idx];
    if (counts) {
      const arr = [];
      Object.entries(counts).forEach(([cid,n]) => { for (let k=0;k<n;k++) arr.push(cid); });
      if (arr.length === 40) return shuffle(arr);
    }
    return shuffle(AI_CARD_POOL.flatMap(c=>[c,c,c,c]));
  }
  mkLandDeck(idx) {
    const counts = this.landDecks[idx];
    if (counts) {
      const arr = [];
      let valid = true;
      Object.entries(counts).forEach(([lid,n]) => {
        if (n > 2 && !CARD_DB[lid]?.unlimited) valid = false; // 土地は同名2枚まで（unlimited除く）
        for (let k=0;k<n;k++) arr.push(lid);
      });
      if (valid && arr.length === 10) return shuffle(arr);
    }
    return shuffle(AI_LAND_POOL.flatMap(l=>[l,l]));
  }

  initState() {
    const mk = (idx) => {
      const deck = this.mkDeck(idx);
      const hand = deck.splice(0,7);
      return { life:20, deck, landDeck:this.mkLandDeck(idx), hand,
               field:[], lands:[], mana:{W:0,C:0}, graveyard:[], mulliganUsed:false };
    };
    return { players:[mk(0),mk(1)], turn:0, activePlayer:0, firstPlayer:0 };
  }

  run() {
    this.simMulligan(0); this.simMulligan(1);
    for (let t=0; t<this.maxTurns*2; t++) {
      const ap = this.state.activePlayer;
      if (this.simTurn(ap)) break;
      // #10: collect TD score every 5 turns
      if (this.state.turn % 5 === 0) {
        this.tdScores[0].push(this.simEval(0));
        this.tdScores[1].push(this.simEval(1));
      }
    }
    const [p0,p1] = this.state.players;
    let winner;
    if (p0.life<=0 && p1.life>0) winner = 1;
    else if (p1.life<=0 && p0.life>0) winner = 0;
    else winner = p0.life>=p1.life?0:1;
    // バランス統計: 全5改善対応の詳細記録
    for (let p = 0; p < 2; p++) {
      for (const [cid, info] of this.playedCards[p]) {
        const st = CARD_STATS[cid] || (CARD_STATS[cid] = {
          played:0, wins:0,             // 旧来（互換）
          p0_solo:0, p0_solo_wins:0,    // 改善1+2: P0が単独プレイ
          p1_solo:0, p1_solo_wins:0,    // 改善1+2: P1が単独プレイ
          wt_played:0, wt_wins:0,       // 改善3: プレイ枚数加重
          turn_sum:0, turn_count:0      // 改善5: ターン別補正用
        });
        const oppPlayed = this.playedCards[1-p].has(cid);
        const won = (p === winner);
        // 旧来
        st.played++; if (won) st.wins++;
        // 改善1+2: 排他プレイ（相手がプレイしていない場合のみ）
        if (!oppPlayed) {
          if (p === 0) { st.p0_solo++; if (won) st.p0_solo_wins++; }
          else         { st.p1_solo++; if (won) st.p1_solo_wins++; }
        }
        // 改善3: プレイ回数加重
        st.wt_played += info.count; if (won) st.wt_wins += info.count;
        // 改善5: ターン記録
        info.turns.forEach(t => { st.turn_sum += t; st.turn_count++; });
      }
    }
    return { winner, tdScores:this.tdScores };
  }

  simMulligan(player) {
    const p = this.state.players[player];
    if (p.mulliganUsed) return;
    // 旧実装は手札の type==='land' を数えていたが、このゲームは土地が別デッキ＝手札に土地は
    // 無く、判定が常に成立して毎回3枚マリガンしていた。実AI(aiMulligan)と同じカーブ判定に統一。
    const idxs = _mulliganDecision(p.hand);
    if (idxs.length === 0) return;
    idxs.slice().sort((a, b) => b - a).forEach(i => p.deck.push(p.hand.splice(i, 1)[0]));
    p.deck = shuffle(p.deck);
    idxs.forEach(() => { if (p.deck.length) p.hand.push(p.deck.shift()); });
    p.mulliganUsed = true;
  }

  simTurn(ap) {
    const s = this.state;
    const p = s.players[ap], opp = s.players[1-ap];
    s.turn++;
    // Untap
    p.field.forEach(c=>{ c.tapped=false; c.tempPower=0; c.tempToughness=0; });
    p.lands.forEach(l=>l.tapped=false);
    // Draw: 先行(activePlayer=0想定、turn=1)のみスキップ。後手turn=1はドローあり。
    const _skipDraw = (s.turn === 1 && ap === s.firstPlayer);
    if (!_skipDraw && p.deck.length) p.hand.push(p.deck.shift());
    // Place land
    if (p.landDeck.length) {
      const landId = p.landDeck.shift();
      p.lands.push({ id:this.nid++, cardId:landId, tapped:false, chargeCard:null });
      if (!this.playedCards[ap].has(landId)) this.playedCards[ap].set(landId, {count:0, turns:[]});
      const _lpc = this.playedCards[ap].get(landId); _lpc.count++; _lpc.turns.push(s.turn);
    }
    // Generate mana. クイック呪文(盾撃)を構えるため、状況に応じてW土地を1枚残す（守備対応用）。
    // これにより、次の相手ターンの simAttack で守備側が盾撃を撃てる＝マナを残す価値が
    // ロールアウトに反映され、AIが正しく評価できるようになる。
    p.mana={W:0,C:0};
    let _holdW = this.simShouldHoldForQuick(ap);
    p.lands.forEach(l=>{
      if (l.tapped) return;
      const lc=CARD_DB[l.cardId];
      if (_holdW > 0 && lc.produces==='W') { _holdW--; return; } // 盾撃用にW土地を残す
      p.mana[lc.produces]=(p.mana[lc.produces]||0)+1; l.tapped=true;
    });
    // Charge lands
    this.simChargeLands(ap);
    // Use charged land abilities
    this.simUseLandAbilities(ap);
    // Play cards (creatures + spells)
    this.simPlayCards(ap);
    // Activated abilities (Arestia, etc.)
    this.simUseActivations(ap);
    // Attack
    this.simAttack(ap);
    // End: cure sickness
    p.field.forEach(c=>c.sick=false);
    s.activePlayer=1-ap;
    return p.life<=0 || opp.life<=0;
  }

  // クイック呪文(盾撃)を構えるために残すべきW土地の枚数を返す（0 or 1）。
  // 条件: 手札にクイックがある／相手に攻撃可能なクリーチャーがいる／
  //       残せるW土地を含めてアンタップ土地が2枚以上（残しても展開できる）。
  simShouldHoldForQuick(ap) {
    const s=this.state, p=s.players[ap], opp=s.players[1-ap];
    const hasQuick = p.hand.some(cid=>{ const c=CARD_DB[cid]; return c&&c.keywords&&c.keywords.includes('Quick'); });
    if (!hasQuick) return 0;
    const oppHasAttacker = opp.field.some(c=>{ const cd=CARD_DB[c.cardId]; return cd&&((cd.power||0)+(c.tempPower||0))>0; });
    if (!oppHasAttacker) return 0;
    const untapped = p.lands.filter(l=>!l.tapped);
    if (untapped.length < 2) return 0;
    if (!untapped.some(l=>CARD_DB[l.cardId].produces==='W')) return 0; // 盾撃用のW土地が無ければ残せない
    return 1;
  }

  // 評価関数ディスパッチャ: 脳バージョンに応じてv1(旧)/v2(改良)へ振り分け。
  simEval(player) {
    return this.brain[player] === 'v1' ? this.simEvalV1(player) : this.simEvalV2(player);
  }

  simEvalV1(player) {
    const s = this.state;
    const me=s.players[player], opp=s.players[1-player];
    if (me.life<=0) return -99999;
    if (opp.life<=0) return 99999;
    const w = this.w[player];
    const myPow  = me.field.reduce((sum,c)=>sum+(CARD_DB[c.cardId].power||0)+(c.tempPower||0),0);
    const oppPow = opp.field.reduce((sum,c)=>sum+(CARD_DB[c.cardId].power||0)+(c.tempPower||0),0);
    const myTou  = me.field.reduce((sum,c)=>sum+(CARD_DB[c.cardId].toughness||0)+(c.tempToughness||0),0);
    const oppTou = opp.field.reduce((sum,c)=>sum+(CARD_DB[c.cardId].toughness||0)+(c.tempToughness||0),0);
    let score = w.life*(me.life-opp.life)
              + w.fieldPower*(myPow-oppPow)
              + w.fieldToughness*(myTou-oppTou)
              + w.fieldCount*(me.field.length-opp.field.length)
              + w.handAdv*(me.hand.length-opp.hand.length);
    if (me.life<10) score += w.lateLifeBonus*(me.life-opp.life);
    if (s.turn<=6) score += w.earlyFieldBonus*me.field.length;
    const unplayable = me.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&!this.canAfford(me,c.cost);}).length;
    score -= w.manaEff*unplayable;
    // 手札プレイ可能枚数の優位: 実際に出せるカードが多いほど有利
    const myPlayable = me.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&this.canAfford(me,c.cost);}).length;
    const oppPlayable = opp.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&this.canAfford(opp,c.cost);}).length;
    score += (w.handAdv * 0.5) * (myPlayable - oppPlayable);
    // CX/OC評価: チャージ状況と閾値達成を得点に反映
    const myCX = me.lands.length + me.lands.filter(l=>l.chargeCard).length;
    const oppCX = opp.lands.length + opp.lands.filter(l=>l.chargeCard).length;
    score += w.threshold * (myCX - oppCX);
    if (myCX === 9) score += w.threshold * 3;
    if (myCX >= 10) score += w.threshold * 5;
    if (oppCX === 9) score -= w.threshold * 3;
    if (oppCX >= 10) score -= w.threshold * 5;
    return score;
  }

  // v2: 改良評価関数。
  //  - タフネスの符号を正に固定（GA過学習でマイナスになっていた致命的バグの是正）。
  //  - 回避(飛行)・リーサル距離・テンポ・除去済み盤面差など、勝敗に直結する特徴を追加。
  //  - 係数は重みに比例させ、原理的に妥当な向き（多い/近いほど＋）に統一。
  simEvalV2(player) {
    const s = this.state;
    const me=s.players[player], opp=s.players[1-player];
    if (me.life<=0) return -99999;
    if (opp.life<=0) return 99999;
    const w = this.w[player];
    const F = (typeof V2_FLAGS!=='undefined') ? V2_FLAGS : {evalClamp:true,evalExtra:true,spellFace:true};
    // 符号を健全化したローカル重み（負のタフネス等の過学習を無効化）。
    const wTou = F.evalClamp ? Math.max(0.05, w.fieldToughness) : w.fieldToughness;
    const wPow = F.evalClamp ? Math.max(0.05, w.fieldPower) : w.fieldPower;

    let myPow=0, oppPow=0, myTou=0, oppTou=0, myFly=0, oppFly=0, myReady=0;
    for (const c of me.field) {
      const cd=CARD_DB[c.cardId];
      const p=(cd.power||0)+(c.tempPower||0), t=(cd.toughness||0)+(c.tempToughness||0);
      myPow+=p; myTou+=t;
      if (cd.flying) myFly+=p;                       // 回避: 飛行の打点はブロックされにくい
      if (!c.sick && !c.tapped) myReady+=p;          // テンポ: 即攻撃できる打点
    }
    for (const c of opp.field) {
      const cd=CARD_DB[c.cardId];
      const p=(cd.power||0)+(c.tempPower||0), t=(cd.toughness||0)+(c.tempToughness||0);
      oppPow+=p; oppTou+=t;
      if (cd.flying) oppFly+=p;
    }

    let score = w.life*(me.life-opp.life)
              + wPow*(myPow-oppPow)
              + wTou*(myTou-oppTou)
              + w.fieldCount*(me.field.length-opp.field.length)
              + w.handAdv*(me.hand.length-opp.hand.length);

    // ライフが低いほどライフ価値を高く（終盤の守り/詰め）
    if (me.life<10) score += w.lateLifeBonus*(me.life-opp.life);
    if (s.turn<=6) score += w.earlyFieldBonus*me.field.length;

    // マナ効率・プレイ可能枚数（V1同様）
    const unplayable = me.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&!this.canAfford(me,c.cost);}).length;
    score -= w.manaEff*unplayable;
    const myPlayable = me.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&this.canAfford(me,c.cost);}).length;
    const oppPlayable = opp.hand.filter(cid=>{const c=CARD_DB[cid];return c.cost&&this.canAfford(opp,c.cost);}).length;
    score += (w.handAdv * 0.5) * (myPlayable - oppPlayable);

    // CX/OC評価（V1同様）
    const myCX = me.lands.length + me.lands.filter(l=>l.chargeCard).length;
    const oppCX = opp.lands.length + opp.lands.filter(l=>l.chargeCard).length;
    score += w.threshold * (myCX - oppCX);
    if (myCX === 9) score += w.threshold * 3;
    if (myCX >= 10) score += w.threshold * 5;
    if (oppCX === 9) score -= w.threshold * 3;
    if (oppCX >= 10) score -= w.threshold * 5;

    // ── 改良特徴（v2新規）──────────────────────────────────────
    if (F.evalExtra) {
      // (1) 回避打点: 飛行の打点差は確実に通りやすい→価値を上乗せ。
      score += wPow*0.5*(myFly-oppFly);
      // (2) リーサル距離: 即攻撃可能打点が相手ライフに迫る/到達するほど大きく加点。
      if (opp.life>0) {
        if (myReady>=opp.life) score += w.life*8;                 // 実質リーサル圏
        else score += w.life*1.2*(myReady/opp.life);              // 近いほど加点
      }
      // (3) 被リーサル: 相手の総打点が自分のライフ以上＝負け筋を強く減点。
      if (me.life>0 && oppPow>=me.life) score -= w.life*6;
      // (4) 空盤面ペナルティ: 相手だけ盤面がある状況は危険。
      if (me.field.length===0 && opp.field.length>0) score -= wPow*2;
    }
    return score;
  }

  simChargeLands(ap) {
    const p = this.state.players[ap];
    const uncharged = p.lands.filter(l=>!l.chargeCard);
    if (!uncharged.length || !p.hand.length) return;
    const cxVal = p.lands.length + p.lands.filter(l=>l.chargeCard).length;
    const tgt = uncharged[0];
    const tgtCard = CARD_DB[tgt.cardId];

    // チャージの価値を評価：実際にプレイ可能なカードが増えるか確認
    // 現在のC値でプレイ可能なカード数を数える
    const playableNow = p.hand.filter(cid => {
      const c = CARD_DB[cid];
      if (!c.cost) return true; // コスト不要なカード
      return this.canAfford(p, c.cost);
    }).length;

    // チャージ後のC値でプレイ可能なカード数を数える（土地をタップしたら1C増える仮定）
    const tempMana = {...p.mana};
    tempMana.C = (tempMana.C || 0) + 1; // チャージ後は+1C
    const playableAfterCharge = p.hand.filter(cid => {
      const c = CARD_DB[cid];
      if (!c.cost) return true;
      // 仮のマナで支払えるかを確認（簡易判定）
      const needed = totalCost(c.cost);
      const available = (tempMana.R||0) + (tempMana.U||0) + (tempMana.G||0) +
                        (tempMana.W||0) + (tempMana.B||0) + (tempMana.C||0);
      return available >= needed;
    }).length;

    // チャージによるメリット：C値固有の能力があるか、またはプレイ可能なカードが増えるか
    const hasChargeAbility = tgtCard.chargedAbility || tgtCard.chargeDrawTrigger;
    const newPlayableCards = playableAfterCharge > playableNow;
    const worthCharging = hasChargeAbility || newPlayableCards || cxVal < 9;

    if (!worthCharging) return;

    // チャージするカードを選ぶ（土地優先、その次は低コストカード）
    let idx = p.hand.findIndex(cid=>CARD_DB[cid].type==='land');
    if (idx===-1) idx = p.hand.findIndex(cid=>{ const c=CARD_DB[cid]; return c.type!=='land'&&totalCost(c.cost||{})<=2; });
    if (idx===-1) return;
    const chargeCard = p.hand[idx];
    p.hand.splice(idx,1);
    tgt.chargeCard = chargeCard;
    if (tgtCard.chargeDrawTrigger && p.deck.length) p.hand.push(p.deck.shift());
  }

  simUseLandAbilities(ap) {
    const s = this.state;
    const p = s.players[ap], opp = s.players[1-ap];
    for (const land of [...p.lands]) {
      if (!land.chargeCard) continue;
      const lc = CARD_DB[land.cardId];
      if (!lc.chargedAbility) continue;
      if (lc.chargedAbility === 'look3keep1white') {
        if (land.tapped || !this.canAfford(p,{W:3})) continue;
        land.tapped = true;
        this.payMana(p,{W:1,C:3});
        if (p.deck.length) p.hand.push(p.deck.shift());
      } else if (lc.chargedAbility === 'kaizouReturn') {
        if (!this.simIsOC(p) || land.tapped) continue;
        p.mana.W=(p.mana.W||0)+3;
        const idx=p.lands.indexOf(land); if(idx!==-1){p.lands.splice(idx,1); p.landDeck.push(land.cardId);}
        break;
      } else if (lc.chargedAbility === 'damage5opponent') {
        const idx=p.lands.indexOf(land); if(idx===-1) continue;
        p.lands.splice(idx,1); p.landDeck.push(land.cardId);
        if (opp.field.length) { const tgt=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a); tgt.damage+=5; this.simCheckDeath(1-ap); }
        else opp.life-=5;
        break;
      } else if (lc.chargedAbility === 'buffWhiteCreature') {
        if (land.tapped) continue;
        land.tapped=true;
        const whites=p.field.filter(c=>CARD_DB[c.cardId].color==='W');
        if (whites.length) { const tgt=whites.reduce((a,b)=>this.hp(a)<this.hp(b)?a:b); tgt.tempToughness=(tgt.tempToughness||0)+1; }
      }
    }
  }

  simPlayCards(ap) {
    const s = this.state;
    const p = s.players[ap];
    let limit=15;
    while (limit-->0) {
      const scoreBefore = this.simEval(ap);
      let bestOption=null, bestGain=0;
      // #1: evaluate each playable card by simulating play
      p.hand.forEach((cid,i)=>{
        const card=CARD_DB[cid];
        if (card.type==='creature' && p.field.length<5 && this.canAfford(p,card.cost)) {
          const snap=this.snapshot();
          this.payMana(p,card.cost);
          p.hand.splice(i,1);
          const inst={id:this.nid++,cardId:cid,tapped:false,damage:0,sick:true,tempPower:0,tempToughness:0,entryTurn:s.turn};
          p.field.push(inst);
          this.simETB(ap,inst);
          this.simCheckDeath(0); this.simCheckDeath(1);
          const gain=this.simEval(ap)-scoreBefore + (this.w[ap]['card_'+cid]||0);
          this.restore(snap);
          if (gain>bestGain){bestGain=gain;bestOption={type:'creature',i,cid,card};}
        }
        // クイック(盾撃など)は自分ターンに前のめりに使わず手札に温存する。
        // → 次の相手ターンの simAttack(守備側Quick処理)で反応的に使われ、
        //   「マナを残して割込む」価値がロールアウトに正しく反映される。
        const _isQuick = card.keywords && card.keywords.includes('Quick');
        if (card.type==='spell' && !_isQuick && this.canAfford(p,card.cost)) {
          const gain=this.evalSpellGain(ap,card) + (this.w[ap]['card_'+cid]||0);
          if (gain>bestGain){bestGain=gain;bestOption={type:'spell',i,cid,card};}
        }
      });
      if (!bestOption) break;
      if (!this.playedCards[ap].has(bestOption.cid)) this.playedCards[ap].set(bestOption.cid, {count:0, turns:[]});
      const _pc = this.playedCards[ap].get(bestOption.cid); _pc.count++; _pc.turns.push(s.turn);
      if (bestOption.type==='creature') {
        this.payMana(p,bestOption.card.cost);
        p.hand.splice(bestOption.i,1);
        const inst={id:this.nid++,cardId:bestOption.cid,tapped:false,damage:0,sick:true,tempPower:0,tempToughness:0,entryTurn:s.turn};
        p.field.push(inst);
        this.simETB(ap,inst);
        this.simCheckDeath(0); this.simCheckDeath(1);
      } else {
        this.payMana(p,bestOption.card.cost);
        p.hand.splice(bestOption.i,1);
        this.simSpellEffect(ap,bestOption.card);
        this.simCheckDeath(0); this.simCheckDeath(1);
        p.graveyard.push(bestOption.cid);
      }
    }
  }

  evalSpellGain(ap,card) {
    return this.brain[ap] === 'v1' ? this.evalSpellGainV1(ap,card) : this.evalSpellGainV2(ap,card);
  }

  // v2: バーン呪文の「本体（顔）」評価を修正。
  //  旧コードは存在しない w.lifeAdv を参照し NaN → 比較不成立で「相手が空盤面のとき本体に撃たない」
  //  ＝とどめを逃す致命的バグだった。w.life を用い、リーサルなら強烈に加点して詰めを優先する。
  evalSpellGainV2(ap,card) {
    const s=this.state, opp=s.players[1-ap], me=s.players[ap];
    const w=this.w[ap];
    if (!this.canAfford(me,card.cost)) return -Infinity;
    // 本体ダメージの価値: 通常は w.life*dmg、リーサル(相手ライフ以下)なら巨大ボーナス。
    const faceVal=(dmg)=> (dmg>=opp.life ? w.life*dmg + 10000 : w.life*dmg*1.1);
    if (card.effect==='junigeki' && opp.field.length) {
      const tgt=this.simPickDamageTarget(opp.field, 2);
      const kills=this.hp(tgt) <= 2;
      return kills ? w.fieldPower*(CARD_DB[tgt.cardId].power||1)+w.fieldCount : w.fieldPower*0.5;
    }
    if (card.effect==='kaizen' && opp.field.length) {
      const tgt=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a);
      const kills=(tgt.damage+2)>=(CARD_DB[tgt.cardId].toughness+(tgt.tempToughness||0));
      return (kills?w.fieldPower*(CARD_DB[tgt.cardId].power||1)+w.fieldCount:w.fieldPower*0.3)+w.handAdv*0.3;
    }
    const _spellFace = (typeof V2_FLAGS!=='undefined') ? V2_FLAGS.spellFace : true;
    const faceWhenField = _spellFace ? 0.6 : 0; // 盤面ありでも顔を選好する係数（OFFなら除去のみ）
    if (card.effect==='akageki') {
      if (opp.field.length) { const t=this.simPickDamageTarget(opp.field, 2); const k=this.hp(t) <= 2; const removeVal=k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount:w.fieldPower*0.5; return Math.max(removeVal, faceVal(2)*faceWhenField); }
      return faceVal(2);
    }
    if (card.effect==='iegeki') {
      if (opp.field.length) { const t=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a); const k=this.hp(t) <= 5; const removeVal=k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount*0.5:w.fieldPower*1.5; return Math.max(removeVal, faceVal(5)*faceWhenField) + (this.simIsOC(me)?w.fieldCount*1:0); }
      return faceVal(5) + (this.simIsOC(me)?w.fieldCount*2:0);
    }
    if (card.effect==='ao_geki') {
      if (opp.field.length) { const t=this.simPickDamageTarget(opp.field, 3); const k=this.hp(t) <= 3; const removeVal=k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount:w.fieldPower*0.5; return Math.max(removeVal, faceVal(3)*faceWhenField); }
      return faceVal(3);
    }
    if (card.effect==='mizu_geki') return opp.field.length ? w.fieldCount*0.8+w.fieldPower*0.3 : 0;
    if (card.effect==='hitei') return (this.state.stack||[]).length>=1 ? w.fieldPower*1.5 : -Infinity;
    if (card.effect==='chishiki_no_seiri') return w.handAdv*1.2;
    if (card.effect==='kurogeki') return opp.field.length ? w.fieldPower*1.2+w.fieldCount*0.8 : 0;
    if (card.effect==='shigoeki') {
      const destroyGain = opp.field.length ? w.fieldPower*1.2+w.fieldCount*0.8 : 0;
      const millGain = w.handAdv*0.5;
      return destroyGain + millGain;
    }
    if (card.effect==='kaitaku1spell' || card.id==='tami_kaitaku') return w.threshold*2;
    if (card.effect==='mori_kansha' || card.id==='mori_kansha') {
      // 森への感謝: 土地数ダメージ。相手が空盤面なら本体リーサルも考慮。
      const dmg=me.lands.length;
      const damageGain = dmg>0 ? (opp.field.length ? w.fieldPower*0.8 : faceVal(dmg)*0.6) : 0;
      const kaitakuGain = w.threshold*1.5;
      return damageGain + kaitakuGain;
    }
    return 0;
  }

  evalSpellGainV1(ap,card) {
    const s=this.state, opp=s.players[1-ap], me=s.players[ap];
    const w=this.w[ap];
    if (!this.canAfford(me,card.cost)) return -Infinity;
    if (card.effect==='junigeki' && opp.field.length) {
      const tgt=this.simPickDamageTarget(opp.field, 2); // 実行(simSpellEffect)と同じ対象で評価
      const kills=this.hp(tgt) <= 2;
      return kills ? w.fieldPower*(CARD_DB[tgt.cardId].power||1)+w.fieldCount : w.fieldPower*0.5;
    }
    if (card.effect==='kaizen' && opp.field.length) {
      const tgt=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a);
      const kills=(tgt.damage+2)>=(CARD_DB[tgt.cardId].toughness+(tgt.tempToughness||0));
      return (kills?w.fieldPower*(CARD_DB[tgt.cardId].power||1)+w.fieldCount:w.fieldPower*0.3)+w.handAdv*0.3;
    }
    if (card.effect==='akageki') {
      if (opp.field.length) { const t=this.simPickDamageTarget(opp.field, 2); const k=this.hp(t) <= 2; return k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount:w.fieldPower*0.5; }
      return w.lifeAdv*2;
    }
    if (card.effect==='iegeki') {
      if (opp.field.length) { const t=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a); const k=this.hp(t) <= 5; return k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount*0.5:w.fieldPower*1.5; }
      return w.lifeAdv*5 + (this.simIsOC(me)?w.fieldCount*2:0);
    }
    if (card.effect==='ao_geki') {
      if (opp.field.length) { const t=this.simPickDamageTarget(opp.field, 3); const k=this.hp(t) <= 3; return k?w.fieldPower*(CARD_DB[t.cardId].power||1)+w.fieldCount:w.fieldPower*0.5; }
      return w.lifeAdv*3;
    }
    if (card.effect==='mizu_geki') return opp.field.length ? w.fieldCount*0.8+w.fieldPower*0.3 : 0;
    if (card.effect==='hitei') return (this.state.stack||[]).length>=1 ? w.fieldPower*1.5 : -Infinity;
    if (card.effect==='chishiki_no_seiri') return w.handAdv*1.2;
    if (card.effect==='kurogeki') return opp.field.length ? w.fieldPower*1.2+w.fieldCount*0.8 : 0;
    if (card.effect==='shigoeki') {
      const destroyGain = opp.field.length ? w.fieldPower*1.2+w.fieldCount*0.8 : 0;
      const millGain = w.handAdv*0.5; // ミル効果のマイナス評価は少なめ（墓地活用があるため）
      return destroyGain + millGain;
    }
    if (card.effect==='kaitaku1spell' || card.id==='tami_kaitaku') return w.threshold*2;
    if (card.effect==='mori_kansha' || card.id==='mori_kansha') {
      const damageGain = me.lands.length > 0 ? w.fieldPower*0.8 : 0;
      const kaitakuGain = w.threshold*1.5;
      return damageGain + kaitakuGain;
    }
    return 0;
  }

  simSpellEffect(ap,card) {
    const s=this.state, opp=s.players[1-ap], me=s.players[ap];
    // v2: バーンが本体リーサルなら、相手クリーチャーではなく顔に撃って勝つ（詰めの取りこぼし防止）。
    if (this.brain[ap]==='v2' && ((typeof V2_FLAGS!=='undefined') ? V2_FLAGS.spellFace : true)) {
      const faceDmg = ({akageki:2, ao_geki:3, iegeki:5})[card.effect]
        || ((card.effect==='mori_kansha'||card.id==='mori_kansha') ? me.lands.length : 0);
      if (faceDmg>0 && faceDmg>=opp.life) { opp.life-=faceDmg; return; }
    }
    if (card.effect==='junigeki') {
      if (opp.field.length) {
        const tgt=this.simPickDamageTarget(opp.field, 2); // 倒せる最大の脅威を優先（実AIと整合）
        tgt.damage+=2;
        if (me.field.length) { const ally=me.field.reduce((a,b)=>this.hp(a)<this.hp(b)?a:b); ally.tempToughness=(ally.tempToughness||0)+1; }
      } else opp.life-=3;
    } else if (card.effect==='kaizen') {
      // 効果1: 5 damage to strongest opp creature
      if (opp.field.length) { const tgt=opp.field.reduce((a,b)=>this.hp(b)>this.hp(a)?b:a); tgt.damage+=5; this.simCheckDeath(1-ap); }
      // 効果2: mustAttack (sim simplification: skip flag, minimal impact)
      // 効果3+OC: play cheapest creature from hand (simplified)
      if (this.simIsOC(me)) {
        const idx=me.hand.findIndex(cid=>{ const c=CARD_DB[cid]; return c.type==='creature'&&totalCost(c.cost||{})<=8&&me.field.length<5; });
        if (idx!==-1) {
          const cid=me.hand.splice(idx,1)[0];
          const inst={id:this.nid++,cardId:cid,tapped:false,damage:0,sick:true,tempPower:0,tempToughness:0,entryTurn:s.turn};
          me.field.push(inst);
          this.simETB(ap,inst);
        }
      }
    } else if (card.effect==='akageki') {
      const killable = opp.field.find(c => this.hp(c) <= 2);
      if (killable) {
        killable.damage += 2;
        this.simCheckDeath(1-ap);
      } else if (opp.field.length) {
        const tgt = opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a);
        tgt.damage += 2;
        this.simCheckDeath(1-ap);
      } else {
        opp.life -= 2;
      }
    } else if (card.effect==='iegeki') {
      const killable = opp.field.find(c => this.hp(c) <= 5);
      if (killable) {
        killable.damage += 5;
        this.simCheckDeath(1-ap);
      } else if (opp.field.length) {
        const tgt = opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a);
        tgt.damage += 5;
        this.simCheckDeath(1-ap);
      } else {
        opp.life -= 5;
      }
      if (this.simIsOC(me)) {
        const idx = me.hand.findIndex(cid=>{ const c=CARD_DB[cid]; return c.type==='creature'&&c.color==='R'&&totalCost(c.cost||{})<=8&&me.field.length<5; });
        if (idx !== -1) {
          const cid = me.hand.splice(idx,1)[0];
          const inst = {id:this.nid++,cardId:cid,tapped:false,damage:0,sick:true,tempPower:0,tempToughness:0,entryTurn:s.turn};
          me.field.push(inst);
          this.simETB(ap,inst);
        }
      }
    } else if (card.effect==='ao_geki') {
      if (opp.field.length) { const t=this.simPickDamageTarget(opp.field, 3); t.damage+=3; this.simCheckDeath(1-ap); }
      else opp.life-=3;
    } else if (card.effect==='mizu_geki') {
      if (opp.field.length) { const t=opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a); const ix=opp.field.indexOf(t); if(ix!==-1){opp.field.splice(ix,1); opp.hand.push(t.cardId);} }
    } else if (card.effect==='hitei') {
      if ((s.stack||[]).length>=1) s.stack.splice(s.stack.length-1,1);
    } else if (card.effect==='chishiki_no_seiri') {
      // draw 2, discard 1 (sim: net +1 hand)
      for(let i=0;i<2;i++){if(me.deck.length)me.hand.push(me.deck.shift());}
      if(me.hand.length>1){me.hand.shift();}
    } else if (card.effect==='kurogeki') {
      // 黒撃: クリーチャー破壊（最大パワー優先）
      if (opp.field.length) {
        const tgt = opp.field.reduce((a,b)=>(CARD_DB[b.cardId].power||0)>(CARD_DB[a.cardId].power||0)?b:a);
        const ix = opp.field.indexOf(tgt);
        if (ix !== -1) {
          opp.field.splice(ix, 1);
          if (!opp.graveyard) opp.graveyard = [];
          opp.graveyard.push(tgt.cardId);
          this.simCheckDeath(1-ap);
        }
      }
    } else if (card.effect==='shigoeki') {
      // 死越撃: クリーチャー破壊 + mill5
      if (opp.field.length) {
        const tgt = opp.field.reduce((a,b)=>(CARD_DB[b.cardId].power||0)>(CARD_DB[a.cardId].power||0)?b:a);
        const ix = opp.field.indexOf(tgt);
        if (ix !== -1) {
          opp.field.splice(ix, 1);
          if (!opp.graveyard) opp.graveyard = [];
          opp.graveyard.push(tgt.cardId);
          this.simCheckDeath(1-ap);
        }
      }
      // mill 5
      for (let i = 0; i < 5 && me.deck.length > 0; i++) {
        const card = me.deck.shift();
        if (!me.graveyard) me.graveyard = [];
        me.graveyard.push(card);
      }
    } else if (card.effect==='kaitaku1spell' || card.id==='tami_kaitaku') {
      // 民による開拓: 開拓:1 (sim: kaitakuTurns++)
      if (!s.kaitakuTurns) s.kaitakuTurns = 0;
      s.kaitakuTurns++;
    } else if (card.effect==='mori_kansha' || card.id==='mori_kansha') {
      // 森への感謝: 土地数分ダメージ + 開拓:1
      const damageAmount = me.lands.length;
      if (damageAmount > 0 && opp.field.length) {
        const tgt = opp.field.reduce((a,b)=>this.hp(b)<this.hp(a)?b:a);
        tgt.damage += damageAmount;
        this.simCheckDeath(1-ap);
      } else if (damageAmount > 0) {
        opp.life -= damageAmount;
      }
      if (!s.kaitakuTurns) s.kaitakuTurns = 0;
      s.kaitakuTurns++;
    }
  }

  simUseActivations(ap) {
    const s=this.state, p=s.players[ap];
    // Arestia 還元: アンタップ土地1枚を土地デッキ底に置く → 味方タップクリーチャー1体をアンタップ
    const hasArestia=p.field.some(c=>CARD_DB[c.cardId].id==='arestia'&&!c.sick);
    if (hasArestia) {
      const untappedLand=p.lands.find(l=>!l.tapped);
      const tappedCreature=p.field.filter(c=>c.tapped&&CARD_DB[c.cardId].id!=='arestia');
      if (untappedLand && tappedCreature.length) {
        // 還元コスト: 最も価値の低いアンタップ土地を返す
        const lIdx=p.lands.indexOf(untappedLand);
        p.lands.splice(lIdx,1);
        p.landDeck.push(untappedLand.cardId);
        // 効果: 最も強いタップクリーチャーをアンタップ
        const best=tappedCreature.reduce((a,b)=>(CARD_DB[b.cardId].power||0)>(CARD_DB[a.cardId].power||0)?b:a);
        best.tapped=false;
      }
    }
  }

  simETB(ap,inst) {
    // #8: Better ETB targeting — prefer lethal targets
    const s=this.state, card=CARD_DB[inst.cardId];
    const opp=s.players[1-ap], me=s.players[ap];
    if (!card.etb) return;
    const dealDmg=(dmg)=>{
      if (opp.field.length) {
        const lethal=opp.field.find(c=>this.hp(c)<=dmg);
        const highThreat=opp.field.reduce((a,b)=>(CARD_DB[b.cardId].power||0)>(CARD_DB[a.cardId].power||0)?b:a);
        const tgt=lethal||highThreat;
        tgt.damage+=dmg; this.simCheckDeath(1-ap);
      } else opp.life-=dmg;
    };
    if (card.etb==='damage1opponent') dealDmg(1);
    else if (card.etb==='damage2opponent_always_cx6damage3') dealDmg(2);
    else if (card.etb==='damage3opponent') dealDmg(3);
    else if ((card.etb==='look3keep1white'||card.etb==='look3keep1blue'||card.etb==='look2keep1red') && me.deck.length) me.hand.push(me.deck.shift());
    else if (card.etb==='draw1' && me.deck.length) me.hand.push(me.deck.shift());
    else if (card.etb==='omnieru_hand5') { while(me.hand.length<5&&me.deck.length) me.hand.push(me.deck.shift()); }
    else if (card.etb==='mustAttackTarget') {
      if (opp.field.length) {
        const weakest=opp.field.reduce((a,b)=>(CARD_DB[a.cardId].power||0)<=(CARD_DB[b.cardId].power||0)?a:b);
        weakest.mustAttack=true;
      }
    }
  }

  simCheckDeath(p) {
    const pl=this.state.players[p];
    pl.field=pl.field.filter(c=>{ const cd=CARD_DB[c.cardId]; return c.damage<(cd.toughness||0)+(c.tempToughness||0); });
  }

  simAttack(ap) {
    const s=this.state, p=s.players[ap], opp=s.players[1-ap];
    const w=this.w[ap];
    // 守備側が手札にクイック(盾撃)を持つ場合、残しているアンタップ土地をマナ化して対応できるようにする。
    // （実ゲームの優先権と同じ。前ターンに simTurn が残したW土地が、ここで盾撃のマナになる。）
    const _oppHasQuick = opp.hand.some(cid=>{ const c=CARD_DB[cid]; return c&&c.keywords&&c.keywords.includes('Quick'); });
    if (_oppHasQuick) {
      opp.lands.forEach(l=>{ if(!l.tapped){ const lc=CARD_DB[l.cardId]; opp.mana[lc.produces]=(opp.mana[lc.produces]||0)+1; l.tapped=true; } });
    }
    // Arestia passive: if ap attacks and opp has Arestia, buff opp creatures
    if (opp.field.some(c=>CARD_DB[c.cardId].id==='arestia')) {
      opp.field.forEach(c=>{ c.tempPower=(c.tempPower||0)+1; c.tempToughness=(c.tempToughness||0)+1; });
    }
    const attackers=p.field.filter(c=>{
      const cd=CARD_DB[c.cardId];
      if (c.tapped&&!cd.vigilance) return false;
      if (c.sick&&!(cd.kakutou&&c.entryTurn===s.turn)) return false;
      return true;
    });
    // リーサル判定: ブロックで止められる分を引いても相手ライフ以上なら総攻撃
    const candPow=attackers.reduce((sum,c)=>sum+(CARD_DB[c.cardId].power||0)+(c.tempPower||0),0);
    const freeBlk=opp.field.filter(b=>!b.tapped).length;
    const sortedPow=attackers.map(c=>(CARD_DB[c.cardId].power||0)+(c.tempPower||0)).sort((a,b)=>a-b);
    const blockedPow=sortedPow.slice(0,freeBlk).reduce((a,b)=>a+b,0);
    const lethal=(candPow-blockedPow)>=opp.life;
    for (const atk of attackers) {
      const atkCard=CARD_DB[atk.cardId];
      const atkPow=(atkCard.power||0)+(atk.tempPower||0);
      const atkTou=(atkCard.toughness||0)+(atk.tempToughness||0);
      // #2: predict block outcome, decide whether to attack
      const eligibleBlockers=opp.field.filter(b=>{
        if (b.tapped) return false;
        if (atkCard.flying&&!CARD_DB[b.cardId].flying) return false;
        if (!atkCard.flying&&CARD_DB[b.cardId].flying) return false;
        return true;
      });
      const pb=this.simPickBlocker(1-ap,atk,eligibleBlockers,atkPow);
      let attackValue;
      if (pb) {
        const blkPow=(CARD_DB[pb.cardId].power||0)+(pb.tempPower||0);
        const blkTou=(CARD_DB[pb.cardId].toughness||0)+(pb.tempToughness||0);
        const atkDies=(atkTou-atk.damage)<=blkPow;
        const blkDies=(blkTou-pb.damage)<=atkPow;
        attackValue=(blkDies?w.fieldPower*blkPow+w.fieldCount:0)-(atkDies?w.fieldPower*atkPow+w.fieldCount:0);
      } else {
        attackValue=w.life*atkPow*0.8;
      }
      const oppHasArestia = opp.field.some(c=>CARD_DB[c.cardId].id==='arestia');
      if (!lethal && !atk.mustAttack && !oppHasArestia && attackValue+w.attackBias<=0) continue; // #2: skip bad attacks (リーサル時は強行)
      if (!atkCard.vigilance) atk.tapped=true;
      // kakutou: pick best target (#8)
      if (atkCard.kakutou&&atk.entryTurn===s.turn) {
        if (opp.field.length) {
          const tgt=opp.field.reduce((best,c)=>{
            const kills=this.hp(c)<=atkPow, bestKills=this.hp(best)<=atkPow;
            if (kills&&!bestKills) return c; if (!kills&&bestKills) return best;
            return (CARD_DB[c.cardId].power||0)>(CARD_DB[best.cardId].power||0)?c:best;
          });
          tgt.damage+=atkPow; atk.damage+=(CARD_DB[tgt.cardId].power||0)+(tgt.tempPower||0);
          this.simCheckDeath(ap); this.simCheckDeath(1-ap);
        }
        continue;
      }
      if (pb) {
        const blkPow=(CARD_DB[pb.cardId].power||0)+(pb.tempPower||0);
        pb.damage+=atkPow; atk.damage+=blkPow; pb.tapped=true;
        // onBlock effects
        const bc=CARD_DB[pb.cardId];
        if (bc.onBlock==='draw1'&&opp.deck.length) opp.hand.push(opp.deck.shift());
        if (bc.onBlock==='gain3life') opp.life+=3;
        if (bc.onBlock==='damage2attacker'||bc.onBlock==='damage2attackerAndCopy') atk.damage+=2;
        this.simCheckDeath(ap); this.simCheckDeath(1-ap);
        // Arestia onBlockComplete: 削除 (アレスティアはonAttackCopyに変更)
      } else {
        // #6: opponent uses Quick spell (junigeki) if available during attack
        const quickIdx=opp.hand.findIndex(cid=>{ const c=CARD_DB[cid]; return c.keywords&&c.keywords.includes('Quick')&&this.canAfford(opp,c.cost||{}); });
        if (quickIdx!==-1) {
          const qcid=opp.hand.splice(quickIdx,1)[0];
          const qcard=CARD_DB[qcid];
          this.payMana(opp,qcard.cost||{});
          this.simSpellEffect(1-ap,qcard);
          opp.graveyard.push(qcid);
          this.simCheckDeath(ap); this.simCheckDeath(1-ap);
          // Check attacker still alive after Quick
          if (!p.field.includes(atk)) continue;
        }
        opp.life-=atkPow;
      }
    }
  }

  simPickBlocker(defender,atk,candidates,atkPow) {
    if (!candidates.length) return null;
    const w=this.w[defender];
    let best=null, bestVal=-Infinity;
    for (const b of candidates) {
      const bc=CARD_DB[b.cardId];
      const blkPow=(bc.power||0)+(b.tempPower||0);
      const blkTou=(bc.toughness||0)+(b.tempToughness||0);
      const bSurvives=(blkTou-b.damage)>atkPow;
      const aDies=((CARD_DB[atk.cardId].toughness||0)-atk.damage)<=blkPow;
      let val=(aDies?w.fieldPower*atkPow+w.fieldCount:0)
             -(bSurvives?0:w.fieldPower*blkPow+w.fieldCount)
             +w.life*atkPow*w.blockRisk;
      if (val>bestVal){bestVal=val;best=b;}
    }
    return bestVal>0?best:null;
  }

  hp(inst) {
    const cd=CARD_DB[inst.cardId];
    return (cd.toughness||0)+(inst.tempToughness||0)-inst.damage;
  }
  pow(inst) {
    const cd=CARD_DB[inst.cardId];
    return (cd.power||0)+(inst.tempPower||0);
  }
  // 直接ダメージの対象: damageで倒せる相手の中で最大パワー。倒せる相手がいなければ最小hp(布石)。
  // 実AI(aiBestKillableTarget)と同じ「倒せる最大の脅威を除去」方針に揃える。
  simPickDamageTarget(field, damage) {
    if (!field.length) return null;
    const killable = field.filter(c => this.hp(c) <= damage);
    if (killable.length) return killable.reduce((a,b)=> this.pow(b) > this.pow(a) ? b : a);
    return field.reduce((a,b)=> this.hp(b) < this.hp(a) ? b : a);
  }

  simIsOC(p) { const ls=p.lands||[]; return ls.length + ls.filter(l=>l.chargeCard).length >= 10; }

  canAfford(p,cost) {
    if (!cost) return false;
    const m={...p.mana};
    for (const [k,v] of Object.entries(cost)) { if ((m[k]||0)<v) return false; m[k]-=v; }
    return true;
  }
  payMana(p,cost) { for (const [k,v] of Object.entries(cost)) p.mana[k]=(p.mana[k]||0)-v; }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  restore(snap) { this.state=JSON.parse(JSON.stringify(snap)); }
}

// ── MCTS (Monte Carlo Tree Search) ──────────────────────────────────
const MCTS_EXPLORATION = 1.414; // UCB1 exploration constant
const MCTS_ROLLOUT_DEPTH = 22;  // max turns per rollout
// 反復上限。生成高速化により同一時間で多数探索できるため、実質「時間予算」を律速にする。
const MCTS_MAX_ITERS = 6000;
let MCTS_LAST_ITERS = 0; // 診断用: 直近 mctsSearch の反復数
// 改善8: 局面に応じた時間予算（通常/終盤/クリティカル）。探索の質を上げるため引き上げ。
const MCTS_TIME_NORMAL    = 500; // ms - 通常
const MCTS_TIME_LATE      = 800; // ms - 終盤（どちらかのライフ<=10）
const MCTS_TIME_CRITICAL  = 1100; // ms - 超終盤（ライフ<=5 or OC条件付近）
const MCTS_TIME_BUDGET_MS = MCTS_TIME_NORMAL; // backward compat

function mctsTimeBudget() {
  const scale = RATED_MODE ? eloTierOf(RATED_OPP_RATING).mctsScale : 1.0;
  if (!G) return Math.round(MCTS_TIME_NORMAL * scale);
  const p0 = G.players[0], p1 = G.players[1];
  const minLife = Math.min(p0.life, p1.life);
  const graveTotal = p0.graveyard.length + p1.graveyard.length;
  let base;
  if (minLife <= 5 || graveTotal >= 18) base = MCTS_TIME_CRITICAL;
  else if (minLife <= 10 || G.turn >= 8) base = MCTS_TIME_LATE;
  else base = MCTS_TIME_NORMAL;
  return Math.round(base * scale);
}

class MCTSNode {
  constructor(state, parent, action, simNid) {
    this.state = state;       // SimGame state snapshot
    this.parent = parent;
    this.action = action;     // {type:'play'|'attack'|'pass', ...} action that led here
    this.children = [];
    this.visits = 0;
    this.wins = 0.0;
    this.untriedActions = null; // null = not yet expanded
    this._nid = simNid || 1;
  }

  ucb1() {
    if (this.visits === 0) return Infinity;
    return this.wins / this.visits
      + MCTS_EXPLORATION * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }

  bestChild() {
    return this.children.reduce((best, c) => c.ucb1() > best.ucb1() ? c : best);
  }

  mostVisitedChild() {
    return this.children.reduce((best, c) => c.visits > best.visits ? c : best);
  }
}

// Convert current G.players to SimGame-compatible state
function mctsStateFromG() {
  const players = G.players.map((p, i) => {
    const field = p.field.map(c => ({
      id: c.instanceId,
      cardId: c.cardId,
      tapped: c.tapped || false,
      damage: c.damage || 0,
      sick: c.sick || false,
      tempPower: c.tempPower || 0,
      tempToughness: c.tempToughness || 0,
      entryTurn: c.entryTurn || G.turn,
      mustAttack: c.mustAttack || false,
    }));
    // Approximate total mana as W (SimGame uses W/C only)
    const totalMana = Object.values(p.mana).reduce((s,v)=>s+v, 0);
    return {
      life: p.life,
      hand: [...p.hand],
      deck: [...p.deck],
      landDeck: [...p.landDeck],
      field,
      lands: p.lands.map(l => ({...l})),
      mana: { W: p.mana.W || 0, C: totalMana - (p.mana.W||0) },
      graveyard: [...p.graveyard],
      mulliganUsed: true,
    };
  });
  return { players, turn: G.turn, activePlayer: G.activePlayer, firstPlayer: G.firstPlayer ?? G.activePlayer };
}

// Determinization: replace opponent (p0) hand with random sample from their deck
// This models hidden-information MCTS (single-observer determinization)
function deterministicState(baseState) {
  const s = JSON.parse(JSON.stringify(baseState));
  const p0 = s.players[0];
  const handSize = p0.hand.length;
  if (handSize === 0 || p0.deck.length === 0) return s;
  // shuffle deck copy and take handSize cards as the "sampled" hand
  const deck = [...p0.deck];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  p0.hand = deck.slice(0, Math.min(handSize, deck.length));
  p0.deck = deck.slice(p0.hand.length);
  return s;
}

// Enumerate possible actions from an AI-turn SimGame state (player=1, main phase)
function mctsEnumerateActions(simState, nid) {
  const sim = SimGame.lite();
  sim.state = JSON.parse(JSON.stringify(simState));
  sim.nid = nid;
  const p1 = sim.state.players[1];
  const actions = [];

  // Action: play each affordable non-land card
  p1.hand.forEach((cid, i) => {
    const card = CARD_DB[cid];
    if (card && card.type !== 'land' && sim.canAfford(p1, card.cost)) {
      actions.push({ type: 'play', handIdx: i, cardId: cid });
    }
  });

  // Action: pass (end main phase, go to attack)
  actions.push({ type: 'pass' });

  return actions;
}

// Apply an action to a SimGame state, return new state snapshot + new nid
function mctsApplyAction(simState, action, nid) {
  const sim = SimGame.lite();
  sim.state = JSON.parse(JSON.stringify(simState));
  sim.nid = nid;
  const ap = 1; // AI is always player 1
  const p = sim.state.players[ap];

  if (action.type === 'play') {
    // Re-find the card by cardId (index may shift after previous plays)
    const idx = p.hand.indexOf(action.cardId);
    if (idx === -1) return { state: sim.snapshot(), nid: sim.nid };
    const card = CARD_DB[action.cardId];
    if (card && card.type === 'creature' && p.field.length < 5 && sim.canAfford(p, card.cost)) {
      sim.payMana(p, card.cost);
      p.hand.splice(idx, 1);
      const inst = { id: sim.nid++, cardId: action.cardId, tapped: false, damage: 0, sick: true,
                     tempPower: 0, tempToughness: 0, entryTurn: sim.state.turn };
      p.field.push(inst);
      sim.simETB(ap, inst);
      sim.simCheckDeath(0); sim.simCheckDeath(1);
    } else if (card && card.type === 'spell' && sim.canAfford(p, card.cost)) {
      sim.payMana(p, card.cost);
      p.hand.splice(idx, 1);
      sim.simSpellEffect(ap, card);
      sim.simCheckDeath(0); sim.simCheckDeath(1);
      p.graveyard.push(action.cardId);
    }
  }
  // 'pass': no state change, just ends main phase
  return { state: sim.snapshot(), nid: sim.nid };
}

// Rollout: play game to completion from simState, return 1 if P1 wins, 0 otherwise
// 改善7: P0もheuristic（SimGame.simPlayCards＋simAttack）でプレイ → ランダムより精度高
function mctsRollout(simState, nid) {
  const sim = SimGame.lite();
  sim.state = JSON.parse(JSON.stringify(simState));
  sim.nid = nid;
  sim.maxTurns = MCTS_ROLLOUT_DEPTH;
  // both players use SimGame's heuristic (not random)
  let guard = 0;
  while (guard++ < MCTS_ROLLOUT_DEPTH * 2) {
    const ap = sim.state.activePlayer;
    if (sim.simTurn(ap)) break;
  }
  const [p0, p1] = sim.state.players;
  if (p1.life <= 0) return 0;
  if (p0.life <= 0) return 1;
  // ライフ差・盤面差の両方を考慮したソフト評価（0〜1）
  const eval1 = sim.simEval(1);
  if (eval1 > 500) return 1;
  if (eval1 < -500) return 0;
  // 中間的な局面はスコアをシグモイドで0〜1に変換
  return 1 / (1 + Math.exp(-eval1 * 0.02));
}

// MCTS search: find best sequence of card plays for AI (player 1)
// Returns array of cardIds to play in order
function mctsSearch(timeMs) {
  try {
    const deadline = Date.now() + (timeMs || mctsTimeBudget());
    const rootState = mctsStateFromG();
    const root = new MCTSNode(rootState, null, null, 1);
    root.untriedActions = mctsEnumerateActions(rootState, 1);

    let iterations = 0;
    // 反復上限を引き上げ、実質的に「時間予算」を律速にする。
    // 無引数SimGame生成の高速化(約56倍)で同じ時間でも遥かに多く探索できるようになった。
    while (Date.now() < deadline && iterations < MCTS_MAX_ITERS) {
      iterations++;
      try {
        // 1. Selection: walk tree using UCB1
        let node = root;
        while (node.untriedActions !== null && node.untriedActions.length === 0 && node.children.length > 0) {
          node = node.bestChild();
        }

        // 2. Expansion: try one untried action
        if (node.untriedActions === null) {
          node.untriedActions = mctsEnumerateActions(node.state, node._nid);
        }
        if (node.untriedActions.length > 0) {
          const actionIdx = Math.floor(Math.random() * node.untriedActions.length);
          const action = node.untriedActions.splice(actionIdx, 1)[0];
          const { state: newState, nid: newNid } = mctsApplyAction(node.state, action, node._nid);
          const child = new MCTSNode(newState, node, action, newNid);
          if (action.type === 'play') {
            child.untriedActions = mctsEnumerateActions(newState, newNid);
          } else {
            child.untriedActions = []; // pass is a leaf
          }
          node.children.push(child);
          node = child;
        }

        // 3. Rollout
        const result = mctsRollout(node.state, node._nid);

        // 4. Backpropagation
        let cur = node;
        while (cur !== null) {
          cur.visits++;
          cur.wins += result;
          cur = cur.parent;
        }
      } catch (eIter) {
        // 1イテレーションのシミュレーション失敗（未対応カード効果など）は無視して継続
      }
    }
    MCTS_LAST_ITERS = iterations; // 診断用: 直近の探索反復数

    // Extract best action sequence: follow most-visited path
    const plays = [];
    let cur = root;
    while (cur.children.length > 0) {
      const best = cur.mostVisitedChild();
      if (!best.action || best.action.type !== 'play') break;
      plays.push(best.action.cardId);
      cur = best;
    }
    return plays;
  } catch (e) {
    console.error('[mctsSearch] fallback to greedy:', e);
    return []; // 探索全体が失敗 → 呼び出し側のgreedyフォールバックに委ねる
  }
}

// ── 改善5: 攻撃者選択MCTS ──────────────────────────────────────────
// AI(P1)の攻撃フェーズで「どのクリーチャーで攻撃するか」をMCTSで決定
// candidates: real G field instances of player 1
// Returns Set of instanceIds to attack with
function mctsPickAttackers(candidates) {
  if (candidates.length === 0) return new Set();
  if (candidates.length === 1) return new Set([candidates[0].instanceId]);

  const budget = Math.min(mctsTimeBudget(), 350); // 攻撃選択は少し短め
  const deadline = Date.now() + budget;
  const baseState = mctsStateFromG();

  // 攻撃者の組み合わせを列挙（最大15通り）
  const atkCombos = [];
  const n = candidates.length;
  // 全組み合わせ（2^n通り、ただし最大6体なので最大64）
  const limit = Math.min(1 << n, 32);
  for (let mask = 1; mask < limit; mask++) {
    const combo = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) combo.push(candidates[i].instanceId);
    }
    atkCombos.push(combo);
  }

  // 各組み合わせのシミュレーション結果を集計
  const wins = new Array(atkCombos.length).fill(0);
  const trials = new Array(atkCombos.length).fill(0);
  let ci = 0;

  while (Date.now() < deadline) {
    const idx = ci % atkCombos.length;
    ci++;
    const atkIds = atkCombos[idx];
    const sim = SimGame.lite();
    sim.state = deterministicState(baseState);
    // 選択した攻撃者をシム内でシミュレート
    const s = sim.state, p1 = s.players[1], p0 = s.players[0];
    // 各攻撃者でブロッカーを選ばせて戦闘解決
    for (const instId of atkIds) {
      const atk = p1.field.find(c => c.id === instId);
      if (!atk) continue;
      const atkCard = CARD_DB[atk.cardId];
      if (!atkCard.vigilance) atk.tapped = true;
      // ブロッカー選択（SimGame流）
      const eligible = p0.field.filter(b => !b.tapped && sim._canFlyBlock(atk, b));
      const blocker = sim.simPickBlocker(0, atk, eligible,
        (atkCard.power||0)+(atk.tempPower||0));
      if (blocker) {
        const atkPow = (atkCard.power||0)+(atk.tempPower||0);
        const blkPow = (CARD_DB[blocker.cardId].power||0)+(blocker.tempPower||0);
        blocker.damage += atkPow; atk.damage += blkPow; blocker.tapped = true;
        sim.simCheckDeath(0); sim.simCheckDeath(1);
      } else {
        p0.life -= (atkCard.power||0)+(atk.tempPower||0);
      }
    }
    // 残りのターンをheuristicでシミュレート
    let g = 0;
    while (g++ < MCTS_ROLLOUT_DEPTH * 2 && p0.life > 0 && p1.life > 0) {
      if (sim.simTurn(sim.state.activePlayer)) break;
    }
    const result = p1.life > 0 && p0.life <= 0 ? 1
      : p0.life > 0 && p1.life <= 0 ? 0
      : 1 / (1 + Math.exp(-sim.simEval(1) * 0.02));
    wins[idx] += result;
    trials[idx]++;
  }

  // 最も勝率の高い組み合わせを返す
  let bestIdx = 0, bestRate = -1;
  for (let i = 0; i < atkCombos.length; i++) {
    if (trials[i] === 0) continue;
    const rate = wins[i] / trials[i];
    if (rate > bestRate) { bestRate = rate; bestIdx = i; }
  }
  return new Set(atkCombos[bestIdx]);
}

// ── 改善6: ブロック割り当てMCTS ────────────────────────────────────
// AI(P1)が守るとき「どのブロッカーをどの攻撃者に当てるか」をMCTSで決定
// attackerInsts: P0の攻撃クリーチャー配列（real G）
// Returns {atkInstId: blkInstId} mapping
function mctsPickBlockers(attackerInsts) {
  const ai = G.players[1];
  const eligible = ai.field.filter(c => {
    const cd = CARD_DB[c.cardId];
    return (cd.ocBlockWhileTapped && isOCActive(1)) || !c.tapped;
  });
  if (eligible.length === 0 || attackerInsts.length === 0) return {};

  const budget = Math.min(mctsTimeBudget(), 300);
  const deadline = Date.now() + budget;
  const baseState = mctsStateFromG();

  // 割り当て候補を列挙（各攻撃者に「誰をあてるか or なし」）
  // 単純化: 攻撃者を強い順に並べ、ブロッカーを順次割り当てる全順列
  const sortedAtk = [...attackerInsts].sort(
    (a,b) => getEffectivePower(0,b) - getEffectivePower(0,a));
  const sortedBlk = [...eligible].filter(b =>
    attackerInsts.some(a => canFlyBlock(a, b)));

  // 割り当てパターン生成（最大8パターン）
  const assignments = [{}]; // まず「全部ブロックしない」
  // 1対1の最有力割り当てパターンをいくつか追加
  for (let ai2 = 0; ai2 < Math.min(sortedAtk.length, 3); ai2++) {
    for (let bi = 0; bi < Math.min(sortedBlk.length, 3); bi++) {
      if (!canFlyBlock(sortedAtk[ai2], sortedBlk[bi])) continue;
      const a = {}; a[sortedAtk[ai2].instanceId] = sortedBlk[bi].instanceId;
      assignments.push(a);
    }
  }
  // 貪欲な全ブロック割り当て（強い攻撃者→最善ブロッカー）
  const greedyA = {};
  const usedBlk = new Set();
  for (const atk of sortedAtk) {
    const b = sortedBlk.find(bl => !usedBlk.has(bl.instanceId) && canFlyBlock(atk, bl));
    if (b) { greedyA[atk.instanceId] = b.instanceId; usedBlk.add(b.instanceId); }
  }
  if (Object.keys(greedyA).length > 0) assignments.push(greedyA);

  const wins = new Array(assignments.length).fill(0);
  const trials = new Array(assignments.length).fill(0);
  let ci = 0;

  while (Date.now() < deadline) {
    const idx = ci % assignments.length;
    ci++;
    const assign = assignments[idx];
    const sim = SimGame.lite();
    sim.state = deterministicState(baseState);
    const s = sim.state, p0 = s.players[0], p1 = s.players[1];
    // 割り当て通りに戦闘解決
    for (const atk of sortedAtk) {
      const atkInst = p0.field.find(c => c.id === atk.instanceId);
      if (!atkInst) continue;
      const atkPow = getEffectivePower(0, atk);
      const blkInstId = assign[atk.instanceId];
      const blkInst = blkInstId ? p1.field.find(c => c.id === blkInstId) : null;
      if (blkInst) {
        const blkPow = getEffectivePower(1, ai.field.find(c=>c.instanceId===blkInstId)||atk);
        blkInst.damage += atkPow;
        atkInst.damage += blkPow;
        sim.simCheckDeath(0); sim.simCheckDeath(1);
      } else {
        p1.life -= atkPow;
      }
    }
    // 残りのターンをheuristicでシミュレート
    let g = 0;
    while (g++ < MCTS_ROLLOUT_DEPTH * 2 && p0.life > 0 && p1.life > 0) {
      if (sim.simTurn(sim.state.activePlayer)) break;
    }
    const result = p1.life > 0 && p0.life <= 0 ? 1
      : p0.life > 0 && p1.life <= 0 ? 0
      : 1 / (1 + Math.exp(-sim.simEval(1) * 0.02));
    wins[idx] += result;
    trials[idx]++;
  }

  let bestIdx = 0, bestRate = -1;
  for (let i = 0; i < assignments.length; i++) {
    if (trials[i] === 0) continue;
    const rate = wins[i] / trials[i];
    if (rate > bestRate) { bestRate = rate; bestIdx = i; }
  }
  return assignments[bestIdx];
}

// 攻撃順序最適化: insts（実Gフィールドのクリーチャー配列）の最善攻撃順を返す
// パワー昇順・降順・元の順・ランダム数パターンを評価し最高勝率順を返す
function mctsOrderAttackers(insts) {
  if (insts.length <= 1) return insts;
  const baseState = mctsStateFromG();
  const budget = Math.min(mctsTimeBudget(), 150);
  const deadline = Date.now() + budget;

  // 候補順序: 元の順・パワー昇順・パワー降順・タフネス昇順
  const byPowAsc = [...insts].sort((a,b) => getEffectivePower(1,a) - getEffectivePower(1,b));
  const byPowDesc = [...insts].sort((a,b) => getEffectivePower(1,b) - getEffectivePower(1,a));
  const byTouAsc = [...insts].sort((a,b) => (CARD_DB[a.cardId].toughness||0) - (CARD_DB[b.cardId].toughness||0));
  const orders = [insts, byPowAsc, byPowDesc, byTouAsc];
  const wins = new Array(orders.length).fill(0);
  const trials = new Array(orders.length).fill(0);
  let ci = 0;

  while (Date.now() < deadline) {
    const idx = ci % orders.length;
    ci++;
    const order = orders[idx];
    const sim = SimGame.lite();
    sim.state = deterministicState(baseState);
    const s = sim.state, p1 = s.players[1], p0 = s.players[0];
    for (const inst of order) {
      const atk = p1.field.find(c => c.id === inst.instanceId);
      if (!atk) continue;
      const atkCard = CARD_DB[atk.cardId];
      if (!atkCard.vigilance) atk.tapped = true;
      const eligible = p0.field.filter(b => !b.tapped && sim._canFlyBlock(atk, b));
      const blocker = sim.simPickBlocker(0, atk, eligible, (atkCard.power||0)+(atk.tempPower||0));
      if (blocker) {
        const atkPow = (atkCard.power||0)+(atk.tempPower||0);
        const blkPow = (CARD_DB[blocker.cardId].power||0)+(blocker.tempPower||0);
        blocker.damage += atkPow;
        atk.damage += blkPow;
        sim.simCheckDeath(0); sim.simCheckDeath(1);
      } else {
        p0.life -= (atkCard.power||0)+(atk.tempPower||0);
      }
    }
    let g = 0;
    while (g++ < MCTS_ROLLOUT_DEPTH * 2 && p0.life > 0 && p1.life > 0) {
      if (sim.simTurn(sim.state.activePlayer)) break;
    }
    const [rp0, rp1] = sim.state.players;
    const result = rp1.life <= 0 ? 0 : rp0.life <= 0 ? 1 : 1/(1+Math.exp(-sim.simEval(1)*0.02));
    wins[idx] += result;
    trials[idx]++;
  }

  let bestIdx = 0, bestRate = -1;
  for (let i = 0; i < orders.length; i++) {
    if (trials[i] === 0) continue;
    const rate = wins[i] / trials[i];
    if (rate > bestRate) { bestRate = rate; bestIdx = i; }
  }
  return orders[bestIdx];
}

// SimGame内部メソッド _canFlyBlock（外部から呼べるように追加）
SimGame.prototype._canFlyBlock = function(atk, blk) {
  const ac = CARD_DB[atk.cardId], bc = CARD_DB[blk.cardId];
  if (ac.flying && !bc.flying) return false;
  return true;
};

// ── 汎用MCTSオプション選択 ──────────────────────────────────────────
// options: 選択肢の配列, applyToSim(sim, option): シム状態に選択を適用する関数
// 各選択肢をrolloutで評価し、P1の勝率が最高のものを返す
function mctsPickOption(options, applyToSim) {
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];
  const budget = Math.min(mctsTimeBudget(), 250);
  const deadline = Date.now() + budget;
  const baseState = mctsStateFromG();
  const wins = new Array(options.length).fill(0);
  const trials = new Array(options.length).fill(0);
  let ci = 0;
  while (Date.now() < deadline) {
    const idx = ci % options.length;
    ci++;
    const sim = SimGame.lite();
    sim.state = deterministicState(baseState);
    applyToSim(sim, options[idx]);
    sim.simCheckDeath(0); sim.simCheckDeath(1);
    let g = 0;
    const s = sim.state;
    while (g++ < MCTS_ROLLOUT_DEPTH * 2 && s.players[0].life > 0 && s.players[1].life > 0) {
      if (sim.simTurn(s.activePlayer)) break;
    }
    const [p0, p1] = s.players;
    const result = p1.life <= 0 ? 0 : p0.life <= 0 ? 1
      : 1 / (1 + Math.exp(-sim.simEval(1) * 0.02));
    wins[idx] += result;
    trials[idx]++;
  }
  let bestIdx = 0, bestRate = -1;
  for (let i = 0; i < options.length; i++) {
    if (trials[i] === 0) continue;
    const rate = wins[i] / trials[i];
    if (rate > bestRate) { bestRate = rate; bestIdx = i; }
  }
  return options[bestIdx];
}

function getEffectivePowerSim(inst) {
  return (CARD_DB[inst.cardId].power||0)+(inst.tempPower||0);
}

// ============================================================
// TRAINING SYSTEM (v3)
// ============================================================

let _trainStop = false;
let _mutationSigma = 0.2;          // #3: adaptive mutation width
let _consecutiveNoImprove = 0;
let _population = null;             // #4: population pool

// #3: Adaptive mutation — 1-3 random keys with adaptive sigma
function adaptiveMutate(w) {
  const keys = Object.keys(AI_WEIGHTS_DEFAULT).filter(k=>!k.startsWith('_'));
  const m = {...w};
  const n = Math.ceil(Math.random()*3);
  for (let i=0;i<n;i++) {
    const k=keys[Math.floor(Math.random()*keys.length)];
    const v=(m[k]||0)+(Math.random()-0.5)*2*_mutationSigma;
    // カード個別重みは負値も許可(-3〜3)、戦略重みは正値のみ
    m[k]=k.startsWith('card_') ? Math.max(-3, Math.min(3, v)) : Math.max(0.01, v);
  }
  return m;
}

// Keep old name for compatibility
function mutateWeights(w) { return adaptiveMutate(w); }

// #5: Crossover — blend two weight sets
function crossoverWeights(w1, w2) {
  const keys = Object.keys(AI_WEIGHTS_DEFAULT).filter(k=>!k.startsWith('_'));
  const child = {...w1};
  keys.forEach(k=>{ if(Math.random()<0.5) child[k]=w2[k]; });
  return child;
}

// #4: Initialize population seeded from current weights
function initPopulation() {
  _population = Array.from({length:8},(_,i)=>
    i===0 ? {...AI_WEIGHTS} : adaptiveMutate(AI_WEIGHTS)
  );
}

// Run one population generation (tournament), return best weights
function runPopulationGeneration(batchPerMatch) {
  if (!_population) initPopulation();
  const N = _population.length;
  const scores = new Array(N).fill(0);
  for (let i=0;i<N;i++) for (let j=i+1;j<N;j++) {
    const wr = runTrainingBatch(_population[i], _population[j], batchPerMatch);
    if (wr>0.5) scores[i]++; else scores[j]++;
  }
  const ranked = _population.map((w,i)=>({w,s:scores[i]})).sort((a,b)=>b.s-a.s);
  // Keep top 2, crossover, fill with mutations
  const np = [ranked[0].w, ranked[1].w,
    crossoverWeights(ranked[0].w, ranked[1].w),
    crossoverWeights(ranked[1].w, ranked[2]?.w||ranked[0].w)];
  while (np.length<N) np.push(adaptiveMutate(ranked[Math.floor(Math.random()*3)].w));
  _population = np;
  return ranked[0].w;
}

// #10: Run batch with TD accuracy tracking
function runTrainingBatch(w0, w1, n, d0, d1, l0, l1) {
  let wins0=0, tdCorrect=0;
  for (let i=0;i<n;i++) {
    const g=new SimGame(w0,w1,d0,d1,l0,l1);
    const result=g.run();
    if (result.winner===0) wins0++;
    // #10: check if last intermediate eval predicted the winner
    const td=result.tdScores;
    if (td[0].length&&td[1].length) {
      const last0=td[0][td[0].length-1], last1=td[1][td[1].length-1];
      if ((last0>last1?0:1)===result.winner) tdCorrect++;
    }
  }
  return wins0/n; // return win rate
}

// 色別の再学習＋検証（ヘッドレス用）。現行の色重みから種付けして世代を回し、
// 「新重み」と「新vs旧の勝率（色デッキでミラー自己対戦）」を返す。
// 改善が確認できた色だけ呼び出し側が AI_WEIGHTS_BY_COLOR に採用する（悪化させない安全策）。
// ①マリガン ②対象選択 ③割込み温存 を反映した改良シミュ上で学習し直すための関数。
function runColorRetrainHeadless(colorKey, generations, batchN, valN) {
  const colorDef = (typeof RATED_COLOR_DEFS !== 'undefined') ? RATED_COLOR_DEFS.find(c => c.key === colorKey) : null;
  if (!colorDef) return { colorKey, error: 'unknown color' };
  const old = JSON.parse(JSON.stringify(AI_WEIGHTS_BY_COLOR[colorKey] || AI_WEIGHTS_DEFAULT));
  const mainCounts = {}; colorDef.mainList().forEach(id => { mainCounts[id] = 4; });
  const landCounts = {}; colorDef.landList().forEach(id => { landCounts[id] = 2; });
  const POP = 8;
  let pop = Array.from({ length: POP }, (_, i) => i === 0 ? { ...old } : adaptiveMutate(old));
  for (let g = 0; g < generations; g++) {
    const scores = new Array(POP).fill(0);
    for (let i = 0; i < POP; i++) for (let j = i + 1; j < POP; j++) {
      const wr = runTrainingBatch(pop[i], pop[j], batchN, mainCounts, mainCounts, landCounts, landCounts);
      if (wr > 0.5) scores[i]++; else scores[j]++;
    }
    const ranked = pop.map((w, i) => ({ w, s: scores[i] })).sort((a, b) => b.s - a.s);
    pop = [ranked[0].w, ranked[1].w,
           crossoverWeights(ranked[0].w, ranked[1].w),
           crossoverWeights(ranked[1].w, ranked[2] ? ranked[2].w : ranked[0].w)];
    while (pop.length < POP) pop.push(adaptiveMutate(ranked[Math.floor(Math.random() * 3)].w));
  }
  const best = { ...pop[0], _version: AI_WEIGHTS_VERSION };
  const winRateNewVsOld = runTrainingBatch(best, old, valN, mainCounts, mainCounts, landCounts, landCounts);
  return { colorKey, winRateNewVsOld, best, old, generations, batchN, valN };
}

// 指定の新重みを、現行の色重みに対して独立検証（色デッキでミラー、n戦）。新の勝率を返す。
function validateColorWeightsHeadless(colorKey, newWeights, n) {
  const colorDef = (typeof RATED_COLOR_DEFS !== 'undefined') ? RATED_COLOR_DEFS.find(c => c.key === colorKey) : null;
  if (!colorDef) return null;
  const old = AI_WEIGHTS_BY_COLOR[colorKey] || AI_WEIGHTS_DEFAULT;
  const mainCounts = {}; colorDef.mainList().forEach(id => { mainCounts[id] = 4; });
  const landCounts = {}; colorDef.landList().forEach(id => { landCounts[id] = 2; });
  return runTrainingBatch(newWeights, old, n, mainCounts, mainCounts, landCounts, landCounts);
}

async function startTraining(limitMode, limitValue, gamesPerBatch, onProgress) {
  _trainStop = false;
  _mutationSigma = 0.2;
  _consecutiveNoImprove = 0;
  initPopulation(); // #4: always start fresh population
  let currentWeights = JSON.parse(JSON.stringify(AI_WEIGHTS));
  let totalPlayed=0, totalWins=0;
  const BATCH = gamesPerBatch;
  const deadline = limitMode==='time' ? Date.now()+limitValue*1000 : null;
  const totalGames = limitMode==='games' ? limitValue : Infinity;

  while (!_trainStop) {
    if (limitMode==='games' && totalPlayed>=totalGames) break;
    if (limitMode==='time' && Date.now()>=deadline) break;

    // #4: run population generation every 5 batches, otherwise standard hill-climb
    let improved = false;
    if (totalPlayed>0 && (totalPlayed/BATCH)%5===0) {
      const bestFromPop = runPopulationGeneration(Math.max(4,Math.floor(BATCH/4)));
      const verifyWr = await new Promise(resolve=>setTimeout(()=>resolve(runTrainingBatch(bestFromPop,currentWeights,BATCH)),0));
      totalPlayed+=BATCH;
      if (verifyWr>0.52) { currentWeights=bestFromPop; improved=true; totalWins+=Math.round(verifyWr*BATCH); }
      else totalWins+=Math.round((1-verifyWr)*BATCH);
    } else {
      const candidate = adaptiveMutate(currentWeights);
      const wr = await new Promise(resolve=>setTimeout(()=>resolve(runTrainingBatch(candidate,currentWeights,BATCH)),0));
      totalPlayed+=BATCH;
      if (wr>0.52) { currentWeights=candidate; improved=true; totalWins+=Math.round(wr*BATCH); }
      else totalWins+=Math.round((1-wr)*BATCH);
    }

    // #3: adapt mutation sigma
    if (improved) { _consecutiveNoImprove=0; _mutationSigma=Math.max(0.05,_mutationSigma*0.95); }
    else { _consecutiveNoImprove++; if(_consecutiveNoImprove>5){ _mutationSigma=Math.min(0.6,_mutationSigma*1.2); _consecutiveNoImprove=0; } }

    // デッキ自動構築: 現デッキから1枚入替えた候補を対戦させ、勝率が上回れば採用
    if (_trainDeckEvolve) {
      // メインデッキ進化（カードプールに余裕がある場合のみ）
      if (AI_CARD_POOL.length*4 > 40) {
        const curDeck = AI_DECK_COUNTS || defaultDeckCounts();
        const candDeck = mutateDeckCounts(curDeck);
        const deckWr = await new Promise(resolve=>setTimeout(()=>resolve(
          runTrainingBatch(currentWeights, currentWeights, Math.max(8, Math.floor(BATCH/2)), candDeck, curDeck)
        ),0));
        if (deckWr > 0.55) AI_DECK_COUNTS = candDeck;
      }
      // 土地デッキ進化（同名2枚まで: 土地プールに余裕がある場合のみ）
      if (AI_LAND_POOL.length*2 > 10) {
        const curLand = AI_LAND_COUNTS || defaultLandCounts();
        const candLand = mutateLandCounts(curLand);
        const landWr = await new Promise(resolve=>setTimeout(()=>resolve(
          runTrainingBatch(currentWeights, currentWeights, Math.max(8, Math.floor(BATCH/2)),
            AI_DECK_COUNTS, AI_DECK_COUNTS, candLand, curLand)
        ),0));
        if (landWr > 0.55) AI_LAND_COUNTS = candLand;
      }
    }

    AI_WEIGHTS = {...currentWeights, _version:AI_WEIGHTS_VERSION};
    AI_TRAIN_STATS.games+=BATCH;
    const elapsed = limitMode==='time' ? Math.min(Date.now()-(deadline-limitValue*1000),limitValue*1000) : null;
    if (onProgress) onProgress(totalPlayed, limitMode==='games'?totalGames:null, (totalWins/totalPlayed*100).toFixed(1), elapsed, limitMode==='time'?limitValue*1000:null);
  }
  AI_TRAIN_STATS.epoch++;
  // 学習終了時に色別localStorageへ自動保存（統計・デッキ込み）
  if (AI_CURRENT_COLOR) {
    saveAIColorWeights(AI_CURRENT_COLOR);
  }
  return currentWeights;
}

// ── デッキ自動構築ヘルパー ──
let _trainDeckEvolve = false;
function defaultDeckCounts() {
  const d = {};
  AI_CARD_POOL.forEach(c => d[c] = 4);
  return d;
}
function mutateDeckCounts(d) {
  // 1枚抜いて別カードを1枚足す（各カード0〜4枚、合計40枚を維持）
  const m = {...d};
  for (let tries=0; tries<30; tries++) {
    const a = AI_CARD_POOL[Math.floor(Math.random()*AI_CARD_POOL.length)];
    const b = AI_CARD_POOL[Math.floor(Math.random()*AI_CARD_POOL.length)];
    if (a!==b && (m[a]||0)>0 && (m[b]||0)<4) { m[a]--; m[b]++; return m; }
  }
  return m;
}
function defaultLandCounts() {
  const d = {};
  AI_LAND_POOL.forEach(l => d[l] = 2);
  return d;
}
function mutateLandCounts(d) {
  // 土地1枚を別の土地に入替え（同名2枚まで、合計10枚を維持）
  const m = {...d};
  for (let tries=0; tries<30; tries++) {
    const a = AI_LAND_POOL[Math.floor(Math.random()*AI_LAND_POOL.length)];
    const b = AI_LAND_POOL[Math.floor(Math.random()*AI_LAND_POOL.length)];
    if (a!==b && (m[a]||0)>0 && (m[b]||0)<2) { m[a]--; m[b]++; return m; }
  }
  return m;
}

function saveWeightsToFile() {
  const data={_version:AI_WEIGHTS_VERSION, weights:AI_WEIGHTS, stats:AI_TRAIN_STATS, cardStats:CARD_STATS, aiDeck:AI_DECK_COUNTS, aiLand:AI_LAND_COUNTS};
  const json=JSON.stringify(data,null,2);
  // 常に色別localStorageにも保存（ブラウザ内バックアップ）
  if (AI_CURRENT_COLOR) {
    saveAIColorWeights(AI_CURRENT_COLOR);
  }
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); // iPadOS13+はMac偽装
  if (isIOS) {
    _saveWeightsFallback(json);
  } else {
    const blob=new Blob([json],{type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`ai_weights_v${AI_WEIGHTS_VERSION}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
}
function _saveWeightsFallback(json) {
  // iOS: テキスト表示 + コピーボタン (a.downloadが使えないため)
  const box=document.createElement('div');
  box.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;';
  const ta=document.createElement('textarea');
  ta.value=json;
  ta.readOnly=true;
  ta.style.cssText='width:100%;max-width:560px;height:220px;background:#0a0a1a;color:#aaffaa;border:1px solid #336633;border-radius:6px;padding:8px;font-size:10px;font-family:monospace;';
  const title=document.createElement('div');
  title.textContent='💾 学習データ (ブラウザ内には保存済み)';
  title.style.cssText='color:#aaaaff;font-size:15px;font-weight:700;';
  const note=document.createElement('div');
  note.textContent='「コピー」を押してメモ帳などに貼り付ければファイルとして保存できます';
  note.style.cssText='color:#888;font-size:12px;text-align:center;';
  const btnRow=document.createElement('div');
  btnRow.style.cssText='display:flex;gap:12px;';
  const btnCopy=document.createElement('button');
  btnCopy.textContent='📋 コピー';
  btnCopy.style.cssText='padding:12px 28px;background:#1a1a3a;border:1px solid #4444aa;color:#aaaaff;border-radius:8px;font-size:16px;cursor:pointer;';
  btnCopy.onclick=()=>{
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    const done=ok=>{ btnCopy.textContent=ok?'✅ コピー完了':'❌ 失敗(手動で選択してコピー)'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(json).then(()=>done(true)).catch(()=>done(document.execCommand('copy')));
    } else {
      done(document.execCommand('copy'));
    }
  };
  const btnClose=document.createElement('button');
  btnClose.textContent='閉じる';
  btnClose.style.cssText='padding:12px 28px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:8px;font-size:16px;cursor:pointer;';
  btnClose.onclick=()=>box.remove();
  btnRow.append(btnCopy, btnClose);
  box.append(title, ta, note, btnRow);
  document.body.appendChild(box);
}

// JSON文字列から学習データを読み込む共通処理
function importWeightsJSON(jsonText) {
  const data=JSON.parse(jsonText);
  if (!data._version) throw new Error('バージョン情報なし');
  const w=data.weights||data;
  const keys=Object.keys(AI_WEIGHTS_DEFAULT).filter(k=>!k.startsWith('_'));
  // Load available keys, fill missing with defaults
  const merged={...AI_WEIGHTS_DEFAULT};
  keys.forEach(k=>{ if(typeof w[k]==='number') merged[k]=w[k]; });
  merged._version=AI_WEIGHTS_VERSION;
  AI_WEIGHTS=merged;
  if (data.stats) AI_TRAIN_STATS={...AI_TRAIN_STATS,...data.stats};
  if (data.cardStats) CARD_STATS=data.cardStats;
  if (data.aiDeck) AI_DECK_COUNTS=data.aiDeck;
  if (data.aiLand) AI_LAND_COUNTS=data.aiLand;
}

function loadWeightsFromFile(file) {
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      importWeightsJSON(e.target.result);
      document.getElementById('train-status').textContent=`✅ 読込完了 (${AI_TRAIN_STATS.games}戦)`;
    } catch(err) {
      document.getElementById('train-status').textContent=`❌ 読込失敗: ${err.message}`;
    }
  };
  reader.readAsText(file);
}

// ── コピペ読込 (iPad等ファイル選択が使えない環境向け) ──
function showPasteImport() {
  const box=document.createElement('div');
  box.id='paste-import-box';
  box.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;';
  const title=document.createElement('div');
  title.textContent='📋 学習データをコピペで読込';
  title.style.cssText='color:#aaaaff;font-size:16px;font-weight:700;';
  const note=document.createElement('div');
  note.textContent='保存時にコピーしたJSONテキストを下に貼り付けて「読込」を押してください';
  note.style.cssText='color:#888;font-size:12px;text-align:center;max-width:480px;';
  const ta=document.createElement('textarea');
  ta.placeholder='ここにJSONを貼り付け...';
  ta.style.cssText='width:100%;max-width:560px;height:220px;background:#0a0a1a;color:#aaffaa;border:1px solid #336633;border-radius:6px;padding:8px;font-size:11px;font-family:monospace;';
  const status=document.createElement('div');
  status.style.cssText='color:#888;font-size:13px;min-height:18px;';
  const btnRow=document.createElement('div');
  btnRow.style.cssText='display:flex;gap:12px;';
  const btnLoad=document.createElement('button');
  btnLoad.textContent='📥 読込';
  btnLoad.style.cssText='padding:12px 28px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:8px;font-size:16px;cursor:pointer;';
  btnLoad.onclick=()=>{
    try {
      importWeightsJSON(ta.value.trim());
      status.textContent=`✅ 読込完了 (${AI_TRAIN_STATS.games}戦の学習データ)`;
      status.style.color='#88ff88';
      const ts=document.getElementById('train-status');
      if (ts) ts.textContent=`✅ 読込完了 (${AI_TRAIN_STATS.games}戦)`;
      setTimeout(()=>box.remove(), 1200);
    } catch(err) {
      status.textContent=`❌ 読込失敗: ${err.message}`;
      status.style.color='#ff8888';
    }
  };
  const btnClose=document.createElement('button');
  btnClose.textContent='閉じる';
  btnClose.style.cssText='padding:12px 28px;background:#1a1a2a;border:1px solid #555;color:#aaa;border-radius:8px;font-size:16px;cursor:pointer;';
  btnClose.onclick=()=>box.remove();
  btnRow.append(btnLoad, btnClose);
  box.append(title, note, ta, status, btnRow);
  document.body.appendChild(box);
}

function showTrainingPanel() {
  const colorOpts = RATED_COLOR_DEFS.map(c => `<option value="${c.key}" ${AI_CURRENT_COLOR===c.key?'selected':''}>${c.icon} ${c.label}</option>`).join('');
  const html=`
    <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;">
      <div style="background:#0a2a2a;border:1px solid #226666;border-radius:4px;padding:8px;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-bottom:6px;">
          <span style="color:#aaaaff;font-weight:bold;">📚 訓練色選択:</span>
          <select id="train-color" onchange="switchTrainColor(this.value)" style="background:#1a1a2a;color:#aaffaa;border:1px solid #226666;padding:4px 6px;border-radius:4px;">
            ${colorOpts}
          </select>
        </label>
        <div style="color:#888;font-size:11px;">選択した色のAIを訓練 (50万戦推奨)</div>
      </div>
      <div style="color:#aaa;">学習データ: ${AI_TRAIN_STATS.games}戦 / エポック${AI_TRAIN_STATS.epoch} / σ=${_mutationSigma.toFixed(3)}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <label>指定方法:</label>
        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="train-mode" value="time" checked onchange="uiTrainModeChange()"> 時間</label>
        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="radio" name="train-mode" value="games" onchange="uiTrainModeChange()"> 対戦数</label>
      </div>
      <div style="display:flex;gap:8px;align-items:center;" id="train-time-row">
        <select id="train-time" style="background:#1a1a2a;color:#ccc;border:1px solid #444;padding:4px;">
          <option value="30">30秒</option><option value="60" selected>1分</option>
          <option value="180">3分</option><option value="300">5分</option>
          <option value="600">10分</option><option value="1800">30分</option>
          <option value="3600">1時間</option><option value="7200">2時間</option>
          <option value="14400">4時間</option><option value="21600">6時間</option>
          <option value="36000">10時間</option>
        </select>
      </div>
      <div style="display:none;gap:8px;align-items:center;" id="train-games-row">
        <select id="train-games" style="background:#1a1a2a;color:#ccc;border:1px solid #444;padding:4px;">
          <option value="100">100戦</option><option value="500">500戦</option>
          <option value="1000">1000戦</option><option value="3000">3000戦</option>
          <option value="5000">5000戦</option>
        </select>
      </div>
      <label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#aaa;">
        <input type="checkbox" id="train-deck-evolve" ${_trainDeckEvolve?'checked':''}>
        🃏 デッキ構築も学習する${AI_CARD_POOL.length*4 <= 40 && AI_LAND_POOL.length*2 <= 10 ? '<span style="color:#666;">（現カードプールでは構成が固定のため無効。カード・土地の追加後に自動で有効化）</span>' : ''}
      </label>
      <div style="display:flex;gap:8px;">
        <button id="btn-train-start" onclick="uiStartTraining()" style="padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">▶ 開始</button>
        <button onclick="uiStopTraining()" style="padding:6px 10px;background:#3a1a1a;border:1px solid #aa4444;color:#ffaaaa;border-radius:4px;cursor:pointer;">■ 停止</button>
      </div>
      <div style="background:#0a0a1a;border:1px solid #333;border-radius:4px;height:14px;overflow:hidden;">
        <div id="train-bar" style="height:100%;width:0%;background:#336633;transition:width 0.3s;"></div>
      </div>
      <div id="train-status" style="color:#88cc88;min-height:18px;">待機中</div>
      <hr style="border-color:#333;margin:4px 0;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="saveWeightsToFile()" style="padding:6px 12px;background:#1a1a3a;border:1px solid #4444aa;color:#aaaaff;border-radius:4px;cursor:pointer;">💾 保存(コピー)</button>
        <button onclick="showPasteImport()" style="padding:6px 12px;background:#1a2a1a;border:1px solid #447744;color:#aaffaa;border-radius:4px;cursor:pointer;">📋 コピペで読込</button>
        <label style="padding:6px 12px;background:#2a1a1a;border:1px solid #774444;color:#ffaaaa;border-radius:4px;cursor:pointer;">
          📂 ファイル読込<input type="file" accept=".json" style="display:none;" onchange="loadWeightsFromFile(this.files[0])">
        </label>
        <button onclick="closeModal();showBalancePanel()" style="padding:6px 12px;background:#1a2a2a;border:1px solid #447777;color:#aaffff;border-radius:4px;cursor:pointer;">📊 バランス分析</button>
        <button onclick="closeModal();showAIDeckPanel()" style="padding:6px 12px;background:#2a2a1a;border:1px solid #777744;color:#ffffaa;border-radius:4px;cursor:pointer;">🃏 AIデッキ</button>
        <button onclick="updateDefaultWeights()" style="padding:6px 12px;background:#2a3a1a;border:1px solid #66aa44;color:#ccffaa;border-radius:4px;cursor:pointer;">⭐ デフォルト値を更新</button>
        <button onclick="resetToDefaultWeights()" style="padding:6px 10px;background:#1a1a1a;border:1px solid #555;color:#888;border-radius:4px;cursor:pointer;">↺ デフォルトに戻す</button>
      </div>
      <div style="color:#666;font-size:10px;">v${AI_WEIGHTS_VERSION}互換 | 遺伝的アルゴリズム+適応変異+交叉+カード別重み学習</div>
    </div>`;
  showModal('🧠 AI学習モード', html);
}

// ── クイックシミュレーション（バランスデータ収集用） ──
let _quickSimRunning = false;

// カード強さA/Bテスト: カードあり(P0) vs なし(P1) の対戦 + 逆パターンも測定
// returns: {wins, games} where wins = player WITH card winning
let CARD_IMPACT = {}; // {cardId: {wins, games}}

async function runCardImpactTests(nPerCard, onProgress, onDone) {
  if (_quickSimRunning) return;
  _quickSimRunning = true;
  _trainStop = false;
  const allCards = [...AI_CARD_POOL, ...AI_LAND_POOL];
  const w = AI_WEIGHTS;
  const baseLand = AI_LAND_COUNTS || defaultLandCounts();
  const baseDeck = AI_DECK_COUNTS || defaultDeckCounts();
  let ci = 0;

  function step() {
    if (ci >= allCards.length || _trainStop) { _quickSimRunning = false; onDone(); return; }
    const cardId = allCards[ci++];
    const card = CARD_DB[cardId];
    if (!card) { setTimeout(step, 0); return; }
    const st = CARD_IMPACT[cardId] = { wins: 0, games: 0 };

    if (card.type === 'land') {
      // 土地: あり(2枚) vs なし(0枚)
      const withCard = { ...baseLand, [cardId]: 2 };
      const withoutCard = { ...baseLand, [cardId]: 0 };
      for (let i = 0; i < nPerCard; i++) {
        // P0 has card, P1 doesn't
        const g1 = new SimGame(w, w, baseDeck, baseDeck, withCard, withoutCard);
        const r1 = g1.run();
        st.games++; if (r1.winner === 0) st.wins++;
        // P1 has card, P0 doesn't
        const g2 = new SimGame(w, w, baseDeck, baseDeck, withoutCard, withCard);
        const r2 = g2.run();
        st.games++; if (r2.winner === 1) st.wins++;
      }
    } else {
      // メインデッキカード: あり(4枚) vs なし(0枚)
      const withCard = { ...baseDeck, [cardId]: 4 };
      const withoutCard = { ...baseDeck, [cardId]: 0 };
      for (let i = 0; i < nPerCard; i++) {
        const g1 = new SimGame(w, w, withCard, withoutCard, baseLand, baseLand);
        const r1 = g1.run();
        st.games++; if (r1.winner === 0) st.wins++;
        const g2 = new SimGame(w, w, withoutCard, withCard, baseLand, baseLand);
        const r2 = g2.run();
        st.games++; if (r2.winner === 1) st.wins++;
      }
    }
    if (onProgress) onProgress(ci, allCards.length);
    setTimeout(step, 0);
  }
  step();
}
async function quickSimForBalance(nGames, onDone) {
  if (_quickSimRunning) return;
  _quickSimRunning = true;
  const batchSize = 10;
  let done = 0;
  const w = AI_WEIGHTS;
  const d0 = AI_DECK_COUNTS || defaultDeckCounts();
  const d1 = AI_DECK_COUNTS || defaultDeckCounts();
  const l0 = AI_LAND_COUNTS || defaultLandCounts();
  const l1 = AI_LAND_COUNTS || defaultLandCounts();
  function step() {
    if (done >= nGames || _trainStop) { _quickSimRunning = false; onDone(); return; }
    const n = Math.min(batchSize, nGames - done);
    runTrainingBatch(w, w, n, d0, d1, l0, l1);
    done += n;
    AI_TRAIN_STATS.games += n;
    setTimeout(step, 0);
  }
  step();
}

// ── カードバランス分析パネル ──
// シミュレーション対戦で集めた「カードをプレイしたゲームの勝率」から
// ナーフ/アッパー候補を提示する（実際の調整はユーザーが判断）
function showBalancePanel() {
  // 全カード（メインデッキ＋土地）を対象に、統計があればそれを使い、なければ0で表示
  const allPoolIds = [...AI_CARD_POOL, ...AI_LAND_POOL];
  const entries = allPoolIds
    .filter(cid => CARD_DB[cid])
    .map(cid => [cid, CARD_STATS[cid] || {played:0, wins:0}]);
  const hasData = entries.some(([,v]) => v.played > 0);
  if (!hasData) {
    const noDataHtml = `
      <p style="color:#888;margin-bottom:16px;">データがありません。AI学習を実行するとシミュレーション対戦から統計が集まります。</p>
      <button id="quick-sim-btn" onclick="quickSimForBalance(200, () => { closeModal(); setTimeout(showBalancePanel, 50); })"
        style="padding:10px 20px;background:#1a2a1a;border:1px solid #447744;color:#88ff88;border-radius:6px;cursor:pointer;font-size:14px;">
        ⚡ クイックシミュ 200戦 を実行してデータを収集
      </button>`;
    showModal('📊 カードバランス分析', noDataHtml);
    return;
  }
  // ── シンプル指標: 「片方のプレイヤーだけがそのカードを使った試合」の勝率のみを使う ──
  // soloWr = そのカードを使った側の勝率（P0単独・P1単独を平均し先手バイアスを除去）
  const MIN_SOLO = 30; // 判定に必要な最低試合数
  const NERF_TH = 10;  // +10pt以上 → ナーフ候補
  const UPPER_TH = 10; // -10pt以下 → アッパー候補

  const computed = entries.map(([cid, v]) => {
    const card = CARD_DB[cid];
    const costTot = Object.values(card.cost||{}).reduce((a,b)=>a+b,0);
    const soloGames = (v.p0_solo||0) + (v.p1_solo||0);
    const p0wr = (v.p0_solo||0) > 0 ? (v.p0_solo_wins||0) / v.p0_solo : null;
    const p1wr = (v.p1_solo||0) > 0 ? (v.p1_solo_wins||0) / v.p1_solo : null;
    const soloWr = (p0wr !== null && p1wr !== null) ? (p0wr + p1wr) / 2
                 : (p0wr !== null ? p0wr : p1wr !== null ? p1wr : null);
    const enough = soloGames >= MIN_SOLO && soloWr !== null;
    const wrPct = enough ? Math.round(soloWr * 100) : null;
    const delta = enough ? (soloWr - 0.5) * 100 : 0;
    let verdict, vcolor, vrank;
    if (!enough) { verdict = `データ不足 (${soloGames}/${MIN_SOLO}戦)`; vcolor = '#666'; vrank = 0; }
    else if (delta >= NERF_TH)  { verdict = '⚠️ ナーフ候補（強すぎ）'; vcolor = '#ff6644'; vrank = 2; }
    else if (delta <= -UPPER_TH){ verdict = '💪 アッパー候補（弱すぎ）'; vcolor = '#4488ff'; vrank = -2; }
    else { verdict = '✓ 適正'; vcolor = '#66cc88'; vrank = 1; }
    return { cid, card, costTot, soloGames, soloWr, enough, wrPct, delta, verdict, vcolor, vrank };
  });

  const nerfCount  = computed.filter(r => r.vrank === 2).length;
  const upperCount = computed.filter(r => r.vrank === -2).length;

  const rows = computed
    // 勝率の高い順（データ不足は末尾）に並べる
    .sort((a,b) => (b.enough?b.soloWr:-1) - (a.enough?a.soloWr:-1))
    .map(r => {
      const barPct = r.enough ? Math.min(100, Math.max(0, r.wrPct)) : 0;
      const barColor = !r.enough ? '#333'
        : r.delta >= NERF_TH ? '#ff6644'
        : r.delta <= -UPPER_TH ? '#4488ff' : '#44aa66';
      return `<tr style="border-bottom:1px solid #1a1a2a;">
      <td style="padding:6px;font-size:13px;white-space:nowrap;">${r.card.icon} ${r.card.name}</td>
      <td style="padding:6px;font-size:11px;text-align:center;color:#888;">${r.costTot||'土地'}</td>
      <td style="padding:6px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="position:relative;flex:1;height:9px;background:#111;border-radius:4px;overflow:hidden;min-width:70px;opacity:${r.enough?1:0.3};">
            <div style="position:absolute;left:50%;top:0;width:1px;height:100%;background:#555;"></div>
            <div style="width:${barPct}%;height:100%;background:${barColor};border-radius:4px;transition:width 0.3s;"></div>
          </div>
          <span style="font-size:13px;font-weight:700;min-width:40px;text-align:right;color:${r.enough?'#ddd':'#555'};">${r.enough?r.wrPct+'%':'—'}</span>
        </div>
      </td>
      <td style="padding:6px;font-size:12px;color:${r.vcolor};white-space:nowrap;">${r.verdict}</td>
    </tr>`;
    }).join('');

  const summaryChips = [
    nerfCount  ? `<span style="background:#2a1a14;border:1px solid #ff6644;color:#ff9977;padding:3px 10px;border-radius:4px;font-size:12px;">⚠️ ナーフ候補 ${nerfCount}枚</span>` : '',
    upperCount ? `<span style="background:#14182a;border:1px solid #4488ff;color:#88aaff;padding:3px 10px;border-radius:4px;font-size:12px;">💪 アッパー候補 ${upperCount}枚</span>` : '',
    (!nerfCount && !upperCount) ? `<span style="background:#0a1a0a;border:1px solid #44aa44;color:#88cc88;padding:3px 10px;border-radius:4px;font-size:12px;">✓ 候補なし</span>` : '',
  ].filter(Boolean).join(' ');

  const html = `
    <p style="font-size:12px;color:#99bb99;margin-bottom:6px;line-height:1.5;">
      「そのカードを<b>片方のプレイヤーだけが使った試合</b>」の勝率です。<br>
      <span style="color:#888;">50%＝互角／高い＝強い（ナーフ候補）／低い＝弱い（アッパー候補）</span>
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
      ${summaryChips}
    </div>
    <table style="width:100%;border-collapse:collapse;background:#0a0a14;">
      <thead><tr style="border-bottom:1px solid #333;color:#666;font-size:11px;">
        <th style="padding:5px 6px;text-align:left;">カード</th>
        <th style="padding:5px 6px;text-align:center;">コスト</th>
        <th style="padding:5px 6px;text-align:left;">勝率 (50%＝互角)</th>
        <th style="padding:5px 6px;text-align:left;">判定</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button onclick="(()=>{ const b=document.getElementById('ab-btn'); if(b){b.textContent='実行中...';b.disabled=true;} CARD_IMPACT={}; const total=${[...AI_CARD_POOL,...AI_LAND_POOL].length}; runCardImpactTests(30,(done,all)=>{b&&(b.textContent='テスト中 '+done+'/'+all);},()=>{closeModal();setTimeout(showBalancePanel,50);}); })()"
        id="ab-btn" style="padding:8px 16px;background:#1a2a1a;border:1px solid #44aa44;color:#88ff88;border-radius:4px;cursor:pointer;font-size:13px;">🧪 データ収集テストを実行</button>
      <button onclick="(()=>{ const b=document.getElementById('qs200-btn'); if(b){b.textContent='実行中...';b.disabled=true;} quickSimForBalance(200,()=>{closeModal();setTimeout(showBalancePanel,50);}); })()"
        id="qs200-btn" style="padding:8px 14px;background:#1a2a1a;border:1px solid #447744;color:#aaffaa;border-radius:4px;cursor:pointer;font-size:12px;">⚡ +200戦 集計</button>
      <button onclick="CARD_STATS={};CARD_IMPACT={};closeModal();showBalancePanel();" style="padding:8px 14px;background:#1a1a1a;border:1px solid #444;color:#888;border-radius:4px;cursor:pointer;font-size:12px;">↺ リセット</button>
      <button onclick="closeModal();showTrainingPanel();" style="padding:8px 14px;background:#1a2a1a;border:1px solid #446644;color:#aaffaa;border-radius:4px;cursor:pointer;font-size:12px;">← 学習へ</button>
    </div>
    <div style="margin-top:8px;font-size:10px;color:#555;">判定には各カード${MIN_SOLO}試合以上が必要です。勝率が高いほど強力なカードです。</div>`;
  showModal('📊 カードバランス分析', html);
}

// ── AIデッキ確認パネル ──
function showAIDeckPanel() {
  // レート戦中は対戦相手（AI）のデッキを表示しない
  if (typeof RATED_MODE !== 'undefined' && RATED_MODE) {
    showModal('🃏 AIデッキ',
      '<div style="color:#aaa;font-size:13px;padding:12px 4px;line-height:1.8;text-align:center;">' +
      '🎴 レート戦中は対戦相手のデッキを表示できません。<br>' +
      '<span style="color:#666;font-size:12px;">対戦終了後、AI対戦（練習）で確認できます。</span></div>');
    return;
  }
  const counts = AI_DECK_COUNTS || defaultDeckCounts();
  const learnedRows = AI_CARD_POOL
    .map(cid => ({ cid, card:CARD_DB[cid], n:counts[cid]||0, w:AI_WEIGHTS['card_'+cid]||0 }))
    .sort((a,b) => b.w - a.w)
    .map(r => `<tr style="border-bottom:1px solid #222;">
      <td style="padding:5px 8px;font-size:13px;">${r.card.icon} ${r.card.name}</td>
      <td style="padding:5px 8px;font-size:13px;text-align:right;">${r.n}枚</td>
      <td style="padding:5px 8px;font-size:12px;text-align:right;color:${r.w>=0?'#88ff88':'#ff8888'};">${r.w>=0?'+':''}${r.w.toFixed(2)}</td>
    </tr>`).join('');
  const landCounts = AI_LAND_COUNTS || defaultLandCounts();
  const landRows = AI_LAND_POOL
    .map(lid => ({ lid, card:CARD_DB[lid], n:landCounts[lid]||0 }))
    .sort((a,b) => b.n - a.n)
    .map(r => `<tr style="border-bottom:1px solid #222;">
      <td style="padding:5px 8px;font-size:13px;">${r.card.icon} ${r.card.name}</td>
      <td style="padding:5px 8px;font-size:13px;text-align:right;">${r.n}枚</td>
    </tr>`).join('');
  const html = `
    <div style="color:#aaa;font-size:12px;margin-bottom:10px;">
      AIが対戦で使うデッキ構成と、学習で得たカード別評価（高いほどAIが優先的にプレイ）<br>
      <span style="color:#666;">メイン: ${AI_DECK_COUNTS?'🃏 進化デッキ':'デフォルト(各4枚)'} | 土地: ${AI_LAND_COUNTS?'🃏 進化構成':'デフォルト(各2枚)'}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#0a0a14;">
      <thead><tr style="border-bottom:1px solid #444;color:#666;font-size:11px;">
        <th style="padding:4px 8px;text-align:left;">カード</th>
        <th style="padding:4px 8px;text-align:right;">枚数</th>
        <th style="padding:4px 8px;text-align:right;">学習評価</th>
      </tr></thead>
      <tbody>${learnedRows}</tbody>
    </table>
    <div style="color:#888;font-size:12px;margin:10px 0 4px;">土地デッキ (10枚)</div>
    <table style="width:100%;border-collapse:collapse;background:#0a0a14;">
      <thead><tr style="border-bottom:1px solid #444;color:#666;font-size:11px;">
        <th style="padding:4px 8px;text-align:left;">土地</th>
        <th style="padding:4px 8px;text-align:right;">枚数</th>
      </tr></thead>
      <tbody>${landRows}</tbody>
    </table>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button onclick="AI_DECK_COUNTS=null;AI_LAND_COUNTS=null;closeModal();" style="padding:6px 12px;background:#1a1a1a;border:1px solid #555;color:#888;border-radius:4px;cursor:pointer;">↺ デフォルトに戻す</button>
      <button onclick="closeModal();showTrainingPanel();" style="padding:6px 12px;background:#1a2a1a;border:1px solid #446644;color:#aaffaa;border-radius:4px;cursor:pointer;">← 学習パネルへ</button>
    </div>`;
  showModal('🃏 AIデッキ構成', html);
}

function uiTrainModeChange() {
  const mode=document.querySelector('input[name="train-mode"]:checked')?.value||'time';
  document.getElementById('train-time-row').style.display=mode==='time'?'flex':'none';
  document.getElementById('train-games-row').style.display=mode==='games'?'flex':'none';
}

// 訓練色を切り替え、その色のAI重みを読み込む
function switchTrainColor(colorKey) {
  if (AI_CURRENT_COLOR && AI_CURRENT_COLOR !== colorKey) {
    // 前の色のAI重みを保存
    saveAIColorWeights(AI_CURRENT_COLOR);
  }
  // 新しい色のAI重みを読み込む
  loadAIColorWeights(colorKey);
  document.getElementById('train-status').textContent = `✅ ${RATED_COLOR_DEFS.find(c=>c.key===colorKey).label}に切り替え (${AI_TRAIN_STATS.games}戦)`;
  if (typeof showTrainingPanel === 'function') setTimeout(() => showTrainingPanel(), 300);
}

// 現在の学習済み重みをデフォルト値として更新
function updateDefaultWeights() {
  if (!AI_CURRENT_COLOR) { alert('色を選択してください'); return; }
  AI_WEIGHTS_BY_COLOR[AI_CURRENT_COLOR] = { ...AI_WEIGHTS };
  const colorLabel = RATED_COLOR_DEFS.find(c=>c.key===AI_CURRENT_COLOR).label;
  document.getElementById('train-status').textContent = `✅ ${colorLabel}のデフォルト値を更新しました (${AI_TRAIN_STATS.games}戦)`;
  saveAIColorWeights(AI_CURRENT_COLOR);
}

// デフォルト値に戻す
function resetToDefaultWeights() {
  if (!AI_CURRENT_COLOR) { alert('色を選択してください'); return; }
  const defaultWeights = AI_WEIGHTS_BY_COLOR[AI_CURRENT_COLOR] || AI_WEIGHTS_DEFAULT;
  AI_WEIGHTS = { ...defaultWeights };
  AI_TRAIN_STATS = { games: 500000, wins: 250000, epoch: 1000 };
  _mutationSigma = 0.2;
  const colorLabel = RATED_COLOR_DEFS.find(c=>c.key===AI_CURRENT_COLOR).label;
  document.getElementById('train-status').textContent = `✅ ${colorLabel}のデフォルト値に戻しました`;
  if (typeof showTrainingPanel === 'function') setTimeout(() => showTrainingPanel(), 300);
}

async function uiStartTraining() {
  const mode=document.querySelector('input[name="train-mode"]:checked')?.value||'time';
  const limit=mode==='time'
    ? parseInt(document.getElementById('train-time').value)||60
    : parseInt(document.getElementById('train-games').value)||100;
  _trainDeckEvolve = document.getElementById('train-deck-evolve')?.checked || false;
  document.getElementById('btn-train-start').disabled=true;
  document.getElementById('train-status').textContent='学習中...';
  await startTraining(mode, limit, 20, (done,total,wr,elapsed,totalMs)=>{
    let pct=0;
    if (mode==='games') {
      pct=(done/total*100).toFixed(0);
      document.getElementById('train-status').textContent=`${done}/${total}戦 | 勝率${wr}% | σ=${_mutationSigma.toFixed(3)}`;
    } else {
      pct=Math.min((elapsed/totalMs*100),100).toFixed(0);
      const fmtTime=s=>s>=3600?`${Math.floor(s/3600)}時間${Math.floor(s%3600/60)}分`:s>=60?`${Math.floor(s/60)}分${s%60}秒`:`${s}秒`;
      const sec=Math.floor(elapsed/1000), tot=Math.floor(totalMs/1000);
      document.getElementById('train-status').textContent=`${fmtTime(sec)}/${fmtTime(tot)} | ${done}戦 | 勝率${wr}% | σ=${_mutationSigma.toFixed(3)}`;
    }
    document.getElementById('train-bar').style.width=pct+'%';
  });
  document.getElementById('train-bar').style.width='100%';
  document.getElementById('train-status').textContent=`✅ 完了 (累計${AI_TRAIN_STATS.games}戦 / エポック${AI_TRAIN_STATS.epoch})`;
  document.getElementById('btn-train-start').disabled=false;
}

function uiStopTraining() {
  _trainStop=true;
  const el=document.getElementById('train-status');
  if (el) el.textContent='⏹ 停止しました';
}

// ============================================================
// ONLINE MULTIPLAYER (PeerJS) — 時間制限なし
// ============================================================
let NET_MODE    = 'local';     // 'local' | 'host' | 'guest' | 'hotseat'
let NET_PEER    = null;        // PeerJS Peer instance
let NET_CONN    = null;        // DataConnection
let NET_MY_IDX  = 0;          // which G.players[] index is "me" (guest=1)
let NET_ROOM_ID = null;        // 6-char room code (host's peer id)
let NET_GUEST_DECK = null;     // guest's deck data sent on connect {main:[...], land:[...]}

// ── ロビー表示／非表示 ──────────────────────────────────────
function netShowLobby() {
  const el = document.getElementById('net-lobby');
  if (el) el.style.display = 'flex';
}
function netHideLobby() {
  const el = document.getElementById('net-lobby');
  if (el) el.style.display = 'none';
}
function netSetStatus(msg) {
  const el = document.getElementById('net-status-msg');
  if (el) el.textContent = msg;
}

// ── ローカル（AI対戦）────────────────────────────────────────
function netStartLocal() {
  NET_MODE = 'local';
  NET_MY_IDX = 0;
  netHideLobby();
  initGame();
}

// ── ホットシート（同デバイス2人対戦）────────────────────────
function startHotseat() {
  NET_MODE = 'hotseat';
  NET_MY_IDX = 0;
  document.getElementById('home-screen').style.display = 'none';
  initGame();
}

function hotseatShowPass(forPlayer) {
  const el = document.getElementById('hotseat-pass');
  const title = document.getElementById('hotseat-pass-title');
  const sub   = document.getElementById('hotseat-pass-sub');
  const name = forPlayer === 0 ? 'プレイヤー1' : 'プレイヤー2';
  title.textContent = '📱 デバイスを渡してください';
  sub.textContent   = `${name}のターンです`;
  el.classList.add('show');
}

function hotseatResume() {
  document.getElementById('hotseat-pass').classList.remove('show');
  NET_MY_IDX = G.activePlayer;
  render();
  updateHints();
  log(`${NET_MY_IDX === 0 ? 'プレイヤー1' : 'プレイヤー2'}のメインフェイズ`);
}

// ── ホスト ──────────────────────────────────────────────────
function netHost() {
  netSetStatus('PeerJS 接続中...');
  const roomId = Array.from({length:6}, ()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
  NET_ROOM_ID = roomId;
  NET_PEER = new Peer(roomId, {debug: 1});
  NET_PEER.on('open', id => {
    netSetStatus(`部屋コード: ${id}  相手の接続を待っています...`);
    document.getElementById('net-room-input').value = id;
  });
  NET_PEER.on('connection', conn => {
    NET_CONN = conn;
    NET_MODE = 'host';
    NET_MY_IDX = 0;
    netSetStatus('接続しました！ ゲームを開始します...');
    conn.on('open', () => {
      netHideLobby();
      // Wait for deckShare from guest (with 1500ms timeout fallback)
      const deckWaitTimer = setTimeout(() => {
        if (!NET_GUEST_DECK) initGame();
      }, 1500);
      conn._deckWaitTimer = deckWaitTimer;
    });
    conn.on('data', netOnHostReceive);
    conn.on('close', netOnDisconnect);
    conn.on('error', netOnDisconnect);
  });
  NET_PEER.on('error', e => netSetStatus(`エラー: ${e.type}`));
}

// ── ゲスト ──────────────────────────────────────────────────
function netJoin() {
  const code = (document.getElementById('net-room-input').value || '').trim().toUpperCase();
  if (code.length < 4) { netSetStatus('部屋コードを入力してください'); return; }
  netSetStatus('接続中...');
  NET_PEER = new Peer(undefined, {debug: 1});
  NET_PEER.on('open', () => {
    const conn = NET_PEER.connect(code, {reliable: true});
    NET_CONN = conn;
    NET_ROOM_ID = code;
    conn.on('open', () => {
      NET_MODE = 'guest';
      NET_MY_IDX = 1;
      netSetStatus('接続しました！');
      netHideLobby();
      // Send our deck to host so they can use it for player[1]
      conn.send({type:'deckShare', deck: getMyDeckData()});
    });
    conn.on('data', netOnGuestReceive);
    conn.on('close', netOnDisconnect);
    conn.on('error', e => netSetStatus(`エラー: ${e.message || e}`));
  });
  NET_PEER.on('error', e => netSetStatus(`エラー: ${e.type}`));
}

// ── 切断 / 再接続 ────────────────────────────────────────────
function netOnDisconnect() {
  if (NET_MODE === 'local') return;
  log('⚠️ 相手との接続が切れました。再接続を待っています...', 'important');
  if (NET_MODE === 'host') {
    // Reconnect: just wait for new connection on same peer
    if (NET_PEER && !NET_PEER.destroyed) {
      NET_PEER.on('connection', conn => {
        NET_CONN = conn;
        conn.on('open', () => {
          log('✅ 再接続しました', 'important');
          conn.on('data', netOnHostReceive);
          conn.on('close', netOnDisconnect);
          conn.on('error', netOnDisconnect);
          netSyncToGuest(); // resend full state
        });
      });
    }
  } else {
    // Guest: show reconnect button
    const el = document.getElementById('net-lobby');
    if (el) {
      netSetStatus('切断されました。再接続するには同じコードで「参加する」を押してください');
      el.style.display = 'flex';
    }
  }
}

// ── ホスト: ゲストからのメッセージ受信 ──────────────────────
function netOnHostReceive(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'deckShare') {
    NET_GUEST_DECK = msg.deck;
    // Cancel the timeout and start game now that we have guest's deck
    if (NET_CONN && NET_CONN._deckWaitTimer) {
      clearTimeout(NET_CONN._deckWaitTimer);
      NET_CONN._deckWaitTimer = null;
    }
    if (!G || G.phase === undefined) initGame();
  } else if (msg.type === 'action') {
    netExecuteGuestAction(msg);
  } else if (msg.type === 'ping') {
    // nothing
  }
}

// ── ゲスト: ホストからのメッセージ受信 ──────────────────────
function netOnGuestReceive(msg) {
  if (!msg || !msg.type) return;
  if (msg.type === 'state') {
    netApplyStateFromHost(msg.state);
  }
}

// ── ホスト→ゲスト 状態同期 ──────────────────────────────────
function netSyncToGuest() {
  if (NET_MODE !== 'host' || !NET_CONN || !NET_CONN.open) return;
  try {
    const snapshot = JSON.stringify(G, (key, val) => {
      if (val instanceof Set) return {__set: Array.from(val)};
      return val;
    });
    NET_CONN.send({type:'state', state: snapshot});
  } catch(e) { /* ignore */ }
}

// ── ゲスト: ホストの状態を適用 ───────────────────────────────
function netApplyStateFromHost(snapshot) {
  try {
    // 自分(ゲスト)がまだマリガン選択中なら、その選択をホスト同期で消さない
    const localMullSel = (G && G.mulliganSelected instanceof Set) ? G.mulliganSelected : null;
    G = JSON.parse(snapshot, (key, val) => {
      if (val && val.__set) return new Set(val.__set);
      return val;
    });
    if (!G.mulliganDone) G.mulliganDone = [true, true];
    if (G.mulliganMode && !G.mulliganDone[NET_MY_IDX] && localMullSel) {
      G.mulliganSelected = localMullSel;
    }
    // マリガンUIの表示制御（自分が未確定の間だけ表示）
    const mc = document.getElementById('mulligan-controls');
    if (mc) mc.style.display = (G.mulliganMode && !G.mulliganDone[NET_MY_IDX]) ? 'flex' : 'none';
    render();
    updateHints();
  } catch(e) { /* ignore */ }
}

// ── ゲスト: アクションをホストへ送信 ────────────────────────
function netSendAction(actionType, payload) {
  if (NET_MODE !== 'guest' || !NET_CONN || !NET_CONN.open) return;
  NET_CONN.send({type:'action', actionType, payload});
}

// ── ホスト: ゲストのアクションを実行 ────────────────────────
function netExecuteGuestAction(msg) {
  const {actionType, payload} = msg;
  switch (actionType) {
    case 'endPhase':    endPhase(); break;
    case 'passPriority': {
      // ゲスト(player1)に優先権がある時のみ受理
      if (G.awaitingPriority && G.priorityFor === 1) closePriorityAndResolve();
      break;
    }
    case 'charge':      startCharge(); break;
    case 'playCard': {
      const idx = payload.handIdx;
      if (idx != null && G.players[1].hand[idx] != null) {
        if (G.chargingMode === true) doCharge(idx);
        else playCardFromHand(1, idx);
      }
      break;
    }
    case 'tapLand': {
      if (G.chargingMode === 'pick_land') chargeToLand(payload.instId);
      else tapLandForMana(1, payload.instId);
      break;
    }
    case 'fieldClick': {
      // ゲストの場クリックを汎用ルーティング（攻撃・格闘対象・ブロック割当など）
      handleFieldClick(payload.player, payload.instId);
      break;
    }
    case 'activateCreature': {
      handleFieldClick(1, payload.instId);
      break;
    }
    case 'confirmBlock': {
      endPhase();
      break;
    }
    case 'selectBlocker': {
      netGuestSelectBlocker(payload.attackerInstId, payload.blockerInstId);
      break;
    }
    case 'targetSelect': {
      netGuestTargetSelect(payload);
      break;
    }
    case 'mulliganConfirm': {
      // ゲスト(player 1)の手札を入れ替える（ホストの選択状態には触れない）
      const p1 = G.players[1];
      const chosen = (payload.selected || []).filter(i => Number.isInteger(i) && i >= 0 && i < p1.hand.length);
      if (chosen.length > 0) {
        [...chosen].sort((a, b) => b - a).forEach(i => p1.deck.push(p1.hand.splice(i, 1)[0]));
        p1.deck = shuffle(p1.deck);
        for (let i = 0; i < chosen.length; i++) drawCard(1);
        p1.mulliganUsed = true;
        log(`相手がマリガン: ${chosen.length}枚入れ替え`);
      } else {
        log('相手はマリガンなし');
      }
      if (!G.mulliganDone) G.mulliganDone = [false, false];
      G.mulliganDone[1] = true;
      checkMulliganComplete();
      break;
    }
    case 'mulliganSkip': {
      log('相手はマリガンなし');
      if (!G.mulliganDone) G.mulliganDone = [false, false];
      G.mulliganDone[1] = true;
      checkMulliganComplete();
      break;
    }
  }
  netSyncToGuest();
}

function netGuestSelectBlocker(attackerInstId, blockerInstId) {
  if (G.playerBlockMode) {
    G.selectedBlockerToAssign = blockerInstId;
    G.playerBlockAssignments[attackerInstId] = blockerInstId;
    render(); updateHints();
  }
}

function netGuestTargetSelect(payload) {
  if (!G.targetMode) return;
  const tm = G.targetMode;
  if (tm.type === 'opponentCreature' && payload.instId) {
    const tgt = G.players[0].field.find(c => c.instanceId === payload.instId);
    if (tgt) tm.callback({instId: payload.instId, cardId: tgt.cardId});
  } else if (tm.type === 'ownCreature' && payload.instId) {
    const tgt = G.players[1].field.find(c => c.instanceId === payload.instId);
    if (tgt) tm.callback({instId: payload.instId, cardId: tgt.cardId});
  } else if (tm.type === 'ownLand' && payload.instId) {
    tm.callback(payload.instId);
  }
}

// （ターンタイマーは削除: プレイ時間に制限なし）

// ============================================================
// DEBUG / FREEZE REPORTER
// ============================================================
let _lastActionTime = Date.now();
let _freezeCheckInterval = null;
const FREEZE_THRESHOLD_MS = 30000; // 30秒操作なしで警告

function _resetFreezeTimer() {
  _lastActionTime = Date.now();
}

function _startFreezeDetector() {
  if (_freezeCheckInterval) clearInterval(_freezeCheckInterval);
  _freezeCheckInterval = setInterval(() => {
    if (!G || G.phase === 'ended' || G.mulliganMode) return;
    const elapsed = Date.now() - _lastActionTime;
    if (elapsed > FREEZE_THRESHOLD_MS) {
      const el = document.getElementById('debug-freeze-warn');
      if (el) { el.style.display = 'block'; el.textContent = `⚠️ ${Math.floor(elapsed/1000)}秒間操作なし — フリーズ？ 🐛debugボタンで状態を確認`; }
    }
  }, 5000);
}

function collectDebugState() {
  const p0 = G.players[0], p1 = G.players[1];
  const fieldStr = (p, idx) => p.field.map(c => {
    const cd = CARD_DB[c.cardId];
    const flags = [
      c.tapped ? 'tapped' : 'untap',
      c.sick ? 'sick' : '',
      c.mustAttack ? 'mustAtk' : '',
      c.damage ? `dmg${c.damage}` : '',
      c.entryTurn === G.turn ? 'entryTurn' : '',
    ].filter(Boolean).join(',');
    return `  [${c.instanceId}] ${cd.name}(${cd.power}/${cd.toughness}) ${flags}`;
  }).join('\n') || '  (なし)';

  const lines = [
    `=== DCG デバッグスナップショット ===`,
    `ターン: ${G.turn}  アクティブ: P${G.activePlayer}  フェイズ: ${G.phase}`,
    ``,
    `[プレイヤー0] ライフ:${p0.life} 手札:${p0.hand.length} 山:${p0.deck.length} 土地:${p0.lands.length}`,
    fieldStr(p0, 0),
    `[プレイヤー1] ライフ:${p1.life} 手札:${p1.hand.length} 山:${p1.deck.length} 土地:${p1.lands.length}`,
    fieldStr(p1, 1),
    ``,
    `優先権待ち: ${G.awaitingPriority}  優先権プレイヤー: ${G.priorityFor}`,
    `ブロックモード: ${G.playerBlockMode}  targetMode: ${G.targetMode ? G.targetMode.type : 'null'}`,
    `格闘モード: ${G.kakutouTargetMode}  攻撃モード: ${G.attackMode}`,
    `チャージモード: ${G.chargingMode}  マリガン: ${G.mulliganMode}`,
    `mustAttackCreatures: [${Array.from(G.mustAttackCreatures).join(',')}]`,
    `aiCurrentAttackers: ${JSON.stringify(G.aiCurrentAttackers)}`,
    `スタック: ${G.stack.length}件`,
    ``,
    `最後の操作から: ${Math.floor((Date.now()-_lastActionTime)/1000)}秒`,
  ];
  return lines.join('\n');
}

function showDebugPanel() {
  const info = collectDebugState();
  const html = `
    <div style="font-size:10px;color:#aaa;margin-bottom:8px;">
      このテキストをコピーしてエージェント（Claude）に貼り付けてください。
    </div>
    <textarea id="debug-snapshot" readonly style="width:100%;height:260px;background:#0a0a14;color:#88ffaa;border:1px solid #336633;border-radius:4px;padding:8px;font-size:10px;font-family:monospace;resize:vertical;">${info}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button onclick="
        const ta=document.getElementById('debug-snapshot');
        ta.select(); ta.setSelectionRange(0,99999);
        navigator.clipboard ? navigator.clipboard.writeText(ta.value).then(()=>this.textContent='✅ コピー済') : document.execCommand('copy');
        this.textContent='✅ コピー済';
      " style="flex:1;padding:8px;background:#1a2a1a;border:1px solid #446644;color:#88ff88;">📋 クリップボードにコピー</button>
      <button onclick="
        const ta=document.getElementById('debug-snapshot');
        ta.value=collectDebugState();
      " style="padding:8px;background:#1a1a2a;border:1px solid #444466;color:#8888ff;">🔄 更新</button>
    </div>
    <div style="font-size:10px;color:#666;margin-top:8px;">
      フリーズ時は「何をしようとしたか」も一緒に伝えると修正しやすいです。
    </div>
  `;
  showModal('🐛 デバッグ情報', html);
}


// ============================================================
// AI透明性（学習の見える化）
// ============================================================

// ── D. 対戦中のAI思考表示（ON/OFF切替・保存）────────────────
let AI_THINK_LOG = (function(){ try { return localStorage.getItem('dcg_ai_think_log') !== '0'; } catch(e){ return true; } })();
function setAIThinkLog(on) {
  AI_THINK_LOG = !!on;
  try { localStorage.setItem('dcg_ai_think_log', on ? '1' : '0'); } catch(e){}
}
// AIの判断理由を対戦ログに出す（OFFなら何もしない）
function aiThink(msg) {
  if (!AI_THINK_LOG) return;
  if (typeof log === 'function') log(`💭 AI: ${msg}`, 'ai-think');
}

// ── B. 性格ゲージ: 判断基準の数値を「性格」に翻訳 ─────────────
// max はゲージが振り切れる目安（学習済み重みの実測レンジから設定）
const AI_PERSONA_AXES = [
  { key:'attack', label:'攻撃性',     desc:'先に殴って主導権を取りたがる',       calc:w=>(w.attackBias||0),                        max:2.0 },
  { key:'guard',  label:'守りの意識', desc:'ブロックして被害を防ぎたがる',       calc:w=>(w.blockRisk||0),                         max:2.5 },
  { key:'life',   label:'ライフ重視', desc:'ライフ差をどれだけ気にするか',       calc:w=>((w.life||0)+(w.lateLifeBonus||0))/2,     max:2.2 },
  { key:'board',  label:'盤面重視',   desc:'場のクリーチャーの質と数へのこだわり', calc:w=>((w.fieldPower||0)+(w.fieldCount||0))/2,  max:2.0 },
  { key:'hand',   label:'手札重視',   desc:'手札の枚数（選択肢）を大事にする',   calc:w=>(w.handAdv||0),                           max:1.2 },
  { key:'tempo',  label:'マナ効率',   desc:'マナを無駄にしないよう気にする',     calc:w=>(w.manaEff||0),                           max:1.3 },
];
// 重み→0..100（負値は0で足切り＝「ほぼ気にしない」扱い）
function getAIPersona(weights) {
  return AI_PERSONA_AXES.map(ax => {
    const raw = ax.calc(weights || {});
    const pct = Math.max(0, Math.min(100, Math.round(raw / ax.max * 100)));
    return { key: ax.key, label: ax.label, desc: ax.desc, pct, raw };
  });
}
function personaLevelWord(pct) {
  if (pct >= 75) return 'とても強い';
  if (pct >= 50) return '強い';
  if (pct >= 25) return 'ふつう';
  return '弱い';
}

// ── A. 学習履歴ノート（localStorage永続化・最新50件）──────────
let AI_LEARN_HISTORY = [];
function loadAILearnHistory() {
  try {
    const s = localStorage.getItem('dcg_ai_learn_history');
    AI_LEARN_HISTORY = s ? JSON.parse(s) : [];
    if (!Array.isArray(AI_LEARN_HISTORY)) AI_LEARN_HISTORY = [];
  } catch(e) { AI_LEARN_HISTORY = []; }
}
function recordAILearnEvent(entry) {
  loadAILearnHistory();
  AI_LEARN_HISTORY.push(entry);
  if (AI_LEARN_HISTORY.length > 50) AI_LEARN_HISTORY = AI_LEARN_HISTORY.slice(-50);
  try { localStorage.setItem('dcg_ai_learn_history', JSON.stringify(AI_LEARN_HISTORY)); } catch(e){}
}
loadAILearnHistory();

// ── E. カード好みランキング用データ ──────────────────────
function getAICardPreferences(weights) {
  const w = weights || AI_WEIGHTS;
  return Object.keys(w)
    .filter(k => k.startsWith('card_'))
    .map(k => {
      const id = k.slice(5);
      const cd = (typeof CARD_DB !== 'undefined') ? CARD_DB[id] : null;
      return { id, name: cd ? cd.name : id, icon: cd ? (cd.icon || '') : '', value: w[k] || 0 };
    })
    .sort((a, b) => b.value - a.value);
}

// ============================================================
// AI意味不明な行動の防止（5施策: B→A→C→D→E）
// ============================================================

// グローバル状態: 監査ログ＆パターン記憶
let AI_DECISION_AUDIT = [];       // C案: 各判断の sanity_score
let AI_PATTERN_BLOCKS = [];       // E案: 「この状況この行動は負けた」パターン
let AI_SANITY_ENABLED = true;     // 妥当性チェックのON/OFF

// ────────────────────────────────────────────────────────────
// Phase B: Hard Constraints（硬い制約・明らかにおかしい行動を禁止）
// ────────────────────────────────────────────────────────────

function validateBlockingDecision(atkInst, blkInst, atkPlayer) {
  const defender = 1 - atkPlayer;
  const atkPow = getEffectivePower(atkPlayer, atkInst);
  const blkPow = getEffectivePower(defender, blkInst);
  const blkTou = getEffectiveToughness(defender, blkInst);
  const atkTou = getEffectiveToughness(atkPlayer, atkInst);
  const blkSurvives = (blkTou - blkInst.damage) > atkPow;
  const atkDies = (atkTou - atkInst.damage) <= blkPow;
  
  // B案: Hard Constraints
  // 1) 相打ちで負ける場合：ライフ差が極大でない限りブロック禁止
  if (!blkSurvives && !atkDies) {
    const me = G.players[defender];
    const opp = G.players[atkPlayer];
    // 相打ちで我が方クリーチャーが破壊されるのに、ライフ優位でない場合は禁止
    if (me.life <= opp.life + 5) {
      return false; // ブロック禁止
    }
  }
  // 2) ブロッカーが死に、攻撃も通る場合：禁止
  if (!blkSurvives && !atkDies) {
    return false;
  }
  return true; // ブロック許可
}

function validateAttackDecision(candidates, player) {
  const me = G.players[player];
  const opp = G.players[1 - player];
  const totalPow = candidates.reduce((s, c) => s + getEffectivePower(player, c), 0);
  
  // B案: Hard Constraints
  // リーサル計算の合理性チェック
  const untappedBlockers = opp.field.filter(c => !c.tapped).length;
  const sorted = [...candidates].sort((a, b) => getEffectivePower(player, a) - getEffectivePower(player, b));
  const blockedPow = sorted.slice(0, untappedBlockers).reduce((s, c) => s + getEffectivePower(player, c), 0);
  const damageThrough = totalPow - blockedPow;
  
  // 攻撃してもダメージが10未満で、相手ライフが10以上の場合「無意味な攻撃」と判定
  if (damageThrough < 10 && opp.life > 10 && G.turn > 8) {
    return false; // 攻撃禁止（ターン8以降で無意味な攻撃は避ける）
  }
  return true; // 攻撃許可
}

// ────────────────────────────────────────────────────────────
// Phase A: Sanity Check（妥当性の再確認＝ブロック判定の二重チェック）
// ────────────────────────────────────────────────────────────

function sanitizeBlockDecision(atkInst, blkInst, atkPlayer) {
  if (!AI_SANITY_ENABLED) return true; // チェック無効時はスキップ
  
  // Hard Constraintsを確認
  if (!validateBlockingDecision(atkInst, blkInst, atkPlayer)) {
    if (typeof aiThink === 'function') aiThink('ブロック禁止: Hard Constraints違反（損失が大きすぎる）');
    return false;
  }
  
  // 追加チェック: 本当にブロック価値があるか再計算
  const defender = 1 - atkPlayer;
  const atkPow = getEffectivePower(atkPlayer, atkInst);
  const blkPow = getEffectivePower(defender, blkInst);
  const blkTou = getEffectiveToughness(defender, blkInst);
  const atkTou = getEffectiveToughness(atkPlayer, atkInst);
  const blkSurvives = (blkTou - blkInst.damage) > atkPow;
  const atkDies = (atkTou - atkInst.damage) <= blkPow;
  
  // 最悪の場合（両方死ぬ）でも、ライフ余裕がない場合はOK
  if (!blkSurvives && !atkDies) {
    const me = G.players[defender];
    if (me.life < atkPow * 2) return true; // ライフが危ないなら相打ちもOK
  }
  
  return true;
}

// ────────────────────────────────────────────────────────────
// Phase C: Decision Audit Log（判断の監査）
// ────────────────────────────────────────────────────────────

function recordDecisionAudit(decision, context, sanity_score) {
  // sanity_score: 0-100（100=最も合理的）
  AI_DECISION_AUDIT.push({
    time: Date.now(),
    decision, context, sanity_score
  });
  if (AI_DECISION_AUDIT.length > 500) AI_DECISION_AUDIT = AI_DECISION_AUDIT.slice(-500);
  
  // スコアが30未満なら警告ログ
  if (sanity_score < 30) {
    if (typeof aiThink === 'function') {
      aiThink(`⚠️ 妥当性低い判断: ${decision} (score=${sanity_score})`);
    }
  }
}

function calculateSanityScore(decision, context) {
  // 決定の妥当性スコア（0-100）を計算
  // decision: 'block' | 'attack' | 'play_card' etc
  // context: {atkPow, blkTou, lifeGap, boardState, ...}
  
  let score = 50; // ニュートラル
  
  if (decision === 'block') {
    // ブロック妥当性: 一方的に勝てる場合は高スコア
    if (context.atkDies && context.blkSurvives) score = 95;
    else if (context.atkDies) score = 85;
    else if (context.blkSurvives) score = 75;
    else if (Math.abs(context.lifeGap) < 5) score = 65; // ライフが拮抗してる場合のみ相打ちOK
    else score = 20; // 損な相打ちは低スコア
  } else if (decision === 'attack') {
    // 攻撃妥当性: リーサル見えてるか、有意なダメージを見込めるか
    if (context.isLethal) score = 98;
    else if (context.damageThrough >= 10) score = 75;
    else if (context.damageThrough >= 5) score = 50;
    else score = 20;
  } else if (decision === 'play_card') {
    // カード妥当性: 盤面改善できるか、マナ効率は良いか
    if (context.improvesBoard > 2) score = 80;
    else if (context.improvesBoard > 0) score = 60;
    else if (context.manaEfficiency > 0.8) score = 55;
    else score = 25;
  }
  
  return Math.max(0, Math.min(100, score));
}

// ────────────────────────────────────────────────────────────
// Phase D: Context-Aware Fallback（文脈認識フォールバック）
// ────────────────────────────────────────────────────────────

function applyContextFallback(bestOption, allOptions, context) {
  // bestOption: 最適候補（MCTS/Greedy選択）
  // allOptions: 全候補
  // sanity_scoreが異常に低い場合、より安全な代替案に切り替える
  
  if (!bestOption) return null;
  
  const bestScore = (typeof calculateSanityScore === 'function')
    ? calculateSanityScore(context.decision, {...context, option: bestOption})
    : 50;
  
  // スコアが30未満で、より安全な代替案がある場合は切り替え
  if (bestScore < 30) {
    const saferOption = allOptions.find(opt => {
      const optScore = (typeof calculateSanityScore === 'function')
        ? calculateSanityScore(context.decision, {...context, option: opt})
        : 50;
      return optScore > bestScore + 20; // 20ポイント以上改善
    });
    
    if (saferOption && typeof aiThink === 'function') {
      aiThink(`フォールバック: 妥当性の高い判断に切り替え（${bestScore}→より高）`);
    }
    return saferOption || bestOption;
  }
  
  return bestOption;
}

// ────────────────────────────────────────────────────────────
// Phase E: Pattern Blocker（パターン記憶＆回避）
// ────────────────────────────────────────────────────────────

function recordLossPattern(situation) {
  // 負けた試合のパターンを記録
  // situation: {turn, atkPow, blkTou, atkTou, blkSurvives, atkDies, outcome:'loss'}
  AI_PATTERN_BLOCKS.push({
    time: Date.now(),
    pattern: situation,
    blocked: false
  });
  if (AI_PATTERN_BLOCKS.length > 200) AI_PATTERN_BLOCKS = AI_PATTERN_BLOCKS.slice(-200);
  try {
    localStorage.setItem('dcg_ai_pattern_blocks', JSON.stringify(AI_PATTERN_BLOCKS));
  } catch(e) {}
}

function shouldBlockPattern(situation) {
  // 現在の状況が「過去に負けたパターン」に合致するかチェック
  return AI_PATTERN_BLOCKS.some(block => {
    const p = block.pattern;
    // パターン照合: ターン、パワー差、タフネス差が近い場合は回避
    const turnMatch = Math.abs((G.turn || 1) - p.turn) <= 2;
    const powMatch = Math.abs(getEffectivePower(p.atkPlayer, p.atkInst) - p.atkPow) <= 1;
    const touMatch = Math.abs(getEffectiveToughness(p.defPlayer, p.blkInst) - p.blkTou) <= 1;
    
    if (turnMatch && powMatch && touMatch && !block.blocked) {
      block.blocked = true; // 一度ブロックしたら記憶
      return true;
    }
    return false;
  });
}

function loadPatternBlocks() {
  try {
    const s = localStorage.getItem('dcg_ai_pattern_blocks');
    AI_PATTERN_BLOCKS = s ? JSON.parse(s) : [];
  } catch(e) { AI_PATTERN_BLOCKS = []; }
}

loadPatternBlocks();


// ============================================================
// 裏目ケア（相手の返し札を読む思考: A見える危険/B構え読み/C最悪想定/Dリスク分散/E裏目学習）
// ============================================================

// ── E. 裏目の学習: 食らった裏目カードの記憶（localStorage永続化・ゲームをまたいで保持）──
let AI_URAME_MEMORY = {};   // {cardId: 食らった回数}
function loadUrameMemory() {
  try {
    const s = localStorage.getItem('dcg_ai_urame');
    AI_URAME_MEMORY = s ? JSON.parse(s) : {};
    if (!AI_URAME_MEMORY || typeof AI_URAME_MEMORY !== 'object') AI_URAME_MEMORY = {};
  } catch(e) { AI_URAME_MEMORY = {}; }
}
function recordUrameEvent(cardId, kind) {
  AI_URAME_MEMORY[cardId] = (AI_URAME_MEMORY[cardId] || 0) + 1;
  try { localStorage.setItem('dcg_ai_urame', JSON.stringify(AI_URAME_MEMORY)); } catch(e) {}
  const cd = (typeof CARD_DB !== 'undefined') ? CARD_DB[cardId] : null;
  if (typeof aiThink === 'function' && cd) {
    aiThink(`裏目を記憶: 「${cd.name}」は次から警戒する（通算${AI_URAME_MEMORY[cardId]}回目）`);
  }
}
// 警戒度 0〜3（食らった回数が多いほど強く警戒）
function getUrameWariness(cardId) {
  return Math.min(3, AI_URAME_MEMORY[cardId] || 0);
}
loadUrameMemory();

// ── B. 枚数勘定: 相手の公開ゾーン（墓地・場）から「もう使った枚数」を数える ──
function countOppSeenCard(oppIdx, cardId) {
  const o = G.players[oppIdx];
  let n = 0;
  (o.graveyard || []).forEach(id => { if (id === cardId) n++; });
  (o.field || []).forEach(c => { if (c.cardId === cardId) n++; });
  (o.exile || []).forEach(id => { if (id === cardId) n++; });
  return n;
}
// 相手の山＋手札にまだ残っていそうな枚数（4枚積み前提の引き算）
function estimateOppRemaining(oppIdx, cardId) {
  const seen = countOppSeenCard(oppIdx, cardId);
  // 「相手がそのカードを使うデッキか」の判断:
  //  特殊マッチ=デッキ固定で確実に入っている / それ以外=見せた or 過去に裏目を食らったカードのみ警戒
  const knownDeck = (typeof SPECIAL_MATCH_MODE !== 'undefined' && SPECIAL_MATCH_MODE);
  const playsIt = knownDeck || seen > 0 || getUrameWariness(cardId) > 0;
  if (!playsIt) return 0;
  return Math.max(0, 4 - seen);
}

// ── B. クイック警戒: 相手が「構えている」かを読む ──
// 構えマナ＋残り枚数＋裏目記憶から、警戒レベル0〜1と脅威リストを返す
function assessQuickRisk(oppIdx) {
  const o = G.players[oppIdx];
  if (!o.hand || o.hand.length === 0) return { level: 0, threats: [] };
  const untappedMana = (o.lands || []).filter(l => !l.tapped).length;
  if (untappedMana === 0) return { level: 0, threats: [] };
  const threats = [];
  Object.keys(CARD_DB).forEach(cid => {
    const cd = CARD_DB[cid];
    if (!cd || cd.type !== 'spell') return;
    const isQuick = (cd.keywords && cd.keywords.includes('Quick')) || cd.quick;
    if (!isQuick) return;
    if (totalCost(cd.cost || {}) > untappedMana) return; // 構えマナ不足＝撃てない
    const remaining = estimateOppRemaining(oppIdx, cid);
    if (remaining <= 0) return; // 使い切った（枚数勘定）
    threats.push({ cardId: cid, name: cd.name, remaining, wary: getUrameWariness(cid) });
  });
  if (threats.length === 0) return { level: 0, threats: [] };
  const maxWary = Math.max(...threats.map(t => t.wary));
  // 基本0.4、裏目経験1回ごとに+0.2（最大1.0）
  return { level: Math.min(1, 0.4 + 0.2 * maxWary), threats };
}

// ── A. 見える裏目: 相手の場（公開情報）の危険を数値化 ──
function assessOpponentDangers(aiIdx) {
  const oppIdx = 1 - aiIdx;
  const dangers = { attackPing: 0, pingSources: [], blockPunishers: [], deathtouchBlockers: [] };
  (G.players[oppIdx].field || []).forEach(c => {
    const cd = CARD_DB[c.cardId];
    if (!cd) return;
    // 僧侶タイプ: こちらの攻撃宣言のたびに2ダメージ飛んでくる
    if (cd.onOpponentAttack === 'damage2opponent') {
      dangers.attackPing += 2;
      dangers.pingSources.push(cd.name);
    }
    const canBlock = !c.tapped || (cd.ocBlockWhileTapped && isOCActive(oppIdx));
    if (canBlock && cd.onBlock) dangers.blockPunishers.push({ name: cd.name, effect: cd.onBlock });
    if (canBlock && cd.deathtouch) dangers.deathtouchBlockers.push(cd.name);
  });
  return dangers;
}

// ── A+C+D. 攻撃前の裏目ケア本体 ──
// attackers: 攻撃予定リスト → 裏目を織り込んで絞ったリストと説明文を返す
function applyUrameCare(attackers, aiIdx, isLethal) {
  const notes = [];
  if (isLethal || !attackers || attackers.length === 0) return { attackers, notes }; // リーサル時は全力（ケア不要）
  const oppIdx = 1 - aiIdx;
  const isForced = c => c.mustAttack ||
    (c.sick && CARD_DB[c.cardId].kakutou && c.entryTurn === G.turn);
  let result = attackers.slice();

  const dangers = assessOpponentDangers(aiIdx);
  const quick = assessQuickRisk(oppIdx);

  // A: 攻撃時ping（僧侶など）ケア — 宣言しただけで死ぬ攻撃者は見送り
  if (dangers.attackPing > 0) {
    const fragile = result.filter(c => !isForced(c) &&
      (getEffectiveToughness(aiIdx, c) - (c.damage || 0)) <= dangers.attackPing);
    if (fragile.length > 0) {
      result = result.filter(c => !fragile.includes(c));
      const names = fragile.map(c => CARD_DB[c.cardId].name).join('・');
      notes.push(`${dangers.pingSources.join('・')}の「攻撃時2ダメージ」をケア: ${names}は攻撃を見送り`);
    }
  }

  // B→C: クイック警戒 — 裏目経験があるほど慎重に（D: 脆い攻撃者を1体温存）
  if (quick.level > 0 && result.length > 0) {
    const quickDmg = 2; // 盾撃(2ダメージ)が代表的な脅威
    const vulnerable = result.filter(c => !isForced(c) &&
      (getEffectiveToughness(aiIdx, c) - (c.damage || 0)) <= quickDmg);
    const threatNames = quick.threats.map(t => t.name).join('・');
    if (quick.level >= 0.6 && vulnerable.length > 0 && result.length > 1) {
      // 裏目経験あり: 脆い攻撃者のうち1体を温存（全滅リスクの分散）
      const spare = vulnerable.reduce((a, b) =>
        getEffectivePower(aiIdx, b) > getEffectivePower(aiIdx, a) ? b : a); // 一番価値の高い脆い子を守る
      result = result.filter(c => c !== spare);
      notes.push(`${threatNames}を警戒（相手が構えマナあり・過去に裏目経験）: ${CARD_DB[spare.cardId].name}は温存`);
    } else if (vulnerable.length > 0) {
      const restCount = quick.threats.reduce((s, t) => s + t.remaining, 0);
      notes.push(`${threatNames}の可能性に注意して攻撃（残り${restCount}枚と推定）`);
    }
  }

  // C+D: 反撃ワーストケース — 攻撃後、返しの総攻撃で負けるなら1体防御に残す
  if (result.length > 0) {
    const me = G.players[aiIdx];
    const oppField = G.players[oppIdx].field || [];
    if (oppField.length > 0) {
      const attackerIds = new Set(result.map(c => c.instanceId));
      // 攻撃に出すとタップ（警戒持ちは残る）→ 残る防御要員
      const homeGuards = me.field.filter(c =>
        !attackerIds.has(c.instanceId) || CARD_DB[c.cardId].vigilance);
      const blockable = Math.min(homeGuards.length, oppField.length);
      const sortedPow = oppField.map(c => getEffectivePower(oppIdx, c)).sort((a, b) => b - a);
      const throughPow = sortedPow.slice(blockable).reduce((s, p) => s + p, 0);
      if (throughPow >= me.life) {
        const recallable = result.filter(c => !isForced(c) && !CARD_DB[c.cardId].vigilance);
        if (recallable.length > 0) {
          const weakest = recallable.reduce((a, b) =>
            getEffectivePower(aiIdx, b) < getEffectivePower(aiIdx, a) ? b : a);
          result = result.filter(c => c !== weakest);
          notes.push(`返しの総攻撃で負ける恐れ: ${CARD_DB[weakest.cardId].name}を防御に残す`);
        }
      }
    }
  }

  return { attackers: result, notes };
}
