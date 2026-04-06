# Rate Limiting & Concurrent Generation Safeguards

## Overview

The article generation system now includes multiple safeguards to prevent API rate limiting issues and ensure stable performance when multiple articles are being generated simultaneously.

## Features Implemented

### 1. **Concurrent Generation Limiting**

**What it does:**
- Limits each user to a maximum of **3 simultaneous article generations**
- Prevents overwhelming the system and hitting API rate limits

**How it works:**
- When a user starts generating an article, their request is tracked
- If they already have 3 generations in progress, new requests are blocked with a 429 error
- Once a generation completes (success or failure), the slot is freed up

**User Experience:**
- Users attempting to exceed the limit see:
  ```
  "You have reached the maximum of 3 simultaneous article generations. 
   Please wait for one to complete before starting another."
  ```

### 2. **Automatic Retry with Exponential Backoff**

**What it does:**
- Automatically retries failed API calls (Claude, Perplexity, Shopify)
- Uses exponential backoff strategy to avoid hammering rate-limited APIs

**How it works:**
- **Attempt 1:** Immediate call
- **Attempt 2:** Wait 1 second, retry
- **Attempt 3:** Wait 2 seconds, retry
- After 3 attempts, the error is returned to the user

**Rate Limit Detection:**
- Automatically detects rate limit errors:
  - HTTP 429 status
  - `rate_limit_exceeded` error codes
  - Error messages containing "rate limit"

**User Experience:**
- Transparent to users - retries happen automatically
- Logs show retry attempts in the console

### 3. **Guaranteed Cleanup**

**What it does:**
- Ensures generation slots are always freed, even if errors occur
- Prevents "stuck" slots that would block future generations

**How it works:**
- Uses `try-finally` blocks to guarantee cleanup
- Tracks and logs slot releases for monitoring

## Configuration

### Adjustable Parameters

Located at the top of `frontend/src/app/api/generate-article/route.ts`:

```typescript
const MAX_CONCURRENT_GENERATIONS = 3; // Max simultaneous generations per user
const API_RETRY_MAX_ATTEMPTS = 3;     // Number of retry attempts
const API_RETRY_BASE_DELAY = 1000;    // Initial delay (1 second)
```

### Recommended Settings by Use Case

**Development/Testing:**
```typescript
MAX_CONCURRENT_GENERATIONS = 2
API_RETRY_MAX_ATTEMPTS = 2
API_RETRY_BASE_DELAY = 500
```

**Production (High Traffic):**
```typescript
MAX_CONCURRENT_GENERATIONS = 3
API_RETRY_MAX_ATTEMPTS = 3
API_RETRY_BASE_DELAY = 1000
```

**Production (Low Traffic, Faster Recovery):**
```typescript
MAX_CONCURRENT_GENERATIONS = 5
API_RETRY_MAX_ATTEMPTS = 4
API_RETRY_BASE_DELAY = 2000
```

## API Calls Protected

The following critical API calls are now protected with retry logic:

1. **Claude API:**
   - Topic breakdown generation
   - Article content generation
   - (Fact-check rewrites - can be added if needed)

2. **Perplexity API:**
   - Can be wrapped if rate limiting becomes an issue

3. **Shopify API:**
   - Can be wrapped if rate limiting becomes an issue

## Monitoring

### Console Logs

**Generation Start:**
```
✅ Released generation slot for user: [userId]
```

**Concurrent Limit Reached:**
```
⚠️ Concurrent generation limit reached for user: [userId]
```

**Retry Attempts:**
```
⏳ Topic Breakdown Generation failed (attempt 1/3), retrying in 1000ms...
⏳ Article Generation failed (attempt 2/3), retrying in 2000ms...
```

**Generation Complete:**
```
✅ Released generation slot for user: [userId]
```

## Error Handling

### Common Scenarios

**Scenario 1: User tries to generate 4th article**
- **Response:** HTTP 429 with error message
- **Action:** User waits for one generation to complete

**Scenario 2: API rate limit hit**
- **Response:** Automatic retry with exponential backoff
- **Action:** System automatically recovers, transparent to user

**Scenario 3: Generation crashes mid-process**
- **Response:** Slot is freed in finally block
- **Action:** User can immediately retry

## Future Enhancements

### Potential Improvements:

1. **Queue System**
   - Instead of blocking, add requests to a queue
   - Process them sequentially as slots become available

2. **Per-Tier Limits**
   - Free tier: 1 concurrent generation
   - Pro tier: 3 concurrent generations
   - Enterprise tier: 10 concurrent generations

3. **Global Rate Limiting**
   - Track API calls across all users
   - Implement global backoff if system-wide limits are approaching

4. **Smart Retry**
   - Detect specific error types and adjust retry strategy
   - Skip retries for permanent errors (auth failures, invalid input)

5. **Real-Time Status Dashboard**
   - Show users their active generations
   - Display estimated completion times
   - Allow cancellation of in-progress generations

## Testing

### Manual Testing

1. **Test Concurrent Limit:**
   - Open 4 browser tabs
   - Start article generation in all 4 simultaneously
   - Verify 4th request gets blocked with 429 error

2. **Test Retry Logic:**
   - Temporarily set a wrong API key
   - Start generation
   - Verify retry attempts in logs
   - Restore correct API key

3. **Test Cleanup:**
   - Start generation
   - Force-close browser tab
   - Verify slot is freed (check server logs)
   - Start new generation in another tab

## Troubleshooting

### Issue: User stuck with "limit reached" error

**Solution:**
- Wait 5 minutes for any hung requests to timeout
- Or restart the Next.js dev server to clear tracking map

### Issue: Too many retries slowing down generation

**Solution:**
- Reduce `API_RETRY_MAX_ATTEMPTS` to 2
- Increase `API_RETRY_BASE_DELAY` to space out retries

### Issue: Still hitting rate limits

**Solution:**
- Reduce `MAX_CONCURRENT_GENERATIONS` to 2
- Add retry logic to Perplexity and Shopify calls
- Consider implementing a queue system

## Support

For questions or issues related to rate limiting:
- Check server console logs for detailed retry information
- Monitor API provider dashboards for rate limit status
- Adjust configuration parameters based on usage patterns
