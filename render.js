// ============================================================
// RENDERING
// ============================================================
function safeCall(fn, label) {
  try { fn(); } catch(e) { console.error('[render] ' + label + ':', e); }
}
function render() {
  if (G.phase === 'ended' && !G._endedRendered) {
    G._endedRendered = true;
  }
  // For guest: swap player indices so guest sees themselves on the bottom
  const me = NET_MY_IDX, opp = 1 - NET_MY_IDX;
  safeCall(() => renderHand(me, 'player-hand'), 'renderHand(me)');
  safeCall(() => renderHand(opp, 'ai-hand'), 'renderHand(opp)');
  safeCall(() => renderField(me, 'player-field'), 'renderField(me)');
  safeCall(() => renderField(opp, 'ai-field'), 'renderField(opp)');
  safeCall(() => renderLands(me, 'player-lands'), 'renderLands(me)');
  safeCall(() => renderLands(opp, 'ai-lands'), 'renderLands(opp)');
  safeCall(() => renderInfoBar(), 'renderInfoBar');
  safeCall(() => renderStack(), 'renderStack');
  safeCall(() => updateCounts(), 'updateCounts');
  safeCall(() => updateThresholdGauge(), 'updateThresholdGauge');
  safeCall(() => updateManaDisplay(), 'updateManaDisplay');
  safeCall(() => drawCombatArrows(), 'drawCombatArrows');
  safeCall(() => updateCXRings(), 'updateCXRings');
  const pgc = document.getElementById('player-grave-count');
  const agc = document.getElementById('ai-grave-count');
  if (pgc) pgc.textContent = G.players[NET_MY_IDX].graveyard.length;
  if (agc) agc.textContent = G.players[1-NET_MY_IDX].graveyard.length;
  netPostAction();
  _resetFreezeTimer();
  const fw = document.getElementById('debug-freeze-warn');
  if (fw) fw.style.display = 'none';
  // カード入場アニメーション
  if (_enteringInstIds.size > 0) {
    _enteringInstIds.forEach(id => {
      const el = document.querySelector(`[data-inst="${id}"]`);
      if (el) { el.classList.add('entering'); setTimeout(() => { if(el.isConnected) el.classList.remove('entering'); }, 500); }
    });
    _enteringInstIds.clear();
  }
  // 攻撃フェーズUI描画
  safeCall(() => renderAttackPhase(), 'renderAttackPhase');
}

// 生成イラスト機能のスイッチ。card-art-ai/integrate.py が true に書き換える。
const CARD_ART_ENABLED = true;
const CARD_ART_DIR = 'images/cards';
// 生成画像があれば<img>で表示し、無ければ（読み込み失敗時）絵文字にフォールバック
function cardArtHtml(card) {
  if (!CARD_ART_ENABLED) return `<div class="card-art">${card.icon}</div>`;
  return `<div class="card-art">`
    + `<img class="card-art-img" src="${CARD_ART_DIR}/${card.id}.png" alt="" `
    + `onerror="this.style.display='none';this.nextElementSibling.style.display='';">`
    + `<span class="card-art-emoji" style="display:none">${card.icon}</span>`
    + `</div>`;
}

function buildCardHTML(card, inst, playerOwner) {
  let ptHtml = '';
  if (card.type === 'creature' && inst) {
    const pb = getPermanentBuff(inst.instanceId);
    const p2 = playerOwner !== undefined ? playerOwner : 0;
    const cxb = getCXBonus(p2, inst);
    const pw = card.power + (inst.tempPower||0) + pb.power + cxb.power;
    const th = card.toughness + (inst.tempToughness||0) + pb.toughness + cxb.toughness;
    const dmgStr = inst.damage > 0 ? `-${inst.damage}` : '';
    ptHtml = `<div class="card-pt">${pw}/${th}${dmgStr}</div>`;
  } else if (card.type === 'creature') {
    ptHtml = `<div class="card-pt">${card.power}/${card.toughness}</div>`;
  }
  const costStr = card.cost ? `<div class="card-cost">${costToString(card.cost)}</div>` : '';
  const keywords = card.keywords && card.keywords.length ? `<div class="card-keywords">${card.keywords.map(k=>{ const def=KEYWORD_DEFS&&KEYWORD_DEFS[k]?KEYWORD_DEFS[k]:k; return `<span class="kw-tip" data-def="${def}">${k}</span>`; }).join(' ')}</div>` : '';
  const dmg = inst && inst.damage > 0 ? `<div class="damage-counter">${inst.damage}</div>` : '';
  const chg = inst && inst.chargeCard ? `<div class="charge-indicator">CG</div>` : '';
  return `
    ${cardArtHtml(card)}
    <div class="card-bottom">
      <div class="card-name">${card.name}</div>
      <div class="card-type-line">${card.type === 'creature' ? card.subtype : card.type}</div>
      ${keywords}
      ${ptHtml}
    </div>
    ${costStr}${dmg}${chg}
  `;
}

function renderHand(player, zoneId) {
  const zone = document.getElementById(zoneId || (player === 0 ? 'player-hand' : 'ai-hand'));
  zone.innerHTML = '';
  const p = G.players[player];

  p.hand.forEach((cardId, i) => {
    const card = CARD_DB[cardId];
    const el = document.createElement('div');
    if (player !== NET_MY_IDX) {
      el.className = 'card face-down';
    } else if (G.mulliganMode && !(G.mulliganDone && G.mulliganDone[player])) {
      el.className = `card color-${card.color}`;
      el.innerHTML = buildCardHTML(card);
      el.style.cursor = 'pointer';
      el.dataset.cardId = card.id;
      if (G.mulliganSelected.has(i)) {
        el.style.opacity = '0.35';
        el.style.outline = '2px solid #ff6666';
      } else {
        el.style.outline = '2px solid transparent';
      }
      el.onclick = () => {
        if (G.mulliganSelected.has(i)) G.mulliganSelected.delete(i);
        else G.mulliganSelected.add(i);
        const countEl = document.getElementById('mulligan-count');
        if (countEl) countEl.textContent = G.mulliganSelected.size;
        renderHand(player, zone.id);
      };
    } else {
      el.className = `card color-${card.color}`;
      // Determine if playable
      const isMain = G.phase === 'main' && G.activePlayer === player;
      const isQuick = card.keywords && card.keywords.includes('Quick');
      const affordable = card.type !== 'land' && canAfford(player, card.cost);
      // 結晶宣言のみ可能な場合（白マナ1枚で宣言できる）
      const canDeclCrystal = !!(card.crystalEtb && (G.players[player].mana.W || 0) >= card.crystalEtb);
      const fieldFull = card.type === 'creature' && G.players[player].field.length >= 5;
      const inPriorityWindow = G.awaitingPriority;
      const canPlay = (affordable || canDeclCrystal) && !fieldFull && (
        isMain ||
        isQuick ||
        (inPriorityWindow && G.activePlayer === player)
      );
      if (canPlay) el.classList.add('playable');
      el.innerHTML = buildCardHTML(card);
      el.onclick = () => handleHandClick(player, i);
      el.title = card.text || card.name;
      el.dataset.cardId = card.id;
    }
    zone.appendChild(el);
  });
}

function renderField(player, zoneId) {
  const zone = document.getElementById(zoneId || (player === 0 ? 'player-field' : 'ai-field'));
  zone.innerHTML = '';
  const p = G.players[player];

  for (let slot = 0; slot < 5; slot++) {
    const slotEl = document.createElement('div');
    slotEl.className = 'field-slot';
    if (slot < p.field.length) {
      const inst = p.field[slot];
      const card = CARD_DB[inst.cardId];
      const el = document.createElement('div');
      el.className = `card color-${card.color}`;
      if (inst.tapped) el.classList.add('tapped');
      // 攻撃可能ハイライト (メインフェイズ): 操作側プレイヤーの自軍クリーチャー
      const viewerP = NET_MODE === 'hotseat' ? G.activePlayer : NET_MY_IDX;
      if (player === viewerP && G.activePlayer === viewerP && G.phase === 'main' && !G.kakutouTargetMode && !G.targetMode) {
        if (canCreatureAttack(player, inst)) el.classList.add('attackable');
        // 格闘ハイライト（出たターンのみ、アンタップ、相手クリーチャーあり）
        if (card.kakutou && inst.entryTurn === G.turn && !inst.tapped
            && G.players[1-player].field.some(c => !CARD_DB[c.cardId].flying || card.flying)) {
          el.classList.add('attackable');
        }
      }
      // 格闘ターゲット選択 (守備側クリーチャーをハイライト、飛行制限あり)
      const kkAtkSide = NET_MODE === 'local' ? 0 : G.activePlayer;
      if (G.kakutouTargetMode && player === 1 - kkAtkSide) {
        const atkInst = G.players[kkAtkSide].field.find(c=>c.instanceId===G.pendingKakutouInstId);
        const atkCard = atkInst ? CARD_DB[atkInst.cardId] : null;
        const canTarget = atkCard && (atkCard.flying || !CARD_DB[inst.cardId].flying);
        if (canTarget) el.classList.add('targetable');
      }
      // ブロック宣言ハイライト（守備側=playerBlockDefender）
      if (G.playerBlockMode) {
        const defP = (G.playerBlockDefender !== undefined && G.playerBlockDefender !== null) ? G.playerBlockDefender : 0;
        if (player === defP) {
          const card2 = CARD_DB[inst.cardId];
          const canBlk = (!inst.tapped || (card2.ocBlockWhileTapped && isOCActive(defP)))
            && !G.directlyAttackedCreatures.has(inst.instanceId);
          if (canBlk) el.classList.add('blockable');
          // ブロック選択中のクリーチャーを緑色で強くハイライト
          if (G.selectedBlockerToAssign === inst.instanceId) {
            el.classList.add('blocking');
          }
          const isAssigned = Object.values(G.playerBlockAssignments).includes(inst.instanceId);
          if (isAssigned && G.selectedBlockerToAssign !== inst.instanceId) el.classList.add('selected');
        }
        if (player === 1 - defP) {
          const isAtkr = G.aiCurrentAttackers.some(a=>a.instId===inst.instanceId);
          if (isAtkr) el.classList.add('attackable');
          if (G.playerBlockAssignments[inst.instanceId]) {
            const blkInst = G.players[defP].field.find(c=>c.instanceId===G.playerBlockAssignments[inst.instanceId]);
            if (blkInst) el.title = `ブロック: ${CARD_DB[blkInst.cardId].name}`;
            // ブロック割り当てがある攻撃クリーチャーも目立つようにする
            el.classList.add('selected');
          }
        }
      }
      // Target mode
      if (G.targetMode) {
        const tm = G.targetMode.type;
        if (tm === 'creature' || tm === 'any') el.classList.add('targetable');
        if (tm === 'opponentCreature' && player !== (G.targetMode.sourcePlayer||0)) el.classList.add('targetable');
        if (tm === 'ownCreature' && player === (G.targetMode.owner||0)) el.classList.add('targetable');
      }
      el.innerHTML = buildCardHTML(card, inst, player);
      el.setAttribute('data-inst', inst.instanceId);
      el.dataset.cardId = inst.cardId;
      el.onclick = () => handleFieldClick(player, inst.instanceId);
      slotEl.appendChild(el);
    } else {
      slotEl.textContent = '';
    }
    zone.appendChild(slotEl);
  }

  // アーティファクト表示（field-slotとして盤面に組み込む）
  if (p.artifacts && p.artifacts.length > 0) {
    p.artifacts.forEach(art => {
      const slotEl = document.createElement('div');
      slotEl.className = 'field-slot';
      const artEl = document.createElement('div');
      artEl.className = 'card artifact-card';
      artEl.style.cssText = 'background:linear-gradient(135deg,#3a2c6a,#5a4090);border:2px solid #a080e0;position:relative;cursor:default;';
      artEl.innerHTML = `<div style="font-size:1.4em;text-align:center">${art.icon}</div>
        <div class="card-name" style="font-size:0.7em;text-align:center">${art.name}</div>
        <div style="text-align:center;font-size:0.85em;margin-top:4px">⏱ ${art.countdown}</div>`;
      artEl.title = `${art.name}: カウントダウン${art.countdown}\n0になったら、C6以上&白土地3枚以上ならアレスティアを再召喚\n条件未達の場合はカウントダウン1で残留`;
      slotEl.appendChild(artEl);
      zone.appendChild(slotEl);
    });
  }
}

