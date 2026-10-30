/**
 * Checks how automations choose a content type for each article.
 * Run with `npm run verify:content-types`.
 */
import {
  allowedContentTypes,
  fitsKeyword,
  keywordContentTypes,
  pickContentType,
} from '../src/lib/automation/content-type';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

const ALL = ['default', 'informational', 'product-reviews', 'listicle', 'history', 'pros-cons', 'comparisons', 'how-to', 'versus'];
const first = () => 0;

console.log('Keyword signals');
check('"how to" asks for a How To', keywordContentTypes('How to clean an ice machine').join() === 'how-to');
check('"A vs B" asks for Versus, then Comparisons', keywordContentTypes('Hoshizaki vs Manitowoc').join() === 'versus,comparisons');
check('"vs" without two sides asks only for Comparisons', keywordContentTypes('ice machine vs a vs b').join() === 'comparisons');
check('"best" asks for a list, reviews or a comparison', keywordContentTypes('best commercial ice machines').join() === 'listicle,product-reviews,comparisons');
check('"history" asks for History', keywordContentTypes('the history of the ice machine').join() === 'history');
check('"worth it" asks for Pros and Cons', keywordContentTypes('is a flake ice machine worth it').join() === 'pros-cons');
check('a question asks for Informational', keywordContentTypes('what is nugget ice').join() === 'informational');
check('a plain topic asks for nothing in particular', keywordContentTypes('commercial ice machines').length === 0);

console.log('\nFit');
check('Versus needs two named sides', !fitsKeyword('versus', 'commercial ice machines') && fitsKeyword('versus', 'gas vs electric fryer'));
check('History does not fit a buying keyword', !fitsKeyword('history', 'best ice machines') && fitsKeyword('history', 'commercial ice machines'));
check('Listicle does not fit a two-sided keyword', !fitsKeyword('listicle', 'Hoshizaki vs Manitowoc'));

console.log('\nPicking');
check('a single allowed type is always used', pickContentType('Hoshizaki vs Manitowoc', ['history']) === 'history');
check('nothing allowed falls back to Default', pickContentType('x', []) === 'default' && pickContentType('x', ['not-a-type']) === 'default');
check('the keyword\'s format wins when allowed', pickContentType('how to descale an ice machine', ALL, [], () => 0.99) === 'how-to');
check('Versus is picked for a two-sided keyword', pickContentType('Hoshizaki vs Manitowoc', ['how-to', 'versus', 'listicle'], [], first) === 'versus');
check('Versus is never picked without two sides', Array.from({ length: 50 }, (_, i) => pickContentType('commercial ice machines', ['versus', 'how-to'], [], () => i / 50)).every((t) => t === 'how-to'));
check('only unfit types fall back to Default when allowed', pickContentType('ice machines', ['versus', 'default'], [], () => 0.99) === 'default');
check('recently used types are avoided', pickContentType('commercial ice machines', ['how-to', 'listicle', 'informational'], ['how-to', 'listicle'], () => 0.99) === 'informational');
check('when all were used, the longest unused is picked', pickContentType('commercial ice machines', ['how-to', 'listicle'], ['how-to', 'listicle'], first) === 'listicle');
check('recency also applies among what the keyword asks for', pickContentType('best ice machines', ALL, ['listicle'], first) === 'product-reviews');

const counts = new Map<string, number>();
for (let i = 0; i < 300; i += 1) {
  const type = pickContentType('commercial ice machines', ['how-to', 'listicle', 'informational', 'pros-cons']);
  counts.set(type, (counts.get(type) ?? 0) + 1);
}
check('random picks spread across every fitting type', counts.size === 4 && [...counts.values()].every((n) => n > 30));

let recent: string[] = [];
const sequence: string[] = [];
for (let i = 0; i < 4; i += 1) {
  const type = pickContentType('commercial ice machines', ['how-to', 'listicle', 'informational', 'pros-cons'], recent);
  sequence.push(type);
  recent = [type, ...recent].slice(0, 4);
}
check('four runs in a row use four different types', new Set(sequence).size === 4);

console.log('\nAllowed types');
check('the list is used when present', allowedContentTypes({ contentType: 'how-to', contentTypes: ['listicle', 'versus'] }).join() === 'listicle,versus');
check('older automations use their single type', allowedContentTypes({ contentType: 'how-to' }).join() === 'how-to');
check('unknown entries are ignored', allowedContentTypes({ contentType: 'how-to', contentTypes: ['nope'] }).join() === 'how-to');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
