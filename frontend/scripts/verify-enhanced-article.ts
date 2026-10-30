/**
 * Gate test for the Enhanced article format.
 *
 * Everything the model writes passes through these templates on its way into a
 * customer's store, so the checks pin what must never break: each block stays one
 * editable element, nothing the sanitizer or Shopify would strip is relied on, model text
 * cannot inject markup, links only go where we sent them, and fact-check rewrites land
 * back in the right field.
 *
 * Run with: npm run verify:enhanced-article
 */
import { blockLabel, parseBlocks, serializeBlocks } from '../src/lib/article/blocks';
import { buildSeo } from '../src/lib/article/enhanced';
import { applyProseDocument, toProseDocument } from '../src/lib/article/enhanced/factcheck';
import {
  cleanBodyHtml,
  readableOn,
  renderBlock,
  renderEnhancedArticle,
  safeColor,
  type RenderContext,
} from '../src/lib/article/enhanced/render';
import { filterSources } from '../src/lib/article/enhanced/sources';
import { BLOCK_TYPES, type ArticleBlockData, type CatalogProduct, type EnhancedArticle } from '../src/lib/article/enhanced/types';
import { buildSystemPrompt, buildUserPrompt, missingBlocks, normalizeArticle, productLine, requiredBlocksFor } from '../src/lib/article/enhanced/writer';
import { TONE_LABELS, TONE_PROFILES, measureVoice, toneFor, toneSummary, voiceProblems } from '../src/lib/article/enhanced/tones';
import { interleaveProducts, rankForArticle, versusSearches } from '../src/lib/article/enhanced/products';
import type { ProductDetails } from '../src/lib/shopify/product-details';
import { EDIT_PRESETS, buildBlockEditPrompt, buildSectionEditPrompt } from '../src/lib/article/rewrite';
import { CONTENT_BLUEPRINTS, blueprintFor, comparisonSubjects } from '../src/lib/article/enhanced/blueprints';

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

const ctx: RenderContext = {
  brandColor: '#1e3a8a',
  products: [
    {
      handle: 'hoshizaki-km-515mah',
      title: 'Hoshizaki KM-515MAH Ice Machine',
      url: 'https://shop.example.com/products/hoshizaki-km-515mah',
      price: '4199.00',
      image: { url: 'https://cdn.shopify.com/s/files/1/ice.jpg?v=1', alt: 'Ice machine' },
    },
    {
      handle: 'manitowoc-iyt0500a',
      title: 'Manitowoc IYT0500A',
      url: 'https://shop.example.com/products/manitowoc-iyt0500a',
      price: '3650',
      image: null,
    },
  ],
  links: [{ kind: 'collection', title: 'Ice Machines', url: 'https://shop.example.com/collections/ice-machines' }],
  sources: [
    { title: 'FDA Food Code', url: 'https://www.fda.gov/food/food-code' },
    { title: 'ENERGY STAR Ice Makers', url: 'https://www.energystar.gov/products/ice_makers' },
  ],
};

