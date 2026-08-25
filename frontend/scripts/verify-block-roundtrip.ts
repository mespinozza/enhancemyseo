/**
 * Gate test for the article editor: parsing an article into blocks and serializing
 * it back must be byte-identical. If this fails, editing can silently corrupt
 * published articles, so nothing downstream is safe.
 *
 * Run: npx tsx scripts/verify-block-roundtrip.ts
 */

import {
  parseBlocks,
  serializeBlocks,
  splitElement,
  replaceInner,
  htmlToText,
  countWords,
} from '../src/lib/article/blocks';
import { extractShopifyLinks, rewriteBlockLink } from '../src/lib/article/links';

const CHART = `<div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #ddd;">
        <h3 style="margin: 0 0 15px 0; color: #333;">Common Root Causes</h3>
        <div style="display: flex; justify-content: space-around; align-items: end; height: 200px; border-bottom: 2px solid #ccc; padding: 10px;">
          <div style="text-align: center; flex: 1; margin: 0 5px;">
            <div style="position: relative; height: 150px; display: flex; align-items: end;">
              <div style="background: #21C93A; width: 40px; height: 60%; border-radius: 4px 4px 0 0; position: relative; margin: 0 auto;">
                <span style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); font-weight: bold; color: #333;">27%</span>
              </div>
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">Faulty Contactor</p>
          </div>
        </div>
      </div>`;

const TABLE = `<table style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; border-left: 5px solid #21C93A;">
  <thead>
    <tr><th style="background-color: #21C93A; color: white; padding: 10px;">Topic</th><th style="background-color: #21C93A; color: white; padding: 10px;">Key Point</th></tr>
  </thead>
  <tbody>
    <tr style="background-color: #f2f2f2;"><td style="padding: 8px; border: 1px solid #ddd;">Function</td><td style="padding: 8px; border: 1px solid #ddd;">Shuts off heat if oil exceeds the specified limit</td></tr>
  </tbody>
</table>`;

const FIXTURES: Array<{ name: string; html: string }> = [
  {
    name: 'full article shape',
    html: `<h1>Frymaster Fryer High Limit Thermostat Troubleshooting</h1>
${TABLE}
<p>Operators frequently deal with a <strong>Frymaster fryer</strong> that has stopped heating. Always confirm the part number against your <a href="https://example.com/products/frymaster-8074815-sensor-assembly">Frymaster 8074815 Sensor Assembly</a> before ordering.</p>
<h2>What the High Limit Thermostat Does</h2>
<p>The high limit is a safety device. See our <a href='https://example.com/collections/frymaster'>Frymaster collection</a> for options.</p>
${CHART}
<ul>
  <li>Check continuity across the switch</li>
  <li>Verify the <em>oil level</em> is correct</li>
</ul>
<div style="background: #f8f9fa; padding: 15px; margin: 15px 0; border-left: 5px solid #21C93A; border-radius: 0 8px 8px 0;">
  <h4 style="margin: 0 0 10px 0; color: #21C93A;">Step 1: Isolate power</h4>
  <p style="margin: 0; color: #555;">Disconnect the fryer before testing.</p>
</div>
<h2>Conclusion</h2>
<p>Contact Malachy Parts Plus for genuine OEM parts.</p>`,
  },
  { name: 'bare chart', html: CHART },
  { name: 'bare table', html: TABLE },
  {
    name: 'nested same-tag divs',
    html: `<div class="a"><div class="b"><div class="c">deep</div></div></div><div>sibling</div>`,
  },
  {
    name: 'attribute containing angle brackets',
    html: `<p title="a > b and c < d" data-x="<not a tag>">text</p>`,
  },
  {
    name: 'comment containing markup',
    html: `<p>one</p><!-- <div>commented out</div> --><p>two</p>`,
  },
  {
    name: 'void and self-closing elements',
    html: `<p>line<br>break</p><img src="x.jpg" alt="x"><hr /><p>after<br/>more</p>`,
  },
  {
    name: 'unclosed trailing element',
    html: `<p>complete</p><p>truncated mid`,
  },
  {
    name: 'stray closing tag',
    html: `</div><p>content</p>`,
  },
  {
    name: 'tag-name prefix collision',
    html: `<div>outer<divider>x</divider></div>`,
  },
  {
    name: 'whitespace preservation',
    html: `\n\n  <p>a</p>\n\n\t<p>b</p>  \n`,
  },
  {
    name: 'uppercase tags',
    html: `<P>upper</P><DIV STYLE="color:red">styled</DIV>`,
  },
  { name: 'empty string', html: '' },
  { name: 'text only', html: 'just text, no tags' },
];

