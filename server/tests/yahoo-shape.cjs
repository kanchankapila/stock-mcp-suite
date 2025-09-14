const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src', 'sample-data', 'AAPL_prices.json');
const json = JSON.parse(fs.readFileSync(p, 'utf8'));
const ok = json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close !== undefined;
if (!ok) { console.error('Yahoo fixture shape invalid'); process.exit(1); }
console.log('Yahoo fixture OK');

