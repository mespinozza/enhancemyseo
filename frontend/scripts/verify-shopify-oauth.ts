/**
 * Gate test for the Shopify store connection.
 *
 * Everything here is a security boundary, and each one fails quietly if it is wrong. A
 * loose store-domain check sends the browser — and later the app's client secret — to a
 * host an attacker picked. A callback signature that is not really verified lets anyone
 * attach their own store, or someone else's, to a brand profile. A state parameter that
 * is not really verified lets a connection be written against another user's brand. None
 * of that shows up in normal use, so it is pinned here instead.
 *
 * Run with: npm run verify:shopify-oauth
 */
import { createHmac } from 'crypto';

// Read lazily by the module under test, so it has to be set before importing.
process.env.SHOPIFY_CLIENT_ID = 'test-client-id';
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret';
// A second app, as a store with its own custom-distribution app would have.
process.env.SHOPIFY_APP_SECRETS = JSON.stringify({ 'other-client-id': 'other-client-secret' });

import { isValidShopDomain, normalizeShopDomain } from '../src/lib/shopify/shop';
import { shopifyAppFor, type ShopifyApp } from '../src/lib/shopify/app';
import {
  appThatSigned,
  buildInstallUrl,
  isCallbackFresh,
  signState,
  verifyCallbackSignature,
  verifyState,
} from '../src/lib/shopify/oauth';
import { safeReturnTo } from '../src/lib/oauth/state';
import { publicOrigin } from '../src/lib/oauth/origin';

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const defaultApp: ShopifyApp = { clientId: 'test-client-id', clientSecret: 'test-client-secret' };
const otherApp: ShopifyApp = { clientId: 'other-client-id', clientSecret: 'other-client-secret' };

/** Builds a callback URL signed the way Shopify signs one. */
function signedCallback(params: Record<string, string>, secret = 'test-client-secret'): URL {
  const message = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&');

  const hmac = createHmac('sha256', secret).update(message).digest('hex');
  return new URL(`https://app.example.com/api/shopify/callback?${message}&hmac=${hmac}`);
}

function freshCallback(overrides: Record<string, string> = {}): URL {
  return signedCallback({
    code: 'auth-code',
    shop: 'test-store.myshopify.com',
    state: 'signed-state',
    timestamp: String(Math.floor(Date.now() / 1000)),
    ...overrides,
  });
}

console.log('\nStore domain normalization');
check('a full URL reduces to the host', normalizeShopDomain('https://shop.myshopify.com/') === 'shop.myshopify.com');
check('a path is dropped', normalizeShopDomain('https://shop.myshopify.com/admin') === 'shop.myshopify.com');
check('a bare handle is expanded', normalizeShopDomain('shop') === 'shop.myshopify.com');
check('case is normalized', normalizeShopDomain('SHOP.MyShopify.com') === 'shop.myshopify.com');
check('surrounding space is ignored', normalizeShopDomain('  shop.myshopify.com  ') === 'shop.myshopify.com');
check('empty stays empty', normalizeShopDomain('') === '');

console.log('\nStore domain validation');
check('a myshopify host is accepted', isValidShopDomain('test-store.myshopify.com'));
check('an unrelated host is rejected', !isValidShopDomain('evil.com'));
check('a custom storefront domain is rejected', !isValidShopDomain('shop.example.com'));
check(
  'a suffixed lookalike is rejected',
  !isValidShopDomain('shop.myshopify.com.evil.com'),
  'the myshopify part must end the host'
);
check('a prefixed lookalike is rejected', !isValidShopDomain('evil.com/shop.myshopify.com'));
check('a subdomain under the store is rejected', !isValidShopDomain('a.shop.myshopify.com'));
check('an empty domain is rejected', !isValidShopDomain(''));

