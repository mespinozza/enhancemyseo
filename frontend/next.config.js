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
  }
};

module.exports = nextConfig; 