'use client';

import { useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import {
  Briefcase,
  Check,
  ChevronDown,
  Cpu,
  MessageCircle,
  PenLine,
  ShieldCheck,
  Smile,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { TONE_PROFILES, toneFor, type ToneProfile } from '@/lib/article/enhanced/tones';

interface ToneStyle {
  icon: LucideIcon;
  /** Icon chip colors. */
  chip: string;
  /** Meter dot color. */
  dot: string;
  /** Sample card accent. */
  accent: string;
}

const CUSTOM = 'custom';

// Full class names, so Tailwind keeps them.
const STYLES: Record<string, ToneStyle> = {
  '': { icon: Sparkles, chip: 'bg-blue-100 text-blue-600', dot: 'bg-blue-500', accent: 'border-blue-400 bg-blue-50/60' },
  professional: { icon: Briefcase, chip: 'bg-indigo-100 text-indigo-600', dot: 'bg-indigo-500', accent: 'border-indigo-400 bg-indigo-50/60' },
  conversational: { icon: MessageCircle, chip: 'bg-sky-100 text-sky-600', dot: 'bg-sky-500', accent: 'border-sky-400 bg-sky-50/60' },
  technical: { icon: Cpu, chip: 'bg-emerald-100 text-emerald-600', dot: 'bg-emerald-500', accent: 'border-emerald-400 bg-emerald-50/60' },
  friendly: { icon: Smile, chip: 'bg-amber-100 text-amber-600', dot: 'bg-amber-500', accent: 'border-amber-400 bg-amber-50/60' },
  authoritative: { icon: ShieldCheck, chip: 'bg-violet-100 text-violet-600', dot: 'bg-violet-500', accent: 'border-violet-400 bg-violet-50/60' },
  [CUSTOM]: { icon: PenLine, chip: 'bg-pink-100 text-pink-600', dot: 'bg-pink-500', accent: 'border-pink-400 bg-pink-50/60' },
};

const FORMALITY = { avoid: 3, sometimes: 2, often: 1 } as const;
const PERSONAL = { sparingly: 1, regularly: 2, constantly: 3 } as const;

function meters(profile: ToneProfile): [string, number][] {
  const average = (profile.sentenceWords[0] + profile.sentenceWords[1]) / 2;
  return [
    ['Formal', FORMALITY[profile.contractions]],
    ['Personal', PERSONAL[profile.directAddress]],
    ['Long sentences', average < 14 ? 1 : average < 17.5 ? 2 : 3],
  ];
}

function Meter({ label, level, dot }: { label: string; level: number; dot: string }) {
  return (
    <span className="flex items-center gap-1.5" title={`${label}: ${['low', 'medium', 'high'][level - 1]}`}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 w-3 rounded-full transition-colors duration-300 ${n <= level ? dot : 'bg-gray-200'}`}
          />
        ))}
      </span>
    </span>
  );
}

function IconChip({ style, size = 'md' }: { style: ToneStyle; size?: 'sm' | 'md' }) {
  const Icon = style.icon;
  const box = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-lg ${style.chip}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

interface TonePickerProps {
  id?: string;
  /** The stored tone: '' for Default, a label such as "Technical", or custom text. */
  value: string;
  onChange: (value: string) => void;
}

export default function TonePicker({ id, value, onChange }: TonePickerProps) {
  // Picking Custom shows the input before anything is typed; a saved custom tone is custom anyway.
  const [customChosen, setCustomChosen] = useState(false);
  const customMode = customChosen || (Boolean(value.trim()) && !toneFor(value));
  const profile = customMode ? null : toneFor(value) ?? TONE_PROFILES[0];
  const selected = customMode ? CUSTOM : profile!.value;
  const style = STYLES[selected] ?? STYLES[''];

  const choose = (choice: string) => {
    if (choice === CUSTOM) {
      setCustomChosen(true);
      if (toneFor(value)) onChange('');
      return;
    }
    setCustomChosen(false);
    // Tones are stored by label; the default is stored as ''.
    onChange(choice ? TONE_PROFILES.find((t) => t.value === choice)?.label ?? '' : '');
  };

  return (
    <div className="mt-1 space-y-2">
      <Listbox value={selected} onChange={choose}>
        <ListboxButton
          id={id}
          className="group flex w-full items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left shadow-sm transition hover:border-blue-400 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 data-[open]:border-blue-500 data-[open]:ring-2 data-[open]:ring-blue-500/30"
        >
          <span key={selected} className="animate-tone-pop">
            <IconChip style={style} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900">{customMode ? 'Custom voice' : profile!.label}</span>
            <span className="block truncate text-xs text-gray-500">
              {customMode ? value.trim() || 'Describe your own voice below' : profile!.description}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-data-[open]:rotate-180" />
        </ListboxButton>

        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 6 }}
          transition
          className="z-50 max-h-[26rem] w-[var(--button-width)] min-w-[20rem] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 transition duration-150 ease-out focus:outline-none data-[closed]:-translate-y-1 data-[closed]:scale-[0.98] data-[closed]:opacity-0"
        >
          {TONE_PROFILES.map((tone) => {
            const toneStyle = STYLES[tone.value];
            return (
              <ListboxOption
                key={tone.value || 'default'}
                value={tone.value}
                className="group flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 data-[focus]:bg-gray-50 data-[selected]:bg-blue-50/70"
              >
                <span className="transition-transform duration-200 group-data-[focus]:scale-110">
                  <IconChip style={toneStyle} size="sm" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                    {tone.label}
                    {!tone.value && <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-500">Recommended</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-gray-500">{tone.description}</span>
                  <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {meters(tone).map(([label, level]) => (
                      <Meter key={label} label={label} level={level} dot={toneStyle.dot} />
                    ))}
                  </span>
                </span>
                <Check className="mt-1 h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-data-[selected]:opacity-100" />
              </ListboxOption>
            );
          })}
          <div className="my-1 border-t border-gray-100" />
          <ListboxOption
            value={CUSTOM}
            className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors duration-150 data-[focus]:bg-gray-50 data-[selected]:bg-blue-50/70"
          >
            <span className="transition-transform duration-200 group-data-[focus]:scale-110">
              <IconChip style={STYLES[CUSTOM]} size="sm" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900">Custom voice</span>
              <span className="block text-xs text-gray-500">Describe your own, e.g. &ldquo;witty, like a seasoned chef&rdquo;</span>
            </span>
            <Check className="h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-data-[selected]:opacity-100" />
          </ListboxOption>
        </ListboxOptions>
      </Listbox>

      <div
        aria-hidden={!customMode}
        className={`grid transition-all duration-300 ease-out ${customMode ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="-m-1 overflow-hidden p-1">
          <input
            type="text"
            aria-label="Custom tone of voice"
            tabIndex={customMode ? 0 : -1}
            value={customMode ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={120}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm transition focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/40"
            placeholder="Describe the voice, e.g. witty and irreverent, like a seasoned chef"
          />
        </div>
      </div>

      <div key={selected} className={`animate-tone-fade rounded-lg border-l-4 px-3 py-2 ${style.accent}`}>
        {profile ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Sounds like</p>
            <p className="mt-0.5 text-sm italic leading-relaxed text-gray-700">&ldquo;{profile.sample}&rdquo;</p>
            <p className="mt-1 text-xs text-gray-500">Written for: {profile.reader}</p>
          </>
        ) : (
          <p className="text-xs text-gray-600">
            Your voice is applied to every part of the article: wording, sentence length, formality, the FAQ, quiz and call to action.
          </p>
        )}
      </div>
    </div>
  );
}
