/**
 * Writes an Enhanced article in one Claude call.
 *
 * The model plans and writes together, returning the article through a forced tool call
 * whose schema is the article structure. Planning in the same call keeps blocks tied to
 * the section they illustrate; the forced tool means the reply is always parseable data
 * rather than HTML that has to be repaired.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { blueprintFor } from './blueprints';
import { buildVoiceInstructions, measureVoice, voiceProblems } from './tones';
import {
  BLOCK_TYPES,
  type ArticleBlockData,
  type BlockType,
  type CatalogProduct,
  type EnhancedArticle,
  type LinkTarget,
  type ResearchResult,
  type ResearchSource,
  type SearchIntent,
} from './types';

const MAX_WRITE_ATTEMPTS = 3;

const INTENTS: SearchIntent[] = ['informational', 'how_to', 'comparison', 'buyers_guide', 'product_focused'];

export const WORD_TARGETS: Record<SearchIntent, [number, number]> = {
  informational: [1200, 1800],
  how_to: [1000, 1600],
  comparison: [1500, 2200],
  buyers_guide: [1800, 2500],
  product_focused: [900, 1400],
};

const str = { type: 'string' } as const;
const strList = { type: 'array', items: str } as const;

const SECTION_BLOCK_TYPES = BLOCK_TYPES.filter((type) => type !== 'quiz');

const QUIZ_QUESTIONS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      question: str,
      options: strList,
      answerIndex: { type: 'integer', description: 'Zero-based index of the correct option.' },
      explanation: { type: 'string', description: 'One or two sentences on why that answer is right.' },
    },
    required: ['question', 'options', 'answerIndex', 'explanation'],
  },
};

const BLOCK_SCHEMA = {
  type: 'object',
  description:
    'A visual block shown after the section text. Fill only the fields for its type: ' +
    'decision_guide → title, options; comparison_table → title, columns, rows, verdict; ' +
    'pros_cons → title, pros, cons; steps → title, steps; checklist → title, items; stats → title, stats; ' +
    'callout → variant, text (title optional); product_cards → title, productHandles; chart → title, chartItems, unit; ' +
    'timeline → title, events.',
  properties: {
    type: { type: 'string', enum: SECTION_BLOCK_TYPES },
    title: str,
    options: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          condition: { type: 'string', description: 'Completes "If ...", e.g. "you serve under 100 covers a day".' },
          recommendation: str,
          url: { type: 'string', description: 'Optional. Only a URL from the allowed link list.' },
        },
        required: ['condition', 'recommendation'],
      },
    },
    columns: { ...strList, description: 'Header row. The first column labels each row.' },
    rows: { type: 'array', items: strList, description: 'One array per row, same length as columns.' },
    verdict: str,
    pros: strList,
    cons: strList,
    steps: {
      type: 'array',
      items: { type: 'object', properties: { title: str, detail: str }, required: ['title', 'detail'] },
    },
    items: strList,
    stats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          value: { type: 'string', description: 'Short, e.g. "40%" or "8-10 years".' },
          label: str,
          sourceIndex: { type: 'integer', description: 'Number of the source that states this figure.' },
        },
        required: ['value', 'label'],
      },
    },
    variant: { type: 'string', enum: ['tip', 'mistake', 'insight'] },
    text: str,
    productHandles: { ...strList, description: '2-4 handles from the product list, exactly as given.' },
    chartItems: {
      type: 'array',
      items: { type: 'object', properties: { label: str, value: { type: 'number' } }, required: ['label', 'value'] },
    },
    unit: str,
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: { date: { type: 'string', description: 'A year, date or era from the research.' }, title: str, detail: str },
        required: ['date', 'title', 'detail'],
      },
    },
  },
  required: ['type'],
};

export const ARTICLE_TOOL = {
  name: 'publish_article',
  description: 'Publish the finished article.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: { type: 'string', enum: INTENTS },
      title: { type: 'string', description: 'The H1. Contains the keyword naturally. Under 70 characters.' },
      metaTitle: { type: 'string', description: '50-60 characters, keyword near the start.' },
      metaDescription: { type: 'string', description: '140-155 characters, a benefit and a reason to click.' },
      quickAnswer: { type: 'string', description: '40-60 words (two or three sentences) that directly answer the search. Plain text.' },
      keyTakeaways: { ...strList, description: '4-6 one-sentence takeaways.' },
      introHtml: { type: 'string', description: '1-2 short <p> paragraphs.' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string', description: 'The H2 text, ideally phrased the way people search.' },
            html: { type: 'string', description: 'Body HTML using only p, ul, ol, li, h3, strong, em and a.' },
            block: BLOCK_SCHEMA,
          },
          required: ['heading', 'html'],
        },
      },
      quiz: {
        type: 'object',
        description: '3-4 questions testing what this article teaches. Shown in the middle of the article.',
        properties: { title: str, questions: QUIZ_QUESTIONS },
        required: ['title', 'questions'],
      },
      faq: {
        type: 'array',
        items: {
          type: 'object',
          properties: { question: str, answer: { type: 'string', description: '2-4 sentences, plain text.' } },
          required: ['question', 'answer'],
        },
      },
      conclusionHeading: str,
      conclusionHtml: { type: 'string', description: '1-2 <p> paragraphs ending with a call to action.' },
      tags: { ...strList, description: '3-6 short topic tags.' },
      sourcesUsed: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the sources you relied on.' },
    },
    required: [
      'intent', 'title', 'metaTitle', 'metaDescription', 'quickAnswer', 'keyTakeaways', 'introHtml',
      'sections', 'quiz', 'faq', 'conclusionHeading', 'conclusionHtml', 'tags', 'sourcesUsed',
    ],
  },
};

export interface WriterInput {
  keyword: string;
  brandName: string;
  businessType: string;
  toneOfVoice?: string;
  instructions?: string;
  brandGuidelines?: string;
  research: ResearchResult;
  products: CatalogProduct[];
  links: LinkTarget[];
  /** Numbered from 1 in this order. Empty when the brand has citations off. */
  sources: ResearchSource[];
  /** Brand-specific product rules, such as the vendor restriction. */
  productRules?: string;
  /** A content type slug; sets the intent, required blocks and structure. */
  contentType?: string;
  /** The two sides of a versus article, when known. */
  subjects?: [string, string] | null;
}

