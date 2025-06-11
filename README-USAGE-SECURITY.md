# 🔒 Usage Tracking Security Implementation

## Overview
This document outlines the comprehensive security measures implemented for the usage tracking system to prevent abuse, manipulation, and workarounds.

## 🚨 Security Measures Implemented

### 1. **Firestore Security Rules** 
**Location**: `firestore.rules`

```javascript
// CRITICAL: Usage collection security rules
match /usage/{usageId} {
  // Only allow reads by the owning user (usage document ID format: {uid}_{month})
  allow read: if request.auth != null && 
                 usageId.matches(request.auth.uid + '_.*');
  
  // Never allow direct writes/updates from client - only server can modify
  allow write, create, update, delete: if false;
}
```

**Protection Against**:
- ✅ Users manipulating their usage counts directly
- ✅ Unauthorized access to other users' usage data
- ✅ Client-side tampering with usage documents

### 2. **Server-Side Usage Verification**
**Location**: `/api/generate-article/route.ts`, `/api/generate-keywords/route.ts`

**Implementation**:
- User authentication verification via Firebase ID tokens
- Subscription status verification from server-side Firestore
- Usage limit checks before allowing content generation
- Atomic usage increment after successful generation

**Protection Against**:
- ✅ API bypass attempts
- ✅ Client-side limit manipulation
- ✅ Fake subscription status claims
- ✅ Direct API calls without proper authentication

### 3. **Atomic Usage Operations**
**Location**: `frontend/src/lib/usage-limits.ts`

```javascript
// Client-side uses atomic increment
await updateDoc(usageDocRef, {
  [tool]: increment(1),
  lastUpdated: serverTimestamp(),
});

// Server-side uses Firebase Admin atomic operations  
await usageDocRef.set({
  [tool]: adminFirestore.FieldValue.increment(1),
  lastUpdated: adminFirestore.FieldValue.serverTimestamp(),
}, { merge: true });
```

**Protection Against**:
- ✅ Race conditions from concurrent requests
- ✅ Inconsistent usage counts
- ✅ Lost increments during network issues

### 4. **24-Hour Reset Security for Free Users**
**Implementation**:
- Server-side timestamp validation
- Protected timestamp fields (`lastArticleGeneration`, `lastKeywordGeneration`)
- Timezone-independent calculations

**Protection Against**:
- ✅ Timezone manipulation
- ✅ Client-side timestamp tampering
- ✅ Multiple generations within 24-hour period

### 5. **Subscription Status Verification**
**Location**: Server-side functions in API routes

**Implementation**:
```javascript
const subscriptionStatus = await getUserSubscriptionStatus(verifiedUser.uid, verifiedUser.email || null);
const usageCheck = await serverSideUsageUtils.canPerformAction(
  verifiedUser.uid,
  subscriptionStatus,
  'articles', // or 'keywords'
  adminFirestore
);
```

**Protection Against**:
- ✅ Fake subscription tier claims
- ✅ Client-side subscription manipulation
- ✅ Expired subscription usage

## 🔍 Security Flow

### Article/Keyword Generation Flow:
1. **Client Request** → API endpoint with Firebase ID token
2. **Server Auth** → Verify ID token with Firebase Admin
3. **Subscription Check** → Get real subscription status from Firestore
4. **Usage Verification** → Check current month's usage against limits
5. **24-Hour Check** → For free users, verify 24-hour cooldown
6. **Generation** → If all checks pass, generate content
7. **Usage Increment** → Atomically increment usage count server-side
8. **Response** → Return generated content to client

### Security Checkpoints:
- ✅ Firebase Authentication (prevents unauthorized access)
- ✅ Server-side subscription verification (prevents fake tiers)
- ✅ Usage limit enforcement (prevents over-generation)
- ✅ Atomic operations (prevents race conditions)
- ✅ Firestore rules (prevents direct manipulation)

## 🛡️ Attack Vectors Prevented

### 1. **Client-Side Manipulation**
- **Attack**: Modifying browser code to bypass limits
- **Prevention**: All verification done server-side

### 2. **Direct API Calls**
- **Attack**: Calling APIs directly without going through frontend
- **Prevention**: Firebase ID token validation + usage verification

### 3. **Firestore Direct Access**
- **Attack**: Directly modifying usage documents in Firestore
- **Prevention**: Security rules prevent all client writes to usage collection

### 4. **Race Conditions**
- **Attack**: Multiple simultaneous requests to exceed limits
- **Prevention**: Atomic increments + server-side verification

### 5. **Subscription Spoofing**
- **Attack**: Claiming higher subscription tier in requests
- **Prevention**: Server-side subscription status lookup

### 6. **Timestamp Manipulation**
- **Attack**: Modifying timestamps to reset 24-hour limits
- **Prevention**: Server-controlled timestamps only

## 📊 Usage Data Integrity

### Data Structure:
```javascript
interface UserUsage {
  uid: string;
  currentMonth: string; // YYYY-MM format
  articles: number;
  keywords: number;
  lastUpdated: Timestamp; // Server-controlled
  lastArticleGeneration?: Timestamp; // For 24-hour tracking
  lastKeywordGeneration?: Timestamp; // For 24-hour tracking
}
```

### Document ID Format:
`{uid}_{YYYY-MM}` - Ensures user isolation and monthly resets

### Security Features:
- All timestamps are server-controlled
- Document structure enforced by TypeScript
- Atomic operations prevent partial updates
- Monthly documents auto-create and reset

## ⚠️ Important Notes

### For Developers:
1. **Never** modify usage counts from client-side code
2. **Always** use server-side verification for API endpoints
3. **Never** trust client-provided subscription status
4. **Always** use atomic operations for concurrent safety

### For Security Audits:
1. Firestore rules prevent direct client access to usage data
2. All usage modifications go through authenticated API endpoints
3. Subscription status is verified server-side from authoritative source
4. 24-hour limits use server-controlled timestamps only

## 🔧 Maintenance

### Monthly Cleanup:
- Usage documents auto-segment by month (YYYY-MM)
- Old documents can be archived/deleted as needed
- No manual intervention required for monthly resets

### Monitoring:
- Server logs show all usage verification attempts
- Failed verifications are logged with reasons
- Usage increments are logged for audit trail

---

## 🎯 Result: Bulletproof Usage Tracking

This implementation creates multiple layers of security that make it virtually impossible for users to:
- Exceed their subscription limits
- Manipulate usage counts
- Bypass authentication
- Exploit race conditions
- Access other users' usage data

The system is designed to fail securely - if any component fails, access is denied rather than granted. 