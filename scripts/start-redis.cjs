const { spawn } = require('child_process');

function tryStart(cmd, args=[]) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', () => resolve(false));
    p.on('spawn', () => resolve(true));
  });
}

(async () => {
  const candidates = [
    ['redis-server', []],
    ['redis-server.exe', []]
  ];
  for (const [cmd, args] of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await tryStart(cmd, args);
    if (ok) { console.log(`[redis] started with ${cmd}`); return; }
  }
  console.log('[redis] Could not auto-start redis-server. Please start Redis manually.');
})();