/** Blocks this article must have: the content type's, less any it has nothing to fill with. */
export function requiredBlocksFor(input: Pick<WriterInput, 'contentType' | 'products'>): BlockType[] {
  return blueprintFor(input.contentType).requiredBlocks.filter(
    (type) => type !== 'product_cards' || input.products.length > 0
  );
}

export function missingBlocks(article: EnhancedArticle, required: BlockType[]): BlockType[] {
  const present = new Set(article.sections.map((s) => s.block?.type).filter(Boolean));
  return required.filter((type) => !present.has(type));
}

export function buildSystemPrompt(brandName: string, toneOfVoice?: string): string {
  const targets = INTENTS.map((intent) => `${intent} ${WORD_TARGETS[intent][0]}-${WORD_TARGETS[intent][1]}`).join(', ');
  const today = new Date();
  return `You are a senior content strategist and writer for ${brandName}. You write articles that rank in search, get quoted by AI answer engines, and genuinely help the reader decide or act.

Today is ${today.toISOString().slice(0, 10)}. Never put a year in the title (it dates the article); the meta title may include ${today.getUTCFullYear()} when the topic changes year to year, and never any other year.

How you work:
1. Decide the search intent of the keyword: ${INTENTS.join(', ')}.
2. Plan sections that cover what a reader with that intent needs, in the order they need it. Use the research questions to shape H2s; phrase H2s the way people search where it reads naturally.
3. Write, then return everything through the publish_article tool.

Writing standards:
- Answer first. The quick answer resolves the search in 40-60 words; each section opens with its direct answer, then explains.
- Total length by intent (sections, intro and conclusion): ${targets} words. Never pad.
- Short paragraphs (2-4 sentences), concrete specifics, examples and numbers over generalities. Use the keyword in the title, the quick answer, the intro and at least one H2, then write naturally; never stuff it.
- Use facts from the research. Do not invent statistics, prices, model numbers, standards or dates; if a figure is not in the research and you are not certain of it, describe it qualitatively.
- Write for people: no filler, no "in today's fast-paced world", no "in conclusion", no mention of being an AI, no notes to the editor.
- Never name or recommend competing retailers or stores.
- The conclusion ends with a clear, specific call to action for ${brandName}.

${buildVoiceInstructions(toneOfVoice)}
If the brand guidelines describe their own voice or terminology, follow their terminology and rules; this voice sets the register.

Visual blocks (attach to the section they belong to):
- When the request lists required section blocks, every one of them must appear, in the section it belongs to. This overrides every other block rule.
- Use 3-5 section blocks in total, never in adjacent sections unless the article is long, and only where they add something the prose cannot.
- Always write the quiz field: 3-4 questions that test understanding of this article, each with 3-4 options and one correct answer. It is placed for you in the middle of the article.
- comparison intent: include a comparison_table. how_to: include steps. buyers_guide: include a decision_guide or a checklist.
- product_cards only use handles from the product list, 2-4 per block, in the section where those products are discussed.
- Pick products for what they are (their type and description), not just their names, and only ones that genuinely fit the point being made. Never recommend or card a product marked OUT OF STOCK.
- stats only use figures from the research, each with the number of its source when one is listed.
- chart only for genuinely numeric comparisons from the research.

Links:
- Link only to URLs from the product and link lists, exactly as written. Never invent or modify a URL.
- Link product names naturally in the prose the first time they are mentioned; link each URL at most once.
- No external links in the prose; sources are listed separately.

HTML in html fields: only p, ul, ol, li, h3, strong, em and a href. No styles, classes, h1, h2, tables, images or markdown.`;
}

