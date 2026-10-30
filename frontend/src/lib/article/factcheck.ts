/**
 * Fact-checks article HTML with Claude and live web search.
 *
 * The article is split into numbered text units (paragraphs, list items, cells), and
 * Claude reports each problem as an exact quote from one unit plus a drop-in
 * correction. Fixing then means swapping one quoted phrase inside one known element,
 * rather than guessing from free-text feedback which sentence was meant.
 *
 * Server-only. Never throws: `unavailable` tells the caller nothing was checked.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/ai/models';

export interface FactCheckUnit {
  id: string;
  /** The full element exactly as it appears in the article. */
  html: string;
  text: string;
}

export interface QuotedIssue {
  unitId: string;
  quote: string;
  problem: string;
  correction: string;
  source?: string;
}

export interface ClaudeFactCheck {
  issues: QuotedIssue[];
  unavailable: boolean;
  searches: number;
}

const MAX_ISSUES = 8;
const MAX_SEARCHES = 5;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The innermost text elements, in order. A list item that wraps a paragraph yields the
 * paragraph only, so no text is checked (or fixed) twice.
 */
export function buildUnits(html: string): FactCheckUnit[] {
  const units: FactCheckUnit[] = [];
  const pattern = /<(p|li|td|th|summary|h3|h4)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (/<(p|li)\b/i.test(match[2])) {
      pattern.lastIndex = match.index + match[0].indexOf('>') + 1;
      continue;
    }
    const text = plainText(match[2]);
    if (text.split(' ').length < 4) continue;
    units.push({ id: `u${units.length + 1}`, html: match[0], text });
  }
  return units;
}

export function buildFactCheckPrompt(units: FactCheckUnit[], today = new Date()): string {
  return `Today is ${today.toISOString().slice(0, 10)}. Fact-check this article using web search.

Check only specific, verifiable claims: figures, prices, percentages, measurements, specifications, model details, standards, regulations, health or safety statements, dates and named facts. Ignore opinions, advice, brand voice and general knowledge. Search to verify anything you are not certain of; prefer manufacturers, government, standards bodies, universities and industry associations.

Report only claims that are wrong or clearly unsupported. For each:
- unit: the unit id
- quote: the exact words from that unit's text (copy precisely, as short as possible but long enough to be unique, usually 3-15 words)
- problem: one sentence
- correction: replacement text for the quote that keeps the sentence grammatical. If the correct figure cannot be confirmed, make the wording more general instead of inventing a new figure.
- source: URL supporting the correction, if any

Reply with JSON only: {"issues": [...]} with at most ${MAX_ISSUES} issues, or {"issues": []} if everything checks out.

ARTICLE UNITS:
${units.map((u) => `[${u.id}] ${u.text}`).join('\n')}`;
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  for (const candidate of [trimmed, trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return null;
}

/** Issues from the reply that point at a real unit and quote it exactly. */
export function parseFactCheckReply(text: string, units: FactCheckUnit[]): QuotedIssue[] | null {
  const parsed = parseJson(text) as { issues?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.issues)) return null;
  const byId = new Map(units.map((u) => [u.id, u]));
  const issues: QuotedIssue[] = [];
  for (const raw of parsed.issues as Record<string, unknown>[]) {
    const unit = byId.get(String(raw?.unit ?? ''));
    const quote = typeof raw?.quote === 'string' ? raw.quote.trim() : '';
    const correction = typeof raw?.correction === 'string' ? raw.correction.trim() : '';
    if (!unit || !quote || !correction || quote === correction) continue;
    if (!unit.text.includes(quote)) continue;
    issues.push({
      unitId: unit.id,
      quote,
      problem: typeof raw.problem === 'string' ? raw.problem.trim() : 'Inaccurate claim',
      correction,
      source: typeof raw.source === 'string' && /^https?:\/\//.test(raw.source) ? raw.source : undefined,
    });
    if (issues.length >= MAX_ISSUES) break;
  }
  return issues;
}

/**
 * Swaps the quoted phrase for its correction inside the unit's element. Returns null
 * when the phrase is split by markup (a link or bold mid-quote), which the caller hands
 * to the element rewriter instead.
 */
export function applyQuotedFix(
  html: string,
  unit: FactCheckUnit,
  issue: QuotedIssue
): { html: string; unitHtml: string } | null {
  if (!html.includes(unit.html)) return null;
  for (const form of [issue.quote, escapeText(issue.quote)]) {
    if (unit.html.includes(form)) {
      const unitHtml = unit.html.replace(form, escapeText(issue.correction));
      return { html: html.replace(unit.html, unitHtml), unitHtml };
    }
  }
  return null;
}

export async function factCheckWithClaude(
  anthropic: Anthropic,
  html: string,
  log: (message: string) => void = console.log
): Promise<ClaudeFactCheck & { units: FactCheckUnit[] }> {
  const units = buildUnits(html);
  if (units.length === 0) return { issues: [], unavailable: false, searches: 0, units };

  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      system: 'You are a meticulous fact-checker. You verify claims against current, authoritative sources and report only real errors.',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES }],
      messages: [{ role: 'user', content: buildFactCheckPrompt(units) }],
    });

    const text = message.content
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('');
    const searches = message.usage?.server_tool_use?.web_search_requests ?? 0;
    const issues = parseFactCheckReply(text, units);
    if (!issues) {
      log(`⚠️ FACT-CHECK: Claude reply was not usable JSON (${text.slice(0, 120)})`);
      return { issues: [], unavailable: true, searches, units };
    }
    return { issues, unavailable: false, searches, units };
  } catch (error) {
    log(`⚠️ FACT-CHECK: Claude web search failed: ${error instanceof Error ? error.message : String(error)}`);
    return { issues: [], unavailable: true, searches: 0, units };
  }
}