function renderLands(player, zoneId) {
  const zone = document.getElementById(zoneId || (player === 0 ? 'player-lands' : 'ai-lands'));
  zone.innerHTML = '';
  const p = G.players[player];

  const sortedLands = [...p.lands].sort((a, b) => {
    // 1. タップ済みは右
    if (a.tapped !== b.tapped) return a.tapped ? 1 : -1;
    // 2. あいうえお順（同名同士が隣接）
    const nameCmp = CARD_DB[a.cardId].name.localeCompare(CARD_DB[b.cardId].name, 'ja');
    if (nameCmp !== 0) return nameCmp;
    // 3. 同名内: チャージ済みは右
    return (a.chargeCard ? 1 : 0) - (b.chargeCard ? 1 : 0);
  });

  sortedLands.forEach(land => {
    const card = CARD_DB[land.cardId];
    const el = document.createElement('div');
    el.className = `land-card color-${card.color}`;
    if (land.tapped) el.classList.add('tapped');
    const chargerP = NET_MODE === 'local' ? 0 : G.activePlayer;
    if (G.chargingMode === 'pick_land' && player === chargerP && !land.chargeCard) el.classList.add('selected');
    if (G.targetMode && G.targetMode.type === 'ownLand' && player === (G.targetMode.owner !== undefined ? G.targetMode.owner : 0) && !land.tapped) el.classList.add('targetable');
    el.innerHTML = `${card.icon}<div class="land-name">${card.name}</div>`;
    if (land.chargeCard) {
      const pip = document.createElement('div');
      pip.className = 'charge-pip';
      pip.textContent = '★';
      pip.title = `チャージ: ${CARD_DB[land.chargeCard].name}`;
      el.appendChild(pip);
    }
    el.dataset.cardId = land.cardId;
    el.onclick = () => handleLandClick(player, land.instanceId);
    zone.appendChild(el);
  });
}

function renderInfoBar() {
  const me = NET_MY_IDX, opp = 1 - NET_MY_IDX;
  const pMe = G.players[me];
  const pOpp = G.players[opp];

  const lifeEl = document.getElementById('player-life');
  lifeEl.textContent = `❤️ ${pMe.life}`;
  lifeEl.className = `life-display${pMe.life <= 5 ? ' low' : ''}`;

  const aiLifeEl = document.getElementById('ai-life');
  aiLifeEl.textContent = `❤️ ${pOpp.life}`;
  aiLifeEl.className = `life-display${pOpp.life <= 5 ? ' low' : ''}`;

  const phases = { untap:'アンタップ', draw:'ドロー', main:'メイン', end:'エンド', ended:'終了' };
  document.getElementById('phase-name').textContent = phases[G.phase] || G.phase;

  const turnName = G.activePlayer === me ? '自分' : (NET_MODE === 'local' ? 'AI' : '相手');
  document.getElementById('turn-indicator').textContent = `ターン ${G.turn} (${turnName})`;

  // Mana display handled by updateManaDisplay() called from render()
}

function updateCXRings() {
  const me = NET_MY_IDX, opp = 1 - me;
  const circumference = 251.3;
  function drawTicks(svg, cxVal, isOC, isPlayer) {
    svg.querySelectorAll('.cx-tick').forEach(el => el.remove());
    const CX = 50, CY = 50, r = 40;
    const activeColor = isOC ? '#aaffaa' : (isPlayer ? '#55ee55' : '#ee5555');
    for (let i = 0; i < 10; i++) {
      const angle = (i * 36 - 90) * Math.PI / 180;
      const x1 = CX + (r - 5) * Math.cos(angle);
      const y1 = CY + (r - 5) * Math.sin(angle);
      const x2 = CX + (r + 5) * Math.cos(angle);
      const y2 = CY + (r + 5) * Math.sin(angle);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      const active = i < cxVal;
      line.setAttribute('stroke', active ? activeColor : '#333');
      line.setAttribute('stroke-width', active ? '2.5' : '1');
      line.setAttribute('stroke-linecap', 'round');
      line.classList.add('cx-tick');
      svg.appendChild(line);
    }
  }
  function updateRing(ringId, textId, areaId, cxVal, isOC, isPlayer) {
    const ring = document.getElementById(ringId);
    const text = document.getElementById(textId);
    const area = document.getElementById(areaId);
    if (!ring || !text) return;
    const offset = circumference * (1 - Math.min(cxVal, 10) / 10);
    ring.style.strokeDashoffset = offset;
    text.textContent = cxVal;
    if (area) area.classList.toggle('oc-active', isOC);
    const svg = ring.closest('svg');
    if (svg) drawTicks(svg, cxVal, isOC, isPlayer);
  }
  const meCX = G.players[me] ? getCXValue(me) : 0;
  const oppCX = G.players[opp] ? getCXValue(opp) : 0;
  const meOC = isOCActive(me);
  const oppOC = isOCActive(opp);
  animCXChange(me, meCX);
  animCXChange(opp, oppCX);
  updateRing('player-cx-ring', 'player-cx-text', 'player-cx-area', meCX, meOC, true);
  updateRing('opp-cx-ring', 'opp-cx-text', 'opp-cx-area', oppCX, oppOC, false);
}

