import { resolveTicker } from '../src/utils/ticker.js';
import { findStockEntry } from '../src/utils/ticker.js';
const q = process.argv[2] || 'BE03';
const y = resolveTicker(q, 'yahoo');
const e = findStockEntry(q);
console.log(JSON.stringify({ input:q, yahoo:y, entry:e }, null, 2));