const blocks: Record<(typeof BLOCK_TYPES)[number], ArticleBlockData> = {
  quiz: {
    type: 'quiz',
    title: 'Test your knowledge',
    questions: [
      { question: 'How often should you sanitize?', options: ['Monthly', 'Every 6 months', 'Never'], answerIndex: 1, explanation: 'Most makers say twice a year.' },
      { question: 'Out of range answer?', options: ['A', 'B'], answerIndex: 9, explanation: 'Clamped.' },
    ],
  },
  decision_guide: {
    type: 'decision_guide',
    options: [
      { condition: 'you serve under 100 covers', recommendation: 'A 300 lb unit', url: 'https://shop.example.com/collections/ice-machines' },
      { condition: 'you run a bar', recommendation: 'A nugget machine', url: 'https://evil.example.com/' },
    ],
  },
  comparison_table: {
    type: 'comparison_table',
    columns: ['Feature', 'Air-cooled', 'Water-cooled'],
    rows: [['Running cost', 'Lower', 'Higher'], ['Noise', 'Louder']],
    verdict: 'Air-cooled suits most kitchens.',
  },
  pros_cons: { type: 'pros_cons', pros: ['Cheap to run'], cons: ['Needs airflow'] },
  steps: { type: 'steps', steps: [{ title: 'Turn it off', detail: 'Unplug first.' }, { title: 'Clean', detail: 'Use nickel-safe cleaner.' }] },
  checklist: { type: 'checklist', items: ['Measure the space', 'Check the drain'] },
  stats: { type: 'stats', stats: [{ value: '40%', label: 'less energy', sourceIndex: 2 }, { value: '2x', label: 'a year', sourceIndex: 7 }] },
  callout: { type: 'callout', variant: 'mistake', text: 'Do not skip the water filter.' },
  product_cards: { type: 'product_cards', productHandles: ['hoshizaki-km-515mah', 'invented-handle', 'manitowoc-iyt0500a'] },
  chart: { type: 'chart', title: 'Daily output', unit: 'lb', chartItems: [{ label: 'Small', value: 300 }, { label: 'Large', value: 1000 }] },
  timeline: { type: 'timeline', events: [{ date: '1947', title: 'First flaker', detail: 'Early machines.' }, { date: '2000s', title: 'ENERGY STAR', detail: '<b>x</b>' }] },
};

const allowed = new Set<string>([
  'shop.example.com/products/hoshizaki-km-515mah',
  'shop.example.com/products/manitowoc-iyt0500a',
  'shop.example.com/collections/ice-machines',
]);

function topLevelElements(html: string) {
  return parseBlocks(html).filter((b) => b.kind !== 'raw');
}

const FORBIDDEN = /<\s*(script|iframe|object|embed|form|input|button|textarea|select|link|meta|base|style|svg)\b/i;

