const { spawn } = require('child_process');
const net = require('net');

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitForHttp(url, attempts=60, delayMs=1000) {
  for (let i=0;i<attempts;i++) {
    try { const res = await fetch(url); if (res.ok) return true; } catch {}
    await wait(delayMs);
  }
  return false;
}
async function waitForTcp(host, port, attempts=10, delayMs=1000) {
  for (let i=0;i<attempts;i++) {
    try {
      await new Promise((resolve, reject) => {
        const s = net.connect({ host, port, timeout: 1000 }, () => { s.end(); resolve(); });
        s.on('error', reject);
        s.on('timeout', () => { s.destroy(new Error('timeout')); });
      });
      return true;
    } catch {}
    await wait(delayMs);
  }
  return false;
}

function run(cmd, args, opts={}) {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
  p.on('exit', (code) => console.log(`[proc ${cmd}] exited with ${code}`));
  return p;
}

// Optionally check Redis
(async () => {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const u = new URL(redisUrl);
    const ok = await waitForTcp(u.hostname || 'localhost', Number(u.port || 6379), 5, 1000);
    if (ok) console.log(`[dev-all] Redis reachable at ${redisUrl}`);
    else console.warn(`[dev-all] Redis not reachable at ${redisUrl}. Jobs may not run.`);
  } catch {}
})();

// Start server, frontend, and ML service
const srv = run('npm', ['--prefix', 'server', 'run', 'dev']);
const fe = run('npm', ['--prefix', 'frontend', 'start']);
// ML service requires uvicorn installed in PATH; adjust if needed
const ml = run('python', ['-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '5001', '--app-dir', 'ml-svc']);

// Health probes (non-blocking informational)
(async () => {
  const serverUrl = process.env.SERVER_BASE_URL || 'http://localhost:4010';
  const mlUrl = process.env.ML_BASE_URL || 'http://localhost:5001';
  const feUrl = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
  const sUp = await waitForHttp(`${serverUrl}/health`, 60, 1000);
  console.log(sUp ? `[dev-all] Server healthy at ${serverUrl}` : `[dev-all] Server health not confirmed at ${serverUrl}`);
  const mUp = await waitForHttp(`${mlUrl}/models`, 30, 1000);
  console.log(mUp ? `[dev-all] ML healthy at ${mlUrl}` : `[dev-all] ML health not confirmed at ${mlUrl}`);
  const fUp = await waitForHttp(`${feUrl}`, 60, 1000);
  console.log(fUp ? `[dev-all] Frontend responding at ${feUrl}` : `[dev-all] Frontend not responding at ${feUrl}`);
})();
