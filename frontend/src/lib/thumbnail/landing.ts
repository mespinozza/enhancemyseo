import type { ThumbnailLayout } from './design';

/**
 * Copy for the /services/thumbnail-generation landing page. The case study figures come
 * from the proof page's EVIDENCE, so both pages always quote the same Search Console tiles.
 */

/** Articles in the case study, every one published with a thumbnail from the tool. */
export const CASE_STUDY_ARTICLES = 250;

/** Rounded headline figure for impressions across client sites; the case study tiles give the exact count. */
export const IMPRESSIONS_HEADLINE = '3M+';

export interface SampleThumbnail {
  title: string;
  category: string;
  layout: ThumbnailLayout;
  color: string;
  seed: number;
}

/** Example articles across niches; the gallery shows a random few with a random style each. */
export const SAMPLE_ARTICLES: { title: string; category: string }[] = [
  { title: 'Combi Oven Error Codes Explained', category: 'Kitchen Equipment' },
  { title: 'Best Running Shoes For Flat Feet', category: 'Footwear' },
  { title: 'How To Choose A Dog Harness', category: 'Pet Supplies' },
  { title: 'Retinol vs Vitamin C: Which First?', category: 'Skincare' },
  { title: 'Espresso Grind Size Guide', category: 'Coffee' },
  { title: 'Winter Tyres: When To Switch', category: 'Auto Parts' },
  { title: 'How To Style A Small Living Room', category: 'Home Decor' },
  { title: 'Protein Powder For Beginners', category: 'Nutrition' },
  { title: 'Organic Cotton vs Bamboo Sheets', category: 'Bedding' },
  { title: 'How To Clean A Cast Iron Pan', category: 'Cookware' },
  { title: 'Choosing Your First Road Bike', category: 'Cycling' },
  { title: 'Safe Sleep Tips For Newborns', category: 'Baby' },
];

export const SAMPLE_COLORS = ['#2563eb', '#5cb85c', '#f97316', '#111827', '#db2777', '#7c3aed', '#0d9488', '#dc2626'];

export const PLAYGROUND_COLORS = ['#2563eb', '#5cb85c', '#f97316', '#111827', '#db2777', '#facc15'];

export const PLAYGROUND_DEFAULT_TITLE = 'Best Running Shoes For Flat Feet';

export const STYLE_SAMPLE_TITLE = 'The Complete Coffee Grinder Buying Guide';

export const WHY_POINTS = [
  {
    icon: 'discover',
    title: 'Eligible for big previews',
    body: 'Google Discover and rich results favour large, high-quality images. Google recommends at least 1200px wide; every thumbnail here is 1600 × 900.',
  },
  {
    icon: 'image',
    title: 'A second way to be found',
    body: 'Each featured image goes up with the article title as its alt text, so it can surface in Google Images as well as web search.',
  },
  {
    icon: 'share',
    title: 'Clicks from every share',
    body: 'Your featured image becomes the preview card when an article is shared on social, in chat apps and in newsletters. A blank card gets scrolled past.',
  },
  {
    icon: 'brand',
    title: 'A blog that looks like a brand',
    body: 'Your colour, your logo and the same layout on every post. Readers recognise your articles in a feed before they read the name.',
  },
] as const;

export const STEPS = [
  {
    title: 'Pick the article',
    body: 'Choose any article you wrote with us or one already on your Shopify blog. Or switch thumbnails on and every new article gets one automatically.',
  },
  {
    title: 'AI designs it',
    body: 'We generate a photo made for that topic, then lay it out with your title, brand colour and logo in the style you choose.',
  },
  {
    title: 'Publish in one click',
    body: 'Tweak the text, colour or photo crop if you like, then set it as the featured image. On Shopify it goes straight onto the article.',
  },
] as const;

export const FEATURES = [
  { icon: 'sparkles', title: 'A photo for every topic', body: 'No stock photo hunting. Each thumbnail gets an AI photo made for what the article is about.' },
  { icon: 'palette', title: 'On brand, every time', body: 'Your colours and logo come from your brand profile, so every thumbnail matches without a designer.' },
  { icon: 'layout', title: 'Four proven layouts', body: 'Including the Parts Plus format used across the case study blog. Switch styles per article or set a default.' },
  { icon: 'pencil', title: 'Fully editable', body: 'Change the headline, panel side, edge, text size, photo zoom and focus. Reopen and edit any time.' },
  { icon: 'shopify', title: 'Pushes to Shopify', body: 'Set as the article’s featured image on your Shopify blog, with alt text, in one click.' },
  { icon: 'bot', title: 'Runs on autopilot', body: 'Turn thumbnails on in an automation and each scheduled article publishes with its own image.' },
] as const;

export const FAQS = [
  {
    q: 'What is an AI thumbnail generator for blogs?',
    a: 'It designs the featured image for a blog article for you. EnhanceMySEO generates a photo for the article’s topic, then lays it out with the title, your brand colour and your logo, ready to use as the article’s featured image.',
  },
  {
    q: 'What size are the thumbnails?',
    a: '1600 × 900 pixels, a 16:9 ratio. That is wider than the 1200px Google recommends for large image previews, and it crops well into blog grids and social share cards.',
  },
  {
    q: 'Can I edit a thumbnail after it’s made?',
    a: 'Yes. Open it in the thumbnail studio to change the headline, layout, colours, panel side, edge style, text size, logo and how the photo is cropped. The design is saved, so you can reopen it later.',
  },
  {
    q: 'Does it work with Shopify?',
    a: 'Yes. Connect your store and you can make thumbnails for articles already on your Shopify blog, then set them as the featured image in one click. Articles written with EnhanceMySEO can get theirs automatically.',
  },
  {
    q: 'How many thumbnails do I get?',
    a: 'Kickstart includes 50 thumbnail photos a month and SEO Takeover includes 180. If you run out, you can buy 20 extra photos for $10; extras never expire. Editing a thumbnail you already made doesn’t use a photo.',
  },
  {
    q: 'Are thumbnails included on the free plan?',
    a: 'The free plan includes two articles a month so you can see the writing quality. Thumbnails come with the paid plans, and you can try every layout in the preview on this page first.',
  },
  {
    q: 'Do thumbnails help SEO?',
    a: 'Indirectly, and it adds up. A good featured image makes an article eligible for large previews in Google Discover, can rank in Google Images through its alt text, and gets more clicks when the article is shared. It won’t rank a weak article on its own.',
  },
] as const;
