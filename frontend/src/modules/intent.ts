// Intent parsing module
// Provides lightweight NLP-less rule-based intent classification for agent queries.
// Future extension: plug in embedding similarity or LLM classification.

export interface ParsedIntent {
  raw: string;
  intent: string; // e.g., analyze, ingest, backtest, resolve, dbstats, index_urls, index_text, why_move, volatility, correlation, help
  symbol?: string;
  symbolB?: string; // secondary symbol for correlation
  days?: number;
  urls?: string[];
  text?: string;
  error?: string;
  meta: { tokens: string[] };
}

const INTENT_ALIASES: Record<string,string> = {
  'ingest': 'ingest', 'fetch': 'ingest', 'load': 'ingest',
  'analyze': 'analyze', 'analyse': 'analyze', 'analysis': 'analyze',
  'backtest': 'backtest', 'bt': 'backtest',
  'resolve': 'resolve', 'res': 'resolve',
  'db': 'dbstats', 'dbstats': 'dbstats', 'db-stat': 'dbstats',
  'why': 'why_move', 'move': 'why_move',
  'index': 'index_urls', 'rag': 'index_urls',
  'vol': 'volatility', 'volatility': 'volatility',
  'corr': 'correlation', 'correlation': 'correlation'
};

const HELP_INTENTS = ['help','?','commands'];

export function parseIntent(rawInput: string): ParsedIntent {
  const raw = (rawInput||'').trim();
  if (!raw) return { raw, intent: 'none', error: 'Empty query', meta: { tokens: [] } };
  const tokens = raw.split(/\s+/g);
  // Normalize tokens and map aliases
  const norm = tokens.map(t=> t.toLowerCase());
  if (norm.some(t=> HELP_INTENTS.includes(t))) {
    return { raw, intent: 'help', meta:{ tokens: norm } };
  }
  // Extract URLs
  const urls = tokens.filter(t=> /^https?:\/\//i.test(t));
  // Extract numbers (potential days lookback)
  const nums = tokens.map(t=> /^\d+$/.test(t)? Number(t) : null).filter((n): n is number => n!==null);
  let days = nums.find(n=> n>0 && n<1000);

  // Basic symbol heuristics: uppercase token length 1-10, letters only
  const symCandidates = tokens.filter(t=> /^[A-Za-z]{1,10}$/.test(t));
  let symbol: string | undefined = symCandidates.find(s=> s === s.toUpperCase());
  // Look for patterns SYMBOL:SYMBOLB for correlation
  let symbolB: string | undefined;
  const corrPair = raw.match(/([A-Z]{1,10})[:\/-]([A-Z]{1,10})/);
  if (corrPair) { symbol = corrPair[1]; symbolB = corrPair[2]; }

  // Intent keyword detection priority order
  let intent = 'analyze';
  for (const t of norm) {
    if (INTENT_ALIASES[t]) { intent = INTENT_ALIASES[t]; break; }
  }
  // Disambiguate index text vs urls
  if (intent === 'index_urls' && urls.length === 0 && raw.toLowerCase().includes('text:')) {
    intent = 'index_text';
  }
  if (intent === 'correlation' && !symbolB) {
    // Try to find second symbol after 'vs'
    const vsIdx = norm.indexOf('vs');
    if (vsIdx>=0 && tokens[vsIdx+1]) {
      const cand = tokens[vsIdx+1].toUpperCase();
      if (/^[A-Z]{1,10}$/.test(cand)) symbolB = cand;
    }
  }

  return { raw, intent, symbol, symbolB, days, urls, meta:{ tokens: norm } };
}

export function intentHelp(): string {
  return `Intents:
  ingest <SYMBOL> [days]
  analyze <SYMBOL>
  backtest <SYMBOL> [days]
  resolve <SYMBOL>
  dbstats <SYMBOL>
  why <SYMBOL> [days]   -> price movement explanation
  vol <SYMBOL> [days]   -> historical volatility
  corr <SYMBOL> vs <SYMBOL2> [days] -> correlation
  index <SYMBOL> <url1> <url2> ...  -> index URLs to RAG
  index text: <SYMBOL> <paste text> -> index raw text
  help -> this list`;
}
