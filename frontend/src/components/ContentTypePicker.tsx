'use client';

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import {
  BookOpen,
  Check,
  ChevronDown,
  Columns3,
  Hourglass,
  LayoutTemplate,
  ListOrdered,
  Scale,
  Star,
  Swords,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { CONTENT_BLUEPRINTS, blueprintFor } from '@/lib/article/enhanced/blueprints';
import type { BlockType } from '@/lib/article/enhanced/types';
import { OPTIONS_PER_PAGE, OPTION_CLASS, PANEL_CLASS, usePagedWheel } from './usePagedWheel';

interface TypeStyle {
  icon: LucideIcon;
  chip: string;
  accent: string;
  badge: string;
  /** The article's shape at a glance; the blueprint holds the real instructions. */
  outline: string[];
}

// Full class names, so Tailwind keeps them.
const STYLES: Record<string, TypeStyle> = {
  default: {
    icon: LayoutTemplate,
    chip: 'bg-blue-100 text-blue-600',
    accent: 'border-blue-400 bg-blue-50/60',
    badge: 'bg-blue-50 text-blue-700 ring-blue-200',
    outline: ['Structure picked for the keyword', 'Sections that answer it in order', 'Products where they help'],
  },
  informational: {
    icon: BookOpen,
    chip: 'bg-sky-100 text-sky-600',
    accent: 'border-sky-400 bg-sky-50/60',
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
    outline: ['Definition up front', 'How it works', 'Why it matters', 'Key figures', 'Common misconceptions'],
  },
  'product-reviews': {
    icon: Star,
    chip: 'bg-amber-100 text-amber-600',
    accent: 'border-amber-400 bg-amber-50/60',
    badge: 'bg-amber-50 text-amber-700 ring-amber-200',
    outline: ['How the products were judged', 'One review per product', 'Pros and cons', 'Side-by-side table', 'Best pick for each buyer'],
  },
  listicle: {
    icon: ListOrdered,
    chip: 'bg-orange-100 text-orange-600',
    accent: 'border-orange-400 bg-orange-50/60',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    outline: ['At-a-glance table', '1. First pick', '2. Second pick', '3. …one section per item', 'How to choose'],
  },
  history: {
    icon: Hourglass,
    chip: 'bg-rose-100 text-rose-600',
    accent: 'border-rose-400 bg-rose-50/60',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    outline: ['Origins', 'Key developments', 'Timeline of milestones', 'Modern day', 'What it means for buyers today'],
  },
  'pros-cons': {
    icon: Scale,
    chip: 'bg-teal-100 text-teal-600',
    accent: 'border-teal-400 bg-teal-50/60',
    badge: 'bg-teal-50 text-teal-700 ring-teal-200',
    outline: ['What it is', 'Advantages', 'Drawbacks', 'Pros and cons summary', 'Who it is right for'],
  },
  comparisons: {
    icon: Columns3,
    chip: 'bg-indigo-100 text-indigo-600',
    accent: 'border-indigo-400 bg-indigo-50/60',
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    outline: ['The criteria that matter', 'Side-by-side table', 'Option by option', 'Which one to choose'],
  },
  'how-to': {
    icon: Wrench,
    chip: 'bg-emerald-100 text-emerald-600',
    accent: 'border-emerald-400 bg-emerald-50/60',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    outline: ["What you'll need", 'Step-by-step instructions', 'Common mistakes', 'Troubleshooting', 'When to call a pro'],
  },
  versus: {
    icon: Swords,
    chip: 'bg-red-100 text-red-600',
    accent: 'border-red-400 bg-red-50/60',
    badge: 'bg-red-50 text-red-700 ring-red-200',
    outline: ['A vs B at a glance', 'Round by round, with a winner each', 'Side-by-side table', 'Choose A if… / Choose B if…'],
  },
};

const BLOCK_NAMES: Record<BlockType, string> = {
  quiz: 'Quiz',
  decision_guide: 'Decision guide',
  comparison_table: 'Comparison table',
  pros_cons: 'Pros & cons',
  steps: 'Steps',
  checklist: 'Checklist',
  stats: 'Key stats',
  callout: 'Callout',
  product_cards: 'Product cards',
  chart: 'Chart',
  timeline: 'Timeline',
};

/** Short names: the versus label carries "(Brand A Vs. Brand B)". */
function shortLabel(value: string): string {
  return blueprintFor(value).label.replace(/\s*\(.*\)$/, '');
}

function styleFor(value: string | undefined | null): TypeStyle {
  return STYLES[blueprintFor(value).value] ?? STYLES.default;
}

function IconChip({ style, size = 'md' }: { style: TypeStyle; size?: 'sm' | 'md' }) {
  const Icon = style.icon;
  return (
    <span
      className={`flex ${size === 'md' ? 'h-9 w-9' : 'h-8 w-8'} shrink-0 items-center justify-center rounded-lg ${style.chip}`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function BlockChips({ value }: { value: string }) {
  const blocks = blueprintFor(value).requiredBlocks;
  if (!blocks.length) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {blocks.map((block) => (
        <span key={block} className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-600">
          {BLOCK_NAMES[block]}
        </span>
      ))}
    </span>
  );
}

/** The content type as a small pill, with its description on hover. */
export function ContentTypeBadge({ contentType, className = '' }: { contentType: string | undefined | null; className?: string }) {
  const style = styleFor(contentType);
  const Icon = style.icon;
  return (
    <span
      title={`Content type: ${shortLabel(contentType ?? '')}. ${blueprintFor(contentType).description}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {shortLabel(contentType ?? '')}
    </span>
  );
}

/** Several content types: one badge, or overlapping icons when there are more. */
export function ContentTypeStack({ contentTypes }: { contentTypes: string[] }) {
  if (contentTypes.length <= 1) return <ContentTypeBadge contentType={contentTypes[0]} />;
  const names = contentTypes.map(shortLabel).join(', ');
  return (
    <span
      title={`Rotates between: ${names}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 py-0.5 pl-0.5 pr-2 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200"
    >
      <span className="flex -space-x-1">
        {contentTypes.slice(0, 5).map((value) => {
          const style = styleFor(value);
          const Icon = style.icon;
          return (
            <span key={value} className={`flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${style.chip}`}>
              <Icon className="h-2.5 w-2.5" />
            </span>
          );
        })}
      </span>
      {contentTypes.length} content types
    </span>
  );
}

/** A selectable card for picking several content types, as the automation form does. */
export function ContentTypeChoice({ value, checked, onToggle }: { value: string; checked: boolean; onToggle: () => void }) {
  const blueprint = blueprintFor(value);
  const style = styleFor(value);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`group relative flex gap-3 rounded-lg border p-3 text-left transition duration-150 hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        checked ? 'border-blue-400 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <span className={`transition-transform duration-200 group-hover:scale-110 ${checked ? '' : 'opacity-70 grayscale-[40%]'}`}>
        <IconChip style={style} size="sm" />
      </span>
      <span className="min-w-0 flex-1 pr-5">
        <span className="block text-sm font-medium text-gray-900">{blueprint.label}</span>
        <span className="mt-0.5 block text-xs leading-snug text-gray-500">{blueprint.description}</span>
        <BlockChips value={value} />
      </span>
      <span
        className={`absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded border transition-all duration-200 ${
          checked ? 'scale-100 border-blue-600 bg-blue-600' : 'scale-90 border-gray-300 bg-white'
        }`}
      >
        <Check className={`h-3 w-3 text-white transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} />
      </span>
    </button>
  );
}

interface ContentTypePickerProps {
  id?: string;
  /** A blueprint value, or '' when nothing is chosen yet. */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  onBlur?: () => void;
}

export default function ContentTypePicker({ id, value, onChange, invalid = false, onBlur }: ContentTypePickerProps) {
  const chosen = value ? blueprintFor(value) : null;
  const style = chosen ? styleFor(value) : null;
  const pagedWheel = usePagedWheel<HTMLElement>(OPTIONS_PER_PAGE);

  return (
    <div className="mt-1 space-y-2">
      <Listbox value={value} onChange={onChange}>
        <ListboxButton
          id={id}
          onBlur={onBlur}
          className={`group flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 data-[open]:ring-2 ${
            invalid
              ? 'border-red-300 focus:ring-red-400 data-[open]:ring-red-400/30'
              : 'border-gray-300 hover:border-blue-400 focus:ring-blue-500 data-[open]:border-blue-500 data-[open]:ring-blue-500/30'
          }`}
        >
          {chosen && style ? (
            <span key={value} className="animate-pick-pop">
              <IconChip style={style} />
            </span>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400">
              <LayoutTemplate className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={`block text-sm font-medium ${chosen ? 'text-gray-900' : 'text-gray-500'}`}>
              {chosen ? chosen.label : 'Select a content type...'}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {chosen ? chosen.description : 'Sets the structure, required blocks and products the article uses'}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-data-[open]:rotate-180" />
        </ListboxButton>

        <ListboxOptions ref={pagedWheel} anchor={{ to: 'bottom start', gap: 6 }} transition className={PANEL_CLASS}>
          {CONTENT_BLUEPRINTS.map((blueprint) => (
            <ListboxOption key={blueprint.value} value={blueprint.value} className={`${OPTION_CLASS} items-start`}>
              <span className="transition-transform duration-200 group-data-[focus]:scale-110">
                <IconChip style={styleFor(blueprint.value)} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                  {blueprint.label}
                  {blueprint.value === 'default' && (
                    <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-gray-500">{blueprint.description}</span>
                <BlockChips value={blueprint.value} />
              </span>
              <Check className="mt-1 h-4 w-4 shrink-0 text-blue-600 opacity-0 transition-opacity group-data-[selected]:opacity-100" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>

      {chosen && style && (
        <div key={value} className={`animate-pick-fade rounded-lg border-l-4 px-3 py-2 ${style.accent}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">What you&apos;ll get</p>
          <ol className="mt-1 space-y-0.5">
            {style.outline.map((line, index) => (
              <li
                key={line}
                className="flex animate-pick-fade items-center gap-2 text-sm text-gray-700"
                style={{ animationDelay: `${60 + index * 50}ms` }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                {line}
              </li>
            ))}
          </ol>
          <p className="mt-1.5 text-xs text-gray-500">
            Plus the quick answer, key takeaways and FAQ every article gets.
          </p>
        </div>
      )}
    </div>
  );
}
