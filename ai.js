
// ============================================================
// AI LOGIC
// ============================================================
function aiDoActivateChargedLand(landInstId) {
  const ai = G.players[1], opp = G.players[0];
  const land = ai.lands.find(l => l.instanceId === landInstId);
  if (!land || !land.chargeCard) return;
  const lc = CARD_DB[land.cardId];
  if (!lc.chargedAbility) return;

  if (lc.chargedAbility === 'look3keep1white') {
    if (land.tapped || !canAfford(1, {W:3})) return;
    land.tapped = true;
    payMana(1, {W:3});
    doLook3Keep1White(1);
    log(`AI ${lc.name}: 3ルック1(白)`);
    render();
  } else if (lc.chargedAbility === 'lookKeepWhite') {
    const n = lc.chargeLookCount || 3;
    if (land.tapped || !canAfford(1, {W:2})) return;
    land.tapped = true;
    payMana(1, {W:2});
    doLookKeepColored(1, n, 'W');
    log(`AI ${lc.name}: ${n}ルック1(白)`);
    render();
  } else if (lc.chargedAbility === 'damage3opponentDraw') {
    const idx = ai.lands.findIndex(l=>l.instanceId===landInstId);
    if (idx === -1) return;
    ai.lands.splice(idx,1);
    ai.landDeck.push(lc.id);
    if (land.chargeCard) { if (!ai.exile) ai.exile=[]; ai.exile.push(land.chargeCard); }
    log(`AI ${lc.name} 還元: 土地デッキ底へ`);
    const targets = opp.field;
    if (targets.length > 0) {
      showAIThinking(true);
      const tgt = mctsPickOption(targets, (sim, t) => {
        const s0 = sim.state.players[0];
        const st = s0.field.find(c=>c.id===t.instanceId);
        if (st) { st.damage+=3; sim.simCheckDeath(0); } else s0.life-=3;
      }) || targets[0];
      showAIThinking(false);
      applyDamageToCreature(0, tgt.instanceId, 3, 1);
      log(`AI ${lc.name} 還元: 3ダメージ → ${CARD_DB[tgt.cardId].name}`, 'damage');
    }
    drawCard(1);
    log(`AI ${lc.name} 還元: その後、1枚引く`);
    checkDeath(); render();
  } else if (lc.chargedAbility === 'buffWhiteCreatureDraw') {
    if (land.tapped) return;
    land.tapped = true;
    const whites = ai.field.filter(c=>CARD_DB[c.cardId].color==='W');
    if (whites.length > 0) {
      const tgt = whites.reduce((a,b)=>getEffectiveToughness(1,b)<getEffectiveToughness(1,a)?b:a);
      addPermanentBuff(1, tgt.instanceId, 0, 3);
      log(`AI ${lc.name}: 白クリーチャー+0/+3(永続)`);
    }
    drawCard(1);
    log(`AI ${lc.name}: その後、1枚引く`);
    render();
  } else if (lc.chargedAbility === 'kaizouReturn') {
    if (!isOCActive(1) || land.tapped) return;
    land.tapped = true;
    ai.mana.W = (ai.mana.W||0)+3;
    const idx = ai.lands.findIndex(l=>l.instanceId===landInstId);
    if (idx !== -1) { ai.lands.splice(idx,1); ai.landDeck.push(land.cardId); }
    log(`AI ${lc.name} 還元: WW追加、土地デッキ底へ`, 'heal');
    render();
  } else if (lc.chargedAbility === 'damage5opponent') {
    const idx = ai.lands.findIndex(l=>l.instanceId===landInstId);
    if (idx === -1) return;
    ai.lands.splice(idx,1);
    ai.landDeck.push(lc.id);
    if (land.chargeCard) { if (!ai.exile) ai.exile=[]; ai.exile.push(land.chargeCard); }
    log(`AI ${lc.name} 還元: 土地デッキ底へ`);
    const targets = opp.field;
    if (targets.length > 0) {
      showAIThinking(true);
      const tgt = mctsPickOption(targets, (sim, t) => {
        const s0 = sim.state.players[0];
        const st = s0.field.find(c=>c.id===t.instanceId);
        if (st) { st.damage+=5; sim.simCheckDeath(0); } else s0.life-=5;
      }) || targets[0];
      showAIThinking(false);
      applyDamageToCreature(0, tgt.instanceId, 5, 1);
      log(`AI ${lc.name} 還元: 5ダメージ → ${CARD_DB[tgt.cardId].name}`, 'damage');
    }
    checkDeath(); render();
  } else if (lc.chargedAbility === 'buffWhiteCreature') {
    if (land.tapped) return;
    land.tapped = true;
    const whites = ai.field.filter(c=>CARD_DB[c.cardId].color==='W');
    if (whites.length > 0) {
      const tgt = whites.reduce((a,b)=>getEffectiveToughness(1,b)<getEffectiveToughness(1,a)?b:a);
      addPermanentBuff(1, tgt.instanceId, 0, 2);
      log(`AI ${lc.name}: 白クリーチャー+0/+2(永続)`);
    }
    render();
  } else if (lc.chargedAbility === 'kaizouReturnGreen') {
    if (!isOCActive(1) || land.tapped) return;
    land.tapped = true;
    ai.mana.G = (ai.mana.G||0)+3;
    const idx = ai.lands.findIndex(l=>l.instanceId===landInstId);
    if (idx !== -1) { ai.lands.splice(idx,1); ai.landDeck.push(land.cardId); }
    log(`AI ${lc.name} 還元: 緑3追加、土地デッキ底へ`, 'heal');
    render();
  } else if (lc.chargedAbility === 'look3keep1green') {
    if (land.tapped || !canAfford(1, {G:3})) return;
    land.tapped = true;
    payMana(1, {G:3});
    doLookKeepColored(1, 3, 'G');
    log(`AI ${lc.name}: 3ルック1(緑)`);
    render();
  } else if (lc.chargedAbility === 'untapOtherLand') {
    if (land.tapped) return;
    land.tapped = true;
    const otherTapped = G.players[1].lands.filter(l => l.instanceId !== land.instanceId && l.tapped);
    if (otherTapped.length > 0) {
      otherTapped[0].tapped = false;
      log(`AI ${lc.name}: ${CARD_DB[otherTapped[0].cardId].name}をアンタップ`);
      render();
    }
  }
}