console.log('\nEvery block renders as one editable element');
for (const type of BLOCK_TYPES) {
  const html = renderBlock(blocks[type], ctx, allowed);
  const elements = topLevelElements(html);
  check(`${type} renders`, html.length > 0);
  check(`${type} is a single top-level element`, elements.length === 1, `got ${elements.length}`);
  check(`${type} has an emseo- class and a readable label`, /class="emseo-/.test(html) && blockLabel(elements[0]) !== 'Visual block', blockLabel(elements[0] ?? { id: '', kind: 'raw', tag: null, html: '' }));
  check(`${type} uses no forbidden tags or data attributes`, !FORBIDDEN.test(html) && !/\sdata-/.test(html));
}

console.log('\nBlock details');
{
  const quiz = renderBlock(blocks.quiz, ctx, allowed);
  check('quiz answers sit behind <details>', (quiz.match(/<details>/g) || []).length === 2);
  check('quiz clamps an out-of-range answer to the last option', quiz.includes('<strong>B. B</strong>'));

  const guide = renderBlock(blocks.decision_guide, ctx, allowed);
  check('decision guide keeps an allowed link', guide.includes('href="https://shop.example.com/collections/ice-machines"'));
  check('decision guide drops a link we did not supply', !guide.includes('evil.example.com'));

  const table = renderBlock(blocks.comparison_table, ctx, allowed);
  check('comparison pads a short row', (table.match(/<tr/g) || []).length === 3 && table.split('<tr')[3].split(/<t[hd]/).length - 1 === 3);
  check('comparison header uses readable text on the brand colour', table.includes('color:#ffffff'));

  const cards = renderBlock(blocks.product_cards, ctx, allowed);
  check('product cards skip handles not in the catalog', !cards.includes('invented-handle') && (cards.match(/View product/g) || []).length === 2);
  check('product card image is resized and lazy', cards.includes('ice.jpg?v=1&amp;width=480') && cards.includes('loading="lazy"'));
  check('product card shows a formatted price', cards.includes('$4,199.00') && cards.includes('$3,650.00'));

  const stats = renderBlock(blocks.stats, ctx, allowed);
  check('stats cite a listed source, nofollow', stats.includes('energystar.gov') && stats.includes('rel="nofollow noopener"'));
  check('stats ignore a source number that does not exist', (stats.match(/Source:/g) || []).length === 1);

  check('chart with fewer than two items renders nothing', renderBlock({ type: 'chart', chartItems: [{ label: 'x', value: 1 }] }, ctx, allowed) === '');
  check('unknown block type renders nothing', renderBlock({ type: 'video' as never }, ctx, allowed) === '');
}

console.log('\nModel text cannot inject markup');
{
  const evil = renderBlock(
    { type: 'quiz', title: '<script>alert(1)</script>', questions: [{ question: '<img src=x onerror=alert(1)>', options: ['"><b>x', 'ok'], answerIndex: 0, explanation: '<iframe>' }] },
    ctx,
    allowed
  );
  check('block text is escaped', !/<script|<img|<iframe|<b>x/i.test(evil) && evil.includes('&lt;script&gt;'));
  check('<strong> survives in short fields', renderBlock({ type: 'callout', text: 'Use <strong>filtered</strong> water' }, ctx, allowed).includes('<strong>filtered</strong>'));

  const body = cleanBodyHtml(
    '<h2 style="color:red">Big</h2><p class="x" onclick="steal()">Hi <a href="javascript:alert(1)">bad</a> ' +
      '<a href="https://shop.example.com/products/hoshizaki-km-515mah?ref=1">good</a> ' +
      '<a href="https://competitor.example.com/x">rival</a> <a href="#faq">jump</a></p>' +
      '<script>x()</script><img src="x"><table><tr><td>cell</td></tr></table><style>p{}</style><div><p>nested</p></div>',
    allowed
  );
  check('body headings are demoted to h3 and lose attributes', body.startsWith('<h3>Big</h3>'));
  check('body loses styles, classes and handlers', !/style=|class=|onclick/i.test(body));
  check('body drops script, img, table, style and div tags', !/<script|<img|<table|<td|<style|<div/i.test(body) && body.includes('cell') && body.includes('<p>nested</p>'));
  check('body keeps a supplied link (query ignored)', body.includes('href="https://shop.example.com/products/hoshizaki-km-515mah?ref=1">good</a>'));
  check('body unwraps javascript: and invented links but keeps their text', !body.includes('javascript') && !body.includes('competitor') && body.includes('bad') && body.includes('rival'));
  check('body keeps in-page anchors', body.includes('href="#faq"'));
  check('an unclosed anchor is removed', !cleanBodyHtml('<p><a href="https://shop.example.com/collections/ice-machines">open</p>', allowed).includes('<a '));

  check('brand colour cannot break out of a style attribute', safeColor('red;background:url(x)') === '#2563eb' && safeColor('#ABC') === '#aabbcc');
  const injected = renderEnhancedArticle(
    { ...minimalArticle(), title: 'T' },
    { ...ctx, brandColor: '"><script>alert(1)</script>' }
  );
  check('a hostile brand colour never reaches the HTML', !injected.includes('<script') && injected.includes('#2563eb'));
  check('light brand colours get dark text', readableOn('#facc15') === '#111111' && readableOn('#1e3a8a') === '#ffffff');
}

function minimalArticle(): EnhancedArticle {
  return {
    intent: 'buyers_guide',
    title: 'Best Commercial Ice Machines for Restaurants',
    metaTitle: 'Best Commercial Ice Machines for Restaurants in 2026: Buyer Guide',
    metaDescription: 'Compare commercial ice machines by output, cooling type and running cost, with a checklist and picks for restaurants of every size and budget out there today.',
    quickAnswer: 'Most restaurants need 1.5 lb of ice per customer per day. Air-cooled modular machines suit most kitchens.',
    keyTakeaways: ['Size by covers', 'Air-cooled is cheaper to run', 'Clean twice a year'],
    introHtml: '<p>Choosing an ice machine starts with your covers.</p>',
    sections: [
      { heading: 'How much ice do you need?', html: '<p>Plan 1.5 lb per guest.</p>', block: blocks.stats },
      { heading: 'Air-cooled vs water-cooled', html: '<p>Air-cooled wins on cost.</p>', block: blocks.comparison_table },
      { heading: 'Our top picks', html: '<p>See the <a href="https://shop.example.com/products/hoshizaki-km-515mah">Hoshizaki KM-515MAH</a>.</p>', block: blocks.product_cards },
      { heading: 'Check your knowledge', html: '<p>Try the quiz.</p>', block: blocks.quiz },
    ],
    faq: [{ question: 'How long do ice machines last?', answer: 'Usually 8-10 years.' }],
    conclusionHeading: 'Find your ice machine',
    conclusionHtml: '<p>Browse our <a href="https://shop.example.com/collections/ice-machines">ice machines</a>.</p>',
    tags: ['ice machines', 'buying guide'],
    sourcesUsed: [2, 1, 2, 9],
  };
}

console.log('\nWhole article');
{
  const article = minimalArticle();
  const html = renderEnhancedArticle(article, ctx);
  const parsed = parseBlocks(html);
  check('starts with a plain <h1>', html.startsWith(`<h1>${article.title}</h1>`));
  check('editor round trip is byte for byte', serializeBlocks(parsed) === html);
  check('uses no forbidden tags or data attributes', !FORBIDDEN.test(html) && !/\sdata-/.test(html));
  check('quick answer, takeaways, TOC, FAQ and sources are present', ['emseo-quick-answer', 'emseo-key-takeaways', 'emseo-toc', 'emseo-faq', 'emseo-sources'].every((c) => html.includes(c)));
  check('TOC links match H2 ids', html.includes('href="#how-much-ice-do-you-need"') && html.includes('<h2 id="how-much-ice-do-you-need">'));
  check('sources list only valid, unique picks in order', /Sources<\/p><ol[^>]*><li[^>]*><a href="https:\/\/www\.energystar\.gov[\s\S]*fda\.gov[\s\S]*<\/ol>/.test(html) && (html.match(/<li style="margin:4px 0"><a href="https:\/\/www\.(fda|energystar)/g) || []).length === 2);
  check('external source links are nofollow and open in a new tab', /href="https:\/\/www\.fda\.gov\/food\/food-code" target="_blank" rel="nofollow noopener"/.test(html));
  check('no sources list when sources are off', !renderEnhancedArticle(article, { ...ctx, sources: [] }).includes('emseo-sources'));
  check('no TOC for short articles', !renderEnhancedArticle({ ...article, sections: article.sections.slice(0, 3) }, ctx).includes('emseo-toc'));
  check('every visual top-level element is labelled', parsed.filter((b) => b.kind === 'visual').every((b) => blockLabel(b) !== 'Visual block'));
}

