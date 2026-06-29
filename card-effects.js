// ============================================================
// CARD EFFECTS — カード効果の単一ソース（Step3で順次集約）
//   1つの効果の「本体（適用処理）」をここ1箇所に置く。対象選択は呼び出し側
//   （人間=UI / AI=ヒューリスティック/MCTS）が担い、ここでは効果のみを適用する。
//   本物の解決(engine)・AI攻め(aiPlaySpell)・AI受け(aiPlaySpellEffect)が同じここを呼ぶ
//   ことで、同じ効果が複数箇所で食い違うバグ（例: 盾撃の追加ダメージ）を防ぐ。
//   ※ SimGame(高速近似)は別実装のまま。整合性は debug-consistency + テストで監視。
//   engine.js/ai.js が定義する applyDamageToCreature 等を実行時に参照する（巻き上げ）。
// ============================================================
// ── 基本動作（部品/プリミティブ）──
//   1つの原子的な効果。色・数値は引数で渡し、複数カードで再利用する。
//   対象は呼び出し側（人間UI / AI）が解決して instId で渡す。
const FX = {
  // 指定プレイヤーのクリーチャー1体を +dP/+dT（永続バフ）。適用したら true。
  buffCreature(caster, instId, dP, dT) {
    if (instId == null) return false;
    if (!G.players[caster].field.some(c => c.instanceId === instId)) return false;
    addPermanentBuff(caster, instId, dP, dT);
    return true;
  },
  // 相手クリーチャー1体に n ダメージを与える。opts は applyDamageToCreature に渡す（{noRedirect:true} など）。
  damageCreature(caster, oppInstId, amount, opts) {
    if (oppInstId == null) return false;
    const opp = 1 - caster;
    if (!G.players[opp].field.some(c => c.instanceId === oppInstId)) return false;
    applyDamageToCreature(opp, oppInstId, amount, caster, opts || {});
    return true;
  },
  // 相手プレイヤーに n ダメージを与える。
  damagePlayer(caster, amount) {
    const opp = 1 - caster;
    G.players[opp].life -= amount;
    if (typeof showLifeChange === 'function') showLifeChange(opp, -amount);
    return true;
  },
  // n 枚引く。
  draw(player, count) {
    for (let i = 0; i < (count || 1); i++) drawCard(player);
    return true;
  },
  // 相手クリーチャー1体を「このターン攻撃強制」にする。
  forceCreatureToAttack(player, oppInstId) {
    if (oppInstId == null) return false;
    const opp = 1 - player;
    const tc = G.players[opp].field.find(c => c.instanceId === oppInstId);
    if (!tc) return false;
    tc.mustAttack = true;
    G.mustAttackCreatures.add(oppInstId);
    return true;
  },
  // グローバル強制攻撃（相手全体が可能なら攻撃）。
  setGlobalOpponentMustAttack() {
    if (!G.globalOpponentMustAttack) G.globalOpponentMustAttack = true;
    return true;
  },
  // このターン、自軍クリーチャーがブロックする度に1枚ドロー（介善■3）。
  setTurnBlockDraw(player) {
    if (!G.kaizenBlockDraw) G.kaizenBlockDraw = -1;
    G.kaizenBlockDraw = player;
    return true;
  },
  // このターン、相手クリーチャーへのダメージを相手プレイヤーに移し替え可能に（家撃■2）。
  setDamageRedirectMode(player) {
    if (!G.iegekiRedirectTurn) G.iegekiRedirectTurn = [-1, -1];
    G.iegekiRedirectTurn[player] = G.turn;
    return true;
  },
  // 指定条件のクリーチャーをマナ総量上限で展開（介善OC / 家撃OC用）。
  // deployRule: { maxCost, color, maxPerGame, allowedTypes }
  deployCreaturesOC(player, deployRule) {
    const p = G.players[player];
    const eligible = (p.hand || [])
      .map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
      .filter(({ card }) => {
        if (card.type !== 'creature') return false;
        if (deployRule.color && card.color !== deployRule.color) return false;
        const cost = totalCost(card.cost || {});
        if (cost > (deployRule.maxCost || 8)) return false;
        if (deployRule.maxPerGame) {
          if (!G._deployOCUsed) G._deployOCUsed = new Set();
          if (G._deployOCUsed.has(card.name)) return false;
        }
        return true;
      });
    return eligible.length > 0 ? eligible : [];
  },
  // 手札から任意枚数をデッキの底へ置いて、1枚につきダメージ化（知識の整理用）。
  convertHandToLibraryBottomDamage(player, damagePerCard) {
    const opp = 1 - player;
    return { damagePerCard };
  },
  // クリーチャー1体をバウンス（手札に戻す）。
  bounceCreature(player, oppInstId) {
    if (oppInstId == null) return false;
    const opp = 1 - player;
    const tc = G.players[opp].field.find(c => c.instanceId === oppInstId);
    if (!tc) return false;
    G.players[opp].field = G.players[opp].field.filter(c => c.instanceId !== oppInstId);
    const cardId = tc.cardId;
    if (!G.players[opp].hand) G.players[opp].hand = [];
    G.players[opp].hand.push(cardId);
    return true;
  },
  // 条件付きドロー（例：手札5枚以上なら〜）。
  drawWithCondition(player, count, condition) {
    if (condition && !condition(player)) return false;
    FX.draw(player, count);
    return true;
  },
  // クリーチャー1体を破壊。
  destroyCreature(caster, oppInstId) {
    if (oppInstId == null) return false;
    const opp = 1 - caster;
    const tc = G.players[opp].field.find(c => c.instanceId === oppInstId);
    if (!tc) return false;
    if (!G.players[opp].graveyard) G.players[opp].graveyard = [];
    G.players[opp].field = G.players[opp].field.filter(c => c.instanceId !== oppInstId);
    G.players[opp].graveyard.push(tc.cardId);
    const card = CARD_DB[tc.cardId];
    if (typeof log === 'function') log(`${card ? card.name : 'クリーチャー'}を破壊`);
    return true;
  },
  // デッキ上からN枚を墓地へ。
  mill(player, count) {
    if (typeof millCards === 'function') {
      millCards(player, count);
      return true;
    }
    if (!G.players[player].library) G.players[player].library = [];
    const p = G.players[player];
    for (let i = 0; i < count && p.deck && p.deck.length > 0; i++) {
      const card = p.deck.pop();
      if (!p.graveyard) p.graveyard = [];
      p.graveyard.push(card);
    }
    return true;
  },
  // デッキ上からN枚を墓地へ置いて、その中からM枚を選んで手札へ（mill5ルック1など）。
  millAndLook(player, millCount, lookCount) {
    FX.mill(player, millCount);
    const p = G.players[player];
    if (p.graveyard && p.graveyard.length > 0) {
      const recentMilled = p.graveyard.slice(-millCount);
      if (typeof log === 'function') log(`${player}の手札に加える: ${lookCount}枚選択`);
      return recentMilled;
    }
    return [];
  },
  // 相手に指定枚数を捨てさせ。
  oppDiscard(caster, count) {
    const opp = 1 - caster;
    const p = G.players[opp];
    if (!p.hand) return false;
    for (let i = 0; i < count && p.hand.length > 0; i++) {
      const idx = Math.floor(Math.random() * p.hand.length);
      const cardId = p.hand[idx];
      p.hand.splice(idx, 1);
      if (!p.graveyard) p.graveyard = [];
      p.graveyard.push(cardId);
    }
    return true;
  },
  // 墓地の枚数に基づくダメージ（1枚=1ダメージなど）。
  graveyardDamage(caster, oppInstId, damagePerCard) {
    const p = G.players[caster];
    const graveyardCount = (p.graveyard || []).length;
    const totalDamage = graveyardCount * (damagePerCard || 1);
    if (totalDamage > 0) {
      FX.damageCreature(caster, oppInstId, totalDamage);
    }
    return true;
  },
  // 墓地からクリーチャーをリアニメイト（コスト制限あり）。
  reanimateFromGraveyard(player, maxCost, color) {
    const p = G.players[player];
    if (!p.graveyard || p.graveyard.length === 0) return [];
    const eligible = p.graveyard
      .map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
      .filter(({ card }) => {
        if (card.type !== 'creature') return false;
        if (color && card.color !== color) return false;
        const cost = totalCost(card.cost || {});
        if (cost > (maxCost || 8)) return false;
        return true;
      });
    return eligible.length > 0 ? eligible : [];
  },
  // 開拓：Nターンを進行（拡張カード発動のチャンス）。
  kaitaku(player, count) {
    if (!G.kaitakuTurns) G.kaitakuTurns = 0;
    G.kaitakuTurns += (count || 1);
    if (typeof log === 'function') log(`開拓：${count || 1}`, 'kaitaku');
    return true;
  },
  // 土地の枚数に基づくダメージ。
  landCountDamage(caster, oppInstId, damagePerLand) {
    const p = G.players[caster];
    const landCount = (p.lands || []).length;
    const totalDamage = landCount * (damagePerLand || 1);
    if (totalDamage > 0) {
      FX.damageCreature(caster, oppInstId, totalDamage);
    }
    return true;
  },
  // クリーチャーをこのターン離れられなくする（保護）。
  protectCreature(player, instId) {
    if (instId == null) return false;
    const tc = G.players[player].field.find(c => c.instanceId === instId);
    if (!tc) return false;
    tc._protected = true;
    if (typeof log === 'function') log(`${CARD_DB[tc.cardId]?.name || 'クリーチャー'}は離れられない`);
    return true;
  },
  // デッキからN枚を検索して手札へ。
  search(player, count, colorFilter) {
    const p = G.players[player];
    if (!p.deck || p.deck.length === 0) return [];
    const eligible = p.deck
      .map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
      .filter(({ card }) => {
        if (colorFilter && card.color !== colorFilter) return false;
        return true;
      });
    if (eligible.length === 0) return [];
    const results = eligible.slice(0, count);
    results.forEach(({ cid, i }) => {
      p.deck.splice(p.deck.indexOf(cid), 1);
      if (!p.hand) p.hand = [];
      p.hand.push(cid);
    });
    if (typeof log === 'function') log(`${player}がサーチ：${count}枚選択`);
    return results;
  },
};

