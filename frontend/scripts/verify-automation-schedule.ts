/**
 * Gate test for automation scheduling and topic selection.
 *
 * Bugs in either are expensive and quiet. A wrong "next run" either silently stops
 * generating articles or fires repeatedly and spends Claude and Perplexity credits, and a
 * wrong topic choice writes the same article over and over. The cases below pin the
 * boundaries that are easy to get wrong: an exact hit on the run hour, week and month and
 * year rollovers, the guarantee that rescheduling always moves forward so a claim cannot
 * loop, list rotation wrapping, and de-duplication against articles already written.
 *
 * Run with: npm run verify:automation-schedule
 */
import {
  computeNextRun,
  isValidSchedule,
  monthKey,
  formatHour,
  localHourToUtc,
  utcHourToLocal,
} from '../src/lib/automation/schedule';
import { rankGscCandidates, rotateTopics, type QueryRow } from '../src/lib/automation/selection';
import type { AutomationGscConfig, AutomationSchedule } from '../src/lib/automation/types';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function daily(hourUtc: number): AutomationSchedule {
  return { frequency: 'daily', hourUtc, daysOfWeek: [] };
}

function weekly(hourUtc: number, daysOfWeek: number[]): AutomationSchedule {
  return { frequency: 'weekly', hourUtc, daysOfWeek };
}

function expectNext(label: string, schedule: AutomationSchedule, from: string, expected: string) {
  const actual = computeNextRun(schedule, new Date(from)).toISOString();
  check(label, actual === expected, `expected ${expected}, got ${actual}`);
}

console.log('\nDaily schedules');
expectNext('before the hour, fires today', daily(9), '2026-06-25T08:00:00.000Z', '2026-06-25T09:00:00.000Z');
expectNext('after the hour, waits for tomorrow', daily(9), '2026-06-25T10:00:00.000Z', '2026-06-26T09:00:00.000Z');
expectNext(
  'exactly on the hour moves to tomorrow, never repeats the slot just run',
  daily(9),
  '2026-06-25T09:00:00.000Z',
  '2026-06-26T09:00:00.000Z'
);
expectNext('one second past the hour still waits', daily(9), '2026-06-25T09:00:01.000Z', '2026-06-26T09:00:00.000Z');
expectNext('midnight hour', daily(0), '2026-06-25T00:30:00.000Z', '2026-06-26T00:00:00.000Z');
expectNext('hour 23', daily(23), '2026-06-25T00:30:00.000Z', '2026-06-25T23:00:00.000Z');

console.log('\nRollovers');
expectNext('month boundary', daily(0), '2026-06-30T23:30:00.000Z', '2026-07-01T00:00:00.000Z');
expectNext('year boundary', daily(0), '2026-12-31T23:30:00.000Z', '2027-01-01T00:00:00.000Z');
expectNext('leap day', daily(12), '2028-02-28T13:00:00.000Z', '2028-02-29T12:00:00.000Z');

console.log('\nWeekly schedules');
// 2026-06-25 is a Thursday.
expectNext('Mondays only, from a Thursday', weekly(6, [1]), '2026-06-25T08:00:00.000Z', '2026-06-29T06:00:00.000Z');
expectNext(
  'weekend only, from a Friday',
  weekly(7, [0, 6]),
  '2026-06-26T09:00:00.000Z',
  '2026-06-27T07:00:00.000Z'
);
expectNext(
  'today is an allowed day and the hour has not passed',
  weekly(18, [4]),
  '2026-06-25T08:00:00.000Z',
  '2026-06-25T18:00:00.000Z'
);
expectNext(
  'today is an allowed day but the hour has passed, so next week',
  weekly(6, [4]),
  '2026-06-25T08:00:00.000Z',
  '2026-07-02T06:00:00.000Z'
);
expectNext(
  'unsorted day list is handled',
  weekly(5, [3, 1]),
  '2026-06-25T08:00:00.000Z',
  '2026-06-29T05:00:00.000Z'
);

console.log('\nForward progress');
{
  // Rescheduling from the moment of a run must always move forward. If it ever returned
  // the same instant, claiming would re-fire the automation on the next tick forever.
  const schedules = [daily(0), daily(9), daily(23), weekly(6, [1]), weekly(12, [0, 3, 6])];
  let monotonic = true;
  let alignedToHour = true;

  for (const schedule of schedules) {
    let cursor = new Date('2026-06-25T09:00:00.000Z');
    for (let step = 0; step < 40; step += 1) {
      const next = computeNextRun(schedule, cursor);
      if (next.getTime() <= cursor.getTime()) monotonic = false;
      if (next.getUTCHours() !== schedule.hourUtc) alignedToHour = false;
      if (next.getUTCMinutes() !== 0 || next.getUTCSeconds() !== 0) alignedToHour = false;
      cursor = next;
    }
  }

  check('every reschedule advances strictly', monotonic);
  check('every run lands exactly on the configured UTC hour', alignedToHour);
}

console.log('\nValidation');
check('daily schedule is valid', isValidSchedule(daily(9)));
check('weekly with days is valid', isValidSchedule(weekly(9, [1, 5])));
check('weekly with no days is invalid', !isValidSchedule(weekly(9, [])));
check('hour 24 is invalid', !isValidSchedule(daily(24)));
check('negative hour is invalid', !isValidSchedule(daily(-1)));
check('fractional hour is invalid', !isValidSchedule({ ...daily(9), hourUtc: 9.5 }));
check('weekday 7 is invalid', !isValidSchedule(weekly(9, [7])));