console.log('\nFact-check round trip');
{
  const article = minimalArticle();
  const doc = toProseDocument(article);
  check('prose document has no blocks', !doc.includes('emseo-'));
  check('an unchanged document changes nothing', JSON.stringify(applyProseDocument(article, doc)) === JSON.stringify(article));

  const fixed = doc.replace('<p>Plan 1.5 lb per guest.</p>', '<p>Plan about 1.5 lb per guest.</p>');
  check('a rewritten paragraph lands in its section', applyProseDocument(article, fixed).sections[0].html === '<p>Plan about 1.5 lb per guest.</p>');

  const faqFixed = doc.replace('<p>Usually 8-10 years.</p>', '<p>Usually 7-10 years &amp; more.</p>');
  check('a rewritten FAQ answer comes back as plain text', applyProseDocument(article, faqFixed).faq[0].answer === 'Usually 7-10 years & more.');

  const damaged = doc.replace(/<section data-fc="s1">[\s\S]*?<\/section>/, '<section data-fc="s1"><h2>x</h2></section>');
  check('a section emptied by a bad rewrite keeps its original', applyProseDocument(article, damaged).sections[1].html === article.sections[1].html);
  check('headings and blocks are never touched', applyProseDocument(article, fixed).sections.every((s, i) => s.heading === article.sections[i].heading && s.block === article.sections[i].block));
}