/** The article's running prose, which is what a tone is judged on. */
export function proseText(article: EnhancedArticle): string {
  return [
    article.quickAnswer,
    article.introHtml,
    ...article.sections.map((s) => s.html),
    ...article.faq.map((f) => f.answer),
    article.conclusionHtml,
  ].join(' ');
}

export function productLine(p: CatalogProduct): string {
  const stock = p.inStock === true ? 'in stock' : p.inStock === false ? 'OUT OF STOCK' : 'stock unknown';
  const fields = [p.handle, p.title, p.price ? `$${p.price}` : '-', p.productType || '-', p.vendor || '-', stock, p.url];
  return `- ${fields.join(' | ')}${p.description ? `\n  ${p.description}` : ''}`;
}

function numbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

export function buildUserPrompt(input: WriterInput): string {
  const { research } = input;
  const parts: string[] = [`Keyword: ${input.keyword}`, `Brand: ${input.brandName} (${input.businessType})`];

  const blueprint = blueprintFor(input.contentType);
  const required = requiredBlocksFor(input);
  parts.push(
    `Content type: ${blueprint.label}${blueprint.intent ? ` (intent: ${blueprint.intent})` : ''}\n` +
      `Structure: ${blueprint.structure}` +
      (required.length
        ? `\nRequired section blocks: ${required.join(', ')}. Each section holds at most one block, so put each in a different section.`
        : '')
  );
  if (blueprint.value === 'versus') {
    parts.push(
      input.subjects
        ? `The two sides: "${input.subjects[0]}" vs "${input.subjects[1]}".`
        : 'Identify the two options this keyword compares, or the two leading options for it, and compare those.'
    );
  }

  if (input.brandGuidelines?.trim()) parts.push(`Brand guidelines:\n${input.brandGuidelines.trim()}`);
  if (input.instructions?.trim()) parts.push(`Additional instructions from the brand:\n${input.instructions.trim()}`);

  if (research.brief) parts.push(`Research brief:\n${research.brief}`);
  if (research.facts.length) {
    parts.push(`Researched facts:\n${research.facts.map((f) => `- ${f.claim}`).join('\n')}`);
  } else {
    parts.push('No web research was available for this article. Be conservative with specific figures.');
  }
  if (research.questions.length) {
    parts.push(`Questions people ask (use for H2s and the FAQ; FAQ has 4-6 of these, answered):\n${research.questions.map((q) => `- ${q}`).join('\n')}`);
  } else {
    parts.push('Write a 4-6 question FAQ covering what people commonly ask about this topic.');
  }

  if (input.products.length) {
    parts.push(
      `Products you may link to and show as cards (handle | title | price | type | brand | stock | url, then its description):\n${input.products
        .map(productLine)
        .join('\n')}\nHow to use the products in this article: ${blueprint.productUse}`
    );
  } else {
    parts.push('There are no products to feature; do not use product_cards.');
  }
  if (input.productRules?.trim()) parts.push(input.productRules.trim());

  if (input.links.length) {
    parts.push(
      `Other pages you may link to (title | url). Link the most relevant collections, service pages and related articles ` +
        `where they help the reader, with descriptive anchor text (never "click here"):\n${input.links.map((l) => `- ${l.title} | ${l.url}`).join('\n')}`
    );
  }

  if (input.sources.length) {
    parts.push(
      `Numbered sources (cite by number in sourcesUsed and stats.sourceIndex; list only those you actually relied on):\n${numbered(
        input.sources.map((s) => `${s.title} - ${s.url}`)
      )}`
    );
  } else {
    parts.push('Sources are not shown on this brand\'s articles: return an empty sourcesUsed and omit sourceIndex.');
  }

  return parts.join('\n\n');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Tool input sometimes arrives with a nested array or object serialized as a JSON
 * string instead of the value itself, which would otherwise read as empty.
 */
function unwrap(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asArray(value: unknown): unknown[] {
  const unwrapped = unwrap(value);
  return Array.isArray(unwrapped) ? unwrapped : [];
}

function asObject(value: unknown): Record<string, unknown> {
  const unwrapped = unwrap(value);
  return unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
    ? (unwrapped as Record<string, unknown>)
    : {};
}

function asStrings(value: unknown): string[] {
  return asArray(value).map(asString).filter(Boolean);
}

function asBlock(value: unknown): ArticleBlockData | undefined {
  const block = asObject(value);
  if (!(BLOCK_TYPES as readonly string[]).includes(block.type as string)) return undefined;
  const fields: Record<string, unknown> = { ...block };
  for (const key of ['questions', 'options', 'columns', 'rows', 'pros', 'cons', 'steps', 'items', 'stats', 'productHandles', 'chartItems', 'events']) {
    if (key in fields) fields[key] = asArray(fields[key]);
  }
  return fields as unknown as ArticleBlockData;
}

/** Coerces the tool input into an article, or throws if it is unusable. */
export function normalizeArticle(raw: unknown, sourceCount: number): EnhancedArticle {
  const input = asObject(raw);
  const quizInput = asObject(input.quiz);
  const quiz = asArray(quizInput.questions).length
    ? asBlock({ ...quizInput, type: 'quiz' }) ?? null
    : null;
  const sections = asArray(input.sections)
    .map((s) => {
      const section = asObject(s);
      const block = asBlock(section.block);
      return {
        heading: asString(section.heading),
        html: asString(section.html),
        // A quiz field wins over a quiz block, so an article never gets two.
        block: block?.type === 'quiz' && quiz ? undefined : block,
      };
    })
    .filter((s) => s.heading && s.html);

  const article: EnhancedArticle = {
    intent: INTENTS.includes(input.intent as SearchIntent) ? (input.intent as SearchIntent) : 'informational',
    title: asString(input.title),
    metaTitle: asString(input.metaTitle),
    metaDescription: asString(input.metaDescription),
    quickAnswer: asString(input.quickAnswer),
    keyTakeaways: asStrings(input.keyTakeaways).slice(0, 6),
    introHtml: asString(input.introHtml),
    sections,
    quiz,
    faq: asArray(input.faq)
      .map((f) => {
        const item = asObject(f);
        return { question: asString(item.question), answer: asString(item.answer) };
      })
      .filter((f) => f.question && f.answer)
      .slice(0, 8),
    conclusionHeading: asString(input.conclusionHeading),
    conclusionHtml: asString(input.conclusionHtml),
    tags: asStrings(input.tags).slice(0, 8),
    sourcesUsed: asArray(input.sourcesUsed)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= sourceCount),
  };

  if (!article.title) throw new Error('The writer returned no title');
  if (article.sections.length < 3) {
    const raw = input.sections;
    const shape = typeof raw === 'string' ? `a string starting ${JSON.stringify(raw.slice(0, 120))}` : Array.isArray(raw) ? `an array of ${raw.length} with keys ${JSON.stringify(raw.slice(0, 2).map((s) => Object.keys(asObject(s))))}` : typeof raw;
    throw new Error(
      `The writer returned ${article.sections.length} usable sections (sections was ${shape}; reply keys ${JSON.stringify(Object.keys(input))})`
    );
  }
  return article;
}

export async function writeEnhancedArticle(
  anthropic: Anthropic,
  input: WriterInput,
  log: (message: string) => void = console.log
): Promise<EnhancedArticle> {
  const required = requiredBlocksFor(input);
  let correction = '';
  let reasked = false;

  const write = async (): Promise<EnhancedArticle> => {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(input.brandName, input.toneOfVoice),
      tools: [ARTICLE_TOOL],
      tool_choice: { type: 'tool', name: ARTICLE_TOOL.name },
      messages: [{ role: 'user', content: buildUserPrompt(input) + correction }],
    });

    if (message.stop_reason === 'max_tokens') throw new Error('The article was cut off before it finished');
    const call = message.content.find((part) => part.type === 'tool_use');
    if (!call || call.type !== 'tool_use') throw new Error('The writer did not return an article');
    return normalizeArticle(call.input, input.sources.length);
  };

  log('✍️ Writing Enhanced article (structured)...');
  let article: EnhancedArticle | null = null;
  for (let attempt = 1; !article; attempt += 1) {
    try {
      const draft = await write();
      const missing = missingBlocks(draft, required);
      const problems = [
        ...(missing.length ? [`It left out these required section blocks: ${missing.join(', ')}. Include each of them.`] : []),
        ...(draft.introHtml.replace(/<[^>]+>/g, '').trim() ? [] : ['The introduction was empty. Write it.']),
        ...voiceProblems(input.toneOfVoice, measureVoice(proseText(draft))),
      ];
      // One rewrite at most; a draft with problems is still kept after that: an article
      // without its table is better than no article.
      if (problems.length && !reasked && attempt < MAX_WRITE_ATTEMPTS) {
        reasked = true;
        log(`⚠️ Draft needs another pass (${problems.join(' ')}); writing again`);
        correction = `\n\nYour previous draft had these problems:\n${problems.map((p) => `- ${p}`).join('\n')}`;
        continue;
      }
      article = draft;
    } catch (error) {
      // An unusable reply is usually a one-off in how the model filled the schema.
      if (attempt >= MAX_WRITE_ATTEMPTS) throw error;
      log(`⚠️ ${error instanceof Error ? error.message : String(error)}; writing again`);
    }
  }

  const blocks = article.sections.filter((s) => s.block).map((s) => s.block!.type);
  log(`✍️ Intent: ${article.intent}; ${article.sections.length} sections; blocks: ${blocks.join(', ') || 'none'}; quiz ${article.quiz ? 'yes' : 'no'}; FAQ ${article.faq.length}`);
  const voice = measureVoice(proseText(article));
  log(
    `🗣️ Voice (${input.toneOfVoice || 'Default'}): ${voice.averageSentenceWords} words per sentence, ` +
      `${voice.contractionsPer100} contractions and ${voice.youPer100} "you" per 100 words, ` +
      `${voice.questions} questions, ${voice.exclamations} exclamations`
  );
  return article;
}