let failures = 0;
let checks = 0;

function check(name: string, condition: boolean, detail?: string) {
  checks++;
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`);
  }
}

console.log('\n=== Round-trip fidelity ===');
for (const fixture of FIXTURES) {
  const blocks = parseBlocks(fixture.html);
  const out = serializeBlocks(blocks);
  const identical = out === fixture.html;
  check(
    `${fixture.name} (${blocks.length} blocks)`,
    identical,
    identical ? undefined : `expected ${fixture.html.length} chars, got ${out.length}`,
  );
}

console.log('\n=== Block classification ===');
{
  const blocks = parseBlocks(FIXTURES[0].html);
  const editable = blocks.filter((b) => b.kind !== 'raw');
  const h1 = blocks.find((b) => b.tag === 'h1');
  const chart = blocks.find((b) => b.tag === 'div');
  const table = blocks.find((b) => b.tag === 'table');
  const list = blocks.find((b) => b.tag === 'ul');

  check('h1 parsed as prose', h1?.kind === 'prose');
  check('chart div parsed as visual', chart?.kind === 'visual');
  check('table parsed as visual', table?.kind === 'visual');
  check('list parsed as prose', list?.kind === 'prose');
  check('h1 is the first editable block', editable[0]?.tag === 'h1');
  check(
    'key takeaways table precedes the first paragraph',
    editable.findIndex((b) => b.tag === 'table') < editable.findIndex((b) => b.tag === 'p'),
  );
  check('chart block is intact', (chart?.html ?? '').endsWith('</div>'));
  check(
    'chart block contains its nested bars',
    (chart?.html.match(/<div/g) ?? []).length === 5,
    `found ${(chart?.html.match(/<div/g) ?? []).length} divs`,
  );
}

console.log('\n=== Element splitting ===');
{
  const parts = splitElement('<p style="color:red">hello <strong>world</strong></p>');
  check('open tag preserved with attributes', parts?.open === '<p style="color:red">');
  check('inner html extracted', parts?.inner === 'hello <strong>world</strong>');
  check('close tag extracted', parts?.close === '</p>');

  const rebuilt = replaceInner('<p style="color:red">old</p>', 'new <em>text</em>');
  check(
    'replaceInner keeps wrapper attributes',
    rebuilt === '<p style="color:red">new <em>text</em></p>',
    rebuilt,
  );

  check('void element has no split', splitElement('<br>') === null);
}

console.log('\n=== Text extraction ===');
{
  const text = htmlToText('<p>Hello <strong>world</strong> &amp; friends</p>');
  check('tags stripped and entities decoded', text === 'Hello world & friends', text);
  check('word count ignores markup', countWords('<p>one two three</p>') === 3);
  check('empty html yields zero words', countWords('') === 0);
}

console.log('\n=== Shopify link handling ===');
{
  const blocks = parseBlocks(FIXTURES[0].html);
  const links = extractShopifyLinks(blocks);

  check('found both shopify links', links.length === 2, `found ${links.length}`);
  check('product link classified', links.some((l) => l.kind === 'product' && l.handle === 'frymaster-8074815-sensor-assembly'));
  check('collection link classified (single quotes)', links.some((l) => l.kind === 'collection' && l.handle === 'frymaster'));
  check('anchor text extracted', links.some((l) => l.anchorText === 'Frymaster 8074815 Sensor Assembly'));

  const dup = '<p>See <a href="/products/a">A</a> and <a href="/products/a">A again</a>.</p>';
  const swapped = rewriteBlockLink(dup, 1, { href: '/products/b', anchorText: 'B' });
  check(
    'swap targets only the nth anchor',
    swapped === '<p>See <a href="/products/a">A</a> and <a href="/products/b">B</a>.</p>',
    swapped,
  );

  const hrefOnly = rewriteBlockLink(dup, 0, { href: '/products/c' });
  check(
    'href swap can leave anchor text alone',
    hrefOnly === '<p>See <a href="/products/c">A</a> and <a href="/products/a">A again</a>.</p>',
    hrefOnly,
  );
}

console.log(`\n${failures === 0 ? 'ALL PASS' : 'FAILURES'}: ${checks - failures}/${checks} checks passed\n`);
process.exit(failures === 0 ? 0 : 1);
