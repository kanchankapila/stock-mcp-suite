type Handler<T> = (val: T) => void;

// Legacy specific channels
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

// Generic event bus
export type EventHandler = (payload?: any) => void;
const bus: Record<string, Set<EventHandler>> = {};
export function on(event: string, handler: EventHandler) {
  if (!bus[event]) bus[event] = new Set();
  bus[event].add(handler);
  return () => off(event, handler);
}
export function once(event: string, handler: EventHandler) {
  const offFn = on(event, (p) => { try { handler(p); } finally { offFn(); } });
  return offFn;
}
export function off(event: string, handler: EventHandler) {
  bus[event]?.delete(handler);
}
export function emit(event: string, payload?: any) {
  const set = bus[event];
  if (!set) return;
  for (const h of Array.from(set)) {
    try { h(payload); } catch {}
  }
}

