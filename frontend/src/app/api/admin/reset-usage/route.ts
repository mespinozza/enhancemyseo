import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';

export async function POST(request: NextRequest) {
  try {
    console.log('Admin reset usage request received');
    
    // Get the user's ID token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUser;
    
    try {
      // Verify the ID token
      verifiedUser = await getAuth().verifyIdToken(idToken);
      if (!verifiedUser.uid) {
        throw new Error('Invalid token');
      }
      console.log('Admin reset request from user:', verifiedUser.uid);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if the requesting user is an admin
    const requestingUserSubscription = await getServerUserSubscriptionStatus(verifiedUser.uid, verifiedUser.email || null);
    
    console.log('🐛 DEBUG: Server-side subscription check:', {
      uid: verifiedUser.uid,
      email: verifiedUser.email,
      serverSubscriptionStatus: requestingUserSubscription
    });
    
    if (requestingUserSubscription !== 'admin') {
      console.error('Non-admin user attempted to reset usage:', verifiedUser.uid);
      return NextResponse.json({ 
        error: 'Admin access required',
        serverSubscriptionStatus: requestingUserSubscription,
        debugInfo: {
          uid: verifiedUser.uid,
          email: verifiedUser.email,
          serverSees: requestingUserSubscription
        }
      }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId, targetUserEmail, resetType = 'all', debug } = body;
    
    // If this is a debug request, return debug info
    if (debug) {
      return NextResponse.json({
        message: 'Debug info',
        serverSubscriptionStatus: requestingUserSubscription,
        userInfo: {
          uid: verifiedUser.uid,
          email: verifiedUser.email
        }
      });
    }

    let userIdToReset = targetUserId || verifiedUser.uid;
    
    // If an email is provided instead of userId, look up the user
    if (targetUserEmail && !targetUserId) {
      try {
        const targetUser = await getAuth().getUserByEmail(targetUserEmail);
        userIdToReset = targetUser.uid;
        console.log(`Found user ID ${userIdToReset} for email ${targetUserEmail}`);
      } catch (error) {
        console.error('Error finding user by email:', error);
        return NextResponse.json({
          error: `User not found with email: ${targetUserEmail}`
        }, { status: 404 });
      }
    }
    
    console.log(`Admin ${verifiedUser.uid} resetting usage for user: ${userIdToReset}, type: ${resetType}`);

    // Get Firestore admin instance
    const adminFirestore = getFirestore();
    
    // Reset usage documents for the target user
    try {
      // Usage documents are named with pattern: {uid}_{YYYY-MM}
      // We need to find and reset all usage documents for this user
      const usageCollection = adminFirestore.collection('usage');
      
      // Query for documents where the document ID starts with the user's UID
      const usageSnapshot = await usageCollection.get();
      
      const userUsageDocuments = usageSnapshot.docs.filter(doc => 
        doc.id.startsWith(`${userIdToReset}_`)
      );
      
      if (userUsageDocuments.length === 0) {
        console.log('No usage documents found for user:', userIdToReset);
        return NextResponse.json({ 
          message: 'No usage data found to reset',
          resetCount: 0 
        });
      }

      // Reset all usage documents by deleting them (they will be recreated with 0 usage when needed)
      const batch = adminFirestore.batch();
      userUsageDocuments.forEach(doc => {
        console.log(`Marking usage document for deletion: ${doc.id}`);
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      
      console.log(`Successfully reset ${userUsageDocuments.length} usage documents for user: ${userIdToReset}`);
      
      return NextResponse.json({
        message: `Successfully reset usage data for user ${userIdToReset}`,
        resetCount: userUsageDocuments.length,
        targetUserId: userIdToReset,
        resetDocuments: userUsageDocuments.map(doc => doc.id)
      });
      
    } catch (error) {
      console.error('Error resetting usage data:', error);
      return NextResponse.json({
        error: 'Failed to reset usage data'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Admin reset usage error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
} 