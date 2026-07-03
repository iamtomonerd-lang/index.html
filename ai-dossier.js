// ============================================================
// CARD DOSSIER — 「カード1枚ごとの知識」（カードカルテ）
//   案A: シナジー知識   — このカードの相棒は誰か（ペア相性行列）
//   案B: 対抗知識       — このカードの獲物/天敵は誰か（対カード行列）
//   案C: タイミング知識 — このカードの旬はいつか（ターン/OC別勝率）
//   案D: 対象選択知識   — どの対象選択方針が最も勝つか
//   案E: 新カード自習   — 追加カードをAIが自動で学習するパイプライン
//   案F: カード百科     — カルテの可視化（バランス調整資料を兼ねる）
//
// ai-meta.js のカード知識収集ループ（cardKnowledgeRecord/Finish、
// マナ事故フィルタ、検証ゲート、localStorage永続）に相乗りする。
// 実戦投入は CARD_KNOWLEDGE と同じゲート（ckUseFor）を共有し、
// 「知識あり vs なし」A/B検証に勝ち越すまで評価に寄与しない。
// ============================================================

const CARD_DOSSIER_LS = 'dcg_card_dossier';
let CARD_DOSSIER = {};        // {cardId: カルテ}
const DS_SCALE = 4.0;         // リフト → 評価スコア換算係数
const DS_MIN_CARD_N = 25;     // カード全体の最低サンプル数
const DS_MIN_N = 10;          // 各項目（相棒/天敵/ターン等）の最低サンプル数
const DS_SHRINK = 6;          // 全体勝率への縮約（少サンプルの過信防止）
const DS_TGT_POLICIES = ['killmax', 'maxpow', 'minhp'];

(function () {
  try {
    const s = localStorage.getItem(CARD_DOSSIER_LS);
    if (s) CARD_DOSSIER = JSON.parse(s) || {};
  } catch (e) {}
})();
function saveCardDossier() {
  try { localStorage.setItem(CARD_DOSSIER_LS, JSON.stringify(CARD_DOSSIER)); } catch (e) {}
}

// カルテの器: n/w=試合数/勝利数, syn=相棒, vs=対面, turn/oc=旬, tgt=対象方針
function _dossierOf(cid) {
  return CARD_DOSSIER[cid] || (CARD_DOSSIER[cid] = { n: 0, w: 0, syn: {}, vs: {}, turn: {}, oc: {}, tgt: {} });
}
function _dsCell(map, key) {
  return map[key] || (map[key] = { n: 0, w: 0 });
}
// 項目の勝率リフト（全体勝率basisからの差、縮約付き）。サンプル不足は0。
function _dsLift(cell, base) {
  if (!cell || cell.n < DS_MIN_N) return 0;
  const rate = (cell.w + base * DS_SHRINK) / (cell.n + DS_SHRINK);
  return rate - base;
}
function dossierTurnBucket(turn) {
  // s.turn は各プレイヤー手番ごとに+1（半ラウンド単位）
  return turn <= 4 ? 't1' : turn <= 8 ? 't2' : turn <= 12 ? 't3' : turn <= 18 ? 't4' : 't5';
}
const DS_TURN_LABEL = { t1: '序盤(〜T4)', t2: '前中盤(〜T8)', t3: '中盤(〜T12)', t4: '終盤(〜T18)', t5: '超終盤(T19〜)' };

// ── 収集（ai-meta.js の知識収集ループから呼ばれる）─────────────
// プレイ時: カード・ターン・OC・相手の場・対象方針を記録
function dossierRecord(sim, ap, cid) {
  if (!CARD_KNOWLEDGE_COLLECT) return;
  const card = CARD_DB[cid];
  if (!card || card.type === 'land') return;
  if (!sim._dsLog) sim._dsLog = [[], []];
  const s = sim.state, opp = s.players[1 - ap];
  sim._dsLog[ap].push({
    cid,
    turnB: dossierTurnBucket(s.turn),
    oc: sim.simIsOC(s.players[ap]) ? 1 : 0,
    opp: [...new Set(opp.field.map(c => c.cardId))],
    pol: (card.type === 'spell' && sim._tgtPolicy) ? sim._tgtPolicy : null,
  });
}