// 「タップ:+1/+1」土地（実験場）の最小AI運用。
// 自軍クリーチャーがいて、かつ他にアンタップ土地が残る（マナを確保できる）時だけ強化する。
// ※ AIのデフォルトデッキに実験場は無いため、通常対戦では何もしない（安全）。
function aiUseLandTapAbilities() {
  const ai = G.players[1];
  if (ai.field.length === 0) return;
  for (const land of ai.lands) {
    if (land.tapped) continue;
    const lc = CARD_DB[land.cardId];
    if (!lc || lc.tapAbility !== 'buffPlus11') continue;
    const untappedOther = ai.lands.filter(l => !l.tapped && l.instanceId !== land.instanceId).length;
    if (untappedOther < 1) break; // マナを最低1枚分は残す
    const tgt = ai.field.reduce((a, b) => getEffectivePower(1, b) > getEffectivePower(1, a) ? b : a);
    land.tapped = true;
    FX.buffCreature(1, tgt.instanceId, 1, 1); // 効果本体は部品に集約
    log('AI: 実験場で自分のクリーチャーを+1/+1', 'important');
  }
}

function aiActivateChargedLands() {
  const ai = G.players[1];
  for (const land of [...ai.lands]) {
    const lc = CARD_DB[land.cardId];
    if (!land.chargeCard || !lc.chargedAbility || land.tapped) continue;
    // kaizouReturn / kaizouReturnBlue requires OC
    if ((lc.chargedAbility === 'kaizouReturn' || lc.chargedAbility === 'kaizouReturnBlue' || lc.chargedAbility === 'kaizouReturnGreen') && !isOCActive(1)) continue;
    if (lc.chargedAbility === 'look3keep1green' && !canAfford(1, {G:3})) continue;
    // look3keep1white requires mana
    if (lc.chargedAbility === 'look3keep1white' && !canAfford(1, {W:3})) continue;
    if (lc.chargedAbility === 'lookKeepWhite' && !canAfford(1, {W:2})) continue;
    // look3keep1blue requires mana
    if (lc.chargedAbility === 'look3keep1blue' && !canAfford(1, {U:3})) continue;

    const landInstId = land.instanceId;
    showAIThinking(true);
    const best = mctsPickOption([{type:'skip'}, {type:'activate'}], (sim, opt) => {
      if (opt.type === 'skip') return;
      const p1 = sim.state.players[1], p0 = sim.state.players[0];
      const simLand = p1.lands.find(l=>l.instanceId===landInstId);
      if (!simLand || simLand.tapped) return;
      if (lc.chargedAbility === 'look3keep1white') {
        if (!sim.canAfford(p1,{W:3})) return;
        sim.payMana(p1,{W:1,C:3}); simLand.tapped=true;
        if (p1.deck.length) p1.hand.push(p1.deck.shift());
      } else if (lc.chargedAbility === 'kaizouReturn') {
        if (!sim.simIsOC(p1)||simLand.tapped) return;
        p1.mana.W=(p1.mana.W||0)+3;
        const ix=p1.lands.indexOf(simLand); if(ix!==-1){p1.lands.splice(ix,1);p1.landDeck.push(simLand.cardId);}
      } else if (lc.chargedAbility === 'damage5opponent') {
        const ix=p1.lands.indexOf(simLand); if(ix!==-1){p1.lands.splice(ix,1);p1.landDeck.push(lc.id);}
        if (p0.field.length){const t=p0.field.reduce((a,b)=>sim.hp(b)<sim.hp(a)?b:a);t.damage+=5;sim.simCheckDeath(0);}else p0.life-=5;
      } else if (lc.chargedAbility === 'buffWhiteCreature') {
        if (simLand.tapped) return; simLand.tapped=true;
        const ws=p1.field.filter(c=>CARD_DB[c.cardId].color==='W');
        if (ws.length){const t=ws.reduce((a,b)=>sim.hp(a)<sim.hp(b)?a:b);t.tempToughness=(t.tempToughness||0)+1;}
      } else if (lc.chargedAbility === 'lookKeepWhite') {
        if (!sim.canAfford(p1,{W:2})) return;
        sim.payMana(p1,{W:2}); simLand.tapped=true;
        if (p1.deck.length) p1.hand.push(p1.deck.shift());
      } else if (lc.chargedAbility === 'damage3opponentDraw') {
        const ix=p1.lands.indexOf(simLand); if(ix!==-1){p1.lands.splice(ix,1);p1.landDeck.push(lc.id);}
        if (p0.field.length){const t=p0.field.reduce((a,b)=>sim.hp(b)<sim.hp(a)?b:a);t.damage+=3;sim.simCheckDeath(0);}else p0.life-=3;
        if (p1.deck.length) p1.hand.push(p1.deck.shift());
      } else if (lc.chargedAbility === 'buffWhiteCreatureDraw') {
        if (simLand.tapped) return; simLand.tapped=true;
        const ws=p1.field.filter(c=>CARD_DB[c.cardId].color==='W');
        if (ws.length){const t=ws.reduce((a,b)=>sim.hp(a)<sim.hp(b)?a:b);t.tempToughness=(t.tempToughness||0)+1;}
        if (p1.deck.length) p1.hand.push(p1.deck.shift());
      } else if (lc.chargedAbility === 'look3keep1blue') {
        if (!sim.canAfford(p1,{U:3})) return;
        sim.payMana(p1,{U:3}); simLand.tapped=true;
        if (p1.deck.length) p1.hand.push(p1.deck.shift());
      } else if (lc.chargedAbility === 'kaizouReturnBlue') {
        if (!sim.simIsOC(p1)||simLand.tapped) return;
        p1.mana.U=(p1.mana.U||0)+3;
        const ix=p1.lands.indexOf(simLand); if(ix!==-1){p1.lands.splice(ix,1);p1.landDeck.push(lc.id);}
      } else if (lc.chargedAbility === 'giveDrawTriggerBlue') {
        if (simLand.tapped) return; simLand.tapped=true;
        // grant draw trigger: in sim, approximate as +0.5 hand advantage
        if (p1.field.length) p1.hand.push(p1.deck.length?p1.deck.shift():'');
      }
    });
    showAIThinking(false);
    if (best && best.type === 'activate') aiDoActivateChargedLand(landInstId);
  }
}