function renderStack() {
  const entries = document.getElementById('stack-entries');
  const emptyMsg = document.getElementById('stack-empty-msg');
  if (!entries) return;
  entries.innerHTML = '';
  if (G.stack.length === 0) {
    if (emptyMsg) emptyMsg.style.display = '';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';
  // MTGアリーナ風: 古→新の順でDOMに追加、flex-direction:columnで古が上
  // 最後の要素（次に解決）がハイライト
  G.stack.forEach((item, idx) => {
    const div = document.createElement('div');
    const isNext = idx === G.stack.length - 1;
    const isPlayer = item.owner === 0;
    div.className = `stack-entry ${isPlayer ? 'player-entry' : 'ai-entry'}${isNext ? ' next-resolve' : ''}`;
    const icon = item.icon || '✨';
    const who = isPlayer ? '自' : 'AI';
    div.textContent = `${icon}[${who}] ${item.name}`;
    div.title = isNext ? '次に解決' : 'スタック';
    entries.appendChild(div);
  });
}

function updateCounts() {
  const me = NET_MY_IDX, opp = 1 - NET_MY_IDX;
  document.getElementById('player-deck-count').textContent = G.players[me].deck.length;
  document.getElementById('player-land-deck-count').textContent = G.players[me].landDeck.length;
  document.getElementById('ai-deck-count').textContent = G.players[opp].deck.length;
  document.getElementById('ai-land-deck-count').textContent = G.players[opp].landDeck.length;
  const ahc = document.getElementById('ai-hand-count');
  if (ahc) ahc.textContent = G.players[opp].hand.length;
  const phcd = document.getElementById('player-hand-count-disp');
  if (phcd) phcd.textContent = G.players[me].hand.length;
  const pgcd = document.getElementById('player-grave-count-disp');
  if (pgcd) pgcd.textContent = G.players[me].graveyard.length;
}

// ============================================================
// CLICK HANDLERS
// ============================================================
function handleHandClick(player, index) {
  if (NET_MODE === 'guest' && player === NET_MY_IDX) { netSendAction('playCard', {handIdx: index}); return; }
  const localHuman = NET_MODE === 'hotseat' ? G.activePlayer : NET_MY_IDX;
  if (player !== localHuman) return; // Can't click opponent hand
  if (G.activePlayer !== localHuman && G.phase !== 'ended') {
    // Allow quick spells
    const cardId = G.players[localHuman].hand[index];
    const card = CARD_DB[cardId];
    if (!(card.keywords && card.keywords.includes('Quick'))) {
      log('相手のターン中は使用できません（Quickのみ可能）');
      return;
    }
  }

  if (G.chargingMode === true) {
    doCharge(index);
    return;
  }

  playCardFromHand(player, index);
}

function handleFieldClick(player, instId) {
  if (NET_MODE === 'guest') {
    if (!netCanAct()) { log('相手のターンです'); return; }
    const cardId = (G.players[player].field.find(c=>c.instanceId===instId)||{}).cardId;
    if (G.targetMode) { netSendAction('targetSelect', {instId, cardId}); return; }
    // 攻撃宣言・格闘対象・ブロック割当などはホスト側のロジックに委譲
    netSendAction('fieldClick', {player, instId});
    return;
  }
  // 格闘ターゲット選択を最優先（攻撃側=アクティブプレイヤー、対象=その相手）
  const kkAtkP = NET_MODE === 'local' ? 0 : G.activePlayer;
  const kkDefP = 1 - kkAtkP;
  if (G.kakutouTargetMode && player === kkDefP) {
    const atkInst = G.players[kkAtkP].field.find(c=>c.instanceId===G.pendingKakutouInstId);
    const atkCard = atkInst ? CARD_DB[atkInst.cardId] : null;
    const tgtInst = G.players[kkDefP].field.find(c=>c.instanceId===instId);
    const tgtCard = tgtInst ? CARD_DB[tgtInst.cardId] : null;
    // 飛行チェック: 非飛行は飛行クリーチャーを格闘対象にできない
    if (tgtCard && tgtCard.flying && !(atkCard && atkCard.flying)) {
      log('飛行クリーチャーは飛行を持たないクリーチャーに攻撃されません');
      return;
    }
    const atkInstId = G.pendingKakutouInstId;
    const kakutouTgtId = instId;
    G.kakutouTargets[atkInstId] = kakutouTgtId;
    G.combatArrows = [{fromId: atkInstId, toId: kakutouTgtId, color: '#ff4444'}];
    log(`格闘: ${atkCard?.name} → ${tgtCard?.name}`);
    G.kakutouTargetMode = false;
    G.pendingKakutouInstId = null;
    render();
    // Priority window after 格闘 target declared
    openPriorityWindow(kkDefP, () => {
      const atkStillAlive = G.players[kkAtkP].field.find(c => c.instanceId === atkInstId);
      const tgtStillAlive = G.players[kkDefP].field.find(c => c.instanceId === kakutouTgtId);
      if (!atkStillAlive || !tgtStillAlive) {
        log('格闘: クリーチャーが破壊されたため攻撃中止');
        G.combatArrows = [];
        render(); updateHints();
        return;
      }
      // 格闘対象以外のクリーチャーはブロック可能
      if (NET_MODE === 'hotseat' || NET_MODE === 'host') {
        // 人間が守備側: 守備側プレイヤーがブロックを宣言できる
        const eligible = G.players[kkDefP].field.filter(c => {
          if (c.instanceId === kakutouTgtId) return false;
          const bc = CARD_DB[c.cardId];
          return (!c.tapped || (bc.ocBlockWhileTapped && isOCActive(kkDefP))) && canFlyBlock(atkInst, c);
        });
        if (eligible.length === 0) {
          setTimeout(() => resolveSingleCombat(kkAtkP, atkInstId, kakutouTgtId, null), 300);
          return;
        }
        G.aiCurrentAttackers = [{instId: atkInstId, targetType:'creature', targetInstId: kakutouTgtId}];
        G.playerBlockMode = true;
        G.playerBlockDefender = kkDefP;
        G.playerBlockAssignments = {};
        G.selectedBlockerToAssign = null;
        G.directlyAttackedCreatures.add(kakutouTgtId);
        G._pendingBlockAtkP = kkAtkP;
        log(`--- 格闘に対してブロッカーを宣言可能（格闘対象以外）→「ブロック確定」 ---`, 'important');
        render(); updateHints();
        return;
      }
      // ローカル: AIがブロックを判断
      const aiBlocker = pickAIBlockerFor(kkAtkP, atkInstId, kakutouTgtId);
      if (aiBlocker) {
        G.combatArrows = [{fromId: atkInstId, toId: aiBlocker.instanceId, color: '#ff4444'}];
        log(`AI: ${CARD_DB[aiBlocker.cardId].name} が格闘をブロック（対象以外はブロック可能）`, 'important');
        render();
        setTimeout(() => resolveSingleCombat(kkAtkP, atkInstId, null, aiBlocker.instanceId), 400);
      } else {
        setTimeout(() => resolveSingleCombat(kkAtkP, atkInstId, kakutouTgtId, null), 300);
      }
    }, '格闘宣言に対応');
    return;
  }

  // Target mode (spell/ability targeting)
  if (G.targetMode) {
    const tm = G.targetMode.type;
    if (tm === 'creature' || tm === 'any') {
      G.targetMode.callback({type:'creature', player, instId});
      return;
    }
    if (tm === 'opponentCreature' && player !== 0) {
      G.targetMode.callback({type:'creature', player, instId});
      return;
    }
    if (tm === 'ownCreature' && player === (G.targetMode.owner||0)) {
      G.targetMode.callback({type:'creature', player, instId});
      return;
    }
  }

  // ブロック宣言: 自分クリーチャー選択 or 相手(AI)攻撃クリーチャー選択
  if (G.playerBlockMode) {
    // G.playerBlockDefender = 防御側プレイヤーindex (usually 0)
    const defP = G.playerBlockDefender !== undefined ? G.playerBlockDefender : 0;
    const atkP = 1 - defP;
    if (player === defP) {
      const inst2 = G.players[defP].field.find(c=>c.instanceId===instId);
      if (!inst2) return;
      const card2 = CARD_DB[inst2.cardId];
      const canBlk = (!inst2.tapped || (card2.ocBlockWhileTapped && isOCActive(defP)))
        && !G.directlyAttackedCreatures.has(instId);
      if (!canBlk) { log(`${card2.name} はブロックできません`); return; }
      if (G.selectedBlockerToAssign === instId) {
        G.selectedBlockerToAssign = null;
      } else {
        G.selectedBlockerToAssign = instId;
        log(`${card2.name} をブロッカーに選択 → 攻撃クリーチャーをクリック`);
      }
      render(); updateHints();
      return;
    }
    if (player === atkP && G.selectedBlockerToAssign) {
      const isAtkr = G.aiCurrentAttackers.some(a=>a.instId===instId);
      if (!isAtkr) return;
      const atkrInst = G.players[atkP].field.find(c=>c.instanceId===instId);
      const blkrInst = G.players[defP].field.find(c=>c.instanceId===G.selectedBlockerToAssign);
      if (!atkrInst || !blkrInst) return;
      if (!canFlyBlock(atkrInst, blkrInst)) {
        log('飛行の制約でブロックできません'); return;
      }
      for (const [k,v] of Object.entries(G.playerBlockAssignments)) {
        if (v === G.selectedBlockerToAssign) delete G.playerBlockAssignments[k];
      }
      G.playerBlockAssignments[instId] = G.selectedBlockerToAssign;
      log(`${CARD_DB[blkrInst.cardId].name} が ${CARD_DB[atkrInst.cardId].name} をブロック`);
      // ブロック矢印を追加（攻撃側 → ブロッカー方向、緑色）
      if (!G.combatArrows) G.combatArrows = [];
      G.combatArrows = G.combatArrows.filter(a => a.fromId !== instId); // 既存矢印を削除
      G.combatArrows.push({
        fromId: instId,
        toId: G.selectedBlockerToAssign,
        color: '#00ff88'
      });
      G.selectedBlockerToAssign = null;
      render(); updateHints();
      return;
    }
    if (player === atkP && G.playerBlockAssignments[instId]) {
      delete G.playerBlockAssignments[instId];
      log('ブロック割り当てを解除');
      // ブロック矢印を削除
      if (G.combatArrows) {
        G.combatArrows = G.combatArrows.filter(a => a.fromId !== instId);
      }
      render(); updateHints();
      return;
    }
    return;
  }

  // メインフェイズに1体ずつ攻撃（local: P0のみ / hotseat・host: アクティブプレイヤー）
  // 優先権ウィンドウ中・スタック解決中・対象選択中は攻撃を開始しない
  // （土地能力やスペルの解決待ちにクリーチャーをクリックして誤って攻撃するのを防ぐ）
  const actP = NET_MODE === 'local' ? 0 : G.activePlayer;
  if (G.awaitingPriority || G.stack.length > 0 || G.targetMode || G._awaitingModal) return;
  if (player === actP && G.activePlayer === actP && G.phase === 'main') {
    const p = G.players[actP];
    const inst = p.field.find(c => c.instanceId === instId);
    if (!inst) return;
    const card = CARD_DB[inst.cardId];

    // アレスティア: 攻撃 or 還元 を選択
    if (card.id === 'arestia') {
      const canAtk = canCreatureAttack(actP, inst);
      // ゲストの操作（ホスト上で実行）: モーダルはホスト画面に出てしまうため直接攻撃
      if (NET_MODE === 'host' && actP === 1) {
        if (canAtk) startSingleAttack(actP, instId);
        else log('アレスティア: 攻撃できません（オンラインでは還元は未対応）');
        return;
      }
      const untappedLands = G.players[actP].lands.filter(l => !l.tapped);
      const hasTapped = G.players[actP].field.some(c => c.instanceId !== instId && c.tapped);
      const isOpponentTurn = G.activePlayer !== actP;
      const canKaizou = untappedLands.length > 0 && hasTapped && isOpponentTurn;
      const html = `
        <p style="margin-bottom:10px;">${card.name} の使用方法を選択:</p>
        <button onclick="closeModal(); startSingleAttack(${actP},${instId});" style="width:100%;margin-bottom:8px;padding:8px;${canAtk?'':'opacity:0.4;cursor:not-allowed;'}" ${canAtk?'':'disabled'}>⚔️ 攻撃する</button>
        <button onclick="closeModal(); arestiaKaizouStart(${instId});" style="width:100%;padding:8px;${canKaizou?'':'opacity:0.4;cursor:not-allowed;'}" ${canKaizou?'':'disabled'}>♻️ 還元: 味方クリーチャーをアンタップ</button>
      `;
      showModal(card.name, html);
      return;
    }

    // フォクリア: 攻撃 or 還元(クリーチャーを守る) を選択
    if (card.activated === 'foklya_protect') {
      const canAtk = canCreatureAttack(actP, inst);
      if (NET_MODE === 'host' && actP === 1) { if (canAtk) startSingleAttack(actP, instId); return; }
      const canKaizou = G.players[actP].lands.length > 0 && G.players[actP].field.length > 0;
      const html = `
        <p style="margin-bottom:10px;">${card.name} の使用方法を選択:</p>
        <button onclick="closeModal(); startSingleAttack(${actP},${instId});" style="width:100%;margin-bottom:8px;padding:8px;${canAtk?'':'opacity:0.4;cursor:not-allowed;'}" ${canAtk?'':'disabled'}>⚔️ 攻撃する</button>
        <button onclick="closeModal(); foklyaActivateProtect(${actP},${instId});" style="width:100%;padding:8px;${canKaizou?'':'opacity:0.4;cursor:not-allowed;'}" ${canKaizou?'':'disabled'}>♻️ 還元: クリーチャー1体を守る</button>
      `;
      showModal(card.name, html);
      return;
    }

    // シキ: 攻撃 or 還元(お互い自軍1体破壊) を選択
    if (card.id === 'shiki') {
      const canAtk = canCreatureAttack(actP, inst);
      if (NET_MODE === 'host' && actP === 1) { if (canAtk) startSingleAttack(actP, instId); return; }
      const untappedLands = G.players[actP].lands.filter(l => !l.tapped);
      const canKaizou = untappedLands.length > 0 && G.players[actP].field.length > 0;
      const html = `
        <p style="margin-bottom:10px;">${card.name} の使用方法を選択:</p>
        <button onclick="closeModal(); startSingleAttack(${actP},${instId});" style="width:100%;margin-bottom:8px;padding:8px;${canAtk?'':'opacity:0.4;cursor:not-allowed;'}" ${canAtk?'':'disabled'}>⚔️ 攻撃する</button>
        <button onclick="closeModal(); shikiKaizou(${instId});" style="width:100%;padding:8px;${canKaizou?'':'opacity:0.4;cursor:not-allowed;'}" ${canKaizou?'':'disabled'}>♻️ 還元: お互い自軍クリーチャー1体破壊</button>
      `;
      showModal(card.name, html);
      return;
    }

    // メグル: 攻撃 or 還元(自分のクリーチャー+1/+1) を選択
    if (card.id === 'meguru') {
      const canAtk = canCreatureAttack(actP, inst);
      if (NET_MODE === 'host' && actP === 1) { if (canAtk) startSingleAttack(actP, instId); return; }
      const untappedLands = G.players[actP].lands.filter(l => !l.tapped);
      const canKaizou = untappedLands.length > 0 && G.players[actP].field.length > 0;
      const html = `
        <p style="margin-bottom:10px;">${card.name} の使用方法を選択:</p>
        <button onclick="closeModal(); startSingleAttack(${actP},${instId});" style="width:100%;margin-bottom:8px;padding:8px;${canAtk?'':'opacity:0.4;cursor:not-allowed;'}" ${canAtk?'':'disabled'}>⚔️ 攻撃する</button>
        <button onclick="closeModal(); meguruKaizou(${instId});" style="width:100%;padding:8px;${canKaizou?'':'opacity:0.4;cursor:not-allowed;'}" ${canKaizou?'':'disabled'}>♻️ 還元: 自分のクリーチャー1体+1/+1</button>
      `;
      showModal(card.name, html);
      return;
    }

    // 格闘キーワード: 出たターン（または格闘を得たターン）のみ起動可
    const hasKakutouThisTurn = (card.kakutou && inst.entryTurn === G.turn) || inst.grantedKakutouTurn === G.turn;
    if (hasKakutouThisTurn && !inst.tapped) {
      const opp = 1 - actP;
      const reachable = G.players[opp].field.filter(c => !CARD_DB[c.cardId].flying || card.flying);
      const canPlayerAttack = !inst.sick || card.haste;
      if (!canPlayerAttack) {
        // 召喚酔い中 → 格闘（相手クリーチャー攻撃）のみ。対象がいなければ宣言不可
        if (reachable.length === 0) { log(`${card.name} 格闘: 対象にできる相手クリーチャーがいません`); return; }
        startKakutou(actP, instId);
        return;
      }
      // 召喚酔いなし → プレイヤー攻撃 と 格闘 を選択（格闘対象がいる時のみ選択肢）
      if (reachable.length === 0) { startSingleAttack(actP, instId); return; }
      if (NET_MODE === 'host' && actP === 1) { startSingleAttack(actP, instId); return; }
      const html = `
        <p style="margin-bottom:10px;">${card.name} の攻撃方法を選択:</p>
        <button onclick="closeModal(); startSingleAttack(${actP},${instId});" style="width:100%;margin-bottom:8px;padding:8px;">⚔️ 相手プレイヤーに攻撃</button>
        <button onclick="closeModal(); startKakutou(${actP},${instId});" style="width:100%;padding:8px;">🥊 格闘: 相手クリーチャーを攻撃</button>`;
      showModal(card.name, html);
      return;
    }

    // 攻撃可能なら攻撃開始
    if (canCreatureAttack(actP, inst)) {
      startSingleAttack(actP, instId);
    }
    return;
  }
}

function handleLandClick(player, instId) {
  if (NET_MODE === 'guest') {
    if (!netCanAct()) { log('相手のターンです'); return; }
    if (G.targetMode && G.targetMode.type === 'ownLand') { netSendAction('targetSelect', {instId}); return; }
    if (player === NET_MY_IDX) { netSendAction('tapLand', {instId}); return; }
    return;
  }
  const lp = NET_MODE === 'hotseat' ? G.activePlayer : NET_MY_IDX; // land player（自分の土地のみ操作）
  if (G.chargingMode === 'pick_land' && player === lp) {
    chargeToLand(instId);
    return;
  }
  if (G.targetMode && G.targetMode.type === 'ownLand' && player === lp) {
    const land = G.players[lp].lands.find(l=>l.instanceId===instId);
    if (land && !land.tapped) { G.targetMode.callback(instId); }
    return;
  }
  if (G.targetMode) return;
  // 自分の土地のみ操作可能（起動効果はQuickなので相手ターン中も可）
  if (player !== lp) return;

  const p = G.players[player];
  const land = p.lands.find(l=>l.instanceId===instId);
  if (!land) return;

  const landCard = CARD_DB[land.cardId];

  // 起動効果はすべてクイック: フェイズ・ターン問わずタップ可能
  if (land.chargeCard && landCard.chargedAbility) {
    if (!land.tapped) {
      const canActivate = (landCard.chargedAbility !== 'look3keep1white' || canAfford(lp, {W:3}))
        && (landCard.chargedAbility !== 'look3keep1red' || canAfford(lp, {R:3}))
        && (landCard.chargedAbility !== 'look3keep1black' || canAfford(lp, {B:3}))
        && (landCard.chargedAbility !== 'look3keep1green' || canAfford(lp, {G:3}))
        && ((landCard.chargedAbility !== 'kaizouReturnGreen') || isOCActive(lp))
        && ((landCard.chargedAbility !== 'kaizouReturnBlack') || isOCActive(lp));
      const abilityLabel = landCard.text.split('\n').find(l => l.includes('起動') && l.includes('チャージ')) || landCard.text.split('\n')[1] || '特殊能力';
      const html = `
        <p style="margin-bottom:10px;">${landCard.name} の使用方法を選択:</p>
        <button onclick="closeModal(); tapLandForMana(${lp},${instId}); render();" style="width:100%;margin-bottom:8px;padding:8px;">マナを追加 (${landCard.produces||'C'})</button>
        <button onclick="closeModal(); activateChargedLand(${lp},${instId});" style="width:100%;padding:8px;${canActivate?'':'opacity:0.4;cursor:not-allowed;'}">${abilityLabel}</button>
      `;
      showModal(landCard.name, html);
      return;
    }
  }

  // チャージ不要のタップ起動能力（実験場の +1/+1 など）: マナ生成 or 起動 を選ばせる
  if (landCard.tapAbility === 'buffPlus11' && !land.tapped) {
    const hasCreature = p.field.length > 0;
    const html = `
      <p style="margin-bottom:10px;">${landCard.name} の使用方法を選択:</p>
      <button onclick="closeModal(); tapLandForMana(${lp},${instId}); render();" style="width:100%;margin-bottom:8px;padding:8px;">マナを追加 (${landCard.produces||'C'})</button>
      <button onclick="closeModal(); activateLandTapAbility(${lp},${instId});" style="width:100%;padding:8px;${hasCreature?'':'opacity:0.4;cursor:not-allowed;'}">自分のクリーチャー1体を+1/+1</button>
    `;
    showModal(landCard.name, html);
    return;
  }

  // Tap for mana (Quick: any time)
  tapLandForMana(player, instId);
}

// Direct damage target on life display
const aiLifeEl = document.getElementById('ai-life');
if (aiLifeEl) {
  aiLifeEl.addEventListener('click', () => {
    if (G.targetMode && G.targetMode.type === 'any') {
      G.targetMode.callback({type:'player', player: 1 - NET_MY_IDX});
    }
  });
}

// ============================================================
// FLOATING DAMAGE
// ============================================================
function showFloatDamage(amount, target) {
  // ライフフラッシュ: targetは 'player'(P0) or 'ai'(P1)
  const playerIdx = target === 'player' ? 0 : 1;
  showLifeChange(playerIdx, -amount);
}

// ============================================================
// MODAL
// ============================================================
function showModal(title, content) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-content').innerHTML = content;
  document.getElementById('modal-cards').innerHTML = '';
  document.getElementById('modal').classList.add('active');
}
function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

