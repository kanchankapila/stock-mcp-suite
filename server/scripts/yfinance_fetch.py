#!/usr/bin/env python3
"""
Fetch stock data using yfinance (default) or yahooquery (batch provider).

Usage:
  - Single symbol JSON (back-compat, yfinance):
      python server/scripts/yfinance_fetch.py <SYMBOL> [--period 6mo] [--interval 1d] [--provider yfinance|yahooquery]
    Prints a JSON with keys: history, info, actions, major_holders, financials.

  - Ingest all symbols from stocklist.ts into SQLite (stock.db):
      python server/scripts/yfinance_fetch.py --all [--period 6mo] [--interval 1d] [--provider yfinance|yahooquery]
    Reads symbols from server/stocklist.ts, appends Yahoo suffix (default .NS),
    fetches daily history and fundamentals, and upserts into prices + related tables.

Environment:
  PROVIDER=yahooquery   (alternative to --provider flag)
  TICKER_YAHOO_SUFFIX / YAHOO_SUFFIX   to override suffix (.NS default)
"""

from __future__ import annotations
import json
import sys
import subprocess
import shlex
from typing import Any, Dict, List, Tuple
from pathlib import Path
import os
import sqlite3


def ensure_deps(provider: str = "yfinance") -> None:
    """Ensure required pip dependencies are installed.
    For yahooquery provider we need yahooquery + pandas.
    For yfinance provider we need yfinance + pandas.
    """
    base_pkgs = ["pandas"]
    if provider == "yahooquery":
        pkgs = ["yahooquery"] + base_pkgs
    else:
        pkgs = ["yfinance"] + base_pkgs
    missing: List[str] = []
    for p in pkgs:
        try:
            __import__(p)
        except Exception:
            missing.append(p)
    if missing:
        try:
            cmd = f"{shlex.quote(sys.executable)} -m pip install --quiet {' '.join(missing)}"
            subprocess.check_call(cmd, shell=True)
        except Exception as e:  # pragma: no cover
            print(json.dumps({"ok": False, "error": f"Dependency install failed: {e}", "missing": missing}), file=sys.stderr)
            raise


def fail(msg: str, code: int = 1) -> None:
    print(json.dumps({"ok": False, "error": msg}), file=sys.stderr)
    sys.exit(code)


def df_records(df) -> List[Dict[str, Any]]:
    if df is None:
        return []
    try:
        import pandas as pd  # type: ignore
        if isinstance(df.index, pd.DatetimeIndex):
            df = df.copy()
            df.insert(0, "date", df.index.astype(str))
            df.reset_index(drop=True, inplace=True)
        elif df.index.name and df.index.name not in df.columns:
            df = df.reset_index()
        return json.loads(df.to_json(orient="records"))
    except Exception:
        try:
            return json.loads(df.to_json(orient="records"))
        except Exception:
            return []


def df_dict(df) -> Dict[str, Any]:
    if df is None:
        return {}
    try:
        return json.loads(df.to_json())  # default = columns/series
    except Exception:
        try:
            return json.loads(df.to_json(orient="index"))
        except Exception:
            return {}


def parse_args(argv: List[str]) -> Dict[str, str]:
    # Defaults
    out: Dict[str, str] = {"symbol": "", "period": "1y", "interval": "1d", "all": "false", "provider": os.environ.get("PROVIDER", "yfinance")}
    if len(argv) < 2:
        # No args -> run all by default
        out["all"] = "true"
        return out
    # Parse flags and the first non-flag as symbol
    i = 1
    while i < len(argv):
        part = argv[i]
        if part in ("--all", "-a"):
            out["all"] = "true"
        elif part.startswith("--provider"):
            k, _, v = part.partition("=")
            if v:
                out["provider"] = v.lower()
            else:
                if (i + 1) < len(argv):
                    out["provider"] = argv[i + 1].lower()
                    i += 1
        elif part.startswith("--period"):
            k, _, v = part.partition("=")
            if v:
                out["period"] = v
            else:
                out["period"] = argv[i + 1] if (i + 1) < len(argv) else out["period"]
                if (i + 1) < len(argv):
                    i += 1
        elif part.startswith("--interval"):
            k, _, v = part.partition("=")
            if v:
                out["interval"] = v
            else:
                out["interval"] = argv[i + 1] if (i + 1) < len(argv) else out["interval"]
                if (i + 1) < len(argv):
                    i += 1
        elif not part.startswith("-") and not out["symbol"]:
            out["symbol"] = part.upper()
        i += 1
    return out


