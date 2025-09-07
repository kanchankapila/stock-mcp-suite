import { logger } from '../utils/logger.js';
import { setExternalTrendlyneCookie } from './trendlyne.js';

// Be permissive with types to support either puppeteer or puppeteer-core without TS conflicts
async function loadPuppeteer(): Promise<any | null> {
  try {
    const mod: any = await import('puppeteer');
    return (mod?.default ?? mod) as any;
  } catch {
    try {
      const core: any = await import('puppeteer-core');
      return (core?.default ?? core) as any;
    } catch {
      return null;
    }
  }
}

export async function refreshTrendlyneCookieHeadless() {
  const TRENDLYNE_EMAIL = process.env.TRENDLYNE_EMAIL || '';
  const TRENDLYNE_PASSWORD = process.env.TRENDLYNE_PASSWORD || '';
  if (!TRENDLYNE_EMAIL || !TRENDLYNE_PASSWORD) {
    throw new Error('TRENDLYNE_EMAIL and TRENDLYNE_PASSWORD are required');
  }
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) throw new Error('puppeteer/puppeteer-core not installed');

  const start = Date.now();
  let browser: any = null;
  try {
    const executablePath = process.env.CHROME_EXECUTABLE_PATH;
    logger.info({ executablePath }, 'trendlyne_headless_launch');
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      args: [
        '--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage',
      ]
    } as any);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setCacheEnabled(true);
    // Prefer the full login page; modal can be flaky for automation
    const targetUrl = "https://trendlyne.com/visitor/login/";
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    // Try multiple selector variants for robustness
    const userSelectors = ['#id_login', 'input[name="login"]', 'input[name="username"]'];
    const passSelectors = ['#id_password', 'input[name="password"]'];
    let typed = false;
    for (const us of userSelectors) {
      const u = await page.$(us);
      if (u) {
        await page.focus(us);
        await page.keyboard.type(TRENDLYNE_EMAIL, { delay: 10 });
        typed = true;
        break;
      }
    }
    for (const ps of passSelectors) {
      const p = await page.$(ps);
      if (p) {
        await page.focus(ps);
        await page.keyboard.type(TRENDLYNE_PASSWORD, { delay: 10 });
        typed = true;
        break;
      }
    }
    if (typed) {
      // Try clicking submit button first, else press Enter
      const submitBtn = await page.$('button[type="submit"],input[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForNetworkIdle?.({ idleTime: 800, timeout: 5000 }).catch(()=>page.waitForTimeout(1500));
      } else {
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      }
    } else {
      // As a fallback, try the modal URL and wait for inputs explicitly
      try {
        await page.goto('https://trendlyne.com/visitor/loginmodal/', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#id_login', { timeout: 4000 });
        await page.type('#id_login', TRENDLYNE_EMAIL, { delay: 10 });
        await page.waitForSelector('#id_password', { timeout: 4000 });
        await page.type('#id_password', TRENDLYNE_PASSWORD, { delay: 10 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(1500);
      } catch {
        // Attempt inside iframes (some deployments show login inside iframe)
        const frames = page.frames();
        for (const fr of frames) {
          try {
            const iu = await fr.$('#id_login');
            const ip = await fr.$('#id_password');
            if (iu && ip) {
              await fr.focus('#id_login'); await fr.type('#id_login', TRENDLYNE_EMAIL, { delay: 10 });
              await fr.focus('#id_password'); await fr.type('#id_password', TRENDLYNE_PASSWORD, { delay: 10 });
              await fr.keyboard.press('Enter');
              await page.waitForTimeout(1500);
              break;
            }
          } catch {}
        }
      }
    }

    const cookies = await page.cookies();
    // Accept any cookies for trendlyne.com domain; construct header from all unique pairs
    const parts: string[] = [];
    let foundAny = false;
    for (const c of cookies) {
      if (!c || !c.name) continue;
      if (!c.value) continue;
      // Restrict to trendlyne cookies or common auth names
      if ((c.domain && /trendlyne\.com$/i.test(c.domain)) || /^(csrftoken|sessionid|trendlyne|\.trendlyne)$/i.test(c.name)) {
        parts.push(`${c.name}=${c.value}`);
        foundAny = true;
      }
    }
    if (!foundAny) {
      logger.warn({ cookies: cookies.map(c=>c.name) }, 'trendlyne_no_cookies_found');
      throw new Error('trendlyne cookie not found');
    }
    const cookieHeader = parts.join('; ');
    setExternalTrendlyneCookie(cookieHeader);
    const ms = Date.now() - start;
    const hasCsrf = cookies.some(c => /^csrftoken$/i.test(c.name));
    logger.info({ ms }, 'trendlyne_cookie_refreshed');
    return { ok: true, ms, hasCsrf };
  } catch (err) {
    logger.error({ err }, 'trendlyne_headless_failed');
    throw err;
  } finally {
    try { await browser?.close(); } catch {}
  }
}

// Auto-refresh scheduler with simple backoff
let REFRESH_TIMER: any = null;

export function startTrendlyneCookieAutoRefresh() {
  const enable = String(process.env.TL_COOKIE_REFRESH_ENABLE || 'true') === 'true';
  if (!enable) return;

  const hours = Number(process.env.TL_COOKIE_REFRESH_INTERVAL_HOURS || 11);
  const INTERVAL_MS = Math.max(1, hours) * 60 * 60 * 1000;
  let backoffMs = Number(process.env.TL_COOKIE_REFRESH_BACKOFF_MS || 60_000); // 1 min
  const MAX_BACKOFF_MS = Number(process.env.TL_COOKIE_REFRESH_BACKOFF_MAX_MS || 6 * 60 * 60 * 1000); // 6h

  async function runOnce() {
    try {
      await refreshTrendlyneCookieHeadless();
      backoffMs = Number(process.env.TL_COOKIE_REFRESH_BACKOFF_MS || 60_000); // reset backoff on success
      schedule(INTERVAL_MS);
    } catch (err) {
      const next = Math.min(MAX_BACKOFF_MS, backoffMs);
      logger.warn({ err, next }, 'trendlyne_cookie_refresh_failed_backing_off');
      backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(60_000, backoffMs * 2));
      schedule(next);
    }
  }

  function schedule(ms: number) {
    if (REFRESH_TIMER) clearTimeout(REFRESH_TIMER);
    REFRESH_TIMER = setTimeout(runOnce, ms);
  }

  // Kickstart only if credentials are present or a cookie provider exists
  if ((process.env.TRENDLYNE_EMAIL && process.env.TRENDLYNE_PASSWORD) || process.env.TL_COOKIE_URLS || process.env.TL_COOKIE) {
    // If TL_COOKIE is already set and you want to skip headless, still schedule to keep cookie fresh via providers
    schedule(5_000); // first attempt after 5s
  } else {
    logger.warn('trendlyne_auto_refresh_disabled_missing_creds');
  }
}
