#!/usr/bin/env python3
"""
Realtime BTC leverage trading agent.
Polls yfinance every 60s, computes indicators, validates open trades,
tracks win rate, calls Claude on signal change. Pushes to GitHub Pages.
"""

import asyncio
import base64
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import anthropic
import pandas as pd
import requests
import yfinance as yf

HL_INFO = "https://api.hyperliquid.xyz/info"

def fetch_hl_candles(symbol: str = "BTC", interval: str = "5m", lookback: int = 300) -> pd.DataFrame | None:
    """Fetch OHLCV candles from Hyperliquid. Falls back to yfinance on error."""
    try:
        now_ms = int(time.time() * 1000)
        # interval map: 5m=5, 15m=15, 1h=60, 4h=240, 1d=1440
        interval_map = {"5m": 5, "15m": 15, "1h": 60}
        mins = interval_map.get(interval, 5)
        start_ms = now_ms - lookback * mins * 60 * 1000
        payload = {
            "type": "candleSnapshot",
            "req": {
                "coin": symbol,
                "interval": interval,
                "startTime": start_ms,
                "endTime": now_ms,
            }
        }
        r = requests.post(HL_INFO, json=payload, timeout=10)
        r.raise_for_status()
        candles = r.json()
        if not candles:
            return None
        rows = [{
            "Open":   float(c["o"]),
            "High":   float(c["h"]),
            "Low":    float(c["l"]),
            "Close":  float(c["c"]),
            "Volume": float(c["v"]),
        } for c in candles]
        df = pd.DataFrame(rows)
        df.index = pd.to_datetime([c["t"] for c in candles], unit="ms")
        return df
    except Exception as e:
        print(f"[hl_candles] {e} — falling back to yfinance")
        return None

# ── Config ────────────────────────────────────────────────────────────────────
TICKER        = os.getenv("RT_TICKER", "BTC-USD")
POLL_SEC      = int(os.getenv("RT_POLL_SEC", "5"))
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GITHUB_TOKEN  = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO   = os.getenv("GITHUB_REPO", "RingoshiToitsu1/daily_stock_analysis")
GITHUB_PATH   = "docs/data/realtime.json"
MODEL         = "claude-sonnet-4-6"
DATA_FILE     = Path("/home/ubuntu/realtime_data.json")
TRADES_FILE   = Path("/home/ubuntu/realtime_trades.json")
GITHUB_PUSH_INTERVAL = 10  # Only push to GitHub every 10s (even if signals faster)

# ── Indicators ────────────────────────────────────────────────────────────────
def rsi(s: pd.Series, n=14) -> pd.Series:
    d = s.diff()
    g = d.clip(lower=0).rolling(n).mean()
    l = (-d.clip(upper=0)).rolling(n).mean()
    return 100 - 100 / (1 + g / l.replace(0, float("nan")))

def indicators(df: pd.DataFrame) -> dict:
    c = df["Close"].squeeze()
    h = df["High"].squeeze()
    lo = df["Low"].squeeze()
    v = df["Volume"].squeeze()
    ma5  = c.rolling(5).mean()
    ma10 = c.rolling(10).mean()
    ma20 = c.rolling(20).mean()
    rsi_ = rsi(c)
    vwap = ((h + lo + c) / 3 * v).cumsum() / v.cumsum()
    bb   = c.rolling(20)
    bb_u = bb.mean() + 2 * bb.std()
    bb_l = bb.mean() - 2 * bb.std()
    ema12 = c.ewm(span=12).mean()
    ema26 = c.ewm(span=26).mean()
    macd  = ema12 - ema26
    macd_sig = macd.ewm(span=9).mean()

    def f(x):
        try:
            v = float(x.iloc[-1])
            return round(v, 2) if v == v else None
        except Exception:
            return None

    return {
        "close": f(c), "high": f(h), "low": f(lo),
        "ma5": f(ma5), "ma10": f(ma10), "ma20": f(ma20),
        "rsi": round(float(rsi_.iloc[-1]), 1) if rsi_.iloc[-1] == rsi_.iloc[-1] else None,
        "vwap": f(vwap),
        "bb_upper": f(bb_u), "bb_lower": f(bb_l),
        "macd": round(float(macd.iloc[-1]), 2) if macd.iloc[-1] == macd.iloc[-1] else None,
        "macd_signal": round(float(macd_sig.iloc[-1]), 2) if macd_sig.iloc[-1] == macd_sig.iloc[-1] else None,
    }

