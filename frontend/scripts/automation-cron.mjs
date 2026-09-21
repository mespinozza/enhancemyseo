/**
 * Start command for the Railway cron service.
 *
 * Plain JavaScript with no imports on purpose: a cron service that has to resolve `tsx`
 * or install anything at start time is a cron service that eventually fails to fire.
 * Run it with `node scripts/automation-cron.mjs`.
 *
 * Railway requires a cron service to exit when it is done — a process that lingers
 * causes every later execution to be skipped — so this always calls process.exit().
 *
 * Environment:
 *   AUTOMATION_TICK_URL  Base URL of the web service, e.g. https://app.up.railway.app
 *                        or the private networking URL. Required.
 *   CRON_SECRET          Must match the value on the web service. Required.
 */

const baseUrl = (process.env.AUTOMATION_TICK_URL || process.env.AUTOMATION_SELF_URL || '').replace(
  /\/$/,
  ''
);
const secret = process.env.CRON_SECRET;

function fail(message) {
  console.error(`[automation-cron] ${message}`);
  process.exit(1);
}

if (!baseUrl) fail('AUTOMATION_TICK_URL is not set');
if (!secret) fail('CRON_SECRET is not set');

// The tick returns as soon as it has claimed work, so this only needs to outlive the
// claim, not the generation it kicks off.
const TIMEOUT_MS = 60_000;

async function main() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/automation/tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': secret,
      },
      signal: controller.signal,
    });

    const body = await response.text();

    if (!response.ok) {
      fail(`tick responded ${response.status}: ${body.slice(0, 300)}`);
    }

    console.log(`[automation-cron] tick accepted: ${body.slice(0, 300)}`);
    process.exit(0);
  } catch (error) {
    const reason = error && error.name === 'AbortError' ? `no response within ${TIMEOUT_MS}ms` : error;
    fail(`could not reach the tick endpoint: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

void main();