console.log('\nSources filter');
{
  const kept = filterSources(
    [
      { title: 'FDA', url: 'https://www.fda.gov/food' },
      { title: 'FDA again', url: 'https://www.fda.gov/food/' },
      { title: 'Amazon', url: 'https://www.amazon.com/dp/1' },
      { title: 'Competitor', url: 'https://www.webstaurantstore.com/guide' },
      { title: 'Reddit', url: 'https://old.reddit.com/r/x' },
      { title: 'Our own', url: 'https://shop.example.com/blogs/x' },
      { title: 'Bad scheme', url: 'ftp://files.example.org/x' },
      { title: 'NSF', url: 'https://www.nsf.org/standards' },
    ],
    ['https://shop.example.com', '']
  );
  check('keeps authoritative sources once each', kept.map((s) => s.url).join(' ') === 'https://www.fda.gov/food https://www.nsf.org/standards', kept.map((s) => s.url).join(' '));
}

console.log('\nWriter output handling');
{
  let threw = false;
  try {
    normalizeArticle({ title: 'x', sections: [{ heading: 'a', html: '<p>a</p>' }] }, 0);
  } catch {
    threw = true;
  }
  check('an article with under three sections is rejected', threw);

  const normalized = normalizeArticle(
    {
      intent: 'nonsense',
      title: ' Title ',
      sections: [1, 2, 3].map((n) => ({ heading: `H${n}`, html: `<p>${n}</p>`, block: { type: n === 1 ? 'video' : 'checklist', items: ['a'] } })),
      sourcesUsed: [0, 1, 2, 3, 1.5],
      keyTakeaways: ['a', '', 7],
    },
    2
  );
  const stringified = normalizeArticle(
    {
      title: 'T',
      sections: JSON.stringify([1, 2, 3].map((n) => ({ heading: `H${n}`, html: `<p>${n}</p>`, block: n === 2 ? JSON.stringify({ type: 'quiz', questions: [] }) : undefined }))),
      quiz: JSON.stringify({ title: 'Quiz', questions: [{ question: 'Q?', options: ['a', 'b'], answerIndex: 0, explanation: 'e' }] }),
      faq: '[{"question":"Q","answer":"A"}]',
      tags: '["a","b"]',
    },
    0
  );
  check('sections sent as a JSON string are recovered', stringified.sections.length === 3);
  check('quiz, FAQ and tags sent as JSON strings are recovered', stringified.quiz?.type === 'quiz' && stringified.faq.length === 1 && stringified.tags.length === 2);
  check('a quiz field replaces a quiz section block', stringified.sections.every((s) => !s.block));

  const withQuiz = renderEnhancedArticle({ ...minimalArticle(), sections: minimalArticle().sections.map((s) => ({ ...s, block: s.block?.type === 'quiz' ? undefined : s.block })), quiz: blocks.quiz }, ctx);
  const order = parseBlocks(withQuiz).filter((b) => b.kind !== 'raw').map((b) => blockLabel(b));
  check('the quiz field renders exactly once', (withQuiz.match(/emseo-quiz/g) || []).length === 1);
  check('the quiz follows a section with no block of its own', order[order.indexOf('Quiz') - 1] === 'Paragraph', order.join(' > '));

  check('unknown intent falls back to informational', normalized.intent === 'informational');
  check('unknown block types are dropped', !normalized.sections[0].block && normalized.sections[1].block?.type === 'checklist');
  check('source numbers outside the list are dropped', normalized.sourcesUsed.join(',') === '1,2');
  check('non-string takeaways are dropped', normalized.keyTakeaways.join(',') === 'a');

  const prompt = buildUserPrompt({
    keyword: 'ice machines',
    brandName: 'Shop',
    businessType: 'restaurant supply',
    research: { brief: '', facts: [], questions: [], sources: [] },
    products: [],
    links: [],
    sources: [],
  });
  check('with no research the writer is told to be conservative', prompt.includes('Be conservative with specific figures'));
  check('with no products the writer is told not to use cards', prompt.includes('do not use product_cards'));
  check('with sources off the writer is told to cite nothing', prompt.includes('return an empty sourcesUsed'));
}

