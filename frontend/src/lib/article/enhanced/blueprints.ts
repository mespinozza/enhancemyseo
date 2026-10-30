/**
 * What each content type means for the article's structure.
 *
 * The content type used to be a word dropped into the prompt. Here each one fixes the
 * search intent, the blocks the article must contain, and how its headings are built,
 * so "How To" reliably produces numbered steps and a materials checklist, "Versus"
 * a side-by-side table and a verdict, and so on.
 *
 * Client-safe: the forms read the labels and descriptions.
 */
import type { BlockType, SearchIntent } from './types';

export interface ContentBlueprint {
  value: string;
  label: string;
  /** Shown under the dropdown so users know what they will get. */
  description: string;
  /** Null lets the writer choose from the keyword. */
  intent: SearchIntent | null;
  /** Blocks the article must contain; the writer is asked again if any are missing. */
  requiredBlocks: BlockType[];
  /** Structure instructions added to the writer prompt. */
  structure: string;
  /** Which of the store's products to feature, and where. */
  productUse: string;
}

export const CONTENT_BLUEPRINTS: ContentBlueprint[] = [
  {
    value: 'default',
    label: 'Default Article',
    description: 'Picks the best structure for the keyword: guide, comparison, how-to or buying guide.',
    intent: null,
    requiredBlocks: [],
    structure: 'Choose the structure that best matches the search intent of the keyword.',
    productUse: 'Feature the products that most directly answer the keyword, in the sections where a reader would want them.',
  },
  {
    value: 'informational',
    label: 'Informational',
    description: 'Explains a topic: definition first, then how it works, why it matters, key figures and common misconceptions.',
    intent: 'informational',
    requiredBlocks: [],
    structure:
      'Open the first section with a one-sentence definition ("X is ..."), the format search engines quote. ' +
      'Then cover how it works, why it matters, types or variations, key figures (a stats block when the research has figures), ' +
      'and common misconceptions. Link products or services where they are the natural next step.',
    productUse:
      'Educate first: link products only where they are the natural next step, and use at most one product_cards block, near the end, with the products that best fit what was explained.',
  },
  {
    value: 'product-reviews',
    label: 'Product Reviews',
    description: 'Reviews specific products from your store: one section per product with pros, cons, who it suits and a verdict.',
    intent: 'product_focused',
    requiredBlocks: ['product_cards', 'pros_cons'],
    structure:
      'Review the products from the product list (2-5 of the most relevant). Start with a section on how they were evaluated (the criteria that matter to a buyer). ' +
      'Then one H2 per product named after the product, covering key specs, who it is best for, and a pros_cons block for the most important product or a combined one. ' +
      'Include product_cards for the reviewed products, a comparison_table when two or more products are reviewed, and end with a clear verdict naming the best pick for each type of buyer. ' +
      'Be honest about drawbacks; credible reviews rank and convert better than praise. If there are no products in the list, review the leading product types instead and do not invent model names.',
    productUse:
      'Review in-stock products that match the keyword most closely. Prefer a spread of price points and types so each kind of buyer gets a pick; describe each from its listed type and description, never from invented specs.',
  },
  {
    value: 'listicle',
    label: 'Listicle',
    description: 'A numbered list ("7 Best ...", "10 Ways to ..."): a summary table up top, then one section per item.',
    intent: null,
    requiredBlocks: ['comparison_table'],
    structure:
      'Write a numbered list. The title starts with the number of items (5-10), and that number must equal the number of numbered H2s. ' +
      'Each item is its own H2 starting with its number ("1. Name"), with what it is, why it made the list, and who it suits. ' +
      'Put an at-a-glance comparison_table near the top summarizing every item in one row each. ' +
      'Where items are products from the product list, use product_cards in their sections. Sections outside the list (such as how to choose) have no number.',
    productUse:
      'When the list is of products, its items are in-stock products from the product list that match the keyword, varied in price and type. Otherwise link the products that suit each item.',
  },
  {
    value: 'history',
    label: 'History Of',
    description: 'Tells the story of a product, brand or practice in order, with a timeline of key milestones.',
    intent: 'informational',
    requiredBlocks: ['timeline'],
    structure:
      'Tell the history in chronological sections (origins, key developments, modern day, what comes next). ' +
      'Include a timeline block with 5-8 dated milestones taken from the research; never invent dates. ' +
      'Close by connecting the history to what buyers should know today.',
    productUse: 'Keep the history free of product promotion; feature products only in the modern-day and closing sections, as today\'s options.',
  },
  {
    value: 'pros-cons',
    label: 'Pros and Cons',
    description: 'Weighs the advantages and drawbacks of one option, with a balanced pros/cons block and who it is right for.',
    intent: 'informational',
    requiredBlocks: ['pros_cons', 'decision_guide'],
    structure:
      'Explain what the option is, then give the advantages and the drawbacks their own H2s with real specifics and figures, ' +
      'a pros_cons block summarizing both, and a decision_guide on who should and should not choose it. Stay balanced; one-sided articles lose trust.',
    productUse:
      'Feature products that are examples of the option being weighed, in the "who it is right for" part; link an alternative product in the decision_guide for readers it does not suit.',
  },
  {
    value: 'comparisons',
    label: 'Comparisons',
    description: 'Compares several options side by side on the criteria buyers care about, with a table and recommendations.',
    intent: 'comparison',
    requiredBlocks: ['comparison_table', 'decision_guide'],
    structure:
      'Compare the main options on the criteria that matter to a buyer (cost, performance, size, maintenance, and so on), one H2 per criterion or per option. ' +
      'Include a comparison_table with one column per option and a verdict, and a decision_guide matching each kind of buyer to the right option.',
    productUse:
      'Match one product to each option compared where the list has one, and link it from that option\'s decision_guide entry and section.',
  },
  {
    value: 'how-to',
    label: "How To's",
    description: 'Step-by-step instructions with what you need first, numbered steps, common mistakes and troubleshooting.',
    intent: 'how_to',
    requiredBlocks: ['steps', 'checklist'],
    structure:
      'Start with a short section on what is needed (a checklist of tools, parts or materials, plus time and skill level). ' +
      'Then a steps block with every step in order, each with a short action title and the detail to do it. ' +
      'Follow with common mistakes (a callout with variant mistake), troubleshooting, and when to call a professional or which parts to buy, linking products where relevant. Include any safety warnings before the step they apply to.',
    productUse:
      'Link the supplies, tools and parts the reader needs in the checklist and in the step that uses them, with a product_cards block of those supplies. Equipment products belong only in a section on replacing or upgrading.',
  },
  {
    value: 'versus',
    label: 'Versus (Brand A Vs. Brand B)',
    description: 'Puts exactly two options head to head: a side-by-side table, a round-by-round comparison and a verdict.',
    intent: 'comparison',
    requiredBlocks: ['comparison_table', 'decision_guide'],
    structure:
      'Compare exactly two options head to head on the 5-8 criteria that matter most to a buyer. Use H2s like "A vs B: <criterion>", stating the winner of each. ' +
      'Include a comparison_table whose columns are exactly: Feature, A, B (using their real names), a verdict, and a decision_guide ("Choose A if ...", "Choose B if ..."). ' +
      'Be fair to both; name a clear overall winner for each type of buyer.',
    productUse:
      'Feature products from both sides equally: each side\'s products in its sections and linked from its "Choose ... if" entry, and a product_cards block with the best of each.',
  },
];

export const CONTENT_TYPE_OPTIONS = CONTENT_BLUEPRINTS.map(({ value, label }) => ({ value, label }));

export function blueprintFor(contentType: string | undefined | null): ContentBlueprint {
  return CONTENT_BLUEPRINTS.find((b) => b.value === contentType) ?? CONTENT_BLUEPRINTS[0];
}

/**
 * The two sides of a versus article: what the user entered, else "A vs B" in the
 * keyword, else none, in which case the writer picks the two leading options.
 */
export function comparisonSubjects(keyword: string, given?: unknown): [string, string] | null {
  if (Array.isArray(given)) {
    const [a, b] = given.map((s) => (typeof s === 'string' ? s.trim() : ''));
    if (a && b) return [a.slice(0, 80), b.slice(0, 80)];
  }
  const parts = keyword.split(/\s+(?:vs\.?|versus)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1].replace(/[?:].*$/, '').trim()] as [string, string];
}