console.log('\nInstall URL');
{
  const request = new Request('https://app.example.com/api/shopify/connect');
  const url = new URL(buildInstallUrl('test-store.myshopify.com', 'the-state', request, defaultApp));

  check('it points at the store', url.host === 'test-store.myshopify.com');
  check('it is the authorize endpoint', url.pathname === '/admin/oauth/authorize');
  check('it carries the client id', url.searchParams.get('client_id') === 'test-client-id');
  check('it carries the state', url.searchParams.get('state') === 'the-state');
  check(
    'it asks for an offline token',
    !url.searchParams.has('grant_options[]'),
    'a per-user token would die with the browser session and break automations'
  );
  check(
    'it requests only the scopes the app uses',
    url.searchParams.get('scope') === 'read_products,write_content'
  );

  let rejected = false;
  try {
    buildInstallUrl('evil.com', 'the-state', request, defaultApp);
  } catch {
    rejected = true;
  }
  check('it refuses a non-Shopify host', rejected);
}

console.log('\nCallback signature');
check('a correctly signed callback passes', verifyCallbackSignature(freshCallback(), defaultApp));
{
  const tampered = new URL(freshCallback().toString());
  tampered.searchParams.set('shop', 'attacker-store.myshopify.com');
  check('swapping the store invalidates it', !verifyCallbackSignature(tampered, defaultApp));

  const extra = new URL(freshCallback().toString());
  extra.searchParams.set('code', 'different-code');
  check('swapping the code invalidates it', !verifyCallbackSignature(extra, defaultApp));

  const noHmac = new URL(freshCallback().toString());
  noHmac.searchParams.delete('hmac');
  check('a missing signature fails', !verifyCallbackSignature(noHmac, defaultApp));

  const wrongHmac = new URL(freshCallback().toString());
  wrongHmac.searchParams.set('hmac', 'f'.repeat(64));
  check('a wrong signature fails', !verifyCallbackSignature(wrongHmac, defaultApp));

  const empty = new URL('https://app.example.com/api/shopify/callback');
  check('an empty query fails', !verifyCallbackSignature(empty, defaultApp));
}
check(
  'parameter order does not matter',
  verifyCallbackSignature(
    signedCallback({
      timestamp: String(Math.floor(Date.now() / 1000)),
      state: 'signed-state',
      shop: 'test-store.myshopify.com',
      code: 'auth-code',
    }),
    defaultApp
  ),
  'Shopify does not promise an order, so the message is sorted before signing'
);

console.log('\nOne app per store');
check(
  'a brand with no app named uses the default',
  shopifyAppFor(undefined).clientId === 'test-client-id'
);
check('a brand can name its own app', shopifyAppFor('other-client-id').clientId === 'other-client-id');
{
  let rejected = false;
  try {
    shopifyAppFor('an-app-with-no-secret-here');
  } catch {
    rejected = true;
  }
  check(
    'an app with no secret configured is refused',
    rejected,
    'better than signing with the wrong app and failing at Shopify'
  );
}
check(
  'one app cannot verify another app\u2019s callback',
  !verifyCallbackSignature(freshCallback(), otherApp),
  'otherwise any connected merchant could forge a callback for another'
);
check(
  'the signing app is identified when no brand says which',
  appThatSigned(signedCallback({
    code: 'auth-code',
    shop: 'test-store.myshopify.com',
    state: 'signed-state',
    timestamp: String(Math.floor(Date.now() / 1000)),
  }, 'other-client-secret'))?.clientId === 'other-client-id'
);
check(
  'a forged handoff matches no app',
  appThatSigned(signedCallback({
    code: 'auth-code',
    shop: 'test-store.myshopify.com',
    state: 'signed-state',
    timestamp: String(Math.floor(Date.now() / 1000)),
  }, 'not-a-real-secret')) === null
);

console.log('\nCallback freshness');
check('a current callback is fresh', isCallbackFresh(freshCallback()));
check(
  'an old callback is stale',
  !isCallbackFresh(freshCallback({ timestamp: String(Math.floor(Date.now() / 1000) - 3600) }))
);
check('a missing timestamp is stale', !isCallbackFresh(new URL('https://app.example.com/cb')));