function toggleLog() {
  const el = document.getElementById('log-overlay');
  if (el) el.classList.toggle('open');
}

// ============================================================
// HINTS
// ============================================================
function clearTargetMode() {
  if (G.targetMode) {
    G.targetMode = null;
    log('対象選択をキャンセルしました');
  }
  G.chargingMode = false;
  G.selectedCard = null;
}

function arestiaKaizouStart(instId) {
  const p = G.players[0];
  const untappedLands = p.lands.filter(l => !l.tapped);
  if (untappedLands.length === 0) { log('アレスティア 還元: アンタップ状態の土地がありません'); return; }
  const hasTapped = p.field.some(c => c.instanceId !== instId && c.tapped);
  if (!hasTapped) { log('アレスティア 還元: アンタップできるクリーチャーがいません'); return; }
  // コスト支払い（土地選択）→ スタックへ積む → 優先権ウィンドウ
  G.targetMode = { type:'ownLand', owner:0, callback:(landInstId) => {
    const lIdx = p.lands.findIndex(l => l.instanceId === landInstId);
    if (lIdx === -1 || p.lands[lIdx].tapped) { log('アンタップ状態の土地を選んでください'); return; }
    const returnedLand = p.lands.splice(lIdx, 1)[0];
    p.landDeck.push(returnedLand.cardId);
    log(`還元コスト支払い: ${CARD_DB[returnedLand.cardId].name} を土地デッキ底へ`);
    G.targetMode = null;
    G.stack.push({
      name: 'アレスティア 起動（還元）',
      icon: '⚡',
      owner: 0,
      resolve: () => {
        G.targetMode = { type:'ownCreature', owner:0, callback:(tgt) => {
          const tc = p.field.find(x => x.instanceId === tgt.instId);
          if (tc && tc.instanceId !== instId) {
            tc.tapped = false;
            log('アレスティア 還元: クリーチャーをアンタップ');
          }
          G.targetMode = null; render(); updateHints();
        }};
        log('アレスティア 還元: アンタップするクリーチャーを選択');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(1, null, 'アレスティア 還元起動');
  }};
  log('アレスティア 還元: コスト — アンタップ状態の土地を選択');
  render(); updateHints();
}

function meguruKaizou(instId) {
  const actP = NET_MODE === 'local' ? 0 : G.activePlayer;
  const p = G.players[actP];
  const untappedLands = p.lands.filter(l => !l.tapped);
  if (untappedLands.length === 0) { log('メグル 還元: アンタップ状態の土地がありません'); return; }
  if (p.field.length === 0) { log('メグル 還元: 対象クリーチャーがいません'); return; }
  // コスト支払い（土地を土地デッキ底へ）→ スタックへ積む → 優先権ウィンドウ
  G.targetMode = { type:'ownLand', owner:actP, callback:(landInstId) => {
    const lIdx = p.lands.findIndex(l => l.instanceId === landInstId);
    if (lIdx === -1 || p.lands[lIdx].tapped) { log('アンタップ状態の土地を選んでください'); return; }
    const returnedLand = p.lands.splice(lIdx, 1)[0];
    p.landDeck.push(returnedLand.cardId);
    log(`還元コスト支払い: ${CARD_DB[returnedLand.cardId].name} を土地デッキ底へ`);
    G.targetMode = null;
    G.stack.push({
      name: 'メグル 起動（還元）',
      icon: '😊',
      owner: actP,
      resolve: () => {
        if (p.field.length === 0) { log('メグル 還元: 対象なし'); continueStack(); return; }
        G.targetMode = { type:'ownCreature', sourcePlayer: actP, aiPick: pool => pool.reduce((a,b)=>getEffectivePower(actP,b)>getEffectivePower(actP,a)?b:a), callback:(tgt) => {
          addPermanentBuff(actP, tgt.instId, 1, 1);
          log('メグル 還元: 自分のクリーチャー+1/+1（永続）');
          G.targetMode = null; render(); updateHints();
          continueStack();
        }};
        log('メグル 還元: +1/+1するクリーチャーを選択');
        render(); updateHints();
      }
    });
    renderStack();
    openPriorityWindow(1 - actP, null, 'メグル 還元起動');
  }};
  log('メグル 還元: コスト — アンタップ状態の土地を選択');
  render(); updateHints();
}

// シキ 還元: お互いのプレイヤーは自身のクリーチャー1体を破壊する
function shikiKaizou(instId) {
  const actP = NET_MODE === 'local' ? 0 : G.activePlayer;
  const p = G.players[actP];
  const untappedLands = p.lands.filter(l => !l.tapped);
  if (untappedLands.length === 0) { log('シキ 還元: アンタップ状態の土地がありません'); return; }
  if (p.field.length === 0) { log('シキ 還元: 自分のクリーチャーがいません'); return; }
  G.targetMode = { type:'ownLand', owner:actP, callback:(landInstId) => {
    const lIdx = p.lands.findIndex(l => l.instanceId === landInstId);
    if (lIdx === -1 || p.lands[lIdx].tapped) { log('アンタップ状態の土地を選んでください'); return; }
    const returnedLand = p.lands.splice(lIdx, 1)[0];
    p.landDeck.push(returnedLand.cardId);
    log(`還元コスト支払い: ${CARD_DB[returnedLand.cardId].name} を土地デッキ底へ`);
    G.targetMode = null;
    G.stack.push({
      name: 'シキ 起動（還元）',
      icon: '💀',
      owner: actP,
      resolve: () => { shikiSacrificeResolve(actP, instId); }
    });
    renderStack();
    openPriorityWindow(1 - actP, null, 'シキ 還元起動');
  }};
  log('シキ 還元: コスト — アンタップ状態の土地を選択');
  render(); updateHints();
}

// シキ 還元の解決: 起動側プレイヤー→相手プレイヤーの順で各自1体破壊
function shikiSacrificeResolve(actP, shikiInstId) {
  const opp = 1 - actP;
  // 相手(AI/または人間)が自軍1体を破壊
  const sacForPlayer = (pl, cont) => {
    const pf = G.players[pl];
    if (pf.field.length === 0) { log(`${pl===0?'自分':'相手'}: 破壊するクリーチャーなし`); cont(); return; }
    if (pl === 1 || (NET_MODE === 'guest')) {
      // AI: 最も価値の低い自軍クリーチャーを破壊
      const worst = pf.field.reduce((a,b) => getEffectivePower(pl,b) < getEffectivePower(pl,a) ? b : a);
      destroyCreatureByEffect(pl, worst.instanceId, 'シキ 還元');
      checkDeath(); render(); updateHints(); cont(); return;
    }
    // プレイヤー: 選択モーダル
    G._awaitingModal = true;
    let html = `<p style="margin-bottom:10px;">シキ 還元: 破壊する自分のクリーチャーを1体選んでください:</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;" id="shiki-sac-cards"></div>`;
    showModal('シキ 還元: 生け贄', html);
    const box = document.getElementById('shiki-sac-cards');
    pf.field.forEach(c => {
      const cd = CARD_DB[c.cardId];
      const el = document.createElement('div');
      el.className = `card color-${cd.color||'C'}`; el.style.cursor = 'pointer';
      el.innerHTML = buildCardHTML(cd, c, pl);
      el.onclick = () => {
        closeModal(); G._awaitingModal = false;
        destroyCreatureByEffect(pl, c.instanceId, 'シキ 還元');
        checkDeath(); render(); updateHints(); cont();
      };
      box.appendChild(el);
    });
  };
  // 起動側 → 相手 の順に処理 → continueStack
  sacForPlayer(actP, () => {
    sacForPlayer(opp, () => { render(); updateHints(); continueStack(); });
  });
}

// ============================================================
// 青デッキ スペル
// ============================================================
function playAoGeki(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  const opp = 1 - player;
  G.stack.push({ name: card.name, icon: card.icon||'💧', owner: player, resolve: () => {
    p.graveyard.push(cardId);
    drawCard(player); log(`${card.name}: 1枚引く`);
    const targets = G.players[opp].field.filter(c => {
      const cc = CARD_DB[c.cardId];
      if (!cc || !cc.cost) return true;
      return Object.values(cc.cost).reduce((a,b)=>a+b,0) <= 4;
    });
    if (targets.length === 0) { log(`${card.name}: コスト4以下クリーチャーなし`); render(); updateHints(); continueStack(); return; }
    if (player === 1) {
      const tgt = targets.reduce((a,b) => (getEffectiveToughness(opp,b)-b.damage) < (getEffectiveToughness(opp,a)-a.damage) ? b : a);
      applyDamageToCreature(opp, tgt.instanceId, 2, player);
      log(`AI ${card.name}: ${CARD_DB[tgt.cardId]?.name||'?'}に2ダメージ`,'damage');
      checkDeath(); render(); updateHints(); continueStack(); return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player,
      filter: c => { const cc=CARD_DB[c.cardId]; if(!cc||!cc.cost) return true; return Object.values(cc.cost).reduce((a,b)=>a+b,0)<=4; },
      callback:(tgt) => {
        G.targetMode = null;
        applyDamageToCreature(opp, tgt.instId, 2, player);
        log(`${card.name}: 2ダメージ`,'damage');
        checkDeath(); render(); updateHints(); continueStack();
      }};
    log(`${card.name}: 対象を選択（コスト4以下）`); render(); updateHints();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

function playMizuGeki(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  const opp = 1 - player;
  if (G.players[opp].field.length === 0) { log(`${card.name}: 対象クリーチャーなし`); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  G.stack.push({ name: card.name, icon: card.icon||'🌊', owner: player, resolve: () => {
    p.graveyard.push(cardId);
    const oppField = G.players[opp].field;
    if (oppField.length === 0) { log(`${card.name}: 対象なし`); render(); updateHints(); continueStack(); return; }
    if (player === 1) {
      const tgt = oppField.reduce((a,b) => getEffectivePower(opp,b) > getEffectivePower(opp,a) ? b : a);
      _bounceCreature(opp, tgt.instanceId);
      log(`AI ${card.name}: ${CARD_DB[tgt.cardId]?.name||'?'}を手札に戻す`);
      render(); updateHints(); continueStack(); return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      const name = CARD_DB[G.players[opp].field.find(c=>c.instanceId===tgt.instId)?.cardId]?.name || '';
      _bounceCreature(opp, tgt.instId);
      log(`${card.name}: ${name}を手札に戻す`);
      render(); updateHints(); continueStack();
    }};
    log(`${card.name}: 対象を選択（手札に戻す）`); render(); updateHints();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

function _bounceCreature(player, instId) {
  const p = G.players[player];
  const idx = p.field.findIndex(c => c.instanceId === instId);
  if (idx === -1) return;
  const inst = p.field.splice(idx, 1)[0];
  p.hand.push(inst.cardId);
  p.attackers = (p.attackers||[]).filter(id => id !== instId);
  log(`${CARD_DB[inst.cardId]?.name||inst.cardId}: 手札に戻った`);
}

function playHitei(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  if (G.stack.length < 1) { log(`${card.name}: スタックに打ち消す対象がありません`); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  G.stack.push({ name: card.name, icon: card.icon||'🚫', owner: player, resolve: () => {
    p.graveyard.push(cardId);
    // このカード自体はtop→解決済み。次のtopが「一つ下」
    if (G.stack.length >= 1) {
      const target = G.stack.splice(G.stack.length - 1, 1)[0];
      log(`${card.name}: 「${target.name}」を打ち消した`, 'important');
    } else {
      log(`${card.name}: 打ち消す対象なし`);
    }
    render(); updateHints(); continueStack();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

// ── 民による開拓: 開拓1 ──
function playKaitaku1Spell(player, handIndex) {
  const p = G.players[player];
  const card = CARD_DB[p.hand[handIndex]];
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  p.graveyard.push(card.id);
  G.stack.push({
    name: `${card.name}`, icon: card.icon||'🌱', owner: player,
    resolve: () => { doKaitaku(player, 1); render(); updateHints(); continueStack(); }
  });
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, null, `${card.name}に対応`);
}

// ── 森への感謝: (1)土地数分ダメージ (2)開拓1 OC:還元2→クリーチャー展開 ──
function playMoriKansha(player, handIndex) {
  const p = G.players[player];
  const card = CARD_DB[p.hand[handIndex]];
  const opp = 1-player;
  const ocAtCast = isOCActive(player);
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  p.graveyard.push(card.id);
  G.stack.push({
    name: `${card.name}`, icon: card.icon||'🍀', owner: player,
    resolve: () => {
      const dmg = p.lands.length;
      if (G.players[opp].field.length === 0) {
        log(`${card.name}: 対象なし、ダメージスキップ`);
        _moriKanshaStep2(player, ocAtCast);
        return;
      }
      if (player === 0) {
        G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
          applyDamageToCreature(opp, tgt.instId, dmg, player);
          log(`${card.name}: ${dmg}ダメージ`, 'damage');
          G.targetMode = null;
          _moriKanshaStep2(player, ocAtCast);
        }};
        render(); updateHints();
      } else {
        const tgt = G.players[opp].field[0];
        applyDamageToCreature(opp, tgt.instanceId, dmg, player);
        log(`AI ${card.name}: ${dmg}ダメージ`, 'damage');
        _moriKanshaStep2(player, ocAtCast);
      }
    }
  });
  renderStack(); render(); updateHints();
  openPriorityWindow(opp, null, `${card.name}に対応`);
}

function _moriKanshaStep2(player, ocAtCast) {
  doKaitaku(player, 1);
  if (ocAtCast && G.players[player].lands.length >= 2) {
    const p = G.players[player];
    if (player === 0) {
      const eligible = p.hand.filter(id => { const c = CARD_DB[id]; return c && c.type==='creature' && totalCost(c.cost||{}) <= 6; });
      if (eligible.length > 0) {
        const btns = [...new Set(eligible)].map(id => {
          const c = CARD_DB[id];
          return `<button onclick="closeModal();G._awaitingModal=false;_moriKanshaOCPlay(0,'${id}');" style="margin:4px;padding:6px 14px;background:#1a3a1a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;">${c.icon||'🌿'} ${c.name}</button>`;
        }).join('');
        showModal('森への感謝 〈OC〉', `<p>土地2枚還元して手札からマナ総量6以下のクリーチャーを出しますか？</p>${btns}<button onclick="closeModal();G._awaitingModal=false;render();updateHints();" style="margin:4px;padding:6px 14px;background:#555;border:none;color:#ccc;border-radius:4px;cursor:pointer;">しない</button>`);
        G._awaitingModal = true;
        return;
      }
    } else {
      const eligible = p.hand.filter(id => { const c = CARD_DB[id]; return c && c.type==='creature' && totalCost(c.cost||{}) <= 6; });
      if (eligible.length > 0) {
        _moriKanshaOCPlay(player, eligible[0]);
      }
    }
  }
  render(); updateHints();
}

function _moriKanshaOCPlay(player, cardId) {
  const p = G.players[player];
  if (p.lands.length < 2) { render(); updateHints(); return; }
  const take = p.lands.slice(0, 2);
  take.forEach(l => { const idx = p.lands.findIndex(x=>x.instanceId===l.instanceId); if(idx!==-1){p.lands.splice(idx,1);p.landDeck.push(l.cardId);} });
  log(`森への感謝 OC: 土地2枚還元`);
  const hi = p.hand.indexOf(cardId);
  if (hi === -1) { render(); updateHints(); return; }
  p.hand.splice(hi, 1);
  const inst = { cardId, instanceId: G.nextId++, damage:0, tapped:false, entryTurn: G.turn };
  p.field.push(inst);
  log(`森への感謝 OC: ${CARD_DB[cardId].name} を場に出す`, 'heal');
  render(); updateHints();
}

// ── 黒撃: 相手クリーチャー1体を破壊 ──
function playKurogeki(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  const opp = 1 - player;
  if (G.players[opp].field.length === 0) { log(`${card.name}: 対象クリーチャーなし`); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  G.stack.push({ name: card.name, icon: card.icon||'🖤', owner: player, resolve: () => {
    p.graveyard.push(cardId);
    const oppField = G.players[opp].field;
    if (oppField.length === 0) { log(`${card.name}: 対象なし`); render(); updateHints(); continueStack(); return; }
    if (player === 1) {
      const tgt = oppField.reduce((a,b) => getEffectivePower(opp,b) > getEffectivePower(opp,a) ? b : a);
      destroyCreatureByEffect(opp, tgt.instanceId, card.name);
      checkDeath(); render(); updateHints(); continueStack(); return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      destroyCreatureByEffect(opp, tgt.instId, card.name);
      checkDeath(); render(); updateHints(); continueStack();
    }};
    log(`${card.name}: 破壊する対象を選択`); render(); updateHints();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

// ── 死越撃: 破壊 → 山札5枚墓地→1枚回収 → 〈OC〉墓地から黒クリーチャー出す ──
function playShigoeki(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  const opp = 1 - player;
  const ocAtCast = isOCActive(player);
  G.stack.push({ name: card.name, icon: card.icon||'⚰️', owner: player, resolve: () => {
    p.graveyard.push(cardId);
    // ■1: 相手クリーチャー1体破壊 → ■2: 5枚墓地+1回収 → OC: リアニメイト の順で連続処理
    const step2 = () => {
      // 山札の上から5枚墓地に置く（このカード自身は既に墓地）
      const milled = [];
      for (let i = 0; i < 5 && p.deck.length > 0; i++) { milled.push(p.deck.shift()); }
      milled.forEach(c => p.graveyard.push(c));
      log(`${card.name}: 山札から${milled.length}枚墓地へ`);
      const step3 = () => {
        if (ocAtCast) shigoekiOCReanimate(player, () => { render(); updateHints(); continueStack(); });
        else { render(); updateHints(); continueStack(); }
      };
      // 墓地に置いた5枚から1枚を手札に回収
      if (milled.length === 0) { step3(); return; }
      if (player === 1) {
        // AI: 最もコストの高いカードを回収（≒強い）
        const best = milled.reduce((a,b) => totalCost(CARD_DB[b]?.cost||{}) > totalCost(CARD_DB[a]?.cost||{}) ? b : a);
        const gi = p.graveyard.lastIndexOf(best);
        if (gi !== -1) { p.graveyard.splice(gi,1); addCardToHand(1, best); log(`AI ${card.name}: ${CARD_DB[best]?.name}を回収`); }
        step3(); return;
      }
      shigoekiPickRecover(player, milled, step3);
    };
    if (G.players[opp].field.length === 0) { log(`${card.name}: 破壊対象なし`); step2(); return; }
    if (player === 1) {
      const tgt = G.players[opp].field.reduce((a,b) => getEffectivePower(opp,b) > getEffectivePower(opp,a) ? b : a);
      destroyCreatureByEffect(opp, tgt.instanceId, card.name);
      checkDeath(); render(); step2(); return;
    }
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      destroyCreatureByEffect(opp, tgt.instId, card.name);
      checkDeath(); render(); updateHints();
      step2();
    }};
    log(`${card.name}: 破壊する対象を選択`); render(); updateHints();
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

// 死越撃: 墓地に置いた5枚から1枚を手札に加える（プレイヤー選択）
function shigoekiPickRecover(player, milledIds, cont) {
  const p = G.players[player];
  const uniqueMilled = milledIds.filter(cid => p.graveyard.includes(cid));
  if (uniqueMilled.length === 0) { cont(); return; }
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">墓地に置いた中から1枚を手札に加えます:</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="shigoeki-cards"></div>
    <button onclick="closeModal();G._awaitingModal=false;(window._shigoekiCont&&window._shigoekiCont())" style="margin-top:8px;padding:6px 12px;">加えない</button>`;
  showModal('死越撃: 回収', html);
  window._shigoekiCont = cont;
  const container = document.getElementById('shigoeki-cards');
  const seen = new Set();
  milledIds.forEach(cid => {
    const gi = p.graveyard.indexOf(cid);
    if (gi === -1) return;
    const card = CARD_DB[cid];
    const el = document.createElement('div');
    el.className = `card color-${card.color||'C'}`;
    el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    el.onclick = () => {
      const gidx = p.graveyard.indexOf(cid);
      if (gidx !== -1) { p.graveyard.splice(gidx,1); addCardToHand(player, cid); log(`${card.name}を手札に加えた`); }
      closeModal(); G._awaitingModal = false;
      if (window._shigoekiCont) window._shigoekiCont();
    };
    container.appendChild(el);
  });
}

// 死越撃 OC: 墓地からマナ総量8以下の黒クリーチャー1体を出す
function shigoekiOCReanimate(player, cont) {
  const filterFn = c => c.color === 'B' && totalCost(c.cost||{}) <= 8;
  const p = G.players[player];
  const has = p.graveyard.some(cid => { const c=CARD_DB[cid]; return c && c.type==='creature' && filterFn(c); });
  if (!has) { log('死越撃 OC: 墓地に対象の黒クリーチャーなし'); cont(); return; }
  if (player === 1) { reanimateFromGraveyard(1, filterFn, {aiAuto:true}); cont(); return; }
  // プレイヤー: reanimateFromGraveyardはcontinueStackを呼ぶので、ここではcontを直接渡せない。
  // 専用フローで処理
  _shigoekiOCPlayerPick(player, filterFn, cont);
}
function _shigoekiOCPlayerPick(player, filterFn, cont) {
  const p = G.players[player];
  if (p.field.length >= 5) { log('フィールド満杯'); cont(); return; }
  const candidates = p.graveyard.map((cid,i)=>({cid,i,card:CARD_DB[cid]})).filter(({card})=>card&&card.type==='creature'&&filterFn(card));
  if (candidates.length === 0) { cont(); return; }
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:10px;">〈OC〉墓地から出す黒クリーチャー(総量8以下)を選んでください:</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="shigoeki-oc-cards"></div>
    <button onclick="closeModal();G._awaitingModal=false;(window._shigoekiOCCont&&window._shigoekiOCCont())" style="margin-top:8px;padding:6px 12px;">出さない</button>`;
  showModal('死越撃 〈OC〉リアニメイト', html);
  window._shigoekiOCCont = cont;
  const container = document.getElementById('shigoeki-oc-cards');
  candidates.forEach(({cid,card}) => {
    const el = document.createElement('div');
    el.className = `card color-${card.color||'C'}`;
    el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    el.onclick = () => {
      const gi = p.graveyard.indexOf(cid);
      if (gi !== -1) {
        p.graveyard.splice(gi,1);
        const inst = newInstance(cid); inst.sick = true; inst.entryTurn = G.turn;
        _enteringInstIds.add(inst.instanceId);
        p.field.push(inst);
        log(`死越撃 OC: ${card.name}を墓地から場に出した`, 'important');
        fireETB(player, inst.instanceId);
      }
      closeModal(); G._awaitingModal = false;
      if (window._shigoekiOCCont) window._shigoekiOCCont();
    };
    container.appendChild(el);
  });
}

function playChishikiNoSeiri(player, handIndex) {
  const p = G.players[player];
  const cardId = p.hand[handIndex];
  const card = CARD_DB[cardId];
  if (!canAfford(player, card.cost)) { log('マナ不足'); return; }
  payMana(player, card.cost);
  p.hand.splice(handIndex, 1);
  log(`${card.name} をスタックに積んだ`, 'important');
  const opp = 1 - player;
  G.stack.push({ name: card.name, icon: card.icon||'🌀', owner: player, resolve: () => {
    drawCard(player); log(`${card.name}: 1枚引く`);
    if (player === 1) {
      p.graveyard.push(cardId);
      render(); updateHints(); continueStack(); return;
    }
    _chishikiSelectDiscard(player, cardId, 0);
  }});
  renderStack(); render(); updateHints();
  openPriorityWindow(1-player, G.priorityContinuation, `${card.name}に対応`);
}

function _chishikiSelectDiscard(player, spellId, damageCount) {
  const p = G.players[player];
  const card = CARD_DB[spellId];
  const handCards = p.hand.map((cid, i) => {
    const c = CARD_DB[cid];
    return `<button onclick="G._awaitingModal=false;closeModal();_chishikiDiscardOne(${player},'${spellId}',${i},${damageCount})" style="width:100%;margin-bottom:6px;padding:6px;background:#1a1a3a;border:1px solid #4466aa;color:#aaccff;border-radius:4px;cursor:pointer;">${c?c.icon:'🃏'} ${c?c.name:cid}</button>`;
  }).join('');
  const ocDeploy = isOCActive(player) && p.hand.length <= 1;
  G._awaitingModal = true;
  showModal(card.name,
    `<p style="margin-bottom:8px;">手札を底へ送る（送るたびに相手クリーチャーに2ダメージ）${damageCount>0?` [${damageCount}枚送り済み]`:''}</p>
    ${handCards}
    <button onclick="G._awaitingModal=false;closeModal();_chishikiFinish(${player},'${spellId}',${damageCount})" style="width:100%;padding:8px;background:#2a3a2a;border:1px solid #44aa44;color:#aaffaa;border-radius:4px;cursor:pointer;margin-top:4px;">✅ 完了${ocDeploy?' (OC: 青クリーチャー展開)':''}</button>`
  );
}

function _chishikiDiscardOne(player, spellId, handIdx, damageCount) {
  const p = G.players[player];
  const opp = 1 - player;
  const card = CARD_DB[spellId];
  if (handIdx < 0 || handIdx >= p.hand.length) { _chishikiFinish(player, spellId, damageCount); return; }
  const discardId = p.hand.splice(handIdx, 1)[0];
  p.deck.push(discardId);
  log(`${card.name}: ${CARD_DB[discardId]?.name||discardId}を底へ`);
  damageCount++;
  if (G.players[opp].field.length > 0) {
    G.targetMode = { type:'opponentCreature', sourcePlayer:player, callback:(tgt) => {
      G.targetMode = null;
      applyDamageToCreature(opp, tgt.instId, 2, player);
      log(`${card.name}: 相手クリーチャーに2ダメージ`,'damage');
      checkDeath(); render(); updateHints();
      _chishikiSelectDiscard(player, spellId, damageCount);
    }};
    log(`${card.name}: 2ダメージ対象を選択`); render(); updateHints();
  } else {
    _chishikiSelectDiscard(player, spellId, damageCount);
  }
}

function _chishikiFinish(player, spellId, damageCount) {
  const p = G.players[player];
  const card = CARD_DB[spellId];
  p.graveyard.push(spellId);
  log(`${card.name}: 完了（${damageCount}枚底へ送り）`);
  if (isOCActive(player) && p.hand.length <= 1) {
    const blues = p.hand.filter(cid => CARD_DB[cid]?.color === 'U' && CARD_DB[cid]?.type === 'creature');
    if (blues.length > 0 && p.field.length < 5) {
      const deployId = blues[0];
      const idx = p.hand.indexOf(deployId);
      p.hand.splice(idx, 1);
      const inst = newInstance(deployId);
      inst.entryTurn = G.turn;
      inst.sick = false;
      p.field.push(inst);
      log(`${card.name} OC: ${CARD_DB[deployId].name}を展開`,'heal');
    }
  }
  render(); updateHints(); continueStack();
}

function updateHints() {
  const hint = document.getElementById('action-hint');
  // ボタンテキスト切替
  document.getElementById('btn-end-phase').textContent =
    G.playerBlockMode ? 'ブロック確定' : 'フェイズ終了';

  const isOnline = NET_MODE !== 'local' && NET_MODE !== 'hotseat';
  const myTurn = G.activePlayer === NET_MY_IDX;
  const oppName = NET_MODE === 'hotseat' ? (NET_MY_IDX === 0 ? 'P2' : 'P1') : isOnline ? '相手' : 'AI';

  if (G.playerBlockMode) {
    if (G.selectedBlockerToAssign) {
      hint.innerHTML = '🛡️ <b>ブロック割当中</b> — 相手の攻撃クリーチャーをクリックして割り当て';
      hint.style.color = '#ff88aa';
    } else {
      hint.innerHTML = '🛡️ <b>ブロック宣言</b> — 自分クリーチャー → 攻撃クリーチャーの順にクリック（「ブロック確定」でスキップ）';
      hint.style.color = '#ff88aa';
    }
  } else if (G.kakutouTargetMode) {
    hint.innerHTML = '⚔️ <b>格闘</b> — 対象の相手クリーチャーをクリックしてください';
    hint.style.color = '#ffaa00';
  } else if (G.targetMode) {
    const tmType = G.targetMode.type;
    if (tmType === 'opponentCreature') {
      hint.innerHTML = '🎯 <b>対象選択</b> — 相手クリーチャーをクリックしてください（紫枠）';
    } else if (tmType === 'ownCreature') {
      hint.innerHTML = '🎯 <b>対象選択</b> — 自分クリーチャーをクリックしてください（紫枠）';
    } else if (tmType === 'ownLand') {
      hint.innerHTML = '🎯 <b>還元コスト</b> — アンタップ状態の土地をクリックしてください（紫枠）';
    } else {
      hint.innerHTML = '🎯 <b>対象選択中</b> — 対象をクリックしてください';
    }
    hint.style.color = '#ff88ff';
  } else if (G.chargingMode === true) {
    hint.innerHTML = '⭐ <b>チャージ</b> — 手札からチャージするカードを選択';
    hint.style.color = '#ffaa00';
  } else if (G.chargingMode === 'pick_land') {
    hint.innerHTML = '⭐ <b>チャージ</b> — チャージする土地をクリックしてください';
    hint.style.color = '#ffaa00';
  } else if (G.mulliganMode) {
    hint.innerHTML = '🔄 <b>マリガン</b> — 戻すカードをクリック（赤枠）して「確認」を押す';
    hint.style.color = '#aaaaff';
  } else if (G.awaitingPriority && G.priorityFor === NET_MY_IDX) {
    const pr = G.priorityReason ? `【${G.priorityReason}】` : '';
    hint.innerHTML = `⚡ <b>優先権${pr}</b> — Quickスペルを使用できます（「優先権パス」で続行）`;
    hint.style.color = '#ffcc44';
  } else if (G.awaitingPriority && G.priorityFor !== NET_MY_IDX) {
    const pr = G.priorityReason ? `【${G.priorityReason}】` : '';
    hint.innerHTML = `⚡ <b>優先権${pr}</b> — ${oppName}が応答中です...`;
    hint.style.color = '#aaddff';
  } else if (myTurn && G.phase === 'main') {
    const canAtk = G.players[NET_MY_IDX].field.some(c => canCreatureAttack(NET_MY_IDX, c));
    if (canAtk) {
      hint.innerHTML = '🗡️ 土地でマナ / 手札でカードプレイ / <b>オレンジのクリーチャーをクリックで攻撃</b>';
    } else {
      hint.innerHTML = '🎮 土地をクリックでマナ追加 / 手札をクリックでカードプレイ';
    }
    hint.style.color = '#88aaff';
  } else if (!myTurn) {
    hint.innerHTML = `⏳ <b>${oppName}のターン</b>`;
    hint.style.color = '#888';
  } else {
    hint.textContent = '';
  }
  hint.style.display = hint.innerHTML ? 'flex' : 'none';

  // 画面上部の処理状況バナーにも同じ内容を表示
  const banner = document.getElementById('status-banner');
  if (banner) {
    if (hint.innerHTML) {
      banner.innerHTML = hint.innerHTML;
      banner.style.color = hint.style.color || '#ccc';
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  const btnCharge = document.getElementById('btn-charge');
  // 操作主体: hotseat=アクティブプレイヤー / online=自分のindex / local=P0
  const actingPlayer = NET_MODE === 'hotseat' ? G.activePlayer : NET_MY_IDX;
  btnCharge.disabled = G.activePlayer !== actingPlayer || G.phase !== 'main' || G.chargeUsedThisTurn;
  const btnEnd = document.getElementById('btn-end-phase');
  btnEnd.disabled = (!G.playerBlockMode && G.activePlayer !== actingPlayer) || G.phase === 'ended';

  // Pass button: 自分に優先権がある時のみ有効
  const btnPass = document.getElementById('btn-pass');
  if (G.awaitingPriority) {
    const mine = NET_MODE === 'hotseat' ? true : G.priorityFor === actingPlayer;
    btnPass.textContent = mine ? '優先権パス' : '相手の優先権...';
    btnPass.disabled = !mine;
  } else {
    btnPass.textContent = '優先権パス';
    btnPass.disabled = G.stack.length === 0;
  }

  // レン 〈OC〉墓地から実行ボタン: 自分がレンを場に持ち、OC達成、メインフェイズ時のみ表示
  const btnRen = document.getElementById('btn-ren-gy');
  if (btnRen) {
    const me = NET_MODE === 'local' ? 0 : NET_MY_IDX;
    const hasRenOC = G.players[me] && G.players[me].field.some(c => CARD_DB[c.cardId] && CARD_DB[c.cardId].ocGraveyardCast) && isOCActive(me);
    const canShow = hasRenOC && G.activePlayer === me && G.phase === 'main' && !G.awaitingPriority && G.stack.length === 0 && !G.targetMode && !G._awaitingModal;
    btnRen.style.display = canShow ? '' : 'none';
  }
}

// レン 〈OC〉: 自分の墓地からコストを支払ってクリーチャーを場に出す（呪文の墓地実行は未対応）
function renGraveyardCast() {
  const me = NET_MODE === 'local' ? 0 : NET_MY_IDX;
  const p = G.players[me];
  if (p.field.length >= 5) { log('フィールドが満杯です'); return; }
  // 支払い可能なクリーチャーを抽出
  const cands = p.graveyard
    .map((cid, i) => ({ cid, i, card: CARD_DB[cid] }))
    .filter(({ card }) => card && card.type === 'creature' && canAfford(me, card.cost));
  if (cands.length === 0) { log('レン 墓地実行: コストを支払える墓地のクリーチャーがありません'); return; }
  G._awaitingModal = true;
  let html = `<p style="margin-bottom:6px;">レン〈OC〉: 墓地からコストを支払って実行するクリーチャーを選択:</p>
    <p style="margin-bottom:10px;font-size:11px;color:#888;">（呪文の墓地実行は未対応）</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;" id="ren-gy-cards"></div>
    <button onclick="closeModal();G._awaitingModal=false;updateHints();" style="margin-top:8px;padding:6px 12px;">やめる</button>`;
  showModal('レン 〈OC〉墓地実行', html);
  const box = document.getElementById('ren-gy-cards');
  const seen = new Set();
  cands.forEach(({ cid, card }) => {
    if (seen.has(cid)) return; seen.add(cid);
    const el = document.createElement('div');
    el.className = `card color-${card.color||'C'}`; el.style.cursor = 'pointer';
    el.innerHTML = buildCardHTML(card);
    el.onclick = () => {
      const gi = p.graveyard.indexOf(cid);
      if (gi === -1 || !canAfford(me, card.cost)) { return; }
      payMana(me, card.cost);
      p.graveyard.splice(gi, 1);
      const inst = newInstance(cid); inst.sick = true; inst.entryTurn = G.turn;
      _enteringInstIds.add(inst.instanceId);
      p.field.push(inst);
      log(`レン 〈OC〉: ${card.name}を墓地からコストを支払って場に出した`, 'important');
      closeModal(); G._awaitingModal = false;
      fireETB(me, inst.instanceId);
      render(); updateHints();
      // ETBがスタックに乗る場合は解決
      if (G.stack.length > 0) {
        openPriorityWindow(1 - me, null, `レン墓地実行 ${card.name} の誘発`);
      }
    };
    box.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════════════
// 攻撃フェーズUIの描画
// ═══════════════════════════════════════════════════════════
function renderAttackPhase() {
  const container = document.getElementById('attack-phase-ui');
  if (!container) return;

  // 攻撃順序選択モード
  if (G.playerChoosingAttackOrder) {
    renderAttackOrderUI(container);
    return;
  }

  // 攻撃フェーズ選択中でなければ何も表示しない
  if (!G.playerChoosingAttackers) {
    container.innerHTML = '';
    container.style.display = 'none';
    container.style.visibility = 'hidden';
    return;
  }

  const candidates = G.playerAttackCandidates || [];
  const selected = G.playerSelectedAttackers || [];

  if (candidates.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    container.style.visibility = 'hidden';
    return;
  }

  // 攻撃選択UI
  container.style.display = 'block';
  container.style.visibility = 'visible';
  let html = '<div style="padding:12px;background:#2a2a2a;border:2px solid #ffaa00;border-radius:6px;margin:8px 0;">';
  html += '<p style="margin:0 0 8px 0;color:#ffaa00;font-weight:bold;">⚔️ 攻撃するクリーチャーを選択</p>';

  candidates.forEach(c => {
    const card = CARD_DB[c.cardId];
    const isSelected = selected.includes(c.instanceId);
    const bgColor = isSelected ? '#444466' : '#333333';
    const borderColor = isSelected ? '#88ff88' : '#666666';

    html += `<div style="display:flex;align-items:center;padding:6px;margin:4px 0;background:${bgColor};border:1px solid ${borderColor};border-radius:4px;cursor:pointer;" onclick="togglePlayerAttacker(${c.instanceId});render();">`;
    html += `<input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-right:8px;cursor:pointer;" onchange="togglePlayerAttacker(${c.instanceId});render();">`;
    html += `<span style="flex:1;color:#ccc;">${card.name} (${getEffectivePower(0, c)}/${getEffectiveToughness(0, c)})</span>`;
    html += `<span style="color:#888;font-size:11px;">${card.icon}</span>`;
    html += '</div>';
  });

  html += '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">';
  html += `<button onclick="playerAttackConfirm();render();" style="flex:1;min-width:120px;padding:8px;background:#448844;color:#fff;border:1px solid #66ff66;border-radius:4px;cursor:pointer;font-weight:bold;">攻撃決定 (${selected.length})</button>`;
  if (G.playerPassOption) {
    html += `<button onclick="playerAttackPass();render();" style="flex:1;min-width:100px;padding:8px;background:#666644;color:#fff;border:1px solid #ccaa44;border-radius:4px;cursor:pointer;">パス</button>`;
  }
  html += `<button onclick="G.playerChoosingAttackers=false;G.playerSelectedAttackers=[];render();" style="flex:1;min-width:100px;padding:8px;background:#884444;color:#fff;border:1px solid #ff6666;border-radius:4px;cursor:pointer;">キャンセル</button>`;
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;
}

// 攻撃順序選択UI
function renderAttackOrderUI(container) {
  const order = G.playerAttackOrder || [];
  let html = '<div style="padding:12px;background:#2a2a2a;border:2px solid #ffaa00;border-radius:6px;margin:8px 0;">';
  html += '<p style="margin:0 0 8px 0;color:#ffaa00;font-weight:bold;">📋 攻撃順序を選択</p>';
  html += '<p style="margin:0 0 8px 0;color:#aaa;font-size:12px;">上から順に攻撃します。↑↓で順序変更</p>';

  order.forEach((instId, idx) => {
    const inst = G.players[0].field.find(c => c.instanceId === instId);
    if (!inst) return;
    const card = CARD_DB[inst.cardId];
    html += `<div style="display:flex;align-items:center;padding:6px;margin:4px 0;background:#333333;border:1px solid #666666;border-radius:4px;">`;
    html += `<span style="color:#ffaa00;font-weight:bold;margin-right:8px;">${idx + 1}.</span>`;
    html += `<span style="flex:1;color:#ccc;">${card.name}</span>`;
    if (idx > 0) {
      html += `<button onclick="swapAttackOrder(${idx},${idx-1});render();" style="padding:4px 8px;background:#556644;color:#fff;border:1px solid #88aa66;border-radius:3px;cursor:pointer;font-size:11px;margin-left:4px;">↑</button>`;
    }
    if (idx < order.length - 1) {
      html += `<button onclick="swapAttackOrder(${idx},${idx+1});render();" style="padding:4px 8px;background:#556644;color:#fff;border:1px solid #88aa66;border-radius:3px;cursor:pointer;font-size:11px;margin-left:4px;">↓</button>`;
    }
    html += '</div>';
  });

  html += '<div style="margin-top:8px;display:flex;gap:6px;">';
  html += `<button onclick="playerAttackOrderConfirm();render();" style="flex:1;padding:8px;background:#448844;color:#fff;border:1px solid #66ff66;border-radius:4px;cursor:pointer;font-weight:bold;">順序確定</button>`;
  html += '</div>';
  html += '</div>';

  container.style.display = 'block';
  container.style.visibility = 'visible';
  container.innerHTML = html;
}

// ============================================================
// LOG
// ============================================================
function log(msg, type) {
  const el = document.getElementById('log');
  const p = document.createElement('p');
  if (type) p.className = type;
  p.textContent = msg;
  el.appendChild(p);
  el.scrollTop = el.scrollHeight;
  const logRight = document.getElementById('log-right');
  if (logRight) {
    const p2 = document.createElement('p');
    if (type) p2.className = type;
    p2.textContent = msg;
    logRight.appendChild(p2);
    logRight.scrollTop = logRight.scrollHeight;
  }
  if (type === 'important' || type === 'damage') {
    _recentImportantLogs.push({msg, type});
    if (_recentImportantLogs.length > 3) _recentImportantLogs.shift();
    updateRecentLog();
  }
}

// ============================================================
// 1. CARD DETAIL PANEL
// ============================================================
const KEYWORD_DEFS = {
  '格闘': '出たターン、または格闘を得たターン、タップ／アンタップを問わず相手クリーチャーを攻撃できる',
  '警戒': '攻撃してもタップしない',
  '飛行': '飛行を持たないクリーチャーにブロックされない',
  '還元': '土地を土地デッキの底に戻すことをコストに起動する能力',
  '速攻': '召喚酔いしない（場に出たターンから攻撃できる）',
  '接死': 'このクリーチャーが与えた戦闘ダメージが1点以上なら、そのクリーチャーを破壊する',
  '2回攻撃': 'このターン最初の攻撃時にアンタップし、もう一度攻撃できる',
  'Quick': '相手ターン・戦闘中でも使用できる',
  'C6': 'C値が6以上のとき効果が発動',
  'C7': 'C値が7以上のとき効果が発動',
  'C8': 'C値が8以上のとき効果が発動',
  'C9': 'C値が9以上のとき効果が発動',
  'OC': 'C値が10以上（オーバーチャージ）のとき効果が発動',
  '貫通': '戦闘ダメージがブロッカーのタフネスを超えた分、相手プレイヤーに与える',
  '開拓': '自分の土地デッキから土地を1枚探し、タップ状態で場に出す',
  'サーチ': '自分の山札から好きなカード1枚を手札に加える',
};

function kwTipHtml(kw) {
  const def = KEYWORD_DEFS[kw] || kw;
  return `<span class="kw-tip" data-def="${def}">${kw}</span>`;
}

function toggleRightPanel() {
  const panel = document.getElementById('right-panel');
  const backdrop = document.getElementById('rp-backdrop');
  const open = panel.classList.toggle('rp-open');
  backdrop.classList.toggle('rp-open', open);
}

function switchRightPanel(tab) {
  document.querySelectorAll('.rp-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rp-pane').forEach(p => p.classList.remove('active'));
  const paneId = tab === 'stack' ? 'stack-pane' : tab === 'card' ? 'card-info-zone' : 'right-log-pane';
  const pane = document.getElementById(paneId);
  if (pane) pane.classList.add('active');
  // find matching tab button by onclick attribute
  document.querySelectorAll('.rp-tab').forEach(b => {
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tab}'`)) b.classList.add('active');
  });
}

function showCardDetail(cardId, x, y) {
  const card = CARD_DB[cardId];
  if (!card) return;
  let ptStr = card.type === 'creature' ? `<div class="cdp-pt">${card.power}/${card.toughness}</div>` : '';
  let costStr = card.cost ? ` [${costToString(card.cost)}]` : '';
  let kwHtml = '';
  if (card.keywords && card.keywords.length) {
    kwHtml = `<div class="cdp-kw">${card.keywords.map(kwTipHtml).join(' ')}</div>`;
  }
  const html = `
    <div class="cdp-title">${card.icon || ''} ${card.name}${costStr}</div>
    <div class="cdp-type">${card.type === 'creature' ? (card.subtype || 'クリーチャー') : card.type} (${card.color})</div>
    ${ptStr}
    ${kwHtml}
    <div class="cdp-text">${(card.text || '(テキストなし)').replace(/\\n/g, '\n')}</div>
  `;
  // カード情報ゾーン(右パネル)に表示
  const zone = document.getElementById('card-info-zone');
  if (zone) { zone.innerHTML = html; }
  switchRightPanel('card');
  // 互換: 浮動パネルは非表示のまま
  const panel = document.getElementById('card-detail-panel');
  if (panel) panel.style.display = 'none';
}

function hideCardDetail() {
  const panel = document.getElementById('card-detail-panel');
  if (panel) { panel.style.display = 'none'; panel._shownCardId = null; }
  const zone = document.getElementById('card-info-zone');
  if (zone) { zone.innerHTML = '<div class="cdp-placeholder">右クリックでカード詳細</div>'; }
  switchRightPanel('stack');
}

// ============================================================
// 3. GRAVEYARD VIEWER
// ============================================================
function showGraveyard(player) {
  const p = G.players[player];
  const name = player === 0 ? '自分' : '相手';
  if (p.graveyard.length === 0) {
    showModal(`${name}の墓地`, `<p style="color:#888;">墓地にカードはありません</p>`);
    return;
  }
  let html = `<p style="margin-bottom:10px; font-size:11px; color:#888;">${p.graveyard.length}枚</p><div style="display:flex;flex-wrap:wrap;gap:8px;" id="grave-cards"></div>`;
  showModal(`${name}の墓地`, html);
  const container = document.getElementById('grave-cards');
  // Show most recent first
  [...p.graveyard].reverse().forEach(cid => {
    const card = CARD_DB[cid];
    if (!card) return;
    const el = document.createElement('div');
    el.className = `card color-${card.color}`;
    el.style.cursor = 'default';
    el.innerHTML = buildCardHTML(card);
    el.title = card.text || card.name;
    el.dataset.cardId = cid; // 右クリック/長押しで詳細表示
    container.appendChild(el);
  });
}

// ============================================================
// 5. THRESHOLD GAUGE
// ============================================================
function updateThresholdGauge() {
  const cx = getCXValue(NET_MY_IDX);
  const labelEl = document.getElementById('threshold-label');
  const fillEl = document.getElementById('threshold-fill');
  const countEl = document.getElementById('threshold-count');
  if (!labelEl || !fillEl) return;
  const cx6 = cx >= 6 ? '🟡C6✓' : 'C6✗';
  const cx8 = cx >= 8 ? '🟠C8✓' : 'C8✗';
  const oc  = cx >= 10 ? '🔴OC✓'  : 'OC✗';
  labelEl.textContent = `${cx6} ${cx8} ${oc}`;
  if (countEl) countEl.textContent = `${cx}/10`;
  const pct = Math.min(cx / 10 * 100, 100);
  fillEl.style.width = pct + '%';
  if (cx >= 10) {
    fillEl.style.background = '#cc3333';
  } else if (cx >= 8) {
    fillEl.style.background = '#cc7722';
  } else if (cx >= 6) {
    fillEl.style.background = '#ccaa33';
  } else {
    fillEl.style.background = '#555';
  }
}

// ============================================================
// 6. LOG PINNED RECENT ENTRIES
// ============================================================
const _recentImportantLogs = [];
function updateRecentLog() {
  let el = document.getElementById('log-recent');
  if (!el) {
    el = document.createElement('div');
    el.id = 'log-recent';
    const logEl = document.getElementById('log');
    logEl.insertBefore(el, logEl.firstChild);
  }
  el.innerHTML = _recentImportantLogs.slice(-3).map(({msg, type}) => {
    const cls = type || 'normal';
    return `<p class="${cls}" style="font-size:10px;">${msg}</p>`;
  }).join('');
}

// ============================================================
// 7. COMBAT ARROWS
// ============================================================
function drawCombatArrows() {
  const svg = document.getElementById('arrow-overlay');
  if (!svg) return;
  svg.innerHTML = '';
  if (!G || !G.combatArrows || G.combatArrows.length === 0) return;
  G.combatArrows.forEach(arrow => {
    const fromEl = document.querySelector(`[data-inst="${arrow.fromId}"]`);
    let toEl;
    if (arrow.toId) {
      toEl = document.querySelector(`[data-inst="${arrow.toId}"]`);
    } else {
      // プレイヤーへの攻撃: 攻撃クリーチャーの持ち主の「相手」のライフへ矢印を向ける
      let atkOwner = G.players[0].field.some(c => c.instanceId === arrow.fromId) ? 0
                   : G.players[1].field.some(c => c.instanceId === arrow.fromId) ? 1 : null;
      const defender = atkOwner === null ? 1 : (1 - atkOwner);
      const lifeId = (defender === NET_MY_IDX) ? 'player-life' : 'ai-life';
      toEl = document.getElementById(lifeId);
    }
    if (!fromEl || !toEl) return;
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const x1 = fr.left + fr.width / 2;
    const y1 = fr.top + fr.height / 2;
    const x2 = tr.left + tr.width / 2;
    const y2 = tr.top + tr.height / 2;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', arrow.color || '#ff8800');
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-dasharray', '6 3');
    line.setAttribute('marker-end', 'url(#arrowhead)');
    line.setAttribute('opacity', '0.8');
    svg.appendChild(line);
  });
  // arrowhead marker
  if (!svg.querySelector('defs')) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<marker id="arrowhead" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#ff8800"/></marker>`;
    svg.insertBefore(defs, svg.firstChild);
  }
}

// ============================================================
// 8. MANA DISPLAY ENHANCED
// ============================================================
function updateManaDisplay() {
  const p0 = G.players[NET_MY_IDX];
  // Current available mana
  const manaEl = document.getElementById('mana-display');
  manaEl.innerHTML = '';
  const colors = ['R','U','G','W','B','C'];
  colors.forEach(c => {
    const amt = p0.mana[c] || 0;
    if (amt > 0) {
      for (let i = 0; i < amt; i++) {
        const pip = document.createElement('div');
        pip.className = `mana-pip mana-${c}`;
        pip.textContent = c === 'C' ? '' : c;
        manaEl.appendChild(pip);
      }
    }
  });
  // Untapped lands potential mana
  const untappedLabel = document.getElementById('mana-untapped-label');
  if (untappedLabel) {
    const potential = {};
    p0.lands.forEach(land => {
      if (!land.tapped) {
        const lc = CARD_DB[land.cardId];
        const mc = lc.produces || 'C';
        potential[mc] = (potential[mc] || 0) + 1;
      }
    });
    const parts = Object.entries(potential).map(([c, n]) => `${c}×${n}`);
    untappedLabel.textContent = parts.length ? '未タップ: ' + parts.join(' ') : '';
  }
}

// ============================================================
// 9. AI BALLOON
// ============================================================
let _aiBalloonTimer = null;
function showAIThinking(active) {
  const el = document.getElementById('ai-thinking');
  if (el) el.style.display = active ? 'inline' : 'none';
}

function showAIBalloon(text) {
  const el = document.getElementById('ai-balloon');
  if (!el) return;
  el.textContent = text;
  el.classList.add('active');
  if (_aiBalloonTimer) clearTimeout(_aiBalloonTimer);
  _aiBalloonTimer = setTimeout(() => { el.classList.remove('active'); }, 2000);
}

// ============================================================
// 10. PHASE FLASH
// ============================================================
const PHASE_NAMES_JP = {
  untap: 'アンタップ',
  draw: 'ドロー',
  main: 'メインフェイズ',
  combat: '戦闘フェイズ',
  end: 'エンドフェイズ',
};
let _phaseFlashTimer = null;
function showPhaseFlash(mainText, subText) {
  const el = document.getElementById('phase-flash');
  if (!el) return;
  el.innerHTML = `<span class="pf-main">${mainText}</span>${subText ? `<span class="pf-sub">${subText}</span>` : ''}`;
  el.classList.remove('active');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('active');
  if (_phaseFlashTimer) clearTimeout(_phaseFlashTimer);
  _phaseFlashTimer = setTimeout(() => { el.classList.remove('active'); }, 2000);
}

const PHASE_NAMES_FLASH = {
  untap: 'アンタップ',
  draw:  'ドロー',
  main:  'メインフェイズ',
  end:   'エンドフェイズ',
  ended: 'ゲーム終了',
};

// ============================================================
// GLOBAL RIGHT-CLICK HANDLER (card detail)
// ============================================================
// ── 右クリック: カード詳細表示 ──
document.addEventListener('contextmenu', function(e) {
  const panel = document.getElementById('card-detail-panel');
  const card = e.target.closest('[data-card-id]');
  if (card) {
    e.preventDefault();
    e.stopPropagation();
    if (panel._shownCardId) {
      hideCardDetail();
    } else {
      showCardDetail(card.dataset.cardId, e.clientX, e.clientY);
      panel._shownCardId = card.dataset.cardId;
    }
  } else if (panel._shownCardId) {
    e.preventDefault();
    hideCardDetail();
  }
}, true);

// ── 長押し: タッチデバイス用カード詳細表示 ──
(function() {
  let timer = null;
  let moved = false;
  document.addEventListener('touchstart', function(e) {
    moved = false;
    const card = e.target.closest('[data-card-id]');
    if (!card) return;
    const touch = e.touches[0];
    timer = setTimeout(() => {
      if (moved) return;
      const panel = document.getElementById('card-detail-panel');
      if (panel._shownCardId === card.dataset.cardId) {
        hideCardDetail();
      } else {
        showCardDetail(card.dataset.cardId, touch.clientX, touch.clientY);
        panel._shownCardId = card.dataset.cardId;
      }
      e.preventDefault();
    }, 500);
  }, { passive: true });
  document.addEventListener('touchmove',  () => { moved = true; clearTimeout(timer); }, { passive: true });
  document.addEventListener('touchend',   () => { clearTimeout(timer); }, { passive: true });
  document.addEventListener('touchcancel',() => { clearTimeout(timer); }, { passive: true });
  // パネル表示中に他の場所をタップしたら閉じる
  document.addEventListener('touchstart', function(e) {
    const panel = document.getElementById('card-detail-panel');
    if (!panel._shownCardId) return;
    if (!e.target.closest('[data-card-id]') && !e.target.closest('#card-detail-panel')) {
      hideCardDetail();
    }
  }, { passive: true });
})();

// ============================================================
// KEYWORD TOOLTIP (fixed overlay, avoids overflow:hidden clipping)
// ============================================================
(function() {
  const tip = document.getElementById('kw-tooltip');
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('.kw-tip');
    if (!el) { tip.style.display = 'none'; return; }
    tip.textContent = el.dataset.def || el.textContent;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect();
    let left = r.left + r.width / 2 - tip.offsetWidth / 2;
    let top = r.top - tip.offsetHeight - 6;
    if (left < 4) left = 4;
    if (left + tip.offsetWidth > window.innerWidth - 4) left = window.innerWidth - tip.offsetWidth - 4;
    if (top < 4) top = r.bottom + 6;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  });
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('.kw-tip')) tip.style.display = 'none';
  });
  document.addEventListener('scroll', () => { tip.style.display = 'none'; }, true);
})();