console.log('\nSEO fields');
{
  const seo = buildSeo({ ...minimalArticle(), metaTitle: 'x'.repeat(90) }, ctx.products);
  check('meta title is clipped to 70 characters', seo.metaTitle.length <= 70);
  check('meta description is clipped to 160 characters', seo.metaDescription.length <= 160);
  check('featured image comes from the first product card', seo.featuredImage?.src === 'https://cdn.shopify.com/s/files/1/ice.jpg?v=1');
  check('no image when no product has one', buildSeo(minimalArticle(), [ctx.products[1]]).featuredImage === null);
}

console.log('\nContent types');
{
  check('every content type has a blueprint with a description', CONTENT_BLUEPRINTS.length === 9 && CONTENT_BLUEPRINTS.every((b) => b.description && b.structure));
  check('every required block is a real block type', CONTENT_BLUEPRINTS.every((b) => b.requiredBlocks.every((t) => (BLOCK_TYPES as readonly string[]).includes(t))));
  check('an unknown content type falls back to Default', blueprintFor('nonsense').value === 'default' && blueprintFor(undefined).value === 'default');
  check('how-to requires steps and a checklist', blueprintFor('how-to').requiredBlocks.join() === 'steps,checklist');
  check('product reviews drop product cards when there are no products', requiredBlocksFor({ contentType: 'product-reviews', products: [] }).join() === 'pros_cons');
  check('product reviews keep product cards when there are products', requiredBlocksFor({ contentType: 'product-reviews', products: ctx.products }).includes('product_cards'));

  const article = minimalArticle();
  check('missing blocks are reported', missingBlocks(article, ['comparison_table', 'steps', 'timeline']).join() === 'steps,timeline');

  check('versus subjects come from the form first', comparisonSubjects('anything', [' Hoshizaki ', 'Manitowoc'])?.join('|') === 'Hoshizaki|Manitowoc');
  check('versus subjects are read from "A vs B"', comparisonSubjects('Hoshizaki vs. Manitowoc ice machines')?.join('|') === 'Hoshizaki|Manitowoc ice machines');
  check('versus subjects are read from "A versus B?"', comparisonSubjects('gas versus electric fryer: which is better')?.join('|') === 'gas|electric fryer');
  check('no subjects when the keyword names no pair', comparisonSubjects('best ice machines') === null && comparisonSubjects('a vs b vs c') === null);

  const versusPrompt = buildUserPrompt({ keyword: 'a vs b', brandName: 'S', businessType: 'x', research: { brief: '', facts: [], questions: [], sources: [] }, products: [], links: [], sources: [], contentType: 'versus', subjects: ['Alpha', 'Beta'] });
  check('the prompt carries the structure, required blocks and both sides', versusPrompt.includes('Versus (Brand A Vs. Brand B)') && versusPrompt.includes('Required section blocks: comparison_table, decision_guide') && versusPrompt.includes('"Alpha" vs "Beta"'));
  const timelineHtml = renderBlock(blocks.timeline, ctx, allowed);
  check('timeline escapes its text', timelineHtml.includes('&lt;b&gt;x&lt;/b&gt;') && timelineHtml.includes('1947'));
}