def levels(df: pd.DataFrame, ind: dict, direction: str) -> dict:
    h = df["High"].squeeze()
    lo = df["Low"].squeeze()
    c = df["Close"].squeeze()
    tr = pd.concat([(h - lo), (h - c.shift()).abs(), (lo - c.shift()).abs()], axis=1).max(axis=1)
    atr = float(tr.rolling(14).mean().iloc[-1])
    price = ind["close"]
    if not price or atr != atr:
        return {}
    if direction == "LONG":
        stop = round(price - 1.5 * atr, 2)
        tp   = round(price + 2.5 * atr, 2)
    elif direction == "SHORT":
        stop = round(price + 1.5 * atr, 2)
        tp   = round(price - 2.5 * atr, 2)
    else:
        stop = round(price - 1.0 * atr, 2)
        tp   = round(price + 1.0 * atr, 2)
    risk = abs(price - stop)
    return {
        "entry": round(price, 2),
        "stop_loss": stop,
        "take_profit": tp,
        "atr": round(atr, 2),
        "rr": round(abs(tp - price) / risk, 1) if risk > 0 else None,
    }

def score(ind: dict) -> tuple[str, int, list[str]]:
    pts, why = 0, []
    c, ma5, ma10, ma20 = ind["close"], ind["ma5"], ind["ma10"], ind["ma20"]
    rsi_, vwap = ind["rsi"], ind["vwap"]
    bb_u, bb_l = ind["bb_upper"], ind["bb_lower"]
    macd, ms = ind["macd"], ind["macd_signal"]

    # MA alignment — strongest signal
    if ma5 and ma10 and ma20:
        if ma5 > ma10 > ma20:
            pts += 2; why.append("Bullish MA alignment")
        elif ma5 < ma10 < ma20:
            pts -= 2; why.append("Bearish MA alignment")

    # Price vs MA5
    if c and ma5:
        if c > ma5: pts += 1; why.append("Price > MA5")
        else:        pts -= 1; why.append("Price < MA5")

    # VWAP
    if c and vwap:
        if c > vwap: pts += 1; why.append("Price > VWAP")
        else:         pts -= 1; why.append("Price < VWAP")

    # RSI — extreme values + oversold recovery
    if rsi_:
        if rsi_ > 70:   pts -= 2; why.append(f"RSI overbought ({rsi_:.0f})")
        elif rsi_ < 25: pts += 3; why.append(f"RSI EXTREME oversold ({rsi_:.0f})")  # Capitulation
        elif rsi_ < 30: pts += 2; why.append(f"RSI oversold ({rsi_:.0f})")
        elif rsi_ > 60: pts += 1; why.append(f"RSI bullish ({rsi_:.0f})")

    # Bollinger Bands — price outside bands
    if c and bb_u and bb_l:
        if c > bb_u:   pts -= 1; why.append("Price > BB upper")
        elif c < bb_l: pts += 2; why.append("Price < BB lower (capitulation)")

    # MACD — must cross signal line for points
    if macd and ms:
        if macd > ms: pts += 1; why.append("MACD bullish")
        else:          pts -= 1; why.append("MACD bearish")

    # High conviction: ±6+; Medium: ±4-5; Low/Neutral: <4
    # Note: oversold reversals can hit 6+ with RSI < 25 + BB penetration
    direction = "LONG" if pts >= 6 else "SHORT" if pts <= -6 else "NEUTRAL"
    return direction, pts, why

# ── Trade tracking ────────────────────────────────────────────────────────────
_current_direction = "NEUTRAL"
_open_trade: dict | None = None  # Combined position for stacked entries
_open_entries: list = []  # Individual entries (for DCA/stacking)
_trade_history: list = []

