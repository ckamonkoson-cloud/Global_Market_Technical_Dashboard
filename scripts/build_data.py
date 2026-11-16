"""Fetch daily bars from TradingView (tvdatafeed) and write the dashboard's JSON data.

Output (relative to repo root):
  site/data/assets/<ID>.json   one file per asset (+ benchmark), bars and indicators
  site/data/summary.json       everything the dashboard page needs

If an asset cannot be fetched, its previous JSON file is reused.
Exits non-zero if no asset could be fetched at all.
"""
import json
import logging
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "data"
ASSET_DIR = DATA / "assets"

log = logging.getLogger("build")


# ---------------------------------------------------------------- fetching
def fetch(tv, symbol, exchange):
    from tvDatafeed import Interval
    for attempt in range(1, C.RETRIES + 1):
        try:
            df = tv.get_hist(symbol=symbol, exchange=exchange,
                             interval=Interval.in_daily, n_bars=C.N_BARS)
        except Exception as e:  # library usually returns None, but be safe
            log.warning("%s:%s attempt %d raised %s", exchange, symbol, attempt, e)
            df = None
        if df is not None and len(df) > 0:
            return df
        log.warning("%s:%s attempt %d returned no data", exchange, symbol, attempt)
        time.sleep(2 * attempt)
    return None


def normalize(df):
    """tvdatafeed DataFrame -> daily OHLC indexed by date, ascending, unique."""
    out = df[["open", "high", "low", "close"]].astype(float).copy()
    out.index = pd.to_datetime(out.index).normalize()
    out = out[~out.index.duplicated(keep="last")].sort_index()
    return out.dropna()


def load_previous(asset_id):
    f = ASSET_DIR / f"{asset_id}.json"
    if not f.exists():
        return None
    d = json.loads(f.read_text(encoding="utf-8"))
    b = d["bars"]
    df = pd.DataFrame({"open": b["o"], "high": b["h"], "low": b["l"], "close": b["c"]},
                      index=pd.to_datetime(b["t"]))
    return df


# ---------------------------------------------------------------- indicators
def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return (100 - 100 / (1 + rs)).fillna(100)


def atr(df, n=14):
    pc = df["close"].shift()
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()],
                   axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def trend_of(close, e50, e200):
    if close > e50 > e200:
        return "UPTREND"
    if close < e50 < e200:
        return "DOWNTREND"
    return "SIDEWAYS"


def strategy_of(kind, trend, quadrant, dist, close, e50):
    if kind == "equity" and quadrant == "Lagging":
        return "AVOID"
    if kind != "equity" and trend == "DOWNTREND":
        return "AVOID"
    if dist > -0.02:
        return "BREAKOUT"
    if dist >= -0.10:
        return "BUY DIP" if close > e50 else "WATCH"
    return "CORRECTION"


def price_asof(close, when):
    s = close[close.index <= when]
    return float(s.iloc[-1]) if len(s) else None


def pct(a, b):
    if a is None or b is None or b == 0:
        return None
    return a / b - 1


def performance(close):
    last_d = close.index[-1]
    last = float(close.iloc[-1])
    month_start = last_d.replace(day=1)
    out = {"MTD": pct(last, price_asof(close, month_start - pd.Timedelta(days=1)))}
    for key, months in (("1M", 1), ("3M", 3), ("6M", 6), ("12M", 12)):
        out[key] = pct(last, price_asof(close, last_d - pd.DateOffset(months=months)))
    return out


def monthly_returns(close, n_months):
    """Last n_months calendar-month returns; the current month is month-to-date."""
    me = close.resample("ME").last()
    rets = me.pct_change()
    return rets.iloc[-n_months:]


def rrg(px, bm, period, tail):
    """RS-Ratio / RS-Momentum on weekly closes (open approximation of JdK; the original is proprietary).

    RS-Ratio    = 100 * EMA(period)(RS) / EMA(3*period)(RS)      -> relative trend, centred on 100
    RS-Momentum = 100 * RS-Ratio / EMA(period)(RS-Ratio)        -> rate of change of that trend
    EMA smoothing keeps the tails readable (the z-score variant jumps by >1 point per week).
    Daily closes are inner-joined first (same trading days only), then resampled to weekly,
    so the ratio never compares different days. The last point may be a partial week.
    """
    w = pd.concat([px, bm], axis=1, join="inner").dropna().resample("W-FRI").last().dropna()
    rs = 100 * w.iloc[:, 0] / w.iloc[:, 1]
    rsr = 100 * rs.ewm(span=period, adjust=False).mean() / rs.ewm(span=3 * period, adjust=False).mean()
    rsm = 100 * rsr / rsr.ewm(span=period, adjust=False).mean()
    rsr, rsm = rsr.iloc[3 * period:], rsm.iloc[3 * period:]  # drop EMA warm-up
    pts = pd.concat([rsr, rsm], axis=1).dropna().iloc[-tail:]
    last_common = pd.concat([px, bm], axis=1, join="inner").dropna().index[-1]
    out = [{"d": d.strftime("%Y-%m-%d"), "x": round(float(x), 3), "y": round(float(y), 3)}
           for d, (x, y) in pts.iterrows()]
    if out:
        out[-1]["d"] = last_common.strftime("%Y-%m-%d")  # actual date of the last (possibly partial) week
    return out


def quadrant_of(x, y):
    if x >= 100 and y >= 100:
        return "Leading"
    if x >= 100:
        return "Weakening"
    if y < 100:
        return "Lagging"
    return "Improving"


def r(v, nd=4):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    return round(float(v), nd)


