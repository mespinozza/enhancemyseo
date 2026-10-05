/**
 * Checks that automation calls are exempt from /api/generate-article's per-IP limit and
 * that browsers are not. Every request here is unauthenticated, so the route rejects
 * each one before generating anything and no AI credits are spent.
 *
 *   npm run verify:automation-rate-limit            (against http://localhost:3001)
 *   BASE_URL=https://www.enhancemyseo.com npm run verify:automation-rate-limit
 */
process.loadEnvFile('.env');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const IP_MAX_PER_WINDOW = 10;

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function post(ip: string, extra: Record<string, string> = {}) {
  const response = await fetch(`${BASE_URL}/api/generate-article`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...extra },
    body: '{}',
  });
  const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
  return { status: response.status, code: payload.code, error: payload.error };
}

async function main() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET must be set in .env');

  // A documentation-range address unique to this run, so earlier runs do not interfere.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;
  console.log(`Using ${BASE_URL} as ${ip}\n`);

  const early = [];
  for (let i = 0; i < IP_MAX_PER_WINDOW; i += 1) early.push(await post(ip));
  check(
    `first ${IP_MAX_PER_WINDOW} requests pass the IP limit`,
    early.every((r) => r.status === 401),
    early.map((r) => r.status).join(',')
  );

  const blocked = await post(ip);
  check('the next browser request is IP limited', blocked.status === 429, `${blocked.status}`);
  check('and is labelled ip_rate_limit', blocked.code === 'ip_rate_limit', `${blocked.code}`);

  const automation = await post(ip, { 'X-Automation-Key': secret });
  check(
    'an automation call from the same IP gets past the limit (stopped by auth instead)',
    automation.status === 401,
    `${automation.status} ${automation.error ?? ''}`
  );

  const forged = await post(ip, { 'X-Automation-Key': `${secret}x` });
  check('a wrong automation key is still IP limited', forged.status === 429, `${forged.status}`);

  const unauthenticated = await post(ip, { 'X-Automation-Key': secret });
  check(
    'the key alone cannot generate anything without the owner\'s ID token',
    unauthenticated.status === 401,
    `${unauthenticated.status}`
  );

  console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
