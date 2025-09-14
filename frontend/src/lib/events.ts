type Handler<T> = (val: T) => void;

const symbolHandlers: Handler<string>[] = [];
const pageHandlers: Handler<string>[] = [];

export function onSymbolChange(fn: Handler<string>) {
  symbolHandlers.push(fn);
}
export function emitSymbolChange(symbol: string) {
  for (const h of symbolHandlers) {
    try { h(symbol); } catch {}
  }
}

export function onPageChange(fn: Handler<string>) {
  pageHandlers.push(fn);
}
export function emitPageChange(page: string) {
  for (const h of pageHandlers) {
    try { h(page); } catch {}
  }
}

