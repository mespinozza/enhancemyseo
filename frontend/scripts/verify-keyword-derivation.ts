/**
 * Gate test for turning a topic into the keyword an article targets.
 *
 * The derived keyword becomes the article's SEO target, so a sloppy parse is not a
 * cosmetic bug — it writes a whole article aimed at "Here's a great keyword for you:".
 * The model is told to reply with the keyword alone and mostly does, which is exactly
 * why the exceptions need pinning: quotes, a label, a one-item list, a refusal, or a
 * paragraph of reasoning. Anything that is not clearly a keyword must be rejected so the
 * runner falls back to the topic as written.
 *
 * Run with: npm run verify:keyword-derivation
 */
import { buildKeywordPrompt, parseKeywordReply } from '../src/lib/automation/keyword';

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

console.log('\nClean replies');
{
  check(
    'a bare keyword passes through',
    parseKeywordReply('best patio heaters for small patios') ===
      'best patio heaters for small patios'
  );
  check('surrounding whitespace is dropped', parseKeywordReply('  barrel sauna kits \n') === 'barrel sauna kits');
  check(
    'internal whitespace is collapsed',
    parseKeywordReply('wine   fridge\tsizing guide') === 'wine fridge sizing guide'
  );
}

console.log('\nFormatting the model adds anyway');
{
  check('straight quotes are stripped', parseKeywordReply('"infrared sauna benefits"') === 'infrared sauna benefits');
  check(
    'curly quotes are stripped',
    parseKeywordReply('\u201cindoor sauna cost\u201d') === 'indoor sauna cost'
  );
  check('a bullet is stripped', parseKeywordReply('- outdoor sauna installation') === 'outdoor sauna installation');
  check('a number is stripped', parseKeywordReply('1. patio heater btu guide') === 'patio heater btu guide');
  check('bold is stripped', parseKeywordReply('**gas patio heaters**') === 'gas patio heaters');
  check(
    'a label is stripped',
    parseKeywordReply('Keyword: wine refrigerator sizing') === 'wine refrigerator sizing'
  );
  check(
    'a fuller label is stripped',
    parseKeywordReply('Article keyword: sauna heater types') === 'sauna heater types'
  );
  check('a trailing period is dropped', parseKeywordReply('electric patio heaters.') === 'electric patio heaters');
  check(
    'only the first line is taken',
    parseKeywordReply('barrel sauna kits\n\nThis targets buyers comparing kits.') ===
      'barrel sauna kits'
  );
  check(
    'leading blank lines are skipped',
    parseKeywordReply('\n\n  sauna maintenance schedule') === 'sauna maintenance schedule'
  );
}

console.log('\nReplies that are not keywords');
{
  check('an empty reply is rejected', parseKeywordReply('') === '');
  check('whitespace only is rejected', parseKeywordReply('   \n  ') === '');
  check(
    'a sentence is rejected for length',
    parseKeywordReply(
      'I would suggest targeting the phrase best outdoor saunas for cold climates because it captures buyers'
    ) === ''
  );
  check(
    'a long phrase over the word limit is rejected',
    parseKeywordReply('one two three four five six seven eight nine ten eleven twelve thirteen') === ''
  );
  check(
    'a phrase at the word limit is kept',
    parseKeywordReply('one two three four five six seven eight nine ten eleven') ===
      'one two three four five six seven eight nine ten eleven'
  );
  check(
    'an over-long single token is rejected',
    parseKeywordReply('a'.repeat(120)) === ''
  );
}

console.log('\nPrompt construction');
{
  const prompt = buildKeywordPrompt({
    topic: 'Patio Heater Buying Guide',
    brandName: 'Posh Cave',
    businessType: 'luxury home decor',
    exclusions: new Set(['patio heater buying guide', 'gas vs electric patio heaters']),
  });

  check('the topic is included', prompt.includes('Patio Heater Buying Guide'));
  check('the brand is included', prompt.includes('Posh Cave'));
  check('the business type is included', prompt.includes('luxury home decor'));
  check('written keywords are listed to avoid', prompt.includes('- gas vs electric patio heaters'));
  check('it asks for the keyword only', prompt.toLowerCase().includes('keyword only'));

  const bare = buildKeywordPrompt({ topic: 'Sauna Cost', brandName: 'Posh Cave' });
  check('no exclusion block when nothing is written yet', !bare.includes('already have articles'));
  check('a missing business type leaves no empty parentheses', !bare.includes('()'));

  const many = buildKeywordPrompt({
    topic: 'Sauna Cost',
    brandName: 'Posh Cave',
    exclusions: new Set(Array.from({ length: 100 }, (_, i) => `keyword number ${i}`)),
  });
  const listed = many.split('\n').filter((line) => line.startsWith('- keyword number')).length;
  check('the exclusion list is capped', listed === 40, `listed ${listed}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