// 盾撃(クイック)を構えるために土地を1枚残すか、混合戦略で決める。
// 目的:
//  (1) ブラフ — 盾撃を持たない時も一定確率で構える／持っていても時々タップアウトする。
//      → 「土地を残す＝盾撃所持」と読まれなくなる（筒抜け防止）。
//  (2) 相手の展開への備え — 相手の場に今は攻撃役がいなくても、盾撃を持つ時は中確率で
//      マナを残し、相手が次のターンに展開してから反応できるようにする。
// 戻り値: 残すW土地（land）、または残さないなら null。
// ※ これは実プレイ専用のかく乱層。シミュレータ(simShouldHoldForQuick)は素の価値評価のため変えない。
function aiDecideManaHold() {
  const ai = G.players[1], opp = G.players[0];
  const untapped = ai.lands.filter(l => !l.tapped);
  const wLand = untapped.find(l => CARD_DB[l.cardId].produces === 'W'); // 盾撃の色=W
  if (!wLand || untapped.length < 2) return null; // 残すと展開できない／色が合わない
  const oppHasAttacker = opp.field.some(c => { const cd = CARD_DB[c.cardId]; return cd && ((cd.power||0)+(c.tempPower||0)) > 0; });
  const hasQuick = ai.hand.some(cid => { const c = CARD_DB[cid]; return c && c.keywords && c.keywords.includes('Quick'); });
  // 1枚残すと出せなくなる重要クリーチャーがあるか（あれば展開を優先しやすくする）
  const manaAfterHold = untapped.length - 1;
  const blocksKeyPlay = ai.hand.some(cid => {
    const c = CARD_DB[cid];
    return c && c.type === 'creature' && (typeof totalCost === 'function') &&
           totalCost(c.cost) > manaAfterHold && totalCost(c.cost) <= untapped.length;
  });
  let p;
  if (hasQuick) {
    // 本当に盾撃を持つ: 攻撃役がいれば高確率。いなくても相手の展開に備えて中確率で構える。
    // たまにタップアウトして「持っていない」ように見せる。
    p = oppHasAttacker ? 0.85 : 0.55;
  } else {
    // ブラフ: 攻撃役がいる時ほど警戒させる価値が高い。いない時も時々構えて筒抜けを防ぐ。
    p = oppHasAttacker ? 0.32 : 0.14;
  }
  if (blocksKeyPlay) p *= 0.4; // 展開を犠牲にしてまで構えるのは控える
  return (Math.random() < p) ? wLand : null;
}

// D. AI思考表示: カードを使う理由を盤面の状況から短い言葉にする
function aiCardPlayReason(card, aiIdx) {
  const me = G.players[aiIdx], foe = G.players[1 - aiIdx];
  if (card.type === 'spell') {
    return foe.field.length > 0 ? '相手の盤面に対処するため使用' : '有利を広げるため使用';
  }
  if (me.field.length < foe.field.length) return '盤面の数で負けているため展開';
  if (me.life < foe.life) return 'ライフで劣勢のため戦力を追加';
  return '盤面をさらに強化';
}

