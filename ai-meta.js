// ============================================================
// AI META LAYER — 「AI自身で必要な観点や知識を見極める」
//   案1: カード知識の自動獲得 (CARD_KNOWLEDGE)
//   案2: 特徴量の自動生成・選択 (AUTO FEATURES: af_* 重み)
//   案3: 局面の自己分類と観点切替 (SITUATION: sit_* 重み)
//   案4: 相手モデリング (OPP_MODEL)
//   案5: 思考時間の自己配分 (META_SEARCH)
//   案6: 弱点の自己発見と知識検証ゲート (WEAKNESS / GATE)
//
// sim.js / ai.js / engine.js から typeof ガード付きで呼ばれる。
// 全機能は既定で「挙動中立」：学習・観測データが無い限りスコアへの
// 寄与は 0（案5のみ思考時間の配分が変わるが、選択そのものは同じ探索）。
// 学習で得た知識は案6の検証ゲートを通過して初めて実戦投入される。
// ============================================================

// ── 機能フラグ（localStorage永続） ──────────────────────────────
const META_AI_LS = 'dcg_meta_flags';
let META_AI = {
  adaptiveSearch: true, // 案5
  cardKnowledge: true,  // 案1（ゲート通過後に有効化される）
  autoFeatures: true,   // 案2
  situation: true,      // 案3
  oppModel: true,       // 案4
};
(function () {
  try {
    const s = localStorage.getItem(META_AI_LS);
    if (s) META_AI = { ...META_AI, ...JSON.parse(s) };
  } catch (e) {}
})();
function saveMetaAIFlags() {
  try { localStorage.setItem(META_AI_LS, JSON.stringify(META_AI)); } catch (e) {}
}

// ============================================================
// 案5: 思考時間の自己配分（メタ推論）
//   「どこで深く考えるべきか」をAI自身が探索の途中経過から判断する。
//   候補の優劣が明確 → 早期終了 / 拮抗 → 1回だけ時間延長。
// ============================================================
const META_SEARCH = {
  checkEvery: 48,        // 何反復ごとに判定するか
  minFrac: 0.35,         // 予算のこの割合までは必ず考える
  clearVisitShare: 0.62, // 最多訪問の子がこの割合を占め…
  clearValueGap: 0.08,   // …かつ価値差がこれ以上なら「明確」→早期終了
  closeValueGap: 0.03,   // 締切時に価値差がこれ以下なら「拮抗」→延長
  extendFactor: 1.6,     // 延長後の総予算は基本予算×この倍率まで
};
let META_SEARCH_LAST = { earlyStops: 0, extends: 0, savedMs: 0, spentExtraMs: 0 };

// mctsSearch（木探索）用: ルート子ノードの訪問数と価値から判断する
function metaSearchDecide(children, elapsed, budget, extended) {
  if (!META_AI.adaptiveSearch || children.length < 2) return 'continue';
  if (elapsed < budget * META_SEARCH.minFrac) return 'continue';
  let total = 0, top = null, second = null;
  for (const c of children) {
    total += c.visits;
    if (!top || c.visits > top.visits) { second = top; top = c; }
    else if (!second || c.visits > second.visits) second = c;
  }
  if (!top || !second || top.visits < 20 || second.visits < 8) return 'continue';
  const vTop = top.wins / top.visits, vSec = second.wins / second.visits;
  const share = top.visits / Math.max(1, total);
  if (share >= META_SEARCH.clearVisitShare && (vTop - vSec) >= META_SEARCH.clearValueGap) return 'stop';
  if (!extended && elapsed >= budget * 0.95 && Math.abs(vTop - vSec) <= META_SEARCH.closeValueGap) return 'extend';
  return 'continue';
}

// サンプリング型ループ（mctsPickOption / mctsPickAttackers 等）用
function metaSampleDecide(wins, trials, elapsed, budget, extended) {
  if (!META_AI.adaptiveSearch || wins.length < 2) return 'continue';
  if (elapsed < budget * META_SEARCH.minFrac) return 'continue';
  let ti = -1, si = -1;
  for (let i = 0; i < wins.length; i++) {
    if (trials[i] < 8) return 'continue'; // 全候補に最低試行数を保証
    const r = wins[i] / trials[i];
    if (ti === -1 || r > wins[ti] / trials[ti]) { si = ti; ti = i; }
    else if (si === -1 || r > wins[si] / trials[si]) si = i;
  }
  if (ti === -1 || si === -1) return 'continue';
  const gap = wins[ti] / trials[ti] - wins[si] / trials[si];
  if (gap >= 0.12) return 'stop';
  if (!extended && elapsed >= budget * 0.95 && gap <= META_SEARCH.closeValueGap) return 'extend';
  return 'continue';
}

