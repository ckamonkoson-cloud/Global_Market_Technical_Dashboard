# Global Market Technical Dashboard

Static dashboard (GitHub Pages) of 22 global indices / assets (plus a Risk-On/Risk-Off gauge), updated by GitHub Actions.

- `scripts/config.py` — asset list, TradingView symbols, parameters
- `scripts/build_data.py` — fetches 1000 daily bars per asset via tvdatafeed, computes EMA50/200, RSI(14),
  trend, strategy, performance, monthly rotation and RRG (vs ACWI ETF), writes `site/data/`
- `site/` — the web page (`index.html` dashboard, `chart.html?s=<ID>` technical chart; Lightweight Charts 5.2.1).
  Support/resistance zones and RSI divergences are computed in the browser (`assets/analysis.js`) for the selected range.
- `.github/workflows/update.yml` — runs 04:47 (backup 06:13) Mon–Sat and 18:13 (backup 19:07) Mon–Fri Bangkok time, or on demand (Actions → Update dashboard → Run workflow)

## Run locally

```
pip install -r requirements.txt
python scripts/build_data.py
cd site && python -m http.server 8000   # open http://localhost:8000
```

If a symbol cannot be fetched, the previous data file is kept. Data is for analysis only, not investment advice.