function aiTurn() {
  if (G.phase === 'ended') return;
  // 観戦モード対応：現在のアクティブプレイヤーのAI処理を実行
  const aiIdx = SPECTATOR_MODE ? G.activePlayer : 1;
  const ai = G.players[aiIdx];
  log('AIのターン...', 'important');

  // 盾撃(クイック)を構えるためのマナ保留（混合戦略：ブラフ＋相手展開への備え）。
  // どの理由で残したかはログに出さない＝手の内/ブラフを相手に露呈しない。
  let landsToTap = ai.lands.filter(l => !l.tapped);
  const holdLand = aiDecideManaHold();
  if (holdLand) landsToTap = landsToTap.filter(l => l !== holdLand);
  landsToTap.forEach(land => tapLandForMana(1, land.instanceId));

  // チャージ決定: MCTSで評価
  if (!G.chargeUsedThisTurn) {
    const validLands = ai.lands.filter(l => !l.chargeCard);
    if (validLands.length > 0 && ai.hand.length > 0) {
      const chargeOptions = [{type:'noCharge'}];
      ai.hand.forEach((cid, hi) => {
        validLands.slice(0,2).forEach(land => {
          chargeOptions.push({type:'charge', handIdx:hi, cardId:cid, landInstId:land.instanceId});
        });
      });
      showAIThinking(true);
      const bestCharge = mctsPickOption(chargeOptions, (sim, opt) => {
        if (opt.type === 'noCharge') return;
        const p1 = sim.state.players[1];
        const simLand = p1.lands.find(l => l.instanceId === opt.landInstId);
        if (!simLand) return;
        const hi = p1.hand.indexOf(opt.cardId);
        if (hi === -1) return;
        p1.hand.splice(hi, 1);
        simLand.chargeCard = opt.cardId;
        const lc = CARD_DB[simLand.cardId];
        if (lc.chargeDrawTrigger && p1.deck.length) p1.hand.push(p1.deck.shift());
      });
      showAIThinking(false);
      if (bestCharge && bestCharge.type === 'charge') {
        const hi = ai.hand.indexOf(bestCharge.cardId);
        if (hi !== -1) aiDoCharge(hi, bestCharge.landInstId);
      }
    }
  }

  // チャージ済み土地の起動能力を評価・使用
  aiActivateChargedLands();
  // 「タップ:+1/+1」土地（実験場）の最小運用（実験場が場に無ければ何もしない）
  aiUseLandTapAbilities();

  // 改善8: 局面に応じた時間でMCTS実行
  showAIThinking(true);
  const mctsPlays = mctsSearch(mctsTimeBudget());
  showAIThinking(false);
  let aiPlayedCard = false;

  // MCTSが推奨するカードを順に試みる
  for (const cardIdToPlay of mctsPlays) {
    const idx = ai.hand.indexOf(cardIdToPlay);
    if (idx === -1) continue;
    const cid = ai.hand[idx];
    const card = CARD_DB[cid];
    if (!canAfford(1, card.cost)) continue;
    if (card.type === 'creature' && ai.field.length < 5) {
      payMana(1, card.cost);
      ai.hand.splice(idx, 1);
      const inst = newInstance(cid);
      inst.sick = true; inst.entryTurn = G.turn;
      log(`AI: ${card.name} をスタックに積んだ`);
      aiThink(`${card.name}: ${aiCardPlayReason(card, aiIdx)}`);
      showAIBalloon(`${card.icon} ${card.name} 召喚！`);
      G.stack.push({ name: card.name, icon: card.icon||'⚔️', owner: 1, resolve: () => {
        if (ai.field.length >= 5) { ai.graveyard.push(cid); return; }
        _enteringInstIds.add(inst.instanceId);
        ai.field.push(inst);
        log(`AI: ${card.name} が場に出た`, 'important');
        fireETB(1, inst.instanceId);
        render();
      }});
      renderStack(); render();
      aiPlayedCard = true;
    } else if (card.type === 'spell') {
      payMana(1, card.cost);
      ai.hand.splice(idx, 1);
      showAIBalloon(`${card.icon} ${card.name} 使用！`);
      log(`AI: ${card.name} をスタックに積んだ`);
      aiThink(`${card.name}: ${aiCardPlayReason(card, aiIdx)}`);
      G.stack.push({ name: card.name, icon: card.icon||'✨', owner: 1, resolve: () => {
        ai.graveyard.push(cid);
        aiPlaySpellEffect(card);
      }});
      renderStack(); render();
      aiPlayedCard = true;
    }
  }

  // MCTSが見つからなかった場合のフォールバック（従来のgreedyを使用）
  if (!aiPlayedCard) {
    const playable = ai.hand.map((cid, i) => ({cid, i, card: CARD_DB[cid]}))
      .filter(({card}) => card.type !== 'land' && canAfford(1, card.cost));
    // aiPickBestCardはレート戦の手加減でnullを返すことがある（その場合はプレイしない）
    const picked = playable.length > 0 ? aiPickBestCard(playable) : null;
    if (picked) {
      const {cid, i, card} = picked;
      if (card.type === 'creature' && ai.field.length < 5) {
        payMana(1, card.cost); ai.hand.splice(i, 1);
        const inst = newInstance(cid); inst.sick = true; inst.entryTurn = G.turn;
        log(`AI: ${card.name} をスタックに積んだ`);
        aiThink(`${card.name}: ${aiCardPlayReason(card, aiIdx)}`);
        showAIBalloon(`${card.icon} ${card.name} 召喚！`);
        G.stack.push({ name: card.name, icon: card.icon||'⚔️', owner: 1, resolve: () => {
          if (ai.field.length >= 5) { ai.graveyard.push(cid); return; }
          _enteringInstIds.add(inst.instanceId); ai.field.push(inst);
          log(`AI: ${card.name} が場に出た`, 'important');
          fireETB(1, inst.instanceId); render();
        }});
        renderStack(); render(); aiPlayedCard = true;
      } else if (card.type === 'spell') {
        payMana(1, card.cost); ai.hand.splice(i, 1);
        showAIBalloon(`${card.icon} ${card.name} 使用！`);
        log(`AI: ${card.name} をスタックに積んだ`);
        aiThink(`${card.name}: ${aiCardPlayReason(card, aiIdx)}`);
        G.stack.push({ name: card.name, icon: card.icon||'✨', owner: 1, resolve: () => {
          ai.graveyard.push(cid); aiPlaySpellEffect(card);
        }});
        renderStack(); render(); aiPlayedCard = true;
      }
    }
  }

  if (aiPlayedCard) {
    openPriorityWindow(0, () => setTimeout(() => aiAttack(), 300), 'AIのプレイに対応');
  } else {
    setTimeout(() => { aiAttack(); }, 600);
  }
}

function aiDoCharge(handIdx, landInstId) {
  const aiIdx = SPECTATOR_MODE ? G.activePlayer : 1;
  const ai = G.players[aiIdx];
  const land = ai.lands.find(l => l.instanceId === landInstId);
  if (!land || land.chargeCard) return;
  if (handIdx < 0 || handIdx >= ai.hand.length) return;
  const cardId = ai.hand[handIdx];
  ai.hand.splice(handIdx, 1);
  land.chargeCard = cardId;
  land.tapped = false;
  G.chargeUsedThisTurn = true;
  const landCard = CARD_DB[land.cardId];
  if (landCard.chargeDrawTrigger) { drawCard(1); log(`${landCard.name}: カードを1枚引く`); }
  log(`AI チャージ: ${CARD_DB[cardId].name} を ${landCard.name} に置いた`);
  showAIBalloon(`⚡ チャージ: ${CARD_DB[cardId].name}`);
}

function totalCost(cost) {
  return Object.values(cost).reduce((a,b)=>a+b,0);
}

// 直接ダメージ呪文の対象選択: damageで「倒せる」相手の中で最大パワーを返す。
// 倒せる相手がいなければ null（呼び出し側で本体ダメージ/最大パワーへフォールバック）。
// これにより「倒せない大型に無駄撃ち」を避け、倒せる最大の脅威を除去する。
function aiBestKillableTarget(defenderPlayer, damage, candidates) {
  const field = candidates || G.players[defenderPlayer].field;
  const killable = field.filter(c => (getEffectiveToughness(defenderPlayer, c) - (c.damage || 0)) <= damage);
  if (!killable.length) return null;
  return killable.reduce((a, b) => getEffectivePower(defenderPlayer, b) > getEffectivePower(defenderPlayer, a) ? b : a);
}