console.log('\nProduct selection');
{
  const p = (handle: string, extra: Partial<CatalogProduct> = {}): CatalogProduct => ({ id: `gid://shopify/Product/${handle}`, handle, title: handle, url: `https://s.com/products/${handle}`, ...extra });
  check('versus sides alternate and repeats are dropped', interleaveProducts([[p('a1'), p('a2'), p('x')], [p('b1'), p('x'), p('b2')]]).map((x) => x.handle).join() === 'a1,b1,a2,x,b2');
  check('interleaving respects the cap', interleaveProducts([[p('a1'), p('a2')], [p('b1'), p('b2')]], 3).length === 3);

  const details = new Map<string, ProductDetails>([
    ['gid://shopify/Product/out', { inStock: false }],
    ['gid://shopify/Product/in1', { inStock: true, productType: 'Cleaner', vendor: 'Nu-Calgon', description: 'Nickel-safe.' }],
    ['gid://shopify/Product/in2', { inStock: true }],
  ]);
  const ranked = rankForArticle([p('out'), p('unknown'), p('in1'), p('in2')], details);
  check('in-stock products come first, unknown next, in relevance order', ranked.map((x) => x.handle).join() === 'in1,in2,unknown');
  check('out-of-stock products are dropped when 3+ others remain', !ranked.some((x) => x.handle === 'out'));
  check('details fill type, brand and description', ranked[0].productType === 'Cleaner' && ranked[0].vendor === 'Nu-Calgon' && ranked[0].inStock === true);
  const few = rankForArticle([p('out'), p('in1')], details);
  check('out-of-stock products are kept, last, when few remain', few.map((x) => x.handle).join() === 'in1,out');
  check('search-supplied type is not overwritten', rankForArticle([p('in1', { productType: 'Descaler' })], details)[0].productType === 'Descaler');

  check('versus searches share a trailing product type', versusSearches('Hoshizaki vs Manitowoc ice machines', ['Hoshizaki', 'Manitowoc']).join('|') === 'Hoshizaki ice machines|Manitowoc ice machines');
  check('versus searches borrow the type from a parsed keyword', versusSearches('Hoshizaki vs Manitowoc ice machines', ['Hoshizaki', 'Manitowoc ice machines']).join('|') === 'Hoshizaki ice machines|Manitowoc ice machines');
  check('versus searches handle "A versus B fryer: ..."', versusSearches('gas versus electric fryer: which is better', ['gas', 'electric fryer']).join('|') === 'gas fryer|electric fryer');
  check('form-entered sides not in the keyword are searched as given', versusSearches('best ice machine brand', ['Hoshizaki', 'Manitowoc']).join('|') === 'Hoshizaki|Manitowoc');

  const line = productLine(p('in1', { price: '24.99', productType: 'Cleaner', vendor: 'Nu-Calgon', inStock: true, description: 'Nickel-safe.' }));
  check('product lines carry price, type, brand, stock and description', line.includes('$24.99 | Cleaner | Nu-Calgon | in stock') && line.includes('\n  Nickel-safe.'));
  check('out-of-stock products are flagged to the writer', productLine(p('o', { inStock: false })).includes('OUT OF STOCK'));
  check('every content type says how to use products', CONTENT_BLUEPRINTS.every((b) => b.productUse.length > 20));
  const howToPrompt = buildUserPrompt({ keyword: 'how to descale', brandName: 'S', businessType: 'x', research: { brief: '', facts: [], questions: [], sources: [] }, products: [p('in1')], links: [], sources: [], contentType: 'how-to' });
  check('the prompt carries the content type\'s product guidance', howToPrompt.includes(blueprintFor('how-to').productUse));
}

