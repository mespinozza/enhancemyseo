import { ImageResponse } from 'next/og';

export const alt = 'SEO Growth Automation by EnhanceMySEO';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const STEPS = ['Picks a keyword', 'Writes and fact-checks', 'Adds a featured image', 'Publishes to Shopify'];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: 'white',
          background: 'radial-gradient(120% 90% at 85% -10%, #2563eb 0%, #111827 60%)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#bfdbfe' }}>EnhanceMySEO</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 78, fontWeight: 800, lineHeight: 1.05 }}>SEO Growth Automation</div>
          <div style={{ marginTop: 20, fontSize: 36, color: '#d1d5db' }}>Your Shopify blog, publishing on schedule.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {STEPS.map((step, index) => (
            <div
              key={step}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 22px',
                borderRadius: 999,
                fontSize: 24,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
              }}
            >
              <span style={{ display: 'flex', color: '#86efac', fontWeight: 800 }}>{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
