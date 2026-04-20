"""
Newshock · Pattern Backtest Toolkit
-----------------------------------
Run this locally (with Claude Code) to validate each event pattern against
historical price data.

Requirements:
    pip install pandas requests python-dotenv

Data source:
    Financial Modeling Prep (FMP) free tier supports daily OHLCV.
    Sign up at https://site.financialmodelingprep.com/developer
    Free tier: 250 requests/day, limited to recent years.
    Starter tier ($30/mo): full history, 750 req/day.

Setup:
    1. Put your API key in a .env file:
       FMP_API_KEY=your_key_here
    2. Put pattern ground truth JSON files in ./patterns/
       (format: see pattern_01_groundtruth.json)
    3. Run: python backtest.py pattern_01

Output:
    - Prints per-instance T+1, T+5, T+30 returns and alpha vs SPY
    - Aggregates win rate and average alpha per tier
    - Writes results to ./results/<pattern_id>_backtest.json
    - PASS/FAIL verdict based on thresholds:
        * Tier 1 T+5 win rate >= 60%
        * Tier 1 T+5 avg alpha >= +2%
        * Sample size >= 5
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("FMP_API_KEY")
FMP_BASE = "https://financialmodelingprep.com/stable"

# Validation thresholds
TIER_1_WIN_RATE_THRESHOLD = 0.60
TIER_1_ALPHA_THRESHOLD = 0.02  # +2% over SPY at T+5
MIN_SAMPLE_SIZE = 5

# ──────────────────────────────────────────────────────────────────────────────
# Data fetching
# ──────────────────────────────────────────────────────────────────────────────

_price_cache: dict = {}


def get_price_history(ticker: str, start: str, end: str) -> Optional[pd.DataFrame]:
    """Fetch daily OHLCV from FMP. Cached per (ticker, start, end)."""
    key = (ticker, start, end)
    if key in _price_cache:
        return _price_cache[key]

    url = f"{FMP_BASE}/historical-price-eod/full"
    params = {"symbol": ticker, "from": start, "to": end, "apikey": API_KEY}
    try:
        r = requests.get(url, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ! fetch error {ticker}: {e}")
        return None

    # New stable API returns a list directly (not wrapped in {"historical": [...]})
    historical = data if isinstance(data, list) else data.get("historical", [])
    if not historical:
        print(f"  ! no data for {ticker}")
        return None

    df = pd.DataFrame(historical)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    _price_cache[key] = df
    return df


def get_return(ticker: str, event_date: str, holding_days: int) -> Optional[float]:
    """
    Return pct change from close on event_date to close on event_date + holding_days trading days.
    Uses open of T+1 if event_date is close / you want "realistic entry" timing.
    Here we use close-to-close for simplicity.
    """
    event_dt = datetime.strptime(event_date, "%Y-%m-%d")
    # Pull a generous window — 60 calendar days should cover up to T+30 trading days
    end = (event_dt + timedelta(days=holding_days * 2 + 10)).strftime("%Y-%m-%d")
    start = (event_dt - timedelta(days=10)).strftime("%Y-%m-%d")

    df = get_price_history(ticker, start, end)
    if df is None or df.empty:
        return None

    # Find rows >= event_date
    df_after = df[df["date"] >= event_dt].reset_index(drop=True)
    if len(df_after) < holding_days + 1:
        return None

    entry_price = df_after.iloc[0]["close"]
    exit_price = df_after.iloc[holding_days]["close"]
    return (exit_price - entry_price) / entry_price


# ──────────────────────────────────────────────────────────────────────────────
# Backtest logic
# ──────────────────────────────────────────────────────────────────────────────


def backtest_instance(instance: dict, tier_tickers: dict) -> dict:
    """Run backtest for one historical event across all tier tickers."""
    event_date = instance["event_date"]
    result = {
        "event_id": instance["event_id"],
        "event_date": event_date,
        "event_name": instance["event_name"],
        "returns": {},
        "spy_returns": {},
        "alphas": {},
    }

    # SPY baseline for alpha calc
    for window in [1, 5, 30]:
        spy_ret = get_return("SPY", event_date, window)
        result["spy_returns"][f"t{window}"] = spy_ret

    # Each tier ticker
    for tier_name, tickers in tier_tickers.items():
        result["returns"][tier_name] = {}
        result["alphas"][tier_name] = {}
        for ticker in tickers:
            result["returns"][tier_name][ticker] = {}
            result["alphas"][tier_name][ticker] = {}
            for window in [1, 5, 30]:
                ret = get_return(ticker, event_date, window)
                spy_ret = result["spy_returns"][f"t{window}"]
                result["returns"][tier_name][ticker][f"t{window}"] = ret
                if ret is not None and spy_ret is not None:
                    result["alphas"][tier_name][ticker][f"t{window}"] = ret - spy_ret
                else:
                    result["alphas"][tier_name][ticker][f"t{window}"] = None

    return result


def aggregate_results(all_results: list, tier_tickers: dict) -> dict:
    """Compute win rate and avg alpha per tier per window."""
    agg = {}
    for tier_name, tickers in tier_tickers.items():
        agg[tier_name] = {}
        for window in [1, 5, 30]:
            key = f"t{window}"
            alphas = []
            for result in all_results:
                for ticker in tickers:
                    a = result["alphas"].get(tier_name, {}).get(ticker, {}).get(key)
                    if a is not None:
                        alphas.append(a)
            if alphas:
                wins = sum(1 for a in alphas if a > 0)
                agg[tier_name][key] = {
                    "n": len(alphas),
                    "win_rate": wins / len(alphas),
                    "avg_alpha": sum(alphas) / len(alphas),
                    "median_alpha": sorted(alphas)[len(alphas) // 2],
                    "best": max(alphas),
                    "worst": min(alphas),
                }
            else:
                agg[tier_name][key] = {"n": 0}
    return agg


def verdict(agg: dict) -> str:
    """PASS/FAIL against thresholds."""
    t1 = agg.get("tier_1", {}).get("t5")
    if not t1 or t1["n"] < MIN_SAMPLE_SIZE:
        return f"INSUFFICIENT_DATA (n={t1['n'] if t1 else 0} < {MIN_SAMPLE_SIZE})"
    if t1["win_rate"] < TIER_1_WIN_RATE_THRESHOLD:
        return f"FAIL: tier_1 T+5 win rate {t1['win_rate']:.1%} < {TIER_1_WIN_RATE_THRESHOLD:.0%}"
    if t1["avg_alpha"] < TIER_1_ALPHA_THRESHOLD:
        return f"FAIL: tier_1 T+5 avg alpha {t1['avg_alpha']:.2%} < {TIER_1_ALPHA_THRESHOLD:.0%}"
    return "PASS"


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────


def run_pattern(pattern_file: str):
    pattern_path = Path("patterns") / f"{pattern_file}.json"
    if not pattern_path.exists():
        print(f"ERROR: {pattern_path} not found")
        sys.exit(1)

    with open(pattern_path) as f:
        pattern = json.load(f)

    print(f"\n{'='*70}")
    print(f"Backtesting: {pattern['pattern_name']}")
    print(f"Pattern ID : {pattern['pattern_id']}")
    print(f"Instances  : {len(pattern['instances'])}")
    print(f"{'='*70}\n")

    # Build tier ticker lists from instances
    tier_1_tickers = set()
    tier_2_tickers = set()
    for inst in pattern["instances"]:
        tier_1_tickers.update(inst.get("tier_1_reactions", {}).keys())
        tier_2_tickers.update(inst.get("tier_2_reactions", {}).keys())
    tier_tickers = {
        "tier_1": sorted(tier_1_tickers),
        "tier_2": sorted(tier_2_tickers),
    }
    print(f"Tier 1 tickers: {tier_tickers['tier_1']}")
    print(f"Tier 2 tickers: {tier_tickers['tier_2']}\n")

    # Run each instance
    all_results = []
    for inst in pattern["instances"]:
        print(f"  · {inst['event_date']}  {inst['event_name']}")
        result = backtest_instance(inst, tier_tickers)
        all_results.append(result)

    # Aggregate
    agg = aggregate_results(all_results, tier_tickers)
    v = verdict(agg)

    output = {
        "pattern_id": pattern["pattern_id"],
        "pattern_name": pattern["pattern_name"],
        "run_at": datetime.now().isoformat(),
        "n_instances": len(all_results),
        "aggregate": agg,
        "verdict": v,
        "raw_instance_results": all_results,
    }

    # Write results
    results_dir = Path("results")
    results_dir.mkdir(exist_ok=True)
    out_path = results_dir / f"{pattern['pattern_id']}_backtest.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    # Print summary
    print(f"\n{'─'*70}")
    print(f"AGGREGATE RESULTS")
    print(f"{'─'*70}")
    for tier_name, windows in agg.items():
        print(f"\n  {tier_name.upper()}:")
        for key, stats in windows.items():
            if stats.get("n", 0) == 0:
                print(f"    {key}:  no data")
                continue
            print(
                f"    {key}:  n={stats['n']:>3}  "
                f"win={stats['win_rate']:.0%}  "
                f"avg α={stats['avg_alpha']:+.2%}  "
                f"med={stats['median_alpha']:+.2%}  "
                f"best={stats['best']:+.1%}  worst={stats['worst']:+.1%}"
            )

    print(f"\n{'='*70}")
    print(f"VERDICT: {v}")
    print(f"{'='*70}")
    print(f"Results saved -> {out_path}\n")


if __name__ == "__main__":
    if not API_KEY:
        print("ERROR: Set FMP_API_KEY in .env file")
        sys.exit(1)
    if len(sys.argv) < 2:
        print("Usage: python backtest.py <pattern_id>")
        print("Example: python backtest.py pattern_01_groundtruth")
        sys.exit(1)
    run_pattern(sys.argv[1])
