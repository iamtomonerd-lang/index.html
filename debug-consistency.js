#!/usr/bin/env node
/**
 * DCG デバッグ・整合性チェッカー
 *
 * 検査内容:
 * 1. カードテキスト ↔ プロパティ整合性チェック
 *    (例: テキストに「飛行」があるのに flying:true がないカード等)
 * 2. SimGame ↔ 実ゲームロジック整合性チェック
 *    (同一シナリオで両者の結果を比較)
 * 3. ETBプロパティ ↔ resolveETBEffect 実装チェック
 *
 * 使用方法:
 *   node debug-consistency.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
// ゲーム本体は複数ファイル（cards.js, game.js, …）へ分割済み。
// 共有ローダで読み込み順どおり連結したソースを取得する（CARD_DB等を含む）。
const html = require('./test/loadGame').gameSource();

// ─── HTMLからコードブロックを抽出 ───────────────────────────
function extractBetween(src, startMarker, endMarker) {
  const si = src.indexOf(startMarker);
  if (si === -1) return null;
  const ei = src.indexOf(endMarker, si + startMarker.length);
  if (ei === -1) return null;
  return src.slice(si + startMarker.length, ei);
}

// CARD_DB を eval で取得（JSを部分実行）
function extractCardDB(html) {
  // CARD_DB = { ... } の範囲を正規表現で抽出
  const m = html.match(/const CARD_DB\s*=\s*\{/);
  if (!m) throw new Error('CARD_DB not found');
  let depth = 0, start = m.index, i = m.index;
  while (i < html.length) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    i++;
  }
  const block = html.slice(start, i);
  // eval 用に const を除去
  const code = block.replace(/^const /, '');
  try {
    let CARD_DB;
    eval(code);
    return CARD_DB;
  } catch (e) {
    throw new Error('CARD_DB eval failed: ' + e.message);
  }
}

// resolveETBEffect の実装を文字列として取得
function extractResolveETB(html) {
  const start = html.indexOf('function resolveETBEffect(');
  if (start === -1) return '';
  let depth = 0, i = start, started = false;
  while (i < html.length) {
    if (html[i] === '{') { depth++; started = true; }
    else if (html[i] === '}') { depth--; if (started && depth === 0) { i++; break; } }
    i++;
  }
  return html.slice(start, i);
}

// ─── 1. カードテキスト ↔ プロパティ整合性ルール ──────────────
const TEXT_PROP_RULES = [
  // [テキストに含まれるべき文字列, チェックすべきプロパティ, プロパティ値, エラーメッセージ]
  { textContains: '飛行',  prop: 'flying',      expect: true,  dir: 'both' },
  { textContains: '速攻',  prop: 'haste',       expect: true,  dir: 'both' },
  { textContains: '警戒',  prop: 'vigilance',   expect: true,  dir: 'both' },
  { textContains: '接死',  prop: 'deathtouch',  expect: true,  dir: 'both' },
  { textContains: '貫通',  prop: 'trample',     expect: true,  dir: 'both' },
  { textContains: '格闘',  prop: 'kakutou',     expect: true,  dir: 'both' },
  // prop→text のみ (テキストが日英混在するため)
  { textContains: '1枚引く', prop: 'etb',       expect: 'draw1', dir: 'prop2text' },
];

// dir: 'both' = テキスト有→prop必須 & prop有→テキスト必須
//      'prop2text' = prop有→テキスト必須のみ

function checkTextPropConsistency(CARD_DB) {
  const issues = [];

  for (const [cardId, card] of Object.entries(CARD_DB)) {
    if (card.type === 'land') continue; // 土地は除外
    const text = (card.text || '') + ' ' + (card.keywords || []).join(' ');

    for (const rule of TEXT_PROP_RULES) {
      const hasText = text.includes(rule.textContains);
      const propVal = card[rule.prop];
      const hasProp = rule.expect === true
        ? propVal === true
        : propVal === rule.expect;

      if (rule.dir === 'both' || rule.dir === 'text2prop') {
        if (hasText && !hasProp) {
          issues.push({
            card: cardId,
            name: card.name,
            msg: `テキストに「${rule.textContains}」があるが ${rule.prop}=${JSON.stringify(propVal)}`
          });
        }
      }
      if (rule.dir === 'both' || rule.dir === 'prop2text') {
        if (hasProp && !hasText) {
          issues.push({
            card: cardId,
            name: card.name,
            msg: `${rule.prop}=${JSON.stringify(rule.expect)} があるがテキストに「${rule.textContains}」なし`
          });
        }
      }
    }

    // ETBプロパティがあるのにテキストが空のカード
    if (card.etb && !card.text) {
      issues.push({ card: cardId, name: card.name, msg: `etb="${card.etb}" があるがテキストが空` });
    }

    // パワー/タフネスが未設定のクリーチャー
    if (card.type === 'creature') {
      if (card.power === undefined) issues.push({ card: cardId, name: card.name, msg: 'power が未定義' });
      if (card.toughness === undefined) issues.push({ card: cardId, name: card.name, msg: 'toughness が未定義' });
      if (card.cost === undefined) issues.push({ card: cardId, name: card.name, msg: 'cost が未定義' });
    }
  }
  return issues;
}

// ─── 2. ETBプロパティ ↔ resolveETBEffect 実装チェック ────────
function checkETBImplementation(CARD_DB, resolveETBSrc) {
  const issues = [];
  const etbValues = new Set();

  // CARD_DB内の全ETB値を収集
  for (const [cardId, card] of Object.entries(CARD_DB)) {
    if (card.etb) etbValues.add(card.etb);
  }

  // resolveETBEffect 内でハンドルされているETB値を収集
  const handledEtbs = new Set();
  const etbMatches = resolveETBSrc.matchAll(/card\.etb\s*===\s*['"]([^'"]+)['"]/g);
  for (const m of etbMatches) handledEtbs.add(m[1]);

  // 未実装ETBをチェック
  for (const etb of etbValues) {
    if (!handledEtbs.has(etb)) {
      const cards = Object.entries(CARD_DB)
        .filter(([,c]) => c.etb === etb)
        .map(([,c]) => c.name).join(', ');
      issues.push({ etb, cards, msg: `resolveETBEffect でハンドルされていない: "${etb}" (${cards})` });
    }
  }

  // 実装はあるがカードが存在しないETB値（コードの残骸）
  for (const etb of handledEtbs) {
    if (!etbValues.has(etb)) {
      issues.push({ etb, msg: `resolveETBEffect にあるがカードが存在しない: "${etb}"` });
    }
  }

  return issues;
}

// ─── 3. カードコスト整合性チェック ──────────────────────────
function checkCostConsistency(CARD_DB) {
  const issues = [];
  const VALID_MANA = new Set(['W','R','U','B','G','C']);

  for (const [cardId, card] of Object.entries(CARD_DB)) {
    if (!card.cost) continue;
    for (const [mana, amt] of Object.entries(card.cost)) {
      if (!VALID_MANA.has(mana)) {
        issues.push({ card: cardId, name: card.name, msg: `不正なマナタイプ: cost.${mana}` });
      }
      if (typeof amt !== 'number' || amt < 0) {
        issues.push({ card: cardId, name: card.name, msg: `不正なコスト値: cost.${mana}=${amt}` });
      }
    }
  }
  return issues;
}

// ─── 4. SimGame ↔ 実ゲームロジック整合性チェック ────────────
// SimGameのソースを抽出してNode.js環境で実行し、
// 既知のシナリオを検証する
function checkSimGameConsistency(html, CARD_DB) {
  const issues = [];

  // ゲーム本体JSの取得。game.js は <script> タグを持たないため全体を対象にする
  // （index.html 互換のため、タグがあればその内側を切り出す）。
  const scriptStart = html.indexOf('<script>') >= 0 ? html.indexOf('<script>') + 8 : 0;
  const scriptEnd = html.lastIndexOf('</script>') >= 0 ? html.lastIndexOf('</script>') : html.length;
  const script = html.slice(scriptStart, scriptEnd);

  // SimGame が依存するグローバルを模倣
  const env = {
    CARD_DB,
    AI_WEIGHTS: { life:2,fieldPower:0.8,fieldToughness:0.3,fieldCount:1.2,
                  handAdv:0.4,threshold:0.12,blockRisk:0.6,manaEff:0.15,
                  lateLifeBonus:1.2,earlyFieldBonus:0.4,attackBias:0.2 },
    AI_WEIGHTS_BY_COLOR: {},
    AI_CARD_POOL: Object.keys(CARD_DB).filter(id => CARD_DB[id].type !== 'land'),
    AI_LAND_POOL: ['hito_heichi','wasure_heichi','shigen_heichi','kemono_heichi','serashia_miyako'],
    CARD_STATS: {},
    shuffle: (a) => { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; },
    // スタブ (使われないが参照されうる)
    G: null, NET_MODE: 'local', isOCActive: () => false,
    getCXValue: () => 0, totalCost: (c) => Object.values(c||{}).reduce((a,b)=>a+b,0),
  };

  // SimGame クラス定義をブレース数えで抽出
  const classStart = script.indexOf('class SimGame {');
  if (classStart === -1) {
    issues.push({ msg: 'SimGame クラスが見つかりません' });
    return issues;
  }
  let depth = 0, ci = classStart, classStarted = false;
  while (ci < script.length) {
    if (script[ci] === '{') { depth++; classStarted = true; }
    else if (script[ci] === '}') { depth--; if (classStarted && depth === 0) { ci++; break; } }
    ci++;
  }
  const classCode = script.slice(classStart, ci);

  let SimGame;
  try {
    const fn = new Function('_env', Object.keys(env).map(k => `var ${k}=_env.${k};`).join('') + classCode + '; return SimGame;');
    SimGame = fn(env);
  } catch (e) {
    issues.push({ msg: 'SimGame eval 失敗: ' + e.message });
    return issues;
  }

  // シナリオ1: 基本的な戦闘（ノーブロック）
  try {
    const sim = new SimGame(env.AI_WEIGHTS, env.AI_WEIGHTS);
    const s = sim.state;
    const p0 = s.players[0];
    const p1 = s.players[1];

    // P0に 3/3 クリーチャーを配置
    const testCards = Object.entries(CARD_DB).filter(([,c]) => c.type==='creature' && c.power===3 && c.toughness===3);
    if (testCards.length > 0) {
      const [cid] = testCards[0];
      // entryTurn を現ターン(-1)と異なる値にしてkakutouを誤発動させない
      p0.field.push({ id: 999, cardId: cid, tapped: false, damage: 0, sick: false,
                      tempPower: 0, tempToughness: 0, entryTurn: -1 });
      p1.mana.C = 0; // P1マナなし → ブロックのみ

      const lifeBefore = p1.life;
      sim.simAttack(0);
      const lifeAfter = p1.life;
      const dmg = lifeBefore - lifeAfter;

      // ノーブロックなら3ダメージ期待
      if (dmg !== 3 && p1.field.length === 0) {
        issues.push({ msg: `SimGame 戦闘シナリオ1: 3/3 無ブロック攻撃で ${dmg} ダメージ (期待値3)` });
      } else if (VERBOSE) {
        console.log(`  ✓ シナリオ1: 3/3 無ブロック → ${dmg} ダメージ`);
      }
    }
  } catch (e) {
    issues.push({ msg: 'SimGame シナリオ1 実行エラー: ' + e.message });
  }

  // シナリオ2: simEval の基本動作確認
  try {
    const sim = new SimGame(env.AI_WEIGHTS, env.AI_WEIGHTS);
    const s = sim.state;
    s.players[0].life = 20;
    s.players[1].life = 10;
    const score = sim.simEval(0);
    if (typeof score !== 'number') {
      issues.push({ msg: `SimGame simEval: 数値を返さない (got ${typeof score})` });
    } else if (score <= 0) {
      issues.push({ msg: `SimGame simEval: ライフ優位(20vs10)なのにスコアが0以下 (${score})` });
    } else if (VERBOSE) {
      console.log(`  ✓ シナリオ2: simEval ライフ優位 → ${score.toFixed(2)}`);
    }
  } catch (e) {
    issues.push({ msg: 'SimGame simEval エラー: ' + e.message });
  }

  return issues;
}

// ─── 5. 重複カードID チェック ────────────────────────────────
function checkDuplicateIds(CARD_DB) {
  const idMap = {};
  const issues = [];
  for (const [key, card] of Object.entries(CARD_DB)) {
    if (card.id) {
      if (idMap[card.id] && idMap[card.id] !== key) {
        issues.push({ msg: `重複 id: "${card.id}" (キー: ${idMap[card.id]}, ${key})` });
      }
      idMap[card.id] = key;
    }
    // キーと id が一致しているか
    if (card.id && card.id !== key) {
      issues.push({ card: key, name: card.name, msg: `CARD_DB キー "${key}" と card.id "${card.id}" が不一致` });
    }
  }
  return issues;
}

// ─── メイン実行 ───────────────────────────────────────────────
function main() {
  console.log('═══ DCG デバッグ・整合性チェッカー ═══\n');

  let CARD_DB;
  try {
    CARD_DB = extractCardDB(html);
    console.log(`✅ CARD_DB 抽出成功: ${Object.keys(CARD_DB).length} カード\n`);
  } catch (e) {
    console.error('❌ CARD_DB 抽出失敗:', e.message);
    process.exit(1);
  }

  const resolveETBSrc = extractResolveETB(html);
  if (!resolveETBSrc) console.warn('⚠️  resolveETBEffect が見つかりません');

  let totalIssues = 0;
  let totalChecks = 0;

  // ── チェック1: テキスト ↔ プロパティ整合性 ──
  console.log('【1】カードテキスト ↔ プロパティ整合性');
  const textIssues = checkTextPropConsistency(CARD_DB);
  totalChecks++;
  if (textIssues.length === 0) {
    console.log('  ✅ 問題なし\n');
  } else {
    textIssues.forEach(i => console.log(`  ❌ [${i.card}] ${i.name}: ${i.msg}`));
    console.log(`  → ${textIssues.length} 件の問題\n`);
    totalIssues += textIssues.length;
  }

  // ── チェック2: ETB実装チェック ──
  console.log('【2】ETBプロパティ ↔ resolveETBEffect 実装');
  const etbIssues = resolveETBSrc ? checkETBImplementation(CARD_DB, resolveETBSrc) : [];
  totalChecks++;
  if (etbIssues.length === 0) {
    console.log('  ✅ 全ETB値が実装されています\n');
  } else {
    etbIssues.forEach(i => console.log(`  ❌ ${i.msg}`));
    console.log(`  → ${etbIssues.length} 件の問題\n`);
    totalIssues += etbIssues.length;
  }

  // ── チェック3: コスト整合性 ──
  console.log('【3】カードコスト整合性');
  const costIssues = checkCostConsistency(CARD_DB);
  totalChecks++;
  if (costIssues.length === 0) {
    console.log('  ✅ 問題なし\n');
  } else {
    costIssues.forEach(i => console.log(`  ❌ [${i.card}] ${i.name}: ${i.msg}`));
    console.log(`  → ${costIssues.length} 件の問題\n`);
    totalIssues += costIssues.length;
  }

  // ── チェック4: SimGame整合性 ──
  console.log('【4】SimGame ↔ 実ゲームロジック整合性');
  const simIssues = checkSimGameConsistency(html, CARD_DB);
  totalChecks++;
  if (simIssues.length === 0) {
    console.log('  ✅ 基本シナリオ正常\n');
  } else {
    simIssues.forEach(i => console.log(`  ❌ ${i.msg}`));
    console.log(`  → ${simIssues.length} 件の問題\n`);
    totalIssues += simIssues.length;
  }

  // ── チェック5: 重複IDチェック ──
  console.log('【5】カードID重複チェック');
  const dupIssues = checkDuplicateIds(CARD_DB);
  totalChecks++;
  if (dupIssues.length === 0) {
    console.log('  ✅ 重複なし\n');
  } else {
    dupIssues.forEach(i => console.log(`  ❌ ${i.msg}`));
    console.log(`  → ${dupIssues.length} 件の問題\n`);
    totalIssues += dupIssues.length;
  }

  // ── サマリー ──
  console.log('═══════════════════════════════════════');
  if (totalIssues === 0) {
    console.log(`✅ 全 ${totalChecks} チェック通過。問題なし。`);
  } else {
    console.log(`❌ ${totalChecks} チェック中、合計 ${totalIssues} 件の問題を検出。`);
    process.exit(1);
  }
}

main();
