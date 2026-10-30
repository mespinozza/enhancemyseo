/**
 * What each tone of voice means for the writing.
 *
 * A tone used to be one word in the prompt ("Tone of voice: Technical"), which the model
 * mostly ignored in favor of its house style. Each tone here fixes the reader it speaks
 * to, the point of view, sentence length, contractions, how jargon is handled, how
 * sections open, how every block sounds, and what the call to action asks, with a short
 * sample so the register is unmistakable. `measureVoice` checks the result.
 *
 * Client-safe: the forms read the labels and descriptions.
 */

export interface ToneProfile {
  /** '' is the default voice, used when no tone is chosen. */
  value: string;
  label: string;
  /** Shown under the dropdown. */
  description: string;
  reader: string;
  /** Target average words per sentence in the prose. */
  sentenceWords: [number, number];
  contractions: 'avoid' | 'sometimes' | 'often';
  /** How much the article addresses the reader as "you". */
  directAddress: 'sparingly' | 'regularly' | 'constantly';
  voice: string[];
  /** How the quick answer, sections, FAQ, quiz, callouts and conclusion sound. */
  blocks: string[];
  cta: string;
  avoid: string[];
  /** Topic-neutral, to show the register; never copied. */
  sample: string;
}

export const TONE_PROFILES: ToneProfile[] = [
  {
    value: '',
    label: 'Default',
    description: 'Clear, plain-English expertise: helpful and direct without being stiff or chatty.',
    reader: 'A capable reader who wants the answer and enough context to act on it.',
    sentenceWords: [13, 19],
    contractions: 'sometimes',
    directAddress: 'regularly',
    voice: [
      'Plain English first; introduce a technical term only when the reader needs it, with a short definition.',
      'Confident and specific, with a mix of short and medium sentences.',
      'Speak to the reader as "you" where it helps; refer to the brand as "we" only in the conclusion and call to action.',
    ],
    blocks: [
      'Quick answer: a direct, factual summary.',
      'FAQ answers: start with the answer in the first sentence, then one or two sentences of context.',
      'Quiz: straightforward questions about the article; explanations in one sentence.',
    ],
    cta: 'A clear, specific next step with the brand ("Browse our ..." / "Talk to our team about ...").',
    avoid: ['Filler openers and throat-clearing', 'Hype adjectives ("amazing", "game-changing")'],
    sample:
      'A water softener removes the calcium and magnesium that cause scale. If your kettle furs up within a month, you likely need one, and a 32,000-grain unit suits most homes.',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Polished and measured, like a consultant\'s briefing: precise, business-minded, no slang.',
    reader: 'A business owner or manager weighing cost, reliability and risk, short on time.',
    sentenceWords: [16, 22],
    contractions: 'avoid',
    directAddress: 'sparingly',
    voice: [
      'Measured and courteous; never casual, never salesy. No slang, no exclamation marks, no rhetorical questions.',
      'Frame points in business terms: cost of ownership, uptime, compliance, efficiency, risk, return on investment.',
      'Prefer third person and "your business"/"your operation" over a personal "you"; the brand is "we" only in the call to action.',
      'Use precise terms, defined once in passing. Qualify claims accurately instead of overselling.',
      'Paragraphs of 2-4 complete sentences; no one-line paragraphs.',
    ],
    blocks: [
      'Quick answer: a concise executive summary with the recommendation and its main reason.',
      'Section openings: state the conclusion first, as a briefing would.',
      'FAQ answers: formal and complete, two to three sentences.',
      'Quiz: framed as a knowledge check; explanations neutral and exact.',
      'Callouts: "insight" in a consultative voice; mistakes framed as operational risks.',
      'Conclusion: summarize the decision factors, then the next step.',
    ],
    cta: 'Consultative and low-pressure: "Request a quote", "Speak with our specialists about your requirements".',
    avoid: [
      'Contractions (write "do not", "it is")',
      'Exclamation marks, emoji, slang, jokes',
      'Hype and absolutes ("the best ever", "guaranteed")',
    ],
    sample:
      'For most commercial kitchens, a water softener reduces scale-related service calls and extends equipment life. The investment is typically recovered through lower maintenance costs within the first year of operation.',
  },
  {
    value: 'conversational',
    label: 'Conversational',
    description: 'Like an expert friend talking you through it over coffee: relaxed, direct, easy to read.',
    reader: 'Someone curious or mid-decision who wants it explained in everyday language.',
    sentenceWords: [9, 14],
    contractions: 'often',
    directAddress: 'constantly',
    voice: [
      'Talk to the reader as "you" throughout, the way you would across a table; the brand can say "we" naturally.',
      'Contractions everywhere they sound natural ("you\'ll", "it\'s", "don\'t").',
      'Short sentences, varied rhythm. An occasional one-sentence paragraph for emphasis, and the odd question to the reader ("So which one do you need?").',
      'Everyday words and analogies; explain any technical term in plain language the moment it appears.',
      'Light personality is welcome; a dry aside now and then, never forced jokes.',
    ],
    blocks: [
      'Quick answer: the straight answer, said the way you would say it out loud.',
      'H2s: phrased like the questions people actually ask, where it reads naturally.',
      'Section openings: answer first, casually ("Short version: yes, but only if ...").',
      'FAQ answers: chatty and direct, starting with "Yes", "No" or the answer itself.',
      'Quiz: playful framing ("Quick check:"); explanations friendly and brief.',
      'Callouts: tips sound like advice from a friend who has made the mistake.',
    ],
    cta: 'Friendly and easy: "Have a look at our ...", "Got questions? Give us a shout."',
    avoid: [
      'Stiff phrasing ("utilize", "in order to", "it is recommended that")',
      'Long, clause-heavy sentences',
      'Talking down to the reader or overdoing slang',
    ],
    sample:
      'Here\'s the thing: if your kettle\'s crusty after a month, you\'ve got hard water. A softener fixes that. For most homes, a 32,000-grain one does the job just fine.',
  },
  {
    value: 'technical',
    label: 'Technical',
    description: 'Precise and spec-driven for technicians and engineers: mechanisms, numbers, procedures.',
    reader: 'A technician, engineer or experienced operator who knows the basics and wants the specifics.',
    sentenceWords: [15, 22],
    contractions: 'avoid',
    directAddress: 'sparingly',
    voice: [
      'Use correct technical terminology without simplifying it away; define only uncommon terms.',
      'Explain mechanisms: cause and effect, how a component works and why it fails.',
      'Quantify everything the research supports: units, ranges, ratings, tolerances, standards (NSF, UL, ENERGY STAR), model and part numbers. Never invent a figure; say "varies by model" instead.',
      'Neutral and exact; no marketing adjectives. Imperative mood for procedures ("Disconnect power", "Measure the inlet pressure").',
      'Favor data-dense blocks (comparison_table, stats, steps) where they fit the content type.',
    ],
    blocks: [
      'Quick answer: the precise answer with the governing figure or condition.',
      'Section openings: state the specification or principle, then the reasoning.',
      'Steps: one action per step, with the check that confirms it worked.',
      'FAQ answers: exact and terse, with units.',
      'Quiz: tests real understanding (causes, specs, sequence), not trivia; explanations cite the mechanism.',
      'Callouts: "mistake" for failure modes and their symptoms; "insight" for the engineering reason behind a rule.',
    ],
    cta: 'Spec-driven: "Match the part to your model number", "Check compatibility before you order".',
    avoid: [
      'Vague qualifiers ("pretty good", "a lot of")',
      'Marketing language and superlatives',
      'Contractions and casual asides',
    ],
    sample:
      'Hardness above 7 grains per gallon (120 ppm CaCO3) accelerates scale formation on heat-exchange surfaces. A 32,000-grain softener regenerating every 3-4 days handles a 3 gpg-per-person load for a household of four.',
  },
  {
    value: 'friendly',
    label: 'Friendly',
    description: 'Warm and encouraging, especially for beginners: reassuring, patient, never condescending.',
    reader: 'Someone new to the topic who may feel unsure and wants reassurance as well as answers.',
    sentenceWords: [10, 16],
    contractions: 'often',
    directAddress: 'constantly',
    voice: [
      'Warm and supportive: acknowledge that the topic can feel confusing, then make it simple.',
      'Speak to "you" often; the brand is a helpful "we" ("We\'ll walk you through it").',
      'Contractions throughout. Positive framing: what to do rather than only what not to do.',
      'Reassure where it is honest to ("This is easier than it sounds"), and celebrate small wins.',
      'Plain words, gentle explanations of any jargon. At most one exclamation mark in the whole article.',
    ],
    blocks: [
      'Quick answer: a kind, clear answer that tells the reader they can handle this.',
      'Section openings: answer first, with encouragement where it fits.',
      'FAQ answers: warm and reassuring, starting with the answer.',
      'Quiz: encouraging framing ("See how much you picked up"); explanations supportive.',
      'Callouts: tips framed as helpful advice; mistakes framed as "easy to avoid".',
      'Conclusion: encouraging, with an open invitation to ask for help.',
    ],
    cta: 'Welcoming: "We\'re happy to help you choose", "Reach out anytime with questions".',
    avoid: [
      'Condescension ("simply", "obviously", "just")',
      'Cold, clinical phrasing',
      'Overdone enthusiasm or more than one exclamation mark',
    ],
    sample:
      'If you\'ve noticed white crust on your faucets, don\'t worry; it\'s just hard water, and it\'s easy to fix. A softener takes care of it, and most homes do great with a 32,000-grain model.',
  },
  {
    value: 'authoritative',
    label: 'Authoritative',
    description: 'Confident expert guidance: decisive recommendations backed by standards, data and experience.',
    reader: 'A reader who wants an expert to tell them what to do and why, and will trust a clear verdict.',
    sentenceWords: [14, 20],
    contractions: 'sometimes',
    directAddress: 'regularly',
    voice: [
      'Decisive: make clear recommendations and state verdicts ("Choose X when ..."). Hedge only where the evidence genuinely varies, and say why.',
      'Back claims with standards, data and the research sources; name the standard or figure rather than gesturing at it.',
      'Speak from expertise as the brand ("In our experience servicing ..."), sparingly and only where credible.',
      'Firm, declarative sentences; imperative for advice. No filler, no "might want to consider".',
      'Correct common misconceptions directly.',
    ],
    blocks: [
      'Quick answer: the verdict and the deciding reason, stated plainly.',
      'Section openings: the expert position first, then the evidence.',
      'FAQ answers: definitive, with the reason or standard behind them.',
      'Quiz: tests the decisions an expert would make; explanations give the rule.',
      'Callouts: "insight" for expert rules of thumb; "mistake" for the errors experts see most.',
      'Decision guide and verdicts: unambiguous.',
    ],
    cta: 'Direct and confident: "Get the right unit the first time: talk to our specialists".',
    avoid: [
      'Weak hedges ("might", "could possibly", "some people say")',
      'Arrogance or dismissing the reader',
      'Claims not supported by the research',
    ],
    sample:
      'Install a softener once hardness passes 7 grains per gallon; below that, the cost outweighs the benefit. For a family of four, specify a 32,000-grain unit and set regeneration by metered flow, not by timer.',
  },
];

