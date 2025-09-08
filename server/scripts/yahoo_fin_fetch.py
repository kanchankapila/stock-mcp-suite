#!/usr/bin/env python3
"""
Aggregate Yahoo Finance data for a symbol using yahoo_fin.

Outputs a single JSON object to stdout with multiple sections:
- live_price
- quote_table
- info (company info)
- stats
- stats_valuation
- holders (major + institutional)
- income_statement
- balance_sheet
- cash_flow
- earnings_history
- analysts_info
- history (recent OHLCV, default 1y daily)

Usage: python yahoo_fin_fetch.py <SYMBOL> [--period 1y] [--interval 1d]
"""

import json
import sys
import traceback

def fail(msg: str, code: int = 1):
    print(json.dumps({"ok": False, "error": msg}), flush=True)
    sys.exit(code)

def main():
    try:
        try:
            from yahoo_fin import stock_info as si
            try:
                from yahoo_fin import options as yopt
            except Exception:
                yopt = None
            try:
                from yahoo_fin import news as ynews
            except Exception:
                ynews = None
        except Exception as e:
            fail("yahoo_fin module not installed. Run: pip install yahoo_fin requests_html", 2)

        if len(sys.argv) < 2:
            fail("symbol required", 2)
        symbol = sys.argv[1].strip()
        # Defaults
        period = '1y'
        interval = '1d'
        # Simple parse
        if '--period' in sys.argv:
            try:
                period = sys.argv[sys.argv.index('--period') + 1]
            except Exception:
                pass
        if '--interval' in sys.argv:
            try:
                interval = sys.argv[sys.argv.index('--interval') + 1]
            except Exception:
                pass

        out = {"ok": True, "symbol": symbol, "period": period, "interval": interval}
        # Collect sections (best effort; ignore individual failures)
        def safe(name, fn):
            try:
                out[name] = fn()
            except Exception:
                out[name] = None

        safe('live_price', lambda: float(si.get_live_price(symbol)))
        safe('quote_table', lambda: si.get_quote_table(symbol, dict_result=True))
        safe('info', lambda: si.get_company_info(symbol).to_dict())
        safe('stats', lambda: si.get_stats(symbol).to_dict('records'))
        safe('stats_valuation', lambda: si.get_stats_valuation(symbol).to_dict('records'))
        safe('market_status', lambda: getattr(si, 'get_market_status')())
        safe('holders', lambda: {
            'major_holders': si.get_holders(symbol).get('major_holders', None) if isinstance(si.get_holders(symbol), dict) else None,
            'institutional_holders': si.get_holders(symbol).get('institutional_holders', None) if isinstance(si.get_holders(symbol), dict) else None,
        })
        safe('income_statement', lambda: si.get_income_statement(symbol).to_dict())
        safe('balance_sheet', lambda: si.get_balance_sheet(symbol).to_dict())
        safe('cash_flow', lambda: si.get_cash_flow(symbol).to_dict())
        safe('earnings_history', lambda: si.get_earnings_history(symbol))
        safe('analysts_info', lambda: si.get_analysts_info(symbol))
        # News via yahoo_fin.news if available
        if 'ynews' in locals() and ynews is not None:
            safe('news', lambda: ynews.get_yf_rss(symbol))
        else:
            out['news'] = None
        # Historical
        safe('history', lambda: si.get_data(symbol, start_date=None, end_date=None, index_as_date=True, interval=interval, period=period).reset_index().to_dict(orient='records'))
        # Options (nearest expiration)
        if 'yopt' in locals() and yopt is not None:
            def get_options():
                exps = yopt.get_expiration_dates(symbol)
                if not exps: return None
                # choose nearest upcoming expiration (list is usually sorted)
                exp = exps[0]
                calls = yopt.get_calls(symbol, exp)
                puts = yopt.get_puts(symbol, exp)
                return { 'expirations': exps, 'selected': exp, 'calls': calls.to_dict('records') if hasattr(calls, 'to_dict') else calls, 'puts': puts.to_dict('records') if hasattr(puts, 'to_dict') else puts }
            safe('options', get_options)
        else:
            out['options'] = None

        print(json.dumps(out, default=str), flush=True)
    except SystemExit:
        raise
    except Exception:
        fail("python_error: " + traceback.format_exc(), 1)

if __name__ == '__main__':
    main()
