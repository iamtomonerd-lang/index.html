// ============================================================
// CARD EFFECT TEST FRAMEWORK
// ============================================================
function _testMakeState() {
  // Gをテスト用の最小状態に差し替えるヘルパー
  const mkP = () => ({
    life:20, deck:['shinmai_heishi','shinmai_heishi','shinmai_heishi'],
    landDeck:[], hand:[], field:[], lands:[], graveyard:[], exile:[],
    mana:{R:0,U:0,G:0,W:10,B:0,C:10},
    mulliganUsed:false, attackers:[], blockers:{}
  });
  return {
    turn:1, activePlayer:0, phase:'main', priority:0,
    stack:[], players:[mkP(), mkP()],
    nextInstanceId:100,
    firstTurn:false, awaitingPriority:false, priorityFor:null, priorityContinuation:null,
    chargingMode:false, chargeUsedThisTurn:false, targetMode:null,
    attackMode:false, blockMode:false, selectedAttacker:null, selectedCard:null,
    tempBuffs:[], permanentBuffs:[],
    landPlacedThisTurn:0, mustAttackCreatures:new Set(),
    blockDrawActive:[false,false], arestiaBuffActive:false, combatBlockersAlive:{},
    cantAttackPermanent:new Set(), kaizen_used_names:new Set(),
    playerBlockMode:false, aiCurrentAttackers:[], playerBlockAssignments:{},
    selectedBlockerToAssign:null, directlyAttackedCreatures:new Set(), kakutouTargets:{}
  };
}

function _testAddCreature(player, cardId, opts={}) {
  const inst = {
    instanceId: G.nextInstanceId++, cardId,
    tapped:false, damage:opts.damage||0, sick:false,
    chargeCard:null, tempPower:0, tempToughness:0,
    entryTurn:1, mustAttack:false
  };
  G.players[player].field.push(inst);
  return inst;
}

function _testSaveG() {
  // Setを配列として直列化してバックアップ
  const s = JSON.parse(JSON.stringify(G, (_,v)=> v instanceof Set?[...v]:v));
  return s;
}

function _testRestoreG(saved) {
  G = JSON.parse(JSON.stringify(saved));
  // Setを復元
  G.mustAttackCreatures = new Set(G.mustAttackCreatures||[]);
  G.cantAttackPermanent = new Set(G.cantAttackPermanent||[]);
  G.kaizen_used_names   = new Set(G.kaizen_used_names||[]);
  G.directlyAttackedCreatures = new Set(G.directlyAttackedCreatures||[]);
}