// ============================================================
// 案2: 特徴量の自動生成・選択
//   基本シグナルから単独特徴＋交互作用（積）を機械的に生成し、
//   重み af_* としてGA学習の対象に載せる。寄与しない特徴は
//   pruneAutoFeatures() でゼロに刈り込まれる＝「観点の取捨選択」。
// ============================================================
// 基本シグナル（それぞれ概ね -1.5〜+1.5 に正規化）
function afSignals(sim, player) {
  const s = sim.state, me = s.players[player], opp = s.players[1 - player];
  let myPow = 0, myFlyPow = 0, myFlyCnt = 0, myReady = 0, myBig = 0;
  for (const c of me.field) {
    const cd = CARD_DB[c.cardId];
    const p = (cd.power || 0) + (c.tempPower || 0);
    myPow += p;
    if (cd.flying) { myFlyPow += p; myFlyCnt++; }
    if (!c.sick && !c.tapped) myReady += p;
    if (p >= 4) myBig++;
  }
  let oppPow = 0, oppFlyPow = 0, oppBig = 0;
  for (const c of opp.field) {
    const cd = CARD_DB[c.cardId];
    const p = (cd.power || 0) + (c.tempPower || 0);
    oppPow += p;
    if (cd.flying) oppFlyPow += p;
    if (p >= 4) oppBig++;
  }
  let unplayable = 0;
  for (const cid of me.hand) {
    const c = CARD_DB[cid];
    if (c && c.cost && !sim.canAfford(me, c.cost)) unplayable++;
  }
  const myCX = me.lands.length + me.lands.filter(l => l.chargeCard).length;
  const oppCX = opp.lands.length + opp.lands.filter(l => l.chargeCard).length;
  return {
    flyDiff: (myFlyPow - oppFlyPow) / 4,                       // 飛行打点差
    airHole: (oppFlyPow > 0 && myFlyCnt === 0) ? oppFlyPow / 4 : 0, // 空の穴（相手の飛行を止められない）
    raceMe: myReady / Math.max(1, opp.life),                   // 自分のリーサル距離
    raceOpp: oppPow / Math.max(1, me.life),                    // 被リーサル距離
    widthDiff: (me.field.length - opp.field.length) / 3,       // 盤面の幅
    lifeEdge: (me.life - opp.life) / 10,                       // ライフ差
    bigDiff: (myBig - oppBig) / 2,                             // 大型クリーチャー差
    manaJam: unplayable / 3,                                   // マナ渋滞
    cxLead: (myCX - oppCX) / 5,                                // CX進行差
    gasDiff: (me.hand.length - opp.hand.length) / 4,           // 手札リソース差
  };
}

// 候補特徴の機械生成: 単独10 + 交互作用（積）15 = 25個
const AF_BASE_KEYS = ['flyDiff', 'airHole', 'raceMe', 'raceOpp', 'widthDiff', 'lifeEdge', 'bigDiff', 'manaJam', 'cxLead', 'gasDiff'];
const AF_PAIR_KEYS = ['flyDiff', 'airHole', 'raceMe', 'raceOpp', 'widthDiff', 'lifeEdge'];
const AF_DEFS = [];
AF_BASE_KEYS.forEach(k => AF_DEFS.push({ key: 'af_' + k, fn: S => S[k] }));
for (let i = 0; i < AF_PAIR_KEYS.length; i++) {
  for (let j = i + 1; j < AF_PAIR_KEYS.length; j++) {
    const a = AF_PAIR_KEYS[i], b = AF_PAIR_KEYS[j];
    AF_DEFS.push({ key: `af_x_${a}__${b}`, fn: S => S[a] * S[b] });
  }
}

// simEvalV2 から呼ばれる。af_* が全てゼロなら（＝未学習）計算せず 0。
function autoFeatureScore(sim, player, w) {
  if (!META_AI.autoFeatures) return 0;
  let any = false;
  for (const d of AF_DEFS) {
    const v = w[d.key];
    if (v && (v > 1e-4 || v < -1e-4)) { any = true; break; }
  }
  if (!any) return 0;
  const S = afSignals(sim, player);
  let sc = 0;
  for (const d of AF_DEFS) {
    const v = w[d.key];
    if (v) sc += v * d.fn(S);
  }
  return sc;
}

// 特徴選択: 寄与の小さい特徴をゼロに刈り込む（AIが観点を捨てる）
function pruneAutoFeatures(eps) {
  const e = eps === undefined ? 0.05 : eps;
  let kept = 0, pruned = 0;
  for (const d of AF_DEFS) {
    const v = AI_WEIGHTS[d.key] || 0;
    if (v !== 0 && Math.abs(v) < e) { AI_WEIGHTS[d.key] = 0; pruned++; }
    else if (Math.abs(v) >= e) kept++;
  }
  if (AI_CURRENT_COLOR) saveAIColorWeights(AI_CURRENT_COLOR);
  return { kept, pruned };
}

function autoFeatureReport() {
  return AF_DEFS
    .map(d => ({ key: d.key, w: AI_WEIGHTS[d.key] || 0 }))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
}

// ============================================================
// 案3: 局面の自己分類と観点切替
//   「今はどんな局面か」を分類し、局面ごとに評価の力点
//   （ライフ/盤面/テンポ）を切り替える。分類境界(sit_th_*)も
//   力点(sit_<局面>_<観点>)もGA学習の対象＝AIが自分で見極める。
// ============================================================
const SIT_LABELS = ['race', 'ahead', 'behind', 'stall'];
const SIT_ASPECTS = ['life', 'board', 'tempo'];
const SIT_LABEL_JP = { race: 'レース', ahead: '優勢', behind: '劣勢', stall: '膠着', even: '互角' };

function classifySituationSim(sim, player) {
  const s = sim.state, me = s.players[player], opp = s.players[1 - player];
  const w = (sim.w && sim.w[player]) || AI_WEIGHTS;
  let myPow = 0, oppPow = 0;
  for (const c of me.field) myPow += (CARD_DB[c.cardId].power || 0) + (c.tempPower || 0);
  for (const c of opp.field) oppPow += (CARD_DB[c.cardId].power || 0) + (c.tempPower || 0);
  const thLife = w.sit_th_life === undefined ? 9 : w.sit_th_life;
  const thEdge = w.sit_th_edge === undefined ? 5 : w.sit_th_edge;
  // レース: 双方の打点が互いの残りライフに迫っている（守るより殴り合う局面）
  if ((me.life <= thLife && opp.life <= thLife) ||
      (myPow > 0 && oppPow > 0 && myPow >= opp.life * 0.5 && oppPow >= me.life * 0.5)) return 'race';
  const edge = (me.life - opp.life) * 0.5 + (myPow - oppPow) * 0.6 + (me.field.length - opp.field.length);
  if (edge >= thEdge) return 'ahead';
  if (edge <= -thEdge) return 'behind';
  if (me.field.length >= 3 && opp.field.length >= 3 && s.turn >= 8) return 'stall';
  return 'even';
}

// sit_* が全て既定値(=1)なら分類そのものを省く高速パス
function _sitActive(w) {
  for (const l of SIT_LABELS) {
    for (const a of SIT_ASPECTS) {
      const v = w['sit_' + l + '_' + a];
      if (v !== undefined && Math.abs(v - 1) > 1e-3) return true;
    }
  }
  return false;
}

