/**
 * In-process scheduler for automations.
 *
 * The original design put the schedule in a separate Railway cron service that called
 * `/api/automation/tick` over the network. That service has three ways to be silently
 * wrong — a missing tick URL, a `CRON_SECRET` that does not match the web service, or a
 * schedule that was never set — and all three fail invisibly, because an automation that
 * is never claimed writes no run record. It never fired once.
 *
 * The web service is already running all day, so it can keep its own time. Nothing to
 * configure, no shared secret, no second deployment to keep in step. `/api/automation/tick`
 * still exists for manual triggering.
 *
 * Running more than one container is safe: claiming an automation is a Firestore
 * transaction that advances `nextRunAt` as it takes the job, so a second ticker finds
 * nothing due.
 */
import { processDueAutomations } from './runner';

/** Schedules are hour-granular, so five minutes is plenty of resolution. */
const INTERVAL_MS = 5 * 60_000;

/** Let the server finish booting before the first sweep. */
const FIRST_SWEEP_DELAY_MS = 30_000;

let started = false;
let sweeping = false;

async function sweep(): Promise<void> {
  // A generation run can outlast the interval; skip rather than pile up.
  if (sweeping) return;
  sweeping = true;

  try {
    const summary = await processDueAutomations();
    if (summary.claimed > 0 || summary.reaped > 0) {
      console.log('[automation] swept', {
        claimed: summary.claimed,
        reaped: summary.reaped,
        outcomes: summary.outcomes.map((outcome) => `${outcome.status}:${outcome.keyword}`),
      });
    }
  } catch (error) {
    console.error('[automation] sweep failed', error);
  } finally {
    sweeping = false;
  }
}

export function startAutomationScheduler(): void {
  if (started) return;
  started = true;

  console.log(`[automation] scheduler on, sweeping every ${INTERVAL_MS / 60_000} minutes`);

  setTimeout(() => {
    void sweep();
    setInterval(() => void sweep(), INTERVAL_MS).unref();
  }, FIRST_SWEEP_DELAY_MS).unref();
}