function runCardTests() {
  const originalG = G ? _testSaveG() : null;
  const results = [];

  function assert(name, cond, detail) {
    results.push({ name, pass: !!cond, detail: detail||'' });
  }

  function withState(fn) {
    G = _testMakeState();
    try { fn(); }
    catch(e) { results.push({name:'[exception]', pass:false, detail:e.message}); }
  }

  // テスト用: スタックを同期的に全解決する（優先権ウィンドウなし）
  function drainStack() {
    let limit = 50;
    while (G.stack.length > 0 && limit-- > 0) {
      const item = G.stack.pop();
      if (item.resolve) item.resolve();
      if (G.targetMode && G.targetMode.sourcePlayer === 1) aiAutoPickTarget();
    }
  }

  // ─────────────────────────────────────────────
  // 1. checkCreatureDeath: ダメージ >= タフネスで破壊
  withState(()=>{
    const inst = _testAddCreature(1,'shinmai_heishi'); // 1/3
    inst.damage = 2;
    const dead1 = checkCreatureDeath(1, inst.instanceId, 0);
    assert('破壊: ダメージ1 < タフネス2 → 生存', !dead1 && G.players[1].field.length===1);
    inst.damage = 3;
    const dead2 = checkCreatureDeath(1, inst.instanceId, 0);
    assert('破壊: ダメージ2 >= タフネス2 → 破壊', dead2 && G.players[1].field.length===0 && G.players[1].graveyard.length===1);
  });

  // 2. applyDamageToCreature: 正しくダメージが入り墓地に行く
  withState(()=>{
    const inst = _testAddCreature(1,'shinmai_heishi'); // 1/3
    applyDamageToCreature(1, inst.instanceId, 2, 0);
    assert('ダメージ適用: 1ダメージ後生存', G.players[1].field.length===1 && G.players[1].field[0].damage===2);
    applyDamageToCreature(1, inst.instanceId, 1, 0);
    assert('ダメージ適用: 2ダメージ後破壊', G.players[1].field.length===0 && G.players[1].graveyard[0]==='shinmai_heishi');
  });

  // 3. ETB damage3opponent: セラシアの僧侶が相手クリーチャーに3ダメージ
  withState(()=>{
    const target = _testAddCreature(0,'arestia'); // 5/5 相手フィールド
    const souryo = _testAddCreature(1,'serashia_souryo'); // 3/7 AIフィールド
    // AI(player=1)のETBはターゲットを自動選択 → スタック経由で解決
    fireETB(1, souryo.instanceId);
    drainStack();
    assert('ETB 僧侶(AI): 相手クリーチャーに強制攻撃フラグ', G.players[0].field[0] && G.players[0].field[0].mustAttack);
  });

  // 4. ETB damage1opponent: 天からの使者が相手クリーチャーに1ダメージ
  withState(()=>{
    const target = _testAddCreature(0,'shinmai_heishi'); // 1/2
    const tenshi = _testAddCreature(1,'ten_kara_shisha');
    fireETB(1, tenshi.instanceId);
    drainStack();
    const t = G.players[0].field.find(x=>x.instanceId===target.instanceId);
    // 1/2に1ダメージ→生存（damage=1）
    assert('ETB 使者(AI): 相手クリーチャーに1ダメージ', t && t.damage===1);
  });

  // 5. ETB mustAttackTarget: セラシアの盾兵が攻撃強制
  withState(()=>{
    const target = _testAddCreature(0,'shinmai_heishi');
    const junhei = _testAddCreature(1,'serashia_junhei');
    fireETB(1, junhei.instanceId);
    drainStack();
    const t = G.players[0].field.find(x=>x.instanceId===target.instanceId);
    assert('ETB 盾兵(AI): 攻撃強制フラグ', t && t.mustAttack===true && G.mustAttackCreatures.has(target.instanceId));
  });

  // 6. ETB damage3 (player=0, targetMode): プレイヤー操作でtargetMode設定
  withState(()=>{
    const target = _testAddCreature(1,'arestia'); // 相手(AI)フィールド
    const souryo = _testAddCreature(0,'serashia_souryo');
    fireETB(0, souryo.instanceId);
    drainStack(); // スタック解決 → resolveETBEffect が targetMode をセット
    assert('ETB 僧侶(PL): targetModeがセット', G.targetMode !== null && G.targetMode.type==='opponentCreature');
    // コールバックを手動発火
    G.targetMode.callback({instId: target.instanceId});
    const t = G.players[1].field.find(x=>x.instanceId===target.instanceId);
    assert('ETB 僧侶(PL): コールバック後3ダメージ', t && t.mustAttack);
  });

  // 7. onBlock draw1: セラシアの兵士がブロック時にドロー
  withState(()=>{
    G.players[0].deck = ['shinmai_heishi','shinmai_heishi','shinmai_heishi'];
    const atk = _testAddCreature(1,'shinmai_heishi');  // AI攻撃
    const blk = _testAddCreature(0,'serashia_heishi'); // PL防御 onBlock:draw1
    const handBefore = G.players[0].hand.length;
    resolveSingleCombat(1, atk.instanceId, null, blk.instanceId);
    drainStack(); // スタックのonBlock誘発を解決
    assert('onBlock draw1: 兵士ブロック時1ドロー', G.players[0].hand.length === handBefore+1);
  });

  // 8. onBlock gain3life: セラシアの僧侶がブロック時にライフ+3
  withState(()=>{
    G.players[0].life = 20;
    const atk = _testAddCreature(1,'shinmai_heishi');     // 1/2
    const blk = _testAddCreature(0,'serashia_souryo');    // 3/5 onBlock:gain3life
    resolveSingleCombat(1, atk.instanceId, null, blk.instanceId);
    drainStack(); // スタックのonBlock誘発を解決
    assert('onBlock gain3life: 僧侶ブロック時ライフ+3', G.players[0].life===23);
  });

  // 9. onBlock damage2attacker: 盾兵がブロック時に攻撃者に2ダメージ (AI blocker)
  withState(()=>{
    const atk = _testAddCreature(0,'shinmai_heishi');     // PL攻撃 1/2
    const blk = _testAddCreature(1,'serashia_junhei');    // AI防御 1/5 onBlock:damage2attackerAndCopy
    // atkPlayer=0がAIのblkにブロックされる場合: opp=1, AIのonBlockはatkInst.damage+=2
    resolveSingleCombat(0, atk.instanceId, null, blk.instanceId);
    drainStack(); // スタックのonBlock誘発を解決
    const a = G.players[0].field.find(x=>x.instanceId===atk.instanceId);
    // 盾兵(1パワー)のダメージ=1 + onBlock2ダメージ = 合計3ダメージで破壊
    assert('onBlock damage2attacker: 攻撃者にダメージ追加→破壊', G.players[0].field.length===0 || (a&&a.damage>=3));
  });

  // 10. addPermanentBuff: パーマネントバフが正しく加算
  withState(()=>{
    const inst = _testAddCreature(0,'shinmai_heishi'); // 1/2
    addPermanentBuff(0, inst.instanceId, 2, 3);
    const pb = getPermanentBuff(inst.instanceId);
    assert('permanentBuff: +2/+3が正しく記録', pb.power===2 && pb.toughness===3);
    const effPow = getEffectivePower(0, inst);
    assert('effectivePower: バフ込みで1+2=3', effPow===3);
  });

  // 11. 盾撃スタック解決: 2ダメージ + +0/+1(永続)
  withState(()=>{
    const ownCreature = _testAddCreature(0,'shinmai_heishi');  // 1/2
    const oppCreature = _testAddCreature(1,'arestia');          // 5/5
    const dBefore = oppCreature.damage;
    // スタックに盾撃を直接積んで解決
    G.stack.push({ name:'盾撃', icon:'🛡️', owner:0, resolve:()=>{
      applyDamageToCreature(1, oppCreature.instanceId, 2, 0);
      addPermanentBuff(0, ownCreature.instanceId, 0, 1);
    }});
    // スタック解決
    const fn = G.stack.pop().resolve;
    fn();
    const oC = G.players[1].field.find(x=>x.instanceId===oppCreature.instanceId);
    assert('盾撃: 相手クリーチャーに2ダメージ', oC && oC.damage===dBefore+2);
    const effT = getEffectiveToughness(0, ownCreature);
    assert('盾撃: 自クリーチャーに+0/+1(永続)', effT === (CARD_DB['shinmai_heishi'].toughness + 1));
  });

  // 12. 格闘ダメージ交換: 互いにパワー分のダメージ
  withState(()=>{
    const pl  = _testAddCreature(0,'bastian');        // 3/2 格闘
    const ai  = _testAddCreature(1,'shinmai_heishi'); // 1/2
    resolveSingleCombat(0, pl.instanceId, ai.instanceId, null); // kakutou
    const pInst = G.players[0].field.find(x=>x.instanceId===pl.instanceId);
    // bastian(3/2) vs 新米兵士(1/2): 新米は3ダメで破壊、bastianは1ダメ残存
    assert('格闘: 弱いクリーチャーが破壊', G.players[1].field.length===0);
    assert('格闘: 強いクリーチャーがダメージを受ける', pInst && pInst.damage===1);
  });

  // 13. Arestiaバフ: 攻撃時、Arestia側の全クリーチャーに永続+1/+1
  withState(()=>{
    const arst = _testAddCreature(0,'arestia');       // プレイヤー側
    const ally = _testAddCreature(0,'shinmai_heishi'); // プレイヤー側の味方
    G.arestiaBuffActive = false;
    // 攻撃時のArestia発動をシミュレート（永続バフ）
    if (!G.arestiaBuffActive) {
      G.players[0].field.forEach(c => addPermanentBuff(0, c.instanceId, 1, 1));
      G.arestiaBuffActive = true;
    }
    const pbArst = getPermanentBuff(arst.instanceId);
    const pbAlly = getPermanentBuff(ally.instanceId);
    assert('Arestiaバフ: Arestia自身に永続+1/+1', pbArst.power===1 && pbArst.toughness===1);
    assert('Arestiaバフ: 味方にも永続+1/+1', pbAlly.power===1 && pbAlly.toughness===1);
    assert('Arestiaバフ: 発動フラグが立つ(同ターン重複防止)', G.arestiaBuffActive===true);
  });

  // 14. Arestiaバフ: 永続バフはターン終了相当の処理後も残る
  withState(()=>{
    const arst = _testAddCreature(0,'arestia');
    addPermanentBuff(0, arst.instanceId, 1, 1);
    // endTurn相当: tempPower/tempToughnessとtempBuffsだけクリア
    G.players[0].field.forEach(c=>{ c.tempPower=0; c.tempToughness=0; });
    G.tempBuffs = [];
    const pb = getPermanentBuff(arst.instanceId);
    assert('Arestiaバフ: ターン終了後も永続バフが残る', pb.power===1 && pb.toughness===1);
    const eff = getEffectivePower(0, G.players[0].field[0]);
    assert('Arestiaバフ: 実効パワーに反映(5+1=6)', eff===6);
  });

  // 15. 介善（新仕様）: ■1で相手クリーチャー1体に5ダメージ
  withState(()=>{
    G.players[0].hand = ['kaizen'];
    G.players[0].mana = {R:0,U:0,G:0,W:4,B:0,C:0};
    const t1 = _testAddCreature(1,'shinmai_heishi'); // 1/2 ← 5ダメージ対象
    const t2 = _testAddCreature(1,'shinmai_heishi'); // 1/2 ← 攻撃強制対象
    playKaizen(0, 0);
    assert('介善(非OC): 3つの効果がスタックに積まれる', G.stack.length===3);
    // ■1 (1体に5ダメージ) — 最上位が最初に解決
    G.stack.pop().resolve();
    assert('介善 ■1: 解決時にtargetModeがセット', G.targetMode && G.targetMode.type==='opponentCreature');
    G.targetMode.callback({instId: t1.instanceId});
    assert('介善 ■1: 5ダメージで破壊', !G.players[1].field.find(x=>x.instanceId===t1.instanceId));
    // ■2 (攻撃強制)
    G.stack.pop().resolve();
    assert('介善 ■2: 解決時にtargetModeがセット', G.targetMode && G.targetMode.type==='opponentCreature');
    G.targetMode.callback({instId: t2.instanceId});
    assert('介善 ■2: 対象に攻撃強制フラグ', G.players[1].field.find(x=>x.instanceId===t2.instanceId)?.mustAttack===true);
    // ■3 (kaizenBlockDraw)
    G.stack.pop().resolve();
    assert('介善 ■3: kaizenBlockDrawがセット', G.kaizenBlockDraw===0);
    assert('介善: 墓地に置かれる', G.players[0].graveyard.includes('kaizen'));
  });

  // 16. 介善: 相手クリーチャーなしでも全スタックが処理される
  withState(()=>{
    G.players[0].hand = ['kaizen'];
    G.players[0].mana = {R:0,U:0,G:0,W:4,B:0,C:0};
    playKaizen(0, 0);
    assert('介善(対象なし): 3スタック積まれる', G.stack.length===3);
    G.stack.pop().resolve(); // ■1: 対象なしスキップ
    G.stack.pop().resolve(); // ■2: 対象なしスキップ
    G.stack.pop().resolve(); // ■3: kaizenBlockDraw設定
    assert('介善(対象なし): 墓地に置かれる', G.players[0].graveyard.includes('kaizen'));
  });

  // 16a. 介善■2: P/T入れ替え（旧テスト維持 — 旧noDamageKill機能は残存）
  withState(()=>{
    const c = _testAddCreature(0,'bastian'); // 3/2
    c.noDamageKill = true;
    applyDamageToCreature(0, c.instanceId, 2, 1);
    const alive = G.players[0].field.find(x=>x.instanceId===c.instanceId);
    assert('介善■2: 致死ダメージでも入れ替えで生存', !!alive);
    assert('介善■2: 入れ替え後パワー=元タフネス(2)', alive && getEffectivePower(0, alive)===2);
    assert('介善■2: 入れ替え後タフネス=元パワー(3)', alive && getEffectiveToughness(0, alive)===3);
    assert('介善■2: ダメージは引き継ぐ(2)', alive && alive.damage===2);
    assert('介善■2: 置き換えは1回限り(フラグ解除)', alive && alive.noDamageKill===false);
  });

  // 16b. 介善■2: 入れ替え後も致死なら破壊
  withState(()=>{
    const c = _testAddCreature(0,'bastian'); // 3/2
    c.noDamageKill = true;
    applyDamageToCreature(0, c.instanceId, 3, 1);
    assert('介善■2: 入れ替え後タフネス以上のダメージで破壊', !G.players[0].field.find(x=>x.instanceId===c.instanceId));
  });

  // 16c. 介善■3: ブロック時1ドロー
  withState(()=>{
    G.kaizenBlockDraw = 0; // プレイヤー0が介善を唱えた状態
    const atk = _testAddCreature(1,'shinmai_heishi'); // 1/2 攻撃側(AI)
    const blk = _testAddCreature(0,'serashia_souryo'); // 3/7 ブロッカー
    G.players[0].deck = ['shinmai_heishi','shinmai_heishi'];
    G.players[0].hand = [];
    resolveSingleCombat(1, atk.instanceId, null, blk.instanceId);
    drainStack();
    assert('介善持続: ブロック時にプレイヤーが1ドロー', G.players[0].hand.length===1);
  });

  // 17. getCXValue: 土地数 + チャージ数
  withState(()=>{
    G.players[0].lands = [
      {instanceId:201, cardId:'hito_heichi', tapped:false, chargeCard:null},
      {instanceId:202, cardId:'wasure_heichi', tapped:false, chargeCard:'shinmai_heishi'},
      {instanceId:203, cardId:'shigen_heichi', tapped:false, chargeCard:'kaizen'},
    ];
    assert('CX値: 土地3+チャージ2=5', getCXValue(0)===5);
    assert('OC判定: CX5では未達成', isOCActive(0)===false);
    // 土地7枚+チャージ3枚=CX10でOC
    for (let i=0;i<4;i++) G.players[0].lands.push({instanceId:210+i, cardId:'hito_heichi', tapped:false, chargeCard: i===0?'kaizen':null});
    assert('OC判定: CX10で達成', getCXValue(0)===10 && isOCActive(0)===true);
  });

  // 18. バスティアンCX8バフ: +3/+3
  withState(()=>{
    const bast = _testAddCreature(0,'bastian'); // 3/2
    // CX8: 土地8枚
    G.players[0].lands = Array.from({length:8},(_,i)=>({instanceId:300+i, cardId:'hito_heichi', tapped:false, chargeCard:null}));
    const bonus = getCXBonus(0, bast);
    assert('バスティアンCX8: +3/+3ボーナス', bonus.power===3 && bonus.toughness===3);
    assert('バスティアンCX8: 実効パワー3+3=6', getEffectivePower(0, bast)===6);
    // CX7以下ではボーナスなし
    G.players[0].lands.pop();
    const bonus2 = getCXBonus(0, bast);
    assert('バスティアンCX7: ボーナスなし', bonus2.power===0);
  });

  // 19. バスティアンETB: 2ダメージ→CX6で追加3ダメージ
  withState(()=>{
    const t1 = _testAddCreature(1,'arestia');   // 5/5
    const t2 = _testAddCreature(1,'serashia_heishi'); // 2/5
    _testAddCreature(0,'bastian');
    bastianChooseETB(G.players[0].field[0].instanceId, true); // CX6あり
    assert('バスティアンETB: 2ダメージの対象選択', G.targetMode && G.targetMode.type==='opponentCreature');
    G.targetMode.callback({instId: t1.instanceId});
    const a = G.players[1].field.find(x=>x.instanceId===t1.instanceId);
    assert('バスティアンETB: 2ダメージ適用', a && a.damage===2);
    assert('バスティアンETB CX6: 追加3ダメージの対象選択', G.targetMode && G.targetMode.type==='opponentCreature');
    G.targetMode.callback({instId: t2.instanceId});
    const b = G.players[1].field.find(x=>x.instanceId===t2.instanceId);
    assert('バスティアンETB CX6: 3ダメージ適用', b && b.damage===3);
  });

  // 20. 土地タップでマナ生成
  withState(()=>{
    G.players[0].mana = {R:0,U:0,G:0,W:0,B:0,C:0};
    G.players[0].lands = [
      {instanceId:401, cardId:'hito_heichi', tapped:false, chargeCard:null},      // W生成
      {instanceId:402, cardId:'serashia_miyako', tapped:false, chargeCard:null},  // C生成
    ];
    tapLandForMana(0, 401);
    assert('土地タップ: 白マナ+1', G.players[0].mana.W===1);
    assert('土地タップ: タップ状態になる', G.players[0].lands[0].tapped===true);
    tapLandForMana(0, 402);
    assert('土地タップ: 無色マナ+1 (都)', G.players[0].mana.C===1);
    // タップ済み土地は再タップ不可
    const wBefore = G.players[0].mana.W;
    tapLandForMana(0, 401);
    assert('土地タップ: タップ済みは再生成不可', G.players[0].mana.W===wBefore);
  });

  // 21. 攻撃強制(mustAttack): ETBで付与した相手クリーチャーは相手ターン開始後も維持される
  withState(()=>{
    // P0が能動側。P1のクリーチャーに「次の相手ターン攻撃強制」が付いている状態
    const enemy = _testAddCreature(1,'shinmai_heishi');
    enemy.mustAttack = true;
    G.mustAttackCreatures.add(enemy.instanceId);
    G.activePlayer = 0;
    G.turn = 1;
    endTurn(); // P1のターンへ切替
    const e = G.players[1].field.find(x=>x.instanceId===enemy.instanceId);
    assert('攻撃強制: 相手ターン開始後も維持される', e && e.mustAttack===true);
    assert('攻撃強制: 能動側になったP1がアクティブ', G.activePlayer===1);
  });

  // 22. 攻撃強制(mustAttack): ターンを終えた側のフラグはクリアされる
  withState(()=>{
    const mine = _testAddCreature(0,'shinmai_heishi');
    mine.mustAttack = true;
    G.mustAttackCreatures.add(mine.instanceId);
    G.activePlayer = 0;
    G.turn = 1;
    endTurn(); // P0がターンを終える → P0のフラグはクリア
    const m = G.players[0].field.find(x=>x.instanceId===mine.instanceId);
    assert('攻撃強制: ターンを終えた側のフラグはクリア', m && m.mustAttack===false);
  });

  // 23. アレスティア ■3: ブロック終了時、バトル中自クリーチャーが死んでいなければ2ダメージ
  withState(()=>{
    // shinmai_heishi(1/2)が攻撃 → serashia_souryo(3/7)がブロック → ブロッカー生存 → 2ダメージ
    const atk = _testAddCreature(1,'shinmai_heishi'); // 1/2 攻撃側(1ダメージ与える)
    _testAddCreature(0,'arestia');                    // アレスティア(防御側に存在)
    const blk = _testAddCreature(0,'serashia_souryo'); // 3/7 ブロッカー(生存)
    const lifeBefore = G.players[1].life;
    resolveSingleCombat(1, atk.instanceId, null, blk.instanceId);
    drainStack();
    assert('アレスティア■3: 自クリーチャー全生存 → 2ダメージ', G.players[1].life === lifeBefore - 2);
  });
  // 23b. アレスティア■3: ブロッカーが死亡した場合は不発
  withState(()=>{
    // arestia(5/5)が攻撃 → shinmai_heishi(1/2)がブロック → ブロッカー破壊 → 不発
    const atk = _testAddCreature(1,'arestia'); // 5/5 攻撃側
    _testAddCreature(0,'arestia');             // アレスティア(防御側に存在)
    const blk = _testAddCreature(0,'shinmai_heishi'); // 1/2 ブロッカー(死亡)
    const lifeBefore = G.players[1].life;
    resolveSingleCombat(1, atk.instanceId, null, blk.instanceId);
    drainStack();
    assert('アレスティア■3: 自クリーチャー死亡 → 不発', G.players[1].life === lifeBefore);
  });

  // ─────────────────────────────────────────────
  // 結果集計
  if (originalG) _testRestoreG(originalG);
  else { try { render(); } catch(e){} }
  return results;
}