// 試合終了時: 勝敗をカルテの各項目へ反映
// （cardKnowledgeFinish のマナ事故フィルタ通過後にのみ呼ばれる）
function dossierFinish(sim, winner) {
  if (!sim._dsLog) return;
  for (let p = 0; p < 2; p++) {
    const won = p === winner ? 1 : 0;
    const recs = sim._dsLog[p];
    if (!recs.length) continue;
    // 案A: シナジー — 同じ試合でプレイしたカードの全ペア（試合単位で1回）
    const played = [...new Set(recs.map(r => r.cid))];
    for (const cid of played) {
      const d = _dossierOf(cid);
      d.n++; d.w += won;
      for (const other of played) {
        if (other === cid) continue;
        const cell = _dsCell(d.syn, other);
        cell.n++; cell.w += won;
      }
    }
    // 案B/C/D: 対面・旬・対象方針（試合内の同キー重複は1回に丸める）
    const seen = new Set();
    for (const r of recs) {
      const d = _dossierOf(r.cid);
      for (const oc of r.opp) {
        const k = 'v' + r.cid + '|' + oc;
        if (!seen.has(k)) { seen.add(k); const c = _dsCell(d.vs, oc); c.n++; c.w += won; }
      }
      const tk = 't' + r.cid + '|' + r.turnB;
      if (!seen.has(tk)) { seen.add(tk); const c = _dsCell(d.turn, r.turnB); c.n++; c.w += won; }
      const ok = 'o' + r.cid + '|' + r.oc;
      if (!seen.has(ok)) { seen.add(ok); const c = _dsCell(d.oc, 'o' + r.oc); c.n++; c.w += won; }
      if (r.pol) {
        const pk = 'p' + r.cid + '|' + r.pol;
        if (!seen.has(pk)) { seen.add(pk); const c = _dsCell(d.tgt, r.pol); c.n++; c.w += won; }
      }
    }
  }
}

// ── 利用（sim.js simPlayCards から呼ばれる事前分布）─────────────
// カルテに基づく文脈ボーナス: 旬(案C) + 相棒(案A) + 対面(案B)。
// CARD_KNOWLEDGE と同じ検証ゲート（ckUseFor）を共有する。
function dossierBonus(sim, ap, cid) {
  if (typeof ckUseFor !== 'function' || !ckUseFor(ap)) return 0;
  const d = CARD_DOSSIER[cid];
  if (!d || d.n < DS_MIN_CARD_N) return 0;
  const base = d.w / d.n;
  const s = sim.state, me = s.players[ap], opp = s.players[1 - ap];
  let bonus = 0;
  // 案C: 旬 — 今のターン帯/OC状態でのリフト
  bonus += _dsLift(d.turn[dossierTurnBucket(s.turn)], base);
  bonus += _dsLift(d.oc['o' + (sim.simIsOC(me) ? 1 : 0)], base);
  // 案A: 相棒 — この試合で既にプレイした自カードとの平均リフト
  if (sim.playedCards && sim.playedCards[ap]) {
    let sum = 0, n = 0;
    for (const [pcid] of sim.playedCards[ap]) {
      if (pcid === cid) continue;
      const c = CARD_DB[pcid];
      if (!c || c.type === 'land') continue;
      const l = _dsLift(d.syn[pcid], base);
      if (l !== 0) { sum += l; n++; }
    }
    if (n) bonus += sum / n;
  }
  // 案B: 対面 — 相手の場のカードへの平均リフト（獲物なら＋、苦手なら−）
  {
    let sum = 0, n = 0;
    for (const c of opp.field) {
      const l = _dsLift(d.vs[c.cardId], base);
      if (l !== 0) { sum += l; n++; }
    }
    if (n) bonus += sum / n;
  }
  // 案B×相手モデリング: 実対戦で、見えた相手カードへの対抗札は
  // 今対象がいないなら温存気味にする（次の脅威に取っておく）
  if (sim.oppModel && opp.field.length === 0 && sim.oppModel.seenPlays) {
    for (const seenCid of Object.keys(sim.oppModel.seenPlays)) {
      if (_dsLift(d.vs[seenCid], base) > 0.05) { bonus -= 0.15; break; }
    }
  }
  return DS_SCALE * Math.max(-0.6, Math.min(0.6, bonus));
}

// ── 案D: 対象選択方針 ────────────────────────────────────────
function dossierRandomPolicy() {
  return DS_TGT_POLICIES[Math.floor(Math.random() * DS_TGT_POLICIES.length)];
}

