// ============================================================
// AI TACTICS — 「読みの深さ」: 戦闘の正確な読み切りエンジン
//   案①: ブロック割当の全体最適化（攻撃ウェーブ全体を逐次DFSで最適応答）
//   案③: 返し即死チェック＋次ターン確定リーサル認識
//   案④: 終盤の攻撃読み切り（攻撃部分集合 × 守備側最適応答のminimax）
//   案⑥: CXアーク計画（チャージのタイミング先読み）
//
// このゲームの戦闘は1攻撃ずつ逐次解決され、ブロッカーはタップされない
// （生き残れば同じウェーブ内で再ブロック可能・ダメージは蓄積）。
// そのため「割当」ではなく「逐次応答の最適方策」をDFSで読み切る。
// 盤面は各5体以下なので全列挙が現実的（分岐≤6^5、ノード上限でガード）。
//
// 全関数は実盤面 G を読むだけで書き換えない。engine/ai からは
// typeof ガード付きで呼ばれるため、このファイル無しでも動作は変わらない。
// ============================================================

const TAC_MAX_NODES = 60000;   // DFS展開ノード数の安全上限
let TAC_LAST = { blockPlans: 0, crackbackSaves: 0, exactLethals: 0, endgameSolves: 0 };

// ── 戦闘算術（実ゲームの resolveSingleCombat と同じ一次近似）──────

function _tacVal(player, inst) {
  // トレード評価用のカード価値（パワー・残タフネス・コスト・キーワード）
  const c = CARD_DB[inst.cardId] || {};
  const pow = getEffectivePower(player, inst);
  const tou = getEffectiveToughness(player, inst) - (inst.damage || 0);
  let v = pow * 2 + tou + totalCost(c.cost || {});
  if (c.flying) v += 2;
  if (c.lifelink || c.deathtouch || c.vigilance) v += 1.5;
  if (c.etb || c.onBlock || c.onOpponentAttack || c.endTurnEffect || c.arestiaPassive) v += 1.5;
  return v;
}

function _tacAtkInvuln(atkP, atkCard) {
  return !!(atkCard.noDmgWhileAttacking ||
    G.players[atkP].field.some(c => (CARD_DB[c.cardId] || {}).alliesInvulnWhileAttacking));
}

// 1回の攻撃 vs ブロックの結果（damage は蓄積値を考慮）
function _tacPair(atkP, atk, atkDmg, defP, blk, blkDmg) {
  const ac = CARD_DB[atk.cardId] || {}, bc = CARD_DB[blk.cardId] || {};
  const apow = getEffectivePower(atkP, atk), bpow = getEffectivePower(defP, blk);
  const atou = getEffectiveToughness(atkP, atk), btou = getEffectiveToughness(defP, blk);
  const invuln = _tacAtkInvuln(atkP, ac);
  const blkDies = (btou - blkDmg) <= apow || (ac.deathtouch && apow > 0);
  const atkDies = !invuln && ((atou - atkDmg) <= bpow || (bc.deathtouch && bpow > 0));
  const through = ac.trample ? Math.max(0, apow - Math.max(0, btou - blkDmg)) : 0;
  return { blkDies, atkDies, through, dmgToBlk: apow, dmgToAtk: invuln ? 0 : bpow };
}