// simEvalV2 から呼ばれる。comps は評価関数が計算済みの構成要素。
function situationAdjust(sim, player, w, comps) {
  if (!META_AI.situation || !_sitActive(w)) return 0;
  const label = classifySituationSim(sim, player);
  if (label === 'even') return 0;
  const mv = (k) => { const v = w['sit_' + label + '_' + k]; return v === undefined ? 1 : v; };
  return (mv('life') - 1) * comps.lifeComp
       + (mv('board') - 1) * comps.boardComp
       + (mv('tempo') - 1) * comps.tempoComp;
}

// 実対局の現局面ラベル（デバッグ/観戦表示用）
function getSituationLabelG() {
  try {
    const sim = SimGame.lite();
    sim.state = mctsStateFromG();
    return classifySituationSim(sim, 1);
  } catch (e) { return 'even'; }
}

// ── 新しい学習キーを重みシステムへ登録 ─────────────────────────
// adaptiveMutate は Object.keys(AI_WEIGHTS_DEFAULT) を都度参照するため、
// ここで登録するだけで af_* / sit_* がGA学習・保存/読込の対象になる。
(function registerMetaWeights() {
  try {
    AF_DEFS.forEach(d => { if (!(d.key in AI_WEIGHTS_DEFAULT)) AI_WEIGHTS_DEFAULT[d.key] = 0; });
    SIT_LABELS.forEach(l => SIT_ASPECTS.forEach(a => {
      const k = 'sit_' + l + '_' + a;
      if (!(k in AI_WEIGHTS_DEFAULT)) AI_WEIGHTS_DEFAULT[k] = 1;
    }));
    if (!('sit_th_life' in AI_WEIGHTS_DEFAULT)) AI_WEIGHTS_DEFAULT.sit_th_life = 9;
    if (!('sit_th_edge' in AI_WEIGHTS_DEFAULT)) AI_WEIGHTS_DEFAULT.sit_th_edge = 5;
    // 既に読み込み済みの実行時重みへ欠損キーを補完（挙動は中立のまま）
    Object.keys(AI_WEIGHTS_DEFAULT).forEach(k => {
      if (AI_WEIGHTS[k] === undefined) AI_WEIGHTS[k] = AI_WEIGHTS_DEFAULT[k];
    });
  } catch (e) {}
})();

// ============================================================
// 案1: カード知識の自動獲得
//   自己対戦から「局面文脈 × カード × 勝率」を集計し、
//   『このカードはどんな局面で使うと勝ちに繋がるか』を
//   AI自身がデータとして獲得する。手書きのカード別ロジック不要。
//   実戦投入は案6の検証ゲート通過後（CARD_KNOWLEDGE_ACTIVE）。
// ============================================================
const CARD_KNOWLEDGE_LS = 'dcg_card_knowledge';
let CARD_KNOWLEDGE = {};            // {cardId: {n, w, ctx: {ctxKey: {n, w}}}}
let CARD_KNOWLEDGE_ACTIVE = false;  // 検証ゲート通過で true（永続）
let CARD_KNOWLEDGE_COLLECT = false; // 知識収集モード（学習中のみ true）
let CARD_KNOWLEDGE_FORCE = null;    // [P0使用, P1使用] A/B検証用の強制指定
const CK_SCALE = 4.0;               // 文脈リフト → 評価スコア換算係数
const CK_MIN_CARD_N = 30;           // カード全体の最低サンプル数
const CK_MIN_CTX_N = 12;            // 文脈ごとの最低サンプル数
const CK_SHRINK = 8;                // 全体勝率への縮約（過学習防止）

(function () {
  try {
    const s = localStorage.getItem(CARD_KNOWLEDGE_LS);
    if (s) {
      const d = JSON.parse(s);
      if (d && d.k) { CARD_KNOWLEDGE = d.k; CARD_KNOWLEDGE_ACTIVE = !!d.active; }
    }
  } catch (e) {}
})();
function saveCardKnowledge() {
  try {
    localStorage.setItem(CARD_KNOWLEDGE_LS, JSON.stringify({ k: CARD_KNOWLEDGE, active: CARD_KNOWLEDGE_ACTIVE }));
  } catch (e) {}
}

// 局面文脈キー: 盤面優劣 / 相手の展開数 / 自ライフ / ゲーム段階 / OC の離散化
function ckContext(sim, ap) {
  const s = sim.state, me = s.players[ap], opp = s.players[1 - ap];
  let myPow = 0, oppPow = 0;
  for (const c of me.field) myPow += (CARD_DB[c.cardId].power || 0) + (c.tempPower || 0);
  for (const c of opp.field) oppPow += (CARD_DB[c.cardId].power || 0) + (c.tempPower || 0);
  const adv = (myPow + me.field.length * 2) - (oppPow + opp.field.length * 2);
  const b = adv > 3 ? 2 : adv < -3 ? 0 : 1;
  const f = opp.field.length === 0 ? 0 : opp.field.length <= 2 ? 1 : 2;
  const l = me.life <= 7 ? 0 : me.life <= 14 ? 1 : 2;
  const t = s.turn <= 4 ? 0 : s.turn <= 9 ? 1 : 2;
  const o = sim.simIsOC(me) ? 1 : 0;
  return `b${b}f${f}l${l}t${t}o${o}`;
}

function ckUseFor(ap) {
  if (CARD_KNOWLEDGE_FORCE) return !!CARD_KNOWLEDGE_FORCE[ap];
  return META_AI.cardKnowledge && CARD_KNOWLEDGE_ACTIVE;
}

