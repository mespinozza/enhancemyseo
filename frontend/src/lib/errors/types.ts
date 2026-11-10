export const ERROR_EVENTS = 'errorEvents';

export type ErrorSource = 'article' | 'article-client' | 'automation';

export const SOURCE_LABELS: Record<ErrorSource, string> = {
  article: 'Article (server)',
  'article-client': 'Article (browser)',
  automation: 'Automation',
};

export interface ErrorEvent {
  id: string;
  source: ErrorSource;
  message: string;
  detail: string | null;
  status: number | null;
  code: string | null;
  stage: string | null;
  uid: string | null;
  email: string | null;
  blogId: string | null;
  brandId: string | null;
  keyword: string | null;
  log: string[];
  context: Record<string, string | number | boolean | null> | null;
  createdAt: string | null;
}
