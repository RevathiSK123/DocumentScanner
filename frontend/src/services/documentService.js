// services/documentService.js - COMPLETE WITH ALL EXPORTS
import { db, auth, storage } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  getDocs,
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

// ===== ALL EXPORTED FUNCTIONS =====

// 1. Get all documents for current user
export const getUserDocuments = async () => {
  try {
    const user = auth.currentUser;
    console.log('getUserDocuments: currentUser', user);
    // No userId filter: show all documents
    const q = query(
      collection(db, 'documents'),
      orderBy('createdAt', 'desc')
    );
    console.log('getUserDocuments: Firestore query', q);
    const querySnapshot = await getDocs(q);
    const documents = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      documents.push({
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      });
    });
    console.log('getUserDocuments: documents found', documents);
    return documents;
  } catch (error) {
    console.error('Error getting documents:', error);
    if (error.code === 'failed-precondition') {
      console.warn('Index is being created. Please wait and refresh.');
      return [];
    }
    return [];
  }
};

// 2. Get document by ID
export const getDocumentById = async (docId) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    const docRef = doc(db, 'documents', docId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Document not found');
    }
    
    const data = docSnap.data();
    
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
    };
  } catch (error) {
    console.error('Error getting document by ID:', error);
    throw error;
  }
};

// 3. Delete document
export const deleteDocument = async (docId) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    const docRef = doc(db, 'documents', docId);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
};

// 4. Update document
export const updateDocument = async (docId, updates) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    const docRef = doc(db, 'documents', docId);
    
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, id: docId };
  } catch (error) {
    console.error('Error updating document:', error);
    throw error;
  }
};

// 5. Update document with processed URL
export const updateDocumentWithProcessedUrl = async (docId, processedUrl, status = 'processed') => {
  try {
    return await updateDocument(docId, {
      processedUrl,
      status,
      processedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating processed URL:', error);
    throw error;
  }
};

// 6. Process document by URL
export const processDocumentByUrl = async (url, options = {}) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    
    // Call Firebase Cloud Function for processing
    // This assumes you have a Cloud Function named 'processDocumentByUrl'
    const response = await fetch('https://us-central1-documentscanner-585c9.cloudfunctions.net/processDocumentByUrl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        userId: user.uid,
        options
      })
    });
    
    if (!response.ok) {
      throw new Error(`Processing failed: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error processing document by URL:', error);
    throw error;
  }
};

// 7. Create new document
export const createDocument = async (documentData) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    const docRef = await addDoc(collection(db, 'documents'), {
      ...documentData,
      userId: user.uid, // Always use current user's UID
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: 'uploaded'
    });
    return {
      id: docRef.id,
      ...documentData,
      userId: user.uid
    };
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
};

// 8. Upload file and create document
export const uploadDocument = async (file, _userId, onProgress) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    // 1. Upload file to Firebase Storage
    const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          // Progress callback
          if (onProgress) {
            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(progress);
          }
        },
        (error) => {
          reject(error);
        },
        async () => {
          // Upload complete
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          // 2. Flatten metadata
          const safeMetadata = { uploadTime: new Date().toISOString() };
          // 3. Create Firestore document
          const documentData = {
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
            originalUrl: downloadURL,
            processedUrl: null,
            status: 'uploaded',
            metadata: safeMetadata
          };
          const result = await createDocument(documentData);
          resolve(result);
        }
      );
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
};

// 9. Search documents
export const searchDocuments = async (searchTerm) => {
  try {
    const documents = await getUserDocuments();
    
    if (!searchTerm.trim()) {
      return documents;
    }
    
    const term = searchTerm.toLowerCase();
    return documents.filter(doc => 
      doc.filename?.toLowerCase().includes(term) ||
      doc.metadata?.originalName?.toLowerCase().includes(term) ||
      doc.text?.toLowerCase().includes(term)
    );
  } catch (error) {
    console.error('Error searching documents:', error);
    return [];
  }
};

// 10. Get document statistics
export const getDocumentStats = async () => {
  try {
    const documents = await getUserDocuments();
    
    return {
      total: documents.length,
      processed: documents.filter(d => d.status === 'processed').length,
      uploaded: documents.filter(d => d.status === 'uploaded').length,
      processing: documents.filter(d => d.status === 'processing').length,
      error: documents.filter(d => d.status === 'error').length,
      totalSize: documents.reduce((sum, doc) => sum + (doc.fileSize || 0), 0),
      lastUpload: documents[0]?.createdAt || null
    };
  } catch (error) {
    console.error('Error getting document stats:', error);
    return {
      total: 0,
      processed: 0,
      uploaded: 0,
      processing: 0,
      error: 0,
      totalSize: 0,
      lastUpload: null
    };
  }
};

// 11. Update document status
export const updateDocumentStatus = async (docId, status, additionalData = {}) => {
  try {
    return await updateDocument(docId, {
      status,
      ...additionalData
    });
  } catch (error) {
    console.error('Error updating document status:', error);
    throw error;
  }
};

// 12. Process document (generic)
export const processDocument = async (docId, options = {}) => {
  try {
    // Get the document first
    const document = await getDocumentById(docId);
    
    if (!document.originalUrl) {
      throw new Error('Document has no original URL');
    }
    
    // Call processing function
    const result = await processDocumentByUrl(document.originalUrl, options);
    
    // Update document with processed result
    if (result.processedUrl) {
      await updateDocumentWithProcessedUrl(docId, result.processedUrl, 'processed');
    }
    
    return {
      ...result,
      documentId: docId
    };
  } catch (error) {
    console.error('Error processing document:', error);
    
    // Update status to error
    try {
      await updateDocumentStatus(docId, 'error', { 
        error: error.message,
        processedAt: new Date().toISOString()
      });
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
    
    throw error;
  }
};

// ===== DEFAULT EXPORT =====
export default {
  getUserDocuments,
  getDocumentById,
  deleteDocument,
  updateDocument,
  updateDocumentWithProcessedUrl,
  processDocumentByUrl,
  createDocument,
  uploadDocument,
  searchDocuments,
  getDocumentStats,
  updateDocumentStatus,
  processDocument
};