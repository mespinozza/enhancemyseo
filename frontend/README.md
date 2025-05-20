This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Environment Variables Setup

## Local Development

1. Copy `.env` to `.env.local`:
   ```bash
   cp .env .env.local
   ```

2. Update `.env.local` with your actual API keys and configuration values.

## Environment Files Priority

Next.js loads environment variables in this order (highest to lowest priority):
- `.env.$(NODE_ENV).local`
- `.env.local`
- `.env.$(NODE_ENV)`
- `.env`

## Production Deployment

For production deployment, set up environment variables in your hosting platform:

### Vercel
1. Go to your project settings in the Vercel dashboard
2. Navigate to the "Environment Variables" section
3. Add all required environment variables

### Other Platforms
- AWS: Use AWS Systems Manager Parameter Store or Secrets Manager
- Heroku: Use Config Vars in the dashboard
- Other platforms: Use their respective environment variable management systems

## Required Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key
- `ANTHROPIC_API_KEY`: Your Anthropic API key
- Firebase configuration variables (prefixed with `NEXT_PUBLIC_FIREBASE_`)

## Security Notes

- Never commit `.env.local` or any other local environment files
- Keep your API keys secure and rotate them regularly
- Use different API keys for development and production
- Consider using a secrets management service for production
