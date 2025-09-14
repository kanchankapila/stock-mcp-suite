const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '..', 'src', 'sample-data', 'AAPL_news.json');
const json = JSON.parse(fs.readFileSync(p, 'utf8'));
const ok = Array.isArray(json.articles) && json.articles.length > 0 && json.articles[0].title !== undefined;
if (!ok) { console.error('News fixture shape invalid'); process.exit(1); }
console.log('News fixture OK');