// sim.js simPickDamageTarget から呼ばれる（学習中の方針試行）
function dossierPickTarget(sim, field, damage, policy) {
  if (!field.length) return null;
  if (policy === 'maxpow') return field.reduce((a, b) => sim.pow(b) > sim.pow(a) ? b : a);
  if (policy === 'minhp') return field.reduce((a, b) => sim.hp(b) < sim.hp(a) ? b : a);
  // killmax（既定と同じ）: 倒せる中で最大パワー、いなければ最小HP
  const killable = field.filter(c => sim.hp(c) <= damage);
  if (killable.length) return killable.reduce((a, b) => sim.pow(b) > sim.pow(a) ? b : a);
  return field.reduce((a, b) => sim.hp(b) < sim.hp(a) ? b : a);
}

// このカードの学習済み最良方針（サンプル不足なら既定の killmax）
function dossierBestPolicy(cid) {
  const d = CARD_DOSSIER[cid];
  if (!d) return 'killmax';
  let best = 'killmax', bestRate = -1;
  for (const pol of DS_TGT_POLICIES) {
    const c = d.tgt[pol];
    if (!c || c.n < DS_MIN_N) continue;
    const rate = c.w / c.n;
    if (rate > bestRate) { bestRate = rate; best = pol; }
  }
  return best;
}

// ── 案A: シナジー誘導デッキ進化（sim.js mutateDeckCounts から）──
// 現デッキとの平均シナジーが低いカードを抜き、高いカードを足す。
// データ不足時や確率1/2でランダム進化（探索の多様性を維持）。
function dossierGuidedDeckMutation(current) {
  if (Math.random() < 0.5) return null;
  const ids = AI_CARD_POOL.filter(id => CARD_DOSSIER[id] && CARD_DOSSIER[id].n >= DS_MIN_CARD_N);
  if (ids.length < 3) return null;
  const synWithDeck = (cid) => {
    const d = CARD_DOSSIER[cid];
    if (!d || !d.n) return 0;
    const base = d.w / d.n;
    let sum = 0, n = 0;
    for (const other of Object.keys(current)) {
      if (other === cid || !(current[other] > 0)) continue;
      const l = _dsLift(d.syn[other], base);
      if (l !== 0) { sum += l; n++; }
    }
    return n ? sum / n : 0;
  };
  const scored = ids.map(cid => ({ cid, s: synWithDeck(cid) })).sort((a, b) => a.s - b.s);
  const worst = scored.find(x => (current[x.cid] || 0) > 0);
  const best = [...scored].reverse().find(x => (current[x.cid] || 0) < 4 && x.cid !== (worst && worst.cid));
  if (!worst || !best || best.s - worst.s < 0.02) return null;
  const m = { ...current };
  m[worst.cid]--; m[best.cid] = (m[best.cid] || 0) + 1;
  return m;
}

// ============================================================
// 案E: 新カード自習パイプライン
//   検出 → インパクトA/B → カルテ収集 → card_重みの集中調整。
//   採用判定は各段階とも「現行に勝ち越した場合のみ」。
// ============================================================

// カルテが空のプレイ可能カードを列挙（＝AIがまだ知らないカード）
function dossierDetectNewCards() {
  return Object.keys(CARD_DB).filter(id => {
    const c = CARD_DB[id];
    return c && c.type !== 'land' && c.cost &&
      !(CARD_DOSSIER[id] && CARD_DOSSIER[id].n > 0);
  });
}

// 現在色デッキに cardId を4枚差しした40枚構成を作る
function _dossierDeckWith(cardId) {
  const { main } = _metaColorDecks();
  const counts = main ? { ...main } : (() => { const d = {}; AI_CARD_POOL.forEach(c => { d[c] = 4; }); return d; })();
  if ((counts[cardId] || 0) >= 4) return counts;
  let need = 4 - (counts[cardId] || 0);
  for (const k of Object.keys(counts)) {
    if (k === cardId) continue;
    while (counts[k] > 0 && need > 0) { counts[k]--; need--; }
    if (need === 0) break;
  }
  counts[cardId] = 4;
  return counts;
}
// counts から cardId を抜き、他カードへ振り直して40枚を維持する
function _dossierDeckWithout(counts, cardId) {
  const m = { ...counts };
  let give = m[cardId] || 0;
  m[cardId] = 0;
  for (const k of Object.keys(m)) {
    if (k === cardId) continue;
    while (give > 0 && m[k] < 4) { m[k]++; give--; }
    if (give === 0) break;
  }
  // 全カードが4枚上限で配れない場合は上限を無視して先頭に積む（シミュ専用）
  if (give > 0) {
    const first = Object.keys(m).find(k => k !== cardId);
    if (first) m[first] += give;
  }
  return m;
}