def find_stocklist_path() -> Path | None:
    here = Path(__file__).resolve().parent
    candidates = [
        os.environ.get("STOCKLIST_PATH"),
        Path.cwd() / "stocklist.ts",
        Path.cwd() / "server" / "stocklist.ts",
        here.parent / "stocklist.ts",  # server/stocklist.ts
        here.parent.parent / "server" / "stocklist.ts",
    ]
    for c in candidates:
        if not c:
            continue
        p = Path(c)
        if p.exists():
            return p
    return None


def load_symbols_from_stocklist() -> List[Tuple[str, str | None]]:
    """
    Returns list of (symbol, name) from stocklist.ts-like file.
    Uses a loose regex to avoid depending on TS runtime.
    """
    p = find_stocklist_path()
    if not p:
        return []
    txt = p.read_text(encoding="utf-8", errors="ignore")
    entries: List[Tuple[str, str | None]] = []
    # Roughly split into object chunks and extract keys
    import re
    obj_re = re.compile(r"\{[^}]*\}", re.S | re.M)
    # Anchor key names to avoid 'mcsymbol' matching 'symbol'
    def get_val(chunk: str, key: str) -> str | None:
        r = re.compile(rf"(?:^|[\s,{{]){key}\s*:\s*'([^']*)'", re.I)
        m = r.search(chunk)
        return m.group(1).strip() if m else None

    for m in obj_re.finditer(txt):
        ch = m.group(0)
        sym = get_val(ch, "symbol")
        name = get_val(ch, "name")
        if sym:
            entries.append((sym.upper(), name))
    return entries


def resolve_db_path() -> Path:
    """Resolve existing DB path, preferring server/stock.db.
    Order:
      1) env STOCK_DB_PATH or DB_PATH if set
      2) server/stock.db (sibling of this script's parent)
      3) repo root stock.db
    """
    env_db = os.environ.get("STOCK_DB_PATH") or os.environ.get("DB_PATH")
    if env_db:
        return Path(env_db).resolve()
    here = Path(__file__).resolve()
    server_db = (here.parent.parent / "stock.db").resolve()  # server/stock.db
    root_db = (here.parents[2] / "stock.db").resolve()       # repo/stock.db
    if server_db.exists():
        return server_db
    if root_db.exists():
        return root_db
    # Default to server/stock.db if neither exists
    return server_db


