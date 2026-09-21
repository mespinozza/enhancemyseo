/**
 * Schedule math for automations. Pure functions with no Firebase or DOM dependency so
 * they can run on the client, in a route, and under the verification script.
 *
 * All scheduling is computed in UTC. Railway evaluates cron expressions in UTC, and
 * storing a UTC hour keeps the trigger and the stored schedule in the same frame of
 * reference. The consequence is that an automation set for 9am local drifts by an hour
 * across a daylight-saving boundary, which is why the UI states the UTC hour it saved.
 */
import type { AutomationSchedule } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isValidSchedule(schedule: AutomationSchedule): boolean {
  if (!Number.isInteger(schedule.hourUtc) || schedule.hourUtc < 0 || schedule.hourUtc > 23) {
    return false;
  }
  if (schedule.frequency === 'weekly') {
    return (
      schedule.daysOfWeek.length > 0 &&
      schedule.daysOfWeek.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    );
  }
  return true;
}

function isAllowedDay(candidate: Date, schedule: AutomationSchedule): boolean {
  if (schedule.frequency === 'daily') return true;
  return schedule.daysOfWeek.includes(candidate.getUTCDay());
}

/**
 * The next firing time strictly after `from`. Strictly, so that rescheduling immediately
 * after a run cannot land on the run that just happened and cause a hot loop.
 */
export function computeNextRun(schedule: AutomationSchedule, from: Date = new Date()): Date {
  if (!isValidSchedule(schedule)) {
    throw new Error('Cannot compute a next run time for an invalid schedule');
  }

  const candidate = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), schedule.hourUtc, 0, 0, 0)
  );

  // A week of daily steps is always enough to reach an allowed weekday.
  for (let step = 0; step <= 8; step += 1) {
    if (candidate.getTime() > from.getTime() && isAllowedDay(candidate, schedule)) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + DAY_MS);
  }

  throw new Error('Failed to find a next run time within eight days');
}

/** 'YYYY-MM' in UTC, matching the key format used by the usage collection. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The UTC hour that corresponds to `localHour` today in the browser's zone. */
export function localHourToUtc(localHour: number, reference: Date = new Date()): number {
  const local = new Date(reference);
  local.setHours(localHour, 0, 0, 0);
  return local.getUTCHours();
}

/** The local hour a stored UTC hour lands on today, for display. */
export function utcHourToLocal(hourUtc: number, reference: Date = new Date()): number {
  const utc = new Date(
    Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate(), hourUtc, 0, 0, 0)
  );
  return utc.getHours();
}

export function formatHour(hour: number): string {
  const normalised = ((hour % 24) + 24) % 24;
  const suffix = normalised < 12 ? 'AM' : 'PM';
  const display = normalised % 12 === 0 ? 12 : normalised % 12;
  return `${display}:00 ${suffix}`;
}

/** A sentence for the automation card, in the reader's local time. */
export function describeSchedule(schedule: AutomationSchedule): string {
  const localHour = utcHourToLocal(schedule.hourUtc);
  const time = formatHour(localHour);

  if (schedule.frequency === 'daily') {
    return `Every day around ${time}`;
  }

  if (schedule.daysOfWeek.length === 0) {
    return 'Weekly, but no days are selected yet';
  }

  const days = [...schedule.daysOfWeek]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_NAMES[day])
    .join(', ');

  return `${days} around ${time}`;
}

export { WEEKDAY_NAMES };
