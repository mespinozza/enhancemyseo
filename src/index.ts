import express from 'express';
import cors from 'cors';
import { db, auth } from './lib/firebase';
import { config } from '../config';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Auto KeyBlog API' });
});

// Example route using Firestore
app.get('/test-firebase', async (req, res) => {
  try {
    // Test Firestore connection
    const testDoc = await db.collection('test').doc('test').get();
    
    // Test Auth connection
    const authTest = await auth.listUsers(1);
    
    res.json({ 
      message: 'Firebase connection successful',
      firestore: testDoc.data(),
      auth: 'Connected'
    });
  } catch (error) {
    console.error('Firebase error:', error);
    res.status(500).json({ 
      error: 'Failed to connect to Firebase',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Firebase Project ID: ${config.firebase.projectId}`);
}); 