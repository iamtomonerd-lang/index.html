#!/usr/bin/env node
// ============================================================
// ヘッドレス・テストランナー
// ブラウザを使わずに index.html 内のカードテスト(runCardTests)を実行する。
//   使い方:  node run-tests.js
// 終了コード: 全テスト成功なら 0、失敗があれば 1。
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

// ── index.html から最後の <script>...</script>（ゲーム本体）を取り出す ──
// 先頭の <script src="..."> は外部CDN(peerjs)なので除外する。
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const gameScript = scripts
  .map(m => m[1])
  .filter(s => s.includes('CARD_DB') && s.includes('runCardTests'))
  .pop();

if (!gameScript) {
  console.error('ゲーム本体のスクリプトが見つかりませんでした。');
  process.exit(2);
}

// ── ブラウザ機能のダミー（呼ばれても何もしない部品を返す）──
// あらゆるDOMメソッド/プロパティに対応するため Proxy で「何でも吸収する」要素を作る。
function makeFakeEl() {
  const el = {
    style: {}, dataset: {}, classList: { add(){}, remove(){}, contains(){return false;}, toggle(){} },
    children: [], childNodes: [],
    appendChild(){}, removeChild(){}, remove(){}, insertBefore(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){return null;},
    addEventListener(){}, removeEventListener(){},
    cloneNode(){ return makeFakeEl(); },
    querySelector(){ return makeFakeEl(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, width:0, height:0, right:0, bottom:0 }; },
    focus(){}, blur(){}, click(){}, scrollTop:0, scrollHeight:0,
    textContent:'', innerHTML:'', innerText:'', value:'', className:'', id:'',
    onclick:null,
  };
  return new Proxy(el, {
    get(t, p) {
      if (p in t) return t[p];
      // 未知のプロパティ参照は「何もしない関数」を返して落ちないようにする
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; },
  });
}

const fakeDocument = {
  getElementById(){ return makeFakeEl(); },
  createElement(){ return makeFakeEl(); },
  createTextNode(){ return makeFakeEl(); },
  querySelector(){ return makeFakeEl(); },
  querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){},
  body: makeFakeEl(),
  documentElement: makeFakeEl(),
  readyState: 'complete',
};

const fakeLocalStorage = {
  _d:{}, getItem(k){ return k in this._d ? this._d[k] : null; },
  setItem(k,v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; }, clear(){ this._d = {}; },
};

const sandbox = {
  console,
  document: fakeDocument,
  localStorage: fakeLocalStorage,
  navigator: { userAgent: 'node', language: 'ja' },
  location: { href: '', search: '', hash: '' },
  Peer: function(){ return { on(){}, connect(){ return { on(){}, send(){} }; }, destroy(){} }; },
  setTimeout: (fn)=>{ /* テストでは非同期は使わない（同期APIのみ検証） */ return 0; },
  clearTimeout: ()=>{},
  setInterval: ()=>0, clearInterval: ()=>{},
  requestAnimationFrame: (fn)=>0, cancelAnimationFrame: ()=>{},
  alert: ()=>{}, confirm: ()=>true, prompt: ()=>null,
  Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean,
  parseInt, parseFloat, isNaN, isFinite,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.addEventListener = ()=>{};
sandbox.removeEventListener = ()=>{};
sandbox.matchMedia = ()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
sandbox.screen = { orientation: { lock: ()=>Promise.resolve(), unlock: ()=>{} } };
sandbox.innerWidth = 1280;
sandbox.innerHeight = 720;

const context = vm.createContext(sandbox);

try {
  vm.runInContext(gameScript, context, { filename: 'index.html(game)', timeout: 20000 });
} catch (e) {
  console.error('スクリプト読み込み中にエラー:', e && e.message);
  console.error(e && e.stack);
  process.exit(2);
}

const runCardTests = context.__runCardTests;
if (typeof runCardTests !== 'function') {
  console.error('runCardTests が見つかりませんでした。');
  process.exit(2);
}

let results;
try {
  results = runCardTests();
} catch (e) {
  console.error('テスト実行中にエラー:', e && e.message);
  console.error(e && e.stack);
  process.exit(2);
}

const pass = results.filter(r => r.pass).length;
const fail = results.length - pass;

console.log('========================================');
console.log(`カードテスト結果: ${pass}/${results.length} 成功`);
console.log('========================================');
for (const r of results) {
  const mark = r.pass ? '  OK ' : '>>FAIL';
  console.log(`${mark}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log('========================================');

if (fail > 0) {
  console.log(`\n❌ ${fail}件 失敗`);
  process.exit(1);
} else {
  console.log(`\n✅ 全${results.length}件 成功`);
  process.exit(0);
}
