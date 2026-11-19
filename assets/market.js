/* GMT-Optimizer shared market data: BTC price, GMT price, network difficulty. Used by /quote, the ROI widget
   (landing quick estimate, /gomining-roi-calculator, /embed) and the account dashboard. The console has its own copy
   of the same rules in app.js and shares this cache with it.

   Rules (owner, 2026-11-19: a quote on stale prices is worthless):
   - Every source is asked at once and the first valid answer wins, so one slow or blocked API costs nothing.
       BTC   CoinGecko · mempool.space · Coinbase · Binance · CoinPaprika
       GMT   CoinGecko (gmt-token) · CoinPaprika
       diff  mempool.space · blockchain.info
   - Only live values are ever saved (localStorage gm_price_cache_v1, the console's key), with their time.
   - When a value can't be fetched, the newest saved one is used and the caller is told its age; built-in
     constants are only the very last resort, for a first visit with every source down.
   - Anything missing is retried every 30 s (and when the tab comes back) until everything is live; callers get
     onUpdate() each time something improves.
   window.GMTMarket.get() → Promise<state>; .onUpdate(fn); .state
   state = { btc, gmt, diff, live: {btc, gmt, diff}, allLive, at (ms of the oldest value shown), source } */
(function () {
  'use strict';
  if (window.GMTMarket) return;
  var KEY = 'gm_price_cache_v1', TIMEOUT = 6000, RETRY_MS = 30000, MAX_RETRIES = 20;
  var FB = { btc: 84000, gmt: 0.28, diff: 113e12 };   // last resort only (first visit, every source down)

  function j(u) {
    var c = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (c) c.abort(); }, TIMEOUT);
    return fetch(u, c ? { signal: c.signal } : {}).then(function (r) { clearTimeout(t); if (!r.ok) throw 0; return r.json(); }, function (e) { clearTimeout(t); throw e; });
  }
  // first source that returns a positive number; rejects only if all fail
  function race(fns) {
    return new Promise(function (res, rej) {
      var left = fns.length;
      fns.forEach(function (f) {
        Promise.resolve().then(f).then(function (v) { v = +v; if (v > 0) res(v); else throw 0; })
          .catch(function () { if (--left === 0) rej(0); });
      });
    });
  }
  var SRC = {
    btc: [
      function () { return j('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd').then(function (r) { return r.bitcoin.usd; }); },
      function () { return j('https://mempool.space/api/v1/prices').then(function (r) { return r.USD; }); },
      function () { return j('https://api.coinbase.com/v2/prices/BTC-USD/spot').then(function (r) { return r.data.amount; }); },
      function () { return j('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT').then(function (r) { return r.price; }); },
      function () { return j('https://api.coinpaprika.com/v1/tickers/btc-bitcoin').then(function (r) { return r.quotes.USD.price; }); }
    ],
    gmt: [
      function () { return j('https://api.coingecko.com/api/v3/simple/price?ids=gmt-token&vs_currencies=usd').then(function (r) { return r['gmt-token'].usd; }); },
      function () { return j('https://api.coinpaprika.com/v1/tickers/gomining-gomining-token').then(function (r) { return r.quotes.USD.price; }); }
    ],
    diff: [
      function () { return j('https://mempool.space/api/v1/mining/hashrate/3d').then(function (r) { return r.currentDifficulty; }); },
      function () { return fetch('https://blockchain.info/q/getdifficulty?cors=true').then(function (r) { if (!r.ok) throw 0; return r.text(); }); }
    ]
  };

  function readCache() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || null; } catch (e) { return null; } }
  function writeCache() {
    // only values fetched live in this page; never write a cached or built-in value back
    var c = readCache() || {}, now = Date.now(), changed = false;
    if (state.live.btc) { c.btc = state.btc; c.tBtc = now; changed = true; }
    if (state.live.gmt) { c.gmt = state.gmt; c.tGmt = now; changed = true; }
    if (state.live.diff) { c.diff = state.diff; c.tDiff = now; changed = true; }
    if (state.allLive) c.t = now;   // the console reads `t` as "when these prices were live"
    if (changed) try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  }

  var c0 = readCache() || {};
  var state = {
    btc: c0.btc > 0 ? c0.btc : FB.btc, gmt: c0.gmt > 0 ? c0.gmt : FB.gmt, diff: c0.diff > 0 ? c0.diff : FB.diff,
    live: { btc: false, gmt: false, diff: false }, allLive: false,
    cachedAt: { btc: c0.btc > 0 ? (c0.tBtc || c0.t || 0) : 0, gmt: c0.gmt > 0 ? (c0.tGmt || c0.t || 0) : 0, diff: c0.diff > 0 ? (c0.tDiff || c0.t || 0) : 0 },
    at: 0, source: c0.btc > 0 ? 'cache' : 'builtin'
  };
  function settle() {
    state.allLive = state.live.btc && state.live.gmt && state.live.diff;
    // age of the oldest value on screen (0 = all live); a built-in constant counts as "unknown age"
    var ages = ['btc', 'gmt', 'diff'].filter(function (k) { return !state.live[k]; }).map(function (k) { return state.cachedAt[k] || -1; });
    state.at = ages.length ? (ages.indexOf(-1) >= 0 ? -1 : Math.min.apply(null, ages)) : 0;
    state.source = state.allLive ? 'live' : state.at === -1 ? 'builtin' : 'cache';
  }
  settle();

  var subs = [], tries = 0, timer = 0, inflight = null;
  function emit() { subs.forEach(function (f) { try { f(state); } catch (e) {} }); }
  function fetchMissing() {
    if (inflight) return inflight;
    var keys = ['btc', 'gmt', 'diff'].filter(function (k) { return !state.live[k]; });
    if (!keys.length) return Promise.resolve(state);
    inflight = Promise.all(keys.map(function (k) {
      return race(SRC[k]).then(function (v) { state[k] = v; state.live[k] = true; }, function () {});
    })).then(function () {
      inflight = null; settle(); writeCache(); emit();
      clearTimeout(timer);
      if (!state.allLive && ++tries < MAX_RETRIES) timer = setTimeout(fetchMissing, RETRY_MS);
      return state;
    });
    return inflight;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !state.allLive) { clearTimeout(timer); fetchMissing(); } });
  var first = fetchMissing();

  window.GMTMarket = {
    state: state,
    get: function () { return first; },
    onUpdate: function (f) { subs.push(f); },
    // "Live", or how old the shown prices are, in the page's language (callers can use their own wording)
    label: function (T) {
      T = T || function (s, a) { return String(s).replace('{0}', a); };
      if (state.allLive) return T('Live');
      if (state.at === -1) return T('Offline estimate');
      var m = Math.max(1, Math.round((Date.now() - state.at) / 60000));
      return m < 90 ? T('Prices from {0} min ago', m) : T('Prices from {0} h ago', Math.round(m / 60));
    }
  };
})();
