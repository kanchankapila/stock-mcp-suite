import { spawn } from 'child_process';
import path from 'path';

export async function fetchYahooFin(symbol: string, period = '1y', interval = '1d'): Promise<any> {
  const script = path.resolve(process.cwd(), 'server', 'scripts', 'yahoo_fin_fetch.py');
  const candidates = ['python', 'python3', 'py'];
  const args = [script, symbol, '--period', period, '--interval', interval];
  function run(bin: string) {
    return new Promise<{ code: number, stdout: string, stderr: string }>((resolve) => {
      const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => { stdout += String(d); });
      child.stderr.on('data', d => { stderr += String(d); });
      child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });
  }
  let last: any = null;
  for (const bin of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const r = await run(bin);
    if (r && r.stdout) {
      try { const j = JSON.parse(r.stdout); return j; } catch (e) { last = { bin, err: String(e) }; continue; }
    }
    last = { bin, code: r.code, stderr: r.stderr };
  }
  const err = new Error('yahoo_fin_unavailable');
  (err as any).detail = last;
  throw err;
}

