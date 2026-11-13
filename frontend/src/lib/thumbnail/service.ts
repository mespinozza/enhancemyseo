import { randomUUID } from 'crypto';
import { FieldValue, Timestamp, getFirestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';
import { meteredFetch } from '@/lib/ai/meter';
import {
  resolveShopifyCredentials,
} from '@/lib/shopify/credentials';
import { applyLogoStyle, defaultDesign, normalizeDesign, normalizeLogoStyle, type BrandLogoStyle, type ThumbnailDesign } from './design';
import { renderThumbnailPng } from './server';
import { THUMBNAIL_TIERS, THUMBNAILS_COLLECTION, type ThumbnailRecord, type ThumbnailTarget } from './types';

const STUDIO_TIERS = new Set(THUMBNAIL_TIERS);
/** Plans whose tutorial thumbnail arrives unlocked. */
const PAID_TIERS = new Set(['kickstart', 'seo_takeover', 'agency', 'admin']);
const TUTORIAL_CLAIMS = 'thumbnailTutorialClaims';

export interface ThumbnailAccess {
  tier: string;
  studio: boolean;
  paid: boolean;
}

export async function thumbnailAccess(uid: string, email: string | null): Promise<ThumbnailAccess> {
  const tier = await getServerUserSubscriptionStatus(uid, email);
  return { tier, studio: STUDIO_TIERS.has(tier), paid: PAID_TIERS.has(tier) };
}

/**
 * The tutorial's thumbnail comes with a paid plan, one per account, and doesn't count
 * against the month's photos. Free accounts are shown what they would get, drawn in the
 * browser, and never cost an image generation.
 */
export async function claimTutorialThumbnail(uid: string, access: ThumbnailAccess): Promise<boolean> {
  if (!access.paid) return false;
  initializeFirebaseAdmin();
  try {
    // No userId field, so the generic owner rule never hands it to the browser.
    await getFirestore().collection(TUTORIAL_CLAIMS).doc(uid).create({ at: Timestamp.now() });
    return true;
  } catch {
    return false;
  }
}

export async function releaseTutorialThumbnail(uid: string): Promise<void> {
  initializeFirebaseAdmin();
  await getFirestore().collection(TUTORIAL_CLAIMS).doc(uid).delete().catch(() => undefined);
}

/* ------------------------------------------------------------------ storage ----- */

const ownPrefix = (uid: string) => `thumbnails/${uid}/`;

async function saveObject(path: string, bytes: Buffer, contentType: string, publicUrl: boolean) {
  initializeFirebaseAdmin();
  const bucket = getStorage().bucket();
  const token = publicUrl ? randomUUID() : null;
  try {
    await bucket.file(path).save(bytes, {
      contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
        ...(token && { metadata: { firebaseStorageDownloadTokens: token } }),
      },
    });
  } catch (error) {
    if (/bucket does not exist/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error(
        `Image storage is not set up: the bucket "${bucket.name}" does not exist. Create it under Firebase console > Storage, ` +
          'then set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to its name.',
      );
    }
    throw error;
  }
  return token ? publicUrlFor(bucket.name, path, token) : null;
}