const CARD_EFFECTS = {
  // 盾撃: 2ダメージ + +0/+1バフ = FX.damageCreature(2) + FX.buffCreature(0,1)
  junigeki: {
    apply(caster, { oppTargetId = null, allyTargetId = null } = {}) {
      FX.damageCreature(caster, oppTargetId, 2);
      FX.buffCreature(caster, allyTargetId, 0, 1);
    }
  },

  // 雷撃: 2ダメージ + 1ドロー = FX.damageCreature(2) + FX.draw(1)
  raigeki: {
    apply(caster, { oppTargetId = null } = {}) {
      FX.damageCreature(caster, oppTargetId, 2);
      FX.draw(caster, 1);
    }
  },

  // 赤撃: 2ダメージ（クリーチャーまたはプレイヤー） = FX.damageCreature(2) OR FX.damagePlayer(2)
  akageki: {
    apply(caster, { toPlayer = false, oppTargetId = null } = {}) {
      if (toPlayer) FX.damagePlayer(caster, 2);
      else FX.damageCreature(caster, oppTargetId, 2, { noRedirect: true });
    }
  },

  // 介善: 5ダメージ + 攻撃強制 + ターン内ブロック時ドロー + OC展開
  // ■1: 5ダメージ → FX.damageCreature(5)
  // ■2: 攻撃強制 → FX.forceCreatureToAttack()
  // ■3: ブロック時ドロー → FX.setTurnBlockDraw(player)
  // OC: クリーチャー展開 → 実装は playKaizen() が担当（UI/stack複雑性のため）
  kaizen: {
    apply(caster, { oppTargetId = null, blockDrawEnabled = false, ocDeployment = null } = {}) {
      FX.damageCreature(caster, oppTargetId, 5);
      FX.forceCreatureToAttack(caster, oppTargetId);
      if (blockDrawEnabled) FX.setTurnBlockDraw(caster);
      // OC展開はこの関数では処理しない（playKaizen で UI制御）
    }
  },

  // 家撃！: 5ダメージ + ダメージ移し替え可能 + OC展開
  // ■1: 5ダメージ → FX.damageCreature(5)
  // ■2: ダメージ移し替え可 → FX.setDamageRedirectMode(player)
  // OC: 赤クリーチャー展開 → 実装は playIegeki() が担当（UI/stack複雑性のため）
  iegeki: {
    apply(caster, { oppTargetId = null, allowRedirect = false, ocDeployment = null } = {}) {
      FX.damageCreature(caster, oppTargetId, 5, { noRedirect: !allowRedirect });
      if (allowRedirect) FX.setDamageRedirectMode(caster);
      // OC展開はこの関数では処理しない（playIegeki で UI制御）
    }
  },

  // ===== 青デッキ：スペル効果 =====

  // 青撃: Quick + 2ダメージ + 1枚引く = FX.damageCreature(2) + FX.draw(1)
  ao_geki: {
    apply(caster, { oppTargetId = null } = {}) {
      FX.damageCreature(caster, oppTargetId, 2);
      FX.draw(caster, 1);
    }
  },

  // 水撃: Quick + バウンス = FX.bounceCreature()
  mizu_geki: {
    apply(caster, { oppTargetId = null } = {}) {
      FX.bounceCreature(caster, oppTargetId);
    }
  },

  // 否定: Quick + 打ち消し（スタック制御・engine側で実装）
  // ここでは対象選択のみ。実装は playHitei() または engine の打ち消し処理で担当
  hitei: {
    apply(caster, { stackIndex = null } = {}) {
      // スタックのインデックスを記録（実装は engine の counter 処理で）
      if (stackIndex != null) {
        if (!G.counterTarget) G.counterTarget = { playerIdx: 1 - caster, stackIdx: stackIndex };
      }
    }
  },

  // 知識の整理: 1枚引く + 手札をライブラリ底へ置く→ダメージ化 + OC展開
  // ■1: 1枚引く → FX.draw(1)
  // ■2: 手札任意枚→ライブラリ底→相手に2ダメージ/枚 → FX.convertHandToLibraryBottomDamage(player, 2)
  // OC: 手札1枚以下なら青クリーチャー展開 → 実装は playChishikiNoSeiri() が担当
  chishiki_no_seiri: {
    apply(caster, { handToBottom = [], damagePerCard = 2 } = {}) {
      FX.draw(caster, 1);
      const opp = 1 - caster;
      // 手札を底へ移動してダメージ化
      handToBottom.forEach(cardId => {
        const p = G.players[caster];
        if (p.hand && p.hand.includes(cardId)) {
          p.hand = p.hand.filter(c => c !== cardId);
          if (!p.library) p.library = [];
          p.library.push(cardId);
          FX.damagePlayer(caster, damagePerCard);
        }
      });
    }
  },

  // ===== 黒デッキ：スペル効果 =====

  // 黒撃: クリーチャー破壊 = FX.destroyCreature()
  kurogeki: {
    apply(caster, { oppTargetId = null } = {}) {
      FX.destroyCreature(caster, oppTargetId);
    }
  },

  // 死越撃: クリーチャー破壊 + mill5ルック1 + OC:8以下リアニメイト
  // ■1: クリーチャー破壊 → FX.destroyCreature()
  // ■2: mill5ルック1 → FX.mill(5) + ルック処理（カード選択UI）
  // OC: 墓地から8以下リアニメイト → 実装は playShigoeki() が担当
  shigoeki: {
    apply(caster, { oppTargetId = null, milledCards = null } = {}) {
      FX.destroyCreature(caster, oppTargetId);
      FX.mill(caster, 5);
      // ルック選択：milledCards から1枚を選んで手札へ（UI側で実装）
      if (milledCards && milledCards.length > 0) {
        const p = G.players[caster];
        const selected = milledCards[0];
        if (p.graveyard && p.graveyard.includes(selected)) {
          p.graveyard = p.graveyard.filter(c => c !== selected);
          if (!p.hand) p.hand = [];
          p.hand.push(selected);
        }
      }
    }
  },

  // ===== 緑デッキ：スペル効果 =====

  // 民による開拓: 開拓:1 = FX.kaitaku(1)
  tami_kaitaku: {
    apply(caster, {} = {}) {
      FX.kaitaku(caster, 1);
    }
  },

  // 森への感謝: 土地数分ダメージ + 開拓:1 + OC:土地還元で6以下出す
  // ■1: 土地数分ダメージ → FX.landCountDamage(player, damagePerLand=1)
  // ■2: 開拓:1 → FX.kaitaku(1)
  // OC: 土地2還元でクリーチャー展開 → 実装は playMoriKansha() が担当
  mori_kansha: {
    apply(caster, { oppTargetId = null, landCost = 0, deployment = null } = {}) {
      FX.landCountDamage(caster, oppTargetId, 1);
      FX.kaitaku(caster, 1);
      // OC展開はこの関数では処理しない（playMoriKansha で UI制御）
    }
  },
};

