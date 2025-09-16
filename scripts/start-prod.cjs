const { spawn, spawnSync } = require('child_process');
const path = require('path');
const net = require('net');

function runSync(cmd, args, opts={}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`[start:prod] Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(r.status || 1);
  }
}

function tryStartPythonUvicorn() {
  const candidates = [
    ['python', ['-m','uvicorn','app:app','--host','0.0.0.0','--port','5001','--app-dir','ml-svc']],
    ['py', ['-m','uvicorn','app:app','--host','0.0.0.0','--port','5001','--app-dir','ml-svc']],
    ['python3', ['-m','uvicorn','app:app','--host','0.0.0.0','--port','5001','--app-dir','ml-svc']],
  ];
  for (const [cmd, args] of candidates) {
    try {
      const p = spawn(cmd, args, { stdio:'inherit' });
      p.on('error', () => {});
      p.on('spawn', () => console.log(`[start:prod] ML service started with ${cmd}`));
      return true;
    } catch {}
  }
  console.warn('[start:prod] Could not start ML service (uvicorn). Ensure Python and uvicorn are installed and on PATH.');
  return false;
}

(async () => {
  const serverUrl = process.env.SERVER_BASE_URL || 'http://localhost:4010';
  const mlUrl = process.env.ML_BASE_URL || 'http://localhost:5001';
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  async function waitFor(url, attempts = 30, delayMs = 1000) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(url);
        if (res.ok) return true;
      } catch {}
      await new Promise(r => setTimeout(r, delayMs));
    }
    return false;
  }

  async function waitForRedis(urlStr, attempts = 10, delayMs = 1000) {
    try {
      const u = new URL(urlStr);
      const host = u.hostname || 'localhost';
      const port = Number(u.port || 6379);
      for (let i = 0; i < attempts; i++) {
        try {
          await new Promise((resolve, reject) => {
            const sock = net.connect({ host, port, timeout: 1000 }, () => {
              sock.end();
              resolve();
            });
            sock.on('error', reject);
            sock.on('timeout', () => { sock.destroy(new Error('timeout')); });
          });
          return true;
        } catch {}
        await new Promise(r => setTimeout(r, delayMs));
      }
    } catch {}
    return false;
  }

  // 1) Build server
  console.log('[start:prod] Building server...');
  runSync('npm', ['--prefix','server','run','build']);

  // 1a) Check Redis connectivity (optional)
  const redisOk = await waitForRedis(redisUrl, 10, 1000);
  if (redisOk) console.log(`[start:prod] Redis reachable at ${redisUrl}`);
  else console.warn(`[start:prod] Redis not reachable at ${redisUrl}. Jobs may not run. Set REDIS_URL or start Redis.`);

  // 2) Start server
  console.log('[start:prod] Starting server...');
  const serverProc = spawn('node', ['dist/index.js'], { cwd: path.resolve('server'), stdio: 'inherit' });
  serverProc.on('exit', (code)=> console.log(`[server] exited with ${code}`));

  // 2a) Wait for server health
  const up = await waitFor(`${serverUrl}/health`, 60, 1000);
  if (up) console.log(`[start:prod] Server is healthy at ${serverUrl}`);
  else console.warn(`[start:prod] Server health not confirmed at ${serverUrl}`);

  // 3) Start ML service (optional)
  const mlStarted = tryStartPythonUvicorn();
  if (mlStarted) {
    const ok = await waitFor(`${mlUrl}/models`, 30, 1000);
    if (ok) console.log(`[start:prod] ML service is healthy at ${mlUrl}`);
    else console.warn(`[start:prod] ML service health not confirmed at ${mlUrl}`);
  }
})();
