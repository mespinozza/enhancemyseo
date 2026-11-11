'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Check, FileCheck2, ImageIcon, Loader2, Package, Search, ShoppingBag, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ThumbnailCanvas from '@/components/thumbnail/ThumbnailCanvas';

const SAMPLES = [
  {
    keyword: 'best commercial ice machine for a small cafe',
    title: 'Best Commercial Ice Machine For A Small Cafe',
    products: ['Ice Machines', 'Hoshizaki', 'Manitowoc'],
    color: '#2563eb',
  },
  {
    keyword: 'how to choose running shoes for flat feet',
    title: 'How To Choose Running Shoes For Flat Feet',
    products: ['Stability Shoes', 'Insoles', 'Brooks'],
    color: '#f97316',
  },
  {
    keyword: 'burr vs blade coffee grinder for espresso',
    title: 'Burr vs Blade Coffee Grinder For Espresso',
    products: ['Grinders', 'Baratza', 'Espresso Beans'],
    color: '#111827',
  },
];

const STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: Search, label: 'Picking the next keyword' },
  { icon: Package, label: 'Pulling in your products' },
  { icon: FileCheck2, label: 'Writing and fact-checking' },
  { icon: ImageIcon, label: 'Designing the thumbnail' },
  { icon: ShoppingBag, label: 'Publishing to Shopify' },
];

const STEP_MS = 1700;
const HOLD_MS = 3200;

/**
 * One automation run, step by step, for the landing page hero. Rendered finished on the
 * server and for reduced motion; animated through a few example stores once mounted.
 */
export default function AutomationRunPreview() {
  const [sample, setSample] = useState(0);
  const [step, setStep] = useState(STEPS.length);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let current = 0;
    let which = 0;
    let timer: ReturnType<typeof setTimeout>;
    setStep(0);
    const advance = () => {
      current += 1;
      setStep(current);
      if (current < STEPS.length) {
        timer = setTimeout(advance, STEP_MS);
      } else {
        timer = setTimeout(() => {
          which = (which + 1) % SAMPLES.length;
          current = 0;
          setSample(which);
          setStep(0);
          timer = setTimeout(advance, STEP_MS);
        }, HOLD_MS);
      }
    };
    timer = setTimeout(advance, STEP_MS);
    return () => clearTimeout(timer);
  }, []);

  const { keyword, title, products, color } = SAMPLES[sample];
  const done = step >= STEPS.length;
  const published = 7 + sample + (done ? 1 : 0);

  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-blue-200/50 via-indigo-200/30 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl shadow-blue-900/10 ring-1 ring-gray-200">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Workflow className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">Weekly growth plan</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <CalendarClock className="h-3.5 w-3.5" /> Mon, Wed and Fri at 9:00 AM
              </p>
            </div>
          </div>
          <span className="flex-shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">On</span>
        </div>

        <ol className="space-y-1 px-5 py-4" aria-label="What one run does">
          {STEPS.map(({ icon: Icon, label }, index) => {
            const state = index < step ? 'done' : index === step ? 'active' : 'waiting';
            return (
              <li key={label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-300 ${
                      state === 'done' ? 'bg-green-500 text-white' : state === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  </span>
                  {index < STEPS.length - 1 && <span className={`my-0.5 w-px flex-1 ${index < step ? 'bg-green-300' : 'bg-gray-200'}`} />}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className={`text-sm font-medium ${state === 'waiting' ? 'text-gray-400' : 'text-gray-900'}`}>{label}</p>
                  <div
                    aria-hidden={state === 'waiting'}
                    className={`mt-1.5 text-xs text-gray-600 transition-opacity duration-300 ${state === 'waiting' ? 'invisible opacity-0' : 'opacity-100'}`}
                  >
                      {index === 0 && <span className="inline-block rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700">{keyword}</span>}
                      {index === 1 && (
                        <span className="flex flex-wrap gap-1.5">
                          {products.map((product) => (
                            <span key={product} className="rounded-md bg-gray-100 px-2 py-1 text-gray-700">
                              {product}
                            </span>
                          ))}
                        </span>
                      )}
                      {index === 2 && (
                        <span className="block h-1.5 w-full max-w-[14rem] overflow-hidden rounded-full bg-gray-100">
                          <span
                            className={`block h-full rounded-full bg-blue-500 transition-[width] ease-out ${state === 'done' ? 'w-full duration-300' : state === 'active' ? 'w-3/4 duration-[1500ms]' : 'w-0'}`}
                          />
                        </span>
                      )}
                      {index === 3 && (
                        <span className="block w-40 overflow-hidden rounded-md ring-1 ring-gray-200">
                          <ThumbnailCanvas title={title} layout="parts-plus" color={color} brand="Your Brand" seed={sample + 21} label={`Thumbnail for ${title}`} eager />
                        </span>
                      )}
                      {index === 4 && <span>{state === 'done' ? 'Saved as a draft on your Shopify blog' : 'Sending the article and image'}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-500">
          <span>Next run Wednesday 9:00 AM</span>
          <span className="font-medium text-gray-700">{published} of 30 articles this month</span>
        </div>
      </div>
    </div>
  );
}
