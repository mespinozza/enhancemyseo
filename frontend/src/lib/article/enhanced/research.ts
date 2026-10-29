/**
 * Research before writing, through Perplexity, which searches the web.
 *
 * The Classic format asked Claude for "the latest available web information" in a call
 * with no web access, so its facts came from memory and the fact-check pass afterwards
 * spent rewrites correcting them. Asking a search model first gives the writer current
 * facts with their sources, and the questions people actually ask about the topic.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import type { ResearchResult, ResearchSource } from './types';

const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    brief: { type: 'string' },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { claim: { type: 'string' }, sourceUrl: { type: 'string' } },
        required: ['claim'],
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['brief', 'facts', 'questions'],
};

export interface ResearchInput {
  keyword: string;
  brandName: string;
  businessType: string;
}

export function buildResearchPrompt({ keyword, brandName, businessType }: ResearchInput): string {
  return (
    `Research "${keyword}" for an article by ${brandName}, a ${businessType}. ` +
    `Today is ${new Date().toISOString().slice(0, 10)}; prefer current information.\n\n` +
    `Return JSON with:\n` +
    `- brief: a factual 250-400 word overview of what a buyer or reader needs to know, ` +
    `including the main considerations, trade-offs and common misconceptions.\n` +
    `- facts: 6-12 specific, verifiable facts (figures, standards, specifications, ` +
    `safety or regulatory points), each with the URL of the page that states it. Prefer ` +
    `manufacturers, government and standards bodies, universities and industry ` +
    `associations. Never use retailers, marketplaces, forums or social media.\n` +
    `- questions: 6-10 questions people commonly search about this topic, phrased the ` +
    `way they would type them.`
  );
}

interface PerplexityResponse {
  choices?: { message?: { content?: string } }[];
  citations?: string[];
  search_results?: { title?: string; url?: string }[];
}

function parseJson(text: string): Partial<ResearchResult> | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed) as Partial<ResearchResult>;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Partial<ResearchResult>;
    } catch {
      return null;
    }
  }
}

function toResult(parsed: Partial<ResearchResult> | null, fallbackText: string, sources: ResearchSource[]): ResearchResult {
  const facts = (parsed?.facts ?? [])
    .filter((fact) => fact && typeof fact.claim === 'string' && fact.claim.trim())
    .map((fact) => ({ claim: fact.claim.trim(), sourceUrl: fact.sourceUrl?.trim() || undefined }));
  const all = [...sources];
  for (const fact of facts) {
    if (fact.sourceUrl && !all.some((source) => source.url === fact.sourceUrl)) {
      all.push({ title: fact.sourceUrl, url: fact.sourceUrl });
    }
  }
  return {
    brief: typeof parsed?.brief === 'string' ? parsed.brief.trim() : parsed ? '' : fallbackText.trim(),
    facts,
    questions: (parsed?.questions ?? []).filter((q) => typeof q === 'string' && q.trim()).map((q) => q.trim()),
    sources: all,
  };
}

interface SearchResultBlock {
  type: string;
  content?: { type?: string; url?: string; title?: string }[] | { error_code?: string };
}

/** The same research through Claude's web search, for when Perplexity is unavailable. */
async function researchWithClaude(
  anthropic: Anthropic,
  input: ResearchInput,
  log: (message: string) => void
): Promise<ResearchResult | null> {
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [
        {
          role: 'user',
          content:
            `${buildResearchPrompt(input)}\n\nSearch the web, then reply with the JSON object only: ` +
            `{"brief": string, "facts": [{"claim": string, "sourceUrl": string}], "questions": [string]}.`,
        },
      ],
    });

    const sources: ResearchSource[] = [];
    let text = '';
    for (const part of message.content as unknown as (SearchResultBlock & { text?: string })[]) {
      if (part.type === 'text' && part.text) text += part.text;
      if (part.type === 'web_search_tool_result' && Array.isArray(part.content)) {
        for (const result of part.content) {
          if (result.url && !sources.some((source) => source.url === result.url)) {
            sources.push({ title: result.title || result.url, url: result.url });
          }
        }
      }
    }

    const parsed = parseJson(text);
    if (!parsed && sources.length === 0) return null;
    return toResult(parsed, text, sources);
  } catch (error) {
    log(`⚠️ Web search research failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Never throws: an article without research is weaker, not impossible, so every failure
 * returns an empty result and the writer works from its own knowledge with stricter
 * instructions about figures.
 */
export async function researchTopic(
  input: ResearchInput,
  log: (message: string) => void = console.log,
  anthropic?: Anthropic
): Promise<ResearchResult> {
  const empty: ResearchResult = { brief: '', facts: [], questions: [], sources: [] };
  const fallback = async (reason: string) => {
    if (!anthropic) {
      log(`⚠️ Research skipped: ${reason}`);
      return empty;
    }
    log(`⚠️ ${reason}; researching with Claude web search instead`);
    const result = await researchWithClaude(anthropic, input, log);
    if (!result) return empty;
    log(`🔎 Research (web search): ${result.facts.length} facts, ${result.questions.length} questions, ${result.sources.length} sources`);
    return result;
  };

  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) return fallback('PERPLEXITY_API_KEY is not configured');

  try {
    const response = await fetch(PERPLEXITY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are a meticulous research assistant. Report only what your sources support, and cite them.',
          },
          { role: 'user', content: buildResearchPrompt(input) },
        ],
        response_format: { type: 'json_schema', json_schema: { schema: RESEARCH_SCHEMA } },
        max_tokens: 2500,
      }),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 160);
      return fallback(`Perplexity research failed (${response.status} ${detail})`);
    }

    const data = (await response.json()) as PerplexityResponse;
    const content = data.choices?.[0]?.message?.content || '';

    const sources: ResearchSource[] = [];
    for (const result of data.search_results ?? []) {
      if (result.url) sources.push({ title: result.title || result.url, url: result.url });
    }
    for (const url of data.citations ?? []) {
      if (!sources.some((source) => source.url === url)) sources.push({ title: url, url });
    }

    const result = toResult(parseJson(content), content, sources);
    log(`🔎 Research: ${result.facts.length} facts, ${result.questions.length} questions, ${result.sources.length} sources`);
    return result;
  } catch (error) {
    return fallback(`Perplexity research failed (${error instanceof Error ? error.message : String(error)})`);
  }
}