{
  let threw = false;
  try {
    computeNextRun(weekly(9, []));
  } catch {
    threw = true;
  }
  check('computing a next run for an invalid schedule throws', threw);
}

console.log('\nHelpers');
check('month key format', monthKey(new Date('2026-06-25T00:00:00.000Z')) === '2026-06');
check('month key pads single digits', monthKey(new Date('2026-01-05T00:00:00.000Z')) === '2026-01');
check('midnight formats as 12 AM', formatHour(0) === '12:00 AM');
check('noon formats as 12 PM', formatHour(12) === '12:00 PM');
check('hour 13 formats as 1 PM', formatHour(13) === '1:00 PM');
check('hour 23 formats as 11 PM', formatHour(23) === '11:00 PM');

{
  // Machine-timezone independent: converting local to UTC and back is a round trip.
  let roundTrips = true;
  for (let hour = 0; hour < 24; hour += 1) {
    if (utcHourToLocal(localHourToUtc(hour)) !== hour) roundTrips = false;
  }
  check('local and UTC hour conversion round-trips for all 24 hours', roundTrips);
}

console.log('\nTopic list rotation');
{
  const topics = ['alpha', 'beta', 'gamma'];

  const first = rotateTopics(topics, 0, 1);
  check('starts at the cursor', first[0]?.keyword === 'alpha');
  check('reports the next cursor', first[0]?.nextCursor === 1);
  check('explains the choice', first[0]?.reason === 'Topic 1 of 3 in the list');

  const fromLast = rotateTopics(topics, 2, 1);
  check('reads the last topic', fromLast[0]?.keyword === 'gamma');
  check('wraps the cursor back to zero', fromLast[0]?.nextCursor === 0);

  const three = rotateTopics(topics, 1, 3);
  check(
    'a multi-article run walks forward',
    three.map((choice) => choice.keyword).join(',') === 'beta,gamma,alpha'
  );
  check('the last choice carries the resume point', three[2]?.nextCursor === 1);

  const shortList = rotateTopics(['only'], 0, 3);
  check('asking for more than the list holds repeats it', shortList.length === 3);
  check('repeats stay on the single topic', shortList.every((choice) => choice.keyword === 'only'));

  check('blank lines are dropped', rotateTopics(['  ', 'real', ''], 0, 1)[0]?.keyword === 'real');
  check('an empty list yields nothing', rotateTopics([], 0, 2).length === 0);
  check('a cursor past the end is safe', rotateTopics(topics, 99, 1)[0]?.keyword === 'alpha');
  check('a negative cursor is safe', rotateTopics(topics, -1, 1).length === 1);
  check('asking for zero yields nothing', rotateTopics(topics, 0, 0).length === 0);
}

console.log('\nSearch Console ranking');
{
  const config: AutomationGscConfig = {
    siteUrl: 'sc-domain:example.com',
    metric: 'clicks',
    lookbackDays: 30,
    minMetric: 10,
  };

  const rows: QueryRow[] = [
    { query: 'walk in cooler not cooling', clicks: 412, impressions: 9000, position: 8.4 },
    { query: 'freezer door gasket', clicks: 95, impressions: 4200, position: 12.1 },
    { query: 'barely searched thing', clicks: 3, impressions: 90, position: 40.2 },
    { query: 'compressor short cycling', clicks: 60, impressions: 15000, position: 22.7 },
  ];

  const top = rankGscCandidates(rows, config, new Set(), 2);
  check('ranks by the chosen metric', top[0]?.keyword === 'walk in cooler not cooling');
  check('respects the requested count', top.length === 2);
  check('second place is correct', top[1]?.keyword === 'freezer door gasket');
  check(
    'the reason cites the real number',
    top[0]?.reason.includes('412 clicks') && top[0]?.reason.includes('average position 8.4')
  );

  const filtered = rankGscCandidates(rows, config, new Set(), 10);
  check('drops queries below the threshold', !filtered.some((c) => c.keyword === 'barely searched thing'));

  const deduped = rankGscCandidates(rows, config, new Set(['walk in cooler not cooling']), 10);
  check('skips a query that already has an article', deduped[0]?.keyword === 'freezer door gasket');

  const caseInsensitive = rankGscCandidates(rows, config, new Set(['WALK IN COOLER NOT COOLING'.toLowerCase()]), 1);
  check('de-duplication ignores case', caseInsensitive[0]?.keyword === 'freezer door gasket');

  const byImpressions = rankGscCandidates(rows, { ...config, metric: 'impressions', minMetric: 100 }, new Set(), 1);
  check(
    'switching the metric changes the winner',
    byImpressions[0]?.keyword === 'compressor short cycling'
  );

  const allCovered = rankGscCandidates(
    rows,
    config,
    new Set(rows.map((row) => row.query.toLowerCase())),
    5
  );
  check('everything covered yields nothing to write', allCovered.length === 0);

  check('no rows yields nothing', rankGscCandidates([], config, new Set(), 3).length === 0);
  check(
    'a blank query is ignored',
    rankGscCandidates([{ query: '   ', clicks: 500, impressions: 1, position: 1 }], config, new Set(), 3)
      .length === 0
  );
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
