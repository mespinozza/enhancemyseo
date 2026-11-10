'use client';

import { useEffect, useState } from 'react';
import { THUMBNAIL_LAYOUTS } from '@/lib/thumbnail/design';
import { SAMPLE_ARTICLES, SAMPLE_COLORS, type SampleThumbnail } from '@/lib/thumbnail/landing';
import ThumbnailCanvas from './ThumbnailCanvas';

const COUNT = 4;

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomSamples(): SampleThumbnail[] {
  const colors = shuffled(SAMPLE_COLORS);
  const layouts = shuffled(THUMBNAIL_LAYOUTS);
  return shuffled(SAMPLE_ARTICLES)
    .slice(0, COUNT)
    .map((article, index) => ({
      ...article,
      layout: layouts[index % layouts.length].value,
      color: colors[index % colors.length],
      seed: Math.floor(Math.random() * 10_000),
    }));
}

/** Fixed for the server render, so hydration matches; shuffled once the page is live. */
const INITIAL: SampleThumbnail[] = SAMPLE_ARTICLES.slice(0, COUNT).map((article, index) => ({
  ...article,
  layout: THUMBNAIL_LAYOUTS[index % THUMBNAIL_LAYOUTS.length].value,
  color: SAMPLE_COLORS[index],
  seed: index + 11,
}));

export default function SampleGallery() {
  const [samples, setSamples] = useState(INITIAL);
  useEffect(() => setSamples(randomSamples()), []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {samples.map((sample) => (
        <article
          key={sample.title}
          className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-1 hover:shadow-lg"
        >
          <ThumbnailCanvas
            title={sample.title}
            layout={sample.layout}
            color={sample.color}
            brand="Your Brand"
            seed={sample.seed}
            label={`Example thumbnail: ${sample.title}`}
          />
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Blog · {sample.category}</p>
            <p className="mt-1 text-sm font-semibold leading-snug text-gray-900">{sample.title}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