# ---------------------------------------------------------------- main
def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("tvDatafeed").setLevel(logging.ERROR)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)

    from tvDatafeed import TvDatafeed
    tv = TvDatafeed()

    frames, sources, fresh = {}, {}, 0
    targets = [(a[0], a[3], a[4]) for a in C.ASSETS] + [(C.BENCHMARK[0], C.BENCHMARK[2], C.BENCHMARK[3])]
    for aid, sym, ex in targets:
        df = fetch(tv, sym, ex)
        if df is not None:
            frames[aid] = normalize(df)
            fresh += 1
            log.info("OK   %-7s %s:%s  %d bars, last %s", aid, ex, sym, len(frames[aid]),
                     frames[aid].index[-1].date())
        else:
            prev = load_previous(aid)
            if prev is None:
                log.error("FAIL %-7s %s:%s  no data and no previous file", aid, ex, sym)
                continue
            frames[aid] = prev
            log.warning("KEEP %-7s %s:%s  using previous data (last %s)", aid, ex, sym,
                        prev.index[-1].date())
        sources[aid] = f"{ex}:{sym}"

    if fresh == 0:
        log.error("No asset could be fetched; aborting without writing data.")
        sys.exit(1)

    bm_id = C.BENCHMARK[0]
    bm_close = frames[bm_id]["close"] if bm_id in frames else None

    summary_assets, perf, rot = [], {}, {}
    rrg_out = {}
    for aid, name, group, sym, ex, kind, in_perf, color in C.ASSETS:
        if aid not in frames:
            continue
        df = frames[aid]
        close = df["close"]
        e50, e200 = ema(close, C.EMA_FAST), ema(close, C.EMA_SLOW)
        rs = rsi(close, C.RSI_LEN)
        at = atr(df, C.ATR_LEN)

        last, l50, l200 = float(close.iloc[-1]), float(e50.iloc[-1]), float(e200.iloc[-1])
        hi52 = float(df["high"].iloc[-252:].max())
        dist = last / hi52 - 1
        trend = trend_of(last, l50, l200)

        quadrant = None
        if kind == "equity" and bm_close is not None:
            pts = rrg(close, bm_close, C.RRG_PERIOD, C.RRG_TAIL)
            if pts:
                rrg_out[aid] = pts
                quadrant = quadrant_of(pts[-1]["x"], pts[-1]["y"])

        strategy = strategy_of(kind, trend, quadrant, dist, last, l50)
        chg1d = pct(last, float(close.iloc[-2])) if len(close) > 1 else None

        summary_assets.append({
            "id": aid, "name": name, "group": group, "kind": kind, "color": color,
            "source": sources[aid], "lastDate": close.index[-1].strftime("%Y-%m-%d"),
            "last": r(last, 4), "chg1d": r(chg1d), "ema50": r(l50, 4), "ema200": r(l200, 4),
            "rsi": r(float(rs.iloc[-1]), 2), "high52": r(hi52, 4), "distHigh": r(dist),
            "trend": trend, "quadrant": quadrant, "strategy": strategy,
        })

        if in_perf:
            perf[aid] = {k: r(v) for k, v in performance(close).items()}
            rot[aid] = monthly_returns(close, C.ROTATION_MONTHS)

        (ASSET_DIR / f"{aid}.json").write_text(json.dumps({
            "id": aid, "name": name, "group": group, "kind": kind, "source": sources[aid],
            "trend": trend, "strategy": strategy, "quadrant": quadrant,
            "bars": {
                "t": [d.strftime("%Y-%m-%d") for d in df.index],
                "o": [r(v, 4) for v in df["open"]], "h": [r(v, 4) for v in df["high"]],
                "l": [r(v, 4) for v in df["low"]], "c": [r(v, 4) for v in close],
                "ema50": [r(v, 4) for v in e50], "ema200": [r(v, 4) for v in e200],
                "rsi": [r(v, 2) for v in rs], "atr": [r(v, 4) for v in at],
            },
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # keep benchmark bars so the "use previous data" fallback works for it too
    if bm_id in frames:
        b = frames[bm_id]
        (ASSET_DIR / f"{bm_id}.json").write_text(json.dumps({
            "id": bm_id, "name": C.BENCHMARK[1], "source": sources[bm_id],
            "bars": {"t": [d.strftime("%Y-%m-%d") for d in b.index],
                     "o": [r(v, 4) for v in b["open"]], "h": [r(v, 4) for v in b["high"]],
                     "l": [r(v, 4) for v in b["low"]], "c": [r(v, 4) for v in b["close"]]},
        }, separators=(",", ":")), encoding="utf-8")

    # rotation: align months across assets; latest column is MTD
    months = sorted(set().union(*[set(s.index) for s in rot.values()]))[-C.ROTATION_MONTHS:]
    now_month = max(months) if months else None
    rotation = []
    for m in months:
        cells = [{"id": aid, "ret": r(float(s.loc[m]))} for aid, s in rot.items()
                 if m in s.index and not pd.isna(s.loc[m])]
        cells.sort(key=lambda c: c["ret"], reverse=True)
        rotation.append({"label": m.strftime("%b %y"), "mtd": m == now_month, "cells": cells})

    summary = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dataDate": max(a["lastDate"] for a in summary_assets),
        "benchmark": {"id": bm_id, "name": C.BENCHMARK[1],
                      "lastDate": bm_close.index[-1].strftime("%Y-%m-%d") if bm_close is not None else None},
        "assets": summary_assets,
        "performance": perf,
        "rotation": rotation,
        "rrg": rrg_out,
    }
    (DATA / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1),
                                       encoding="utf-8")
    log.info("Wrote %d assets (%d fetched fresh).", len(summary_assets), fresh)


if __name__ == "__main__":
    main()
