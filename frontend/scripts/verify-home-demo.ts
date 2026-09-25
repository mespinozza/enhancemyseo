/**
 * Gate test for the home page product demo.
 *
 * The demo makes claims about the product to every visitor, and it loops forever in
 * front of them, so the failures worth guarding are the quiet ones: a step aimed at a
 * card that no longer exists, a bullet id that silently never ticks, a script left out
 * of order so later events never fire, or a story that runs past the end of its loop and
 * resets mid-sentence. None of those throw — they just make the page subtly wrong.
 *
 * Every assertion here is on pure functions, so the whole timeline is checked without a
 * browser, a frame, or a clock.
 *
 * Run with: npm run verify:home-demo
 */
import {
  cardStatesAt,
  DEMO_CARDS,
  DEMO_SCRIPT,
  LOOP_MS,
  REST_FRAME,
  restStates,
  typeOut,
} from '../src/lib/home/demo';
import {
  CHART_HEIGHT,
  CHART_SERIES,
  CHART_WIDTH,
  chartLength,
  chartPoints,
  chartValueAt,
  FLASH_MS,
  HERO_LOOP_MS,
  heroRestState,
  heroStateAt,
  pointAtProgress,
  PROBLEMS,
  SOLUTIONS,
} from '../src/lib/home/hero';
import {
  maskSurname,
  REVIEW_MS,
  REVIEWS,
  reviewIndexAt,
  reviewProgressAt,
  starFills,
} from '../src/lib/home/reviews';

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

console.log('\nScript integrity');
{
  const ids = new Set(DEMO_CARDS.map((card) => card.id));
  const unknown = DEMO_SCRIPT.filter((step) => !ids.has(step.card)).map((step) => step.card);
  check('every step targets a real card', unknown.length === 0, unknown.join(', '));

  // cardStatesAt stops at the first future step, so an unsorted script would drop events.
  const sorted = DEMO_SCRIPT.every(
    (step, index) => index === 0 || DEMO_SCRIPT[index - 1].at <= step.at
  );
  check('steps are in chronological order', sorted);

  const overrun = DEMO_SCRIPT.filter((step) => step.at >= LOOP_MS);
  check('no step lands after the loop ends', overrun.length === 0, `${overrun.length} steps`);

  const lastStep = Math.max(...DEMO_SCRIPT.map((step) => step.at));
  check(
    'the loop leaves a beat before resetting',
    LOOP_MS - lastStep >= 1_000,
    `${LOOP_MS - lastStep}ms of tail`
  );

  const bulletsByCard = new Map(DEMO_CARDS.map((card) => [card.id, card.bullets.map((b) => b.id)]));
  const badBullets = DEMO_SCRIPT.filter(
    (step) => step.completes && !bulletsByCard.get(step.card)?.includes(step.completes)
  ).map((step) => `${step.card}:${step.completes}`);
  check('completed bullets exist on their card', badBullets.length === 0, badBullets.join(', '));

  const duplicateIds = DEMO_CARDS.length !== new Set(DEMO_CARDS.map((c) => c.id)).size;
  check('card ids are unique', !duplicateIds);

  // A lock is a claim about access, so it has to track what the app really blocks:
  // /dashboard/keywords and /dashboard/products turn a non-admin away, everything else
  // in the grid is reachable. Pinned so neither a stray lock nor a silent unlock ships.
  const locked = DEMO_CARDS.filter((card) => card.locked)
    .map((card) => card.id)
    .sort();
  check(
    'only the admin-gated tools are locked',
    JSON.stringify(locked) === JSON.stringify(['catalog', 'keywords']),
    locked.join(', ') || 'none'
  );
  check(
    'the tools the story runs on stay open',
    !DEMO_CARDS.find((card) => card.id === 'schedule')?.locked &&
      !DEMO_CARDS.find((card) => card.id === 'article')?.locked
  );

  // Featured tiles are double-width, so the widths must divide evenly into the
  // four-column grid or the last row trails off half empty.
  const columns = DEMO_CARDS.reduce((total, card) => total + (card.featured ? 2 : 1), 0);
  check('the tiles fill whole rows of four', columns % 4 === 0, `${columns} columns`);
}

console.log('\nFrame derivation');
{
  const start = cardStatesAt(0);
  check('nothing is mid-story at the start', Object.values(start).every((s) => s.done.length === 0));
  check(
    'cards begin with their idle line',
    start.article.status === DEMO_CARDS.find((c) => c.id === 'article')!.idleStatus
  );

  const end = cardStatesAt(REST_FRAME);
  check('the schedule card finishes the story', end.schedule.status.includes('Next run tomorrow'));
  check('the article card completes its checks', end.article.done.includes('factcheck'));
  check('the shopify card ends published', end.shopify.done.includes('blog'));

  const touched = DEMO_SCRIPT.map((step) => step.card);
  const storyCards = Array.from(new Set(touched));
  check(
    'every card in the story has been activated by the rest frame',
    storyCards.every((id) => end[id].active),
    storyCards.filter((id) => !end[id].active).join(', ')
  );

  const mid = cardStatesAt(13_500);
  check('the draft is written by the middle of the loop', mid.article.done.includes('draft'));
  check('publishing has not happened yet', !mid.shopify.done.includes('blog'));
}