// ── 守備側の最適応答DFS（案①の核）──────────────────────────────
// attackers: [{inst, pow}]（解決順）/ blockers: 守備側の使用可能クリーチャー
// 返り値: { score, lifeLoss, choices: [blockerInst|null per attacker] }
// score は守備側視点（大きいほど良い）。生存を最優先し、ライフ損失は
// 残ライフが少ないほど重く罰する。
function _tacDefendDFS(atkP, attackers, defP, blockers, eligMatrix, defLife) {
  let nodes = 0;
  const nA = attackers.length;
  // ブロッカーの可変状態（ダメージ蓄積・死亡）
  const bState = blockers.map(b => ({ inst: b, dmg: b.damage || 0, alive: true }));
  const aState = attackers.map(a => ({ inst: a, dmg: a.damage || 0, alive: true }));

  function leafScore(acc) {
    let s = acc.kills - acc.losses;
    if (acc.lifeLoss >= defLife) return -1e9 - acc.lifeLoss; // 死亡は最悪（超過分でタイブレーク）
    s -= acc.lifeLoss * (2 + Math.max(0, 14 - defLife) * 0.4);
    return s;
  }

  function rec(i, acc) {
    if (++nodes > TAC_MAX_NODES) return { score: leafScore(acc), choices: [] };
    if (i >= nA) return { score: leafScore(acc), lifeLoss: acc.lifeLoss, choices: [] };
    const a = aState[i];
    if (!a.alive) { const r = rec(i + 1, acc); return { score: r.score, lifeLoss: r.lifeLoss, choices: [null, ...r.choices] }; }
    const atkPow = getEffectivePower(atkP, a.inst);

    // 選択肢1: 通す
    let best = null;
    {
      const r = rec(i + 1, { kills: acc.kills, losses: acc.losses, lifeLoss: acc.lifeLoss + atkPow });
      best = { score: r.score, lifeLoss: r.lifeLoss, choices: [null, ...r.choices] };
    }
    // 選択肢2: 生存中の適格ブロッカーで受ける
    for (let j = 0; j < bState.length; j++) {
      const b = bState[j];
      if (!b.alive || !eligMatrix[i][j]) continue;
      const r0 = _tacPair(atkP, a.inst, a.dmg, defP, b.inst, b.dmg);
      // 状態を進めて再帰 → 巻き戻し
      const savedB = { dmg: b.dmg, alive: b.alive }, savedA = { dmg: a.dmg, alive: a.alive };
      b.dmg += r0.dmgToBlk; if (r0.blkDies) b.alive = false;
      a.dmg += r0.dmgToAtk; if (r0.atkDies) a.alive = false;
      const acc2 = {
        kills: acc.kills + (r0.atkDies ? _tacVal(atkP, a.inst) * 0.9 : 0),
        losses: acc.losses + (r0.blkDies ? _tacVal(defP, b.inst) : 0),
        lifeLoss: acc.lifeLoss + r0.through,
      };
      const r = rec(i + 1, acc2);
      b.dmg = savedB.dmg; b.alive = savedB.alive;
      a.dmg = savedA.dmg; a.alive = savedA.alive;
      if (r.score > best.score) best = { score: r.score, lifeLoss: r.lifeLoss, choices: [b.inst, ...r.choices] };
    }
    return best;
  }
  const res = rec(0, { kills: 0, losses: 0, lifeLoss: 0 });
  res.nodes = nodes;
  return res;
}

// 守備側の使用可能ブロッカー一覧と適格行列を作る
function _tacBlockersFor(defP, attackerInsts, opts = {}) {
  const excluded = new Set();
  if (G.kakutouTargets) Object.values(G.kakutouTargets).forEach(id => excluded.add(id));
  if (G.directlyAttackedCreatures) G.directlyAttackedCreatures.forEach(id => excluded.add(id));
  if (opts.excludeInstId != null) excluded.add(opts.excludeInstId);
  const blockers = G.players[defP].field.filter(b => {
    if (excluded.has(b.instanceId)) return false;
    const bc = CARD_DB[b.cardId] || {};
    const untapOk = opts.assumeUntapped ? true
      : (!b.tapped || (bc.ocBlockWhileTapped && isOCActive(defP)));
    return untapOk;
  });
  const elig = attackerInsts.map(a => blockers.map(b => canFlyBlock(a, b)));
  return { blockers, elig };
}

// ── 案①: 現在の攻撃＋残キューに対する全体最適ブロック ─────────────
// 返り値: ブロッカーinst / null（意図的に通す）/ undefined（適用不可→従来ロジックへ）
function tacticalBlockChoice(atkPlayer, atkInstId, excludeInstId) {
  try {
    if (typeof G === 'undefined' || !G) return undefined;
    const defP = 1 - atkPlayer;
    const atkInst = G.players[atkPlayer].field.find(c => c.instanceId === atkInstId);
    if (!atkInst) return undefined;
    // ウェーブ = 現在の攻撃 + 残りの攻撃キュー（受け直しの度に残りで再計画）
    const queue = (G._playerAttackQueue || [])
      .map(id => G.players[atkPlayer].field.find(c => c.instanceId === id))
      .filter(Boolean);
    const wave = [atkInst, ...queue];
    const { blockers, elig } = _tacBlockersFor(defP, wave, { excludeInstId });
    if (blockers.length === 0) return null;
    const res = _tacDefendDFS(atkPlayer, wave, defP, blockers, elig, G.players[defP].life);
    TAC_LAST.blockPlans++;
    const choice = res.choices[0] || null;
    if (typeof aiThink === 'function') {
      const waveN = wave.length;
      if (choice) {
        aiThink(`読み切りブロック: ${waveN}体の総攻撃を全パターン計算 → 「${CARD_DB[choice.cardId].name}」で受けるのが全体最善`);
      } else if (waveN > 1) {
        aiThink(`読み切りブロック: この攻撃は通し、後続に備えるのが全体最善（総攻撃${waveN}体を計算）`);
      } else {
        aiThink('読み切りブロック: ブロックするだけ損 — 通すのが最善');
      }
    }
    return choice;
  } catch (e) {
    return undefined; // 失敗時は従来の貪欲ロジックにフォールバック
  }
}