// Apply only the effect of an AI spell (mana/hand already handled separately)
function aiPlaySpellEffect(card) {
  const aiIdx = SPECTATOR_MODE ? G.activePlayer : 1;
  const ai = G.players[aiIdx];
  const player = G.players[1 - aiIdx];

  if (card.effect === 'junigeki') {
    // 対象選択(AI受け): ■1=MCTSで相手クリーチャー / ■2=最も危険(低タフネス)な自クリーチャー。
    // 効果適用は CARD_EFFECTS.junigeki.apply に集約。
    // ※旧実装はここで「追加ダメージ」を与えており、カード(2ダメージ+0/+1のみ)と食い違うバグだった→排除。
    const targets = player.field;
    let oppTargetId = null, allyTargetId = null;
    if (targets.length > 0) {
      const tgt = mctsPickOption(targets, (sim, t) => {
        const p0 = sim.state.players[0], p1 = sim.state.players[1];
        const simTgt = p0.field.find(c => c.id === t.instanceId);
        if (simTgt) simTgt.damage += 2;
        else p0.life -= 2;
        if (p1.field.length > 0) {
          const ally = p1.field.reduce((a,b) => sim.hp(a) < sim.hp(b) ? a : b);
          ally.tempToughness = (ally.tempToughness||0)+1;
        }
      }) || targets[0];
      oppTargetId = tgt.instanceId;
      log(`AI: ${card.name} でプレイヤークリーチャーに2ダメージ`, 'damage');
    }
    if (ai.field.length > 0) {
      const ally = ai.field.reduce((a,b) => getEffectiveToughness(1,b) < getEffectiveToughness(1,a) ? b : a);
      allyTargetId = ally.instanceId;
      log(`AI: ${card.name} ■2: 自クリーチャー+0/+1(永続)`, 'damage');
    }
    CARD_EFFECTS.junigeki.apply(1, { oppTargetId, allyTargetId });
  } else if (card.effect === 'kaizen') {
    aiKaizenEffects();
  } else if (card.effect === 'raigeki') {
    // 対象選択(AI): 倒せる中で最大パワー（倒せなければ最大パワー）。効果は CARD_EFFECTS に集約。
    let oppTargetId = null;
    if (player.field.length > 0) {
      const t = aiBestKillableTarget(0, 2) || player.field.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      oppTargetId = t.instanceId;
      log(`AI: ${card.name} で相手クリーチャーに2ダメージ`, 'damage');
    } else { log(`AI: ${card.name} 対象なし → 1枚引く`); }
    CARD_EFFECTS.raigeki.apply(1, { oppTargetId });
  } else if (card.effect === 'akageki') {
    const killable = aiBestKillableTarget(0, 2); // 倒せる中で最大パワー
    if (killable) { applyDamageToCreature(0, killable.instanceId, 2, 1); log(`AI: ${card.name} で相手クリーチャーに2ダメージ`,'damage'); }
    else { player.life -= 2; showLifeChange(0,-2); log(`AI: ${card.name} で相手プレイヤーに2ダメージ`,'damage'); }
  } else if (card.effect === 'iegeki') {
    const killable = aiBestKillableTarget(0, 5); // 倒せる中で最大パワー
    if (killable) { applyDamageToCreature(0, killable.instanceId, 5, 1); log(`AI: ${card.name} で相手クリーチャーに5ダメージ`,'damage'); }
    else { player.life -= 5; showLifeChange(0,-5); log(`AI: ${card.name} で相手プレイヤーに5ダメージ`,'damage'); }
    if (isOCActive(1)) iegekiOCDeploy(1);
  } else if (card.effect === 'ao_geki') {
    drawCard(1); log(`AI: ${card.name} で1枚引く`);
    const targets = player.field.filter(c => { const cc=CARD_DB[c.cardId]; return !cc.cost || Object.values(cc.cost).reduce((a,b)=>a+b,0)<=4; });
    if (targets.length > 0) {
      // 対象(コスト4以下)の中で「倒せる最大パワー」を優先（倒せなければ最大パワー）
      const t = aiBestKillableTarget(0, 2, targets) || targets.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      applyDamageToCreature(0, t.instanceId, 2, 1);
      log(`AI: ${card.name} で相手クリーチャーに2ダメージ`,'damage');
    }
  } else if (card.effect === 'mizu_geki') {
    if (player.field.length > 0) {
      const t = player.field.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      _bounceCreature(0, t.instanceId);
      log(`AI: ${card.name} で${CARD_DB[t.cardId].name}を手札に戻す`);
    }
  } else if (card.effect === 'chishiki_no_seiri') {
    drawCard(1); log(`AI: ${card.name} で1枚引く`);
  } else if (card.effect === 'kurogeki') {
    // 黒撃: クリーチャー破壊（最大パワー優先）
    let oppTargetId = null;
    if (player.field.length > 0) {
      const t = aiBestKillableTarget(0, 999) || player.field.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      oppTargetId = t.instanceId;
      log(`AI: ${card.name} で${CARD_DB[t.cardId].name}を破壊`, 'damage');
    }
    CARD_EFFECTS.kurogeki.apply(1, { oppTargetId });
  } else if (card.effect === 'shigoeki') {
    // 死越撃: クリーチャー破壊 + mill5
    let oppTargetId = null;
    if (player.field.length > 0) {
      const t = aiBestKillableTarget(0, 999) || player.field.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      oppTargetId = t.instanceId;
      log(`AI: ${card.name} で${CARD_DB[t.cardId].name}を破壊`, 'damage');
    }
    FX.mill(1, 5);
    log(`AI: ${card.name} で山札から5枚墓地へ`);
    CARD_EFFECTS.shigoeki.apply(1, { oppTargetId });
  } else if (card.effect === 'kaitaku1spell' || card.id === 'tami_kaitaku') {
    // 民による開拓: 開拓:1
    CARD_EFFECTS.tami_kaitaku.apply(1, {});
    log(`AI: ${card.name} で開拓:1`);
  } else if (card.effect === 'mori_kansha' || card.id === 'mori_kansha') {
    // 森への感謝: 土地数分ダメージ + 開拓:1
    let oppTargetId = null;
    if (player.field.length > 0) {
      const t = player.field.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      oppTargetId = t.instanceId;
      const landCount = ai.lands.length;
      log(`AI: ${card.name} で土地${landCount}枚分のダメージ`, 'damage');
    }
    CARD_EFFECTS.mori_kansha.apply(1, { oppTargetId });
  } else {
    log(`AI: ${card.name} を使用`);
  }
  checkDeath();
}