console.log('\nStill frame');
{
  // This is the frame the server renders and the one a reduced-motion visitor keeps
  // looking at, so it has to read as a finished product rather than a stalled one.
  const rest = restStates();

  const unticked = DEMO_CARDS.filter(
    (card) => rest[card.id].done.length !== card.bullets.length
  ).map((card) => card.id);
  check('every bullet is ticked at rest', unticked.length === 0, unticked.join(', '));

  check('every card reads as live', DEMO_CARDS.every((card) => rest[card.id].active));

  // A card frozen on "Loading…" forever is the specific failure this guards against.
  // Anchored, because in-progress lines are the ones that open with the gerund.
  const stalled = DEMO_CARDS.filter((card) =>
    /^(loading|writing|pushing|matching|rewriting|fact-checking)\b/i.test(rest[card.id].status)
  ).map((card) => `${card.id}: ${rest[card.id].status}`);
  check('no card rests on an in-progress line', stalled.length === 0, stalled.join(', '));

  const blank = DEMO_CARDS.filter((card) => !rest[card.id].status.trim()).map((card) => card.id);
  check('every card rests on a status line', blank.length === 0, blank.join(', '));
}

console.log('\nLooping');
{
  const first = cardStatesAt(5_000);
  const second = cardStatesAt(5_000 + LOOP_MS);
  check(
    'the same moment in a later lap matches',
    JSON.stringify(first) === JSON.stringify(second)
  );

  const negative = cardStatesAt(-1_000);
  check('a negative clock still resolves', negative.schedule !== undefined);

  const justAfterReset = cardStatesAt(LOOP_MS + 10);
  check('the loop restarts clean', justAfterReset.article.done.length === 0);

  check(
    'status age is measured from when it changed',
    cardStatesAt(2_500).schedule.statusSince === 300,
    `got ${cardStatesAt(2_500).schedule.statusSince}`
  );
}

console.log('\nTypewriter');
{
  check('nothing shows at the first instant', typeOut('Writing the draft', 0) === '');
  check('a negative age shows nothing', typeOut('Writing the draft', -50) === '');
  check('it reveals progressively', typeOut('Writing the draft', 100, 25) === 'Writ');
  check('it settles on the full line', typeOut('Writing the draft', 99_999) === 'Writing the draft');
  check('an empty status stays empty', typeOut('', 500) === '');

  const longest = Math.max(
    ...DEMO_SCRIPT.filter((s) => s.status).map((s) => s.status!.length),
    ...DEMO_CARDS.map((c) => c.idleStatus.length)
  );
  // A line still typing when the next step lands would never be read in full.
  check('the longest status can finish inside a second', longest * 24 <= 1_600, `${longest} chars`);
}

console.log('\nHero argument');
{
  const start = heroStateAt(0);
  check(
    'the argument starts unspoken',
    start.problems.every((point) => !point.visible) &&
      start.solutions.every((point) => !point.visible)
  );
  check('the chart has not been drawn', start.chart === 0);

  // Points must land one at a time, or the stagger is pointless.
  const midProblems = heroStateAt(1_200).problems.filter((point) => point.visible).length;
  check('problems arrive in sequence', midProblems > 0 && midProblems < PROBLEMS.length, `${midProblems} shown`);
  check(
    'the answers wait for the problems',
    heroStateAt(1_200).solutions.every((point) => !point.visible)
  );

  // The flash is the thing being asked for: lit on arrival, faded shortly after.
  const onArrival = heroStateAt(400).problems[0].flash;
  const later = heroStateAt(400 + FLASH_MS + 10).problems[0].flash;
  check('a point flashes as it lands', onArrival > 0.9, `${onArrival.toFixed(2)}`);
  check('the flash fades out', later === 0);
  check(
    'the flash eases rather than blinking',
    heroStateAt(400 + FLASH_MS / 2).problems[0].flash > 0.4 &&
      heroStateAt(400 + FLASH_MS / 2).problems[0].flash < 0.6
  );
  check('answers flash too', heroStateAt(2_800).solutions[0].flash > 0.9);

  check('the chart finishes inside the loop', heroStateAt(HERO_LOOP_MS - 1).chart === 1);
  check('everything is said by the end', heroStateAt(HERO_LOOP_MS - 1).problems.every((p) => p.visible));

  const loopedA = JSON.stringify(heroStateAt(3_000));
  const loopedB = JSON.stringify(heroStateAt(3_000 + HERO_LOOP_MS));
  check('the loop repeats exactly', loopedA === loopedB);
  check('a negative clock resolves', heroStateAt(-500).problems.length === PROBLEMS.length);

  const rest = heroRestState();
  check(
    'the still frame shows the whole argument',
    rest.chart === 1 &&
      rest.problems.every((point) => point.visible && point.flash === 0) &&
      rest.solutions.every((point) => point.visible && point.flash === 0)
  );
  check('both columns are matched', PROBLEMS.length === SOLUTIONS.length);
}