// ── 案④: 攻撃側の読み切り（部分集合 × 守備側最適応答）─────────────
// candidates: 攻撃可能なクリーチャー（実G上のinst）
// 返り値: { set:Set<instanceId>, guaranteedLethal, worstEval, dmg } | null
function tacticalBestAttackPlan(atkP, candidates, forcedIds) {
  try {
    if (typeof G === 'undefined' || !G || candidates.length === 0) return null;
    const defP = 1 - atkP;
    const defLife = G.players[defP].life;
    const myLife = G.players[atkP].life;
    // 攻撃順は火力降順（守備側に最も圧をかける代表順）
    const sorted = [...candidates].sort((a, b) => getEffectivePower(atkP, b) - getEffectivePower(atkP, a));
    const n = Math.min(sorted.length, 5);
    // 守備側の「攻撃時2ダメージ」持ち（宣言ごとに誘発）
    const pings = G.players[defP].field.filter(c => (CARD_DB[c.cardId] || {}).onOpponentAttack === 'damage2opponent').length;
    const forced = forcedIds || new Set();

    let best = null;
    for (let mask = 1; mask < (1 << n); mask++) {
      const subset = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(sorted[i]);
      if ([...forced].some(id => !subset.some(c => c.instanceId === id))) continue; // 強制攻撃は必ず含む

      // 攻撃時ping: 守備側は最適に割り振って柔らかい攻撃者から落とす（宣言数×ping数×2点）
      let pingBudget = pings * 2 * subset.length;
      const wave = [];
      let pingLossVal = 0;
      for (const c of [...subset].sort((a, b) =>
        (getEffectiveToughness(atkP, a) - a.damage) - (getEffectiveToughness(atkP, b) - b.damage))) {
        const remTou = getEffectiveToughness(atkP, c) - (c.damage || 0);
        if (pingBudget >= remTou && pings > 0) { pingBudget -= remTou; pingLossVal += _tacVal(atkP, c); }
        else wave.push(c);
      }
      wave.sort((a, b) => getEffectivePower(atkP, b) - getEffectivePower(atkP, a));

      let dmg = 0, kills = 0, losses = pingLossVal, choicesLen = 0;
      if (wave.length > 0) {
        const { blockers, elig } = _tacBlockersFor(defP, wave, { assumeUntapped: false });
        const def = _tacDefendDFS(atkP, wave, defP, blockers, elig, defLife);
        dmg = def.lifeLoss || 0;
        choicesLen = def.choices.length;
        // 守備側最適応答での我々の損得を再集計
        const bSim = blockers.map(b => ({ dmg: b.damage || 0, alive: true }));
        wave.forEach((a, i) => {
          const blk = def.choices[i];
          if (!blk) return;
          const j = blockers.indexOf(blk);
          if (j < 0 || !bSim[j].alive) return;
          const r = _tacPair(atkP, a, a.damage || 0, defP, blk, bSim[j].dmg);
          bSim[j].dmg += r.dmgToBlk; if (r.blkDies) { bSim[j].alive = false; kills += _tacVal(defP, blk); }
          if (r.atkDies) losses += _tacVal(atkP, a);
        });
      }
      const lethal = dmg >= defLife;
      let evalScore = kills - losses + dmg * (1.5 + Math.max(0, 10 - defLife) * 0.3);
      if (lethal) evalScore += 1e9;
      if (!best || evalScore > best.worstEval) {
        best = { set: new Set(subset.map(c => c.instanceId)), guaranteedLethal: lethal, worstEval: evalScore, dmg };
      }
    }
    // 「誰も攻撃しない」も候補（forced が無い場合のみ）
    if (forced.size === 0 && best && best.worstEval < 0) {
      best = { set: new Set(), guaranteedLethal: false, worstEval: 0, dmg: 0 };
    }
    return best;
  } catch (e) {
    return null;
  }
}

