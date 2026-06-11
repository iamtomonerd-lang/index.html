/**
 * DCG Freeze Fuzzer
 * ゲームをランダムに自動プレイして進行不能状態を検出・報告する
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ─── 設定 ──────────────────────────────────────────────────────────────────
const MAX_GAMES        = 200;    // 実行するゲーム数
const MAX_TICKS        = 5000;   // 1ゲームの最大tick数
const MAX_TURNS        = 80;     // 1ゲームの最大ターン数（この超えたら引き分けとみなす）
const STUCK_THRESHOLD  = 40;     // この回数アクションが進まなければフリーズ判定
const VERBOSE          = false;  // デバッグ用詳細ログ

// ─── HTML読み込み ──────────────────────────────────────────────────────────
const htmlPath = path.join(__dirname, 'index.html');
const html     = fs.readFileSync(htmlPath, 'utf8');

// ─── 結果集計 ──────────────────────────────────────────────────────────────
const results = {
  gamesCompleted: 0,
  gamesFinished:  0,   // phase==='ended'で終わった
  gamesFrozen:    0,
  freezeReports:  [],
};

// ─── ゲーム1回実行 ─────────────────────────────────────────────────────────
function runOneGame(gameIndex) {
  // 同期的なsetTimeout/setIntervalシミュレータ
  const pendingTimers = [];
  let timerIdCounter = 1;
  let tickCount = 0;

  const fakeWindow = {
    _timers: pendingTimers,
    setTimeout(fn, delay) {
      const id = timerIdCounter++;
      pendingTimers.push({ id, fn, delay });
      return id;
    },
    clearTimeout(id) {
      const i = pendingTimers.findIndex(t => t.id === id);
      if (i !== -1) pendingTimers.splice(i, 1);
    },
    setInterval() { return 0; },
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    getComputedStyle() { return new Proxy({}, { get(){ return ''; } }); },
    matchMedia() { return { matches: false, addEventListener() {} }; },
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    screen: { width: 1280, height: 800 },
    history: { pushState() {}, replaceState() {} },
    location: { href: 'http://localhost/', search: '', hash: '' },
    crypto: { getRandomValues(arr) { for(let i=0;i<arr.length;i++) arr[i]=Math.floor(Math.random()*256); return arr; } },
    Image: function() { return { onload:null, src:'' }; },
    SVGElement: function() {},
    HTMLElement: function() {},
    Element: function() {},
    Node: function() {},
    Event: function() {},
    CustomEvent: function() {},
  };

  // ダミーDOM要素（すべてのgetElementByIdを受け付ける）
  function makeEl(id) {
    return {
      id,
      textContent: '',
      innerHTML: '',
      style: new Proxy({}, { get(t,k){ return t[k]||''; }, set(t,k,v){ t[k]=v; return true; } }),
      className: '',
      classList: {
        _classes: new Set(),
        add(...cs)    { cs.forEach(c => this._classes.add(c)); },
        remove(...cs) { cs.forEach(c => this._classes.delete(c)); },
        contains(c)   { return this._classes.has(c); },
        toggle(c, v)  { if (v === undefined ? this._classes.has(c) : !v) this._classes.delete(c); else this._classes.add(c); },
      },
      disabled: false,
      value: '',
      checked: false,
      children: [],
      childNodes: [],
      offsetWidth: 100,
      offsetHeight: 100,
      scrollTop: 0,
      scrollHeight: 0,
      appendChild() {},
      removeChild() {},
      insertBefore() {},
      replaceChild() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      getBoundingClientRect() { return { left:0, top:0, width:100, height:100 }; },
      setAttribute() {},
      getAttribute() { return null; },
      hasAttribute() { return false; },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {},
      focus() {},
      blur() {},
      click() {},
    };
  }

  const elCache = {};
  function getEl(id) {
    if (!elCache[id]) elCache[id] = makeEl(id);
    return elCache[id];
  }

  // SVG / canvas ダミー
  const svgEl = {
    setAttribute() {}, style: {}, innerHTML: '',
    querySelectorAll() { return []; },
  };

  const fakeDocument = {
    getElementById(id) { return getEl(id); },
    createElement(tag) {
      const el = makeEl('_el_' + tag);
      el.tagName = tag.toUpperCase();
      el.appendChild = function(child) { this.children.push(child); this.childNodes.push(child); };
      return el;
    },
    createElementNS(ns, tag) { return fakeDocument.createElement(tag); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    body: makeEl('body'),
    head: makeEl('head'),
    documentElement: makeEl('html'),
  };

  // グローバル変数をまとめたコンテキスト
  const ctx = Object.assign({}, fakeWindow, {
    document: fakeDocument,
    window: fakeWindow,
    navigator: { userAgent: 'Node/fuzzer' },
    location: { href: 'http://localhost/', search: '' },
    performance: { now() { return Date.now(); } },
    requestAnimationFrame(fn) { fakeWindow.setTimeout(fn, 16); },
    cancelAnimationFrame(id) { fakeWindow.clearTimeout(id); },
    console: {
      log() {}, warn() {}, error() {},
    },
    alert() {},
    confirm() { return true; },
    Peer: function() { return { on(){}, id: 'test' }; },  // PeerJS mock
    _look3Cards: undefined,
    _look3Player: 0,
    _mulliganChosen: undefined,
    _mulliganHand: undefined,
  });

  // <script>タグ内のJSをすべて抽出
  const scriptRe = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptContent = '';
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    scriptContent += m[1] + '\n';
  }
  // vm contextでは let/const のトップレベル宣言がグローバルオブジェクトに付かないため
  // 重要なグローバル変数を var に変換して sandbox から参照できるようにする
  scriptContent = scriptContent
    .replace(/^let G;/m, 'var G;')
    .replace(/^const CARD_DB\s*=/m, 'var CARD_DB =')
    .replace(/^const AI_WEIGHTS_VERSION\s*=/m, 'var AI_WEIGHTS_VERSION =')
    .replace(/^const AI_WEIGHTS_DEFAULT\s*=/m, 'var AI_WEIGHTS_DEFAULT =')
    .replace(/^let NET_MODE\s*=/m, 'var NET_MODE =')
    .replace(/^let NET_PEER\s*=/m, 'var NET_PEER =')
    .replace(/^let NET_CONN\s*=/m, 'var NET_CONN =')
    .replace(/^let NET_MY_IDX\s*=/m, 'var NET_MY_IDX =')
    .replace(/^let NET_ROOM_ID\s*=/m, 'var NET_ROOM_ID =')
    .replace(/^let _aiBalloonTimer\s*=/m, 'var _aiBalloonTimer =');

  // コンテキスト内でスクリプトを実行
  const keys   = Object.keys(ctx);
  const vals   = Object.values(ctx);
  try {
    const fn = new Function(...keys, scriptContent);
    fn(...vals);
  } catch(e) {
    // 初期化時エラーは致命的
    console.error(`[Game ${gameIndex}] Init error:`, e.message);
    return null;
  }

  // ゲーム関数へのアクセス
  // スクリプトがグローバルに宣言した変数はctxには入らないので
  // evalベースで取得（Function内でvarはFunctionスコープなので少し工夫が必要）
  // → 別アプローチ: グローバルオブジェクトとしてctxを使う
  // 実際にはwindowオブジェクトに関数が生えるよう再実行する

  // ─── vmを使った別アプローチ ───────────────────────────────────────────────
  // Function()スコープでは宣言した変数は外から見えないため、
  // ctxオブジェクトをProxyで全グローバル書き込みをキャプチャする

  const globalVars = {};
  const proxyCtx = new Proxy(ctx, {
    set(target, key, val) {
      target[key] = val;
      globalVars[key] = val;
      return true;
    },
    get(target, key) {
      if (key in target) return target[key];
      if (key in globalVars) return globalVars[key];
      return undefined;
    },
  });

  // 再実行（今度はproxyCtxで）
  Object.keys(globalVars).forEach(k => delete globalVars[k]);
  try {
    const keys2 = Object.keys(ctx);
    const fn2 = new Function(...keys2, 'with(arguments[arguments.length-1]){' + scriptContent + '}');
    fn2(...Object.values(ctx), proxyCtx);
  } catch(e) {
    // withブロックでの実行エラー
  }

  // G（ゲーム状態）とゲーム関数を取得
  let G, startGame, endPhase, passPriority, endTurn, handleFieldClick, handleLandClick,
      handleHandClick, render, updateHints, confirmBlock, doMulligan;

  // with()が難しいので、直接evalを使わず、スクリプトを再パース
  // → 最もシンプルな方法: vmモジュールを使う
  const vm = require('vm');

  const sandbox = Object.assign({}, ctx);
  // グローバル参照のためwith相当をsandboxで
  try {
    const script = new vm.Script(scriptContent, { filename: 'index.html' });
    const vmCtx  = vm.createContext(sandbox);
    script.runInContext(vmCtx);
  } catch(e) {
    if (VERBOSE) console.error(`[Game ${gameIndex}] VM init error:`, e.message.slice(0, 100));
    return null;
  }

  if (!sandbox.initGame) {
    if (VERBOSE) console.error(`[Game ${gameIndex}] initGame not found in sandbox`);
    return null;
  }

  // タイマーを同期的に全部消化するヘルパー
  function drainTimers(maxDrains = 200) {
    let count = 0;
    while (sandbox._timers && sandbox._timers.length > 0 && count < maxDrains) {
      const timers = [...sandbox._timers];
      sandbox._timers.length = 0;
      timers.sort((a, b) => a.delay - b.delay);
      for (const t of timers) {
        try { t.fn(); } catch(e) {
          if (VERBOSE) console.error(`Timer fn error: ${e.message.slice(0,80)}`);
        }
      }
      count++;
    }
  }

  // sandboxのsetTimeout/clearTimeoutをタイマーリストに向ける
  sandbox._timers = [];
  sandbox.setTimeout = function(fn, delay) {
    const id = timerIdCounter++;
    sandbox._timers.push({ id, fn, delay: delay || 0 });
    return id;
  };
  sandbox.clearTimeout = function(id) {
    const i = (sandbox._timers || []).findIndex(t => t.id === id);
    if (i !== -1) sandbox._timers.splice(i, 1);
  };
  sandbox.setInterval = function() { return 0; };
  sandbox.clearInterval = function() {};

  // render/updateHintsをno-opに
  sandbox.render = function() {};
  sandbox.updateHints = function() {};
  sandbox.renderStack = function() {};
  sandbox.renderHand = function() {};
  sandbox.renderField = function() {};
  sandbox.renderLands = function() {};
  sandbox.showPhaseFlash = function() {};
  sandbox.showAIBalloon = function() {};
  sandbox.showModal = function() {};
  sandbox.closeModal = function() {};
  sandbox.showFloatDamage = function() {};
  sandbox.log = function() {};
  sandbox._resetFreezeTimer = function() {};

  // ゲーム開始
  try {
    sandbox.NET_MODE = 'local';
    sandbox.NET_MY_IDX = 0;
    sandbox.initGame();
    drainTimers();
  } catch(e) {
    if (VERBOSE) console.error(`[Game ${gameIndex}] initGame error: ${e.message.slice(0,100)}`);
    return null;
  }

  G = sandbox.G;
  if (!G) return null;

  // ─── ランダム自動プレイ ─────────────────────────────────────────────────
  let lastPhase     = G.phase;
  let lastTurn      = G.turn;
  let lastStackLen  = (G.stack || []).length;
  let lastFieldHash = '';

  function fieldHash() {
    try {
      // ターン番号を除いた状態ハッシュ（ターン進行は進捗としてカウントしない）
      return JSON.stringify({
        phase: G.phase,
        ap: G.activePlayer,
        modes: [G.awaitingPriority, G.priorityFor, G.playerBlockMode,
                !!G.targetMode, G.targetMode && G.targetMode.type,
                G.kakutouTargetMode, G.attackMode, G.chargingMode],
        stack: (G.stack||[]).length,
        p0: { life: G.players[0].life,
              field: G.players[0].field.map(c=>c.instanceId+':'+c.tapped+':'+c.damage),
              handSize: G.players[0].hand.length },
        p1: { life: G.players[1].life,
              field: G.players[1].field.map(c=>c.instanceId+':'+c.tapped+':'+c.damage),
              handSize: G.players[1].hand.length },
      });
    } catch(e) { return ''; }
  }

  let sameHashCount = 0;

  function isProgressMade() {
    const h = fieldHash();
    if (h === lastFieldHash) {
      sameHashCount++;
    } else {
      sameHashCount = 0;
      lastFieldHash = h;
    }
    lastPhase    = G.phase;
    lastTurn     = G.turn;
    lastStackLen = (G.stack||[]).length;
    // フリーズ判定: 同じ状態がSTUCK_THRESHOLD回以上続く
    return sameHashCount < STUCK_THRESHOLD;
  }

  // 利用可能なアクションを列挙してランダムに1つ実行
  function randomAction() {
    const actions = [];

    // 優先権パス (プレイヤー) / AIの優先権: タイマー消化で自動処理
    if (G.awaitingPriority) {
      if (G.priorityFor === 0) {
        actions.push(() => { sandbox.passPriority && sandbox.passPriority(); drainTimers(); });
      } else {
        // AI優先権: aiHandlePriorityがsetTimeoutで呼ばれるのでタイマー消化
        actions.push(() => {
          if (sandbox.aiHandlePriority) sandbox.aiHandlePriority();
          drainTimers();
        });
      }
    }

    // フェイズ終了
    if (!G.awaitingPriority && !G.playerBlockMode && !G.targetMode &&
        !G.kakutouTargetMode && !G.chargingMode && G.activePlayer === 0 &&
        G.phase === 'main') {
      actions.push(() => { sandbox.endPhase && sandbox.endPhase(); drainTimers(); });
    }

    // ブロック確定（playerBlockMode中）
    if (G.playerBlockMode) {
      actions.push(() => { sandbox.endPhase && sandbox.endPhase(); drainTimers(); });
    }

    // targetMode: ターンに関わらず人間プレイヤーが対象を選ぶ
    if (G.targetMode) {
      const tm = G.targetMode;
      let candidates = [];
      if (tm.type === 'opponentCreature') {
        // 「相手クリーチャー」= 現在のtargetModeを設定した側の相手 (通常P0から見てP1)
        // atkPlayer=1(AI)がattackし、P0のブロッカーがdamage2attackerでtargetModeを設定した場合も含む
        candidates = G.players[1].field.length > 0 ? G.players[1].field : G.players[0].field;
        // より正確に: opponentCreatureはG.players[1]のクリーチャーを対象にする（P0視点）
        candidates = G.players[1].field;
      } else if (tm.type === 'ownCreature') {
        candidates = G.players[tm.owner !== undefined ? tm.owner : 0].field;
      } else if (tm.type === 'creature' || tm.type === 'any') {
        candidates = [...G.players[0].field, ...G.players[1].field];
      }
      if (candidates.length > 0) {
        const tgt = candidates[Math.floor(Math.random() * candidates.length)];
        actions.push(() => {
          try {
            if (G.targetMode && G.targetMode.callback) {
              const pIdx = G.players[1].field.includes(tgt) ? 1 : 0;
              G.targetMode.callback({ type:'creature', player: pIdx, instId: tgt.instanceId });
            }
          } catch(e) {}
          drainTimers();
        });
      } else {
        // 対象なし → targetMode強制クリア（フリーズ回避）
        actions.push(() => { G.targetMode = null; drainTimers(); });
      }
    }

    // 格闘ターゲット選択
    if (G.kakutouTargetMode) {
      const targets = G.players[1].field;
      if (targets.length > 0) {
        const tgt = targets[Math.floor(Math.random() * targets.length)];
        actions.push(() => {
          try {
            sandbox.handleFieldClick && sandbox.handleFieldClick(1, tgt.instanceId);
          } catch(e) {}
          drainTimers();
        });
      } else {
        actions.push(() => {
          G.kakutouTargetMode = false;
          G.pendingKakutouInstId = null;
          G.combatArrows = [];
          drainTimers();
        });
      }
    }

    // 手札から土地以外のカードをプレイ（プレイヤーターン・メインフェイズ）
    if (!G.awaitingPriority && !G.playerBlockMode && !G.targetMode &&
        !G.kakutouTargetMode && !G.chargingMode && G.activePlayer === 0 && G.phase === 'main') {

      const p = G.players[0];
      p.hand.forEach((cid, i) => {
        const card = sandbox.CARD_DB && sandbox.CARD_DB[cid];
        if (!card) return;
        if (card.type === 'land') {
          if (G.landPlacedThisTurn < 2) {
            actions.push(() => {
              try { sandbox.handleHandClick && sandbox.handleHandClick(0, i); } catch(e) {}
              drainTimers();
            });
          }
        } else {
          if (sandbox.canAfford && sandbox.canAfford(0, card.cost)) {
            // targetModeが必要なカードには対象選択アクションを後で処理
            actions.push(() => {
              try { sandbox.handleHandClick && sandbox.handleHandClick(0, i); } catch(e) {}
              drainTimers();
            });
          }
        }
      });

      // フィールドクリーチャーをクリック（格闘・タップ起動など）
      p.field.forEach(inst => {
        if (!inst.tapped && !inst.sick) {
          actions.push(() => {
            try { sandbox.handleFieldClick && sandbox.handleFieldClick(0, inst.instanceId); } catch(e) {}
            drainTimers();
          });
        }
      });

      // 土地タップ
      p.lands.forEach(land => {
        if (!land.tapped) {
          actions.push(() => {
            try { sandbox.tapLandForMana && sandbox.tapLandForMana(0, land.instanceId); } catch(e) {}
            drainTimers();
          });
        }
      });
    }

    // AIターンで詰まった場合のフォールバック: 直接aiAttackを呼ぶ
    // (タイマー消化済みでも aiAttack が呼ばれていない場合の救済)
    if (G.activePlayer === 1 && G.phase === 'main' &&
        !G.awaitingPriority && !G.playerBlockMode && !G.targetMode &&
        !G.kakutouTargetMode && !G.attackMode) {
      actions.push(() => {
        // aiTurnが完了しているはずなので、aiAttackを直接起動
        try { sandbox.aiAttack && sandbox.aiAttack(); } catch(e) {}
        drainTimers();
      });
    }

    // look3keep1: モーダル処理
    if (sandbox._look3Cards && sandbox._look3Cards.length > 0) {
      const whites = sandbox._look3Cards.filter(cid => {
        const c = sandbox.CARD_DB && sandbox.CARD_DB[cid];
        return c && c.color === 'W';
      });
      if (whites.length > 0) {
        const pick = whites[0];
        actions.push(() => {
          try {
            const p = G.players[sandbox._look3Player || 0];
            p.hand.push(pick);
            const rest = sandbox._look3Cards.filter(c2 => c2 !== pick);
            rest.forEach(c2 => p.deck.push(c2));
            sandbox._look3Cards = null;
            sandbox.closeModal && sandbox.closeModal();
          } catch(e) {}
          drainTimers();
        });
      } else {
        actions.push(() => {
          try { sandbox.look3NoKeep && sandbox.look3NoKeep(); } catch(e) {}
          drainTimers();
        });
      }
    }

    if (actions.length === 0) return false;

    // ランダムにアクションを選択
    const act = actions[Math.floor(Math.random() * actions.length)];
    act();
    return true;
  }

  // P0ターン開始時に全土地をタップする（マナ確保）
  function tapAllLands() {
    if (G.activePlayer === 0 && G.phase === 'main') {
      const p = G.players[0];
      p.lands.forEach(land => {
        if (!land.tapped) {
          try { sandbox.tapLandForMana && sandbox.tapLandForMana(0, land.instanceId); } catch(e) {}
        }
      });
    }
  }

  // メインループ
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    if (!G || G.phase === 'ended') {
      results.gamesFinished++;
      return null;  // 正常終了
    }

    // ターン上限: 引き分け状態（フリーズではない）
    if (G.turn > MAX_TURNS) return null;

    drainTimers(50);
    tapAllLands();

    const acted = randomAction();

    if (!isProgressMade()) {
      // フリーズ検出！（同じ状態がSTUCK_THRESHOLD回継続）
      return collectFreezeState(G, sandbox, gameIndex, tick);
    }

    tickCount++;
  }

  // MAX_TICKS到達 = ゲームが非常に長い（フリーズではなく引き分け的状態）
  return null;
}

// ─── フリーズ状態の収集 ─────────────────────────────────────────────────────
function collectFreezeState(G, sandbox, gameIndex, tick) {
  if (!G) return null;
  try {
    const p0 = G.players[0];
    const p1 = G.players[1];
    const CARD_DB = sandbox.CARD_DB || {};

    function descField(p, pi) {
      return p.field.map(c => {
        const card = CARD_DB[c.cardId] || {};
        const flags = [
          c.tapped ? 'tapped' : 'untap',
          c.sick   ? 'sick'   : '',
          c.entryTurn === G.turn ? 'entryTurn' : '',
          c.mustAttack ? 'mustAtk' : '',
          c.damage > 0 ? `dmg${c.damage}` : '',
        ].filter(Boolean).join(',');
        return `  [${c.instanceId}] ${card.name||c.cardId}(${(card.power||0)+((c.tempPower||0)+(c.permPower||0))}/${(card.toughness||0)+((c.tempToughness||0)+(c.permToughness||0))}) ${flags}`;
      }).join('\n') || '  (なし)';
    }

    const mustIds = [...(G.mustAttackCreatures || [])];
    const stackDesc = (G.stack||[]).map(s => s.name).join(', ') || 'なし';

    return {
      gameIndex,
      tick,
      turn: G.turn,
      activePlayer: G.activePlayer,
      phase: G.phase,
      p0Life: p0.life,
      p1Life: p1.life,
      p0Field: descField(p0, 0),
      p1Field: descField(p1, 1),
      awaitingPriority: G.awaitingPriority,
      priorityFor: G.priorityFor,
      playerBlockMode: G.playerBlockMode,
      targetMode: G.targetMode ? G.targetMode.type : null,
      kakutouTargetMode: G.kakutouTargetMode,
      attackMode: G.attackMode,
      chargingMode: G.chargingMode,
      mustAttackCreatures: mustIds,
      stackDesc,
      aiCurrentAttackers: (G.aiCurrentAttackers||[]).map(a => a.instId),
      p0HandSize: p0.hand.length,
      p1HandSize: p1.hand.length,
    };
  } catch(e) {
    return { gameIndex, tick, error: e.message };
  }
}

// ─── レポート出力 ──────────────────────────────────────────────────────────
function printReport(freeze) {
  console.log('\n' + '═'.repeat(60));
  console.log(`🐛 フリーズ検出 [ゲーム${freeze.gameIndex}  tick:${freeze.tick}]`);
  console.log('═'.repeat(60));
  if (freeze.error) { console.log('  エラー:', freeze.error); return; }
  console.log(`ターン: ${freeze.turn}  アクティブ: P${freeze.activePlayer}  フェイズ: ${freeze.phase}`);
  console.log(`\n[プレイヤー0] ライフ:${freeze.p0Life} 手札:${freeze.p0HandSize}`);
  console.log(freeze.p0Field);
  console.log(`\n[プレイヤー1] ライフ:${freeze.p1Life} 手札:${freeze.p1HandSize}`);
  console.log(freeze.p1Field);
  console.log(`\n優先権待ち: ${freeze.awaitingPriority}  優先権プレイヤー: ${freeze.priorityFor}`);
  console.log(`ブロックモード: ${freeze.playerBlockMode}  targetMode: ${freeze.targetMode}`);
  console.log(`格闘モード: ${freeze.kakutouTargetMode}  攻撃モード: ${freeze.attackMode}`);
  console.log(`チャージモード: ${freeze.chargingMode}`);
  console.log(`mustAttackCreatures: [${freeze.mustAttackCreatures.join(',')}]`);
  console.log(`aiCurrentAttackers: [${freeze.aiCurrentAttackers.join(',')}]`);
  console.log(`スタック: ${freeze.stackDesc}`);
}

// ─── メイン実行 ────────────────────────────────────────────────────────────
console.log(`\n🔍 DCG フリーズ検出器 起動`);
console.log(`   ${MAX_GAMES}ゲームを実行します...\n`);

const start = Date.now();

for (let i = 0; i < MAX_GAMES; i++) {
  if (i % 20 === 0) {
    process.stdout.write(`\r   進捗: ${i}/${MAX_GAMES} ゲーム完了  フリーズ: ${results.gamesFrozen}件`);
  }

  let freeze = null;
  try {
    freeze = runOneGame(i + 1);
  } catch(e) {
    if (VERBOSE) console.error(`[Game ${i+1}] Unexpected: ${e.message.slice(0,100)}`);
  }

  results.gamesCompleted++;

  if (freeze) {
    results.gamesFrozen++;
    results.freezeReports.push(freeze);
    printReport(freeze);
    // 同一フリーズが多すぎる場合は早期終了
    if (results.gamesFrozen >= 20) {
      console.log('\n\n⚠️  フリーズが20件に達したため中断します');
      break;
    }
  } else {
    results.gamesFinished++;
  }
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log('\n\n' + '═'.repeat(60));
console.log('📊 結果サマリー');
console.log('═'.repeat(60));
console.log(`  実行ゲーム数:     ${results.gamesCompleted}`);
console.log(`  正常終了:         ${results.gamesFinished}`);
console.log(`  フリーズ検出:     ${results.gamesFrozen}`);
console.log(`  経過時間:         ${elapsed}秒`);

if (results.gamesFrozen === 0) {
  console.log('\n✅ フリーズは検出されませんでした');
} else {
  console.log(`\n❌ ${results.gamesFrozen}件のフリーズ条件を検出しました`);

  // フリーズのグルーピング（同じ状況を重複排除）
  const seen = new Set();
  const unique = results.freezeReports.filter(f => {
    if (f.error) return false;
    const key = `${f.phase}:${f.activePlayer}:${f.targetMode}:${f.awaitingPriority}:${f.playerBlockMode}:${f.kakutouTargetMode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n  ユニークなフリーズパターン: ${unique.length}件`);
  unique.forEach((f, idx) => {
    console.log(`  [${idx+1}] ターン${f.turn} P${f.activePlayer} ${f.phase} | target:${f.targetMode} priority:${f.awaitingPriority} block:${f.playerBlockMode}`);
  });
}
console.log('');
