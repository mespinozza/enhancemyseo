/**
 * Gate test for the Claude fact-check's text handling.
 *
 * The model only ever sees plain text, but fixes land in HTML that is stored and
 * pushed, so the mapping between the two is what can quietly break articles: a fix in
 * the wrong element, a fix that drops a link, or one applied twice.
 *
 * Run with: npm run verify:factcheck
 */
import { applyQuotedFix, buildFactCheckPrompt, buildUnits, parseFactCheckReply } from '../src/lib/article/factcheck';

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

const html = [
  '<h1>Ice Machines</h1>',
  '<p>Most restaurants need <strong>1.5 lb</strong> of ice per customer per day.</p>',
  '<p>Energy Star models use 50% less energy &amp; water than standard models.</p>',
  '<ul><li><p>Clean the machine every two weeks for best results.</p></li><li>Replace water filters every six months.</li></ul>',
  '<table><tr><td>Air-cooled units cost less to run in cool rooms.</td></tr></table>',
  '<p>See the <a href="https://shop.example.com/products/km-515">Hoshizaki KM-515MAH ice machine</a> for details.</p>',
  '<p>Short one.</p>',
].join('\n');

console.log('\nUnits');
const units = buildUnits(html);
{
  check('paragraphs, list items and cells become units', units.length === 6, units.map((u) => u.text).join(' | '));
  check('a list item wrapping a paragraph yields the paragraph once', units.filter((u) => u.text.startsWith('Clean the machine')).length === 1);
  check('very short passages are skipped', !units.some((u) => u.text === 'Short one.'));
  check('unit text is plain with entities decoded', units[1].text === 'Energy Star models use 50% less energy & water than standard models.');
  check('unit html is the exact source element', units.every((u) => html.includes(u.html)));
  check('the prompt lists every unit with its id', units.every((u) => buildFactCheckPrompt(units).includes(`[${u.id}] ${u.text}`)));
}

console.log('\nReply parsing');
{
  const reply = '```json\n' + JSON.stringify({
    issues: [
      { unit: 'u2', quote: 'use 50% less energy', problem: 'ENERGY STAR says about 12%.', correction: 'use about 12% less energy', source: 'https://www.energystar.gov/x' },
      { unit: 'u2', quote: 'not in the text', problem: 'x', correction: 'y' },
      { unit: 'u99', quote: 'whatever', problem: 'x', correction: 'y' },
      { unit: 'u3', quote: 'every two weeks', problem: 'x', correction: 'every two weeks' },
      { unit: 'u1', quote: '1.5 lb of ice per customer', problem: 'Fine', correction: '1.5 lb of ice per guest', source: 'javascript:alert(1)' },
    ],
  }) + '\n```';
  const issues = parseFactCheckReply(reply, units)!;
  check('keeps issues that quote their unit exactly', issues.length === 2, JSON.stringify(issues.map((i) => i.quote)));
  check('drops quotes not in the unit, unknown units and no-op corrections', !issues.some((i) => ['not in the text', 'whatever', 'every two weeks'].includes(i.quote)));
  check('drops non-http sources', issues[1].source === undefined && issues[0].source === 'https://www.energystar.gov/x');
  check('an empty list parses as no issues', parseFactCheckReply('{"issues": []}', units)?.length === 0);
  check('prose around the JSON is tolerated', parseFactCheckReply('Here you go: {"issues": []} done', units)?.length === 0);
  check('an unusable reply is reported as unusable, not as a pass', parseFactCheckReply('Everything looks fine!', units) === null);
}

console.log('\nApplying fixes');
{
  const energy = { unitId: 'u2', quote: 'use 50% less energy & water', problem: 'x', correction: 'use about 12% less energy & 20% less water' };
  const result = applyQuotedFix(html, units[1], energy);
  check('a quote containing an entity is found and replaced', Boolean(result) && result!.html.includes('use about 12% less energy &amp; 20% less water than'));
  check('only that element changes', result!.html.replace(result!.unitHtml, units[1].html) === html);

  const bold = applyQuotedFix(html, units[0], { unitId: 'u1', quote: '1.5 lb of ice', problem: 'x', correction: '2 lb of ice' });
  check('a quote split by markup is left for the rewriter', bold === null);

  const inLink = applyQuotedFix(html, units[5], { unitId: 'u6', quote: 'KM-515MAH ice machine', problem: 'x', correction: 'KM-515MAH ice maker' });
  check('a quote inside link text keeps the link', Boolean(inLink) && inLink!.html.includes('<a href="https://shop.example.com/products/km-515">Hoshizaki KM-515MAH ice maker</a>'));

  const injected = applyQuotedFix(html, units[3], { unitId: 'u4', quote: 'Replace water filters', problem: 'x', correction: '<script>x()</script>Swap filters' });
  check('corrections are inserted as text, never markup', Boolean(injected) && !injected!.html.includes('<script') && injected!.html.includes('&lt;script&gt;'));

  const first = applyQuotedFix(html, units[1], { unitId: 'u2', quote: '50%', problem: 'x', correction: '12%' })!;
  const moved = { ...units[1], html: first.unitHtml };
  const second = applyQuotedFix(first.html, moved, { unitId: 'u2', quote: 'than standard models', problem: 'x', correction: 'than non-certified models' });
  check('two fixes in one passage both land once the passage is tracked', Boolean(second) && second!.html.includes('12% less') && second!.html.includes('non-certified'));
  check('a stale passage is not patched blindly', applyQuotedFix(first.html, units[1], { unitId: 'u2', quote: 'than standard models', problem: 'x', correction: 'y' }) === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