// ── 案③a: 返し即死チェック ───────────────────────────────────────
// 「planned の攻撃者で攻撃した後、相手の次ターンの総攻撃で自分は必ず死ぬか」
// 攻撃者はタップされたまま相手ターンを迎える（警戒持ちは残る）。
// 相手は現在の場全員（sickは回復・アンタップ）で攻撃してくる最悪ケースを仮定。
function tacticalCrackbackDeath(aiIdx, plannedAttackers) {
  try {
    if (typeof G === 'undefined' || !G) return false;
    const oppIdx = 1 - aiIdx;
    const oppAttackers = G.players[oppIdx].field.filter(c => {
      const cd = CARD_DB[c.cardId] || {};
      if (cd.selfCantAttack) return false;
      if (G.cantAttackPermanent && G.cantAttackPermanent.has(c.instanceId)) return false;
      return true;
    });
    if (oppAttackers.length === 0) return false;
    const attackedIds = new Set(plannedAttackers
      .filter(c => !(CARD_DB[c.cardId] || {}).vigilance)
      .map(c => c.instanceId));
    // 我々のブロッカー = 攻撃に出していない（または警戒）でアンタップの者
    const myBlockers = G.players[aiIdx].field.filter(b =>
      !attackedIds.has(b.instanceId) && !b.tapped);
    const wave = [...oppAttackers].sort((a, b) => getEffectivePower(oppIdx, b) - getEffectivePower(oppIdx, a));
    const elig = wave.map(a => myBlockers.map(b => canFlyBlock(a, b)));
    const res = _tacDefendDFS(oppIdx, wave, aiIdx, myBlockers, elig, G.players[aiIdx].life);
    return (res.lifeLoss || 0) >= G.players[aiIdx].life;
  } catch (e) {
    return false;
  }
}

// ── 案③b: 次ターン確定リーサル（盤面固定の近似）────────────────────
// 次の自ターン、全員アンタップ・sick回復で総攻撃した時、相手が最適ブロック
// しても致死打点が通るか。通るなら「今ターンは無理をしない」判断材料になる。
function tacticalNextTurnLockedLethal(aiIdx) {
  try {
    if (typeof G === 'undefined' || !G) return false;
    const oppIdx = 1 - aiIdx;
    const myAll = G.players[aiIdx].field.filter(c => {
      const cd = CARD_DB[c.cardId] || {};
      return !cd.selfCantAttack && !(G.cantAttackPermanent && G.cantAttackPermanent.has(c.instanceId));
    });
    if (myAll.length === 0) return false;
    const wave = [...myAll].sort((a, b) => getEffectivePower(aiIdx, b) - getEffectivePower(aiIdx, a));
    // 相手も次ターンには全員アンタップ（assumeUntapped）
    const { blockers, elig } = _tacBlockersFor(oppIdx, wave, { assumeUntapped: true });
    const res = _tacDefendDFS(aiIdx, wave, oppIdx, blockers, elig, G.players[oppIdx].life);
    return (res.lifeLoss || 0) >= G.players[oppIdx].life;
  } catch (e) {
    return false;
  }
}