// 1枚のカードをAIが自習する: (a)インパクト → (b)カルテ収集 → (c)card_重み調整
async function onboardCard(cardId, opts, onProgress) {
  const o = Object.assign({ impactN: 60, collectN: 400, weightN: 40 }, opts || {});
  const name = (CARD_DB[cardId] || {}).name || cardId;
  const res = { cardId, name };
  const { land } = _metaColorDecks();
  const deckWith = _dossierDeckWith(cardId);
  const deckWithout = _dossierDeckWithout(deckWith, cardId);

  // (a) インパクトA/B: あり vs なし（先後を入替えて公平に）
  if (onProgress) onProgress(`${name}: インパクト測定中...`);
  let iw = 0, ig = 0;
  for (let i = 0; i < o.impactN; i++) {
    try {
      const withAsP0 = (i % 2 === 0);
      const g = withAsP0
        ? new SimGame(AI_WEIGHTS, AI_WEIGHTS, deckWith, deckWithout, land, land)
        : new SimGame(AI_WEIGHTS, AI_WEIGHTS, deckWithout, deckWith, land, land);
      const r = g.run();
      ig++;
      if ((withAsP0 && r.winner === 0) || (!withAsP0 && r.winner === 1)) iw++;
    } catch (e) {}
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 0));
  }
  res.impact = ig ? iw / ig : 0.5;

  // (b) カルテ収集: 4枚差しデッキのミラーで文脈・相棒・対面・旬・対象方針を学習
  if (onProgress) onProgress(`${name}: カルテ収集中...`);
  CARD_KNOWLEDGE_COLLECT = true;
  try {
    for (let i = 0; i < o.collectN; i++) {
      try {
        const g = new SimGame(AI_WEIGHTS, AI_WEIGHTS, deckWith, deckWith, land, land);
        g._tgtPolicy = dossierRandomPolicy();
        g.run();
      } catch (e) {}
      if (i % 25 === 24) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    CARD_KNOWLEDGE_COLLECT = false;
  }
  saveCardKnowledge();
  saveCardDossier();
  res.dossierN = (CARD_DOSSIER[cardId] || {}).n || 0;

  // (c) card_重みの集中調整: 候補値のうち現行に有意に勝つものだけ採用
  if (onProgress) onProgress(`${name}: card_重み調整中...`);
  if (!(('card_' + cardId) in AI_WEIGHTS_DEFAULT)) AI_WEIGHTS_DEFAULT['card_' + cardId] = 0;
  const cur = AI_WEIGHTS['card_' + cardId] || 0;
  let bestW = cur, bestWr = 0.5;
  for (const cand of [-0.3, -0.1, 0.1, 0.3]) {
    if (cand === cur) continue;
    const wTry = { ...AI_WEIGHTS, ['card_' + cardId]: cand };
    let wr = 0;
    try { wr = runTrainingBatch(wTry, AI_WEIGHTS, o.weightN, deckWith, deckWith, land, land); } catch (e) {}
    if (wr > bestWr + 0.05) { bestWr = wr; bestW = cand; }
    await new Promise(r => setTimeout(r, 0));
  }
  if (bestW !== cur) {
    AI_WEIGHTS['card_' + cardId] = bestW;
    if (AI_CURRENT_COLOR) saveAIColorWeights(AI_CURRENT_COLOR);
  }
  res.cardWeight = bestW;
  res.cardWeightWr = bestWr;
  return res;
}

// 未知カードをまとめて自習（1回の実行で最大 maxCards 枚）
async function onboardNewCards(onProgress, maxCards) {
  const targets = dossierDetectNewCards().slice(0, maxCards || 6);
  const reports = [];
  for (const cid of targets) {
    reports.push(await onboardCard(cid, {}, onProgress));
  }
  return reports;
}

// ============================================================
// 案F: カード百科（カルテUI）
// ============================================================
function _dsPct(x) { return (x * 100).toFixed(1) + '%'; }