// AI介善: ■効果を上から順に処理（5ダメージx2→ダメージ死亡無効→OC展開）
function aiKaizenEffects() {
  const aiIdx = SPECTATOR_MODE ? G.activePlayer : 1;
  const ai = G.players[aiIdx];
  const player = G.players[1 - aiIdx];
  const ocAtCast = isOCActive(aiIdx);
  const total = ocAtCast ? 2 : 1;
  // 相手クリーチャー1体に5ダメージ
  if (player.field.length > 0) {
    const tgt1 = mctsPickOption(player.field, (sim, t) => {
      const p0 = sim.state.players[1 - aiIdx];
      const simTgt = p0.field.find(c => c.id === t.instanceId);
      if (simTgt) { simTgt.damage += 5; sim.simCheckDeath(1 - aiIdx); }
      else p0.life -= 5;
    }) || player.field[0];
    showEffectStep('AI 介入する剣閃', '1', total, `5ダメージ → ${CARD_DB[tgt1.cardId].name}`);
    applyDamageToCreature(1 - aiIdx, tgt1.instanceId, 5, aiIdx);
  } else {
    log(`AI 介入する剣閃 効果1/${total}: 対象なしのためスキップ`);
  }
  // OC: クリーチャー展開
  if (ocAtCast) {
    showEffectStep('AI 介入する剣閃', 'OC', total, '〈OC〉クリーチャー展開');
    kaizenOCDeploy(aiIdx);
  }
}

function aiPlaySpell(card, handIndex) {
  const ai = G.players[1];
  const player = G.players[0];
  payMana(1, card.cost);
  ai.hand.splice(handIndex, 1);
  ai.graveyard.push(card.id);

  if (card.effect === 'junigeki') {
    // 対象選択(AI攻め): ■1=倒せる中で最大パワー / ■2=最もタフネスの高い自クリーチャー。
    // 効果適用は CARD_EFFECTS.junigeki.apply に集約（旧実装の追加ダメージ＝バグを排除）。
    const targets = player.field;
    let oppTargetId = null, allyTargetId = null;
    if (targets.length > 0) {
      const tgt = aiBestKillableTarget(0, 2) || targets.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
      oppTargetId = tgt.instanceId;
      log(`AI: ${card.name} でプレイヤークリーチャーに2ダメージ`, 'damage');
    }
    if (ai.field.length > 0) {
      const ally = ai.field.reduce((a,b)=>getEffectiveToughness(1,b)>getEffectiveToughness(1,a)?b:a);
      allyTargetId = ally.instanceId;
      log(`AI: ${card.name} ■2: 自クリーチャー+0/+1(永続)`, 'damage');
    }
    CARD_EFFECTS.junigeki.apply(1, { oppTargetId, allyTargetId });
  } else if (card.effect === 'kaizen') {
    aiKaizenEffects();
  } else {
    log(`AI: ${card.name} を使用`);
  }
  checkDeath();
}

// 攻撃の損得を評価: この攻撃者で攻撃する価値があるか
function aiShouldAttack(atkInst) {
  const w = AI_WEIGHTS;
  const ai = G.players[1];
  const player = G.players[0];
  const atkPow = getEffectivePower(1, atkInst);
  const atkTou = getEffectiveToughness(1, atkInst);

  // ブロック可能なプレイヤークリーチャーを列挙
  const blockers = player.field.filter(c => {
    const bc = CARD_DB[c.cardId];
    return (!c.tapped || (bc.ocBlockWhileTapped && isOCActive(0))) && canFlyBlock(atkInst, c);
  });
  if (blockers.length === 0) return true; // ブロッカーなし→直接ダメージは常に得

  // 最悪ケース: プレイヤーが最も有利なブロックをすると想定
  let worstTrade = Infinity;
  blockers.forEach(blk => {
    const blkPow = getEffectivePower(0, blk);
    const blkTou = getEffectiveToughness(0, blk);
    const iDie = (atkTou - atkInst.damage) <= blkPow;
    const blkDies = (blkTou - blk.damage) <= atkPow;
    // トレード価値: 相手を倒すゲイン - 自分が死ぬ損失
    const trade = (blkDies ? w.fieldPower*blkPow + w.fieldCount : 0)
                - (iDie    ? w.fieldPower*atkPow + w.fieldCount : 0);
    if (trade < worstTrade) worstTrade = trade;
  });

  // 防御的判断: AI のライフが低いなら慎重に
  const lifeRatio = ai.life / 20;
  const defensiveThreshold = lifeRatio < 0.5 ? 1.0 : (lifeRatio < 0.75 ? 0.5 : -0.5);

  // 修正バイアス: 無謀な攻撃を削減（attackBias = 0 に近づける）
  const minimalBias = (w.attackBias || 0) * 0.3; // 攻撃バイアスを 30% に削減

  return worstTrade + minimalBias * atkPow >= defensiveThreshold;
}