console.log('\nHero chart');
{
  const points = chartPoints();
  check('every month is plotted', points.length === CHART_SERIES.length);
  check(
    'the line stays inside the viewBox',
    points.every((point) => point.x >= 0 && point.x <= CHART_WIDTH && point.y >= 0 && point.y <= CHART_HEIGHT)
  );
  check(
    'months run left to right',
    points.every((point, index) => index === 0 || points[index - 1].x < point.x)
  );
  // y is inverted in SVG, so a rising series must descend.
  check(
    'a rising series draws upward',
    points.every((point, index) => index === 0 || points[index - 1].y > point.y)
  );
  check('the line has length to draw', chartLength(points) > CHART_WIDTH);

  const head = pointAtProgress(0, points);
  check('the head starts on the first month', head.x === points[0].x && head.y === points[0].y);
  const tail = pointAtProgress(1, points);
  const last = points[points.length - 1];
  check('the head ends on the last', Math.abs(tail.x - last.x) < 0.001 && Math.abs(tail.y - last.y) < 0.001);
  check(
    'the head never leaves the line',
    [0.1, 0.35, 0.5, 0.77, 0.99].every((progress) => {
      const at = pointAtProgress(progress, points);
      return at.x >= 0 && at.x <= CHART_WIDTH && at.y >= 0 && at.y <= CHART_HEIGHT;
    })
  );
  check('out of range progress is clamped', pointAtProgress(2, points).x === last.x);

  // The figure is the claim. Cumulative, so it can only ever climb, and it has to clear
  // half a million or the panel is promising something the number does not show.
  check(
    'the total is counted cumulatively',
    CHART_SERIES.every((entry, index) => index === 0 || CHART_SERIES[index - 1].value < entry.value)
  );
  check(
    'the total clears half a million',
    CHART_SERIES[CHART_SERIES.length - 1].value > 500_000,
    CHART_SERIES[CHART_SERIES.length - 1].value.toLocaleString()
  );

  // Every loop replays this counter, so it has to begin at zero rather than jumping
  // back to a five-figure number and counting on from there.
  check('the readout starts at zero', chartValueAt(0) === 0);
  check('the series is anchored at zero', CHART_SERIES[0].value === 0);
  check(
    'the readout is back at zero when the loop restarts',
    chartValueAt(heroStateAt(HERO_LOOP_MS).chart) === 0 && heroStateAt(HERO_LOOP_MS).chart === 0
  );
  check(
    'the readout lands on the last',
    chartValueAt(1) === CHART_SERIES[CHART_SERIES.length - 1].value
  );
  check(
    'the readout only climbs',
    Array.from({ length: 20 }, (_, i) => chartValueAt(i / 19)).every(
      (value, index, all) => index === 0 || value >= all[index - 1]
    )
  );
}

console.log('\nReview rotation');
{
  const count = REVIEWS.length;

  check('the rotation starts on the first review', reviewIndexAt(0, 0, count) === 0);
  check('it holds a slide for its full run', reviewIndexAt(REVIEW_MS - 1, 0, count) === 0);
  check('it advances on the boundary', reviewIndexAt(REVIEW_MS, 0, count) === 1);

  // The carousel used to land on a slide that no longer existed after a refetch.
  check(
    'it wraps instead of running off the end',
    reviewIndexAt(REVIEW_MS * count, 0, count) === 0
  );
  check(
    'every offset lands in range',
    Array.from({ length: count * 3 }, (_, i) => reviewIndexAt(i * REVIEW_MS, 2, count)).every(
      (index) => index >= 0 && index < count
    )
  );
  check('a negative baseline resolves', reviewIndexAt(-5_000, 3, count) === 3);
  check('an empty set cannot divide by zero', reviewIndexAt(1_000, 0, 0) === 0);

  // Pressing next must hand over a whole slide, not the tail of the interrupted one.
  check('a manual pick starts its slide from zero', reviewProgressAt(0) === 0);
  check('progress runs to just under one', reviewProgressAt(REVIEW_MS - 1) < 1);
  check('progress resets on the boundary', reviewProgressAt(REVIEW_MS) === 0);

  const ids = new Set(REVIEWS.map((review) => review.id));
  check('review ids are unique', ids.size === count);
  check('every review has a quote', REVIEWS.every((review) => review.text.trim().length > 40));
  check(
    'ratings are within range',
    REVIEWS.every((review) => review.rating > 0 && review.rating <= 5)
  );
  check('surnames are masked to an initial', maskSurname('Thompson') === 'T•••••••');
  check('an empty surname does not crash', maskSurname('') === '');
  check('a five star rating lights five', starFills(5).every((fill) => fill === 'full'));
  check('a half rating lights a half', starFills(4.5)[4] === 'half');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
