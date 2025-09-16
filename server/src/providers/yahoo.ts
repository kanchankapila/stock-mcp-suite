// Yahoo provider removed; provide stubs so prefetch compiles and falls back to Stooq

export async function fetchYahooQuotesBatch(_symbols: string[]): Promise<Array<{ symbol:string; time:number; price:number }>> {
  throw new Error('yahoo_provider_disabled');
}

export async function fetchYahooDaily(_symbol: string, _range: string, _interval: string): Promise<any> {
  throw new Error('yahoo_provider_disabled');
}

export function parseYahooDaily(_symbol: string, _chart: any): Array<{ symbol:string; date:string; open:number; high:number; low:number; close:number; volume:number }> {
  throw new Error('yahoo_provider_disabled');
}


