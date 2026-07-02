// ============================================================
// mcts-worker.js — 思考専用の裏スレッド（純スペックB）
// UIスレッドを一切止めずにMCTS探索を実行する。
// WorkerにはDOMが無いので、test/loadGame.js のサンドボックスと同じ
// ダミーを用意してからゲーム本体JSをそのまま読み込む。
// ============================================================

function _makeFakeEl() {
  const el = {
    style: {}, dataset: {}, classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    children: [], childNodes: [],
    appendChild(){}, removeChild(){}, remove(){}, insertBefore(){},
    setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; },
    addEventListener(){}, removeEventListener(){},
    cloneNode(){ return _makeFakeEl(); },
    querySelector(){ return _makeFakeEl(); }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { left:0, top:0, width:0, height:0, right:0, bottom:0 }; },
    focus(){}, blur(){}, click(){}, scrollTop:0, scrollHeight:0,
    textContent:'', innerHTML:'', innerText:'', value:'', className:'', id:'', onclick:null,
  };
  return new Proxy(el, {
    get(t, p) { if (p in t) return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

self.window = self;
self.document = {
  getElementById(){ return _makeFakeEl(); },
  createElement(){ return _makeFakeEl(); },
  createElementNS(){ return _makeFakeEl(); },
  createTextNode(){ return _makeFakeEl(); },
  querySelector(){ return _makeFakeEl(); },
  querySelectorAll(){ return []; },
  addEventListener(){}, removeEventListener(){},
  body: _makeFakeEl(), documentElement: _makeFakeEl(), readyState: 'complete',
};
self.localStorage = {
  _d:{}, getItem(k){ return k in this._d ? this._d[k] : null; },
  setItem(k,v){ this._d[k] = String(v); }, removeItem(k){ delete this._d[k]; }, clear(){ this._d = {}; },
};
self.alert = ()=>{}; self.confirm = ()=>true; self.prompt = ()=>null;
self.matchMedia = ()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
self.screen = { orientation: { lock: ()=>Promise.resolve(), unlock: ()=>{} } };
self.requestAnimationFrame = ()=>0; self.cancelAnimationFrame = ()=>{};
self.Peer = function(){ return { on(){}, connect(){ return { on(){}, send(){} }; }, destroy(){} }; };

// ゲーム本体（探索に必要な分だけ・index.htmlと同じ順序）
importScripts('cards.js', 'engine.js', 'card-effects.js', 'ai.js', 'sim.js');

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type !== 'search') return;
  try {
    // メインスレッドの学習状態を同期（重み・勝ち手辞書）— これが無いと素のAIで考えてしまう
    if (msg.weights) AI_WEIGHTS = msg.weights;
    if (Array.isArray(msg.winningMoves)) AI_WINNING_MOVES = msg.winningMoves;
    if (typeof msg.imitationOn === 'boolean') AI_IMITATION_ON = msg.imitationOn;
    const plays = mctsSearch(msg.budget, msg.bundle);
    self.postMessage({ type: 'result', id: msg.id, plays, iters: MCTS_LAST_ITERS });
  } catch (err) {
    self.postMessage({ type: 'result', id: msg.id, plays: null, error: String(err && err.message || err) });
  }
};

self.postMessage({ type: 'ready' });
