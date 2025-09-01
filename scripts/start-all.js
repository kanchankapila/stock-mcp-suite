#!/usr/bin/env node
const { spawn } = require('child_process');

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const tag = `[${name}]`;
  child.stdout.on('data', d => process.stdout.write(`${tag} ${d}`));
  child.stderr.on('data', d => process.stderr.write(`${tag} ${d}`));
  child.on('exit', (code, signal) => {
    console.log(`${tag} exited with code=${code} signal=${signal ?? ''}`);
    // If one process exits, shut down the whole group
    process.exitCode = code ?? 0;
    process.kill(process.pid, 'SIGINT');
  });
  return child;
}

const procs = [];
procs.push(run('server', 'npm', ['run', 'dev'], 'server'));
procs.push(run('frontend', 'npm', ['start'], 'frontend'));

function shutdown(signal) {
  console.log(`[root] received ${signal}, terminating children...`);
  for (const p of procs) {
    if (!p.killed) {
      try { if (process.platform === 'win32') { spawn('taskkill', ['/pid', p.pid, '/T', '/F']); } else { p.kill('SIGINT'); } } catch {}
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