console.log('\nSigned state');
{
  const state = signState('user-1', 'brand-1', '/dashboard/settings/brands');
  const payload = verifyState(state);

  check('it round trips the user', payload?.uid === 'user-1');
  check('it round trips the brand', payload?.brandId === 'brand-1');
  check('it round trips the return path', payload?.returnTo === '/dashboard/settings/brands');

  check('a tampered signature fails', verifyState(`${state.split('.')[0]}.deadbeef`) === null);
  check('a missing signature fails', verifyState(state.split('.')[0]) === null);
  check('nonsense fails', verifyState('not-a-state') === null);

  // A state whose body claims a different brand than the one that was signed.
  const forgedBody = Buffer.from(
    JSON.stringify({ uid: 'user-1', brandId: 'someone-elses-brand', issuedAt: Date.now() }),
    'utf8'
  ).toString('base64url');
  check(
    'a re-written brand fails',
    verifyState(`${forgedBody}.${state.split('.')[1]}`) === null,
    'the signature covers the body, so editing the brand invalidates it'
  );

  const expiredBody = Buffer.from(
    JSON.stringify({ uid: 'user-1', brandId: 'brand-1', issuedAt: Date.now() - 20 * 60 * 1000 }),
    'utf8'
  ).toString('base64url');
  const expiredSignature = createHmac('sha256', 'test-client-secret')
    .update(expiredBody)
    .digest('base64url');
  check(
    'an expired state fails even when signed',
    verifyState(`${expiredBody}.${expiredSignature}`) === null
  );
}

console.log('\nPublic origin');
{
  // What Railway actually delivers: TLS ends at the edge and the container sees a
  // request for its own internal port. Redirecting to that origin sends the user to a
  // host that only exists inside the container.
  const proxied = new Request('http://localhost:8080/api/shopify/install', {
    headers: { host: 'localhost:8080', 'x-forwarded-host': 'enhancemyseo.com', 'x-forwarded-proto': 'https' },
  });

  check(
    'a proxied request resolves to the public host',
    publicOrigin(proxied) === 'https://enhancemyseo.com',
    'got ' + publicOrigin(proxied)
  );

  check(
    'an explicit URL beats the headers',
    publicOrigin(proxied, 'https://configured.example.com/api/shopify/callback') ===
      'https://configured.example.com'
  );

  check(
    'a malformed explicit URL falls back rather than throwing',
    publicOrigin(proxied, 'not a url') === 'https://enhancemyseo.com'
  );

  const protoList = new Request('http://localhost:8080/api/shopify/install', {
    headers: { 'x-forwarded-host': 'enhancemyseo.com', 'x-forwarded-proto': 'https, http' },
  });
  check(
    'only the first forwarded protocol is used',
    publicOrigin(protoList) === 'https://enhancemyseo.com',
    'got ' + publicOrigin(protoList)
  );

  const local = new Request('http://localhost:3001/api/shopify/install', {
    headers: { host: 'localhost:3001' },
  });
  check('a local request stays on http', publicOrigin(local) === 'http://localhost:3001');

  const plainHost = new Request('http://internal/api/shopify/install', {
    headers: { host: 'enhancemyseo.com' },
  });
  check(
    'a bare host header is assumed https',
    publicOrigin(plainHost) === 'https://enhancemyseo.com'
  );
}

console.log('\nReturn paths');
check('a dashboard path is kept', safeReturnTo('/dashboard/settings/brands') === '/dashboard/settings/brands');
check('an external URL is dropped', safeReturnTo('https://evil.com') === undefined);
check('a protocol-relative URL is dropped', safeReturnTo('//evil.com') === undefined);
check('traversal is dropped', safeReturnTo('/dashboard/../../etc') === undefined);
check('a non-dashboard path is dropped', safeReturnTo('/login') === undefined);
check('nothing stays nothing', safeReturnTo(undefined) === undefined);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