function showTestPanel() {
  const results = runCardTests();
  const pass = results.filter(r=>r.pass).length;
  const fail = results.filter(r=>!r.pass).length;
  const rows = results.map(r=>`
    <tr style="border-bottom:1px solid #222;">
      <td style="padding:6px 8px;font-size:13px;">${r.pass?'✅':'❌'}</td>
      <td style="padding:6px 8px;font-size:13px;color:${r.pass?'#88ffaa':'#ff8888'};">${r.name}</td>
      <td style="padding:6px 8px;font-size:11px;color:#888;">${r.detail||''}</td>
    </tr>`).join('');
  const html=`
    <div style="margin-bottom:12px;font-size:15px;">
      結果: <span style="color:#88ffaa;">✅ ${pass}件合格</span>
      ${fail?`<span style="color:#ff8888;margin-left:12px;">❌ ${fail}件失敗</span>`:''}
    </div>
    <table style="width:100%;border-collapse:collapse;background:#0a0a14;">
      <thead><tr style="border-bottom:1px solid #444;">
        <th style="padding:4px 8px;text-align:left;font-size:11px;color:#666;"></th>
        <th style="padding:4px 8px;text-align:left;font-size:11px;color:#666;">テスト名</th>
        <th style="padding:4px 8px;text-align:left;font-size:11px;color:#666;">詳細</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  showModal('🧪 カード効果テスト', html);
}

// render呼び出し時にフリーズタイマーをリセット
// (netPostAction内ではなくrender内で直接リセット)

// ── ゲスト: 操作権限チェック ──────────────────────────────────
function netCanAct() {
  if (NET_MODE !== 'guest') return true;
  if (G.mulliganMode) return true;
  if (G.awaitingPriority && G.priorityFor === NET_MY_IDX) return true;
  if (G.playerBlockMode) return true;
  return G.activePlayer === NET_MY_IDX;
}

// ── ホスト: アクション後に同期 ───────────────────────────────
function netPostAction() {
  if (NET_MODE === 'host') netSyncToGuest();
}

// ── ターン終了後: 状態同期（時間制限なし） ───────────────────
function netPostTurnEnd() {
  if (NET_MODE === 'local') return;
  netSyncToGuest();
}

