import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";

// Production Firebase config
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBWPD6Pe3i0hXSp16K2NjR-FbXNPkSmiss",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "documentscanner-585c9.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "documentscanner-585c9",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "documentscanner-585c9.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "1097868318967",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:1097868318967:web:0f0e67aa74277df3121bf2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const functions = getFunctions(app);

// Use emulator in development
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Using Firebase Functions emulator');
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Cloud Functions
export const enhanceDocument = httpsCallable(functions, 'enhanceDocument');
export const correctPerspective = httpsCallable(functions, 'correctPerspective');
export const processBatch = httpsCallable(functions, 'processBatch');
export const createPDF = httpsCallable(functions, 'createPDF');
export const storeDocument = httpsCallable(functions, 'storeDocument');
export const getDocument = httpsCallable(functions, 'getDocument');
export const deleteDocument = httpsCallable(functions, 'deleteDocument');
export const healthCheck = httpsCallable(functions, 'healthCheck');
export const extractText = httpsCallable(functions, 'extractText');
export const testFunction = httpsCallable(functions, 'testFunction');

// Enhanced test connection with timeout
export const testConnection = async (data = {}) => {
  try {
    console.log('🔄 Testing Firebase Functions connection...');
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timeout (10s)')), 10000)
    );
    
    const testPromise = testFunction(data);
    
    const result = await Promise.race([testPromise, timeoutPromise]);
    console.log('✅ Firebase Functions test successful:', result);
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ Firebase Functions test failed:', error);
    return { 
      success: false, 
      error: error.message,
      suggestion: 'Make sure Firebase Functions are deployed: firebase deploy --only functions'
    };
  }
};

// Enhanced document processing with retry logic
export const processDocument = async (imageData, options = {}) => {
  try {
    console.log('🔄 Processing document...');
    
    // Convert Data URL to base64 if needed
    let imageBase64 = imageData;
    if (imageData.startsWith('data:')) {
      imageBase64 = imageData.split(',')[1];
    }
    
    const result = await enhanceDocument({
      image: imageBase64,
      options: {
        enhance: true,
        grayscale: options.grayscale ?? true,
        threshold: options.threshold ?? 150,
        resize: options.resize ?? 2000,
        quality: options.quality ?? 80,
        sharpen: options.sharpen ?? true,
        normalize: options.normalize ?? true,
        ...options
      }
    });
    
    console.log('✅ Document processing successful');
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ Document processing failed:', error);
    throw new Error(`Document processing failed: ${error.message}`);
  }
};

// Batch processing
export const processMultipleDocuments = async (images, options = {}) => {
  try {
    console.log(`🔄 Processing ${images.length} documents...`);
    
    const base64Images = images.map(img => {
      if (img.startsWith('data:')) {
        return img.split(',')[1];
      }
      return img;
    });
    
    const result = await processBatch({
      images: base64Images,
      options: options
    });
    
    console.log(`✅ Batch processing successful: ${result.data.processedCount} documents`);
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ Batch processing failed:', error);
    throw new Error(`Batch processing failed: ${error.message}`);
  }
};

// Text extraction with retry
export const extractTextFromImage = async (imageData, options = {}) => {
  try {
    console.log('🔄 Extracting text...');
    
    let imageBase64 = imageData;
    if (imageData.startsWith('data:')) {
      imageBase64 = imageData.split(',')[1];
    }
    
    const result = await extractText({
      image: imageBase64,
      options: {
        language: options.language || 'eng',
        presets: options.presets || 'document',
        ...options
      }
    });
    
    console.log('✅ Text extraction successful');
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ Text extraction failed:', error);
    throw new Error(`Text extraction failed: ${error.message}`);
  }
};

// Create PDF from images
export const generatePDF = async (images, options = {}) => {
  try {
    console.log(`🔄 Creating PDF from ${images.length} images...`);
    
    const base64Images = images.map(img => {
      if (img.startsWith('data:')) {
        return img.split(',')[1];
      }
      return img;
    });
    
    const result = await createPDF({
      images: base64Images,
      options: {
        pageSize: options.pageSize || 'A4',
        margin: options.margin || 50,
        orientation: options.orientation || 'portrait',
        ...options
      }
    });
    
    console.log('✅ PDF creation successful');
    
    // Convert base64 to Data URL
    if (result.data.pdf && !result.data.pdf.startsWith('data:')) {
      result.data.pdf = `data:application/pdf;base64,${result.data.pdf}`;
    }
    
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ PDF creation failed:', error);
    throw new Error(`PDF creation failed: ${error.message}`);
  }
};

// Store document with metadata
export const saveDocument = async (imageData, text = '', metadata = {}) => {
  try {
    console.log('🔄 Storing document...');
    
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User must be authenticated to save documents');
    }
    
    let imageBase64 = imageData;
    if (imageData.startsWith('data:')) {
      imageBase64 = imageData.split(',')[1];
    }
    
    const result = await storeDocument({
      userId: user.uid,
      image: imageBase64,
      text: text,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString(),
        status: 'processed'
      }
    });
    
    console.log('✅ Document stored successfully:', result.data.documentId);
    return { success: true, data: result.data };
    
  } catch (error) {
    console.error('❌ Document storage failed:', error);
    throw new Error(`Document storage failed: ${error.message}`);
  }
};

// Get document by ID
export const fetchDocument = async (documentId) => {
  try {
    const result = await getDocument({ documentId });
    return { success: true, data: result.data };
  } catch (error) {
    throw new Error(`Failed to fetch document: ${error.message}`);
  }
};

// Delete document
export const removeDocument = async (documentId) => {
  try {
    const result = await deleteDocument({ documentId });
    return { success: true, data: result.data };
  } catch (error) {
    throw new Error(`Failed to delete document: ${error.message}`);
  }
};

// Check health
export const checkHealth = async () => {
  try {
    const result = await healthCheck();
    return { success: true, data: result.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// Helper: Compress image before uploading
export const compressImage = async (file, maxWidth = 2000, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        
        resolve({
          dataUrl: compressedDataUrl,
          originalSize: file.size,
          compressedSize: compressedDataUrl.length,
          width,
          height,
          type: 'image/jpeg',
          name: file.name.replace(/\.[^/.]+$/, "") + '_compressed.jpg'
        });
      };
      
      img.onerror = reject;
    };
    
    reader.onerror = reject;
  });
};

// Helper: Convert file to base64
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
};

// Helper: Get user documents
export const getUserDocuments = async () => {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // This would need a separate function or Firestore query
    console.log('Get user documents function needs implementation');
    return { success: true, data: [] };
  } catch (error) {
    throw new Error(`Failed to get user documents: ${error.message}`);
  }
};

// Export services
export { db, storage, auth, functions, app };