def ensure_db_schema(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS stocks(
          symbol TEXT PRIMARY KEY,
          name TEXT
        );

        CREATE TABLE IF NOT EXISTS prices(
          symbol TEXT,
          date TEXT,
          open REAL, high REAL, low REAL, close REAL, volume INTEGER,
          PRIMARY KEY(symbol, date)
        );

        -- Optional Yahoo caches
        CREATE TABLE IF NOT EXISTS yahoo_info(
          symbol TEXT PRIMARY KEY,
          info TEXT,
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS yahoo_actions(
          symbol TEXT PRIMARY KEY,
          data TEXT,
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS yahoo_major_holders(
          symbol TEXT PRIMARY KEY,
          data TEXT,
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS yahoo_financials(
          symbol TEXT PRIMARY KEY,
          income_statement TEXT,
          balance_sheet TEXT,
          cash_flow TEXT,
          updated_at TEXT
        );

        -- Normalized actions: one row per date
        CREATE TABLE IF NOT EXISTS yahoo_actions_rows(
          symbol TEXT,
          date TEXT,
          dividend REAL,
          split REAL,
          PRIMARY KEY(symbol, date)
        );

        -- Normalized institutional holders: one row per holder
        CREATE TABLE IF NOT EXISTS yahoo_institutional_holders(
          symbol TEXT,
          holder TEXT,
          report_date TEXT,
          pct_held REAL,
          shares INTEGER,
          value REAL,
          PRIMARY KEY(symbol, holder)
        );

        -- Normalized mutual fund holders: one row per holder
        CREATE TABLE IF NOT EXISTS yahoo_mutual_holders(
          symbol TEXT,
          holder TEXT,
          report_date TEXT,
          pct_held REAL,
          shares INTEGER,
          value REAL,
          PRIMARY KEY(symbol, holder)
        );
        """
    )
    conn.commit()


def upsert_prices(conn: sqlite3.Connection, symbol: str, rows: List[Dict[str, Any]]) -> int:
    if not rows:
        return 0
    cur = conn.cursor()
    cur.executemany(
        "INSERT OR REPLACE INTO prices(symbol,date,open,high,low,close,volume) VALUES(?,?,?,?,?,?,?)",
        [
            (
                symbol,
                r.get("date"),
                float(r.get("Open") if r.get("Open") is not None else r.get("open", 0.0)),
                float(r.get("High") if r.get("High") is not None else r.get("high", 0.0)),
                float(r.get("Low") if r.get("Low") is not None else r.get("low", 0.0)),
                float(r.get("Close") if r.get("Close") is not None else r.get("close", 0.0)),
                int(float(r.get("Volume") if r.get("Volume") is not None else r.get("volume", 0)))
            )
            for r in rows
            if r.get("date")
        ],
    )
    conn.commit()
    return cur.rowcount or 0


def upsert_stock(conn: sqlite3.Connection, symbol: str, name: str | None) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO stocks(symbol, name) VALUES(?, ?) ON CONFLICT(symbol) DO UPDATE SET name=excluded.name",
        (symbol, name or symbol),
    )
    conn.commit()


def upsert_yahoo_info(conn: sqlite3.Connection, symbol: str, info: Dict[str, Any]) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO yahoo_info(symbol, info, updated_at) VALUES(?, ?, ?)\n"
        "ON CONFLICT(symbol) DO UPDATE SET info=excluded.info, updated_at=excluded.updated_at",
        (symbol, json.dumps(info or {}), _now()),
    )
    conn.commit()


def upsert_yahoo_actions(conn: sqlite3.Connection, symbol: str, data: List[Dict[str, Any]]) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO yahoo_actions(symbol, data, updated_at) VALUES(?, ?, ?)\n"
        "ON CONFLICT(symbol) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        (symbol, json.dumps(data or []), _now()),
    )
    conn.commit()


def upsert_yahoo_major_holders(conn: sqlite3.Connection, symbol: str, data: List[Dict[str, Any]] | Dict[str, Any]) -> None:
    # Accept list or dict and store as JSON
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO yahoo_major_holders(symbol, data, updated_at) VALUES(?, ?, ?)\n"
        "ON CONFLICT(symbol) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        (symbol, json.dumps(data or []), _now()),
    )
    conn.commit()


def upsert_yahoo_financials(conn: sqlite3.Connection, symbol: str, income: Dict[str, Any], balance: Dict[str, Any], cash: Dict[str, Any]) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO yahoo_financials(symbol, income_statement, balance_sheet, cash_flow, updated_at) VALUES(?, ?, ?, ?, ?)\n"
        "ON CONFLICT(symbol) DO UPDATE SET income_statement=excluded.income_statement, balance_sheet=excluded.balance_sheet, cash_flow=excluded.cash_flow, updated_at=excluded.updated_at",
        (symbol, json.dumps(income or {}), json.dumps(balance or {}), json.dumps(cash or {}), _now()),
    )
    conn.commit()


def _now() -> str:
    return __import__('datetime').datetime.utcnow().isoformat()


def upsert_actions_rows(conn: sqlite3.Connection, symbol: str, recs: List[Dict[str, Any]]) -> int:
    if not recs:
        return 0
    cur = conn.cursor()
    rows: List[Tuple[Any, ...]] = []
    for r in recs:
        d = str(r.get("date") or "")[:10]
        if not d:
            continue
        div = r.get("Dividends")
        split = r.get("Stock Splits") or r.get("Stock_Splits") or r.get("Splits")
        try:
            div_f = float(div) if div is not None else None
        except Exception:
            div_f = None
        try:
            split_f = float(split) if split is not None else None
        except Exception:
            split_f = None
        rows.append((symbol, d, div_f, split_f))
    if not rows:
        return 0
    cur.executemany(
        "INSERT OR REPLACE INTO yahoo_actions_rows(symbol,date,dividend,split) VALUES(?,?,?,?)",
        rows,
    )
    conn.commit()
    return cur.rowcount or 0


def _norm_holder_row(symbol: str, r: Dict[str, Any]) -> Tuple[str, str, str | None, float | None, int | None, float | None]:
    holder = str(r.get("Holder") or r.get("holder") or r.get("name") or "").strip()
    report_date = r.get("Date Reported") or r.get("date_reported") or r.get("date") or None
    if report_date:
        report_date = str(report_date)[:10]
    pct = r.get("% Out") or r.get("pct_held") or r.get("Percent")
    try: pct_f = float(pct)
    except Exception: pct_f = None
    shares = r.get("Shares") or r.get("shares")
    try: shares_i = int(float(shares)) if shares is not None else None
    except Exception: shares_i = None
    value = r.get("Value") or r.get("value")
    try: value_f = float(value) if value is not None else None
    except Exception: value_f = None
    return (symbol, holder, report_date, pct_f, shares_i, value_f)


def upsert_institutional_holders(conn: sqlite3.Connection, symbol: str, recs: List[Dict[str, Any]]) -> int:
    if not recs:
        return 0
    cur = conn.cursor()
    rows = [_norm_holder_row(symbol, r) for r in recs if (r.get("Holder") or r.get("holder") or r.get("name"))]
    if not rows:
        return 0
    cur.executemany(
        "INSERT OR REPLACE INTO yahoo_institutional_holders(symbol,holder,report_date,pct_held,shares,value) VALUES(?,?,?,?,?,?)",
        rows,
    )
    conn.commit()
    return cur.rowcount or 0


def upsert_mutual_holders(conn: sqlite3.Connection, symbol: str, recs: List[Dict[str, Any]]) -> int:
    if not recs:
        return 0
    cur = conn.cursor()
    rows = [_norm_holder_row(symbol, r) for r in recs if (r.get("Holder") or r.get("holder") or r.get("name"))]
    if not rows:
        return 0
    cur.executemany(
        "INSERT OR REPLACE INTO yahoo_mutual_holders(symbol,holder,report_date,pct_held,shares,value) VALUES(?,?,?,?,?,?)",
        rows,
    )
    conn.commit()
    return cur.rowcount or 0


def main(argv: List[str]) -> None:
    args = parse_args(argv)
    provider = args.get("provider", "yfinance").lower()
    if provider not in ("yfinance", "yahooquery"):
        provider = "yfinance"
    ensure_deps(provider)

    # Defer imports until after ensure_deps
    period = args["period"]
    interval = args["interval"]
    sym = args.get("symbol", "").strip()
    do_all = args.get("all", "false").lower() == "true" or sym in ("ALL", "*")

    if provider == "yahooquery":
        # -------------- Yahooquery Implementation --------------
        import pandas as pd  # type: ignore
        from yahooquery import Ticker  # type: ignore
        if do_all:
            suffix = os.environ.get("TICKER_YAHOO_SUFFIX") or os.environ.get("YAHOO_SUFFIX") or ".NS"
            entries = load_symbols_from_stocklist()
            if not entries:
                fail("No symbols found in stocklist.ts")
            db_path = resolve_db_path()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(db_path))
            ensure_db_schema(conn)

            symbols = [ (base + suffix) if not base.endswith(suffix) else base for base, _ in entries ]
            name_map = { (base + suffix) if not base.endswith(suffix) else base: name for base, name in entries }

            # Batch request via yahooquery (single multi-symbol Ticker improves speed)
            t = Ticker(symbols, asynchronous=False)
            # History
            hist_df = t.history(period=period, interval=interval)
            # Modules for fundamentals
            modules = [
                "price","summaryProfile","financialData","defaultKeyStatistics",
                "assetProfile","balanceSheetHistory","incomeStatementHistory","cashflowStatementHistory"
            ]
            modules_data = t.get_modules(modules)
            # Dividends & splits
            div_df = t.dividends
            spl_df = t.splits

            total_symbols = 0
            total_rows = 0
            errors: List[str] = []
            # Normalize hist_df to MultiIndex (symbol, date) case
            for symbol in symbols:
                try:
                    # Extract symbol-specific history
                    if hist_df is None or (isinstance(hist_df, pd.DataFrame) and hist_df.empty):
                        rows: List[Dict[str, Any]] = []
                    else:
                        if isinstance(hist_df.index, pd.MultiIndex):
                            try:
                                sdf = hist_df.xs(symbol)
                            except Exception:
                                sdf = pd.DataFrame()
                        else:
                            # Single symbol fallback
                            sdf = hist_df if symbol == symbols[0] else pd.DataFrame()
                        sdf = sdf.copy()
                        if not sdf.empty:
                            sdf.insert(0, "date", sdf.index.astype(str))
                        rows = df_records(sdf)
                        for r in rows:
                            if "date" in r:
                                r["date"] = str(r["date"])[:10]
                    upsert_stock(conn, symbol, name_map.get(symbol))
                    n = upsert_prices(conn, symbol, rows)
                    total_rows += n
                    # Info / fundamentals
                    info_raw = modules_data.get(symbol, {}) if isinstance(modules_data, dict) else {}
                    try:
                        upsert_yahoo_info(conn, symbol, info_raw)
                    except Exception:
                        pass
                    # Financial statements (store into normalized financials table)
                    income = info_raw.get("incomeStatementHistory", {})
                    balance = info_raw.get("balanceSheetHistory", {})
                    cash = info_raw.get("cashflowStatementHistory", {})
                    try:
                        upsert_yahoo_financials(conn, symbol, income, balance, cash)
                    except Exception:
                        pass
                    # Dividends + Splits -> yahoo_actions_rows
                    action_rows: List[Dict[str, Any]] = []
                    if isinstance(div_df, pd.DataFrame) and not div_df.empty:
                        if isinstance(div_df.index, pd.MultiIndex):
                            try:
                                ddf = div_df.xs(symbol)
                            except Exception:
                                ddf = pd.DataFrame()
                        else:
                            ddf = div_df if symbol == symbols[0] else pd.DataFrame()
                        if not ddf.empty:
                            for idx, val in ddf.iterrows():
                                action_rows.append({"date": str(idx)[:10], "Dividends": float(val.iloc[0]) if len(val) else float(val)})
                    if isinstance(spl_df, pd.DataFrame) and not spl_df.empty:
                        if isinstance(spl_df.index, pd.MultiIndex):
                            try:
                                sdf2 = spl_df.xs(symbol)
                            except Exception:
                                sdf2 = pd.DataFrame()
                        else:
                            sdf2 = spl_df if symbol == symbols[0] else pd.DataFrame()
                        if not sdf2.empty:
                            for idx, val in sdf2.iterrows():
                                action_rows.append({"date": str(idx)[:10], "Stock Splits": float(val.iloc[0]) if len(val) else float(val)})
                    try:
                        upsert_actions_rows(conn, symbol, action_rows)
                    except Exception:
                        pass
                    total_symbols += 1
                    print(json.dumps({"ok": True, "provider": "yahooquery", "symbol": symbol, "inserted": n}))
                except Exception as e:
                    err = f"{symbol}: {e}"
                    errors.append(err)
                    print(json.dumps({"ok": False, "provider": "yahooquery", "symbol": symbol, "error": str(e)}), file=sys.stderr)
            summary = {"ok": True, "mode": "all", "provider": "yahooquery", "symbols": total_symbols, "rows": total_rows, "errors": len(errors), "db": str(db_path)}
            print(json.dumps(summary, ensure_ascii=False))
            return
        else:
            # Single symbol JSON via yahooquery
            from yahooquery import Ticker  # type: ignore
            if not sym:
                fail("Usage: python yfinance_fetch.py <SYMBOL> --provider yahooquery | --all")
            t = Ticker(sym)
            import pandas as pd  # type: ignore
            hist_df = t.history(period=period, interval=interval)
            if isinstance(hist_df, pd.DataFrame) and not hist_df.empty:
                if isinstance(hist_df.index, pd.MultiIndex):
                    try:
                        hist_df = hist_df.xs(sym)
                    except Exception:
                        pass
                hist_df = hist_df.copy()
                hist_df.insert(0, "date", hist_df.index.astype(str))
            history = df_records(hist_df)
            modules = ["price","summaryProfile","financialData","defaultKeyStatistics","assetProfile"]
            info_raw = t.get_modules(modules).get(sym, {})
            out = {
                "ok": True,
                "provider": "yahooquery",
                "symbol": sym,
                "period": period,
                "interval": interval,
                "history": history,
                "info": info_raw,
                "actions": [],
                "major_holders": [],
                "financials": {
                    "income_statement": info_raw.get("incomeStatementHistory", {}),
                    "balance_sheet": info_raw.get("balanceSheetHistory", {}),
                    "cash_flow": info_raw.get("cashflowStatementHistory", {}),
                },
            }
            print(json.dumps(out, ensure_ascii=False))
            return
    # -------------- Original yfinance logic (unchanged below except moved after new branch) --------------
    import yfinance as yf  # type: ignore
    if not do_all and not sym:
        fail("Usage: python yfinance_fetch.py <SYMBOL> [--period 6mo] [--interval 1d] | --all", 2)

    if do_all:
        suffix = os.environ.get("TICKER_YAHOO_SUFFIX") or os.environ.get("YAHOO_SUFFIX") or ".NS"
        entries = load_symbols_from_stocklist()
        if not entries:
            fail("No symbols found in stocklist.ts")
        db_path = resolve_db_path()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(db_path))
        ensure_db_schema(conn)

        total_symbols = 0
        total_rows = 0
        errors: List[str] = []
        for base, name in entries:
            ysym = f"{base}{suffix}" if not base.endswith(suffix) else base
            try:
                t = yf.Ticker(ysym)
                hist = t.history(period=period, interval=interval)
                info = getattr(t, "info", {}) or {}
                actions = getattr(t, "actions", None)
                major = getattr(t, "major_holders", None)
                fin = getattr(t, "financials", None)
                bal = getattr(t, "balance_sheet", None)
                csh = getattr(t, "cashflow", None)
                inst = getattr(t, "institutional_holders", None)
                mf = getattr(t, "mutualfund_holders", None)

                rows = df_records(hist)
                for r in rows:
                    if "date" in r:
                        r["date"] = str(r["date"])[:10]
                upsert_stock(conn, ysym, name)
                n = upsert_prices(conn, ysym, rows)
                try: upsert_yahoo_info(conn, ysym, info)
                except Exception: pass
                try: upsert_actions_rows(conn, ysym, df_records(actions))
                except Exception: pass
                try: upsert_institutional_holders(conn, ysym, df_records(inst))
                except Exception: pass
                try: upsert_mutual_holders(conn, ysym, df_records(mf))
                except Exception: pass
                try:
                    mh = df_records(major)
                    upsert_yahoo_major_holders(conn, ysym, mh)
                except Exception:
                    try:
                        upsert_yahoo_major_holders(conn, ysym, df_dict(major))
                    except Exception:
                        pass
                try:
                    upsert_yahoo_financials(conn, ysym, df_dict(fin), df_dict(bal), df_dict(csh))
                except Exception:
                    pass
                total_symbols += 1
                total_rows += n
                print(json.dumps({"ok": True, "provider": "yfinance", "symbol": ysym, "inserted": n}))
            except Exception as e:
                msg = f"{ysym}: {e}"
                errors.append(msg)
                print(json.dumps({"ok": False, "provider": "yfinance", "symbol": ysym, "error": str(e)}), file=sys.stderr)
        summary = {"ok": True, "mode": "all", "provider": "yfinance", "symbols": total_symbols, "rows": total_rows, "errors": len(errors), "db": str(db_path)}
        print(json.dumps(summary, ensure_ascii=False))
        return
    else:
        try:
            t = yf.Ticker(sym)
            history = t.history(period=period, interval=interval)
            info = getattr(t, "info", {}) or {}
            actions = getattr(t, "actions", None)
            major = getattr(t, "major_holders", None)
            financials = getattr(t, "financials", None)
            balance = getattr(t, "balance_sheet", None)
            cash = getattr(t, "cashflow", None)

            out = {
                "ok": True,
                "provider": "yfinance",
                "symbol": sym,
                "period": period,
                "interval": interval,
                "history": df_records(history),
                "info": info,
                "actions": df_records(actions),
                "major_holders": df_records(major),
                "financials": {
                    "income_statement": df_dict(financials),
                    "balance_sheet": df_dict(balance),
                    "cash_flow": df_dict(cash),
                },
            }
            print(json.dumps(out, ensure_ascii=False))
        except Exception as e:
            fail(str(e))


if __name__ == "__main__":
    main(sys.argv)
