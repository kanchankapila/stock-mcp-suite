const cp = require('child_process');

function run(file) {
  try {
    cp.execFileSync(process.execPath, [file], { stdio: 'inherit' });
    return true;
  } catch { return false; }
}

let ok = true;
ok = run('tests/yahoo-shape.cjs') && ok;
ok = run('tests/news-shape.cjs') && ok;
process.exit(ok ? 0 : 1);