console.log('\nTone of voice');
{
  check('labels, values and any case resolve to a profile', toneFor('Technical')?.value === 'technical' && toneFor('technical')?.value === 'technical' && toneFor(' AUTHORITATIVE ')?.value === 'authoritative');
  check('empty and "Default" are the default voice', toneFor('')?.value === '' && toneFor(undefined)?.value === '' && toneFor('default')?.value === '');
  check('common synonyms map to a profile', toneFor('Casual')?.value === 'conversational' && toneFor('formal')?.value === 'professional' && toneFor('warm')?.value === 'friendly');
  check('anything else is a custom voice', toneFor('witty and irreverent') === null);
  check('every tone has a full profile', TONE_PROFILES.every((t) => t.voice.length >= 3 && t.blocks.length >= 3 && t.avoid.length >= 2 && t.sample && t.cta && t.sentenceWords[0] < t.sentenceWords[1]));
  check('the selectable tones are the five saved labels', TONE_LABELS.join() === 'Professional,Conversational,Technical,Friendly,Authoritative');

  const technical = buildSystemPrompt('Store', 'Technical');
  check('the system prompt carries the chosen voice', technical.includes('Voice: Technical') && technical.includes('Do not use contractions') && technical.includes(toneFor('technical')!.sample));
  const conversational = buildSystemPrompt('Store', 'Conversational');
  check('different tones give different instructions', conversational.includes('Use contractions freely') && !conversational.includes('Voice: Technical'));
  check('a custom voice is applied to every part', buildSystemPrompt('Store', 'witty, like a seasoned chef').includes('Apply "witty, like a seasoned chef" consistently'));
  check('the default voice is used with no tone', buildSystemPrompt('Store').includes('Voice: Default'));
  const userPrompt = buildUserPrompt({ keyword: 'k', brandName: 'S', businessType: 'x', research: { brief: '', facts: [], questions: [], sources: [] }, products: [], links: [], sources: [], toneOfVoice: 'Technical' });
  check('the old one-line tone is gone from the request', !userPrompt.includes('Tone of voice:'));
  check('editor rewrites get the tone summary', toneSummary('Friendly').startsWith('Friendly: Warm and encouraging') && toneSummary('my own voice') === 'my own voice');

  const chatty = measureVoice("<p>Here's the thing. You'll love it. Don't worry, it's easy! Want to know why?</p>");
  check('contractions, "you", questions and exclamations are counted', chatty.contractionsPer100 > 20 && chatty.youPer100 > 5 && chatty.questions === 1 && chatty.exclamations === 1);
  check('possessives are not counted as contractions', measureVoice("<p>The machine's compressor and Hoshizaki's warranty last years.</p>").contractionsPer100 === 0);
  check('average sentence length is measured', measureVoice('<p>One two three four. Five six seven eight.</p>').averageSentenceWords === 4);
  check('list items and paragraphs count as sentences', measureVoice('<ul><li>One two</li><li>Three four.</li></ul><p>Five six</p>').averageSentenceWords === 2);

  const long = (s: string) => `<p>${Array(30).fill(s).join(' ')}</p>`;
  const stiff = measureVoice(long('The unit requires a descaling cycle with an approved acid cleaner before any sanitizing cycle begins on the ice contact surfaces of the machine.'));
  check('a stiff draft fails the Conversational voice', voiceProblems('Conversational', stiff).length === 3);
  check('the same draft suits the Technical voice', voiceProblems('Technical', stiff).length === 0);
  const casual = measureVoice(long("You'll want to descale it first. Don't skip the rinse. It's quick, and you're done."));
  check('a casual draft suits the Conversational voice', voiceProblems('Conversational', casual).length === 0);
  check('the same draft fails the Technical voice', voiceProblems('Technical', casual).some((p) => p.includes('no contractions')) && voiceProblems('Technical', casual).some((p) => p.includes('sparingly')));
  check('a custom voice has no measured targets', voiceProblems('witty', casual).length === 0);

  const matchTone = EDIT_PRESETS.find((p) => p.id === 'tone')!.instruction;
  const toneEdit = buildBlockEditPrompt({ blockHtml: '<p>x</p>', instruction: matchTone, brand: { toneOfVoice: 'Technical' } });
  check('"Match tone" edits get the full voice rules', toneEdit.includes('THE VOICE TO MATCH') && toneEdit.includes('Voice: Technical') && toneEdit.includes('Do not use contractions'));
  check('"Match tone" on an older article uses the default voice', buildSectionEditPrompt({ sectionHtml: '<p>x</p>', instruction: matchTone, blockCount: 2, brand: {} }).includes('Voice: Default'));
  check('other edits only get the one-line tone', !buildBlockEditPrompt({ blockHtml: '<p>x</p>', instruction: 'Shorten', brand: { toneOfVoice: 'Technical' } }).includes('THE VOICE TO MATCH'));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