// sim.js simPlayCards から呼ばれる: 文脈付きカード価値ボーナス
function cardKnowledgeBonus(sim, ap, cid) {
  if (!ckUseFor(ap)) return 0;
  const k = CARD_KNOWLEDGE[cid];
  if (!k || k.n < CK_MIN_CARD_N) return 0;
  const c = k.ctx[ckContext(sim, ap)];
  if (!c || c.n < CK_MIN_CTX_N) return 0;
  const base = k.w / k.n;
  const rate = (c.w + base * CK_SHRINK) / (c.n + CK_SHRINK);
  return CK_SCALE * (rate - base); // 文脈での勝率リフト
}

// sim.js simPlayCards から呼ばれる: プレイ記録（収集モード時のみ）
function cardKnowledgeRecord(sim, ap, cid) {
  if (!CARD_KNOWLEDGE_COLLECT) return;
  if (!sim._ckLog) sim._ckLog = [[], []];
  sim._ckLog[ap].push(cid + '|' + ckContext(sim, ap));
  // カードカルテ（ai-dossier.js）: 相棒・対面・旬・対象方針も同時収集
  if (typeof dossierRecord === 'function') dossierRecord(sim, ap, cid);
}

// sim.js SimGame.run 終了時に呼ばれる: 勝敗を知識に反映
function cardKnowledgeFinish(sim, winner) {
  if (!CARD_KNOWLEDGE_COLLECT || !sim._ckLog) return;
  // 片方がほぼカードをプレイできなかった試合（マナ事故等）は、勝敗が
  // カード選択と無関係に決まっており「知識」を含まないため学習から除外。
  // これが無いと「プレイできた側が勝つ」だけの無情報な統計に汚染される。
  if (sim._ckLog[0].length < 3 || sim._ckLog[1].length < 3) return;
  // カードカルテ: 同じフィルタを通過した試合だけを知識化する
  if (typeof dossierFinish === 'function') dossierFinish(sim, winner);
  for (let p = 0; p < 2; p++) {
    const won = p === winner ? 1 : 0;
    const seen = new Set(); // 同一ゲーム内の同カード同文脈は1回と数える
    for (const rec of sim._ckLog[p]) {
      if (seen.has(rec)) continue;
      seen.add(rec);
      const sep = rec.indexOf('|');
      const cid = rec.slice(0, sep), ctx = rec.slice(sep + 1);
      const k = CARD_KNOWLEDGE[cid] || (CARD_KNOWLEDGE[cid] = { n: 0, w: 0, ctx: {} });
      k.n++; k.w += won;
      const c = k.ctx[ctx] || (k.ctx[ctx] = { n: 0, w: 0 });
      c.n++; c.w += won;
    }
  }
}

// 現在の訓練色のデッキ構成（無ければデフォルト＝null）
function _metaColorDecks() {
  try {
    if (typeof RATED_COLOR_DEFS !== 'undefined' && AI_CURRENT_COLOR) {
      const def = RATED_COLOR_DEFS.find(c => c.key === AI_CURRENT_COLOR);
      if (def) {
        const main = {}; def.mainList().forEach(id => { main[id] = 4; });
        const land = {}; def.landList().forEach(id => { land[id] = 2; });
        return { main, land };
      }
    }
  } catch (e) {}
  return { main: null, land: null };
}