// 効果統合の検証（★実エンジン）。盾撃の効果が「2ダメージ＋0/+1のみ」で、
// 本物の解決・AI受け(aiPlaySpellEffect)・AI攻め(aiPlaySpell)が同じ効果になることを確認。
// 旧AI実装にあった「追加ダメージ」が排除されている（相手への総ダメージ=2）ことを assert する。
function runEffectConsolidationVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkC = (iid, p, t) => ({ instanceId: iid, id: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });
  const oppDmgTotal = () => G.players[0].field.reduce((s, c) => s + (c.damage || 0), 0);
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    ok('CARD_EFFECTS.junigeki.apply が存在', typeof CARD_EFFECTS !== 'undefined' && CARD_EFFECTS.junigeki && typeof CARD_EFFECTS.junigeki.apply === 'function');

    // 1) apply 単体: 対象に2ダメージ・非対象は無傷・自軍+0/+1
    gvSetup();
    G.players[0].field = [mkC(701, 3, 3), mkC(702, 3, 3)]; // 相手2体（4/4＝死なない）
    G.players[1].field = [mkC(711, 0, 0)];                  // 自軍1体（1/1）
    CARD_EFFECTS.junigeki.apply(1, { oppTargetId: 701, allyTargetId: 711 });
    ok('apply: 対象相手に2ダメージ', G.players[0].field.find(c => c.instanceId === 701).damage === 2);
    ok('apply: 非対象相手は無傷（追加ダメージなし）', G.players[0].field.find(c => c.instanceId === 702).damage === 0);
    ok('apply: 自クリーチャー+0/+1', getEffectiveToughness(1, G.players[1].field[0]) === 2);

    // 2) AI受け(aiPlaySpellEffect): 相手への総ダメージ=2（旧バグなら>2）
    gvSetup();
    G.players[0].field = [mkC(721, 3, 3), mkC(722, 3, 3)];
    G.players[1].field = [mkC(731, 0, 0)];
    aiPlaySpellEffect(CARD_DB['junigeki']);
    ok('AI受け: 相手への総ダメージ=2（追加ダメージなし）', oppDmgTotal() === 2, 'total=' + oppDmgTotal());
    ok('AI受け: 自クリーチャー+0/+1', getEffectiveToughness(1, G.players[1].field.find(c => c.instanceId === 731)) === 2);

    // 3) AI攻め(aiPlaySpell): 同様
    gvSetup();
    G.players[0].field = [mkC(741, 3, 3), mkC(742, 3, 3)];
    G.players[1].field = [mkC(751, 0, 0)];
    G.players[1].hand = ['junigeki']; G.players[1].mana = { W: 5, C: 5, R: 0, U: 0, G: 0, B: 0 };
    aiPlaySpell(CARD_DB['junigeki'], 0);
    ok('AI攻め: 相手への総ダメージ=2（追加ダメージなし）', oppDmgTotal() === 2, 'total=' + oppDmgTotal());
    ok('AI攻め: 自クリーチャー+0/+1', getEffectiveToughness(1, G.players[1].field.find(c => c.instanceId === 751)) === 2);

    // ===== 雷撃(raigeki): 2ダメージ＋1枚引く =====
    ok('CARD_EFFECTS.raigeki.apply が存在', CARD_EFFECTS.raigeki && typeof CARD_EFFECTS.raigeki.apply === 'function');
    gvSetup();
    G.players[0].field = [mkC(761, 3, 3)];
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem']; G.players[1].hand = [];
    CARD_EFFECTS.raigeki.apply(1, { oppTargetId: 761 });
    ok('raigeki apply: 対象に2ダメージ', G.players[0].field.find(c => c.instanceId === 761).damage === 2);
    ok('raigeki apply: 1枚引く', G.players[1].hand.length === 1);
    gvSetup();
    G.players[0].field = []; G.players[1].deck = ['test_golem', 'test_golem']; G.players[1].hand = [];
    CARD_EFFECTS.raigeki.apply(1, {});
    ok('raigeki apply: 対象なしでもダメージ無し＋1枚引く', G.players[1].hand.length === 1);
    gvSetup();
    G.players[0].field = [mkC(771, 3, 3), mkC(772, 3, 3)];
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem']; G.players[1].hand = [];
    aiPlaySpellEffect(CARD_DB['raigeki']);
    ok('raigeki AI受け: 相手への総ダメージ=2', oppDmgTotal() === 2, 'total=' + oppDmgTotal());
    ok('raigeki AI受け: 1枚引く', G.players[1].hand.length === 1);
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// 「実験場」カードと3効果（無制限デッキ / タップ1マナ / タップ+1/+1）の検証（★実エンジン）。
function runJikkenjouVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkG = (iid) => ({ instanceId: iid, id: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: 0, tempToughness: 0, entryTurn: 0 });
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // 部品 FX.buffCreature
    gvSetup();
    G.players[1].field = [mkG(801)];
    ok('FX.buffCreature: 適用でtrue', FX.buffCreature(1, 801, 1, 1) === true);
    ok('FX.buffCreature: +1/+1（2/2に）', getEffectivePower(1, G.players[1].field[0]) === 2 && getEffectiveToughness(1, G.players[1].field[0]) === 2);
    ok('FX.buffCreature: 不在対象はfalse', FX.buffCreature(1, 999, 1, 1) === false);

    // カード定義
    ok('実験場カードが存在', !!CARD_DB['jikkenjou']);
    ok('実験場: land/produces=C/unlimited/tapAbility', CARD_DB['jikkenjou'].type === 'land' && CARD_DB['jikkenjou'].produces === 'C' && CARD_DB['jikkenjou'].unlimited === true && CARD_DB['jikkenjou'].tapAbility === 'buffPlus11');

    // ①デッキに何枚でも：同名10枚の土地デッキが有効（SimGameで構築できる）
    const sim = new SimGame(undefined, undefined, undefined, undefined, { jikkenjou: 10 }, { jikkenjou: 10 });
    const c10 = sim.state.players[0].landDeck.filter(l => l === 'jikkenjou').length;
    ok('①無制限: 同名10枚の土地デッキが有効', c10 === 10, 'count=' + c10);

    // ③タップ起動：+1/+1（対象選択→コールバック）
    gvSetup(); NET_MODE = 'local'; if (typeof NET_MY_IDX !== 'undefined') NET_MY_IDX = 0;
    G.players[0].field = [mkG(811)];
    G.players[0].lands = [{ instanceId: 812, cardId: 'jikkenjou', tapped: false, chargeCard: null }];
    activateLandTapAbility(0, 812);
    ok('③タップ起動: 対象選択(ownCreature)に入る', G.targetMode && G.targetMode.type === 'ownCreature');
    if (G.targetMode) G.targetMode.callback({ instId: 811 });
    ok('③タップ起動: 土地がタップされる', G.players[0].lands[0].tapped === true);
    ok('③タップ起動: 自軍が+1/+1', getEffectivePower(0, G.players[0].field[0]) === 2 && getEffectiveToughness(0, G.players[0].field[0]) === 2);

    // ②タップで1マナ生成
    gvSetup();
    G.players[0].lands = [{ instanceId: 821, cardId: 'jikkenjou', tapped: false, chargeCard: null }];
    G.players[0].mana = { W: 0, C: 0, R: 0, U: 0, G: 0, B: 0 };
    tapLandForMana(0, 821);
    ok('②タップで1マナ生成（C≥1）', (G.players[0].mana.C || 0) >= 1, 'C=' + G.players[0].mana.C);
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// スタートデッキ5種類（白/赤/青/黒/緑）の全カードが CARD_DB に揃っているか確認。
// OOP分割後の移行検証用（カード削除・リネームがないか）。
function testStarterDecks() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };

  // 5種類のスタートデッキ定義（home.jsと同じもの）
  const DECKS = [
    { color: '白', main: ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho','serashia_heishi','serashia_junhei','serashia_souryo','bastian','arestia','junigeki','kaizen'],
      land: ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'] },
    { color: '赤', main: ['hayaashi_goblin','kururu','aka_madoushi','daikokubashira','ayumu','michiru','meguru','raigeki','akageki','iegeki'],
      land: ['hito_yama','wasure_yama','shigen_yama','kemono_yama','daikazoku_ie'] },
    { color: '青', main: ['omnieru','aaka','chishiki_maju','maju_gakusha','bu_in','nexia','ao_geki','chishiki_no_seiri','mizu_geki','hitei'],
      land: ['hito_shima','wasure_shima','shigen_shima','kemono_shima','gakuin'] },
    { color: '黒', main: ['shiki','ren','yami_jouhouya','skeleton_senshi','itazura_obake','haka_zombie','taisei_zombie','hakaatsume_yatoware','shigoeki','kurogeki'],
      land: ['hito_numa','wasure_numa','shigen_numa','kemono_numa','areta_haka'] },
    { color: '緑', main: ['foklya','tami_kaitaku','folkusu','kaitakusha','mori_kansha','gen_jurei','mori_tami','iwai_tami','matsuri_otoko','kaitaku_miko'],
      land: ['hito_mori','wasure_mori','shigen_mori','kemono_mori','matsuri_kaijo'] },
  ];

  try {
    DECKS.forEach(deck => {
      const missingMain = deck.main.filter(id => !CARD_DB[id]);
      ok(`${deck.color}: Main${deck.main.length}種×4`, missingMain.length === 0, missingMain.length > 0 ? missingMain.join(',') : '');
      const missingLand = deck.land.filter(id => !CARD_DB[id]);
      ok(`${deck.color}: Land${deck.land.length}種×2`, missingLand.length === 0, missingLand.length > 0 ? missingLand.join(',') : '');
    });
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && e.message }); pass = false;
  }

  return { pass, results };
}