/** Everyday words people type into the tone box, mapped to a profile. */
const SYNONYMS: Record<string, string> = {
  formal: 'professional',
  business: 'professional',
  corporate: 'professional',
  polished: 'professional',
  casual: 'conversational',
  relaxed: 'conversational',
  informal: 'conversational',
  chatty: 'conversational',
  engineering: 'technical',
  detailed: 'technical',
  scientific: 'technical',
  warm: 'friendly',
  approachable: 'friendly',
  encouraging: 'friendly',
  expert: 'authoritative',
  confident: 'authoritative',
  trustworthy: 'authoritative',
};

/** The selectable tones, stored by label ("Technical"), which is how saved settings already hold them. */
export const TONE_LABELS = TONE_PROFILES.filter((t) => t.value).map((t) => t.label);

/**
 * The profile for a tone as stored: a profile value or label in any case ("Technical",
 * "technical"), a common synonym, or '' for the default. Anything else is custom.
 */
export function toneFor(tone: string | undefined | null): ToneProfile | null {
  const key = (tone ?? '').trim().toLowerCase();
  if (!key || key === 'default') return TONE_PROFILES[0];
  const value = SYNONYMS[key] ?? key;
  return TONE_PROFILES.find((t) => t.value === value || t.label.toLowerCase() === value) ?? null;
}