def load_trades():
    global _trade_history, _open_trade, _current_direction
    if TRADES_FILE.exists():
        try:
            d = json.loads(TRADES_FILE.read_text())
            _trade_history = d.get("history", [])
            _open_trade    = d.get("open_trade")
            _current_direction = d.get("direction", "NEUTRAL")
            print(f"[trades] loaded {len(_trade_history)} trades, open={_open_trade is not None}")
        except Exception as e:
            print(f"[trades] load error: {e}")

def save_trades():
    TRADES_FILE.write_text(json.dumps({
        "history":    _trade_history[-100:],
        "open_trade": _open_trade,
        "direction":  _current_direction,
    }, ensure_ascii=False))

def validate_setup(direction: str, lvls: dict, ind: dict, score_pts: int) -> bool:
    """Check if setup meets minimum criteria before entry."""
    if direction == "NEUTRAL":
        return False

    # OBVIOUS signals only: ±6 or ±7 conviction
    if abs(score_pts) < 6:
        return False

    # Require good R:R (at least 1:1.5)
    rr = lvls.get("rr")
    if not rr or rr < 1.5:
        return False

    # Skip if volatility is extreme (ATR > 2% of price)
    atr = lvls.get("atr", 0)
    price = ind.get("close", 0)
    if price and atr / price > 0.02:
        return False

    return True

def open_trade(direction: str, lvls: dict, ind: dict):
    global _open_trade, _open_entries
    entry_detail = {
        "entry": lvls["entry"],
        "open_time": datetime.now(timezone.utc).isoformat(),
    }
    _open_entries = [entry_detail]
    _open_trade = {
        "direction":   direction,
        "entries":     _open_entries,
        "stop_loss":   lvls["stop_loss"],
        "take_profit": lvls["take_profit"],
        "atr":         lvls.get("atr"),
        "rr":          lvls.get("rr"),
        "open_time":   datetime.now(timezone.utc).isoformat(),
        "open_price":  ind["close"],
    }
    print(f"[trade] OPEN {direction} entry 1 @ ${ind['close']:,.0f}  stop=${lvls['stop_loss']:,.0f}  tp=${lvls['take_profit']:,.0f}  rr={lvls.get('rr', 0):.1f}")

def stack_entry(lvls: dict, ind: dict):
    """Add another entry to an open trade (DCA/pyramiding)."""
    global _open_trade, _open_entries
    if not _open_trade:
        return
    entry_detail = {
        "entry": lvls["entry"],
        "open_time": datetime.now(timezone.utc).isoformat(),
    }
    _open_entries.append(entry_detail)
    # Update combined levels
    avg_entry = sum(e["entry"] for e in _open_entries) / len(_open_entries)
    _open_trade["entries"] = _open_entries
    _open_trade["average_entry"] = round(avg_entry, 2)
    print(f"[trade] STACK {_open_trade['direction']} entry {len(_open_entries)} @ ${ind['close']:,.0f}  avg=${avg_entry:,.0f}")

def close_trade(result: str, close_price: float, reason: str):
    global _open_trade
    if not _open_trade:
        return
    t = {
        **_open_trade,
        "result":      result,
        "close_price": round(close_price, 2),
        "close_time":  datetime.now(timezone.utc).isoformat(),
        "close_reason": reason,
        "pnl":         round(
            (close_price - _open_trade["entry"]) if _open_trade["direction"] == "LONG"
            else (_open_trade["entry"] - close_price), 2
        ),
    }
    _trade_history.append(t)
    print(f"[trade] CLOSE {result.upper()} @ ${close_price:,.0f}  pnl=${t['pnl']:+,.0f}  ({reason})")
    _open_trade = None
    save_trades()

def check_open_trade(ind: dict) -> str | None:
    """Returns 'win', 'loss', or None if still open."""
    if not _open_trade:
        return None
    d = _open_trade["direction"]
    h, lo = ind.get("high"), ind.get("low")
    tp, sl = _open_trade["take_profit"], _open_trade["stop_loss"]
    if d == "LONG":
        if h and h >= tp: return "win"
        if lo and lo <= sl: return "loss"
    elif d == "SHORT":
        if lo and lo <= tp: return "win"
        if h and h >= sl: return "loss"
    return None

