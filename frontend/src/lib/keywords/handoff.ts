'use client';

/** Keywords picked elsewhere, waiting for the articles page or the automation form. */

const ARTICLES_KEY = 'handoff:articleKeywords';
const AUTOMATION_KEY = 'handoff:automationDraft';

export interface ArticleHandoff {
  brandId: string;
  keywords: string[];
}

export interface KeywordAutomationDraft {
  brandId: string;
  name: string;
  topics: string[];
}

function take<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  localStorage.removeItem(key);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const sendToArticles = (handoff: ArticleHandoff) => localStorage.setItem(ARTICLES_KEY, JSON.stringify(handoff));
export const takeArticleHandoff = () => take<ArticleHandoff>(ARTICLES_KEY);
export const sendToAutomation = (draft: KeywordAutomationDraft) => localStorage.setItem(AUTOMATION_KEY, JSON.stringify(draft));
export const takeAutomationDraft = () => take<KeywordAutomationDraft>(AUTOMATION_KEY);