function _dossierDetailHtml(cid) {
  const d = CARD_DOSSIER[cid];
  const card = CARD_DB[cid] || {};
  if (!d || !d.n) return `<div style="color:#888;">${card.name || cid}: カルテなし（未学習）</div>`;
  const base = d.w / d.n;
  const nameOf = id => (CARD_DB[id] || {}).name || id;
  const topOf = (map, sign) => Object.entries(map)
    .map(([k, c]) => ({ k, n: c.n, lift: _dsLift(c, base) }))
    .filter(x => x.n >= DS_MIN_N && (sign > 0 ? x.lift > 0 : x.lift < 0))
    .sort((a, b) => sign > 0 ? b.lift - a.lift : a.lift - b.lift)
    .slice(0, 3);
  const fmtList = (items, name) => items.length
    ? items.map(x => `${name(x.k)} (${x.lift > 0 ? '+' : ''}${_dsPct(x.lift)}, n=${x.n})`).join(' / ')
    : '—';
  const turns = ['t1', 't2', 't3', 't4', 't5']
    .map(t => ({ t, c: d.turn[t] }))
    .filter(x => x.c && x.c.n >= DS_MIN_N)
    .map(x => `${DS_TURN_LABEL[x.t]}: ${_dsPct((x.c.w + base * DS_SHRINK) / (x.c.n + DS_SHRINK))}`)
    .join(' / ') || '—';
  const pols = DS_TGT_POLICIES
    .map(p => ({ p, c: d.tgt[p] }))
    .filter(x => x.c && x.c.n >= DS_MIN_N)
    .map(x => `${x.p}: ${_dsPct(x.c.w / x.c.n)}`)
    .join(' / ');
  const row = (label, val) => `<tr><td style="padding:3px 8px;color:#888;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:3px 8px;color:#ccc;">${val}</td></tr>`;
  return `
    <div style="color:#aaaaff;font-weight:bold;margin-bottom:4px;">${card.icon || ''} ${card.name || cid}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;background:#0a0a1a;border:1px solid #333;border-radius:4px;">
      ${row('サンプル', `${d.n}試合 / 基準勝率 ${_dsPct(base)}`)}
      ${row('🤝 相棒Top3', fmtList(topOf(d.syn, +1), nameOf))}
      ${row('⚔️ 獲物Top3', fmtList(topOf(d.vs, +1), nameOf))}
      ${row('💀 天敵Top3', fmtList(topOf(d.vs, -1), nameOf))}
      ${row('⏰ 旬（ターン帯別勝率）', turns)}
      ${row('🌗 OC別', ['o0', 'o1'].map(k => { const c = d.oc[k]; return c && c.n >= DS_MIN_N ? `${k === 'o1' ? 'OC後' : 'OC前'}: ${_dsPct(c.w / c.n)}` : null; }).filter(Boolean).join(' / ') || '—')}
      ${pols ? row('🎯 対象方針', `${pols}（最良: ${dossierBestPolicy(cid)}）`) : ''}
    </table>`;
}

function showCardDossierPanel(selectedCid) {
  const entries = Object.entries(CARD_DOSSIER)
    .filter(([, d]) => d.n > 0)
    .sort((a, b) => b[1].n - a[1].n);
  const cur = selectedCid || (entries[0] && entries[0][0]);
  const opts = entries.map(([cid, d]) =>
    `<option value="${cid}" ${cid === cur ? 'selected' : ''}>${(CARD_DB[cid] || {}).name || cid} (n=${d.n})</option>`).join('');
  const newCards = dossierDetectNewCards();
  const html = `
    <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;">
      <div style="color:#888;">自己対戦から学習した「カード1枚ごとの知識」。カードデザインのバランス資料としても使えます。</div>
      ${entries.length === 0
        ? '<div style="color:#ffaa66;">カルテがまだありません。🤖 AI自律強化 →「📚 カード知識学習」で収集されます。</div>'
        : `<select onchange="closeModal();showCardDossierPanel(this.value)" style="background:#1a1a2a;color:#aaffaa;border:1px solid #336633;padding:4px 6px;border-radius:4px;">${opts}</select>
           <div>${_dossierDetailHtml(cur)}</div>`}
      <div style="color:#666;font-size:10px;">未学習カード: ${newCards.length}枚${newCards.length ? '（🤖パネルの「🚼 新カード自習」で学習できます）' : ''}</div>
    </div>`;
  showModal('📇 カード百科（カルテ）', html);
}

async function uiOnboardNewCards() {
  const targets = dossierDetectNewCards();
  if (targets.length === 0) { _metaStatus('🚼 未学習のカードはありません（全カードにカルテあり）'); return; }
  _metaStatus(`🚼 新カード自習開始: ${targets.length}枚が未学習（今回最大6枚）`);
  const reports = await onboardNewCards(msg => _metaStatus('🚼 ' + msg), 6);
  const lines = reports.map(r =>
    `${r.name}: 影響${_dsPct(r.impact)} / カルテn=${r.dossierN} / card_重み=${r.cardWeight.toFixed(2)}`).join(' ／ ');
  _metaStatus(`🚼 自習完了(${reports.length}枚): ${lines}`);
  saveCardDossier();
}