def trade_stats() -> dict:
    if not _trade_history:
        return {"total": 0, "wins": 0, "losses": 0, "win_rate": None, "last_result": None}
    wins   = [t for t in _trade_history if t["result"] == "win"]
    losses = [t for t in _trade_history if t["result"] == "loss"]
    wr = round(len(wins) / len(_trade_history) * 100, 1) if _trade_history else None
    return {
        "total":       len(_trade_history),
        "wins":        len(wins),
        "losses":      len(losses),
        "win_rate":    wr,
        "last_result": _trade_history[-1]["result"] if _trade_history else None,
        "recent":      _trade_history[-10:][::-1],  # last 10, newest first
    }

# ── GitHub publish ────────────────────────────────────────────────────────────
_gh_sha: str = ""

def push_to_github(data: dict) -> bool:
    global _gh_sha
    if not GITHUB_TOKEN:
        return False
    url  = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_PATH}"
    hdrs = {"Authorization": f"Bearer {GITHUB_TOKEN}", "X-GitHub-Api-Version": "2022-11-28"}
    if not _gh_sha:
        r = requests.get(url, headers=hdrs, timeout=10)
        if r.ok:
            _gh_sha = r.json().get("sha", "")
    content = base64.b64encode(json.dumps(data, ensure_ascii=False).encode()).decode()
    payload: dict = {
        "message":    f"realtime: {data.get('updated_at','')[:19]}",
        "content":    content,
        "committer":  {"name": "realtime-agent", "email": "agent@noreply.github.com"},
    }
    if _gh_sha:
        payload["sha"] = _gh_sha
    r = requests.put(url, json=payload, headers=hdrs, timeout=15)
    if r.ok:
        _gh_sha = r.json().get("content", {}).get("sha", _gh_sha)
        return True
    print(f"[github] {r.status_code} {r.text[:120]}")
    _gh_sha = ""
    return False

