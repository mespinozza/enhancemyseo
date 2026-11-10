'use client';

import { useEffect, useState } from 'react';
/** Anything that can mint an ID token: Firebase's User or the auth context's. */
export interface TokenUser {
  getIdToken(): Promise<string>;
}

type User = TokenUser;
import { THUMBNAIL_FONT, THUMBNAIL_FONT_FILE } from './design';

export async function thumbnailApi<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...init.headers,
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed (${response.status})`) as Error & { code?: string };
    error.code = payload.code;
    throw error;
  }
  return payload as T;
}

/** Our asset route needs the ID token, which an <img> cannot send, so images go through a blob. */
export async function authedObjectUrl(user: User, url: string): Promise<string> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
  if (!response.ok) throw new Error(`Image failed to load (${response.status})`);
  return URL.createObjectURL(await response.blob());
}

export async function loadAuthedImage(user: User, url: string): Promise<HTMLImageElement> {
  const objectUrl = await authedObjectUrl(user, url);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  return image;
}

export function loadFileImage(file: File): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = URL.createObjectURL(file);
  return image.decode().then(() => image);
}

let fontLoad: Promise<void> | null = null;

export function ensureThumbnailFont(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  fontLoad ??= new FontFace(THUMBNAIL_FONT, `url(${THUMBNAIL_FONT_FILE})`)
    .load()
    .then((face) => {
      document.fonts.add(face);
    })
    .catch(() => {
      fontLoad = null;
    });
  return fontLoad;
}

/** An authed image as an object URL for <img>, revoked when it changes. */
export function useAuthedImage(user: User | null | undefined, url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!user || !url) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    authedObjectUrl(user, url)
      .then((made) => {
        objectUrl = made;
        if (cancelled) URL.revokeObjectURL(made);
        else setSrc(made);
      })
      .catch(() => !cancelled && setSrc(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user, url]);
  return src;
}
