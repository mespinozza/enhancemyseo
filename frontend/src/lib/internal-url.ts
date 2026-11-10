/**
 * Where to reach this same service. Loopback by default; `AUTOMATION_SELF_URL` exists
 * for the case where the cron and web processes are split across Railway services.
 */
export function internalBaseUrl(): string {
  const override = process.env.AUTOMATION_SELF_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, '');

  // `npm start` binds to PORT, which Railway sets. `npm run dev` binds to 3001.
  const fallbackPort = process.env.NODE_ENV === 'development' ? 3001 : 3000;
  return `http://127.0.0.1:${process.env.PORT || fallbackPort}`;
}