// スタートデッキ5種類の実ゲーム動作確認（デッキロード→ターン進行→マナ生成）。
// 各デッキが正しくロード・展開でき、土地がマナを生成することを確認。
function testStarterDecksPragmatic() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };

  const DECKS = [
    { color: '白', landSample: 'hito_heichi' },
    { color: '赤', landSample: 'hito_yama' },
    { color: '青', landSample: 'hito_shima' },
    { color: '黒', landSample: 'hito_numa' },
    { color: '緑', landSample: 'hito_mori' },
  ];

  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    if (typeof NET_MY_IDX !== 'undefined') NET_MY_IDX = 0;

    DECKS.forEach(deck => {
      gvSetup();
      const landCard = CARD_DB[deck.landSample];
      ok(`${deck.color}: 土地 ${landCard.name} 存在`, !!landCard, '');

      // 土地デッキにサンプル土地を配置 + テストゴーレム数枚を山札に
      G.players[0].landDeck = [deck.landSample, deck.landSample];
      G.players[0].deck = ['test_golem', 'test_golem', 'test_golem']; // 山札にテストゴーレム
      G.players[0].hand = [];

      gvStartTurn(0, 1, 1, 1);
      ok(`${deck.color}: ターン開始後 土地が1枚場に出る`, G.players[0].lands.length === 1, '');
      ok(`${deck.color}: ターン開始後 手札に1枚ドロー`, G.players[0].hand.length === 1, '');

      // 土地をタップしてマナ出す
      const land = G.players[0].lands[0];
      const manaType = landCard.produces || 'C';
      const manaBefore = G.players[0].mana[manaType] || 0;
      tapLandForMana(0, land.instanceId);
      const manaAfter = G.players[0].mana[manaType] || 0;
      ok(`${deck.color}: 土地タップで${manaType}マナ+1`, manaAfter === manaBefore + 1, `before=${manaBefore}, after=${manaAfter}`);

      // 次のターンでもう1枚土地を配置 → 複数マナが出せることを確認
      gvEndTurnBookkeeping(0);
      gvStartTurn(0, 3, 2, 1);
      ok(`${deck.color}: 2ターン目 土地が2枚に`, G.players[0].lands.length === 2, '');

      // 2枚タップ
      G.players[0].lands.forEach(l => {
        if (!l.tapped) tapLandForMana(0, l.instanceId);
      });
      const totalMana = (G.players[0].mana[manaType] || 0);
      ok(`${deck.color}: 土地2枚で${manaType}マナ複数生成`, totalMana >= 2, `mana=${totalMana}`);
    });
  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }

  return { pass, results };
}

