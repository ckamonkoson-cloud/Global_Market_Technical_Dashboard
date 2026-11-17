"""Asset universe and parameters for the dashboard."""

N_BARS = 1000
RETRIES = 4

# kind: "equity" -> in Performance, Rotation, RRG; quadrant drives AVOID
#       "other"  -> in Performance and Rotation (unless perf=False); DOWNTREND drives AVOID
ASSETS = [
    # id,      name,                 group,            symbol,   exchange, kind,     perf,  color
    ("SPX",    "S&P 500",            "หุ้นสหรัฐฯ",      "SPX",    "SP",     "equity", True,  "#1f4e9c"),
    ("IXIC",   "Nasdaq Composite",   "หุ้นสหรัฐฯ",      "IXIC",   "NASDAQ", "equity", True,  "#3a7bd5"),
    ("NDX",    "Nasdaq 100",         "หุ้นสหรัฐฯ",      "NDX",    "NASDAQ", "equity", True,  "#5b4bc4"),
    ("RUT",    "Russell 2000",       "หุ้นสหรัฐฯ",      "RUT",    "TVC",    "equity", True,  "#0f3460"),
    ("SXXP",   "STOXX 600",          "หุ้นยุโรป",       "SXXP",   "TVC",    "equity", True,  "#8e44ad"),
    ("NI225",  "Nikkei 225",         "หุ้นญี่ปุ่น",      "NI225",  "TVC",    "equity", True,  "#00897b"),
    ("TOPIX",  "TOPIX",              "หุ้นญี่ปุ่น",      "TOPIX",  "TSE",    "equity", True,  "#26a69a"),
    ("CSI300", "CSI 300",            "หุ้นจีน",         "000300", "SSE",    "equity", True,  "#c0392b"),
    ("SSEC",   "SSE Composite",      "หุ้นจีน",         "000001", "SSE",    "equity", True,  "#e74c3c"),
    ("HSI",    "Hang Seng Index",    "หุ้นฮ่องกง",       "HSI",    "TVC",    "equity", True,  "#a93226"),
    ("HSTECH", "Hang Seng Tech",     "หุ้นฮ่องกง",       "HSTECH", "HSI",    "equity", True,  "#d35400"),
    ("HSCEI",  "HSCEI",              "หุ้นจีนในฮ่องกง",   "HSCEI",  "HSI",    "equity", True,  "#b9770e"),
    ("SENSEX", "Sensex",             "หุ้นอินเดีย",      "SENSEX", "BSE",    "equity", True,  "#f39c12"),
    ("KOSPI",  "KOSPI",              "หุ้นเกาหลีใต้",     "KOSPI",  "KRX",    "equity", True,  "#d63384"),
    ("SET",    "SET Index",          "หุ้นไทย",         "SET",    "SET",    "equity", True,  "#6a1b9a"),
    ("US10Y",  "US 10-Year Yield",   "พันธบัตรสหรัฐฯ",   "US10Y",  "TVC",    "other",  False, "#546e7a"),
    ("US02Y",  "US 2-Year Yield",    "พันธบัตรสหรัฐฯ",   "US02Y",  "TVC",    "other",  False, "#90a4ae"),
    ("XAUUSD", "Gold Spot",          "สินค้าโภคภัณฑ์",    "XAUUSD", "OANDA",  "other",  True,  "#b8860b"),
    ("BRENT",  "Brent Oil",          "พลังงาน",         "UKOIL",  "TVC",    "other",  True,  "#3e2723"),
    ("USDTHB", "USD/THB",            "อัตราแลกเปลี่ยน",   "USDTHB", "FX_IDC", "other",  True,  "#2e7d32"),
    ("DXY",    "US Dollar Index",    "อัตราแลกเปลี่ยน",   "DXY",    "TVC",    "other",  True,  "#00695c"),
    ("VIX",    "VIX",                "ความผันผวน",       "VIX",    "TVC",    "other",  False, "#c62828"),
]

# How the front end formats levels/changes: yields show "%" levels and bp changes.
YIELD_IDS = {"US10Y", "US02Y"}
# A trend/Strategy flag on a fear index would read backwards (a VIX "BREAKOUT" is not a buy).
NO_STRATEGY = {"VIX"}

# Inputs used only by the Risk-On / Risk-Off gauge (not shown as rows).
# id, name, symbol, exchange
AUX = [
    ("HYG",    "iShares High Yield Corporate Bond ETF", "HYG",  "AMEX"),
    ("IEF",    "iShares 7-10 Year Treasury Bond ETF",   "IEF",  "NASDAQ"),
    ("COPPER", "Copper Futures (continuous)",           "HG1!", "COMEX"),
]
RISK_WINDOW = 252      # rolling percentile window (trading days)
RISK_ROC = 20          # rate-of-change lookback for ratio components (trading days)
RISK_HISTORY = 252     # days of gauge history written to summary.json

# Benchmark for RRG only (ETF tracking MSCI ACWI; the index itself is not on TradingView)
BENCHMARK = ("ACWI", "MSCI ACWI (ETF)", "ACWI", "NASDAQ")

EMA_FAST, EMA_SLOW, RSI_LEN, ATR_LEN = 50, 200, 14, 14
RRG_PERIOD, RRG_TAIL = 10, 8
ROTATION_MONTHS = 6
