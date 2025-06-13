import { ApolloClient, InMemoryCache, createHttpLink, from } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Create the HTTP link for Shopify GraphQL API
const createShopifyHttpLink = (shopDomain: string) => createHttpLink({
  uri: `https://${shopDomain}/admin/api/2023-01/graphql.json`,
});

// Auth link to add the access token to headers
const createAuthLink = (accessToken: string) => setContext((_, { headers }) => ({
  headers: {
    ...headers,
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  }
}));

// Create Apollo Client instance for Shopify
export const createShopifyApolloClient = (shopDomain: string, accessToken: string) => {
  const httpLink = createShopifyHttpLink(shopDomain);
  const authLink = createAuthLink(accessToken);

  return new ApolloClient({
    link: from([authLink, httpLink]),
    cache: new InMemoryCache(),
    defaultOptions: {
      watchQuery: {
        errorPolicy: 'all',
      },
      query: {
        errorPolicy: 'all',
      },
    },
  });
};

// Default client (can be used when not connected to Shopify)
export const defaultApolloClient = new ApolloClient({
  uri: '/api/graphql', // fallback local endpoint
  cache: new InMemoryCache(),
}); 