const CONTRACTIONS = {
  avoid: 'Do not use contractions.',
  sometimes: 'Use contractions occasionally, where they read naturally.',
  often: "Use contractions freely, wherever a person would say them aloud (it's, you'll, don't, we're), several per paragraph.",
};
const ADDRESS = {
  sparingly: 'Address the reader as "you" sparingly.',
  regularly: 'Address the reader as "you" where it helps.',
  constantly: 'Address the reader as "you" throughout.',
};

/** Measured ranges that clearly miss a profile; deliberately loose so only an obvious miss is rewritten. */
const LIMITS = {
  sentenceSlack: 5,
  avoidContractionsMax: 0.5,
  oftenContractionsMin: 2,
  constantlyYouMin: 2,
  sparinglyYouMax: 3,
};

/** The voice section of the writer's system prompt. */
export function buildVoiceInstructions(tone: string | undefined | null): string {
  const profile = toneFor(tone);
  if (!profile) {
    const custom = String(tone).trim().slice(0, 120);
    return `Voice: ${custom}
Apply "${custom}" consistently to every part of the article: word choice, sentence length, point of view, how formal it is, how each section and FAQ answer opens, the quiz and callouts, and the call to action. Keep the writing clear and the facts exact whatever the tone.`;
  }

  const [low, high] = profile.sentenceWords;
  return `Voice: ${profile.label}. ${profile.description}
Written for: ${profile.reader}
This voice applies to every field: title, quick answer, takeaways, prose, every block, the FAQ, the quiz and the conclusion. It overrides any general style habit, but never the accuracy, structure or link rules.
- Sentences average ${low}-${high} words; split any sentence over ${high + 8} words in two. ${CONTRACTIONS[profile.contractions]} ${ADDRESS[profile.directAddress]}
${profile.voice.map((v) => `- ${v}`).join('\n')}
How each part sounds:
${profile.blocks.map((b) => `- ${b}`).join('\n')}
- Call to action: ${profile.cta}
Avoid: ${profile.avoid.join('; ')}.
The register, shown on an unrelated topic (never copy it): "${profile.sample}"`;
}

