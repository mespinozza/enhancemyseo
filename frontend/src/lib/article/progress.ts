/**
 * Live progress for article generation. With `x-progress-stream: 1`, /api/generate-article
 * answers with newline-delimited JSON: a `log` event per server log line as it happens, then
 * one `result` event carrying what the plain JSON response would have held.
 */

export const PROGRESS_STREAM_HEADER = 'x-progress-stream';

export type GenerationEvent =
  | { type: 'log'; message: string }
  | { type: 'ping' }
  | { type: 'result'; status: number; body: unknown };

export type StageId = 'start' | 'research' | 'catalog' | 'writing' | 'factcheck' | 'finishing' | 'saving';

export interface Stage {
  id: StageId;
  label: string;
  /** For the step checklist, where space is tight. */
  short: string;
  /** Overall share of one article done when this stage begins, 0 to 1. */
  at: number;
  /** Typical seconds in this stage; the bar eases toward the next stage over about this long. */
  seconds: number;
}

export const STAGES: Stage[] = [
  { id: 'start', label: 'Getting started', short: 'Start', at: 0, seconds: 4 },
  { id: 'research', label: 'Researching the topic', short: 'Research', at: 0.05, seconds: 15 },
  { id: 'catalog', label: 'Finding pages to link', short: 'Links', at: 0.15, seconds: 25 },
  { id: 'writing', label: 'Writing the article', short: 'Writing', at: 0.32, seconds: 75 },
  { id: 'factcheck', label: 'Fact-checking claims', short: 'Fact-check', at: 0.74, seconds: 40 },
  { id: 'finishing', label: 'Formatting', short: 'Format', at: 0.92, seconds: 8 },
  { id: 'saving', label: 'Saving', short: 'Save', at: 0.97, seconds: 3 },
];

export const stageIndex = (id: StageId) => STAGES.findIndex((s) => s.id === id);

/** How far through one article it is, easing within the current stage so the bar never stalls. */
export function articleFraction(stage: StageId, secondsInStage: number): number {
  const index = stageIndex(stage);
  const current = STAGES[index];
  const nextAt = STAGES[index + 1]?.at ?? 1;
  const eased = 1 - Math.exp(-secondsInStage / current.seconds);
  return current.at + (nextAt - current.at) * 0.9 * eased;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What a server log line means for the user: the stage it shows the run has reached and,
 * for the lines worth showing, a plain-language note. Most lines are internals and map to
 * nothing.
 */
export function readLogLine(message: string): { stage?: StageId; note?: string } {
  const m = message.trim();
  let match: RegExpMatchArray | null;

  if (/^🎁 Tutorial bonus/.test(m)) return { note: 'Your free first article, on us' };
  if (/^🔎 Researching the topic/.test(m)) return { stage: 'research', note: 'Searching the web for up-to-date facts' };
  if ((match = m.match(/Research(?: \(web search\))?: (\d+) facts, (\d+) questions, (\d+) sources/))) {
    return { note: `Found ${plural(+match[1], 'fact')} and ${plural(+match[3], 'source')}, plus ${plural(+match[2], 'question')} people ask` };
  }
  if (/^⚠️ Research skipped/.test(m)) return { note: 'Writing from what we know about the topic' };

  if (/^🔍 Integration type|^🛍️ Starting Shopify|^🧠 Extracting AI search terms|^🔍 Detecting vendor/.test(m)) {
    return { stage: 'catalog', note: /Shopify/.test(m) ? 'Searching your store' : undefined };
  }
  if (/^🕷️ Crawling website|^🌐 Using sitemap|^🕷️ Using Puppeteer/.test(m)) return { stage: 'catalog', note: 'Scanning your website' };
  if ((match = m.match(/^🎯 Vendor confirmed: "(.+)"/))) return { note: `Focusing on ${match[1]}` };
  if ((match = m.match(/^🛒 Products found: (\d+)/)) && +match[1] > 0) return { note: `Matched ${plural(+match[1], 'product')} to feature` };
  if ((match = m.match(/^📂 Collections found: (\d+)/)) && +match[1] > 0) return { note: `Matched ${plural(+match[1], 'collection')} to link` };
  if ((match = m.match(/^✅ Found (\d+) (?:relevant )?pages/)) && +match[1] > 0) return { note: `Found ${plural(+match[1], 'page')} on your site to link` };

  if (/^✍️ Writing Enhanced article|^✍️ Generating article/.test(m)) return { stage: 'writing', note: 'Drafting the article' };
  if ((match = m.match(/^✍️ Intent: [^;]+; (\d+) sections; blocks: ([^;]+); quiz (\w+); FAQ (\d+)/))) {
    const extras = [
      match[2] !== 'none' && match[2].split(', ').slice(0, 3).join(', ').replace(/-/g, ' '),
      +match[4] > 0 && plural(+match[4], 'FAQ'),
    ].filter(Boolean);
    return { note: `Wrote ${plural(+match[1], 'section')}${extras.length ? ` with ${extras.join(', ')}` : ''}` };
  }
  if (/^⚠️ Draft needs another pass/.test(m)) return { note: 'Tightening the draft' };

  if (/FACT-CHECK LAYER|Starting fact-check|^🔍 FACT-CHECK: Sending/.test(m)) return { stage: 'factcheck', note: 'Checking every claim against the web' };
  if ((match = m.match(/FACT-CHECK: (\d+) passages checked, (\d+) web searches, (\d+) issue/))) {
    return {
      stage: 'factcheck',
      note: `Checked ${plural(+match[1], 'passage')} with ${+match[2]} web search${+match[2] === 1 ? '' : 'es'}${
        +match[3] ? `, fixing ${plural(+match[3], 'claim')}` : ', all accurate'
      }`,
    };
  }
  if (/^✅ FACT-CHECK COMPLETE|Fact-check PASSED/.test(m)) return { note: 'Facts verified' };

  if ((match = m.match(/^🧱 Rendered Enhanced article; (\d+) sources cited/))) {
    return { stage: 'finishing', note: `Formatted${+match[1] ? ` with ${plural(+match[1], 'cited source')}` : ''}` };
  }
  if (/^✅ (Enhanced article|Article generation) complete/.test(m)) return { stage: 'finishing' };
  return {};
}

/**
 * Reads a generation response. Streams report each log line through `onLog`; a plain JSON
 * response (an error before streaming began, or an older server) is read as before.
 */
export async function readGeneration(
  response: Response,
  onLog: (message: string) => void
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const type = response.headers.get('content-type') || '';
  if (!type.includes('ndjson') || !response.body) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, body };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: { status: number; body: Record<string, unknown> } | null = null;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: GenerationEvent;
    try {
      event = JSON.parse(line) as GenerationEvent;
    } catch {
      return;
    }
    if (event.type === 'log') onLog(event.message);
    if (event.type === 'result') result = { status: event.status, body: (event.body || {}) as Record<string, unknown> };
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(buffer);

  const final = result as { status: number; body: Record<string, unknown> } | null;
  if (!final) return { ok: false, status: 502, body: { error: 'The connection dropped before the article finished. Please try again.' } };
  return { ok: final.status >= 200 && final.status < 300, status: final.status, body: final.body };
}
