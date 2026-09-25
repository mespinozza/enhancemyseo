'use client';

import { Check, TrendingUp, XCircle } from 'lucide-react';
import {
  CHART_HEIGHT,
  CHART_SERIES,
  CHART_WIDTH,
  chartAreaPath,
  chartLength,
  chartLinePath,
  chartPoints,
  chartValueAt,
  heroRestState,
  heroStateAt,
  pointAtProgress,
  PROBLEMS,
  SOLUTIONS,
  HERO_LOOP_MS,
} from '@/lib/home/hero';
import { useSectionClock } from './useSectionClock';

const POINTS = chartPoints();
const LINE = chartLinePath(POINTS);
const AREA = chartAreaPath(POINTS);
const LENGTH = chartLength(POINTS);

export default function HeroPanels() {
  const { containerRef, elapsed, animated } = useSectionClock(HERO_LOOP_MS - 1);
  const state = animated ? heroStateAt(elapsed) : heroRestState();

  const head = pointAtProgress(state.chart, POINTS);
  const clicks = chartValueAt(state.chart);

  return (
    <div ref={containerRef} className="space-y-3">
      {/* The problem */}
      <div className="rounded-xl bg-white p-5 shadow-lg transition-transform duration-200 hover:-translate-y-1">
        <h3 className="mb-3 flex items-center text-lg font-semibold text-red-500">
          <XCircle className="mr-2 h-5 w-5 flex-shrink-0" />
          The problem with most SEO tools:
        </h3>
        <ul className="space-y-1">
          {PROBLEMS.map((text, index) => {
            const { visible, flash } = state.problems[index];
            return (
              <li
                key={text}
                // Inline because the flash is a continuous value, not a class: it eases
                // from lit to clear instead of blinking on and off.
                style={{
                  backgroundColor: `rgba(239, 68, 68, ${flash * 0.12})`,
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'none' : 'translateY(4px)',
                }}
                className="flex items-start gap-3 rounded-md px-2 py-1 text-gray-700 transition-[opacity,transform] duration-500 motion-reduce:transform-none"
              >
                <span
                  className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors duration-300"
                  style={{ backgroundColor: flash > 0.05 ? '#ef4444' : '#9ca3af' }}
                />
                {text}
              </li>
            );
          })}
        </ul>
      </div>

      {/* The answer */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 p-5 text-white shadow-lg transition-transform duration-200 hover:-translate-y-1">
        <h3 className="mb-3 flex items-center text-lg font-semibold">
          <Check className="mr-2 h-5 w-5 flex-shrink-0" />
          Our tool does this on auto-pilot:
        </h3>
        <ul className="space-y-1">
          {SOLUTIONS.map((text, index) => {
            const { visible, flash } = state.solutions[index];
            return (
              <li
                key={text}
                style={{
                  backgroundColor: `rgba(74, 222, 128, ${flash * 0.35})`,
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'none' : 'translateY(4px)',
                }}
                className="flex items-start gap-3 rounded-md px-2 py-1 transition-[opacity,transform] duration-500 motion-reduce:transform-none"
              >
                <span
                  className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor: flash > 0.05 ? '#4ade80' : 'rgba(255, 255, 255, 0.2)',
                    color: flash > 0.05 ? '#14532d' : '#ffffff',
                  }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {text}
              </li>
            );
          })}
        </ul>
      </div>

      {/* The result */}
      <div className="rounded-xl bg-gray-900 p-5 text-white shadow-lg transition-transform duration-200 hover:-translate-y-1">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h3 className="flex items-center text-lg font-semibold">
            <TrendingUp className="mr-2 h-5 w-5 flex-shrink-0 text-green-400" />
            Organic results with our tools:
          </h3>
          <div className="text-right">
            {/* Tabular figures: a counter that changes width jitters the whole row. */}
            <div className="text-xl font-semibold tabular-nums text-green-400">
              {clicks.toLocaleString()}
            </div>
            <div className="whitespace-nowrap text-[11px] text-gray-400">
              clicks generated organically
            </div>
          </div>
        </div>

        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT + 18}`}
          // Width only: a fixed height letterboxes the plot and leaves dead space at
          // both ends, because the viewBox keeps its own aspect ratio.
          className="w-full"
          role="img"
          aria-label={`Organic clicks generated, rising from ${CHART_SERIES[0].value.toLocaleString()} in ${CHART_SERIES[0].label} to ${CHART_SERIES[CHART_SERIES.length - 1].value.toLocaleString()} in ${CHART_SERIES[CHART_SERIES.length - 1].label}`}
        >
          <defs>
            <linearGradient id="hero-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            {/* The fill is revealed by a wipe that tracks the line being drawn. */}
            <clipPath id="hero-chart-clip">
              <rect x="0" y="0" width={CHART_WIDTH * state.chart} height={CHART_HEIGHT} />
            </clipPath>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={CHART_WIDTH}
              y1={CHART_HEIGHT * fraction}
              y2={CHART_HEIGHT * fraction}
              stroke="#374151"
              strokeWidth="1"
              strokeDasharray={fraction === 1 ? undefined : '3 5'}
            />
          ))}

          <path d={AREA} fill="url(#hero-chart-fill)" clipPath="url(#hero-chart-clip)" />

          <path
            d={LINE}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={LENGTH}
            strokeDashoffset={LENGTH * (1 - state.chart)}
          />

          {POINTS.map((point, index) => (
            <circle
              key={point.label}
              cx={point.x}
              cy={point.y}
              r="2.5"
              fill="#0f172a"
              stroke="#3b82f6"
              strokeWidth="1.5"
              opacity={state.chart >= index / (POINTS.length - 1) ? 1 : 0}
            />
          ))}

          {/* The head of the line, so the draw has something to follow. */}
          <circle cx={head.x} cy={head.y} r="4" fill="#4ade80" />

          {POINTS.map((point, index) => (
            <text
              key={`${point.label}-label`}
              x={index === 0 ? 2 : index === POINTS.length - 1 ? CHART_WIDTH - 2 : point.x}
              y={CHART_HEIGHT + 14}
              textAnchor={index === 0 ? 'start' : index === POINTS.length - 1 ? 'end' : 'middle'}
              fill="#6b7280"
              fontSize="9"
            >
              {point.label}
            </text>
          ))}
        </svg>

        <p className="mt-2 text-center text-base font-semibold">
          Content Reaching <span className="text-blue-500">Page #1</span> Google Rankings
        </p>
      </div>
    </div>
  );
}


