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

  const linked = DEMO_CARDS.every((card) => card.href.startsWith('/dashboard'));
  check('every card links into the app', linked);

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