function publicUrlFor(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

/** Adds a download token to an object saved without one, for a thumbnail being unlocked. */
async function mintPublicUrl(path: string): Promise<string> {
  initializeFirebaseAdmin();
  const bucket = getStorage().bucket();
  const token = randomUUID();
  await bucket.file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  return publicUrlFor(bucket.name, path, token);
}

/** Reads one of the caller's own objects. Anything outside their folder is refused. */
export async function readOwnObject(uid: string, path: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!path.startsWith(ownPrefix(uid)) || path.includes('..')) return null;
  initializeFirebaseAdmin();
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [[bytes], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  return { bytes, contentType: String(metadata.contentType || 'image/png') };
}

async function deleteObject(path: string | undefined | null) {
  if (!path) return;
  await getStorage().bucket().file(path).delete().catch(() => undefined);
}

/* ------------------------------------------------------------------- photos ----- */

export function photoPrompt(input: {
  title: string;
  keyword?: string | null;
  brandName?: string;
  businessType?: string;
  panelSide: 'left' | 'right';
  layout?: ThumbnailDesign['layout'];
  direction?: string;
}): string {
  const side = input.panelSide === 'right' ? 'left' : 'right';
  const composition =
    input.layout === 'bold-banner'
      ? `Keep the main subject in the upper ${side} of the frame; the lower ${input.panelSide} area will carry a headline over a dark fade.`
      : input.layout === 'center-stage'
        ? 'Spread the scene across the full width with interest near the left and right edges; the centre will be covered by a text card.'
        : `Keep the main subject in the ${side} 55% of the frame; the other side will be covered by a text panel.`;
  return [
    `Photorealistic editorial photograph for a blog article titled "${input.title}".`,
    input.keyword ? `Topic: ${input.keyword}.` : '',
    input.brandName || input.businessType
      ? `It is for ${[input.brandName, input.businessType].filter(Boolean).join(', a ')}.`
      : '',
    'Show a believable real-world scene that illustrates the topic: real people, equipment or products being used in a real setting, natural light, shallow depth of field, crisp detail.',
    composition,
    input.direction ? `Art direction: ${input.direction}.` : '',
    'No text, letters, numbers, logos, watermarks or signage anywhere in the image.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** OpenAI retires image models; the env var swaps one in without a deploy of new code. */
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2';

export async function generatePhoto(prompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  const response = await meteredFetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'jpeg',
      output_compression: 88,
      n: 1,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { b64_json?: string }[];
    error?: { message?: string };
  };
  const b64 = payload.data?.[0]?.b64_json;
  if (!response.ok || !b64) {
    throw new Error(payload.error?.message || `Image generation failed with status ${response.status}`);
  }
  return Buffer.from(b64, 'base64');
}

/* ------------------------------------------------------------------ records ----- */

interface StoredThumbnail {
  userId: string;
  brandId: string;
  title: string;
  keyword: string | null;
  target: ThumbnailTarget | null;
  design: ThumbnailDesign;
  photoPath: string | null;
  logoPath: string | null;
  imagePath: string;
  imageUrl: string | null;
  status: ThumbnailRecord['status'];
  locked: boolean;
  shopifyAdminUrl?: string | null;
  error?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const iso = (value: unknown) =>
  value instanceof Timestamp ? value.toDate().toISOString() : null;

/** Locked thumbnails unlock themselves once the account is on a paid plan. */
export async function toRecord(snap: DocumentSnapshot, access: ThumbnailAccess): Promise<ThumbnailRecord> {
  const data = snap.data() as StoredThumbnail;
  let { imageUrl, locked } = data;
  if (locked && access.paid) {
    imageUrl = await mintPublicUrl(data.imagePath);
    locked = false;
    await snap.ref.update({ imageUrl, locked: false, updatedAt: Timestamp.now() });
  }
  const asset = (path: string | null) => (path ? `/api/thumbnails/asset?path=${encodeURIComponent(path)}` : null);
  return {
    id: snap.id,
    brandId: data.brandId,
    title: data.title,
    keyword: data.keyword ?? null,
    target: data.target ?? null,
    design: normalizeDesign(data.design, data.title),
    logoPath: data.logoPath ?? null,
    imageUrl: locked ? null : imageUrl,
    previewUrl: `${asset(data.imagePath)}${locked ? '&preview=1' : ''}&v=${data.updatedAt?.toMillis?.() ?? 0}`,
    photoUrl: locked ? null : asset(data.photoPath),
    status: data.status,
    locked,
    shopifyAdminUrl: data.shopifyAdminUrl ?? null,
    error: data.error ?? null,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

export async function loadOwnThumbnail(uid: string, id: string): Promise<DocumentSnapshot | null> {
  initializeFirebaseAdmin();
  const snap = await getFirestore().collection(THUMBNAILS_COLLECTION).doc(id).get();
  return snap.exists && snap.get('userId') === uid ? snap : null;
}

async function brandFor(uid: string, brandId: string) {
  const snap = await getFirestore().collection('brandProfiles').doc(brandId).get();
  if (!snap.exists || snap.get('userId') !== uid) throw new Error('Brand profile not found');
  return snap;
}

/** Generates the photo, draws the default design and stores both. */
export async function createThumbnail(input: {
  uid: string;
  brandId: string;
  title: string;
  keyword?: string | null;
  target?: ThumbnailTarget | null;
  design?: Partial<ThumbnailDesign> | null;
  direction?: string;
  locked?: boolean;
}): Promise<DocumentSnapshot> {
  initializeFirebaseAdmin();
  const db = getFirestore();
  const brand = await brandFor(input.uid, input.brandId);
  const logoPath: string | null = brand.get('thumbnailLogoPath') ?? null;
  const base = defaultDesign({
    title: input.title,
    brandName: brand.get('brandName'),
    brandColor: brand.get('thumbnailColor') || brand.get('brandColor'),
    layout: input.design?.layout,
  });
  const design = normalizeDesign(
    {
      ...base,
      logo: applyLogoStyle(base.logo, normalizeLogoStyle(brand.get('thumbnailLogo')), Boolean(logoPath)),
      ...input.design,
    },
    input.title,
  );

  const photo = await generatePhoto(
    photoPrompt({
      title: input.title,
      keyword: input.keyword,
      brandName: brand.get('brandName'),
      businessType: brand.get('businessType'),
      panelSide: design.panelSide,
      layout: design.layout,
      direction: input.direction,
    }),
  );
  const logo = logoPath ? (await readOwnObject(input.uid, logoPath))?.bytes ?? null : null;
  const png = await renderThumbnailPng(design, { photo, logo });

  const ref = db.collection(THUMBNAILS_COLLECTION).doc();
  const folder = `${ownPrefix(input.uid)}${ref.id}`;
  const photoPath = `${folder}/photo-${Date.now()}.jpg`;
  const imagePath = `${folder}/thumbnail-${Date.now()}.png`;
  await saveObject(photoPath, photo, 'image/jpeg', false);
  const imageUrl = await saveObject(imagePath, png, 'image/png', !input.locked);

  const now = Timestamp.now();
  const record: StoredThumbnail = {
    userId: input.uid,
    brandId: input.brandId,
    title: input.title,
    keyword: input.keyword ?? null,
    target: input.target ?? null,
    design,
    photoPath,
    logoPath,
    imagePath,
    imageUrl,
    status: 'draft',
    locked: Boolean(input.locked),
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(record);
  if (record.target && !record.locked) await linkTarget(input.uid, ref.id);
  return ref.get();
}

/** Stores an image drawn in the editor, with the design that produced it. */
export async function saveEdit(uid: string, snap: DocumentSnapshot, design: ThumbnailDesign, png: Buffer) {
  const data = snap.data() as StoredThumbnail;
  const imagePath = `${ownPrefix(uid)}${snap.id}/thumbnail-${Date.now()}.png`;
  const imageUrl = await saveObject(imagePath, png, 'image/png', true);
  const brand = await brandFor(uid, data.brandId).catch(() => null);
  await snap.ref.update({
    design,
    logoPath: brand?.get('thumbnailLogoPath') ?? null,
    title: design.title || data.title,
    imagePath,
    imageUrl,
    // A pushed image no longer matches Shopify until it is pushed again.
    status: data.status === 'pushed' ? 'linked' : data.status,
    error: null,
    updatedAt: Timestamp.now(),
  });
  await deleteObject(data.imagePath);
  if (data.target) await linkTarget(uid, snap.id);
}

/** A fresh photo for an existing thumbnail, redrawn with its current design. */
export async function regeneratePhoto(uid: string, snap: DocumentSnapshot, direction?: string) {
  const data = snap.data() as StoredThumbnail;
  initializeFirebaseAdmin();
  const brand = await brandFor(uid, data.brandId);
  const design = normalizeDesign(data.design, data.title);
  const photo = await generatePhoto(
    photoPrompt({
      title: design.title || data.title,
      keyword: data.keyword,
      brandName: brand.get('brandName'),
      businessType: brand.get('businessType'),
      panelSide: design.panelSide,
      layout: design.layout,
      direction,
    }),
  );
  const logoPath: string | null = brand.get('thumbnailLogoPath') ?? null;
  const logo = logoPath ? (await readOwnObject(uid, logoPath))?.bytes ?? null : null;
  const png = await renderThumbnailPng(design, { photo, logo });
  const folder = `${ownPrefix(uid)}${snap.id}`;
  const photoPath = `${folder}/photo-${Date.now()}.jpg`;
  const imagePath = `${folder}/thumbnail-${Date.now()}.png`;
  await saveObject(photoPath, photo, 'image/jpeg', false);
  const imageUrl = await saveObject(imagePath, png, 'image/png', true);
  await snap.ref.update({ photoPath, imagePath, imageUrl, logoPath, updatedAt: Timestamp.now() });
  await Promise.all([deleteObject(data.photoPath), deleteObject(data.imagePath)]);
  if (data.target) await linkTarget(uid, snap.id);
}

/**
 * Redraws an existing thumbnail with the brand's current logo, keeping its photo, text
 * and layout. No new photo is generated, so it costs no credit.
 */
export async function applyBrandLogo(uid: string, snap: DocumentSnapshot) {
  const data = snap.data() as StoredThumbnail;
  initializeFirebaseAdmin();
  const brand = await brandFor(uid, data.brandId);
  const logoPath: string | null = brand.get('thumbnailLogoPath') ?? null;
  const current = normalizeDesign(data.design, data.title);
  const design: ThumbnailDesign = {
    ...current,
    logo: applyLogoStyle(
      { ...current.logo, text: current.logo.text || brand.get('brandName') || '' },
      normalizeLogoStyle(brand.get('thumbnailLogo')) ?? (logoPath ? { mode: 'image', text: brand.get('brandName') ?? '', scale: 1 } : null),
      Boolean(logoPath),
    ),
  };
  const photo = data.photoPath ? (await readOwnObject(uid, data.photoPath))?.bytes : null;
  if (!photo) throw new Error('The photo for this thumbnail is missing');
  const logo = logoPath ? (await readOwnObject(uid, logoPath))?.bytes ?? null : null;
  const png = await renderThumbnailPng(design, { photo, logo });
  await saveEdit(uid, snap, design, png);
}

/** The brand's logo for every future thumbnail, kept outside any one thumbnail. */
export async function saveBrandLogo(uid: string, brandId: string, bytes: Buffer, contentType: string) {
  initializeFirebaseAdmin();
  const brand = await brandFor(uid, brandId);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${ownPrefix(uid)}logos/${brandId}-${Date.now()}.${extension}`;
  await saveObject(path, bytes, contentType, false);
  const previous: string | undefined = brand.get('thumbnailLogoPath');
  const style = normalizeLogoStyle(brand.get('thumbnailLogo'));
  await brand.ref.update({
    thumbnailLogoPath: path,
    thumbnailLogo: { text: style?.text ?? brand.get('brandName') ?? '', scale: style?.scale ?? 1, mode: 'image' },
  });
  if (previous && previous !== path) await deleteObject(previous);
  return path;
}

/** How the brand's logo is drawn on every future thumbnail. */
export async function saveBrandLogoStyle(uid: string, brandId: string, style: BrandLogoStyle) {
  initializeFirebaseAdmin();
  const brand = await brandFor(uid, brandId);
  await brand.ref.update({ thumbnailLogo: style });
}

/** Removes the brand's logo image; new thumbnails fall back to the brand name. */
export async function removeBrandLogo(uid: string, brandId: string) {
  initializeFirebaseAdmin();
  const brand = await brandFor(uid, brandId);
  const previous: string | undefined = brand.get('thumbnailLogoPath');
  const style = normalizeLogoStyle(brand.get('thumbnailLogo'));
  await brand.ref.update({
    thumbnailLogoPath: FieldValue.delete(),
    ...(style?.mode === 'image' && { thumbnailLogo: { ...style, mode: 'text' } }),
  });
  if (previous) await deleteObject(previous);
}

/**
 * Points the target article's featured image at this thumbnail. App articles get it in
 * `seo.featuredImage`, which the Shopify push already sends.
 */
export async function linkTarget(uid: string, id: string) {
  const db = getFirestore();
  const snap = await db.collection(THUMBNAILS_COLLECTION).doc(id).get();
  const data = snap.data() as StoredThumbnail | undefined;
  if (!data || data.userId !== uid || !data.target || !data.imageUrl) return;
  if (data.target.kind === 'blog') {
    const blog = db.collection('blogs').doc(data.target.blogId);
    const blogSnap = await blog.get();
    if (!blogSnap.exists || blogSnap.get('userId') !== uid) return;
    await blog.update({
      'seo.featuredImage': { src: data.imageUrl, alt: data.title },
      thumbnailId: id,
      updatedAt: Timestamp.now(),
    });
  }
  if (data.status === 'draft') await snap.ref.update({ status: 'linked' });
}

export async function setTarget(uid: string, snap: DocumentSnapshot, target: ThumbnailTarget | null) {
  const data = snap.data() as StoredThumbnail;
  if (data.target?.kind === 'blog' && (!target || target.kind !== 'blog' || target.blogId !== data.target.blogId)) {
    const old = getFirestore().collection('blogs').doc(data.target.blogId);
    const oldSnap = await old.get();
    if (oldSnap.exists && oldSnap.get('userId') === uid && oldSnap.get('thumbnailId') === snap.id) {
      await old.update({ 'seo.featuredImage': FieldValue.delete(), thumbnailId: FieldValue.delete() });
    }
  }
  if (target?.kind === 'blog') {
    const blog = await getFirestore().collection('blogs').doc(target.blogId).get();
    if (!blog.exists || blog.get('userId') !== uid) throw new Error('Article not found');
  }
  await snap.ref.update({ target, status: target ? data.status : 'draft', updatedAt: Timestamp.now() });
  if (target) await linkTarget(uid, snap.id);
}

/* ------------------------------------------------------------------ Shopify ----- */

async function setShopifyImage(
  shopDomain: string,
  accessToken: string,
  shopifyBlogId: string | number,
  articleId: string | number,
  image: { src: string; alt: string },
) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2023-10/blogs/${shopifyBlogId}/articles/${articleId}.json`,
    {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ article: { id: Number(articleId), image } }),
    },
  );
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Shopify refused the image (${response.status}) ${text.slice(0, 200)}`);
  }
}

export interface PushOutcome {
  id: string;
  ok: boolean;
  message: string;
  shopifyAdminUrl?: string;
}

/**
 * Sends one thumbnail to Shopify. An article already there gets its image replaced; an
 * app article not yet in Shopify is pushed with the thumbnail as its featured image.
 */
export async function pushThumbnail(
  uid: string,
  snap: DocumentSnapshot,
  options: { idToken: string; baseUrl: string; status: 'draft' | 'published'; shopifyBlogId?: string },
): Promise<PushOutcome> {
  const data = snap.data() as StoredThumbnail;
  const fail = async (message: string): Promise<PushOutcome> => {
    await snap.ref.update({ error: message, updatedAt: Timestamp.now() });
    return { id: snap.id, ok: false, message };
  };
  if (data.locked || !data.imageUrl) return fail('Upgrade to push this thumbnail');
  if (!data.target) return fail('Link it to an article first');

  const db = getFirestore();
  const image = { src: data.imageUrl, alt: data.title };
  const { shopDomain, accessToken } = await resolveShopifyCredentials(uid, { brandId: data.brandId });
  const adminUrl = (articleId: string | number) => `https://${shopDomain}/admin/articles/${articleId}`;

  const done = async (articleId: string | number, message: string): Promise<PushOutcome> => {
    const shopifyAdminUrl = adminUrl(articleId);
    await snap.ref.update({ status: 'pushed', error: null, shopifyAdminUrl, pushedAt: Timestamp.now(), updatedAt: Timestamp.now() });
    return { id: snap.id, ok: true, message, shopifyAdminUrl };
  };

  try {
    if (data.target.kind === 'shopify') {
      await setShopifyImage(shopDomain, accessToken, data.target.shopifyBlogId, data.target.articleId, image);
      return done(data.target.articleId, 'Image updated in Shopify');
    }

    const blogRef = db.collection('blogs').doc(data.target.blogId);
    const blog = await blogRef.get();
    if (!blog.exists || blog.get('userId') !== uid) return fail('The linked article no longer exists');

    const knownId = blog.get('shopifyArticleId');
    const knownBlog = blog.get('shopifyBlogId');
    if (knownId && knownBlog) {
      await setShopifyImage(shopDomain, accessToken, knownBlog, knownId, image);
      return done(knownId, 'Image updated in Shopify');
    }

    const brand = await brandFor(uid, data.brandId);
    const response = await fetch(`${options.baseUrl}/api/shopify/push-article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.idToken}` },
      body: JSON.stringify({
        brandId: data.brandId,
        blogId: options.shopifyBlogId,
        skipIfTitleExists: true,
        article: {
          title: blog.get('title'),
          content: blog.get('content') || '',
          status: options.status,
          author: brand.get('shopifyAuthor') || brand.get('brandName'),
          seo: { ...(blog.get('seo') ?? {}), featuredImage: image },
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      existingArticleId?: number | null;
      shopifyBlogId?: string | number;
      shopifyArticle?: { id: number; blogId?: string | number };
    };

    // Already in Shopify from an earlier push that wasn't recorded: update that one.
    if (response.status === 409 && payload.code === 'duplicate_title' && payload.existingArticleId && payload.shopifyBlogId) {
      await setShopifyImage(shopDomain, accessToken, payload.shopifyBlogId, payload.existingArticleId, image);
      await blogRef.update({ shopifyArticleId: payload.existingArticleId, shopifyBlogId: payload.shopifyBlogId });
      return done(payload.existingArticleId, 'Article was already in Shopify; image updated');
    }
    if (!response.ok || !payload.shopifyArticle) {
      return fail(typeof payload.error === 'string' ? payload.error : 'Shopify push failed');
    }
    await blogRef.update({
      shopifyArticleId: payload.shopifyArticle.id,
      ...(payload.shopifyArticle.blogId && { shopifyBlogId: payload.shopifyArticle.blogId }),
    });
    return done(payload.shopifyArticle.id, 'Article pushed with its thumbnail');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Shopify push failed');
  }
}

export async function deleteThumbnail(uid: string, snap: DocumentSnapshot) {
  const data = snap.data() as StoredThumbnail;
  await setTarget(uid, snap, null).catch(() => undefined);
  await Promise.all([deleteObject(data.photoPath), deleteObject(data.imagePath)]);
  await snap.ref.delete();
}