/** One line for prompts that only need the gist, such as editing a single paragraph. */
export function toneSummary(tone: string | undefined | null): string {
  const profile = toneFor(tone);
  if (!profile) return String(tone).trim().slice(0, 120);
  const [low, high] = profile.sentenceWords;
  return `${profile.label}: ${profile.description} Sentences around ${low}-${high} words; ${CONTRACTIONS[profile.contractions].toLowerCase()} ${ADDRESS[profile.directAddress].toLowerCase()}`;
}

export interface VoiceMetrics {
  words: number;
  averageSentenceWords: number;
  /** Per 100 words. */
  contractionsPer100: number;
  /** "you"/"your" per 100 words. */
  youPer100: number;
  exclamations: number;
  questions: number;
}

/** Style measurements of prose text, used to confirm that tones read differently. */
export function measureVoice(text: string): VoiceMetrics {
  // List items, cells and headings rarely end in a full stop but are separate sentences.
  const clean = text
    .replace(/<\/(p|li|h[1-6]|td|th|blockquote)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/([.!?:])\s*\.(?=\s|$)/g, '$1')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(' ').filter((w) => /[a-z0-9]/i.test(w));
  const sentences = clean.split(/(?<=[.!?])\s+/).filter((s) => /[a-z]/i.test(s));
  const count = (re: RegExp) => (clean.match(re) ?? []).length;
  const per100 = (n: number) => (words.length ? Math.round((n / words.length) * 1000) / 10 : 0);
  return {
    words: words.length,
    averageSentenceWords: sentences.length ? Math.round((words.length / sentences.length) * 10) / 10 : 0,
    contractionsPer100: per100(
      count(/\b[a-z]+['’](t|re|ve|ll|d|m)\b/gi) +
        count(/\b(it|that|here|there|what|let|he|she|who|where|how)['’]s\b/gi)
    ),
    youPer100: per100(count(/\b(you|your|you're|yours)\b/gi)),
    exclamations: count(/!/g),
    questions: count(/\?/g),
  };
}

/**
 * Where measured prose clearly misses its tone, worded as instructions for a rewrite.
 * Empty for a custom tone, which has no measurable targets.
 */
export function voiceProblems(tone: string | undefined | null, metrics: VoiceMetrics): string[] {
  const profile = toneFor(tone);
  if (!profile || metrics.words < 200) return [];
  const [low, high] = profile.sentenceWords;
  const problems: string[] = [];
  if (metrics.averageSentenceWords > high + LIMITS.sentenceSlack) {
    problems.push(`Sentences averaged ${metrics.averageSentenceWords} words; the ${profile.label} voice averages ${low}-${high}. Split long sentences.`);
  }
  if (profile.contractions === 'avoid' && metrics.contractionsPer100 > LIMITS.avoidContractionsMax) {
    problems.push(`The ${profile.label} voice uses no contractions; write them out in full.`);
  }
  if (profile.contractions === 'often' && metrics.contractionsPer100 < LIMITS.oftenContractionsMin) {
    problems.push(`The ${profile.label} voice uses contractions freely (it's, you'll, don't); the draft barely used any.`);
  }
  if (profile.directAddress === 'constantly' && metrics.youPer100 < LIMITS.constantlyYouMin) {
    problems.push(`The ${profile.label} voice talks to the reader as "you" throughout; the draft rarely did.`);
  }
  if (profile.directAddress === 'sparingly' && metrics.youPer100 > LIMITS.sparinglyYouMax) {
    problems.push(`The ${profile.label} voice addresses the reader as "you" sparingly; the draft did so constantly.`);
  }
  return problems;
}
