import { NextRequest, NextResponse } from 'next/server';
import {
  VARIANT_COOKIE,
  VARIANT_HEADER,
  decodeVariants,
  encodeVariants,
  resolveVariants,
} from '@/lib/proof/experiments';

export const config = {
  matcher: ['/proof', '/results'],
};

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // /results is the case study index, but ad links in the brief were written as
  // /results?angle=…; those belong on the landing page, with every campaign param kept.
  if (pathname === '/results') {
    if (!searchParams.has('angle')) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/proof';
    return NextResponse.redirect(url, 307);
  }

  // Assigned here rather than in the browser so the first paint already shows the
  // visitor's arm: a client-side swap would flash the other headline.
  const stored = decodeVariants(request.cookies.get(VARIANT_COOKIE)?.value);
  const { variants, changed } = resolveVariants(stored, searchParams);
  const encoded = encodeVariants(variants);

  const headers = new Headers(request.headers);
  headers.set(VARIANT_HEADER, encoded);
  const response = NextResponse.next({ request: { headers } });

  if (changed) {
    response.cookies.set(VARIANT_COOKIE, encoded, {
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
      sameSite: 'lax',
    });
  }
  return response;
}
