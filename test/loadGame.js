// ============================================================
// 共有テストローダ: ゲーム本体JS（複数ファイル）をNode VMで読み込む。
//   ファイル分割が進んでも、ここの GAME_FILES を更新するだけで全テストが追従する。
//   ブラウザでは複数の <script src> がグローバルスコープを共有するのと同じ意味になるよう、
//   ここでは各ファイルを連結して1つのスクリプトとして実行する（let/const/class も共有される）。
// ============================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// 読み込み順（index.html の <script src> と同じ順序）。分割が進んだらここに追記する。
const GAME_FILES = ['cards.js', 'engine.js', 'card-effects.js', 'ai.js', 'render.js', 'sim.js', 'test-cards.js', 'home.js', 'demo.js', 'game.js'];

// ゲーム本体JSの結合ソースを返す。
function gameSource() {
  return GAME_FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
}

// あらゆるDOM参照を吸収するダミー要素（Proxyで未知プロパティも無害化）。
function makeFakeEl() {
  const el = {
    style: {}, dataset: {}, classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    children: [], childNodes: [],
    appendChild(){}, removeChild(){}, remove(){}, insertBefore(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    cloneNode(){ return makeFakeEl(); },
    querySelector(){ return makeFakeEl(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, width:0, height:0, right:0, bottom:0 }; },
    focus(){}, blur(){}, click(){}, scrollTop:0, scrollHeight:0,
    textContent:'', innerHTML:'', innerText:'', value:'', className:'', id:'', onclick:null,
  };
  return new Proxy(el, {
    get(t, p) { if (p in t) return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

// 全テストの要求を満たす上位互換のサンドボックスを作る。
function makeSandbox() {
  const fakeDocument = {
    getElementById(){ return makeFakeEl(); },
    createElement(){ return makeFakeEl(); },
    createElementNS(){ return makeFakeEl(); },
    createTextNode(){ return makeFakeEl(); },
    querySelector(){ return makeFakeEl(); },
    querySelectorAll(){ return []; },
    addEventListener(){}, removeEventListener(){},
    body: makeFakeEl(), documentElement: makeFakeEl(), readyState: 'complete',
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
    setTimeout: ()=>0, clearTimeout: ()=>{},
    setInterval: ()=>0, clearInterval: ()=>{},
    requestAnimationFrame: ()=>0, cancelAnimationFrame: ()=>{},
    alert: ()=>{}, confirm: ()=>true, prompt: ()=>null,
    matchMedia: ()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }),
    screen: { orientation: { lock: ()=>Promise.resolve(), unlock: ()=>{} } },
    innerWidth: 1280, innerHeight: 720,
    Math, Date, JSON, Set, Map, Array, Object, String, Number, Boolean,
    parseInt, parseFloat, isNaN, isFinite,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = ()=>{};
  sandbox.removeEventListener = ()=>{};
  return sandbox;
}

// ゲーム本体を読み込んだ VM コンテキストを返す。
function loadGame(opts = {}) {
  const sandbox = makeSandbox();
  const context = vm.createContext(sandbox);
  vm.runInContext(gameSource(), context, { filename: 'game.js', timeout: opts.timeout || 30000 });
  return context;
}

module.exports = { loadGame, gameSource, makeFakeEl, makeSandbox, GAME_FILES };