// ── 攻撃決定の統合リファイン（ai.js aiAttack から呼ばれる）────────────
// candidates: 攻撃可能な全クリーチャー / picked: MCTS等が選んだ攻撃者
// 返り値: { attackers, notes }
function tacticalRefineAttack(candidates, picked, aiIdx, isLethalGuess) {
  const notes = [];
  let attackers = picked;
  try {
    if (typeof G === 'undefined' || !G) return { attackers, notes };
    const oppIdx = 1 - aiIdx;
    const forced = new Set(candidates.filter(c => c.mustAttack ||
      ((CARD_DB[c.cardId] || {}).kakutou && c.sick && c.entryTurn === G.turn)).map(c => c.instanceId));

    // ④+③: 正確なリーサル読み — 概算(isLethalGuess)に関わらず必ず確認
    const plan = tacticalBestAttackPlan(aiIdx, candidates, forced);
    if (plan && plan.guaranteedLethal) {
      TAC_LAST.exactLethals++;
      notes.push(`読み切り: 相手が最善ブロックしても${plan.dmg}点が通り確定リーサル — 総攻撃`);
      return { attackers: candidates.filter(c => plan.set.has(c.instanceId)), notes };
    }

    // ③b: 次ターン確定リーサルなら今は無理をしない（打点の押し付けで損しない）
    const locked = tacticalNextTurnLockedLethal(aiIdx);
    if (locked) {
      const safe = attackers.filter(c => {
        if (forced.has(c.instanceId)) return true;
        // ブロックされて死に得る攻撃者は温存（次ターンのリーサル要員）
        const { blockers, elig } = _tacBlockersFor(oppIdx, [c], {});
        return !blockers.some((b, j) => elig[0][j] &&
          _tacPair(aiIdx, c, c.damage || 0, oppIdx, b, b.damage || 0).atkDies);
      });
      if (safe.length < attackers.length) {
        notes.push('読み切り: 次ターンに確定リーサルあり — 討ち取られ得る攻撃は温存');
        attackers = safe;
      }
    }

    // ④: 終盤（どちらかライフ10以下 or 盤面合計5体以下）は読み切りの攻撃選択を採用
    const totalField = G.players[0].field.length + G.players[1].field.length;
    const endgame = G.players[0].life <= 10 || G.players[1].life <= 10 || totalField <= 5;
    if (endgame && plan && !locked) {
      const planSet = candidates.filter(c => plan.set.has(c.instanceId));
      if (plan.worstEval > 0 || forced.size > 0) {
        if (planSet.length !== attackers.length ||
            planSet.some(c => !attackers.includes(c))) {
          TAC_LAST.endgameSolves++;
          notes.push(`終盤読み切り: 相手の最善応答まで計算し攻撃${planSet.length}体を選択（最悪でも${plan.dmg}点）`);
        }
        attackers = planSet;
      } else if (forced.size === 0) {
        if (attackers.length > 0) notes.push('終盤読み切り: どの攻撃も最悪応答で損 — 全員防御に残す');
        attackers = [];
      }
    }

    // ③a: 返し即死の回避 — 任意参加の攻撃者を弱い順に下げて生存ラインへ
    if (attackers.length > 0 && tacticalCrackbackDeath(aiIdx, attackers)) {
      // 攻撃を全て取りやめても死ぬなら回避不能 → レース（そのまま殴る）
      if (!tacticalCrackbackDeath(aiIdx, [])) {
        const byVal = [...attackers].sort((a, b) => _tacVal(aiIdx, a) - _tacVal(aiIdx, b));
        for (const drop of byVal) {
          if (forced.has(drop.instanceId)) continue;
          attackers = attackers.filter(c => c !== drop);
          if (!tacticalCrackbackDeath(aiIdx, attackers)) break;
        }
        TAC_LAST.crackbackSaves++;
        notes.push('読み切り: このまま総攻撃すると返しで敗死 — ブロッカーを残して回避');
      } else {
        notes.push('読み切り: 守っても返しで敗死 — レース勝負で総攻撃続行');
      }
    }
  } catch (e) { /* 失敗時は picked のまま */ }
  return { attackers, notes };
}

// ── 案⑥: CXアーク計画 ───────────────────────────────────────────
// チャージ判断（ai.js の mctsPickOption）に足す事前ボーナス（勝率単位）。
// 「手札/場のC6/C8/OCペイオフ札」と「閾値到達のタイミング」の噛み合わせを評価。
function cxArcPrior(opt) {
  try {
    if (typeof G === 'undefined' || !G) return 0;
    const me = G.players[1];
    const cx = getCXValue(1);
    const payoffs = { 6: 0, 8: 0, 10: 0 };
    const scan = cid => {
      const c = CARD_DB[cid];
      if (!c || !c.keywords) return;
      if (c.keywords.includes('C6')) payoffs[6]++;
      if (c.keywords.includes('C8')) payoffs[8]++;
      if (c.keywords.includes('OC')) payoffs[10]++;
    };
    me.hand.forEach(scan);
    me.field.forEach(i => scan(i.cardId));
    const totalPayoff = payoffs[6] + payoffs[8] + payoffs[10];
    if (totalPayoff === 0) return opt.type === 'charge' ? -0.02 : 0; // ペイオフ無しなら手札温存を微優先

    if (opt.type === 'noCharge') return 0;
    let b = 0;
    // 閾値をまたぐ瞬間のチャージは大きく評価（今まさに能力解放）
    for (const th of [6, 8, 10]) {
      if (payoffs[th] > 0 && cx < th && cx + 1 >= th) b += 0.08 * Math.min(3, payoffs[th]);
    }
    // 閾値まであと2（次の自然成長+今回チャージで届く見込み）も少し評価
    for (const th of [6, 8, 10]) {
      if (payoffs[th] > 0 && cx + 1 < th && th - (cx + 1) <= Math.min(2, (me.landDeck || []).length)) b += 0.03;
    }
    // チャージするカード自体の損失: ペイオフ札や高コスト大物を埋めるのは損
    const cc = CARD_DB[opt.cardId];
    if (cc && cc.keywords && (cc.keywords.includes('C6') || cc.keywords.includes('C8') || cc.keywords.includes('OC'))) b -= 0.06;
    if (cc && cc.type === 'creature' && totalCost(cc.cost || {}) >= 4) b -= 0.05;
    return b;
  } catch (e) {
    return 0;
  }
}
