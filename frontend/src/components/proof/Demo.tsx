'use client';

import { useEffect, useState } from 'react';
import { Check, FileText, Link2, Package, Send, Sparkles } from 'lucide-react';
import { DEMO_PRODUCTS, STEPS } from '@/lib/proof/content';
import { useProofTrack } from './ProofProvider';

const STEP_ICONS = [Package, Sparkles, Send];
const AUTOPLAY_MS = 4500;

/**
 * A looping walk-through of the three steps. It plays on its own until the visitor
 * picks a step or a product, then stays where they put it.
 */
export default function Demo() {
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(DEMO_PRODUCTS[0].id);
  const [autoplay, setAutoplay] = useState(true);
  const send = useProofTrack();
  const product = DEMO_PRODUCTS.find((p) => p.id === productId) ?? DEMO_PRODUCTS[0];

  useEffect(() => {
    if (!autoplay) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setStep((s) => (s + 1) % STEPS.length), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, step]);

  const goTo = (index: number) => {
    setAutoplay(false);
    setStep(index);
    send('demo_interaction', { action: 'step', step: index + 1 });
  };

  const pick = (id: string) => {
    setAutoplay(false);
    setProductId(id);
    setStep(1);
    send('demo_interaction', { action: 'select_product', product: id });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr] lg:gap-10">
      <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {STEPS.map((item, index) => {
          const Icon = STEP_ICONS[index];
          const active = index === step;
          return (
            <li key={item.title}>
              <button
                type="button"
                onClick={() => goTo(index)}
                aria-current={active ? 'step' : undefined}
                className={`relative flex h-full w-full gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${
                  active
                    ? 'border-blue-200 bg-white shadow-lg shadow-blue-600/10'
                    : 'border-gray-200 bg-white/60 hover:border-blue-200 hover:bg-white'
                }`}
              >
                <span
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-blue-600">
                    Step {index + 1}
                  </span>
                  <span className="mt-0.5 block font-semibold text-gray-900">{item.title}</span>
                  <span className="mt-1 block text-sm text-gray-600">{item.body}</span>
                </span>
                {active && autoplay && (
                  <span
                    aria-hidden
                    key={`${step}-${productId}`}
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left animate-demo-progress bg-blue-500 motion-reduce:hidden"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {/* The mock app window. */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-blue-900/5">
        <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
          <span className="ml-3 truncate text-xs text-gray-400">
            {['Select a product', 'Generated article', 'Published to Shopify'][step]}
          </span>
        </div>

        <div className="min-h-[22rem] p-5 sm:p-6" aria-live="polite">
          {step === 0 && (
            <div key="pick" className="animate-demo-in">
              <p className="text-sm font-medium text-gray-900">Your Shopify products</p>
              <p className="text-xs text-gray-500">Pick one to write about</p>
              <ul className="mt-4 space-y-2">
                {DEMO_PRODUCTS.map((item) => {
                  const selected = item.id === productId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => pick(item.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                          selected
                            ? 'border-blue-300 bg-blue-50/60'
                            : 'border-gray-200 hover:border-blue-200 hover:bg-gray-50'
                        }`}
                      >
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600">
                          <Package className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
                          <span className="block text-xs text-gray-500">
                            {item.collection} · {item.price}
                          </span>
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300'
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 1 && (
            <div key={`article-${product.id}`} className="animate-demo-in">
              <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                Written from “{product.name}”
              </div>
              <h3 className="mt-3 text-lg font-bold leading-snug text-gray-900 sm:text-xl">
                {product.article.title}
              </h3>
              <p className="mt-2 rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                <span className="font-semibold text-gray-700">Meta description: </span>
                {product.article.meta}
              </p>
              <ul className="mt-4 space-y-2">
                {product.article.outline.map((heading) => (
                  <li key={heading} className="flex items-start gap-2 text-sm text-gray-700">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                    {heading}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.article.links.map((link) => (
                  <span
                    key={link}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    <Link2 className="h-3 w-3" />
                    {link}
                  </span>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div key={`publish-${product.id}`} className="animate-demo-in">
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white">
                  <Check className="h-5 w-5" strokeWidth={3} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Published to your Shopify blog</p>
                  <p className="truncate text-xs text-gray-600">{product.article.title}</p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-medium text-gray-500">Search Console, over the following months</p>
                {/* A shape, not data: the real numbers are in the proof section above. */}
                <svg viewBox="0 0 300 90" className="mt-3 h-24 w-full" aria-hidden>
                  <defs>
                    <linearGradient id="demo-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 82 C40 80 60 78 90 72 S140 58 170 50 S230 30 300 12 L300 90 L0 90 Z"
                    fill="url(#demo-fill)"
                  />
                  <path
                    d="M0 82 C40 80 60 78 90 72 S140 58 170 50 S230 30 300 12"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="animate-demo-draw [stroke-dasharray:400]"
                  />
                </svg>
                <p className="mt-2 text-xs text-gray-500">
                  Illustration. Organic growth takes time and varies by store — see the real
                  timeline below.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
