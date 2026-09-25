/**
 * The home page testimonials.
 *
 * Static on purpose. The carousel used to fetch a freshly written set on mount and
 * again every five minutes, which is what made it feel unstable: the words changed
 * under whoever was reading them, and because the incoming list could be shorter than
 * the slide you were on, the rotation could land on a slide that no longer existed and
 * show nothing at all.
 *
 * Like the demo above it, the rotation is a pure function of elapsed time rather than a
 * counter nudged along by an interval, so a hidden tab, a dropped frame or a remount all
 * resolve to the same slide instead of drifting.
 */

export interface Review {
  id: string;
  firstName: string;
  lastName: string;
  /** Out of five; halves are rendered as a half-lit star. */
  rating: number;
  text: string;
  storeType: string;
  revenueRange: string;
}

/** How long one testimonial holds. Long enough to read a hundred words without rushing. */
export const REVIEW_MS = 9_000;

export const REVIEWS: Review[] = [
  {
    id: 'sarah',
    firstName: 'Sarah',
    lastName: 'Thompson',
    rating: 5,
    text: "This AI tool has completely transformed how I create content for my store. The keyword research is spot-on and the articles are engaging and SEO-optimized. It's like having a full content team at my fingertips!",
    storeType: 'Fashion & Accessories',
    revenueRange: '6-figure',
  },
  {
    id: 'michael',
    firstName: 'Michael',
    lastName: 'Chen',
    rating: 4.5,
    text: 'The automated content generation has saved me countless hours. The articles are well-researched and perfectly aligned with my brand voice. My organic traffic has increased by 150% since I started using this tool.',
    storeType: 'Health & Wellness',
    revenueRange: '5-figure',
  },
  {
    id: 'david',
    firstName: 'David',
    lastName: 'Wilson',
    rating: 5,
    text: 'Finally, a content solution that understands e-commerce! The articles are engaging, informative, and drive real results. My conversion rate has improved significantly since implementing the content strategy.',
    storeType: 'Electronics',
    revenueRange: '6-figure',
  },
  {
    id: 'emma',
    firstName: 'Emma',
    lastName: 'Rodriguez',
    rating: 5,
    text: "The AI-generated content has helped me scale my store's organic reach tremendously. The articles are not just SEO-friendly but also genuinely helpful to my customers. This tool pays for itself many times over!",
    storeType: 'Beauty & Cosmetics',
    revenueRange: '5-figure',
  },
  {
    id: 'james',
    firstName: 'James',
    lastName: 'Anderson',
    rating: 5,
    text: 'I was skeptical about AI-generated content at first, but this tool exceeded all my expectations. The keyword research is incredibly accurate, and the content quality is outstanding. A game-changer for my business!',
    storeType: 'Home & Garden',
    revenueRange: '6-figure',
  },
];

/** Surnames are shown as an initial, the way verified-buyer badges usually are. */
export function maskSurname(lastName: string): string {
  if (!lastName) return '';
  return lastName.charAt(0) + '•'.repeat(Math.max(lastName.length - 1, 0));
}

/**
 * Which slide is showing.
 *
 * @param sinceMs Time since the rotation last restarted. Using a baseline rather than
 *   raw elapsed time is what gives a reader who just pressed next a full slide to read,
 *   instead of however much was left of the one they interrupted.
 * @param startIndex The slide that baseline began on.
 */
export function reviewIndexAt(sinceMs: number, startIndex: number, count: number): number {
  if (count <= 0) return 0;
  const advanced = Math.floor(Math.max(sinceMs, 0) / REVIEW_MS);
  return (((startIndex + advanced) % count) + count) % count;
}

/** How far the current slide has run, 0 to 1, for the progress bar. */
export function reviewProgressAt(sinceMs: number): number {
  if (sinceMs <= 0) return 0;
  return (sinceMs % REVIEW_MS) / REVIEW_MS;
}

/** Star fill states, so the card does not repeat the fractional rating logic. */
export function starFills(rating: number): ('full' | 'half' | 'empty')[] {
  return Array.from({ length: 5 }, (_, index) => {
    if (index < Math.floor(rating)) return 'full';
    if (index < rating) return 'half';
    return 'empty';
  });
}