function aiAttack() {
  if (G.phase === 'ended') return;
  // Build attacker queue
  const ai = G.players[1];
  const player = G.players[0];
  const candidates = [];
  ai.field.forEach(c => {
    const card = CARD_DB[c.cardId];
    if (G.cantAttackPermanent.has(c.instanceId)) return;
    if (c.tapped && !card.vigilance) return;
    if (c.sick) {
      if (card.haste) { candidates.push(c); return; }
      if (card.kakutou && c.entryTurn === G.turn && player.field.length > 0) candidates.push(c);
      return;
    }
    candidates.push(c);
  });

  if (candidates.length === 0) { setTimeout(() => endTurnAfterMainPhase(), 300); return; }

  // リーサル判定: 全員攻撃の合計パワーがブロック後でも相手ライフを超えるなら総攻撃
  const totalPow = candidates.reduce((s,c)=>s+getEffectivePower(1,c),0);
  const untappedBlockers = player.field.filter(c=>!c.tapped).length;
  // ブロッカー1体につき最大1体の攻撃が止まる前提の保守的リーサル計算
  const sorted = [...candidates].sort((a,b)=>getEffectivePower(1,a)-getEffectivePower(1,b));
  const blockedPow = sorted.slice(0, untappedBlockers).reduce((s,c)=>s+getEffectivePower(1,c),0);
  const isLethal = (totalPow - blockedPow) >= player.life;

  // リーサルなら全員攻撃、そうでなければMCTSで攻撃者を選択
  let attackerInsts;
  // 相手の盤面が空＝ブロッカーも反撃も無い → 攻撃可能な全クリーチャーで殴る（タダ働きの打点を逃さない）。
  // これが無いと、AIは大型(例:6/5)を温存して飛行1点だけで削る“遅すぎる”試合運びになり、
  // 能動的な相手にレースで負ける主要因になっていた。
  const oppOpenBoard = player.field.length === 0;
  if (oppOpenBoard) {
    attackerInsts = candidates;
  } else if (isLethal) {
    attackerInsts = candidates;
  } else {
    // 出たターンのカクトウクリーチャーはMCTS評価が不正確なため必ず格闘を試みる
    const kakutouMust = candidates.filter(c => {
      const cd = CARD_DB[c.cardId];
      return c.sick && cd.kakutou && c.entryTurn === G.turn;
    });
    const mustAtk = [...candidates.filter(c => c.mustAttack), ...kakutouMust.filter(c => !c.mustAttack)];
    const optional = candidates.filter(c => !c.mustAttack && !(c.sick && CARD_DB[c.cardId].kakutou && c.entryTurn === G.turn));
    // MCTSで最善の攻撃者セットを決定（mustAttackは強制含む）
    showAIThinking(true);
    const mctsSet = mctsPickAttackers(optional);
    showAIThinking(false);
    attackerInsts = [...mustAtk, ...optional.filter(c => mctsSet.has(c.instanceId))];
  }

  if (attackerInsts.length === 0) { setTimeout(() => endTurnAfterMainPhase(), 300); return; }

  // 裏目ケア: 相手の返し札（僧侶の攻撃時誘発・構えたクイック呪文・返しの総攻撃）を
  // 織り込んで攻撃者を絞る。リーサル時はケア不要で全力。
  if (typeof applyUrameCare === 'function') {
    const care = applyUrameCare(attackerInsts, 1, isLethal);
    care.notes.forEach(n => aiThink(n));
    attackerInsts = care.attackers;
    if (attackerInsts.length === 0) {
      aiThink('裏目ケアの結果、今ターンの攻撃は見送り（安全優先）');
      setTimeout(() => endTurnAfterMainPhase(), 300);
      return;
    }
  }

  // Phase B: Hard Constraints（攻撃の妥当性チェック）
  if (!isLethal && !oppOpenBoard && typeof validateAttackDecision === 'function') {
    if (!validateAttackDecision(attackerInsts, 1)) {
      // 攻撃禁止: 無意味な攻撃と判定
      aiThink('⚠️ Hard Constraints: ダメージが不十分なため攻撃を回避（ターン温存）');
      setTimeout(() => endTurnAfterMainPhase(), 300);
      return;
    }
  }

  // D. AI思考表示: 攻撃方針の理由
  if (isLethal) aiThink(`このターンで倒し切れると計算（合計パワー${totalPow}）→ 総攻撃！`);
  else if (oppOpenBoard) aiThink('相手の場が空なので全員で攻撃（ノーリスクで打点を稼ぐ）');
  else if (attackerInsts.length < candidates.length) aiThink(`攻撃できる${candidates.length}体のうち${attackerInsts.length}体で攻撃（残りは守りに温存）`);
  else aiThink('シミュレーションの結果、全員攻撃が最善と判断');

  showAIBalloon(isLethal ? '💀 総攻撃！' : '⚔️ 攻撃宣言！');
  const orderedAttackers = isLethal ? attackerInsts : mctsOrderAttackers(attackerInsts);
  G._aiAttackQueue = orderedAttackers.map(c => c.instanceId);
  setTimeout(() => continueAIAttack(), 400);
}

