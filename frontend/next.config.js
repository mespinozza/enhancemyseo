/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  env: {
    // Firebase configuration
    NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyC8SaduwnXf05zyvldhXeDL-MmQf4W8DTs",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "plzenhancemyseo.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "plzenhancemyseo",
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "plzenhancemyseo.appspot.com",
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "132348098774",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:132348098774:web:7c4eccbd97708b72c77177",
  },
  experimental: {
    externalDir: false,
  },
  serverExternalPackages: [],
  // Add runtime configuration
  publicRuntimeConfig: {
    // Will be available on both server and client
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  serverRuntimeConfig: {
    // Will only be available on the server side
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
  webpack: (config, { nextRuntime, webpack }) => {
    // Next compiles instrumentation.ts for the edge runtime as well as node.
    // register() returns early there, but a dev build does no dead-code
    // elimination, so webpack still follows the import into firebase-admin and
    // fails on its node-only dependencies. Production builds drop the branch and
    // never hit this; dev would 500 on every page without it.
    if (nextRuntime === 'edge') {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /automation\/scheduler$/ })
      );
    }
    return config;
  },
};

module.exports = nextConfig; 