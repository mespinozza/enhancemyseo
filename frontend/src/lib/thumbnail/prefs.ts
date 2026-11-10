import { isLayout, type ThumbnailLayout } from './design';

/** Whether articles written by hand get a thumbnail, and in which style, kept per browser. */
export interface ThumbnailPrefs {
  enabled: boolean;
  layout: ThumbnailLayout;
}

const KEY = 'articles:thumbnail-prefs';

export function loadThumbnailPrefs(): ThumbnailPrefs | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return null;
    return { enabled: raw.enabled === true, layout: isLayout(raw.layout) ? raw.layout : 'parts-plus' };
  } catch {
    return null;
  }
}

export function saveThumbnailPrefs(prefs: ThumbnailPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private browsing can refuse storage; the choice then lasts for this visit only.
  }
}