// 知識収集の自己対戦を回す（案1の学習本体）
async function trainCardKnowledge(nGames, onProgress) {
  const { main, land } = _metaColorDecks();
  CARD_KNOWLEDGE_COLLECT = true;
  const BATCH = 20;
  try {
    for (let i = 0; i < nGames; i += BATCH) {
      for (let j = 0; j < BATCH && i + j < nGames; j++) {
        try {
          const g = new SimGame(AI_WEIGHTS, AI_WEIGHTS, main, main, land, land);
          // カードカルテ(案D): ゲームごとに対象選択方針を変えて優劣を測定
          if (typeof dossierRandomPolicy === 'function') g._tgtPolicy = dossierRandomPolicy();
          g.run();
        } catch (e) {}
      }
      if (onProgress) onProgress(Math.min(i + BATCH, nGames), nGames);
      await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    CARD_KNOWLEDGE_COLLECT = false;
  }
  saveCardKnowledge();
  if (typeof saveCardDossier === 'function') saveCardDossier();
  return cardKnowledgeSummary();
}

// 知識ベースの要約（UI表示用）
function cardKnowledgeSummary() {
  return Object.entries(CARD_KNOWLEDGE).map(([cid, k]) => {
    const base = k.n ? k.w / k.n : 0;
    let maxLift = 0, minLift = 0, ctxN = 0;
    for (const c of Object.values(k.ctx)) {
      if (c.n < CK_MIN_CTX_N) continue;
      ctxN++;
      const rate = (c.w + base * CK_SHRINK) / (c.n + CK_SHRINK);
      if (rate - base > maxLift) maxLift = rate - base;
      if (rate - base < minLift) minLift = rate - base;
    }
    return { cid, n: k.n, base, ctxN, maxLift, minLift };
  }).sort((a, b) => b.n - a.n);
}

// ============================================================
// 案4: 相手モデリング
//   実対戦中の人間(P0)の行動（プレイしたカード・ブロック傾向・
//   マナの構え方）を観測し、MCTSのdeterminization（相手手札の
//   サンプリング）とロールアウト内の相手ブロック判断に反映する。
// ============================================================
const OPP_MODEL_LS = 'dcg_opp_model';
let OPP_MODEL = {
  games: 0,
  blockOpp: 0, blockTaken: 0,   // ブロック機会 / 実際にブロックした回数
  holdTurns: 0, endTurns: 0,    // マナを構えてターンを返した回数 / 観測ターン数
  quickFromHold: 0,             // AIターン中にクイックを撃ってきた回数
  bigHoldTurns: 0,              // 案②: 3マナ以上を残してターンを返した回数（高コスト札温存の癖）
  seenPlays: {},                // 今ゲームで見えた相手のプレイ {cardId: n}
};
(function () {
  try {
    const s = localStorage.getItem(OPP_MODEL_LS);
    if (s) OPP_MODEL = { ...OPP_MODEL, ...JSON.parse(s) };
  } catch (e) {}
})();
function oppModelSave() {
  try { localStorage.setItem(OPP_MODEL_LS, JSON.stringify(OPP_MODEL)); } catch (e) {}
}

// 観測対象は「人間(P0) vs AI のローカル対戦」のみ
function _oppModelObservable() {
  return META_AI.oppModel &&
    typeof NET_MODE !== 'undefined' && NET_MODE === 'local' &&
    (typeof SPECTATOR_MODE === 'undefined' || !SPECTATOR_MODE);
}

// ゲーム開始時: 記憶は残しつつ直近の行動を重視（指数減衰）
function oppModelNewGame() {
  if (!_oppModelObservable()) return;
  for (const k of ['blockOpp', 'blockTaken', 'holdTurns', 'endTurns', 'quickFromHold', 'bigHoldTurns']) {
    OPP_MODEL[k] = (OPP_MODEL[k] || 0) * 0.85;
  }
  OPP_MODEL.seenPlays = {};
  OPP_MODEL.games = (OPP_MODEL.games || 0) + 1;
  oppModelSave();
}

// engine.js playCardFromHand から: 人間がカードをプレイした
function oppModelNotePlay(cardId) {
  if (!_oppModelObservable()) return;
  OPP_MODEL.seenPlays[cardId] = (OPP_MODEL.seenPlays[cardId] || 0) + 1;
  const c = CARD_DB[cardId];
  if (c && c.keywords && c.keywords.includes('Quick') && typeof G !== 'undefined' && G && G.activePlayer === 1) {
    OPP_MODEL.quickFromHold++; // AIターン中のクイック＝構えたマナからの割込み実績
  }
  oppModelSave();
}

// ai.js resolveAICombat から: ブロック機会と実際の選択
function oppModelNoteBlockChance(blocked) {
  if (!_oppModelObservable()) return;
  OPP_MODEL.blockOpp++;
  if (blocked) OPP_MODEL.blockTaken++;
  oppModelSave();
}

// engine.js endTurn から: 人間がマナを構えたままターンを返したか
function oppModelNoteEndTurn() {
  if (!_oppModelObservable() || typeof G === 'undefined' || !G) return;
  OPP_MODEL.endTurns++;
  const untapped = G.players[0].lands.filter(l => !l.tapped).length;
  if (untapped > 0) OPP_MODEL.holdTurns++;
  if (untapped >= 3) OPP_MODEL.bigHoldTurns++; // 案②: 大量マナ温存＝高コスト札を抱えている兆候
  oppModelSave();
}

// 案②: determinization用のサンプル重み。山札の各カードについて
// 「相手の手札に残っていそうな度合い」を観測ベースで返す（1=中立）。
// - クイック構え実績が高い相手 → クイック札の手札確率を上げる
// - 3マナ以上を残して返す癖 → 高コスト札を抱えていると読む／軽い札は既に切られている
// 観測が少ないうちは null（従来の一様サンプル）。
function oppModelHandWeights(deck) {
  if (!META_AI.oppModel) return null;
  const m = OPP_MODEL;
  if ((m.endTurns || 0) < 4) return null;
  const quickRate = Math.min(0.9, (m.quickFromHold || 0) / Math.max(1, m.holdTurns || 1));
  const bigRate = Math.min(0.9, (m.bigHoldTurns || 0) / Math.max(1, m.endTurns || 1));
  if (quickRate < 0.1 && bigRate < 0.15) return null; // シグナル無し → 一様のまま
  return deck.map(cid => {
    const c = CARD_DB[cid];
    if (!c) return 1;
    let w = 1;
    if (c.keywords && c.keywords.includes('Quick')) w *= 1 + quickRate * 2;
    const cost = totalCost(c.cost || {});
    if (cost >= 4) w *= 1 + bigRate * 1.5;
    else if (cost <= 1) w *= Math.max(0.6, 1 - bigRate * 0.5);
    return w;
  });
}

// sim.js simPickBlocker(守備側=P0)から: 観測ブロック率で判定値を補正
// 積極的にブロックする相手ならシミュ内でもブロックさせ、しない相手ならさせない。
function oppModelBlockBias(model) {
  const n = model.blockOpp;
  if (n < 4) return 0;
  const rate = model.blockTaken / n;
  return (rate - 0.5) * 2.0;
}

// sim.js deterministicState から: サンプル手札へのクイック混入補正。
// 「マナを構えたまま返す→クイックを撃つ」実績が高い相手には、
// 構えている状況のサンプル手札に高確率でクイックを含める。
function oppModelAdjustSample(state) {
  if (!META_AI.oppModel) return;
  const m = OPP_MODEL;
  if (m.holdTurns < 3 || m.quickFromHold < 1) return;
  const p0 = state.players[0];
  if (!p0.lands || !p0.lands.some(l => !l.tapped)) return;
  const holdQuickRate = Math.min(0.85, (m.quickFromHold / Math.max(1, m.holdTurns)) * 1.5);
  if (Math.random() >= holdQuickRate) return;
  const isQuick = cid => { const c = CARD_DB[cid]; return c && c.keywords && c.keywords.includes('Quick'); };
  if (p0.hand.some(isQuick)) return;
  const di = p0.deck.findIndex(isQuick);
  if (di === -1 || p0.hand.length === 0) return;
  const hi = Math.floor(Math.random() * p0.hand.length);
  const tmp = p0.hand[hi];
  p0.hand[hi] = p0.deck[di];
  p0.deck[di] = tmp;
}

// ============================================================
// 案6: 弱点の自己発見と知識検証ゲート
//   (a) 自己対戦の敗北局面を分類し、系統的な弱点をレポートする。
//   (b) 学習で得た新しい重み/知識は、現行AIとの独立対戦で
//       統計的に勝ち越した場合のみ採用する（悪化の自動防止）。
// ============================================================
const WEAKNESS_TAGS = {
  air_weak:   { label: '空の穴',     desc: '相手の飛行打点を止められずに負けた', hint: '飛行ブロッカーの価値（af_airHole等）の学習を強化' },
  mana_jam:   { label: 'マナ渋滞',   desc: '出せないカードを抱えたまま負けた',   hint: 'manaEff重みとデッキカーブの見直し' },
  gas_out:    { label: '息切れ',     desc: '手札が尽きて負けた',                 hint: 'handAdv/ドロー系カードの価値を上げる' },
  race_lost:  { label: 'レース負け', desc: '盤面はあったがライフレースで負けた', hint: 'attackBias/blockRisk・race局面の重みを再学習' },
  cx_behind:  { label: 'CX遅れ',     desc: '相手だけOC/CX閾値に到達して負けた',  hint: 'threshold重みとチャージ判断の強化' },
  threw_lead: { label: '逆転負け',   desc: '中盤の優勢を守りきれずに負けた',     hint: '優勢(ahead)局面の観点を保守的に調整' },
  stall_out:  { label: '膠着負け',   desc: '決着がつかず判定で負けた',           hint: 'stall局面のtempo/board観点の調整' },
};
let WEAKNESS_LAST = null;

// ミラー自己対戦で敗北パターンを収集・分類する
async function runWeaknessDiscovery(nGames, onProgress) {
  const { main, land } = _metaColorDecks();
  const counts = {};
  Object.keys(WEAKNESS_TAGS).forEach(t => { counts[t] = 0; });
  let losses = 0;
  const BATCH = 15;
  for (let i = 0; i < nGames; i += BATCH) {
    for (let j = 0; j < BATCH && i + j < nGames; j++) {
      try {
        const g = new SimGame(AI_WEIGHTS, AI_WEIGHTS, main, main, land, land);
        const r = g.run();
        const s = g.state;
        const L = 1 - r.winner; // ミラーなので敗者側を分析
        const lp = s.players[L], wp = s.players[r.winner];
        const koLoss = lp.life <= 0;
        losses++;
        const wFly = wp.field.reduce((sum, c) => sum + (CARD_DB[c.cardId].flying ? (CARD_DB[c.cardId].power || 0) : 0), 0);
        const lFlyBlk = lp.field.filter(c => CARD_DB[c.cardId].flying).length;
        if (koLoss && wFly >= 3 && lFlyBlk === 0) counts.air_weak++;
        const unplayable = lp.hand.filter(cid => { const c = CARD_DB[cid]; return c && c.cost && !g.canAfford(lp, c.cost); }).length;
        if (unplayable >= 3) counts.mana_jam++;
        if (lp.hand.length === 0 && lp.deck.length > 0) counts.gas_out++;
        if (koLoss && lp.field.length >= wp.field.length && lp.field.length >= 2) counts.race_lost++;
        const lCX = lp.lands.length + lp.lands.filter(l => l.chargeCard).length;
        const wCX = wp.lands.length + wp.lands.filter(l => l.chargeCard).length;
        if (wCX >= 10 && lCX < 9) counts.cx_behind++;
        const td = r.tdScores && r.tdScores[L];
        if (td && td.length >= 2 && td[Math.floor(td.length / 2)] > 60) counts.threw_lead++;
        if (!koLoss) counts.stall_out++;
      } catch (e) {}
    }
    if (onProgress) onProgress(Math.min(i + BATCH, nGames), nGames);
    await new Promise(r => setTimeout(r, 0));
  }
  const report = Object.entries(counts)
    .map(([tag, n]) => ({ tag, n, rate: losses ? n / losses : 0, ...WEAKNESS_TAGS[tag] }))
    .sort((a, b) => b.n - a.n);
  WEAKNESS_LAST = { games: nGames, losses, report, when: Date.now() };
  return WEAKNESS_LAST;
}

// 検証ゲート（重み用）: 新重み vs 現行重みを先手/後手交互に対戦させ、
// 片側95%有意の勝率基準を超えたら「採用可」と判定する。
async function runWeightValidationGate(newWeights, nGames, onProgress) {
  const { main, land } = _metaColorDecks();
  let wins = 0, games = 0;
  for (let i = 0; i < nGames; i++) {
    try {
      const newAsP0 = (i % 2 === 0);
      const g = newAsP0
        ? new SimGame(newWeights, AI_WEIGHTS, main, main, land, land)
        : new SimGame(AI_WEIGHTS, newWeights, main, main, land, land);
      const r = g.run();
      games++;
      if ((newAsP0 && r.winner === 0) || (!newAsP0 && r.winner === 1)) wins++;
    } catch (e) {}
    if (i % 30 === 29) {
      if (onProgress) onProgress(i + 1, nGames);
      await new Promise(r => setTimeout(r, 0));
    }
  }
  const winRate = games ? wins / games : 0;
  const need = 0.5 + 1.645 * Math.sqrt(0.25 / Math.max(1, games));
  return { games, winRate, need, adopted: winRate >= need };
}

// 検証ゲート（カード知識用）: 知識あり vs 知識なしをA/B対戦。
// 有意に勝ち越した場合のみ CARD_KNOWLEDGE_ACTIVE=true（実戦投入）。
async function runKnowledgeGate(nGames, onProgress) {
  const { main, land } = _metaColorDecks();
  let winsWith = 0, games = 0;
  const half = Math.floor(nGames / 2);
  try {
    for (let i = 0; i < nGames; i++) {
      const kOn0 = i < half; // 前半はP0が知識使用、後半はP1（先手番の偏り打消し）
      CARD_KNOWLEDGE_FORCE = kOn0 ? [true, false] : [false, true];
      try {
        const r = new SimGame(AI_WEIGHTS, AI_WEIGHTS, main, main, land, land).run();
        games++;
        if ((kOn0 && r.winner === 0) || (!kOn0 && r.winner === 1)) winsWith++;
      } catch (e) {}
      if (i % 25 === 24) {
        if (onProgress) onProgress(i + 1, nGames);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  } finally {
    CARD_KNOWLEDGE_FORCE = null;
  }
  const winRate = games ? winsWith / games : 0;
  const need = 0.5 + 1.645 * Math.sqrt(0.25 / Math.max(1, games));
  const adopted = winRate >= need;
  CARD_KNOWLEDGE_ACTIVE = adopted;
  saveCardKnowledge();
  return { games, winRate, need, adopted };
}

// 自律強化1サイクル: 弱点分析 → 再学習（af_/sit_/card_含む全キー）→
// 検証ゲート → 合格なら採用。「学ぶ→検証→採用」の自律ループ。
async function runAutonomousImproveCycle(opts, onProgress) {
  const o = Object.assign({ weakN: 200, generations: 4, popSize: 6, batchN: 12, valN: 300 }, opts);
  const steps = [];
  if (onProgress) onProgress('弱点分析中...');
  const weak = await runWeaknessDiscovery(o.weakN, null);
  const topWeak = weak.report.filter(r => r.n > 0).slice(0, 3)
    .map(r => `${r.label}${(r.rate * 100).toFixed(0)}%`).join(' / ');
  steps.push(`🔍 弱点分析(${o.weakN}戦): ${topWeak || '顕著な弱点なし'}`);

  if (onProgress) onProgress('重み再学習中...');
  await new Promise(r => setTimeout(r, 0));
  const { main, land } = _metaColorDecks();
  let pop = Array.from({ length: o.popSize }, (_, i) => i === 0 ? { ...AI_WEIGHTS } : adaptiveMutate(AI_WEIGHTS));
  for (let g = 0; g < o.generations; g++) {
    const scores = new Array(pop.length).fill(0);
    for (let i = 0; i < pop.length; i++) {
      for (let j = i + 1; j < pop.length; j++) {
        const wr = runTrainingBatch(pop[i], pop[j], o.batchN, main, main, land, land);
        if (wr > 0.5) scores[i]++; else scores[j]++;
      }
    }
    const ranked = pop.map((w, i) => ({ w, s: scores[i] })).sort((a, b) => b.s - a.s);
    pop = [ranked[0].w, ranked[1].w, crossoverWeights(ranked[0].w, ranked[1].w)];
    while (pop.length < o.popSize) pop.push(adaptiveMutate(ranked[Math.floor(Math.random() * 2)].w));
    if (onProgress) onProgress(`重み再学習中... 世代${g + 1}/${o.generations}`);
    await new Promise(r => setTimeout(r, 0));
  }
  const candidate = { ...pop[0], _version: AI_WEIGHTS_VERSION };
  steps.push(`🧬 再学習: ${o.generations}世代 × 人口${o.popSize}`);

  if (onProgress) onProgress('検証ゲート実行中...');
  const gate = await runWeightValidationGate(candidate, o.valN, null);
  if (gate.adopted) {
    AI_WEIGHTS = candidate;
    if (AI_CURRENT_COLOR) saveAIColorWeights(AI_CURRENT_COLOR);
    steps.push(`✅ 採用: 新重み勝率${(gate.winRate * 100).toFixed(1)}% ≥ 基準${(gate.need * 100).toFixed(1)}% (${gate.games}戦)`);
  } else {
    steps.push(`❌ 見送り: 新重み勝率${(gate.winRate * 100).toFixed(1)}% < 基準${(gate.need * 100).toFixed(1)}% — 現行を維持`);
  }
  return { weak, gate, adopted: gate.adopted, steps };
}

// ============================================================
// UI: 🤖 AI自律強化パネル（AI学習モードから開く）
// ============================================================
function _metaStatus(msg) {
  const el = document.getElementById('meta-ai-status');
  if (el) el.textContent = msg;
}

function showMetaAIPanel() {
  const flag = (k, label) =>
    `<label style="display:flex;align-items:center;gap:5px;cursor:pointer;color:#aaa;">
      <input type="checkbox" ${META_AI[k] ? 'checked' : ''} onchange="META_AI['${k}']=this.checked;saveMetaAIFlags();"> ${label}
    </label>`;
  const ckCount = Object.keys(CARD_KNOWLEDGE).length;
  const afActive = autoFeatureReport().filter(r => Math.abs(r.w) > 1e-4).length;
  const omInfo = OPP_MODEL.blockOpp >= 1
    ? `ブロック率${((OPP_MODEL.blockTaken / Math.max(1, OPP_MODEL.blockOpp)) * 100).toFixed(0)}% / 構え${OPP_MODEL.holdTurns.toFixed(0)}回 / 割込${OPP_MODEL.quickFromHold.toFixed(0)}回`
    : '観測データなし';
  const weakInfo = WEAKNESS_LAST
    ? WEAKNESS_LAST.report.filter(r => r.n > 0).slice(0, 3).map(r => `${r.label}${(r.rate * 100).toFixed(0)}%`).join(' / ')
    : '未分析';
  const html = `
    <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;">
      <div style="color:#888;">テーマ「AI自身で必要な観点や知識を見極める」— 学習した知識は検証ゲート通過後に実戦投入されます。</div>
      <div style="background:#0a1a2a;border:1px solid #224466;border-radius:4px;padding:8px;display:flex;flex-direction:column;gap:4px;">
        ${flag('adaptiveSearch', '⏱️ 案5: 思考時間の自己配分（明確なら即断・拮抗なら熟考）')}
        ${flag('cardKnowledge', `📚 案1: カード知識 (${ckCount}枚 / ${CARD_KNOWLEDGE_ACTIVE ? '<span style="color:#88ff88;">✅ゲート通過・実戦投入中</span>' : '<span style="color:#ffaa66;">⏸未検証</span>'})`)}
        ${flag('autoFeatures', `🧬 案2: 自動生成特徴量 (${AF_DEFS.length}候補 / 有効${afActive})`)}
        ${flag('situation', '🎭 案3: 局面の自己分類と観点切替')}
        ${flag('oppModel', `👤 案4: 相手モデリング (${omInfo})`)}
      </div>
      <div style="color:#aaa;">🔍 弱点分析: ${weakInfo}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button onclick="uiTrainCardKnowledge()" style="padding:6px 10px;background:#1a2a3a;border:1px solid #4477aa;color:#aaddff;border-radius:4px;cursor:pointer;">📚 カード知識学習(2000戦)</button>
        <button onclick="uiRunKnowledgeGate()" style="padding:6px 10px;background:#1a3a2a;border:1px solid #44aa77;color:#aaffdd;border-radius:4px;cursor:pointer;">✅ 知識検証ゲート(400戦)</button>
        <button onclick="uiRunWeakness()" style="padding:6px 10px;background:#3a2a1a;border:1px solid #aa7744;color:#ffddaa;border-radius:4px;cursor:pointer;">🔍 弱点分析(300戦)</button>
        <button onclick="uiAfReport()" style="padding:6px 10px;background:#2a1a3a;border:1px solid #7744aa;color:#ddaaff;border-radius:4px;cursor:pointer;">🧬 特徴量レポート</button>
        <button onclick="uiAutoImprove()" style="padding:6px 10px;background:#3a1a2a;border:1px solid #aa4477;color:#ffaadd;border-radius:4px;cursor:pointer;font-weight:bold;">🚀 自律強化1サイクル</button>
        <button onclick="closeModal();showCardDossierPanel()" style="padding:6px 10px;background:#1a3a3a;border:1px solid #44aaaa;color:#aaffff;border-radius:4px;cursor:pointer;">📇 カード百科</button>
        <button onclick="uiOnboardNewCards()" style="padding:6px 10px;background:#3a3a1a;border:1px solid #aaaa44;color:#ffffaa;border-radius:4px;cursor:pointer;">🚼 新カード自習</button>
      </div>
      <div id="meta-ai-status" style="color:#88cc88;min-height:18px;">待機中</div>
      <div style="color:#666;font-size:10px;">対象色: ${AI_CURRENT_COLOR || 'デフォルト'} | 探索メタ判断: 早期終了${META_SEARCH_LAST.earlyStops}回 / 延長${META_SEARCH_LAST.extends}回</div>
    </div>`;
  showModal('🤖 AI自律強化（メタAI）', html);
}

async function uiTrainCardKnowledge() {
  _metaStatus('📚 カード知識を学習中...');
  const sum = await trainCardKnowledge(2000, (done, total) => _metaStatus(`📚 カード知識を学習中... ${done}/${total}戦`));
  const top = sum.slice(0, 5).map(r => `${(CARD_DB[r.cid] || {}).name || r.cid}(n=${r.n}, 文脈${r.ctxN})`).join(' / ');
  _metaStatus(`📚 完了: ${sum.length}枚の知識を獲得。上位: ${top} — 次は「✅ 知識検証ゲート」で実戦投入判定`);
}

async function uiRunKnowledgeGate() {
  if (Object.keys(CARD_KNOWLEDGE).length === 0) { _metaStatus('❌ 知識がありません。先に「📚 カード知識学習」を実行してください'); return; }
  _metaStatus('✅ 知識あり vs なし のA/B検証中...');
  const r = await runKnowledgeGate(400, (done, total) => _metaStatus(`✅ 検証中... ${done}/${total}戦`));
  _metaStatus(r.adopted
    ? `✅ ゲート通過: 知識ありの勝率${(r.winRate * 100).toFixed(1)}% ≥ 基準${(r.need * 100).toFixed(1)}% → 実戦投入を有効化`
    : `❌ 見送り: 知識ありの勝率${(r.winRate * 100).toFixed(1)}% < 基準${(r.need * 100).toFixed(1)}% → 無効のまま（学習を追加してから再検証）`);
}

async function uiRunWeakness() {
  _metaStatus('🔍 弱点分析中...');
  const w = await runWeaknessDiscovery(300, (done, total) => _metaStatus(`🔍 弱点分析中... ${done}/${total}戦`));
  const lines = w.report.filter(r => r.n > 0).slice(0, 4)
    .map(r => `${r.label} ${(r.rate * 100).toFixed(0)}%（${r.hint}）`).join(' ／ ');
  _metaStatus(`🔍 完了(${w.losses}敗を分析): ${lines || '顕著な弱点なし'}`);
}

function uiAfReport() {
  const rep = autoFeatureReport();
  const rows = rep.map(r => {
    const on = Math.abs(r.w) > 1e-4;
    return `<tr><td style="padding:2px 8px;color:${on ? '#aaffaa' : '#555'};">${r.key}</td><td style="padding:2px 8px;text-align:right;color:${on ? '#fff' : '#555'};">${r.w.toFixed(3)}</td></tr>`;
  }).join('');
  const html = `
    <div style="font-size:12px;display:flex;flex-direction:column;gap:8px;">
      <div style="color:#888;">重み0の特徴は「AIが不要と見極めた観点」。学習(🧠AI学習/🚀自律強化)でGAが自動調整します。</div>
      <div style="max-height:300px;overflow-y:auto;background:#0a0a1a;border:1px solid #333;border-radius:4px;">
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
      <div style="display:flex;gap:8px;">
        <button onclick="const r=pruneAutoFeatures(0.05);this.nextElementSibling.textContent='✂️ 刈込: '+r.pruned+'個をゼロ化 / '+r.kept+'個維持';" style="padding:6px 10px;background:#3a1a1a;border:1px solid #aa4444;color:#ffaaaa;border-radius:4px;cursor:pointer;">✂️ 微小特徴を刈り込む(|w|&lt;0.05)</button>
        <span style="color:#88cc88;"></span>
      </div>
    </div>`;
  showModal('🧬 自動生成特徴量レポート', html);
}

async function uiAutoImprove() {
  _metaStatus('🚀 自律強化サイクル開始...');
  const r = await runAutonomousImproveCycle({}, msg => _metaStatus('🚀 ' + msg));
  _metaStatus('🚀 ' + r.steps.join(' → '));
}