function continueAIAttack() {
  if (G.phase === 'ended') return;
  if (!G._aiAttackQueue || G._aiAttackQueue.length === 0) {
    setTimeout(() => endTurnAfterMainPhase(), 300);
    return;
  }
  const atkInstId = G._aiAttackQueue.shift();
  const ai = G.players[1];
  const player = G.players[0];
  const atkInst = ai.field.find(c => c.instanceId === atkInstId);
  if (!atkInst) { setTimeout(() => continueAIAttack(), 100); return; }
  const card = CARD_DB[atkInst.cardId];
  if (!card.vigilance) atkInst.tapped = true;

  // アレスティア passive: AI攻撃時、プレイヤーがアレスティアを持っていれば全クリーチャー+1/+1
  const playerHasArestia = G.players[0].field.some(c => CARD_DB[c.cardId].id === 'arestia');
  if (playerHasArestia) {
    G.players[0].field.forEach(c => addPermanentBuff(0, c.instanceId, 1, 1));
    log('アレスティア: 全クリーチャー+1/+1（永続）');
  }

  // 格闘
  if (card.kakutou && atkInst.entryTurn === G.turn) {
    const reachable = player.field.filter(pc => card.flying || !CARD_DB[pc.cardId].flying);
    if (reachable.length === 0) {
      log(`AI ${card.name} 格闘: 対象なし`);
      G.combatArrows = [];
      render();
      setTimeout(() => continueAIAttack(), 400);
      return;
    }
    const tgt = reachable.reduce((a,b)=>getEffectivePower(0,b)>getEffectivePower(0,a)?b:a);
    const tgtId = tgt.instanceId;
    log(`AI ${card.name} 格闘 → ${CARD_DB[tgt.cardId].name}`);
    aiThink(`格闘: いちばんパワーが高い「${CARD_DB[tgt.cardId].name}」を狙って脅威を減らす`);
    G.combatArrows = [{fromId: atkInstId, toId: tgtId, color: '#ff4444'}];
    render();
    openPriorityWindow(0, () => {
      const aAlive = G.players[1].field.find(c => c.instanceId === atkInstId);
      const tAlive = G.players[0].field.find(c => c.instanceId === tgtId);
      if (!aAlive || !tAlive) {
        log('格闘: クリーチャーが破壊されたため攻撃中止');
        G.combatArrows = []; render();
        setTimeout(() => continueAIAttack(), 300);
        return;
      }
      // 格闘対象以外のクリーチャーはブロック可能: プレイヤーにブロック機会を与える
      const eligibleBlockers = player.field.filter(c => {
        if (c.instanceId === tgtId) return false; // 格闘対象はブロック不可
        const bc = CARD_DB[c.cardId];
        return (!c.tapped || (bc.ocBlockWhileTapped && isOCActive(0))) && canFlyBlock(atkInst, c);
      });
      if (eligibleBlockers.length === 0) {
        resolveSingleCombat(1, atkInstId, tgtId, null);
        return;
      }
      G.aiCurrentAttackers = [{instId: atkInstId, targetType:'creature', targetInstId: tgtId}];
      G.playerBlockMode = true;
      G.playerBlockDefender = 0;
      G.playerBlockAssignments = {};
      G.selectedBlockerToAssign = null;
      G.directlyAttackedCreatures.add(tgtId); // 格闘対象はブロッカーに選べない
      log(`--- ${card.name} の格闘に対してブロッカーを宣言可能（格闘対象以外）→「ブロック確定」 ---`, 'important');
      render(); updateHints();
    }, '格闘宣言に対応');
    return;
  }

  // Normal: open priority window for player before blocker phase
  log(`AI ${card.name} が攻撃宣言`);
  fireAttackTriggers(1, atkInstId);
  G.combatArrows = [{fromId: atkInstId, toId: null, color: '#ff8800'}];
  render();
  openPriorityWindow(0, () => {
    const stillAlive = G.players[1].field.find(c => c.instanceId === atkInstId);
    if (!stillAlive) {
      log('攻撃クリーチャーが破壊されたため攻撃中止');
      G.combatArrows = []; render();
      setTimeout(() => continueAIAttack(), 300);
      return;
    }
    const eligibleBlockers = player.field.filter(c => {
      const bc = CARD_DB[c.cardId];
      return (!c.tapped || (bc.ocBlockWhileTapped && isOCActive(0))) && canFlyBlock(atkInst, c);
    });
    if (eligibleBlockers.length === 0) {
      resolveSingleCombat(1, atkInstId, null, null);
      return;
    }
    // Player block phase for this single attacker
    G.aiCurrentAttackers = [{instId: atkInstId, targetType:'player', targetInstId:null}];
    G.playerBlockMode = true;
    G.playerBlockDefender = 1 - G.activePlayer; // defender is the non-active player
    G.playerBlockAssignments = {};
    G.selectedBlockerToAssign = null;
    log(`--- ${card.name} に対してブロッカーを宣言（任意）→「ブロック確定」 ---`, 'important');
    render(); updateHints();
  }, '攻撃宣言に対応');
}

function resolveAICombat() {
  if (G.phase === 'ended') return;
  // Single-attacker block confirmed: get the one queued attacker
  const {instId: atkId, targetType, targetInstId} = G.aiCurrentAttackers[0] || {};
  const blkId = atkId ? G.playerBlockAssignments[atkId] : null;
  // ホットシート格闘では攻撃側がP0の場合もある
  const atkP = (G._pendingBlockAtkP !== undefined && G._pendingBlockAtkP !== null) ? G._pendingBlockAtkP : 1;
  G._pendingBlockAtkP = null;

  G.playerBlockMode = false;
  G.aiCurrentAttackers = [];
  G.playerBlockAssignments = {};
  G.selectedBlockerToAssign = null;
  G.combatArrows = [];
  G.directlyAttackedCreatures.clear();

  if (blkId) {
    // ブロック成立: 攻撃者vsブロッカー（格闘対象は守られた）
    resolveSingleCombat(atkP, atkId, null, blkId);
  } else if (targetType === 'creature' && targetInstId) {
    // 格闘: ブロックされなかったので対象と戦闘
    resolveSingleCombat(atkP, atkId, targetInstId, null);
  } else {
    resolveSingleCombat(atkP, atkId, null, null);
  }
}

// ============================================================
// 観戦モード表示サポート
// ============================================================
function updateSpectatorDisplay() {
  if (!SPECTATOR_MODE || !G) return;

  const vp = SPECTATOR_VIEWPOINT;
  const playerLabel = document.querySelector('#player-avatar .avatar-label');
  const aiLabel = document.querySelector('#opp-avatar .avatar-label');

  if (vp === 0) {
    // P1視点: 下がP1(自分), 上がP2(相手)
    if (playerLabel) playerLabel.textContent = '📍 P1（自分の視点）';
    if (aiLabel) aiLabel.textContent = '👁️ P2';
  } else {
    // P2視点: 上がP2(自分), 下がP1(相手)
    if (playerLabel) playerLabel.textContent = '👁️ P1';
    if (aiLabel) aiLabel.textContent = '📍 P2（自分の視点）';
  }
}