# ── Claude ────────────────────────────────────────────────────────────────────
async def call_claude(ind: dict, direction: str, pts: int, why: list,
                      lvls: dict, trade_result: str | None) -> str:
    if not ANTHROPIC_KEY:
        return ""
    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    result_ctx = f"\nPrevious trade just {trade_result.upper()}ED." if trade_result else ""
    prompt = f"""You are a BTC leverage trader. 2-3 sentences max.{result_ctx}

Price: ${ind['close']:,.0f} | Signal: {direction} ({pts:+d}/7)
MA5 ${ind['ma5']:,.0f} | MA10 ${ind['ma10']:,.0f} | MA20 ${ind['ma20']:,.0f}
RSI {ind['rsi']} | VWAP ${ind['vwap']:,.0f} | MACD {ind['macd']:+.1f}
Entry ${lvls.get('entry',0):,.0f} | Stop ${lvls.get('stop_loss',0):,.0f} | TP ${lvls.get('take_profit',0):,.0f}
Factors: {', '.join(why)}

State the bias, one key level to watch, and the main risk to the trade."""
    try:
        msg = client.messages.create(
            model=MODEL, max_tokens=120,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[claude] {e}")
        return ""

# ── Main loop ─────────────────────────────────────────────────────────────────
_state: dict = {}
_last_candle_time: int = 0  # Track last candle timestamp to detect new data
_last_github_push: float = 0  # Rate limit GitHub pushes

async def poll():
    global _state, _current_direction, _last_candle_time, _last_github_push

    while True:
        try:
            # Try Hyperliquid first (exact prices you trade at), fall back to yfinance
            df = fetch_hl_candles("BTC", "5m", 300)
            if df is None or df.empty:
                df = yf.download(TICKER, period="2d", interval="5m",
                                 progress=False, auto_adjust=True)
            if df is None or df.empty:
                raise ValueError("empty dataframe")

            # Detect if candle data actually changed
            current_candle_time = int(df.index[-1].timestamp() * 1000)
            candle_changed = current_candle_time > _last_candle_time

            if not candle_changed:
                # No new data yet, just check open trade TP/SL
                if _open_trade:
                    ind = indicators(df)
                    outcome = check_open_trade(ind)
                    if outcome:
                        close_price = (_open_trade["take_profit"] if outcome == "win"
                                       else _open_trade["stop_loss"])
                        close_trade(outcome, close_price, "tp_hit" if outcome == "win" else "stop_hit")
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] TRADE {outcome.upper()} at ${close_price:,.0f}")
                await asyncio.sleep(POLL_SEC)
                continue

            _last_candle_time = current_candle_time

            ind    = indicators(df)
            direction, pts, why = score(ind)
            lvls   = levels(df, ind, direction)

            # ── Step 1: validate open trade ───────────────────────────────────
            trade_result = None
            if _open_trade:
                outcome = check_open_trade(ind)
                if outcome:
                    close_price = (_open_trade["take_profit"] if outcome == "win"
                                   else _open_trade["stop_loss"])
                    close_trade(outcome, close_price, "tp_hit" if outcome == "win" else "stop_hit")
                    trade_result = outcome

            # ── Step 2: signal transition ─────────────────────────────────────
            signal_changed = direction != _current_direction
            if signal_changed:
                # Reverse signal closes any open trade WITHOUT recording result
                # (only TP/SL hits count as wins/losses)
                if _open_trade:
                    print(f"[signal] {_current_direction} → {direction}, trade abandoned at ${ind['close']:,.0f}")
                    _open_trade = None
                    _open_entries = []
                # Open new trade only if setup passes validation
                if direction in ("LONG", "SHORT") and lvls and ind["close"]:
                    if validate_setup(direction, lvls, ind, pts):
                        open_trade(direction, lvls, ind)
                    else:
                        print(f"[signal] {direction} signal rejected: setup validation failed")
                _current_direction = direction
            elif direction in ("LONG", "SHORT") and direction == _current_direction and _open_trade:
                # Same direction signal while trade open: STACK entry (DCA)
                if validate_setup(direction, lvls, ind, pts):
                    stack_entry(lvls, ind)

            # ── Step 3: Claude on signal change or trade close ────────────────
            ai_text = _state.get("ai_interpretation", "")
            ai_ts   = _state.get("last_ai_update")
            if signal_changed or trade_result:
                ai_text = await call_claude(ind, direction, pts, why, lvls, trade_result)
                ai_ts   = datetime.now(timezone.utc).isoformat()

            # ── Step 4: build and publish state ──────────────────────────────
            stats = trade_stats()
            _state = {
                "ticker":             TICKER,
                "signal":             direction,
                "signal_score":       pts,
                "signal_max":         7,
                "signal_reasons":     why,
                "levels":             lvls,
                "open_trade":         _open_trade,
                "trade_stats":        stats,
                "indicators":         ind,
                "ai_interpretation":  ai_text,
                "last_ai_update":     ai_ts,
                "updated_at":         datetime.now(timezone.utc).isoformat(),
            }

            out = {"updated_at": _state["updated_at"], "ticker": TICKER, "data": _state}
            tmp = DATA_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(out, ensure_ascii=False))
            tmp.rename(DATA_FILE)

            # Rate limit GitHub pushes to avoid quota exhaustion
            now = time.time()
            should_push = (now - _last_github_push) >= GITHUB_PUSH_INTERVAL
            pushed = push_to_github(out) if should_push else False
            if should_push:
                _last_github_push = now

            wr = stats.get("win_rate")
            wr_str = f"WR {wr}%" if wr is not None else "no trades yet"
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {TICKER} {direction} {pts:+d} "
                  f"@ ${ind['close']:,.0f}  {wr_str}  {'→ github ✓' if pushed else '(local)'}")

        except Exception as e:
            print(f"[poll error] {e}")

        await asyncio.sleep(POLL_SEC)

async def main():
    load_trades()
    print(f"Starting — {TICKER}, fast poll {POLL_SEC}s (signals on candle change), GitHub push every {GITHUB_PUSH_INTERVAL}s")
    await poll()

if __name__ == "__main__":
    asyncio.run(main())