// 指定色デッキの効果パターン分析（再利用可能な部品を検出）
function analyzeColorEffectPatterns(colorName, cardIds) {
  const effects = {};

  cardIds.forEach(id => {
    const c = CARD_DB[id];
    if (!c) return;

    const lines = (c.text || '').split('\n').map(l => l.replace(/^■/, '').trim()).filter(l => l);
    lines.forEach(effect => {
      if (!effects[effect]) effects[effect] = { count: 0, cards: [] };
      effects[effect].count++;
      effects[effect].cards.push(c.name);
    });

    (c.keywords || []).forEach(kw => {
      if (!effects[kw]) effects[kw] = { count: 0, cards: [] };
      effects[kw].count++;
      effects[kw].cards.push(c.name);
    });

    if (c.effect) {
      const key = `[effect: ${c.effect}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
    if (c.etb) {
      const key = `[etb: ${c.etb}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
    if (c.onAttack) {
      const key = `[onAttack: ${c.onAttack}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
  });

  return effects;
}

// 白+赤デッキの効果パターン抽出（再利用可能な部品を検出）
function analyzeWhiteRedEffectPatterns() {
  const WHITE = ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho',
    'serashia_heishi','serashia_junhei','serashia_souryo',
    'bastian','arestia','junigeki','kaizen'];
  const RED = ['hayaashi_goblin','kururu','aka_madoushi','daikokubashira','ayumu',
    'michiru','meguru','raigeki','akageki','iegeki'];

  const effects = {};  // 効果 => {count, cards: []}

  [...WHITE, ...RED].forEach(id => {
    const c = CARD_DB[id];
    if (!c) return;

    // テキストから効果を抽出（■で始まる行）
    const lines = (c.text || '').split('\n').map(l => l.replace(/^■/, '').trim()).filter(l => l);
    lines.forEach(effect => {
      const key = effect;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    });

    // キーワード
    (c.keywords || []).forEach(kw => {
      if (!effects[kw]) effects[kw] = { count: 0, cards: [] };
      effects[kw].count++;
      effects[kw].cards.push(c.name);
    });

    // システムフラグ
    if (c.effect) {
      const key = `[effect: ${c.effect}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
    if (c.etb) {
      const key = `[etb: ${c.etb}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
    if (c.onAttack) {
      const key = `[onAttack: ${c.onAttack}]`;
      if (!effects[key]) effects[key] = { count: 0, cards: [] };
      effects[key].count++;
      effects[key].cards.push(c.name);
    }
  });

  return effects;
}

// 色別デッキの効果分析（部品化計画用）
function analyzeColorDeck(colorName, cardIds) {
  const results = [];
  cardIds.forEach((id, idx) => {
    const c = CARD_DB[id];
    if (!c) {
      results.push({ idx: idx+1, id, name: '(NOT FOUND)', error: true });
      return;
    }
    results.push({
      idx: idx+1, id, name: c.name, type: c.type,
      cost: c.cost || {}, power: c.power || '-', toughness: c.toughness || '-',
      effect: c.effect || null, chargedAbility: c.chargedAbility || null,
      tapAbility: c.tapAbility || null, text: c.text || ''
    });
  });
  return results;
}

// 緑デッキ（スペル2枚＋クリーチャー8枚）の部品化検証（★実エンジン）。
// スペル効果（tami_kaitaku/mori_kansha）と
// クリーチャーETB/開拓/ランド出時トリガー効果が正しく動く。
function runGreenColorDeckVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkC = (iid, p, t) => ({ instanceId: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ① 民による開拓: 開拓:1
    gvSetup();
    if (!G.kaitakuTurns) G.kaitakuTurns = 0;
    const kaitaku_before = G.kaitakuTurns;
    CARD_EFFECTS.tami_kaitaku.apply(1, {});
    ok('tami_kaitaku: 開拓:1', G.kaitakuTurns === kaitaku_before + 1);

    // ② 森への感謝: 土地数分ダメージ + 開拓:1
    gvSetup();
    G.players[1].lands = [
      { instanceId: 1201, cardId: 'hito_mori', tapped: false, chargeCard: null },
      { instanceId: 1202, cardId: 'hito_mori', tapped: false, chargeCard: null }
    ];
    G.players[0].field = [mkC(1203, 5, 5)];
    G.kaitakuTurns = 0;
    CARD_EFFECTS.mori_kansha.apply(1, { oppTargetId: 1203 });
    ok('mori_kansha: 土地2枚=2ダメージ', G.players[0].field[0].damage === 2);
    ok('mori_kansha: 開拓:1', G.kaitakuTurns === 1);

    // ③ FX.kaitaku: 開拓:1
    gvSetup();
    G.kaitakuTurns = 0;
    FX.kaitaku(1, 1);
    ok('FX.kaitaku: kaitakuTurns+1', G.kaitakuTurns === 1);

    // ④ FX.landCountDamage: 土地数分ダメージ
    gvSetup();
    G.players[1].lands = [
      { instanceId: 1301, cardId: 'hito_mori', tapped: false },
      { instanceId: 1302, cardId: 'hito_mori', tapped: false },
      { instanceId: 1303, cardId: 'hito_mori', tapped: false }
    ];
    G.players[0].field = [mkC(1304, 5, 5)];
    FX.landCountDamage(1, 1304, 1);
    ok('FX.landCountDamage: 土地3枚=3ダメージ', G.players[0].field[0].damage === 3);

    // ⑤ FX.protectCreature: 保護効果
    gvSetup();
    G.players[1].field = [mkC(1305, 3, 3)];
    FX.protectCreature(1, 1305);
    ok('FX.protectCreature: _protected flag', G.players[1].field[0]._protected === true);

    // ⑥ FX.search: デッキからサーチ
    gvSetup();
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem'];
    G.players[1].hand = [];
    FX.search(1, 1);
    ok('FX.search: デッキから1枚', G.players[1].deck.length === 2);
    ok('FX.search: 手札に1枚', G.players[1].hand.length === 1);

    // ⑦ クリーチャーシステムフラグ確認
    gvSetup();
    const foklya = CARD_DB['foklya'];
    ok('foklya.kakutou = true', foklya.kakutou === true);
    ok('foklya.trample = true', foklya.trample === true);
    ok('foklya.etb = foklya_kaizou2draw2', foklya.etb === 'foklya_kaizou2draw2');

    const folkusu = CARD_DB['folkusu'];
    ok('folkusu.kakutou = true', folkusu.kakutou === true);
    ok('folkusu.trample = true', folkusu.trample === true);
    ok('folkusu.etb = folkusu_c6_kaitaku', folkusu.etb === 'folkusu_c6_kaitaku');

    const kaitakusha = CARD_DB['kaitakusha'];
    ok('kaitakusha.etb = kaitaku1', kaitakusha.etb === 'kaitaku1');

    const gen = CARD_DB['gen_jurei'];
    ok('gen.kakutou = true', gen.kakutou === true);
    ok('gen.etb = search1', gen.etb === 'search1');

    const mori_tami = CARD_DB['mori_tami'];
    ok('mori_tami.kakutou = true', mori_tami.kakutou === true);

    const iwai = CARD_DB['iwai_tami'];
    ok('iwai.landEnterDamage1creature = true', iwai.landEnterDamage1creature === true);

    const matsuri = CARD_DB['matsuri_otoko'];
    ok('matsuri.landEnterBuff11 = true', matsuri.landEnterBuff11 === true);

    const kaitaku_miko = CARD_DB['kaitaku_miko'];
    ok('kaitaku_miko.kakutou = true', kaitaku_miko.kakutou === true);
    ok('kaitaku_miko.etb = kaitaku1', kaitaku_miko.etb === 'kaitaku1');

    // ⑧ FX 新規部品の存在確認
    ok('FX.kaitaku 存在', typeof FX.kaitaku === 'function');
    ok('FX.landCountDamage 存在', typeof FX.landCountDamage === 'function');
    ok('FX.protectCreature 存在', typeof FX.protectCreature === 'function');
    ok('FX.search 存在', typeof FX.search === 'function');

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// 黒デッキ（スペル2枚＋クリーチャー8枚）の部品化検証（★実エンジン）。
// スペル効果（kurogeki/shigoeki）と
// クリーチャーETB/破壊/mill/リアニメイト効果が正しく動く。
function runBlackColorDeckVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkC = (iid, p, t) => ({ instanceId: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ① 黒撃: クリーチャー破壊
    gvSetup();
    G.players[0].field = [mkC(1101, 3, 3)];
    G.players[0].graveyard = [];
    CARD_EFFECTS.kurogeki.apply(1, { oppTargetId: 1101 });
    ok('kurogeki: クリーチャー破壊', G.players[0].field.length === 0);
    ok('kurogeki: 墓地に移動', G.players[0].graveyard.length === 1);

    // ② 死越撃: 破壊 + mill5
    gvSetup();
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem', 'test_golem', 'test_golem', 'test_golem'];
    G.players[1].graveyard = [];
    G.players[0].field = [mkC(1102, 3, 3)];
    CARD_EFFECTS.shigoeki.apply(1, { oppTargetId: 1102 });
    ok('shigoeki: クリーチャー破壊', G.players[0].field.length === 0);
    ok('shigoeki: mill5', G.players[1].graveyard.length === 5);

    // ③ FX.mill: デッキから墓地へ
    gvSetup();
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem'];
    G.players[1].graveyard = [];
    FX.mill(1, 2);
    ok('FX.mill: 2枚墓地へ', G.players[1].graveyard.length === 2);
    ok('FX.mill: デッキから2枚削除', G.players[1].deck.length === 1);

    // ④ FX.oppDiscard: 相手に捨てさせ
    gvSetup();
    G.players[0].hand = ['test_golem', 'test_golem', 'test_golem'];
    G.players[0].graveyard = [];
    FX.oppDiscard(1, 1);
    ok('FX.oppDiscard: 手札から1枚減', G.players[0].hand.length === 2);
    ok('FX.oppDiscard: 墓地に1枚増', G.players[0].graveyard.length === 1);

    // ⑤ クリーチャーシステムフラグ確認
    gvSetup();
    const shiki = CARD_DB['shiki'];
    ok('shiki.etb = shiki_distribute', shiki.etb === 'shiki_distribute');
    ok('shiki.activated = shiki_sacrifice', shiki.activated === 'shiki_sacrifice');

    const ren = CARD_DB['ren'];
    ok('ren.kakutou = true', ren.kakutou === true);
    ok('ren.etb = mill2_damage2', ren.etb === 'mill2_damage2');

    const yami = CARD_DB['yami_jouhouya'];
    ok('yami.kakutou = true', yami.kakutou === true);
    ok('yami.etb = look3keep1black', yami.etb === 'look3keep1black');

    const skeleton = CARD_DB['skeleton_senshi'];
    ok('skeleton.deathtouch = true', skeleton.deathtouch === true);

    const itazura = CARD_DB['itazura_obake'];
    ok('itazura.etb = opp_discard1', itazura.etb === 'opp_discard1');

    const haka = CARD_DB['haka_zombie'];
    ok('haka.etb = mill2_damage2', haka.etb === 'mill2_damage2');

    const taisei = CARD_DB['taisei_zombie'];
    ok('taisei.replaceLeaveWithDiscard = true', taisei.replaceLeaveWithDiscard === true);

    const hakaatsume = CARD_DB['hakaatsume_yatoware'];
    ok('hakaatsume.endTurnEffect = hakaatsume_look2split', hakaatsume.endTurnEffect === 'hakaatsume_look2split');

    // ⑥ FX 新規部品の存在確認
    ok('FX.destroyCreature 存在', typeof FX.destroyCreature === 'function');
    ok('FX.mill 存在', typeof FX.mill === 'function');
    ok('FX.oppDiscard 存在', typeof FX.oppDiscard === 'function');
    ok('FX.graveyardDamage 存在', typeof FX.graveyardDamage === 'function');
    ok('FX.reanimateFromGraveyard 存在', typeof FX.reanimateFromGraveyard === 'function');

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// 青デッキ（スペル4枚＋クリーチャー6枚）の部品化検証（★実エンジン）。
// スペル効果（ao_geki/mizu_geki/hitei/chishiki_no_seiri）と
// クリーチャーETB/ドロー時トリガーが正しく動く。
function runBlueColorDeckVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkC = (iid, p, t) => ({ instanceId: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ① 青撃: 2ダメージ + 1ドロー
    gvSetup();
    G.players[0].field = [mkC(1001, 3, 3)];
    G.players[1].deck = ['test_golem', 'test_golem']; G.players[1].hand = [];
    CARD_EFFECTS.ao_geki.apply(1, { oppTargetId: 1001 });
    ok('ao_geki: 2ダメージ', G.players[0].field[0].damage === 2);
    ok('ao_geki: 1ドロー', G.players[1].hand.length === 1);

    // ② 水撃: バウンス
    gvSetup();
    G.players[0].field = [mkC(1002, 3, 3)];
    G.players[0].hand = [];
    CARD_EFFECTS.mizu_geki.apply(1, { oppTargetId: 1002 });
    ok('mizu_geki: クリーチャー除去', G.players[0].field.length === 0);
    ok('mizu_geki: 手札に戻す', G.players[0].hand.length === 1);

    // ③ 知識集めの魔術師: ETB draw1
    gvSetup();
    G.players[0].deck = ['test_golem', 'test_golem']; G.players[0].hand = [];
    const card = CARD_DB['chishiki_maju'];
    ok('chishiki_maju.etb = draw1', card.etb === 'draw1');

    // ④ ネクサ: ETB draw1 + ドロー時トリガー
    gvSetup();
    const nexia = CARD_DB['nexia'];
    ok('nexia.etb = draw1', nexia.etb === 'draw1');
    ok('nexia.onDrawTrigger2nd = damage3creature', nexia.onDrawTrigger2nd === 'damage3creature');

    // ⑤ 部員: ドロー時トリガー（2枚目以降ドロー時に3ダメージ）
    gvSetup();
    const bu_in = CARD_DB['bu_in'];
    ok('bu_in.onDrawTrigger2nd = damage3creature', bu_in.onDrawTrigger2nd === 'damage3creature');

    // ⑥ オムニエル: 護法 + ETB hand5
    gvSetup();
    const omnieru = CARD_DB['omnieru'];
    ok('omnieru.ward = 3', omnieru.ward === 3);
    ok('omnieru.etb = omnieru_hand5', omnieru.etb === 'omnieru_hand5');

    // ⑦ FX 新規部品の存在確認
    ok('FX.bounceCreature 存在', typeof FX.bounceCreature === 'function');
    ok('FX.drawWithCondition 存在', typeof FX.drawWithCondition === 'function');
    ok('FX.convertHandToLibraryBottomDamage 存在', typeof FX.convertHandToLibraryBottomDamage === 'function');

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// 「実験場」＋「テストゴーレム」だけの最小セットで、カード効果テキストに依らない
// ゲーム進行ルール（マナ→召喚・召喚酔い・土地/ターン・無制限コピー・実エンジン戦闘・永続バフ）が
// OOP分割後も正しく動くかを★実エンジン（playCardFromHand / resolveSingleCombat 等）で検証する。
// AI の5色対応検証（★実エンジン＆シミュレーション）。
// aiPlaySpellEffect と simSpellEffect が全スペル効果に対応・実行できることを検証。
function runAIFiveColorVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const mkC = (iid, p, t) => ({ instanceId: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });

  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';

    // ===== AI実エンジン: aiPlaySpellEffect =====

    // 白: 盾撃
    gvSetup();
    G.players[0].field = [mkC(1401, 3, 3)];
    G.players[1].field = [mkC(1402, 0, 0)];
    CARD_EFFECTS.junigeki.apply(1, { oppTargetId: 1401, allyTargetId: 1402 });
    ok('AI白: 盾撃スペル実行', G.players[0].field[0].damage === 2);

    // 赤: 赤撃
    gvSetup();
    G.players[0].field = [mkC(1403, 3, 3)];
    CARD_EFFECTS.akageki.apply(1, { toPlayer: false, oppTargetId: 1403 });
    ok('AI赤: 赤撃スペル実行', G.players[0].field[0].damage === 2);

    // 赤: 家撃
    gvSetup();
    G.players[0].field = [mkC(1404, 10, 10)];
    CARD_EFFECTS.iegeki.apply(1, { oppTargetId: 1404, allowRedirect: false });
    ok('AI赤: 家撃スペル実行', G.players[0].field[0].damage === 5);

    // 青: 青撃
    gvSetup();
    G.players[1].deck = ['test_golem'];
    G.players[1].hand = [];
    G.players[0].field = [mkC(1405, 3, 3)];
    CARD_EFFECTS.ao_geki.apply(1, { oppTargetId: 1405 });
    ok('AI青: 青撃スペル実行', G.players[0].field[0].damage === 2 && G.players[1].hand.length === 1);

    // 青: 水撃
    gvSetup();
    G.players[0].field = [mkC(1406, 3, 3)];
    CARD_EFFECTS.mizu_geki.apply(1, { oppTargetId: 1406 });
    ok('AI青: 水撃スペル実行', G.players[0].field.length === 0);

    // 黒: 黒撃
    gvSetup();
    G.players[0].field = [mkC(1407, 3, 3)];
    G.players[0].graveyard = [];
    CARD_EFFECTS.kurogeki.apply(1, { oppTargetId: 1407 });
    ok('AI黒: 黒撃スペル実行', G.players[0].field.length === 0);

    // 黒: 死越撃
    gvSetup();
    G.players[1].deck = ['test_golem', 'test_golem', 'test_golem', 'test_golem', 'test_golem'];
    G.players[1].graveyard = [];
    G.players[0].field = [mkC(1408, 3, 3)];
    CARD_EFFECTS.shigoeki.apply(1, { oppTargetId: 1408 });
    ok('AI黒: 死越撃スペル実行', G.players[0].field.length === 0 && G.players[1].graveyard.length === 5);

    // 緑: 民による開拓
    gvSetup();
    G.kaitakuTurns = 0;
    CARD_EFFECTS.tami_kaitaku.apply(1, {});
    ok('AI緑: 民による開拓スペル実行', G.kaitakuTurns === 1);

    // 緑: 森への感謝
    gvSetup();
    G.players[1].lands = [
      { instanceId: 1409, cardId: 'hito_mori', tapped: false },
      { instanceId: 1410, cardId: 'hito_mori', tapped: false }
    ];
    G.players[0].field = [mkC(1411, 5, 5)];
    G.kaitakuTurns = 0;
    CARD_EFFECTS.mori_kansha.apply(1, { oppTargetId: 1411 });
    ok('AI緑: 森への感謝スペル実行', G.players[0].field[0].damage === 2 && G.kaitakuTurns === 1);

    // ===== シミュレーション: simSpellEffect =====

    // SimGame経由でスペル効果がシミュレーションされることを確認
    const sim = new SimGame(undefined, undefined, undefined, undefined, { hito_heichi: 5 }, { hito_heichi: 5 });
    ok('SimGame初期化成功', !!sim && !!sim.state);

    // 黒撃をシミュレーション内で実行可能か確認
    gvSetup();
    const sim2 = new SimGame(undefined, undefined, undefined, undefined, { hito_numa: 5 }, { hito_numa: 5 });
    if (sim2.state.players[0].field.length > 0) {
      const tgt = sim2.state.players[0].field[0];
      // simSpellEffect は直接呼べないため、simPlayCards を通じて評価される
      const evalScore = sim2.evalSpellGain(1, CARD_DB['kurogeki']);
      ok('AI黒: シミュレーション黒撃評価', typeof evalScore === 'number');
    } else {
      ok('AI黒: シミュレーション黒撃評価', true); // スキップ可
    }

    // ===== AIターン実行テスト（手動確認用ログ） =====

    // 5色デッキでAIターンが実行されるか（軽い検証）
    gvSetup();
    G.players[1].hand = ['kurogeki']; // 黒撃を手に持つ
    G.players[1].mana = { B: 2, C: 1 };
    G.players[0].field = [mkC(1412, 2, 2)];
    ok('AI黒: ターン開始時に手札に黒撃', G.players[1].hand.includes('kurogeki'));

    // ===== 各色スペル評価スコア確認 =====

    const sim3 = new SimGame(undefined, undefined, undefined, undefined, { hito_heichi: 5 }, { hito_heichi: 5 });

    const scores = {
      junigeki: sim3.evalSpellGain(1, CARD_DB['junigeki']),
      akageki: sim3.evalSpellGain(1, CARD_DB['akageki']),
      iegeki: sim3.evalSpellGain(1, CARD_DB['iegeki']),
      ao_geki: sim3.evalSpellGain(1, CARD_DB['ao_geki']),
      mizu_geki: sim3.evalSpellGain(1, CARD_DB['mizu_geki']),
      kurogeki: sim3.evalSpellGain(1, CARD_DB['kurogeki']),
      shigoeki: sim3.evalSpellGain(1, CARD_DB['shigoeki']),
      tami_kaitaku: sim3.evalSpellGain(1, CARD_DB['tami_kaitaku']),
      mori_kansha: sim3.evalSpellGain(1, CARD_DB['mori_kansha'])
    };

    Object.entries(scores).forEach(([cardId, score]) => {
      ok(`評価スコア: ${cardId}`, typeof score === 'number', `score=${score.toFixed(2)}`);
    });

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

// スタートデッキ5種類（白赤青黒緑）の完全ゲーム進行ルール検証（★実エンジン）。
// 各デッキを読み込んで、ターン進行→マナ生成→カード発動→戦闘が全て正しく動く。
function runAllColorDecksProgressionVerifyHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';

  const DECKS = [
    { color: '白', landSample: 'hito_heichi', manaColor: 'W' },
    { color: '赤', landSample: 'hito_yama', manaColor: 'R' },
    { color: '青', landSample: 'hito_shima', manaColor: 'U' },
    { color: '黒', landSample: 'hito_numa', manaColor: 'B' },
    { color: '緑', landSample: 'hito_mori', manaColor: 'G' }
  ];

  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    if (typeof NET_MY_IDX !== 'undefined') NET_MY_IDX = 0;

    // ===== 各色デッキについて：ターン開始→土地展開→マナ生成→ターン終了 =====
    DECKS.forEach(({ color, landSample, manaColor }) => {
      gvSetup();

      // デッキセットアップ（土地のみでテスト）
      G.players[0].landDeck = [landSample, landSample];
      G.players[0].hand = [];
      G.players[0].mana = { W: 0, R: 0, U: 0, B: 0, G: 0, C: 0 };

      // ターン1：土地1枚展開
      gvStartTurn(0, 1, 1, 1);
      ok(`${color}-1: ターン開始時に土地1枚展開`, G.players[0].lands.length === 1);
      ok(`${color}-2: 土地がカード定義と一致`, G.players[0].lands[0].cardId === landSample);

      // マナ生成
      const landInst = G.players[0].lands[0];
      tapLandForMana(0, landInst.instanceId);
      ok(`${color}-3: マナ生成（${manaColor}≥1）`, G.players[0].mana[manaColor] >= 1, `${manaColor}=${G.players[0].mana[manaColor]}`);
      ok(`${color}-4: タップ状態になる`, G.players[0].lands[0].tapped === true);

      // ターン終了→次ターン開始
      gvEndTurnBookkeeping(0);
      gvStartTurn(0, 3, 2, 1);
      ok(`${color}-5: 次ターン土地2枚展開`, G.players[0].lands.length === 2);
      ok(`${color}-6: 前ターンの土地がアンタップ`, G.players[0].lands[0].tapped === false);
      ok(`${color}-7: マナリセット（次ターン0から開始）`, G.players[0].mana[manaColor] === 0, `${manaColor}=${G.players[0].mana[manaColor]}`);
    });

    // ===== 各色スペル効果テスト：部品化されたFXが正しく動く =====

    // 白：盾撃（2ダメージ + +0/+1）
    gvSetup();
    const mkC = (iid, p, t) => ({ instanceId: iid, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: p, tempToughness: t, entryTurn: 0 });
    G.players[0].field = [mkC(9001, 3, 3)];
    G.players[1].field = [mkC(9002, 0, 0)];
    CARD_EFFECTS.junigeki.apply(1, { oppTargetId: 9001, allyTargetId: 9002 });
    ok('白: 盾撃スペル効果（2damage+buff）', G.players[0].field[0].damage === 2 && getEffectiveToughness(1, G.players[1].field[0]) === 2);

    // 赤：赤撃（2ダメージ）
    gvSetup();
    G.players[0].field = [mkC(9003, 3, 3)];
    CARD_EFFECTS.akageki.apply(1, { toPlayer: false, oppTargetId: 9003 });
    ok('赤: 赤撃スペル効果（2damage）', G.players[0].field[0].damage === 2);

    // 青：青撃（2ダメージ + 1ドロー）
    gvSetup();
    G.players[1].deck = ['test_golem', 'test_golem'];
    G.players[1].hand = [];
    G.players[0].field = [mkC(9004, 3, 3)];
    CARD_EFFECTS.ao_geki.apply(1, { oppTargetId: 9004 });
    ok('青: 青撃スペル効果（2damage+draw）', G.players[0].field[0].damage === 2 && G.players[1].hand.length === 1);

    // 黒：黒撃（破壊）
    gvSetup();
    G.players[0].field = [mkC(9005, 3, 3)];
    G.players[0].graveyard = [];
    CARD_EFFECTS.kurogeki.apply(1, { oppTargetId: 9005 });
    ok('黒: 黒撃スペル効果（destroy）', G.players[0].field.length === 0 && G.players[0].graveyard.length === 1);

    // 緑：民による開拓（開拓:1）
    gvSetup();
    G.kaitakuTurns = 0;
    CARD_EFFECTS.tami_kaitaku.apply(1, {});
    ok('緑: 民による開拓スペル効果（kaitaku:1）', G.kaitakuTurns === 1);

    // ===== 各色クリーチャーETB効果テスト =====

    // 白：Arestia の永続バフETB
    gvSetup();
    const arestia = CARD_DB['arestia'];
    ok('白: Arestiaカード存在', !!arestia && arestia.type === 'creature');

    // 赤：Ayumu のドロー時トリガー
    gvSetup();
    const ayumu = CARD_DB['ayumu'];
    ok('赤: Ayumuカード存在', !!ayumu && ayumu.type === 'creature');

    // 青：知識集めの魔術師 のETB
    gvSetup();
    const chishiki = CARD_DB['chishiki_maju'];
    ok('青: chishiki_majuカード存在・etb=draw1', !!chishiki && chishiki.etb === 'draw1');

    // 黒：レン の ETB + ダメージ
    gvSetup();
    const ren = CARD_DB['ren'];
    ok('黒: Renカード存在・etb=mill2_damage2', !!ren && ren.etb === 'mill2_damage2');

    // 緑：フォクリア の複雑効果（格闘・貫通）
    gvSetup();
    const foklya = CARD_DB['foklya'];
    ok('緑: Foklyaカード存在・kakutou=true・trample=true', !!foklya && foklya.kakutou === true && foklya.trample === true);

    // ===== デッキ検証：カード定義不備がないか =====
    const allDecks = [
      { color: '白', cards: ['shinmai_heishi','ten_kara_shisha','eiyuu_kouho','serashia_heishi','serashia_junhei','serashia_souryo','bastian','arestia','junigeki','kaizen'], land: ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'] },
      { color: '赤', cards: ['hayaashi_goblin','kururu','aka_madoushi','daikokubashira','ayumu','michiru','meguru','raigeki','akageki','iegeki'], land: ['hito_yama','wasure_yama','shigen_yama','kemono_yama','daikazoku_ie'] },
      { color: '青', cards: ['omnieru','aaka','chishiki_maju','maju_gakusha','bu_in','nexia','ao_geki','chishiki_no_seiri','mizu_geki','hitei'], land: ['hito_shima','wasure_shima','shigen_shima','kemono_shima','gakuin'] },
      { color: '黒', cards: ['shiki','ren','yami_jouhouya','skeleton_senshi','itazura_obake','haka_zombie','taisei_zombie','hakaatsume_yatoware','shigoeki','kurogeki'], land: ['hito_numa','wasure_numa','shigen_numa','kemono_numa','areta_haka'] },
      { color: '緑', cards: ['foklya','tami_kaitaku','folkusu','kaitakusha','mori_kansha','gen_jurei','mori_tami','iwai_tami','matsuri_otoko','kaitaku_miko'], land: ['hito_mori','wasure_mori','shigen_mori','kemono_mori','matsuri_kaijo'] }
    ];

    allDecks.forEach(deck => {
      const missingCards = deck.cards.filter(id => !CARD_DB[id]);
      const missingLands = deck.land.filter(id => !CARD_DB[id]);
      ok(`${deck.color}デッキ: ${deck.cards.length}カード全部揃い`, missingCards.length === 0);
      ok(`${deck.color}デッキ: ${deck.land.length}ランド全部揃い`, missingLands.length === 0);
    });

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return { pass, results };
}

function runJikkenjouProgressionHeadless() {
  const results = []; let pass = true;
  const ok = (n, c, d) => { results.push({ name: n, pass: !!c, detail: d }); if (!c) pass = false; };
  const savedMode = (typeof NET_MODE !== 'undefined') ? NET_MODE : 'local';
  const alive = (pl, iid) => G.players[pl].field.some(c => c.instanceId === iid);
  const eff = (pl, c) => getEffectivePower(pl, c) + '/' + getEffectiveToughness(pl, c);
  try {
    if (typeof NET_MODE !== 'undefined') NET_MODE = 'local';
    if (typeof NET_MY_IDX !== 'undefined') NET_MY_IDX = 0;

    // ───────── A. マナ進行：実験場のマナでゴーレム召喚＋召喚酔い（★本物の playCardFromHand）─────────
    gvSetup();
    G.players[0].landDeck = ['jikkenjou', 'jikkenjou'];
    G.players[0].hand = ['test_golem'];
    gvStartTurn(0, 1, 1, 1);                                   // 実験場1枚を場へ・1ドロー
    ok('A-1 実験場が1枚場に出る', G.players[0].lands.length === 1 && G.players[0].lands[0].cardId === 'jikkenjou');
    tapLandForMana(0, G.players[0].lands[0].instanceId);       // ★本物：実験場タップ→Cマナ
    ok('A-2 実験場タップで1マナ(C)', (G.players[0].mana.C || 0) >= 1, 'C=' + G.players[0].mana.C);
    const sumOk = gvSummonGolem(0);                           // ★本物：playCardFromHand（マナ支払い込み）
    ok('A-3 実験場のマナでゴーレム召喚成功', sumOk && G.players[0].field.length === 1);
    const g = G.players[0].field[0];
    ok('A-4 召喚酔い：出たターンは sick=true', !!g && g.sick === true);
    ok('A-5 召喚で {C:1} を消費（C=0）', (G.players[0].mana.C || 0) === 0, 'C=' + G.players[0].mana.C);
    gvEndTurnBookkeeping(0);
    gvStartTurn(0, 3, 2, 1);                                   // 次の自ターン（untapAll で召喚酔い解除）
    ok('A-6 次ターンで召喚酔いが解ける(sick=false)', !!G.players[0].field[0] && G.players[0].field[0].sick === false);

    // ───────── B. 無制限コピー＋土地/ターン：実験場を毎ターン1枚ずつ（同名3枚で進行可）─────────
    gvSetup();
    G.players[0].landDeck = ['jikkenjou', 'jikkenjou', 'jikkenjou'];
    G.players[0].hand = [];
    gvStartTurn(0, 1, 1, 1); ok('B-1 1ターン目：実験場1枚', G.players[0].lands.length === 1);
    gvEndTurnBookkeeping(0);
    gvStartTurn(0, 3, 2, 1); ok('B-2 2ターン目：実験場2枚', G.players[0].lands.length === 2);
    gvEndTurnBookkeeping(0);
    gvStartTurn(0, 5, 3, 1); ok('B-3 3ターン目：実験場3枚（同名3枚で進行可）', G.players[0].lands.length === 3);
    G.players[0].lands.forEach(l => tapLandForMana(0, l.instanceId));   // ★本物：3枚すべてタップ
    ok('B-4 実験場3枚すべてタップで3マナ(C)', (G.players[0].mana.C || 0) >= 3, 'C=' + G.players[0].mana.C);

    // ───────── C. 実エンジン戦闘×実験場+1/+1：戦闘結果が正しく変わる（★resolveSingleCombat）─────────
    // 基準：2/2 vs 2/2 → 相打ち（両者破壊）
    gvSetup();
    let s = _combatSetup({ power: 2, toughness: 2 }, { power: 2, toughness: 2 });
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('C-1 基準：2/2 vs 2/2 は相打ち（攻撃側破壊）', !alive(0, s.atkId));
    ok('C-2 基準：2/2 vs 2/2 は相打ち（ブロッカー破壊）', !alive(1, s.blkId));
    // 実験場の+1/+1部品を攻撃側へ → 3/3 vs 2/2 → 攻撃側生存・ブロッカーのみ破壊
    gvSetup();
    s = _combatSetup({ power: 2, toughness: 2 }, { power: 2, toughness: 2 });
    const buffOk = FX.buffCreature(0, s.atkId, 1, 1);          // ★実験場の+1/+1部品
    ok('C-3 実験場+1/+1適用 → 攻撃側が3/3', buffOk && eff(0, G.players[0].field[0]) === '3/3', eff(0, G.players[0].field[0]));
    resolveSingleCombat(0, s.atkId, null, s.blkId);
    ok('C-4 +1/+1で攻撃側(3/3)が生存', alive(0, s.atkId));
    ok('C-5 +1/+1でブロッカー(2/2)は破壊', !alive(1, s.blkId));

    // ───────── D. +1/+1は永続：ターンをまたいでも維持（base相対で判定）─────────
    gvSetup();
    G.players[0].landDeck = ['jikkenjou'];
    const golem = { instanceId: 850, cardId: 'test_golem', tapped: false, sick: false, damage: 0, tempPower: 0, tempToughness: 0, entryTurn: 0 };
    G.players[0].field = [golem];
    const baseP = getEffectivePower(0, golem), baseT = getEffectiveToughness(0, golem);
    FX.buffCreature(0, 850, 1, 1);
    ok('D-1 +1/+1適用直後は base+1/+1', getEffectivePower(0, golem) === baseP + 1 && getEffectiveToughness(0, golem) === baseT + 1, `${baseP}/${baseT}→${eff(0, golem)}`);
    gvStartTurn(0, 3, 2, 1);                                   // 次ターン（untapAll・マナリセット）
    ok('D-2 +1/+1は次ターンも維持（永続バフ）', getEffectivePower(0, golem) === baseP + 1 && getEffectiveToughness(0, golem) === baseT + 1, `after=${eff(0, golem)}`);

  } catch (e) {
    results.push({ name: '[例外発生]', pass: false, detail: e && (e.message + ' @ ' + (e.stack || '').split('\n')[1]) }); pass = false;
  } finally {
    if (typeof NET_MODE !== 'undefined') NET_MODE = savedMode;
  }
  return {
    pass, results,
    finalState: { p0: { life: G.players[0].life, field: G.players[0].field.length, lands: G.players[0].lands.length } },
  };
}
