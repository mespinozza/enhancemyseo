/**
 * Shared single-element rewrite primitives.
 *
 * These guards were built for the fact-check loop in the article generator and are
 * reused verbatim by the interactive editor, so both paths reject the same failure
 * modes (Claude replying conversationally, wrapping output in code fences, emitting
 * markdown, or returning a fragment instead of a complete element).
 *
 * Server-safe: no DOM access.
 */

export const AI_REFUSAL_PATTERNS: RegExp[] = [
  /^I cannot/i,
  /^I'm unable/i,
  /^I am unable/i,
  /^I don't have/i,
  /^I need more/i,
  /^The original HTML/i,
  /^Here(?:'s| is) the/i,
  /^Sure[,!]/i,
  /^Certainly[,!]/i,
  /^(?:To|In order to) (?:help|provide|rewrite)/i,
  /is not actually content/i,
  /please provide/i,
  /more information is needed/i,
];

export function stripCodeFences(content: string): string {
  return content
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function detectPrimaryTag(html: string): string {
  const match = html.trim().match(/^<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/);
  return match ? match[1].toLowerCase() : 'p';
}

export function ensureCompleteElement(content: string, expectedTag: string): string {
  const trimmed = content.trim();
  const openTag = `<${expectedTag}`;
  const closeTag = `</${expectedTag}>`;

  if (
    trimmed.toLowerCase().startsWith(openTag.toLowerCase()) &&
    trimmed.toLowerCase().endsWith(closeTag.toLowerCase())
  ) {
    return trimmed;
  }

  // Started with some other element - the model made a deliberate choice.
  if (trimmed.startsWith('<') && /^<[a-z]/i.test(trimmed)) {
    return trimmed;
  }

  return `<${expectedTag}>${trimmed}</${expectedTag}>`;
}

export function ensureHTMLFormat(content: string, originalContent: string): string {
  let result = stripCodeFences(content);

  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  result = result.replace(/(?<![*_])\*([^*]+)\*(?![*_])/g, '<em>$1</em>');
  result = result.replace(/(?<![*_])_([^_]+)_(?![*_])/g, '<em>$1</em>');

  result = result.replace(/^######\s*(.+)$/gm, '<h6>$1</h6>');
  result = result.replace(/^#####\s*(.+)$/gm, '<h5>$1</h5>');
  result = result.replace(/^####\s*(.+)$/gm, '<h4>$1</h4>');
  result = result.replace(/^###\s*(.+)$/gm, '<h3>$1</h3>');
  result = result.replace(/^##\s*(.+)$/gm, '<h2>$1</h2>');
  result = result.replace(/^#\s*(.+)$/gm, '<h1>$1</h1>');
  result = result.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  const originalStartTag = originalContent.match(/^<([a-z][a-z0-9]*)\b/i)?.[1];
  const resultStartTag = result.match(/^<([a-z][a-z0-9]*)\b/i)?.[1];

  if (originalStartTag && !resultStartTag && originalContent.includes(`</${originalStartTag}>`)) {
    result = `<${originalStartTag}>${result}</${originalStartTag}>`;
  }

  result = result.replace(/<p>\s*<p>/g, '<p>');
  result = result.replace(/<\/p>\s*<\/p>/g, '</p>');

  return result;
}

/**
 * Server-side XSS hardening. DOMPurify needs a DOM, so API routes use this and the
 * client sanitizes properly before the result is rendered or persisted.
 */
export function hardenHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|form|link|meta|base)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

export interface EditPreset {
  id: string;
  label: string;
  description: string;
  instruction: string;
}

export const EDIT_PRESETS: EditPreset[] = [
  {
    id: 'shorten',
    label: 'Shorten',
    description: 'Tighten the wording without losing meaning',
    instruction: 'Make this noticeably more concise while preserving every factual point and all existing links.',
  },
  {
    id: 'expand',
    label: 'Expand',
    description: 'Add depth and detail',
    instruction: 'Expand this with more useful specifics and practical detail, without inventing statistics, part numbers, or specifications.',
  },
  {
    id: 'technical',
    label: 'More technical',
    description: 'Aim at an expert reader',
    instruction: 'Rewrite this for a more technical, experienced audience. Use precise terminology but do not invent specifications or figures.',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    description: 'Plainer language',
    instruction: 'Rewrite this in plainer, more approachable language while keeping all technical accuracy intact.',
  },
  {
    id: 'tone',
    label: 'Match brand tone',
    description: 'Align to the brand voice',
    instruction: 'Rewrite this so it sits naturally in the brand voice described above, keeping the substance unchanged.',
  },
  {
    id: 'confident',
    label: 'More confident',
    description: 'Remove hedging',
    instruction: 'Remove hedging and vague qualifiers so this reads with authority, without overstating anything that is uncertain.',
  },
  {
    id: 'destat',
    label: 'Remove statistic',
    description: 'Drop unsupported numbers',
    instruction: 'Remove any statistic, percentage, or precise figure that is not verifiable, and describe the point qualitatively instead.',
  },
  {
    id: 'fix',
    label: 'Fix factual claim',
    description: 'Correct or soften a claim',
    instruction: 'Correct any inaccurate or overstated claim here. Where behavior varies by model or configuration, acknowledge that variation instead of stating an absolute.',
  },
];

export interface BrandContext {
  brandName?: string;
  businessType?: string;
  toneOfVoice?: string;
  keyword?: string;
}

export interface BuildEditPromptArgs {
  blockHtml: string;
  instruction: string;
  selectedText?: string;
  brand?: BrandContext;
}

export function buildBlockEditPrompt({
  blockHtml,
  instruction,
  selectedText,
  brand,
}: BuildEditPromptArgs): string {
  const tag = detectPrimaryTag(blockHtml);

  const brandLines = [
    brand?.brandName ? `Brand: ${brand.brandName}` : null,
    brand?.businessType ? `Business type: ${brand.businessType}` : null,
    brand?.toneOfVoice ? `Tone of voice: ${brand.toneOfVoice}` : null,
    brand?.keyword ? `Article target keyword: ${brand.keyword}` : null,
  ].filter(Boolean);

  const scope = selectedText
    ? `SCOPE OF THE EDIT:
Only the following passage should change. Everything else in the element must be returned byte-for-byte identical.

"""
${selectedText}
"""`
    : `SCOPE OF THE EDIT:
The entire element may be rewritten.`;

  return `You are editing one HTML element from a published SEO article. Return the edited element so it can replace the original directly.

${brandLines.length ? `CONTEXT:\n${brandLines.join('\n')}\n` : ''}
ORIGINAL HTML ELEMENT:
${blockHtml}

WHAT TO CHANGE:
${instruction}

${scope}

CRITICAL REQUIREMENTS:
1. Return a COMPLETE, SELF-CONTAINED <${tag}> element
2. Start with <${tag} and end with </${tag}> - the EXACT same structure and attributes
3. Preserve every existing <a href="..."> link, its URL, and its surrounding phrasing unless the instruction is explicitly about links
4. Preserve all inline style attributes exactly as they appear
5. Write COMPLETE sentences that read naturally standalone and do not reference other paragraphs
6. Do NOT invent statistics, percentages, temperatures, specifications, or part numbers
7. Output HTML only - never Markdown
8. Output the element only - no explanation, preamble, or commentary

ABSOLUTE RULES:
- NEVER begin with "Here is", "Sure", "Certainly", "I cannot", or any similar preamble
- NEVER wrap the output in code fences
- NEVER ask for more context - make the best reasonable edit with what is provided

Return only the replacement <${tag}> element.`;
}

export type RewriteValidation =
  | { ok: true; html: string }
  | { ok: false; reason: string };

/**
 * Applies the full guard chain to a raw model response.
 */
export function validateRewrite(raw: string, originalHtml: string): RewriteValidation {
  const stripped = stripCodeFences(raw ?? '');

  if (!stripped) {
    return { ok: false, reason: 'The model returned an empty response.' };
  }

  if (AI_REFUSAL_PATTERNS.some((pattern) => pattern.test(stripped))) {
    return {
      ok: false,
      reason: 'The model replied with commentary instead of edited HTML. Try rephrasing the instruction.',
    };
  }

  if (!/<[a-z]+[^>]*>/i.test(stripped)) {
    return { ok: false, reason: 'The model response contained no HTML markup.' };
  }

  const tag = detectPrimaryTag(originalHtml);
  let html = ensureHTMLFormat(stripped, originalHtml);
  html = ensureCompleteElement(html, tag);
  html = hardenHtml(html);

  if (!html.trim()) {
    return { ok: false, reason: 'The edited element was empty after cleanup.' };
  }

  return { ok: true, html };
}
