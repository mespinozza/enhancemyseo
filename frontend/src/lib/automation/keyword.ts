/**
 * Turning a topic into the keyword an article is actually written about.
 *
 * A topic list is a list of subjects, not search phrases, and rotating it verbatim means
 * the second lap writes the same article again. Asking the model for a buyer-intent
 * keyword per topic, while telling it what has already been written, lets the same short
 * list keep producing new angles.
 *
 * The parsing is deliberately strict and separate from the API call. A model asked for
 * "the keyword only" will still occasionally reply with quotes, a numbered list, or a
 * sentence explaining itself, and a bad keyword is worse than no feature at all: it
 * becomes the article's SEO target. Anything that does not look like a keyword is
 * discarded in favour of the topic, which is exactly the old behaviour.
 */
import Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { textFromMessage } from '@/lib/ai/text';

/** Long enough for "best patio heaters for small covered patios", short enough to exclude prose. */
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORD_WORDS = 12;

/** Enough context to avoid repeats without turning the prompt into a phone book. */
const MAX_EXCLUSIONS = 40;

/** Model calls per topic before giving up on finding an angle nobody has written. */
const MAX_DERIVE_ATTEMPTS = 3;

/**
 * Case, punctuation and spacing removed, so "Gas vs. Electric Patio Heaters" and
 * "gas vs electric patio heaters" count as the same keyword.
 */
export function looseKeywordKey(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function significantWords(text: string): Set<string> {
  return new Set(looseKeywordKey(text).split(' ').filter((word) => word.length > 2));
}

/**
 * The covered keywords most likely to be confused with this topic, most similar first.
 * A brand can have hundreds, and the model only sees MAX_EXCLUSIONS of them, so which
 * ones it sees decides whether it can avoid a repeat at all.
 */
export function relevantExclusions(topic: string, exclusions: Iterable<string>, max = MAX_EXCLUSIONS): string[] {
  const topicWords = significantWords(topic);
  return Array.from(exclusions)
    .map((keyword) => {
      let shared = 0;
      for (const word of significantWords(keyword)) if (topicWords.has(word)) shared += 1;
      return { keyword, shared };
    })
    .filter((entry) => entry.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, max)
    .map((entry) => entry.keyword);
}

export interface DerivedKeyword {
  keyword: string;
  /** False when the topic was used verbatim, either by choice or because parsing failed. */
  derived: boolean;
  /** Why it fell back, for the run history. Absent on success. */
  note?: string;
}

export interface DeriveKeywordInput {
  topic: string;
  brandName: string;
  businessType?: string;
  /** Keywords already written for this brand, lowercased. */
  exclusions?: Set<string>;
}

export function buildKeywordPrompt(input: DeriveKeywordInput): string {
  const { topic, brandName, businessType, exclusions } = input;

  const avoid = Array.from(exclusions ?? []).slice(0, MAX_EXCLUSIONS);
  const avoidBlock = avoid.length
    ? `\n\nThese keywords already have articles. Do not repeat them or produce a close ` +
      `variation of one:\n${avoid.map((keyword) => `- ${keyword}`).join('\n')}`
    : '';

  const business = businessType ? ` (${businessType})` : '';

  return (
    `Based on the following topic, generate an article keyword that focuses the product ` +
    `type while driving and solving buyer intent.\n\n` +
    `Topic: ${topic}\n` +
    `Brand: ${brandName}${business}${avoidBlock}\n\n` +
    `Rules:\n` +
    `- Reply with the article keyword ONLY. No quotes, no punctuation at the end, no explanation.\n` +
    `- Keep it under ${MAX_KEYWORD_WORDS} words, the way someone would type it into Google.\n` +
    `- Stay on the product type in the topic.`
  );
}

/**
 * The keyword in a model reply, or empty if the reply does not contain one.
 *
 * Exported for tests: this is where the feature is most likely to misbehave, and it runs
 * without a network.
 */
export function parseKeywordReply(reply: string): string {
  const firstLine = (reply || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return '';

  const cleaned = firstLine
    // Emphasis first: the bullet rule below would otherwise eat the opening asterisk of
    // `**bold**` and leave the closing pair behind.
    .replace(/^\*\*(.*)\*\*$/, '$1')
    // Numbered or bulleted single-item lists.
    .replace(/^[-*\u2022]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    // A label the model added despite being told not to.
    .replace(/^(?:article\s+)?keyword\s*:\s*/i, '')
    // Surrounding quotes, straight or curly.
    .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, '')
    // Trailing sentence punctuation.
    .replace(/[.!,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length > MAX_KEYWORD_LENGTH) return '';
  if (cleaned.split(' ').length > MAX_KEYWORD_WORDS) return '';

  return cleaned;
}

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

/**
 * Never throws. A keyword this step cannot produce is not worth failing a run over, so
 * failure paths fall back to the topic and say why. The one exception is a topic that
 * already has an article: writing it again is the duplicate this step exists to prevent,
 * so the keyword comes back empty and the caller moves on to another topic.
 */
export async function deriveKeyword(input: DeriveKeywordInput): Promise<DerivedKeyword> {
  const topic = input.topic.trim();
  if (!topic) return { keyword: '', derived: false, note: 'empty topic' };

  const taken = new Set(Array.from(input.exclusions ?? []).map(looseKeywordKey));
  const isTaken = (keyword: string) => taken.has(looseKeywordKey(keyword));

  const fallBack = (note: string): DerivedKeyword =>
    isTaken(topic)
      ? { keyword: '', derived: false, note: `${note}, and the topic itself already has an article` }
      : { keyword: topic, derived: false, note };

  // Suggestions the model already made that turned out to be taken. Listed first so they
  // are never crowded out of the prompt by the similarity cut.
  const rejected: string[] = [];

  for (let attempt = 0; attempt < MAX_DERIVE_ATTEMPTS; attempt += 1) {
    let reply: string;
    try {
      const exclusions = new Set([
        ...rejected,
        ...relevantExclusions(topic, input.exclusions ?? [], MAX_EXCLUSIONS - rejected.length),
      ]);
      const message = await anthropic().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 100,
        messages: [{ role: 'user', content: buildKeywordPrompt({ ...input, topic, exclusions }) }],
      });
      reply = textFromMessage(message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fallBack(`keyword step failed (${detail})`);
    }

    const keyword = parseKeywordReply(reply);
    if (!keyword) return fallBack('the reply was not a usable keyword');

    if (!isTaken(keyword)) return { keyword, derived: true };
    rejected.push(keyword.toLowerCase());
  }

  return fallBack(`every keyword suggested (${rejected.length}) already has an article`);
}
